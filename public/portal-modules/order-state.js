import { state } from "./state.js";
import { money } from "./format.js";

export function orderNeedsPaymentProof(order) {
  if (!order || order.publicStatus === "REVISION_COMPATIBILIDAD") return false;
  if (order.publicStatus === "PAGO_RECHAZADO") return true;
  return false;
}

export function statusLabel(code) {
  return state.catalog?.statuses?.find((status) => status.code === code)?.label || code || "Pendiente";
}

export function itemStatusLabel(code) {
  const labels = {
    ESPERANDO_PREPARACION: "Preparación",
    LISTO_PARA_TECNICO: "Listo para conexión",
    EN_PROCESO: "En proceso",
    FINALIZADO: "Finalizado",
    REQUIERE_REVISION: "Revisión",
    ESPERANDO_CLIENTE: "Esperando cliente",
    CANCELADO: "Cancelado",
  };
  return labels[code] || statusLabel(code);
}

export function customerNextAction(order) {
  if (order?.nextAction) return order.nextAction;
  if (order?.publicStatus === "REVISION_COMPATIBILIDAD") return "AriadGSM revisará compatibilidad antes de pedir pago.";
  if (order?.publicStatus === "ESPERANDO_PAGO") return "Completa el paso 3 para iniciar validación.";
  if (order?.publicStatus === "PAGO_EN_REVISION") return "Validando comprobante. Te avisaremos en cuanto el técnico apruebe el pago.";
  if (order?.publicStatus === "PAGO_RECHAZADO") {
    const reason = String(order.paymentRejectedReason || "").trim() || "Comprobante rechazado.";
    return `${reason} Sube un nuevo comprobante.`;
  }
  if (order?.publicStatus === "EN_PREPARACION") return "Pago confirmado. Prepara USB Redirector y mantén el equipo disponible.";
  if (order?.publicStatus === "LISTO_PARA_CONEXION") return "Mantente disponible. El técnico tomará el equipo.";
  if (order?.publicStatus === "EN_PROCESO") return "No desconectes el equipo. Técnico procesando.";
  if (order?.publicStatus === "FINALIZADO") return "Servicio finalizado. Descarga tu recibo abajo.";
  if (order?.publicStatus === "REQUIERE_ATENCION") return "Revisa el motivo y corrige lo solicitado.";
  return "Revisa el avance de tu pedido.";
}

export function orderBadges(order) {
  const badges = [];
  if (order?.customerConnectionReadyAt) badges.push("Conexión lista");
  if (order?.urgentRequested) badges.push(order.urgentStatus === "APROBADO" ? "Urgente aprobado" : "Urgente solicitado");
  if (order?.postpayRequested) badges.push(order.postpayStatus === "APROBADO" ? "Postpago aprobado" : "Postpago solicitado");
  return badges;
}

export function trackingStage(order) {
  if (order?.publicStatus === "FINALIZADO") return "DONE";
  if (order?.publicStatus === "EN_PROCESO" || (order?.items || []).some((item) => item.status === "EN_PROCESO")) return "PROCESS";
  return "RECEIVED";
}

// Sesion 24: Mis Ordenes muestra el pedido desde que se sube comprobante.
// "Equipo conectado" ya no es umbral operativo; revision, aprobado y atencion
// viven en seguimiento. Solo price_decision_required agrega una decision extra
// si el lock vence con costo subido durante procesamiento.
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
  if (order?.publicStatus === "REVISION_COMPATIBILIDAD") return "Modelo en revisión: AriadGSM confirmará si aplica FRP Express antes de pedir pago.";
  if (order?.publicStatus === "REQUIERE_ATENCION") return order.nextAction || "Se requiere atención: revisa la indicación de AriadGSM.";
  if ((order?.items || []).some((item) => item.status === "REQUIERE_REVISION")) return "Hay un equipo en revisión. Revisa el detalle antes de continuar.";
  if (order?.publicStatus === "PAGO_RECHAZADO") {
    const reason = String(order.paymentRejectedReason || "").trim() || "Comprobante rechazado.";
    return `Tu pago fue rechazado. Motivo: ${reason} Sube un nuevo comprobante.`;
  }
  return "";
}
