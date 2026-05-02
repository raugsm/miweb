import { api } from "./api.js";
import { state } from "./state.js";

// PR-2a-final.fase4 — fix BUG B + nueva taxonomia de flowState.
//
// Antes la lista "active" solo incluia ESPERANDO_PAGO/PAGO_EN_REVISION/
// PAGO_RECHAZADO, asi que post-aprobacion (EN_PREPARACION) la orden caia
// fuera del filtro y deriveFlowState devolvia "draft" → renderFlowCta no
// pintaba el boton "Equipo conectado". REGRESIÓN del PR-2a-final.1.
//
// Ahora la taxonomia distingue cada fase para que cada componente sepa
// que pintar:
//   draft               No hay orden activa.
//   awaiting_proof      ESPERANDO_PAGO sin proofs (legacy — apenas ocurre).
//   in_review           PAGO_EN_REVISION (banner azul en paso 3).
//   rejected            PAGO_RECHAZADO (banner rojo + dropzone en paso 3).
//   awaiting_connection EN_PREPARACION sin customerConnectedAt → paso 4 +
//                        boton "Equipo conectado".
//   connected           LISTO_PARA_CONEXION+ — orden ya conectada/en proceso.

const ACTIVE_STATES = new Set([
  "ESPERANDO_PAGO",
  "PAGO_EN_REVISION",
  "PAGO_RECHAZADO",
  "EN_PREPARACION",
  "LISTO_PARA_CONEXION",
  "EN_PROCESO",
  "REQUIERE_ATENCION",
]);

export function deriveFlowState(customer) {
  const orders = customer?.orders || [];
  const active = orders.find((order) => ACTIVE_STATES.has(order.publicStatus));
  if (!active) return "draft";

  if (active.publicStatus === "PAGO_RECHAZADO") return "rejected";

  const hasProofs = (active.paymentProofs || []).length > 0;
  if (active.publicStatus === "ESPERANDO_PAGO" && !hasProofs) return "awaiting_proof";
  if (active.publicStatus === "PAGO_EN_REVISION") return "in_review";
  if (active.publicStatus === "EN_PREPARACION" && !active.customerConnectedAt) {
    return "awaiting_connection";
  }
  return "connected";
}

// QUE: orden actual sobre la que el cliente puede actuar con "Equipo conectado".
// El backend solo acepta el evento cuando publicStatus ∈ {EN_PREPARACION,
// LISTO_PARA_CONEXION} (portal-routes.js:705) — buscamos esa orden aqui.
export function activeOrderForFlow(customer) {
  const orders = customer?.orders || [];
  return orders.find((order) => (
    order.publicStatus === "EN_PREPARACION" || order.publicStatus === "LISTO_PARA_CONEXION"
  )) || null;
}

// QUE: notifica al equipo tecnico que el cliente conecto su equipo y esta listo para procesar.
// POR QUE: este es el evento que dispara la aparicion de la orden en el lane
// "Cliente conectado, listo para procesar" del panel del operador. El backend valida que
// la orden este en EN_PREPARACION o LISTO_PARA_CONEXION; antes de eso retorna 409.
export async function notifyEquipoConectado(orderId) {
  const payload = await api(`/api/portal/orders/${orderId}/notify-connected`, {
    method: "POST",
    body: "{}",
  });
  if (payload?.customer) state.customer = payload.customer;
  return payload;
}