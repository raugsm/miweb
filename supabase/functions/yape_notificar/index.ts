// yape_notif (PUBLICA, verify_jwt=false): el telefono lector de Yape postea aca CADA
// notificacion de "pago recibido". NUNCA se confia sin verificar: solo procesa si la
// FIRMA HMAC-SHA256 del cuerpo CRUDO es valida Y el device esta autorizado. El pago
// visto se guarda IDEMPOTENTE (txid = huella). El credito/licencia NO se otorga aca:
// se otorga cuando el CLIENTE ingresa su codigo de seguridad en la web (yape_confirmar)
// y cuadra con este pago (casacion doble anti-fraude).
//
// Headers del telefono:
//   X-Ariad-Firma  = base64(HMAC-SHA256(rawBody, YAPE_HMAC_SECRETO))
//   X-Ariad-Device = device id (debe estar en pago.yape_dispositivo, activo)
// Cuerpo JSON: { monto, codigo, pagador, texto, recibido_en_ms, huella, device }
//
// Secretos (env): YAPE_HMAC_SECRETO (el MISMO string configurado en la app del telefono)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { admin, CORS, resp } from "./seguridad.ts";

// HMAC-SHA256 sobre el string crudo, resultado BASE64.
async function hmacBase64(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

// Comparacion en TIEMPO CONSTANTE (evita timing attacks sobre la firma).
function igual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// "3.53" | "3,53" | "1" -> centimos (entero). Rechaza cualquier otra cosa.
function aCentimos(s: string): number | null {
  const t = String(s ?? "").trim().replace(",", ".");
  if (!/^[0-9]+(\.[0-9]{1,2})?$/.test(t)) return null;
  return Math.round(parseFloat(t) * 100);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return resp(405, { error: "metodo" });
  try {
    const db = admin();
    // Secreto compartido: primero env (si el dueno lo puso), si no Vault (secreto_leer).
    let secreto = Deno.env.get("YAPE_HMAC_SECRETO") ?? "";
    if (!secreto) {
      try {
        const { data } = await db.schema("pago").rpc("secreto_leer", { p_nombre: "yape_hmac_secreto" });
        secreto = typeof data === "string" ? data : "";
      } catch { /* sin vault: queda vacio */ }
    }
    if (!secreto) { console.error("yape_hmac_no_config"); return resp(500, { error: "config" }); }

    // 1) LEER EL CUERPO CRUDO (sin re-serializar): la firma se calcula sobre ESTOS bytes.
    const raw = await req.text();
    const firmaCliente = req.headers.get("x-ariad-firma") ?? "";
    const deviceHdr = req.headers.get("x-ariad-device") ?? "";
    if (!raw || !firmaCliente || !deviceHdr) return resp(400, { error: "incompleto" });

    // 2) VERIFICAR FIRMA en tiempo constante. Sin firma valida no se lee nada mas.
    if (!igual(await hmacBase64(secreto, raw), firmaCliente)) {
      console.error("yape_firma_invalida", deviceHdr);
      return resp(401, { error: "firma" });
    }

    // 3) Recien ahora parseamos el JSON (ya probado autentico e integro).
    let b: Record<string, unknown>;
    try { b = JSON.parse(raw); } catch { return resp(400, { error: "json" }); }

    // 4) La firma cubre el device del CUERPO; el header debe coincidir (evita reusar
    //    una firma valida declarando otro device).
    const device = String(b.device ?? "");
    if (!device || device !== deviceHdr) return resp(400, { error: "device_mismatch" });

    const huella = String(b.huella ?? "");
    const codigo = String(b.codigo ?? "");
    const pagador = String(b.pagador ?? "");
    const centimos = aCentimos(String(b.monto ?? ""));
    const ms = Number(b.recibido_en_ms ?? 0);
    if (!huella || centimos === null) return resp(400, { error: "datos" });

    // 5) Anti-replay suave: descarta timestamps absurdos (defensa extra; el dedup REAL
    //    es la huella UNIQUE en pago_visto). Permite reintentos viejos (cortes de luz)
    //    pero nunca del futuro.
    const ahora = Date.now();
    const ocurrido = ms > 0 && ms < ahora + 10 * 60 * 1000 ? ms : ahora;

    const { data, error } = await db.schema("pago").rpc("yape_ingerir", {
      p_device: device,
      p_huella: huella,
      p_monto_centimos: centimos,
      p_codigo: codigo,
      p_pagador: pagador,
      p_ocurrido: new Date(ocurrido).toISOString(),
    });
    if (error) {
      console.error("yape_ingerir", JSON.stringify(error));
      return resp(500, { error: "ingerir" }); // 5xx: el telefono reintenta luego
    }
    const d = (data ?? {}) as { ok?: boolean; motivo?: string; nuevo?: boolean };
    if (d.ok === false) {
      // Device no autorizado: 403 (el telefono lo mostrara; no es transitorio).
      if (d.motivo === "device_desconocido" || d.motivo === "device_inactivo") {
        console.error("yape_device_no_autorizado", device, d.motivo);
        return resp(403, { error: d.motivo });
      }
      return resp(200, { ok: true, ignorado: d.motivo ?? null });
    }
    // Exito (nuevo o duplicado): 200 => el telefono marca "enviado" y no reintenta.
    return resp(200, { ok: true, nuevo: !!d.nuevo });
  } catch (e) {
    console.error("yape_notif", (e as Error).message);
    return resp(500, { error: "fallo_interno" });
  }
});
