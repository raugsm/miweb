// izipay_crear (autenticada): el tecnico logueado pide RECARGAR creditos O comprar la
// LICENCIA anual, pagando con IZIPAY (Yape / tarjeta) en SOLES. Crea la recarga
// pendiente y pide a Izipay (sandbox) el Session Token para el checkout. El
// credito/licencia NO se otorga aca: lo hace izipay_webhook cuando Izipay confirma
// el pago por IPN firmado. Producto A = "web-core" (soporta YAPE_CODE nativo).
//
// POST { producto?: 'credito'|'licencia', creditos?: number } + JWT del tecnico
//   -> 200 { token, merchantCode, transactionId, orderNumber, amount, currency,
//            keyRSA, producto, creditos, monto_pen, pay_method }
//
// Secretos (env / Vault):
//   IZIPAY_MERCHANT_CODE   codigo de comercio
//   IZIPAY_API_KEY         clave de API del "nuevo boton de pagos" (auth de Token/Generate)
//   IZIPAY_RSA_KEY         clave publica RSA (va al frontend; no es secreta)
//   IZIPAY_TOKEN_URL       (opcional) override del endpoint; por defecto SANDBOX

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { admin, CORS, exigirSesion, resp } from "./seguridad.ts";

// SANDBOX por defecto. Para produccion: https://api-pw.izipay.pe/security/v1/Token/Generate
const TOKEN_URL = Deno.env.get("IZIPAY_TOKEN_URL")
  ?? "https://sandbox-api-pw.izipay.pe/security/v1/Token/Generate";

// Yape: tope de S/2000 por operacion (limite de la pasarela).
const TOPE_YAPE_PEN = 2000;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const s = await exigirSesion(req); // valida sesion -> usuario_taller
    const b = await req.json().catch(() => ({}));
    const producto = (b as { producto?: string }).producto === "licencia" ? "licencia" : "credito";
    let creditos = 0;
    if (producto === "credito") {
      creditos = Math.trunc(Number((b as { creditos?: number }).creditos ?? 0));
      if (!(creditos >= 1 && creditos <= 5000)) return resp(400, { error: "creditos_invalido" });
    }

    const db = admin();

    // Precios en soles + interruptor, desde parametros (ajustables sin tocar codigo).
    const { data: params } = await db.schema("negocio").from("parametro")
      .select("clave,valor")
      .in("clave", ["izipay_precio_credito_pen", "izipay_precio_licencia_pen", "izipay_activo"]);
    const P: Record<string, string> = {};
    for (const p of (params ?? []) as { clave: string; valor: string }[]) P[p.clave] = p.valor;
    if ((P["izipay_activo"] ?? "false") !== "true") return resp(503, { error: "izipay_inactivo" });

    const precioCred = Number(P["izipay_precio_credito_pen"] ?? "0");
    const precioLic = Number(P["izipay_precio_licencia_pen"] ?? "0");
    const montoPen = producto === "licencia" ? precioLic : precioCred * creditos;
    if (!(montoPen > 0)) return resp(500, { error: "precio_no_configurado" });
    if (montoPen > TOPE_YAPE_PEN) return resp(400, { error: "monto_excede_yape" });
    const montoUsd = producto === "licencia" ? 45 : creditos; // registro (1 credito = 1 USD; licencia = 45 USD)
    const amountTxt = montoPen.toFixed(2); // web-core: amount es STRING "N.00" (no centimos)

    const merchant = Deno.env.get("IZIPAY_MERCHANT_CODE");
    const apiKey = Deno.env.get("IZIPAY_API_KEY");
    const keyRSA = Deno.env.get("IZIPAY_RSA_KEY") ?? "";
    if (!merchant || !apiKey) return resp(500, { error: "izipay_no_configurado" });

    // Fila de recarga pendiente. Su `codigo` (uuid) viaja como orderNumber y vuelve
    // en el IPN: asi se sabe a quien acreditar. `token` (NOT NULL) guarda el
    // transactionId. Anti-doble: recarga_acreditar pasa de pendiente->pagado 1 sola vez.
    const transId = crypto.randomUUID().replace(/-/g, ""); // 32 chars (Izipay pide 5-40)
    const { data: rec, error: eRec } = await db.schema("negocio").from("recarga")
      .insert({
        usuario_ref: s.usuario, creditos, monto_usd: montoUsd, monto_pen: montoPen,
        producto, pasarela: "izipay", estado: "pendiente", token: transId,
      }).select("codigo").single();
    if (eRec || !rec) {
      console.error("recarga_insert", JSON.stringify(eRec));
      return resp(500, { error: "recarga_fallida" });
    }
    const orderNumber = (rec as { codigo: string }).codigo;

    // Session Token de Izipay (backend). NOTA: el esquema exacto del body/headers de
    // Token/Generate NO esta publicado en swagger; esta es la forma documentada y se
    // ajusta al probar con credenciales sandbox (ver TODO).
    const izBody = {
      requestSource: "ECOMMERCE",
      merchantCode: merchant,
      orderNumber,
      publicKey: keyRSA,
      amount: amountTxt,
    };
    const r = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "transactionId": transId, // correlation id de toda la transaccion
        "Authorization": apiKey,  // TODO: confirmar formato del header de auth al probar
      },
      body: JSON.stringify(izBody),
    });
    const jt = await r.json().catch(() => ({}));
    const token = (jt as { response?: { token?: string } })?.response?.token
      ?? (jt as { token?: string })?.token;
    if (!r.ok || !token) {
      console.error("izipay_token", r.status, JSON.stringify(jt));
      // La recarga queda 'pendiente' y nunca se acredita sin IPN: no hay riesgo.
      return resp(502, { error: "izipay_error" });
    }

    return resp(200, {
      token,                 // JWT de sesion -> LoadForm({ authorization })
      merchantCode: merchant,
      transactionId: transId,
      orderNumber,
      amount: amountTxt,
      currency: "PEN",
      keyRSA,                // clave publica RSA -> LoadForm({ keyRSA })
      producto,
      creditos,
      monto_pen: montoPen,
      pay_method: "YAPE_CODE",
    });
  } catch (e) {
    const m = (e as Error).message;
    if (m === "sin_sesion" || m === "sesion_invalida") return resp(401, { error: m });
    if (m === "rechazo_autorizacion") return resp(403, { error: m });
    console.error("izipay_crear", m);
    return resp(500, { error: "fallo_interno" });
  }
});
