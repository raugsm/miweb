// recarga_webhook (pública, verify_jwt=false): CoinGate avisa acá el estado del
// pago. Cuando el estado es "paid", se acreditan los créditos UNA sola vez.
//
// Seguridad y anti-doble:
//   - Se valida el `token` que CoinGate devuelve contra el guardado en la fila.
//   - Se re-consulta la orden a CoinGate (defensa en profundidad) antes de sumar.
//   - Se "reclama" la fila con un UPDATE condicional (pendiente → pagado): solo
//     el primer webhook que la reclama acredita; los repetidos no hacen nada.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { admin, CORS, resp } from "../_shared/seguridad.ts";

function baseCoinGate(): string {
  return Deno.env.get("COINGATE_ENV") === "production"
    ? "https://api.coingate.com/api/v2"
    : "https://api-sandbox.coingate.com/api/v2";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    // CoinGate manda los datos como formulario (x-www-form-urlencoded).
    const form = await req.formData().catch(() => null);
    if (!form) return resp(400, { error: "sin_datos" });
    const orderId = String(form.get("order_id") ?? ""); // = recarga.codigo
    const token = String(form.get("token") ?? "");
    const status = String(form.get("status") ?? "");
    if (!orderId) return resp(400, { error: "sin_orden" });

    const db = admin();
    const { data: rec } = await db.schema("negocio").from("recarga")
      .select("codigo,usuario_ref,creditos,token,estado,coingate_order_id")
      .eq("codigo", orderId).maybeSingle();
    if (!rec) return resp(404, { error: "recarga_no_encontrada" });
    const r = rec as {
      codigo: string; usuario_ref: string; creditos: number;
      token: string; estado: string; coingate_order_id: string | null;
    };

    // El token del callback tiene que coincidir con el de la orden.
    if (!token || token !== r.token) return resp(403, { error: "token_invalido" });

    // Ya acreditada: idempotente, nada que hacer.
    if (r.estado === "pagado") return resp(200, { ok: true, ya: true });

    if (status === "paid") {
      // Defensa en profundidad: preguntarle a CoinGate el estado real.
      const clave = Deno.env.get("COINGATE_TOKEN");
      if (clave && r.coingate_order_id) {
        try {
          const cg = await fetch(`${baseCoinGate()}/orders/${r.coingate_order_id}`, {
            headers: { Authorization: `Token ${clave}`, Accept: "application/json" },
          });
          if (cg.ok) {
            const o = await cg.json() as { status?: string };
            if (o.status !== "paid") return resp(409, { error: "estado_no_confirmado" });
          }
        } catch (_e) { /* si la reconsulta falla, se confía en token + status */ }
      }

      // Reclamar la fila: solo pasa de pendiente → pagado una vez.
      const { data: marca } = await db.schema("negocio").from("recarga")
        .update({ estado: "pagado", pagado_en: new Date().toISOString() })
        .eq("codigo", r.codigo).eq("estado", "pendiente").select("codigo");
      if (!marca || (marca as unknown[]).length === 0) {
        return resp(200, { ok: true, ya: true }); // otro webhook la tomó antes
      }

      // Sumar los créditos. Si falla, se devuelve la fila a pendiente para reintentar.
      const { error: eCred } = await db.schema("negocio").rpc("credito_mover", {
        p_usuario: r.usuario_ref, p_delta: r.creditos, p_tipo: "recarga",
        p_motivo: "Recarga CoinGate", p_referencia: r.codigo, p_actor: null,
      });
      if (eCred) {
        console.error("credito_mover_fallo", JSON.stringify(eCred));
        await db.schema("negocio").from("recarga")
          .update({ estado: "pendiente", pagado_en: null }).eq("codigo", r.codigo);
        return resp(500, { error: "acreditacion_fallida" });
      }
      return resp(200, { ok: true });
    }

    if (["invalid", "expired", "canceled"].includes(status)) {
      await db.schema("negocio").from("recarga")
        .update({ estado: status === "canceled" ? "cancelado" : status })
        .eq("codigo", r.codigo).eq("estado", "pendiente");
    }
    return resp(200, { ok: true });
  } catch (e) {
    console.error("recarga_webhook", (e as Error).message);
    return resp(500, { error: "fallo_interno" });
  }
});
