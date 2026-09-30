// yape_confirmar (autenticada): el CLIENTE ingresa su CODIGO DE SEGURIDAD UNA vez. Se
// DECLARA en el cobro y se intenta casar ya. Si el pago aun no llego, queda 'esperando'
// y el servidor lo casa SOLO cuando el pago aparezca (el cliente NO reintenta; la web
// solo consulta el estado). Doble verificacion anti-fraude, exactly-once.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { admin, CORS, exigirSesion, resp } from "./seguridad.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const s = await exigirSesion(req);
    const b = await req.json().catch(() => ({}));
    const cobro = String((b as { cobro_id?: string }).cobro_id ?? "");
    const codigo = String((b as { codigo?: string }).codigo ?? "");
    if (!cobro || !codigo) return resp(400, { error: "incompleto" });

    const db = admin();
    const { data, error } = await db.schema("pago").rpc("yape_declarar", {
      p_usuario: s.usuario, p_cobro: cobro, p_codigo: codigo,
    });
    if (error) {
      const msg = (error as { message?: string }).message ?? "";
      if (msg.includes("no_autorizado")) return resp(403, { error: "no_autorizado" });
      console.error("yape_declarar", JSON.stringify(error));
      return resp(500, { error: "fallo" });
    }
    return resp(200, data); // { ok, casado|ya|motivo:'esperando'|... }
  } catch (e) {
    const m = (e as Error).message;
    if (m === "sin_sesion" || m === "sesion_invalida") return resp(401, { error: m });
    if (m === "rechazo_autorizacion") return resp(403, { error: m });
    console.error("yape_confirmar", m);
    return resp(500, { error: "fallo_interno" });
  }
});
