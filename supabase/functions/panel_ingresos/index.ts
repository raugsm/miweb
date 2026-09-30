// panel_ingresos (solo dueño): seguimiento y control de TODOS los ingresos (Yape + Binance).
// Lee el libro de ingresos y permite resolver revisiones / atribuir pagos no casados.
// POST { accion, ... } + JWT del dueño:
//   { accion: "resumen", dias? }                    → { totales, diario, pendientes, revisiones }
//   { accion: "resolver", revision, cobro, txid }   → resuelve una revisión Yape ambigua (elige el par)
//   { accion: "atribuir", txid, cobro }             → atribuye manualmente un pago no casado a un cobro
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { admin, CORS, exigirDueno, resp } from "./seguridad.ts";

const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    await exigirDueno(req);
    const db = admin();
    const b = await req.json().catch(() => ({}));
    const accion = String(b.accion ?? "resumen");

    if (accion === "resumen") {
      const dias = Math.min(365, Math.max(1, Math.trunc(Number(b.dias ?? 14))));
      const { data, error } = await db.schema("pago").rpc("panel_ingresos_resumen", { p_dias: dias });
      if (error) { console.error("panel_ingresos_resumen", JSON.stringify(error)); return resp(500, { error: "fallo" }); }
      return resp(200, data ?? {});
    }

    if (accion === "resolver") {
      if (!UUID.test(String(b.revision ?? "")) || !UUID.test(String(b.cobro ?? "")) || typeof b.txid !== "string" || !b.txid) {
        return resp(400, { error: "faltan_datos" });
      }
      const { data, error } = await db.schema("pago").rpc("yape_revision_resolver",
        { p_revision: b.revision, p_cobro: b.cobro, p_txid: b.txid });
      if (error) { console.error("resolver", JSON.stringify(error)); return resp(500, { error: "fallo" }); }
      return resp(200, data ?? {});
    }

    if (accion === "atribuir") {
      if (typeof b.txid !== "string" || !b.txid || !UUID.test(String(b.cobro ?? ""))) {
        return resp(400, { error: "faltan_datos" });
      }
      const { data, error } = await db.schema("pago").rpc("panel_ingreso_atribuir",
        { p_txid: b.txid, p_cobro: b.cobro });
      if (error) { console.error("atribuir", JSON.stringify(error)); return resp(500, { error: "fallo" }); }
      return resp(200, data ?? {});
    }

    return resp(400, { error: "accion_desconocida" });
  } catch (e) {
    const m = (e as Error).message;
    if (m === "rechazo_autorizacion" || m === "sin_sesion" || m === "sesion_invalida") {
      return resp(403, { error: "rechazo_autorizacion" });
    }
    console.error("panel_ingresos", m);
    return resp(500, { error: "fallo_interno" });
  }
});
