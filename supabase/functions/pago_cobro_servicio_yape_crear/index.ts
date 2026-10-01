// pago_cobro_servicio_yape_crear (autenticada): el cliente pide PAGAR UN SERVICIO por Yape (SOLO PERÚ).
// Crea el cobro en SOLES (método yape) y devuelve el destino Yape + monto. La confirmación NO es
// automática por nota como Binance: el técnico PAGA por Yape y luego DECLARA su código de seguridad
// de 3 díg en `yape_confirmar` → se auto-casa 1:1 contra lo que leyó el lector (sin comprobante/foto).
// Multi-servicio: acepta `servicio` (slug), `referencia_externa` e `idempotency_key` (reintento).
// Gating país=='PE' + yape_activo lo hace la función SQL (cobro_crear_servicio_yape).
//
// POST { monto, servicio?, referencia_externa?, idempotency_key?, motivo? } + JWT
//   -> 200 { cobro_id, codigo, monto, moneda:"PEN", producto:"servicio", servicio, referencia_externa,
//            idempotente, vence_en, destino }

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
    if (!/^\d{1,5}(\.\d{1,2})?$/.test(montoTxt)) return resp(400, { error: "monto_invalido" });
    const monto = Number(montoTxt);
    if (!(monto > 0 && monto <= 20000)) return resp(400, { error: "monto_invalido" });
    const motivo = String((b as { motivo?: string }).motivo ?? "").slice(0, 160);

    const servRaw = String((b as { servicio?: string }).servicio ?? "").trim().toLowerCase();
    const servicio = /^[a-z0-9_-]{1,32}$/.test(servRaw) ? servRaw : "servicio";
    const referencia = (String((b as { referencia_externa?: string }).referencia_externa ?? "").trim().slice(0, 128)) || null;
    const idem = (String((b as { idempotency_key?: string }).idempotency_key ?? "").trim().slice(0, 128)) || null;

    const db = admin();
    const { data, error } = await db.schema("pago").rpc("cobro_crear_servicio_yape", {
      p_usuario: s.usuario,
      p_monto_pen: montoTxt,
      p_servicio: servicio,
      p_referencia_externa: referencia,
      p_idempotency_key: idem,
      p_motivo: motivo,
    });
    if (error) {
      const m = (error as { message?: string }).message ?? "";
      if (/pais_no_habilitado/.test(m)) return resp(403, { error: "pais_no_habilitado" });
      if (/yape_inactivo/.test(m))      return resp(200, { ok: false, motivo: "yape_inactivo" });
      if (/monto_invalido/.test(m))     return resp(400, { error: "monto_invalido" });
      if (/usuario_(desconocido|requerido)/.test(m)) return resp(400, { error: "usuario_invalido" });
      console.error("cobro_crear_servicio_yape", JSON.stringify(error));
      return resp(500, { error: "cobro_fallido" });
    }
    if (!data) return resp(500, { error: "cobro_fallido" });
    const d = data as {
      cobro_id: string; codigo_formato: string; monto_texto: string; vence_en: string;
      servicio?: string; referencia_externa?: string | null; idempotente?: boolean;
    };

    // Destino Yape de Ariad (número/nombre a mostrar), configurable por el dueño.
    let destino = "";
    try {
      const { data: p } = await db.schema("negocio")
        .from("parametro").select("valor").eq("clave", "yape_destino").maybeSingle();
      destino = (p as { valor?: string } | null)?.valor ?? "";
    } catch { /* sin parámetro: el front muestra los pasos manuales */ }

    return resp(200, {
      cobro_id: d.cobro_id,
      codigo: d.codigo_formato,
      monto: d.monto_texto,
      moneda: "PEN",
      producto: "servicio",
      servicio: d.servicio ?? servicio,
      referencia_externa: d.referencia_externa ?? referencia,
      idempotente: d.idempotente ?? false,
      vence_en: d.vence_en,
      destino,
    });
  } catch (e) {
    const m = (e as Error).message;
    if (m === "sin_sesion" || m === "sesion_invalida") return resp(401, { error: m });
    if (m === "rechazo_autorizacion") return resp(403, { error: m });
    console.error("pago_cobro_servicio_yape_crear", m);
    return resp(500, { error: "fallo_interno" });
  }
});
