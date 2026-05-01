import { api } from "./api.js";
import { connectionGuideText, operationCode, redirectorMiniGuideMarkup } from "./connection.js";
import { $, copyText, escapeHtml, setMessage } from "./dom.js";
import { money } from "./format.js";
import {
  compactOrderMeta,
  customerNextAction,
  itemStatusLabel,
  orderAlertText,
  orderBadges,
  orderHasPaymentProof,
  sortOrdersForDisplay,
  statusLabel,
  trackingStage,
  trackingStageLabel,
} from "./order-state.js";
import { state } from "./state.js";

let customerUpdateHandler = () => {};

export function configureOrderRenderer({ onCustomerUpdate } = {}) {
  customerUpdateHandler = typeof onCustomerUpdate === "function" ? onCustomerUpdate : () => {};
}

export function orderCopyText(order) {
  return [
    `Pedido ${order.code}`,
    `${order.serviceName}`,
    `Equipos: ${order.quantity}`,
    `Total: ${order.priceFormatted || money(order.totalPrice)}`,
    `Estado: ${statusLabel(order.publicStatus)}`,
    `Proxima accion: ${customerNextAction(order)}`,
    `Seguimiento: ${location.origin}/cliente?orden=${encodeURIComponent(order.code)}&codigo=${encodeURIComponent(order.accessCode || "")}`,
  ].join("\n");
}

export function orderDoneText(order) {
  const doneItems = (order?.items || []).filter((item) => item.ardCode || item.finalLog);
  const lines = [
    `${order.priceFormatted || money(order.totalPrice)} - Done`,
    ...doneItems.map((item) => item.ardCode || operationCode(order, item)),
    "",
    order.serviceName || "Xiaomi FRP Express",
    ...doneItems.map((item) => item.finalLog).filter(Boolean),
  ];
  return lines.filter((line, index) => line || lines[index - 1]).join("\n").trim();
}

export function trackingMarkup(order) {
  const stage = trackingStage(order);
  const steps = [
    { code: "RECEIVED", label: "Pedido recibido" },
    { code: "PROCESS", label: "En proceso" },
    { code: "DONE", label: "Done" },
  ];
  const activeIndex = steps.findIndex((step) => step.code === stage);
  return `
    <strong>Seguimiento</strong>
    <div class="tracking-steps" aria-label="Estado principal del pedido">
      ${steps.map((step, index) => `
        <span class="tracking-step ${index < activeIndex ? "done" : ""} ${index === activeIndex ? "active" : ""}">
          ${escapeHtml(step.label)}
        </span>
      `).join("")}
    </div>
  `;
}

export function renderOrders(orders) {
  const list = $("#ordersList");
  list.innerHTML = "";
  if (!orders.length) {
    const empty = document.createElement("p");
    empty.className = "message";
    empty.textContent = "Todavia no tienes ordenes.";
    list.append(empty);
    return;
  }
  const template = $("#orderTemplate");
  sortOrdersForDisplay(orders).forEach((order) => {
    const card = template.content.firstElementChild.cloneNode(true);
    const stage = trackingStage(order);
    card.classList.toggle("is-finalized", stage === "DONE");
    $(".order-code", card).textContent = order.code;
    $(".order-service", card).textContent = order.serviceName;
    $(".status-pill", card).textContent = trackingStageLabel(order);
    $(".status-pill", card).dataset.stage = stage.toLowerCase();
    $(".order-meta", card).textContent = compactOrderMeta(order);
    const inCompatibilityReview = order.publicStatus === "REVISION_COMPATIBILIDAD";
    $(".tracking-panel", card).innerHTML = trackingMarkup(order);
    const alertText = orderAlertText(order);
    const alertNode = $(".order-alert", card);
    alertNode.classList.toggle("hidden", !alertText);
    alertNode.textContent = alertText;
    $(".next-action", card).innerHTML = [
      `<strong>Proxima accion</strong>`,
      `<span>${escapeHtml(customerNextAction(order))}</span>`,
      orderBadges(order).length ? `<div class="order-badges">${orderBadges(order).map((badge) => `<em>${escapeHtml(badge)}</em>`).join("")}</div>` : "",
    ].join("");
    $(".payment-block", card).innerHTML = [
      "<strong>Pago</strong>",
      inCompatibilityReview
        ? "<span>En revision de compatibilidad.</span>"
        : `<span>${escapeHtml(orderHasPaymentProof(order) ? "Comprobante recibido." : "Pendiente en paso 3.")}</span>`,
    ].join("");
    $(".item-list", card).innerHTML = (order.items || []).map((item) => {
      const detail = [item.model, item.imei].filter(Boolean).join(" / ") || "Equipo sin detalle";
      const done = item.ardCode ? ` - ${item.ardCode}` : "";
      const message = item.eligibilityMessage || item.reviewReason || "";
      const reason = message ? `<br><small class="danger-text">${escapeHtml(message)}</small>` : "";
      return `<div class="item-row">#${item.sequence} ${escapeHtml(detail)}<br><small>${escapeHtml(itemStatusLabel(item.status))}${escapeHtml(done)}</small>${reason}</div>`;
    }).join("");
    const connectionCodes = (order.items || []).map((item) => `
      <div class="connection-code-row">
        <span>#${item.sequence} ${escapeHtml(item.model || item.raw || "Equipo")}</span>
        <code>${escapeHtml(operationCode(order, item))}</code>
      </div>
    `).join("");
    $(".connection-block", card).innerHTML = `
      <strong>Preparacion de conexion</strong>
      <span>Mira la guia: Next, DDNS, codigo y Connect.</span>
      ${redirectorMiniGuideMarkup(order)}
      <div class="connection-codes">${connectionCodes || `<div class="connection-code-row"><span>Equipo</span><code>${escapeHtml(operationCode(order))}</code></div>`}</div>
    `;
    const loggedCustomer = Boolean(state.customer?.user && state.customer?.client);
    const connectionReadyButton = $(".connection-ready", card);
    const copyConnectionButton = $(".copy-connection", card);
    const copyOrderButton = $(".copy-order", card);
    const details = $(".order-details", card);
    const detailsToggle = $(".details-toggle", card);
    const primary = $(".order-primary", card);
    const canPrepareConnection = (order.paymentProofs || []).length > 0
      || order.postpayStatus === "APROBADO"
      || ["PAGO_EN_REVISION", "EN_PREPARACION", "LISTO_PARA_CONEXION", "EN_PROCESO"].includes(order.publicStatus);
    connectionReadyButton.disabled = !loggedCustomer || Boolean(order.customerConnectionReadyAt) || !canPrepareConnection;
    connectionReadyButton.textContent = order.customerConnectionReadyAt ? "Conexion marcada" : "Estoy listo para conectar";
    connectionReadyButton.style.display = loggedCustomer && canPrepareConnection && !order.customerConnectionReadyAt ? "" : "none";
    copyConnectionButton.style.display = loggedCustomer && (canPrepareConnection || stage === "DONE") ? "" : "none";
    copyOrderButton.textContent = stage === "DONE" ? "Copiar Done" : "Copiar datos";
    const openDetails = () => {
      const isOpen = details.classList.toggle("hidden") === false;
      detailsToggle.textContent = isOpen ? "Ocultar detalles" : "Ver detalles";
      detailsToggle.setAttribute("aria-expanded", String(isOpen));
    };
    detailsToggle.addEventListener("click", openDetails);
    const detailsPrimaryButton = document.createElement("button");
    detailsPrimaryButton.type = "button";
    detailsPrimaryButton.className = "order-primary-button";
    detailsPrimaryButton.textContent = alertText ? "Ver indicacion" : "Ver detalles";
    detailsPrimaryButton.addEventListener("click", openDetails);
    const setPrimaryAction = (element) => {
      if (!element) return;
      element.classList.add("order-primary-button");
      primary.append(element);
    };
    if (stage === "DONE") {
      setPrimaryAction(copyOrderButton);
    } else if (inCompatibilityReview || order.publicStatus === "REQUIERE_ATENCION") {
      setPrimaryAction(detailsPrimaryButton);
    } else if (connectionReadyButton.style.display !== "none") {
      setPrimaryAction(connectionReadyButton);
    } else if (copyConnectionButton.style.display !== "none") {
      setPrimaryAction(copyConnectionButton);
    } else {
      setPrimaryAction(detailsPrimaryButton);
    }
    connectionReadyButton.addEventListener("click", async () => {
      const message = $(".order-message", card);
      setMessage(message, "Marcando conexion lista...");
      try {
        const payload = await api(`/api/portal/orders/${order.id}/connection-ready`, {
          method: "PATCH",
          body: "{}",
        });
        state.customer = payload.customer;
        setMessage(message, "Conexion marcada como lista.", "success");
        customerUpdateHandler();
      } catch (error) {
        setMessage(message, error.message, "error");
      }
    });
    copyConnectionButton.addEventListener("click", () => copyText(connectionGuideText(order), $(".order-message", card)));
    copyOrderButton.addEventListener("click", () => copyText(stage === "DONE" ? orderDoneText(order) : orderCopyText(order), $(".order-message", card)));
    list.append(card);
  });
}
