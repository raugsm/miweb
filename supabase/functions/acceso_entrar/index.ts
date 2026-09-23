// acceso_entrar (pública): el login DE LA WEB. La app de escritorio sigue
// hablando directo con Supabase y no pasa por acá.
//
// Por qué existe
// -------------
// La puerta directa de Supabase no se puede cerrar: la app la usa y la clave
// pública la tiene cualquiera. Entonces esta función no impide que alguien
// pruebe contraseñas por afuera. Lo que hace es lo que sí sirve:
//
//   1. cuenta los fallos y, pasado el tope, BLOQUEA LA CUENTA en el origen.
//      Ese bloqueo cierra las dos puertas, porque cae sobre la cuenta y no
//      sobre el camino: ni la web ni la app entran mientras dure.
//   2. deja anotado quién intentó, desde dónde y con qué resultado.
//
// El bloqueo es CORTO a propósito. Si fuera largo, cualquiera podría dejar sin
// trabajar a un técnico tecleando mal su correo unas cuantas veces.
//
// POST { correo, clave }
//   200 { sesion: { access_token, refresh_token, expires_in } }
//   401 { error: "credenciales" }        datos que no coinciden
//   429 { error: "bloqueo_temporal", minutos }

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { admin, anon, CORS, esCorreo, resp } from "../_shared/seguridad.ts";

const VENTANA_MIN = 15;     // ventana en la que se cuentan los fallos
const TOPE_CORREO = 6;      // fallos con el mismo correo antes de bloquear
const TOPE_IP = 15;         // fallos desde la misma conexión
const BLOQUEO_MIN = 15;     // cuánto dura el bloqueo de la cuenta

function ipDe(req: Request): string | null {
  const primera = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  if (!primera) return null;
  const v4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(primera);
  const v6 = primera.includes(":") && /^[0-9a-fA-F:.]+$/.test(primera);
  return v4 || v6 ? primera : null;
}

// deno-lint-ignore no-explicit-any
async function anotar(db: any, correo: string, ip: string | null, exito: boolean, tipo: string) {
  try {
    await db.schema("seguridad").from("intento_acceso")
      .insert({ correo, exito, tipo_evento: tipo, ip_origen: ip });
  } catch (_e) { /* el registro nunca puede impedir entrar */ }
}

/**
 * Fallos que cuentan para el bloqueo.
 *
 * Se miran los últimos VENTANA_MIN minutos, pero SI HUBO UNA ENTRADA BUENA en
 * el medio, se cuenta desde ahí. Sin eso, el técnico que se equivocó seis
 * veces, entró bien y más tarde se vuelve a equivocar, quedaría bloqueado por
 * fallos que ya habían quedado saldados.
 */
// deno-lint-ignore no-explicit-any
async function fallos(db: any, campo: string, valor: string): Promise<number> {
  let desde = new Date(Date.now() - VENTANA_MIN * 60_000).toISOString();

  if (campo === "correo") {
    const { data: ultimoOk } = await db.schema("seguridad")
      .from("intento_acceso").select("fecha_registro")
      .eq("correo", valor).eq("exito", true)
      .gte("fecha_registro", desde)
      .order("fecha_registro", { ascending: false }).limit(1).maybeSingle();
    const marca = (ultimoOk as { fecha_registro: string } | null)?.fecha_registro;
    if (marca && marca > desde) desde = marca;
  }

  const { count } = await db.schema("seguridad")
    .from("intento_acceso").select("codigo", { count: "exact", head: true })
    .eq(campo, valor).eq("exito", false).gte("fecha_registro", desde);
  return count ?? 0;
}

/**
 * Bloquea la cuenta en Supabase por BLOQUEO_MIN minutos. Es el único freno
 * que también alcanza a quien prueba contraseñas por fuera de esta función.
 */
// deno-lint-ignore no-explicit-any
async function bloquear(db: any, correo: string) {
  try {
    const { data } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const u = data?.users?.find((x: { email?: string }) =>
      (x.email ?? "").toLowerCase() === correo);
    if (u) await db.auth.admin.updateUserById(u.id, { ban_duration: `${BLOQUEO_MIN}m` });
  } catch (e) {
    console.error("bloquear", String((e as Error)?.message ?? e));
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const b = await req.json().catch(() => ({}));
    const correo = String((b as { correo?: string }).correo ?? "").trim().toLowerCase();
    const clave = String((b as { clave?: string }).clave ?? "");

    if (!esCorreo(correo) || !clave) return resp(400, { error: "datos_incompletos" });

    const db = admin();
    const ip = ipDe(req);

    // 1. ¿Ya se pasó del tope? Se frena antes de probar la contraseña, así
    //    cada intento extra no le dice nada al que está probando.
    const [porCorreo, porIp] = await Promise.all([
      fallos(db, "correo", correo),
      ip ? fallos(db, "ip_origen", ip) : Promise.resolve(0),
    ]);
    if (porCorreo >= TOPE_CORREO || porIp >= TOPE_IP) {
      await anotar(db, correo, ip, false, "bloqueo_ritmo");
      if (porCorreo >= TOPE_CORREO) await bloquear(db, correo);
      return resp(429, { error: "bloqueo_temporal", minutos: BLOQUEO_MIN });
    }

    // 2. La contraseña la comprueba Supabase, no nosotros: nunca la guardamos
    //    ni la vemos escrita en ningún lado.
    const { data, error } = await anon().auth.signInWithPassword({
      email: correo, password: clave,
    });

    if (error || !data.session) {
      await anotar(db, correo, ip, false, "acceso_fallo");
      // Si ESTE fallo fue el que llegó al tope, se bloquea ya.
      if (porCorreo + 1 >= TOPE_CORREO) await bloquear(db, correo);
      // Respuesta igual para "no existe" y "clave equivocada": desde afuera
      // no se puede averiguar qué correos tienen cuenta.
      return resp(401, { error: "credenciales" });
    }

    await anotar(db, correo, ip, true, "acceso_ok");
    return resp(200, {
      sesion: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_in: data.session.expires_in,
      },
    });
  } catch (e) {
    console.error("acceso_entrar", String((e as Error)?.message ?? e));
    return resp(500, { error: "fallo_interno" });
  }
});
