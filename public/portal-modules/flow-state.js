import { api } from "./api.js";
import { state } from "./state.js";

// PR-2a-final.bundle2 — fix real BUG 16 (BUG B sigue activo).
//
// Causa raiz definitiva: customerOrders se almacena newest-first y la version
// anterior usaba `find()` sobre la primera orden que matcheara ACTIVE_STATES.
// Si el cliente tiene MULTIPLES ordenes activas en simultaneo (caso comun en
// testing y permitido por producto excepto ESPERANDO_PAGO/RECHAZADO), find
// devolvia la mas reciente. Si la nueva estaba en PAGO_EN_REVISION pero la
// anterior estaba en EN_PREPARACION post-aprobacion, flowState resolvia a
// "in_review" y el boton "Equipo conectado" para la orden anterior nunca
// renderizaba. Ahora priorizamos por accionabilidad del cliente.
//
// Taxonomia (orden de prioridad de mayor a menor accion del cliente):
//   rejected            PAGO_RECHAZADO en alguna orden — debe subir nuevo comprobante.
//   awaiting_connection EN_PREPARACION + sin customerConnectedAt — debe presionar "Equipo conectado".
//   in_review           PAGO_EN_REVISION — esperar revision del operador.
//   awaiting_proof      ESPERANDO_PAGO sin proofs (legacy/edge — apenas ocurre).
//   connected           LISTO_PARA_CONEXION/EN_PROCESO/REQUIERE_ATENCION — ya conectado, en pipeline.
//   draft               Sin ordenes activas.

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

  if (orders.some((order) => order.publicStatus === "PAGO_RECHAZADO")) return "rejected";

  const awaitingConn = orders.some((order) => (
    order.publicStatus === "EN_PREPARACION" && !order.customerConnectedAt
  ));
  if (awaitingConn) return "awaiting_connection";

  if (orders.some((order) => order.publicStatus === "PAGO_EN_REVISION")) return "in_review";

  const awaitingProof = orders.some((order) => (
    order.publicStatus === "ESPERANDO_PAGO" && !(order.paymentProofs || []).length
  ));
  if (awaitingProof) return "awaiting_proof";

  if (orders.some((order) => ACTIVE_STATES.has(order.publicStatus))) return "connected";

  return "draft";
}

// QUE: orden sobre la que el cliente puede actuar con "Equipo conectado".
// El backend solo acepta el evento cuando publicStatus ∈ {EN_PREPARACION,
// LISTO_PARA_CONEXION} (portal-routes.js:705). Priorizamos la EN_PREPARACION
// + !customerConnectedAt (la que necesita el click) por encima de cualquier
// otra activa, sin depender del orden newest-first del array.
export function activeOrderForFlow(customer) {
  const orders = customer?.orders || [];
  return (
    orders.find((order) => (
      order.publicStatus === "EN_PREPARACION" && !order.customerConnectedAt
    ))
    || orders.find((order) => order.publicStatus === "LISTO_PARA_CONEXION")
    || orders.find((order) => order.publicStatus === "EN_PREPARACION")
    || null
  );
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