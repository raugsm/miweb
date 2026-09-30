// yape_version (PUBLICA, verify_jwt=false): el telefono pregunta si hay APK mas nuevo.
// GET firmado por cabecera sobre el canonico "device:actual". Devuelve la version
// publicada en parametros (o version_code 0 = no hay update).
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
  if (req.method !== "GET") return resp(405, { error: "metodo" });
  try {
    const db = admin();
    const secreto = await secretoCompartido(db);
    if (!secreto) { console.error("yape_hmac_no_config"); return resp(500, { error: "config" }); }

    const url = new URL(req.url);
    const dispositivo = url.searchParams.get("device") ?? "";
    const actual = url.searchParams.get("actual") ?? "0";
    const firma = req.headers.get("x-ariad-firma") ?? "";
    const deviceHdr = req.headers.get("x-ariad-device") ?? "";
    if (!dispositivo || !firma || dispositivo !== deviceHdr) return resp(400, { error: "incompleto" });

    if (!igual(await hmacBase64(secreto, `${dispositivo}:${actual}`), firma)) {
      return resp(401, { error: "firma" });
    }
    try { await db.schema("pago").rpc("yape_dispositivo_estado", { p_dispositivo: dispositivo }); } catch { /* nvm */ }

    const { data: params } = await db.schema("negocio").from("parametro")
      .select("clave,valor")
      .in("clave", ["yape_apk_version_code", "yape_apk_version_nombre",
                    "yape_apk_url", "yape_apk_sha256", "yape_apk_obligatorio"]);
    const P: Record<string, string> = {};
    for (const p of (params ?? []) as { clave: string; valor: string }[]) P[p.clave] = p.valor;

    return resp(200, {
      version_code: Math.trunc(Number(P["yape_apk_version_code"] ?? "0")) || 0,
      version_nombre: P["yape_apk_version_nombre"] ?? "",
      url_apk: P["yape_apk_url"] ?? "",
      sha256: P["yape_apk_sha256"] ?? "",
      obligatorio: (P["yape_apk_obligatorio"] ?? "false") === "true",
    });
  } catch (e) {
    console.error("yape_version", (e as Error).message);
    return resp(500, { error: "fallo_interno" });
  }
});
