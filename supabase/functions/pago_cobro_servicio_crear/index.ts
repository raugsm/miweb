// pago_cobro_servicio_crear (autenticada): el cliente pide PAGAR UN SERVICIO con Binance Pay.
// Crea el cobro (monto exacto + codigo) y devuelve lo que hay que mostrar. La confirmacion es
// automatica: la hace el vigia (pago_conciliar) cuando ve el pago.
// Multi-servicio: acepta `servicio` (slug), `referencia_externa` (id externo, ej. lote_id/pedido_ref)
// e `idempotency_key` (reintento -> devuelve el cobro existente).
//
// POST { monto, servicio?, referencia_externa?, idempotency_key?, motivo? } + JWT
//   -> 200 { cobro_id, codigo, monto, producto:"servicio", servicio, referencia_externa, idempotente, vence_en, destino, pago_url }

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { admin, CORS, exigirSesion, resp } from "./seguridad.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const s = await exigirSesion(req);
    const b = await req.json().catch(() => ({}));
    const montoTxt = typeof (b as { monto?: unknown }).monto === "string"
      ? ((b as { monto: string }).monto).trim()
      : String((b as { monto?: number }).monto ?? "");
    if (!/^\d{1,4}(\.\d{1,2})?$/.test(montoTxt)) return resp(400, { error: "monto_invalido" });
    const monto = Number(montoTxt);
    if (!(monto > 0 && monto <= 5000)) return resp(400, { error: "monto_invalido" });
    const motivo = String((b as { motivo?: string }).motivo ?? "").slice(0, 160);

    // Multi-servicio: slug de servicio (default 'servicio'), referencia externa e idempotency key.
    const servRaw = String((b as { servicio?: string }).servicio ?? "").trim().toLowerCase();
    const servicio = /^[a-z0-9_-]{1,32}$/.test(servRaw) ? servRaw : "servicio";
    const referencia = (String((b as { referencia_externa?: string }).referencia_externa ?? "").trim().slice(0, 128)) || null;
    const idem = (String((b as { idempotency_key?: string }).idempotency_key ?? "").trim().slice(0, 128)) || null;

    const db = admin();
    const { data, error } = await db.schema("pago").rpc("cobro_crear_servicio", {
      p_usuario: s.usuario,
      p_monto_usd: montoTxt,
      p_motivo: motivo,
      p_servicio: servicio,
      p_referencia_externa: referencia,
      p_idempotency_key: idem,
    });
    if (error || !data) {
      console.error("cobro_crear_servicio", JSON.stringify(error));
      return resp(500, { error: "cobro_fallido" });
    }
    const d = data as {
      cobro_id: string; codigo_formato: string; monto_texto: string; vence_en: string;
      servicio?: string; referencia_externa?: string | null; idempotente?: boolean;
    };

    // Destino/URL de Binance Pay de Ariad (config por datos, editable por el dueno).
    let destino = "";
    let pago_url = "";
    try {
      const { data: params } = await db.schema("negocio")
        .from("parametro").select("clave,valor")
        .in("clave", ["binance_pay_id", "binance_pay_url"]);
      for (const p of (params ?? []) as { clave: string; valor: string }[]) {
        if (p.clave === "binance_pay_id") destino = p.valor ?? "";
        if (p.clave === "binance_pay_url") pago_url = p.valor ?? "";
      }
    } catch { /* sin parametros: el front muestra los pasos manuales */ }

    return resp(200, {
      cobro_id: d.cobro_id,
      codigo: d.codigo_formato,
      monto: d.monto_texto,
      producto: "servicio",
      servicio: d.servicio ?? servicio,
      referencia_externa: d.referencia_externa ?? referencia,
      idempotente: d.idempotente ?? false,
      vence_en: d.vence_en,
      destino,
      pago_url,
    });
  } catch (e) {
    const m = (e as Error).message;
    if (m === "sin_sesion" || m === "sesion_invalida") return resp(401, { error: m });
    if (m === "rechazo_autorizacion") return resp(403, { error: m });
    console.error("pago_cobro_servicio_crear", m);
    return resp(500, { error: "fallo_interno" });
  }
});
