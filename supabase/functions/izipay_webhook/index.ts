// izipay_webhook (publica, verify_jwt=false): Izipay avisa aca (IPN server-to-server)
// cuando un pago cambia de estado. NUNCA se confia en el navegador: solo este aviso,
// y SOLO si su FIRMA es valida, acredita. La firma web-core es:
//     signature = Base64( HMAC-SHA256( payloadHttp , CLAVE_HASH ) )
// Si la firma valida y el pago es aprobado (code "00"), se acredita EXACTLY-ONCE via
// negocio.recarga_acreditar (idempotente por estado). El orderNumber es el codigo
// (uuid) de la recarga.
//
// Secretos (env / Vault):
//   IZIPAY_HASH_KEY   clave Hash del panel (HMAC-SHA256) para verificar la firma

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { admin, CORS, resp } from "./seguridad.ts";

// Firma web-core: HMAC-SHA256 sobre el string crudo `payloadHttp`, resultado BASE64.
async function firmaBase64(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

// Comparacion en tiempo constante (evita timing attacks sobre la firma).
function igual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

type Ipn = {
  code?: string;
  signature?: string;
  payloadHttp?: string;
  transactionId?: string;
  response?: {
    orderNumber?: string;
    order?: { orderNumber?: string; amount?: string | number }[];
  };
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const cuerpo = await req.json().catch(() => null) as Ipn | null;
    if (!cuerpo) return resp(400, { error: "sin_cuerpo" });

    const hashKey = Deno.env.get("IZIPAY_HASH_KEY");
    if (!hashKey) { console.error("izipay_hash_no_config"); return resp(500, { error: "config" }); }

    // 1) Verificar firma sobre payloadHttp (string crudo, sin re-serializar).
    const payload = cuerpo.payloadHttp ?? "";
    const firmaOk = !!cuerpo.signature && !!payload &&
      igual(await firmaBase64(hashKey, payload), cuerpo.signature);
    if (!firmaOk) { console.error("izipay_firma_invalida"); return resp(401, { error: "firma" }); }

    // 2) Solo el pago aprobado acredita (code "00"). Otros estados: se aceptan sin acreditar.
    if (cuerpo.code !== "00") return resp(200, { ok: true, ignorado: cuerpo.code ?? null });

    // 3) orderNumber -> recarga. Viene en response.order[0] o response, con respaldo en payloadHttp.
    const ord = cuerpo.response?.order;
    let orderNumber = "";
    if (Array.isArray(ord) && ord[0]?.orderNumber) orderNumber = String(ord[0].orderNumber);
    else if (cuerpo.response?.orderNumber) orderNumber = String(cuerpo.response.orderNumber);
    if (!orderNumber) {
      try {
        const pj = JSON.parse(payload) as { orderNumber?: string; order?: { orderNumber?: string } };
        orderNumber = String(pj?.orderNumber ?? pj?.order?.orderNumber ?? "");
      } catch { /* sin orden en payload */ }
    }
    if (!orderNumber) { console.error("izipay_sin_orden"); return resp(200, { ok: true, sin_orden: true }); }

    const db = admin();
    const { data: rec } = await db.schema("negocio").from("recarga")
      .select("codigo,estado,monto_pen")
      .eq("codigo", orderNumber).eq("pasarela", "izipay").maybeSingle();
    const r = rec as { codigo: string; estado: string; monto_pen: number | null } | null;
    if (!r) return resp(200, { ok: true, desconocido: true }); // no es nuestra: 200 para no reintentar
    if (r.estado === "pagado") return resp(200, { ok: true, ya: true });

    // 4) Defensa de monto: lo pagado debe coincidir con lo esperado (soles).
    let pagado = 0;
    if (Array.isArray(ord) && ord[0]?.amount != null) pagado = Number(ord[0].amount);
    const esperado = Number(r.monto_pen ?? 0);
    if (esperado > 0 && pagado > 0 && Math.abs(pagado - esperado) > 0.001) {
      console.error("izipay_monto_distinto", pagado, esperado);
      return resp(200, { ok: true, monto_distinto: true }); // no acredita; queda para revision
    }

    // 5) Acreditar EXACTLY-ONCE (idempotente: pendiente->pagado + despacho credito/licencia).
    const { data: acred, error: eAcr } = await db.schema("negocio")
      .rpc("recarga_acreditar", { p_recarga: r.codigo, p_actor: null });
    if (eAcr) { console.error("recarga_acreditar", JSON.stringify(eAcr)); return resp(500, { error: "acreditar" }); }
    return resp(200, { ok: true, resultado: acred });
  } catch (e) {
    console.error("izipay_webhook", (e as Error).message);
    return resp(500, { error: "fallo_interno" });
  }
});
