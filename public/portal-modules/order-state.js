import { state } from "./state.js";
import { money } from "./format.js";

export function orderHasPaymentProof(order) {
  return (order?.paymentProofs || []).length > 0;
}

export function orderNeedsPaymentProof(order) {
  if (!order || order.publicStatus === "REVISION_COMPATIBILIDAD") return false;
  if (order.publicStatus === "PAGO_RECHAZADO") return true;
  return order.publicStatus === "ESPERANDO_PAGO" && !orderHasPaymentProof(order);
}

export function statusLabel(code) {
  return state.catalog?.statuses?.find((status) => status.code === code)?.label || code || "Pendiente";
}

export function itemStatusLabel(code) {
  const labels = {
    ESPERANDO_PREPARACION: "Preparacion",
    LISTO_PARA_TECNICO: "Listo para conexion",
    EN_PROCESO: "En proceso",
    FINALIZADO: "Finalizado",
    REQUIERE_REVISION: "Revision",
    ESPERANDO_CLIENTE: "Esperando cliente",
    CANCELADO: "Cancelado",
  };
  return labels[code] || statusLabel(code);
}

export function customerNextAction(order) {
  if (order?.nextAction) return order.nextAction;
  if (order?.publicStatus === "REVISION_COMPATIBILIDAD") return "AriadGSM revisara compatibilidad antes de pedir pago.";
  if (order?.publicStatus === "ESPERANDO_PAGO") return "Completa el paso 3 para iniciar validacion.";
  if (order?.publicStatus === "PAGO_EN_REVISION") return "Validando comprobante. Te avisaremos en cuanto el tecnico apruebe el pago.";
  if (order?.publicStatus === "PAGO_RECHAZADO") {
    const reason = String(order.paymentRejectedReason || "").trim() || "Comprobante rechazado.";
    return `${reason} Sube un nuevo comprobante.`;
  }
  if (order?.publicStatus === "EN_PREPARACION") return "Pago confirmado. Conecta tu equipo desde el paso 4 cuando este listo.";
  if (order?.publicStatus === "LISTO_PARA_CONEXION") return "Mantente disponible. El tecnico tomara el equipo.";
  if (order?.publicStatus === "EN_PROCESO") return "No desconectes el equipo. Tecnico procesando.";
  if (order?.publicStatus === "FINALIZADO") return "Servicio finalizado. Revisa el Done.";
  if (order?.publicStatus === "REQUIERE_ATENCION") return "Revisa el motivo y corrige lo solicitado.";
  return "Revisa el avance de tu pedido.";
}

export function orderBadges(order) {
  const badges = [];
  if (order?.customerConnectionReadyAt) badges.push("Conexion lista");
  if (order?.urgentRequested) badges.push(order.urgentStatus === "APROBADO" ? "Urgente aprobado" : "Urgente solicitado");
  if (order?.postpayRequested) badges.push(order.postpayStatus === "APROBADO" ? "Postpago aprobado" : "Postpago solicitado");
  return badges;
}

export function trackingStage(order) {
  if (order?.publicStatus === "FINALIZADO") return "DONE";
  if (order?.publicStatus === "EN_PROCESO" || (order?.items || []).some((item) => item.status === "EN_PROCESO")) return "PROCESS";
  return "RECEIVED";
}

// PR-2a-final.bundle2 item 4 — limpieza de estados pre-conexion. Mis Ordenes
// solo muestra ordenes post-"Equipo conectado" (FINAL §8 actualizado), asi
// que payment_review / payment_rejected / awaiting_connection ya no se
// renderizan en el listado — viven inline en pasos 3/4. Solo
// price_decision_required permanece (puede aparecer post-conexion si el
// lock vence con costo subido durante procesamiento).
export function ordersDisplayState(order) {
  if (!order) return "";
  if (orderRequiresPriceDecision(order)) return "price_decision_required";
  return "";
}

// QUE: indica que el precio actual subio sobre el anclado, el lock vencio,
// y el cliente todavia no decidio que hacer.
// POR QUE: PR-2a-final.1 — el lock dura 15 min desde la aprobacion del operador.
// Antes de esos 15 min, el cliente esta protegido aunque el costo suba. Cuando
// vence:
//   - Si current <= locked: server renueva silencioso (sigue protegido).
//   - Si current > locked: NO se renueva, se le piden las 3 opciones.
// Si ya decidio (priceDecisionAction set), no se vuelve a preguntar hasta
// que la orden cierre o cambie de fase.
export function orderRequiresPriceDecision(order) {
  if (!order) return false;
  if (order.priceDecisionAction) return false;
  const locked = Number(order.priceLocked || 0);
  const current = Number(order.currentUnitPrice || 0);
  if (locked <= 0 || current <= 0) return false;
  if (current <= locked) return false;
  // Lock todavia vigente: aun si subio el costo, el cliente esta protegido —
  // no le pedimos decidir. La decision aparece solo al expirar el lock.
  const expiresAtMs = Date.parse(order.priceLockExpiresAt || "");
  if (Number.isFinite(expiresAtMs) && Date.now() < expiresAtMs) return false;
  return !["CANCELADO", "FINALIZADO"].includes(order.publicStatus);
}

export function trackingStageLabel(order) {
  const labels = {
    RECEIVED: "Pedido recibido",
    PROCESS: "En proceso",
    DONE: "Done",
  };
  return labels[trackingStage(order)] || "Pedido recibido";
}

export function orderSortPriority(order) {
  const stage = trackingStage(order);
  if (stage === "PROCESS") return 0;
  if (stage === "RECEIVED") return 1;
  return 2;
}

export function sortOrdersForDisplay(orders) {
  return [...orders].sort((a, b) => {
    const priority = orderSortPriority(a) - orderSortPriority(b);
    if (priority) return priority;
    return new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0);
  });
}

export function compactDiscountLabel(order) {
  const label = String(order?.discountLabel || "").trim();
  if (!label || ["Normal", "Precio base"].includes(label)) return "";
  return label;
}

export function compactOrderMeta(order) {
  const parts = [
    `${order.quantity} equipo${Number(order.quantity) === 1 ? "" : "s"}`,
    order.priceFormatted || money(order.totalPrice),
    compactDiscountLabel(order),
  ].filter(Boolean);
  return parts.join(" - ");
}

export function orderAlertText(order) {
  if (order?.publicStatus === "REVISION_COMPATIBILIDAD") return "Modelo en revision: AriadGSM confirmara si aplica FRP Express antes de pedir pago.";
  if (order?.publicStatus === "REQUIERE_ATENCION") return order.nextAction || "Se requiere atencion: revisa la indicacion de AriadGSM.";
  if ((order?.items || []).some((item) => item.status === "REQUIERE_REVISION")) return "Hay un equipo en revision. Revisa el detalle antes de continuar.";
  if (order?.publicStatus === "PAGO_RECHAZADO") {
    const reason = String(order.paymentRejectedReason || "").trim() || "Comprobante rechazado.";
    return `Tu pago fue rechazado. Motivo: ${reason} Sube un nuevo comprobante.`;
  }
  return "";
}
