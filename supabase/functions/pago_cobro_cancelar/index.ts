// pago_cobro_cancelar (autenticada): el tecnico cancela su cobro EN CURSO para empezar
// otro. Libera el slot expirando el cobro; si ya pago con el codigo correcto, igual se
// casa dentro de la ventana. No aplica a un cobro ya confirmado ni en revision.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { admin, CORS, exigirSesion, resp } from "./seguridad.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const s = await exigirSesion(req);
    const b = await req.json().catch(() => ({}));
    const cobro_id = String((b as { cobro_id?: string }).cobro_id ?? "");
    if (!cobro_id || !UUID.test(cobro_id)) return resp(400, { error: "cobro_id_invalido" });
    const db = admin();
    const { data, error } = await db.schema("pago").rpc("cobro_cancelar", { p_usuario: s.usuario, p_cobro: cobro_id });
    if (error) { console.error("cobro_cancelar", JSON.stringify(error)); return resp(500, { error: "fallo" }); }
    return resp(200, data ?? { ok: true });
  } catch (e) {
    const m = (e as Error).message;
    if (m === "sin_sesion" || m === "sesion_invalida") return resp(401, { error: m });
    if (m === "rechazo_autorizacion") return resp(403, { error: m });
    if (m === "no_autorizado") return resp(403, { error: m });
    console.error("pago_cobro_cancelar", m);
    return resp(500, { error: "fallo_interno" });
  }
});
