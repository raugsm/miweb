// yape_confirmar (autenticada): tras pagar por Yape, el CLIENTE ingresa el CODIGO DE
// SEGURIDAD de 3 digitos de su comprobante. El backend CASA ese codigo con el pago que
// el telefono ya vio (monto exacto + codigo + ventana de tiempo) y, si cuadra, acredita
// EXACTLY-ONCE. Es la segunda mitad de la doble verificacion anti-fraude.
//
// POST { cobro_id, codigo } + JWT del tecnico
//   -> 200 { ok, casado? , ya? , motivo? , intentos? , producto? , creditos? , saldo? }

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
    const { data, error } = await db.schema("pago").rpc("yape_casar", {
      p_usuario: s.usuario, p_cobro: cobro, p_codigo: codigo,
    });
    if (error) {
      const msg = (error as { message?: string }).message ?? "";
      if (msg.includes("no_autorizado")) return resp(403, { error: "no_autorizado" });
      console.error("yape_casar", JSON.stringify(error));
      return resp(500, { error: "fallo" });
    }
    return resp(200, data); // { ok, casado|ya|motivo, ... }
  } catch (e) {
    const m = (e as Error).message;
    if (m === "sin_sesion" || m === "sesion_invalida") return resp(401, { error: m });
    if (m === "rechazo_autorizacion") return resp(403, { error: m });
    console.error("yape_confirmar", m);
    return resp(500, { error: "fallo_interno" });
  }
});
