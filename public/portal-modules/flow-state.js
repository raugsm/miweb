// QUE: deriva la fase del flujo del portal cliente en base a las ordenes existentes.
// POR QUE: el portal no guarda un campo "step" explicito; la fase real depende del
// estado del backend (publicStatus + paymentProofs). Centralizar la derivacion aqui
// evita que cada componente re-implemente la regla y diverja.
//
// Tres fases posibles:
//   draft           No hay orden activa. El cliente puede crear solicitud nueva.
//   awaiting_proof  Hay orden ESPERANDO_PAGO sin comprobante. Esperando upload.
//   connected       Hay orden con comprobante subido o status posterior. Pasos 1-3
//                   quedan congelados; paso 4 muestra CTA "Equipo conectado".

export function deriveFlowState(customer) {
  const orders = customer?.orders || [];
  const active = orders.find((order) => (
    order.publicStatus === "ESPERANDO_PAGO"
    || order.publicStatus === "PAGO_EN_REVISION"
  ));
  if (!active) return "draft";

  const hasProofs = (active.paymentProofs || []).length > 0;
  if (active.publicStatus === "ESPERANDO_PAGO" && !hasProofs) {
    return "awaiting_proof";
  }
  return "connected";
}

export function activeOrderForFlow(customer) {
  const orders = customer?.orders || [];
  return orders.find((order) => (
    order.publicStatus === "ESPERANDO_PAGO"
    || order.publicStatus === "PAGO_EN_REVISION"
  )) || null;
}