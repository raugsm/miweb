// recarga_webhook (pública, verify_jwt=false): MixPay avisa acá cuando hay un
// pago. El aviso NO viene firmado y, a propósito, NO trae el resultado del
// pago. Por eso NUNCA se confía en el body: se re-consulta a MixPay
// (payments_result) del lado del servidor y solo si dice "success" —y coinciden
// el destinatario, la moneda y el monto— se acreditan los créditos UNA vez.
//
// MixPay POST { orderId, traceId, payeeId }  →  responder 200 { code: "SUCCESS" }
// Cualquier respuesta distinta de SUCCESS hace que MixPay reintente (hasta 10).
//
// Config (secrets):
//   MIXPAY_PAYEE_ID        payeeId propio (tiene que coincidir con el del pago)
//   MIXPAY_QUOTE_ASSET_ID  moneda de cotización esperada (por defecto "usd")

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { admin, CORS, resp } from "../_shared/seguridad.ts";

const MIXPAY_RESULT = "https://api.mixpay.me/v1/payments_result";

// Respuestas que entiende MixPay: SUCCESS = no reintentar; cualquier otra = reintenta.
const OK = { code: "SUCCESS" };
const REINTENTAR = { code: "FAIL" };

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const body = await req.json().catch(() => null);
    const orderId = String((body as { orderId?: string } | null)?.orderId ?? "");
    if (!orderId) return resp(400, { error: "sin_orden" });

    const db = admin();
    const { data: rec } = await db.schema("negocio").from("recarga")
      .select("codigo,usuario_ref,creditos,monto_usd,estado")
      .eq("codigo", orderId).maybeSingle();
    // Si no existe o ya está pagada: SUCCESS para que MixPay no reintente.
    if (!rec) return resp(200, OK);
    const r = rec as {
      codigo: string; usuario_ref: string; creditos: number;
      monto_usd: number; estado: string;
    };
    if (r.estado === "pagado") return resp(200, OK);

    const payee = Deno.env.get("MIXPAY_PAYEE_ID");
    if (!payee) { console.error("mixpay_no_configurado"); return resp(200, REINTENTAR); }
    const quote = Deno.env.get("MIXPAY_QUOTE_ASSET_ID") ?? "usd";

    // Fuente de verdad: preguntarle a MixPay el estado real del pago.
    const q = new URLSearchParams({ orderId, payeeId: payee });
    const cg = await fetch(`${MIXPAY_RESULT}?${q}`, { headers: { Accept: "application/json" } });
    if (!cg.ok) { console.error("mixpay_result", cg.status); return resp(200, REINTENTAR); }
    const j = await cg.json() as {
      success?: boolean;
      data?: { status?: string; payeeId?: string; quoteAmount?: string; quoteAssetId?: string };
    };
    const d = j?.data;
    if (!j?.success || !d) return resp(200, REINTENTAR);

    // Solo estados terminales acreditan.
    if (d.status !== "success") {
      if (d.status === "failed") {
        await db.schema("negocio").from("recarga")
          .update({ estado: "fallido" }).eq("codigo", r.codigo).eq("estado", "pendiente");
        return resp(200, OK); // un pago fallido no se reintenta
      }
      return resp(200, REINTENTAR); // estado intermedio: que MixPay reintente
    }

    // Chequeos de seguridad: destinatario, moneda y monto correctos.
    if (d.payeeId !== payee) { console.error("payee_no_coincide"); return resp(200, REINTENTAR); }
    if (d.quoteAssetId && d.quoteAssetId !== quote) { console.error("quote_no_coincide"); return resp(200, REINTENTAR); }
    const esperado = Number(r.monto_usd);
    const pagado = Number(d.quoteAmount ?? "0");
    if (!(Math.abs(pagado - esperado) < 0.001)) {
      console.error("monto_no_coincide", pagado, esperado);
      return resp(200, REINTENTAR);
    }

    // Reclamar la fila: solo pasa de pendiente → pagado una vez.
    const { data: marca } = await db.schema("negocio").from("recarga")
      .update({ estado: "pagado", pagado_en: new Date().toISOString() })
      .eq("codigo", r.codigo).eq("estado", "pendiente").select("codigo");
    if (!marca || (marca as unknown[]).length === 0) return resp(200, OK); // otro webhook la tomó

    // Sumar los créditos. Si falla, se devuelve la fila a pendiente para reintentar.
    const { error: eCred } = await db.schema("negocio").rpc("credito_mover", {
      p_usuario: r.usuario_ref, p_delta: r.creditos, p_tipo: "recarga",
      p_motivo: "Recarga MixPay", p_referencia: r.codigo, p_actor: null,
    });
    if (eCred) {
      console.error("credito_mover_fallo", JSON.stringify(eCred));
      await db.schema("negocio").from("recarga")
        .update({ estado: "pendiente", pagado_en: null }).eq("codigo", r.codigo);
      return resp(200, REINTENTAR); // que MixPay reintente
    }
    return resp(200, OK);
  } catch (e) {
    console.error("recarga_webhook", (e as Error).message);
    return resp(200, REINTENTAR); // error transitorio: que MixPay reintente
  }
});
