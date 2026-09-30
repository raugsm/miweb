// yape_notificar (PUBLICA, verify_jwt=false): el telefono postea cada notif de pago.
// Solo procesa si la firma HMAC-SHA256 del cuerpo CRUDO es valida y el dispositivo esta
// autorizado. Guarda el pago visto idempotente (txid=huella). No acredita aca.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { admin, CORS, resp } from "./seguridad.ts";

async function hmacBase64(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}
function igual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
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
    let secreto = Deno.env.get("YAPE_HMAC_SECRETO") ?? "";
    if (!secreto) {
      try {
        const { data } = await db.schema("pago").rpc("secreto_leer", { p_nombre: "yape_hmac_secreto" });
        secreto = typeof data === "string" ? data : "";
      } catch { /* sin vault */ }
    }
    if (!secreto) { console.error("yape_hmac_no_config"); return resp(500, { error: "config" }); }

    const raw = await req.text();
    const firmaCliente = req.headers.get("x-ariad-firma") ?? "";
    const deviceHdr = req.headers.get("x-ariad-device") ?? "";
    if (!raw || !firmaCliente || !deviceHdr) return resp(400, { error: "incompleto" });

    if (!igual(await hmacBase64(secreto, raw), firmaCliente)) {
      console.error("yape_firma_invalida", deviceHdr);
      return resp(401, { error: "firma" });
    }

    let b: Record<string, unknown>;
    try { b = JSON.parse(raw); } catch { return resp(400, { error: "json" }); }

    const dispositivo = String(b.device ?? "");
    if (!dispositivo || dispositivo !== deviceHdr) return resp(400, { error: "device_mismatch" });

    const huella = String(b.huella ?? "");
    const codigo = String(b.codigo ?? "");
    const pagador = String(b.pagador ?? "");
    const centimos = aCentimos(String(b.monto ?? ""));
    const ms = Number(b.recibido_en_ms ?? 0);
    if (!huella || centimos === null) return resp(400, { error: "datos" });

    const ahora = Date.now();
    const ocurrido = ms > 0 && ms < ahora + 10 * 60 * 1000 ? ms : ahora;

    const { data, error } = await db.schema("pago").rpc("yape_ingerir", {
      p_dispositivo: dispositivo,
      p_huella: huella,
      p_monto_centimos: centimos,
      p_codigo: codigo,
      p_pagador: pagador,
      p_ocurrido: new Date(ocurrido).toISOString(),
    });
    if (error) {
      console.error("yape_ingerir", JSON.stringify(error));
      return resp(500, { error: "ingerir" });
    }
    const d = (data ?? {}) as { ok?: boolean; motivo?: string; nuevo?: boolean };
    if (d.ok === false) {
      if (d.motivo === "dispositivo_desconocido" || d.motivo === "dispositivo_inactivo") {
        console.error("yape_dispositivo_no_autorizado", dispositivo, d.motivo);
        return resp(403, { error: d.motivo });
      }
      return resp(200, { ok: true, ignorado: d.motivo ?? null });
    }
    return resp(200, { ok: true, nuevo: !!d.nuevo });
  } catch (e) {
    console.error("yape_notif", (e as Error).message);
    return resp(500, { error: "fallo_interno" });
  }
});
