// yape_estado (autenticada): la web hace polling de este endpoint para saber si el
// cobro Yape ya se acredito. Reusa pago.cobro_ver (valida que el cobro sea del propio
// tecnico). monto_unidad viene en CENTIMOS de sol.
//
// POST { cobro_id } + JWT del tecnico
//   -> 200 { cobro_id, codigo_formato, monto_unidad, estado, vence_en }
//      estado 'confirmado' = ya acreditado.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { admin, CORS, exigirSesion, resp } from "./seguridad.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const s = await exigirSesion(req);
    const b = await req.json().catch(() => ({}));
    const cobro = String((b as { cobro_id?: string }).cobro_id ?? "");
    if (!cobro) return resp(400, { error: "incompleto" });

    const db = admin();
    const { data, error } = await db.schema("pago").rpc("cobro_ver", {
      p_usuario: s.usuario, p_cobro: cobro,
    });
    if (error) {
      const msg = (error as { message?: string }).message ?? "";
      if (msg.includes("no_autorizado")) return resp(403, { error: "no_autorizado" });
      console.error("cobro_ver", JSON.stringify(error));
      return resp(500, { error: "fallo" });
    }
    if (!data) return resp(404, { error: "no_existe" });
    return resp(200, data);
  } catch (e) {
    const m = (e as Error).message;
    if (m === "sin_sesion" || m === "sesion_invalida") return resp(401, { error: m });
    if (m === "rechazo_autorizacion") return resp(403, { error: m });
    console.error("yape_estado", m);
    return resp(500, { error: "fallo_interno" });
  }
});
