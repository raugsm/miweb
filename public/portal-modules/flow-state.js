import { api } from "./api.js";
import { state } from "./state.js";

// PR-2a-final.bundle2 — fix real BUG 16 (BUG B sigue activo).
//
// Causa raiz historica: customerOrders se almacena newest-first y `find()`
// podia mezclar ordenes simultaneas. En sesion 24 dejamos de tratar
// EN_PREPARACION como accion web del cliente; la orden aprobada vive en
// seguimiento y el operador puede procesarla sin otro boton.
//
// Taxonomia (orden de prioridad de mayor a menor accion del cliente):
//   rejected            PAGO_RECHAZADO en alguna orden — debe subir nuevo comprobante.
//   in_review           PAGO_EN_REVISION — esperar revision del operador.
//   connected           EN_PREPARACION/LISTO_PARA_CONEXION/EN_PROCESO/REQUIERE_ATENCION.
//                       La conexion fisica se verifica fuera de la web; el cliente
//                       ya no debe presionar "Equipo conectado" como umbral.
//   draft               Sin ordenes activas.

const ACTIVE_STATES = new Set([
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

  if (orders.some((order) => order.publicStatus === "PAGO_EN_REVISION")) return "in_review";

  if (orders.some((order) => ACTIVE_STATES.has(order.publicStatus))) return "connected";

  return "draft";
}

// QUE: orden de compatibilidad para el endpoint viejo "notify-connected".
// POR QUE: el boton ya no se muestra en el flujo visual principal, pero dejamos
// esta ruta para clientes/cache antiguo mientras se completa la transicion.
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
