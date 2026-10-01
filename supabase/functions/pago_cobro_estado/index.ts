// pago_cobro_estado (autenticada): el frontend pregunta si SU cobro ya se confirmo.
// Verifica que el cobro sea del tecnico logueado (dueno). Sin boton de 'ya pague':
// el estado lo pone el vigia al ver el pago en Binance.
// Multi-servicio: devuelve tambien servicio + referencia_externa del cobro.
//
// POST { cobro_id } + JWT  ->  200 { estado, pagado, codigo, monto_unidad, vence_en, servicio, referencia_externa }

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { admin, CORS, exigirSesion, resp } from "./seguridad.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const s = await exigirSesion(req);
    const b = await req.json().catch(() => ({}));
    const cobro = String((b as { cobro_id?: string }).cobro_id ?? "");
    if (!cobro) return resp(400, { error: "cobro_id_requerido" });

    const db = admin();
    const { data, error } = await db.schema("pago").rpc("cobro_ver", {
      p_usuario: s.usuario,
      p_cobro: cobro,
    });
    if (error) {
      const m = (error as { message?: string }).message ?? "";
      if (/no_autorizado/.test(m)) return resp(403, { error: "no_autorizado" });
      console.error("cobro_ver", JSON.stringify(error));
      return resp(500, { error: "estado_fallido" });
    }
    if (!data) return resp(404, { error: "no_existe" });
    const d = data as {
      estado: string; codigo_formato: string; monto_unidad: number; vence_en: string;
      servicio?: string | null; referencia_externa?: string | null;
    };
    return resp(200, {
      estado: d.estado,
      pagado: d.estado === "confirmado",
      codigo: d.codigo_formato,
      monto_unidad: d.monto_unidad,
      vence_en: d.vence_en,
      servicio: d.servicio ?? null,
      referencia_externa: d.referencia_externa ?? null,
    });
  } catch (e) {
    const m = (e as Error).message;
    if (m === "sin_sesion" || m === "sesion_invalida") return resp(401, { error: m });
    if (m === "rechazo_autorizacion") return resp(403, { error: m });
    console.error("pago_cobro_estado", m);
    return resp(500, { error: "fallo_interno" });
  }
});
