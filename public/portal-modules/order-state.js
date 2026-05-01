import { state } from "./state.js";
import { money } from "./format.js";

export function orderHasPaymentProof(order) {
  return (order?.paymentProofs || []).length > 0;
}

export function orderNeedsPaymentProof(order) {
  if (!order || order.publicStatus === "REVISION_COMPATIBILIDAD") return false;
  if (order.paymentStatus === "RECHAZADO" || order.proofStatus === "RECHAZADO") return true;
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
  if (order?.publicStatus === "PAGO_EN_REVISION") return "Prepara USB Redirector mientras validamos el pago.";
  if (order?.publicStatus === "EN_PREPARACION") return "Marca que estas listo para conectar cuando tengas PC, cable y USB Redirector abierto.";
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
  if (order?.paymentStatus === "RECHAZADO" || order?.proofStatus === "RECHAZADO") return "Comprobante rechazado. Sube una imagen valida del pago.";
  return "";
}
