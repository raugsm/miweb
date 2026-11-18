// proveedor_consultar (Ari-Web, 18-nov-2026, EN LOCAL, sin OK de Peter todavía): Alquiler con proveedor, SOLO LECTURA.
// Trae del proveedor (sistema «GSM Theme», hoy PKGSMHUB) el catálogo y el saldo, y deja la copia en sop_proveedor.* (tablas y
// RPCs de Ari-Master, contrato-master-web.md) para que el panel la muestre (V3 catálogo, V5 saldo).
// Historias 048 (llave como secreto), 049 (catálogo cada hora) y 050 (si no responde, queda la última copia y se anota el fallo).
// - Solo llama a accountinfo e imeiservicelist (gsm_theme.PERMITIDAS). Nunca a placeimeiorder ni placebulkorder.
// - Quién llama: el cron (header x-vigia-clave = vault, igual que frp_salud) o el panel («Ya recargué») con un JWT que pase
//   sop_proveedor.puede_gestionar() (config.gestion o sop_proveedor.gestion: la misma compuerta de V3/V5).
// - El freno (catálogo 5 min, saldo 1 min) vive en SQL (consulta_reservar), así el cron y el botón no chocan.
// - Usuario y llave: secretos PROV_PKGSMHUB_USUARIO / PROV_PKGSMHUB_LLAVE. Nunca se devuelven, ni se guardan, ni se registran.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { admin, CORS, resp } from "./_shared/seguridad.ts";
import { errorDe, formulario, opcionesDe, saldoDe, tapar } from "./_shared/gsm_theme.ts";

const PROVEEDORES: Record<string, { url: string; usuario: string; llave: string }> = {
  pkgsmhub: { url: "https://pkgsmhub.com/public/api/index.php", usuario: "PROV_PKGSMHUB_USUARIO", llave: "PROV_PKGSMHUB_LLAVE" },
};
const QUE: Record<string, "imeiservicelist" | "accountinfo"> = { catalogo: "imeiservicelist", saldo: "accountinfo" };

// El panel pasa si su sesión tiene la capacidad de gestionar proveedores (se pregunta con SU JWT, no con el de servicio).
async function puedeGestionar(req: Request): Promise<boolean> {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const url = Deno.env.get("ARIAD_URL"), anon = Deno.env.get("ARIAD_ANON_KEY");
  if (!token || !url || !anon) return false;
  const c = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data, error } = await c.schema("sop_proveedor").rpc("puede_gestionar");
  return !error && data === true;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: { ...CORS, "Access-Control-Allow-Headers": CORS["Access-Control-Allow-Headers"] + ", x-vigia-clave" } });
  if (req.method !== "POST") return resp(405, { error: "metodo" });
  try {
    const db = admin();

    const dada = req.headers.get("x-vigia-clave");
    if (dada) {
      const { data: clave } = await db.schema("frp").rpc("salud_clave");
      if (!clave || dada !== String(clave)) return resp(401, { error: "no_autorizado" });
    } else if (!(await puedeGestionar(req))) {
      return resp(401, { error: "no_autorizado" });
    }

    const body = await req.json().catch(() => ({})) as { proveedor?: unknown; que?: unknown };
    const proveedor = String(body.proveedor ?? "pkgsmhub").trim().toLowerCase();
    const conf = PROVEEDORES[proveedor];
    if (!conf) return resp(400, { error: "proveedor_desconocido" });
    const accion = QUE[String(body.que ?? "catalogo")];
    if (!accion) return resp(400, { error: "que_invalido" });

    const sp = db.schema("sop_proveedor");
    // Reserva el turno antes de salir a la red.
    const { data: turno, error: eTurno } = await sp.rpc("consulta_reservar", { p_proveedor: proveedor, p_accion: accion });
    if (eTurno) throw new Error("reservar: " + eTurno.message);
    const t = turno as { ok: boolean; motivo?: string; espera_s?: number };
    if (!t.ok) return resp(200, { ok: false, motivo: t.motivo ?? "muy_pronto", espera_s: t.espera_s ?? null });

    const usuario = Deno.env.get(conf.usuario) ?? "";
    const llave = Deno.env.get(conf.llave) ?? "";
    let cuerpo: unknown = null;
    let fallo: string | null = null;
    if (!usuario || !llave) fallo = "falta_llave";
    else {
      try {
        const r = await fetch(conf.url, { method: "POST", body: formulario(usuario, llave, accion), signal: AbortSignal.timeout(40_000) });
        const crudo = await r.text();
        try { cuerpo = JSON.parse(crudo); } catch { fallo = `respuesta_no_json_http_${r.status}`; }
        if (!fallo) fallo = errorDe(cuerpo);
      } catch (e) {
        fallo = (e as Error)?.name === "TimeoutError" ? "sin_respuesta" : "sin_conexion";
      }
    }

    const saldo = fallo ? null : saldoDe(cuerpo);
    let opciones = fallo || accion !== "imeiservicelist" ? null : opcionesDe(cuerpo);
    // Un catálogo vacío no pisa la copia buena: cuenta como fallo y queda la última copia (historia 050).
    if (opciones && opciones.length === 0) { fallo = "catalogo_vacio"; opciones = null; }
    if (fallo) fallo = tapar(fallo, llave);

    if (accion === "imeiservicelist") {
      const { error } = await sp.rpc("catalogo_sincronizar", { p_proveedor: proveedor, p_opciones: opciones, p_ok: !fallo, p_error: fallo });
      if (error) throw new Error("catalogo: " + error.message);
    }
    // El catálogo trae el saldo adentro: se registra igual. Un fallo de saldo solo se anota cuando se pidió el saldo.
    const saldoOk = !fallo && saldo !== null && saldo.monto !== null;
    if (saldoOk || accion === "accountinfo") {
      const { error } = await sp.rpc("saldo_registrar", {
        p_proveedor: proveedor, p_saldo: saldoOk ? saldo!.monto : null, p_moneda: saldo?.moneda?.toLowerCase() ?? null, p_ok: saldoOk,
        p_cruda: saldoOk ? saldo!.cruda : { error: fallo ?? "saldo_ilegible" },
      });
      if (error) throw new Error("saldo: " + error.message);
    }

    // Salud del proveedor para la compra (cortacorriente, p13 #1): se informa cada resultado. Si la compra todavía no está
    // aplicada en la base, la función no existe y no pasa nada.
    try {
      const tipo = !fallo ? null : fallo === "sin_respuesta" || fallo === "sin_conexion" ? fallo
        : /authentication failed/i.test(fallo) || fallo === "falta_llave" ? "llave" : "respuesta_rara";
      if (fallo !== "catalogo_vacio") await sp.rpc("conector_resultado", { p_proveedor: proveedor, p_ok: !fallo, p_tipo: tipo });
    } catch { /* best effort */ }

    return resp(200, {
      ok: !fallo, motivo: fallo, proveedor, saldo: saldo?.texto ?? null, opciones: opciones?.length ?? null,
      remotas: opciones?.filter((o) => o.tipo === "REMOTE").length ?? null,
    });
  } catch (e) {
    console.error("proveedor_consultar", String((e as Error)?.message ?? e).slice(0, 200));
    return resp(500, { error: "fallo_interno" });
  }
});
