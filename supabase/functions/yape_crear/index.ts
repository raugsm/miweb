// yape_crear (autenticada): el tecnico logueado pide RECARGAR creditos O comprar la
// LICENCIA anual pagando con YAPE en SOLES. Crea el cobro pendiente (monto EXACTO a
// pagar + a que numero Yape) y lo devuelve. El credito/licencia NO se otorga aca: se
// otorga cuando el cliente confirma con su codigo de seguridad (yape_confirmar).
//
// POST { producto?: 'credito'|'licencia', creditos?: number } + JWT del tecnico
//   -> 200 { cobro_id, codigo, monto, moneda, producto, creditos, vence_en, destino }

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { admin, CORS, exigirSesion, resp } from "./seguridad.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const s = await exigirSesion(req); // valida sesion -> usuario_taller
    const b = await req.json().catch(() => ({}));
    const producto = (b as { producto?: string }).producto === "licencia" ? "licencia" : "credito";
    let creditos = 0;
    if (producto === "credito") {
      creditos = Math.trunc(Number((b as { creditos?: number }).creditos ?? 0));
      if (!(creditos >= 1 && creditos <= 5000)) return resp(400, { error: "creditos_invalido" });
    }

    const db = admin();
    const { data, error } = await db.schema("pago").rpc("cobro_crear_yape", {
      p_usuario: s.usuario, p_producto: producto, p_creditos: creditos,
    });
    if (error || !data) {
      const msg = (error as { message?: string } | null)?.message ?? "";
      if (msg.includes("yape_inactivo")) return resp(503, { error: "yape_inactivo" });
      if (msg.includes("precio_no_configurado")) return resp(500, { error: "precio_no_configurado" });
      console.error("cobro_crear_yape", JSON.stringify(error));
      return resp(500, { error: "cobro_fallido" });
    }
    const d = data as {
      cobro_id: string; codigo_formato: string; monto_texto: string;
      monto_centimos: number; creditos: number; producto: string; vence_en: string;
    };

    // Numero/nombre Yape de Ariad (config por datos, editable por el dueno).
    let destino = "";
    try {
      const { data: p } = await db.schema("negocio").from("parametro")
        .select("valor").eq("clave", "yape_destino").maybeSingle();
      destino = (p as { valor?: string } | null)?.valor ?? "";
    } catch { /* sin destino: el front muestra instrucciones genericas */ }

    return resp(200, {
      cobro_id: d.cobro_id,
      codigo: d.codigo_formato,   // referencia interna (NO es el codigo de seguridad Yape)
      monto: d.monto_texto,       // "3.50" — MONTO EXACTO a pagar en soles
      moneda: "PEN",
      producto: d.producto,       // 'credito' | 'licencia'
      creditos: d.creditos,
      vence_en: d.vence_en,
      destino,                    // numero Yape de Ariad a quien pagar
    });
  } catch (e) {
    const m = (e as Error).message;
    if (m === "sin_sesion" || m === "sesion_invalida") return resp(401, { error: m });
    if (m === "rechazo_autorizacion") return resp(403, { error: m });
    console.error("yape_crear", m);
    return resp(500, { error: "fallo_interno" });
  }
});
