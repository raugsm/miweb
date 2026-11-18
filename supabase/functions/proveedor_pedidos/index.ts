// proveedor_pedidos (Ari-Web, 18-nov-2026, EN LOCAL, sin OK de Peter): COMPRA al proveedor de alquiler (W2 pedir, W3 seguir,
// W4 alertas, W5 retomar). Reglas de plata en SQL (20261118-proveedor-compra.sql); el ciclo en ./_shared/ciclo.ts.
// - Cron cada 30 s (header x-vigia-clave = vault, como frp_salud): una vuelta completa.
// - Panel con el JWT del usuario: {"accion":"enviar","pedido":id} (S2, compuerta puede_operar) y
//   {"accion":"telegram_probar"} (V7, compuerta puede_gestionar).
// - El interruptor del respaldo sale APAGADO: sin él, el automático no crea pedidos (solo los de Soporte).
// - Un pedido se manda UNA vez. Lo que no se sabe queda «en duda» y no se reintenta nunca.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { admin, CORS, resp } from "./_shared/seguridad.ts";
import { enviarUno, type Rpc, vuelta } from "./_shared/ciclo.ts";
import { apiGsm } from "./_shared/api_gsm.ts";
import { armarAvisos, vincular } from "./_shared/telegram.ts";

const PROVEEDOR = "pkgsmhub";
const URL_API = "https://pkgsmhub.com/public/api/index.php";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function compuerta(req: Request, fn: "puede_operar" | "puede_gestionar"): Promise<boolean> {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const url = Deno.env.get("ARIAD_URL"), anon = Deno.env.get("ARIAD_ANON_KEY");
  if (!token || !url || !anon) return false;
  const c = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data, error } = await c.schema("sop_proveedor").rpc(fn);
  return !error && data === true;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: { ...CORS, "Access-Control-Allow-Headers": CORS["Access-Control-Allow-Headers"] + ", x-vigia-clave" } });
  if (req.method !== "POST") return resp(405, { error: "metodo" });
  try {
    const db = admin();
    const sp = db.schema("sop_proveedor");
    const rpc: Rpc = async (fn, args = {}) => { const { data, error } = await sp.rpc(fn, args); return { data, error: error ? { message: error.message } : null }; };
    const env = (k: string) => Deno.env.get(k);
    const api = apiGsm(URL_API, env("PROV_PKGSMHUB_USUARIO") ?? "", env("PROV_PKGSMHUB_LLAVE") ?? "");
    const body = await req.json().catch(() => ({})) as { accion?: unknown; pedido?: unknown };

    const dada = req.headers.get("x-vigia-clave");
    if (dada) {
      const { data: clave } = await db.schema("frp").rpc("salud_clave");
      if (!clave || dada !== String(clave)) return resp(401, { error: "no_autorizado" });
      // Turno: si la vuelta anterior sigue corriendo (cron cada 30 s), esta no arranca.
      const { data: turno } = await rpc("vuelta_tomar", { p_proveedor: PROVEEDOR, p_segundos: 150 });
      if (turno !== true) return resp(200, { ok: true, ocupada: true });
      try {
        const propio = env("PROV_TELEGRAM_TOKEN");
        const telegram = propio ? await vincular(rpc, propio).catch(() => "telegram_fallo") : "sin_bot_propio";
        const out = await vuelta(rpc, api, await armarAvisos(rpc, env), PROVEEDOR);
        return resp(200, { ok: true, telegram, ...out });
      } finally {
        await rpc("vuelta_soltar", { p_proveedor: PROVEEDOR });
      }
    }

    if (body.accion === "enviar") {
      if (!(await compuerta(req, "puede_operar"))) return resp(401, { error: "no_autorizado" });
      const pedido = String(body.pedido ?? "");
      if (!UUID.test(pedido)) return resp(400, { error: "pedido_invalido" });
      const estado = await enviarUno(rpc, api, PROVEEDOR, pedido);
      return resp(200, { ok: true, estado });
    }
    if (body.accion === "telegram_probar") {
      if (!(await compuerta(req, "puede_gestionar"))) return resp(401, { error: "no_autorizado" });
      const avisos = await armarAvisos(rpc, env);
      const ok = avisos ? await avisos.enviar("AriTool · Alquiler: prueba de avisos. Si ves esto, los avisos llegan bien.") : false;
      return resp(200, { ok, motivo: ok ? null : avisos ? "telegram_no_respondio" : "sin_telegram" });
    }
    return resp(400, { error: "accion_invalida" });
  } catch (e) {
    console.error("proveedor_pedidos", String((e as Error)?.message ?? e).slice(0, 200));
    return resp(500, { error: "fallo_interno" });
  }
});
