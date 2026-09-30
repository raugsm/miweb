// pago_cobro_crear (autenticada): el tecnico logueado pide RECARGAR creditos O comprar
// la LICENCIA anual, pagando con Binance Pay. Crea el cobro (monto exacto + codigo) y
// devuelve lo que hay que mostrar. El credito/licencia NO se otorga aca: lo hace el
// vigia (pago_conciliar) cuando ve el pago en Binance.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { admin, CORS, exigirSesion, resp } from "./seguridad.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const s = await exigirSesion(req);
    const b = await req.json().catch(() => ({}));
    const producto = (b as { producto?: string }).producto === "licencia" ? "licencia" : "credito";
    let creditos = 0;
    if (producto === "credito") {
      creditos = Math.trunc(Number((b as { creditos?: number }).creditos ?? 0));
      if (!(creditos >= 1 && creditos <= 5000)) return resp(400, { error: "creditos_invalido" });
    }

    const db = admin();
    const { data, error } = await db.schema("pago").rpc("cobro_crear", {
      p_usuario: s.usuario,
      p_creditos: creditos,
      p_producto: producto,
    });
    if (error || !data) {
      const msg = (error as { message?: string } | null)?.message ?? "";
      if (msg.includes("cobro_en_curso")) return resp(409, { error: "cobro_en_curso" });
      console.error("cobro_crear", JSON.stringify(error));
      return resp(500, { error: "cobro_fallido" });
    }
    const d = data as {
      cobro_id: string; codigo_formato: string; monto_texto: string;
      creditos: number; producto: string; vence_en: string;
    };

    let destino = "";
    let pago_url = "";
    try {
      const { data: params } = await db.schema("negocio")
        .from("parametro").select("clave,valor")
        .in("clave", ["binance_pay_id", "binance_pay_url"]);
      for (const p of (params ?? []) as { clave: string; valor: string }[]) {
        if (p.clave === "binance_pay_id") destino = p.valor ?? "";
        if (p.clave === "binance_pay_url") pago_url = p.valor ?? "";
      }
    } catch { /* sin parametros: el front muestra los pasos manuales */ }

    return resp(200, {
      cobro_id: d.cobro_id,
      codigo: d.codigo_formato,
      monto: d.monto_texto,
      producto: d.producto,
      creditos: d.creditos,
      vence_en: d.vence_en,
      destino,
      pago_url,
    });
  } catch (e) {
    const m = (e as Error).message;
    if (m === "sin_sesion" || m === "sesion_invalida") return resp(401, { error: m });
    if (m === "rechazo_autorizacion") return resp(403, { error: m });
    console.error("pago_cobro_crear", m);
    return resp(500, { error: "fallo_interno" });
  }
});
