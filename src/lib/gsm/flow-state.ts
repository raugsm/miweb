// Derivación de la fase del flujo del cliente.
// Port de `public/portal-modules/flow-state.js`.
//
// Taxonomía (de mayor a menor acción requerida del cliente):
//   rejected   PAGO_RECHAZADO — debe subir un comprobante nuevo.
//   in_review  PAGO_EN_REVISION — espera la revisión del operador.
//   connected  orden aprobada y en seguimiento. La conexión física se verifica
//              fuera de la web; desde la sesión 24 el cliente ya NO debe apretar
//              "Equipo conectado" como umbral operativo.
//   draft      sin órdenes activas.

import type { CustomerOrder, CustomerState, FlowState } from "./types";

const ACTIVE_STATES = new Set([
  "PAGO_EN_REVISION",
  "PAGO_RECHAZADO",
  "EN_PREPARACION",
  "LISTO_PARA_CONEXION",
  "EN_PROCESO",
  "REQUIERE_ATENCION",
]);

export function deriveFlowState(customer: CustomerState | null): FlowState {
  const orders = customer?.orders || [];

  if (orders.some((order) => order.publicStatus === "PAGO_RECHAZADO")) return "rejected";
  if (orders.some((order) => order.publicStatus === "PAGO_EN_REVISION")) return "in_review";
  if (orders.some((order) => ACTIVE_STATES.has(order.publicStatus))) return "connected";

  return "draft";
}

/**
 * ¿Están congelados los paneles 1-2-3?
 *
 * Regla de la sesión 15b.2-ter: el estado "rechazado" DESCONGELA, porque si no
 * el cliente queda atrapado sin poder volver a subir el comprobante.
 */
export function panelsAreFrozen(flowState: FlowState): boolean {
  return flowState === "in_review" || flowState === "connected";
}

/**
 * Orden de compatibilidad para el endpoint viejo `notify-connected`.
 * El botón ya no se muestra en el flujo principal; se conserva la ruta para
 * clientes con caché antigua mientras se completa la transición.
 */
export function activeOrderForFlow(customer: CustomerState | null): CustomerOrder | null {
  const orders = customer?.orders || [];
  return (
    orders.find((order) => order.publicStatus === "EN_PREPARACION" && !order.customerConnectedAt)
    || orders.find((order) => order.publicStatus === "LISTO_PARA_CONEXION")
    || orders.find((order) => order.publicStatus === "EN_PREPARACION")
    || null
  );
}

/** Orden cuyo comprobante está en revisión o fue rechazado (la que ve el panel 3). */
export function orderInPaymentFlow(customer: CustomerState | null): CustomerOrder | null {
  const orders = customer?.orders || [];
  return (
    orders.find((order) => order.publicStatus === "PAGO_RECHAZADO")
    || orders.find((order) => order.publicStatus === "PAGO_EN_REVISION")
    || null
  );
}

/**
 * Estado del panel 4 según la spec v1.2 (modelo de 3 estados):
 *   A — inicial: código en placeholder, sin botón de conexión.
 *   B — comprobante en validación o rechazado: código real visible.
 *   C — pago aprobado: código real + instrucciones de conexión.
 */
export function derivePanel4State(flowState: FlowState): "A" | "B" | "C" {
  if (flowState === "connected") return "C";
  if (flowState === "in_review" || flowState === "rejected") return "B";
  return "A";
}
