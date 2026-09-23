// recarga_crear (autenticada): el técnico pide recargar créditos. Crea una
// orden de pago en CoinGate y devuelve el enlace del checkout (donde puede
// pagar con Binance Pay o cripto). El crédito NO se suma acá: se suma cuando
// CoinGate confirma el pago, en recarga_webhook.
//
// POST { creditos } + JWT del técnico  →  200 { url }
//
// Secretos que usa:
//   COINGATE_TOKEN  token de API de CoinGate (sandbox o producción)
//   COINGATE_ENV    "production" para el entorno real; cualquier otra cosa = sandbox

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { admin, CORS, llamante, resp } from "../_shared/seguridad.ts";

// Paquetes permitidos. Modelo: 1 crédito = 1 USD (5 créditos = 5 USD = 1 proceso).
const PAQUETES = [5, 10, 20, 50, 100];

const SITIO = "https://ariadgsm.com";

function baseCoinGate(): string {
  return Deno.env.get("COINGATE_ENV") === "production"
    ? "https://api.coingate.com/api/v2"
    : "https://api-sandbox.coingate.com/api/v2";
}

/** Token aleatorio por orden: CoinGate lo devuelve en el webhook y así se valida. */
function tokenAleatorio(): string {
  const b = new Uint8Array(24);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

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

    const clave = Deno.env.get("COINGATE_TOKEN");
    if (!clave) return resp(500, { error: "coingate_no_configurado" });

    const token = tokenAleatorio();

    // Fila de recarga pendiente. `codigo` viaja como order_id a CoinGate y
    // vuelve en el webhook: así se sabe a quién acreditar, y sirve de anti-doble.
    const { data: rec, error: eRec } = await db.schema("negocio")
      .from("recarga").insert({
        usuario_ref: usuario, creditos, monto_usd: montoUsd, token, estado: "pendiente",
      }).select("codigo").single();
    if (eRec || !rec) {
      console.error("recarga_insert", JSON.stringify(eRec));
      return resp(500, { error: "recarga_fallida" });
    }
    const codigo = (rec as { codigo: string }).codigo;

    const cuerpo = new URLSearchParams({
      price_amount: montoUsd.toFixed(2),
      price_currency: "USD",
      receive_currency: "USDC", // liquidación estable en USD (CoinGate no da USDT)
      title: `Recarga ${creditos} creditos - Ari-Tool`,
      description: `Recarga de ${creditos} creditos para ${correo}`,
      order_id: codigo,
      token,
      callback_url: `${Deno.env.get("ARIAD_URL") ?? ""}/functions/v1/recarga_webhook`,
      success_url: `${SITIO}/panel?recarga=ok`,
      cancel_url: `${SITIO}/panel?recarga=cancel`,
    });

    const r = await fetch(`${baseCoinGate()}/orders`, {
      method: "POST",
      headers: {
        Authorization: `Token ${clave}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: cuerpo,
    });
    if (!r.ok) {
      console.error("coingate_crear", r.status, await r.text());
      return resp(502, { error: "coingate_error" });
    }
    const orden = await r.json() as { id: number; payment_url: string };
    await db.schema("negocio").from("recarga")
      .update({ coingate_order_id: String(orden.id) }).eq("codigo", codigo);

    return resp(200, { url: orden.payment_url });
  } catch (e) {
    const m = (e as Error).message;
    if (m === "sin_sesion" || m === "sesion_invalida") return resp(401, { error: m });
    console.error("recarga_crear", m);
    return resp(500, { error: "fallo_interno" });
  }
});
