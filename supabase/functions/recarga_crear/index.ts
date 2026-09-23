// recarga_crear (autenticada): el técnico pide recargar créditos. Crea un
// cobro en MixPay y devuelve la página de pago (QR + código para pagar con
// Binance Pay o USDT). El crédito NO se suma acá: se suma cuando MixPay
// confirma el pago, en recarga_webhook.
//
// POST { creditos } + JWT del técnico  →  200 { url, code }
//   url  = https://mixpay.me/code/<code>  (la página con el QR y Binance Pay)
//   code = código del cobro de MixPay
//
// MixPay no usa clave secreta para cobrar: el destino del dinero es el payeeId.
// Config (secrets, nunca en código):
//   MIXPAY_PAYEE_ID             payeeId de la cuenta MixPay (dónde llega el dinero)
//   MIXPAY_SETTLEMENT_ASSET_ID  en qué recibe Ariad (por defecto USDT TRC-20)
//   MIXPAY_QUOTE_ASSET_ID       en qué se cotiza el precio (por defecto "usd")
//   ARIAD_URL                   base del proyecto (para la URL del webhook)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { admin, CORS, llamante, resp } from "../_shared/seguridad.ts";

// Paquetes permitidos. Modelo: 1 crédito = 1 USD (5 créditos = 5 USD = 1 proceso).
const PAQUETES = [5, 10, 20, 50, 100];

const MIXPAY_CREAR = "https://api.mixpay.me/v1/one_time_payment";
// USDT en TRON (TRC-20): red barata, ideal para pagos chicos. Se puede
// sobreescribir con MIXPAY_SETTLEMENT_ASSET_ID (ej. USDT BEP-20).
const USDT_TRC20 = "b91e18ff-a9ae-3dc7-8679-e935d9a4b34b";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const user = await llamante(req); // valida el JWT o tira
    const correo = (user.email ?? "").toLowerCase();
    const db = admin();

    // Del correo al usuario_taller del técnico.
    const { data: cuenta } = await db.schema("seguridad")
      .from("cuenta").select("codigo").eq("correo", correo).maybeSingle();
    if (!cuenta) return resp(403, { error: "sin_cuenta" });
    const { data: ut } = await db.schema("negocio")
      .from("usuario_taller").select("codigo").eq("cuenta_ref", (cuenta as { codigo: string }).codigo).maybeSingle();
    if (!ut) return resp(403, { error: "sin_usuario" });
    const usuario = (ut as { codigo: string }).codigo;

    const b = await req.json().catch(() => ({}));
    const creditos = Math.trunc(Number((b as { creditos?: number }).creditos ?? 0));
    if (!PAQUETES.includes(creditos)) return resp(400, { error: "paquete_invalido" });
    const montoUsd = creditos; // 1 crédito = 1 USD

    const payee = Deno.env.get("MIXPAY_PAYEE_ID");
    if (!payee) return resp(500, { error: "mixpay_no_configurado" });
    const settlement = Deno.env.get("MIXPAY_SETTLEMENT_ASSET_ID") ?? USDT_TRC20;
    const quote = Deno.env.get("MIXPAY_QUOTE_ASSET_ID") ?? "usd";

    // Fila de recarga pendiente. `codigo` (uuid) viaja como orderId a MixPay y
    // vuelve en el webhook: así se sabe a quién acreditar, y sirve de anti-doble.
    const { data: rec, error: eRec } = await db.schema("negocio")
      .from("recarga").insert({
        usuario_ref: usuario, creditos, monto_usd: montoUsd, estado: "pendiente",
      }).select("codigo").single();
    if (eRec || !rec) {
      console.error("recarga_insert", JSON.stringify(eRec));
      return resp(500, { error: "recarga_fallida" });
    }
    const codigo = (rec as { codigo: string }).codigo;

    const r = await fetch(MIXPAY_CREAR, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        payeeId: payee,
        quoteAssetId: quote,
        quoteAmount: montoUsd.toFixed(2),
        settlementAssetId: settlement,
        orderId: codigo, // uuid: 36 chars, válido como orderId de MixPay
        callbackUrl: `${Deno.env.get("ARIAD_URL") ?? ""}/functions/v1/recarga_webhook`,
        returnTo: "https://ariadgsm.com/cuenta?recarga=ok",
      }),
    });
    if (!r.ok) {
      console.error("mixpay_crear", r.status, await r.text());
      return resp(502, { error: "mixpay_error" });
    }
    const j = await r.json() as {
      success?: boolean; code?: unknown; data?: { code?: string; traceId?: string };
    };
    // El código del cobro viene en data.code; el `code` de nivel superior suele
    // ser un estado numérico, así que solo se acepta si es texto.
    const code = j?.data?.code ?? (typeof j?.code === "string" ? j.code : undefined);
    if (!j?.success || !code) {
      console.error("mixpay_crear_respuesta", JSON.stringify(j));
      return resp(502, { error: "mixpay_error" });
    }
    await db.schema("negocio").from("recarga")
      .update({ mixpay_code: code, mixpay_trace_id: j.data?.traceId ?? null })
      .eq("codigo", codigo);

    return resp(200, { url: `https://mixpay.me/code/${code}`, code });
  } catch (e) {
    const m = (e as Error).message;
    if (m === "sin_sesion" || m === "sesion_invalida") return resp(401, { error: m });
    console.error("recarga_crear", m);
    return resp(500, { error: "fallo_interno" });
  }
});
