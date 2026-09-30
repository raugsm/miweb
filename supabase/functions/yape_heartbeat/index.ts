// yape_heartbeat (PUBLICA, verify_jwt=false): el telefono manda un latido firmado con
// cuantos pagos tiene en cola y que version corre. Verifica HMAC + dispositivo. No acredita.
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
async function secretoCompartido(db: ReturnType<typeof admin>): Promise<string> {
  const env = Deno.env.get("YAPE_HMAC_SECRETO") ?? "";
  if (env) return env;
  try {
    const { data } = await db.schema("pago").rpc("secreto_leer", { p_nombre: "yape_hmac_secreto" });
    return typeof data === "string" ? data : "";
  } catch { return ""; }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return resp(405, { error: "metodo" });
  try {
    const db = admin();
    const secreto = await secretoCompartido(db);
    if (!secreto) { console.error("yape_hmac_no_config"); return resp(500, { error: "config" }); }

    const raw = await req.text();
    const firma = req.headers.get("x-ariad-firma") ?? "";
    const deviceHdr = req.headers.get("x-ariad-device") ?? "";
    if (!raw || !firma || !deviceHdr) return resp(400, { error: "incompleto" });
    if (!igual(await hmacBase64(secreto, raw), firma)) return resp(401, { error: "firma" });

    let b: Record<string, unknown>;
    try { b = JSON.parse(raw); } catch { return resp(400, { error: "json" }); }
    const dispositivo = String(b.device ?? "");
    if (!dispositivo || dispositivo !== deviceHdr) return resp(400, { error: "device_mismatch" });

    const pendientes = Math.trunc(Number(b.pendientes ?? 0));
    const version = Math.trunc(Number(b.version ?? 0));
    const { data, error } = await db.schema("pago").rpc("yape_latido", {
      p_dispositivo: dispositivo, p_pendientes: pendientes, p_version: version,
    });
    if (error) { console.error("yape_latido", JSON.stringify(error)); return resp(500, { error: "latido" }); }
    return resp(200, data ?? { ok: true });
  } catch (e) {
    console.error("yape_heartbeat", (e as Error).message);
    return resp(500, { error: "fallo_interno" });
  }
});
