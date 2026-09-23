// acceso_solicitar (pública): registro SIN aprobación. Crea la cuenta y queda
// pendiente_correo hasta que el técnico valide su correo con el OTP (acceso_confirmar
// la activa). Modelo por créditos: sin licencias ni aprobaciones.
// POST { correo, clave, nombre, pais, telefono? } → 200 { estado: "pendiente" | "ya_existe" }

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { admin, CORS, esCorreo, resp } from "../_shared/seguridad.ts";

// --- Freno por ritmo -------------------------------------------------------
//
// Esta funcion crea cuentas y es publica: sin freno, un robot puede levantar
// miles en un rato y dejar la base y el correo inservibles. Se cuenta cuantas
// veces se intento desde la misma IP y con el mismo correo en la ultima hora.
//
// Los numeros son altos para una persona (nadie abre 6 cuentas por hora desde
// la misma conexion) y bajos para un robot.
const VENTANA_MIN = 60;
const TOPE_POR_IP = 6;
const TOPE_POR_CORREO = 3;


/** La IP real del visitante: Supabase la deja en x-forwarded-for. */
function ipDe(req: Request): string | null {
  const cadena = req.headers.get("x-forwarded-for") ?? "";
  const primera = cadena.split(",")[0].trim();
  // La columna es de tipo inet: si no parece IP, se guarda vacia antes que
  // reventar el insert con basura.
  if (!primera) return null;
  const v4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(primera);
  const v6 = primera.includes(":") && /^[0-9a-fA-F:.]+$/.test(primera);
  return v4 || v6 ? primera : null;
}

// deno-lint-ignore no-explicit-any
async function anotar(db: any, correo: string, ip: string | null, exito: boolean, tipo: string) {
  try {
    await db.schema("seguridad").from("intento_acceso").insert({
      correo, exito, tipo_evento: tipo, ip_origen: ip,
    });
  } catch (_e) { /* el registro no puede tumbar el alta */ }
}

/** true = pasa; false = ya se paso del tope y hay que frenarlo. */
// deno-lint-ignore no-explicit-any
async function hayCupo(db: any, correo: string, ip: string | null): Promise<boolean> {
  const desde = new Date(Date.now() - VENTANA_MIN * 60_000).toISOString();

  const { count: porCorreo } = await db.schema("seguridad")
    .from("intento_acceso").select("codigo", { count: "exact", head: true })
    .eq("correo", correo).gte("fecha_registro", desde);
  if ((porCorreo ?? 0) >= TOPE_POR_CORREO) return false;

  if (ip) {
    const { count: porIp } = await db.schema("seguridad")
      .from("intento_acceso").select("codigo", { count: "exact", head: true })
      .eq("ip_origen", ip).gte("fecha_registro", desde);
    if ((porIp ?? 0) >= TOPE_POR_IP) return false;
  }
  return true;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const b = await req.json();
    const correo = String(b.correo ?? "").trim().toLowerCase();
    const clave = String(b.clave ?? "");
    const nombre = String(b.nombre ?? "").trim();
    const pais = String(b.pais ?? "").trim().toUpperCase();
    const telefono = b.telefono ? String(b.telefono).trim() : null;

    if (!esCorreo(correo)) return resp(400, { error: "correo_invalido" });
    if (clave.length < 8) return resp(400, { error: "clave_corta" });
    if (!nombre) return resp(400, { error: "nombre_requerido" });
    if (!/^[A-Z]{2}$/.test(pais)) return resp(400, { error: "pais_invalido" });

    const db = admin();
    const ip = ipDe(req);

    // Freno por ritmo ANTES de cualquier consulta: un robot no llega ni a
    // averiguar si el correo existe.
    if (!await hayCupo(db, correo, ip)) {
      await anotar(db, correo, ip, false, "bloqueo_ritmo");
      return resp(429, { error: "demasiados_intentos" });
    }

    // Filtro de usuario existente.
    //
    // Antes esto devolvia { estado: "pendiente" } igual que un alta nueva, para
    // no revelar que cuentas existen. El efecto real era peor: la web daba el
    // registro por bueno, mandaba el codigo (que llegaba, porque el usuario SI
    // existe en Auth) y la clave nueva se descartaba en silencio. El tecnico
    // terminaba con una clave que el sistema nunca guardo y no podia entrar.
    //
    // Ahora se responde "ya_existe" y la web lo manda a Entrar. La clave NUNCA
    // se pisa desde aca: si la olvido, entra con un codigo al correo, o el dueño
    // se la resetea desde AriPanel (cuenta_clave_reset).
    const { data: previa } = await db.schema("seguridad")
      .from("cuenta").select("codigo").eq("correo", correo).maybeSingle();
    if (previa) {
      await anotar(db, correo, ip, false, "acceso_fallo");
      return resp(200, { estado: "ya_existe" });
    }

    // Tambien puede existir en Auth sin fila de negocio (alta a medias de un
    // intento anterior). Se trata igual: no se vuelve a crear ni se pisa la clave.
    const { data: lista } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (lista?.users?.some((x) => (x.email ?? "").toLowerCase() === correo)) {
      await anotar(db, correo, ip, false, "acceso_fallo");
      return resp(200, { estado: "ya_existe" });
    }

    // 1. Usuario Auth (Supabase guarda el hash; nunca guardamos la clave).
    const { data: creado, error: e1 } = await db.auth.admin.createUser({
      email: correo, password: clave, email_confirm: true,
    });
    if (e1 || !creado.user) {
      // Aca cae tambien la contrasena floja o filtrada que Supabase rechaza.
      await anotar(db, correo, ip, false, "acceso_fallo");
      return resp(400, { error: "registro_rechazado" });
    }

    // 2. Cuenta en pendiente_correo (se activa al validar el OTP).
    const { data: cuenta, error: e2 } = await db.schema("seguridad")
      .from("cuenta").insert({
        correo, clave_hash: "supabase_auth", estado: "pendiente_correo",
      }).select("codigo").single();
    if (e2 || !cuenta) {
      console.error("cuenta_insert_error", JSON.stringify(e2));
      return resp(500, { error: "registro_fallido" });
    }

    const codigo = (cuenta as { codigo: string }).codigo;
    const { data: usu } = await db.schema("negocio")
      .from("usuario_taller").insert({
        cuenta_ref: codigo, nombre, telefono, pais,
      }).select("codigo").single();
    const usuCod = (usu as { codigo: string }).codigo;

    const { data: rol } = await db.schema("negocio")
      .from("rol").select("codigo").eq("nombre", "tecnico").single();
    await db.schema("negocio").from("usuario_rol").insert({
      usuario_ref: usuCod, rol_ref: (rol as { codigo: string }).codigo,
    });

    // Cuenta de créditos (arranca en 0; se recarga desde el panel).
    try {
      await db.schema("negocio").from("credito_cuenta").insert({ usuario_ref: usuCod, saldo: 0 });
    } catch (_e) { /* credito_mover la crea sola si hace falta */ }

    await anotar(db, correo, ip, true, "acceso_ok");
    return resp(200, { estado: "pendiente" });
  } catch (e) {
    console.error("solicitar_excepcion", String((e as Error)?.message ?? e));
    const m = (e as Error).message;
    if (m === "sin_sesion" || m === "sesion_invalida") return resp(401, { error: m });
    return resp(500, { error: "fallo_interno" });
  }
});
