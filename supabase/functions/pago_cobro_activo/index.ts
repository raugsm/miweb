// pago_cobro_activo (autenticada): devuelve el cobro EN CURSO del tecnico (cualquier
// metodo) para retomar el flujo, o null si no tiene ninguno abierto.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { admin, CORS, exigirSesion, resp } from "./seguridad.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const s = await exigirSesion(req);
    const db = admin();
    const { data, error } = await db.schema("pago").rpc("cobro_activo", { p_usuario: s.usuario });
    if (error) { console.error("cobro_activo", JSON.stringify(error)); return resp(500, { error: "fallo" }); }
    return resp(200, { activo: data ?? null });
  } catch (e) {
    const m = (e as Error).message;
    if (m === "sin_sesion" || m === "sesion_invalida") return resp(401, { error: m });
    if (m === "rechazo_autorizacion") return resp(403, { error: m });
    console.error("pago_cobro_activo", m);
    return resp(500, { error: "fallo_interno" });
  }
});
