import { api } from "./api.js";
import { $, escapeHtml, setMessage } from "./dom.js";
import { money } from "./format.js";
import {
  compactOrderMeta,
  orderRequiresPriceDecision,
  sortOrdersForDisplay,
} from "./order-state.js";
import { state } from "./state.js";

let customerUpdateHandler = () => {};

export function configureOrderRenderer({ onCustomerUpdate } = {}) {
  customerUpdateHandler = typeof onCustomerUpdate === "function" ? onCustomerUpdate : () => {};
}

export function notifyCustomerUpdated() {
  customerUpdateHandler();
}

const VISIBLE_IN_MY_ORDERS = new Set([
  "LISTO_PARA_CONEXION",
  "EN_PROCESO",
  "FINALIZADO",
  "REQUIERE_ATENCION",
]);

const READY_ACTION_STATUSES = new Set(["ESPERANDO_PREPARACION", "ESPERANDO_CLIENTE"]);

const ORDER_STATUS = {
  LISTO_PARA_CONEXION: { label: "Conexión lista", stage: "ready" },
  EN_PROCESO: { label: "En proceso", stage: "process" },
  FINALIZADO: { label: "Finalizado", stage: "done" },
  REQUIERE_ATENCION: { label: "Requiere atención", stage: "warn" },
};

const ITEM_STATUS = {
  ESPERANDO_PREPARACION: { label: "Pendiente", stage: "pending" },
  ESPERANDO_CLIENTE: { label: "Pendiente", stage: "pending" },
  LISTO_PARA_TECNICO: { label: "Esperando técnico", stage: "ready" },
  EN_PROCESO: { label: "En proceso", stage: "process" },
  FINALIZADO: { label: "Finalizado", stage: "done" },
  REQUIERE_REVISION: { label: "Revisión", stage: "warn" },
  CANCELADO: { label: "Cancelado", stage: "warn" },
};

function orderStatusFor(order) {
  return ORDER_STATUS[order?.publicStatus] || { label: order?.publicStatus || "Orden", stage: "ready" };
}

function itemStatusFor(item) {
  return ITEM_STATUS[item?.status] || { label: item?.status || "Pendiente", stage: "pending" };
}

function formatOrderMeta(order) {
  return compactOrderMeta(order) || `${order.quantity || 0} equipo${Number(order.quantity) === 1 ? "" : "s"} - ${order.priceFormatted || money(order.totalPrice)}`;
}

function formatTime(value) {
  const timestamp = Date.parse(value || "");
  if (!Number.isFinite(timestamp)) return "";
  return new Date(timestamp).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
}

function itemDetail(item) {
  if (item.status === "FINALIZADO") {
    const parts = [];
    if (item.ardCode) parts.push(`Done ${item.ardCode}`);
    const doneTime = formatTime(item.doneAt);
    if (doneTime) parts.push(`Finalizado ${doneTime}`);
    if (item.finalLog) parts.push(item.finalLog);
    return parts.join(" - ") || "Servicio terminado.";
  }
  if (item.status === "EN_PROCESO") return "No desconectes este equipo.";
  if (item.status === "LISTO_PARA_TECNICO") return "En cola del técnico.";
  if (item.status === "REQUIERE_REVISION") return item.reviewReason || "AriadGSM debe revisar este equipo.";
  return "Conecta este equipo y avisa cuando esté listo.";
}

function itemTitle(item) {
  const model = String(item.model || "").trim();
  return `Equipo ${item.sequence}${model ? ` - ${model}` : ""}`;
}

function canMarkItemReady(order, item) {
  if (!VISIBLE_IN_MY_ORDERS.has(order?.publicStatus)) return false;
  return READY_ACTION_STATUSES.has(item?.status);
}

function allItemsFinalized(order) {
  const items = Array.isArray(order?.items) ? order.items : [];
  return items.length > 0 && items.every((item) => item.status === "FINALIZADO");
}

function priceDecisionHtml(order) {
  if (!orderRequiresPriceDecision(order)) return "";
  const locked = Number(order.priceLocked || 0).toFixed(2);
  const current = Number(order.currentUnitPrice || 0).toFixed(2);
  return `
    <div class="order-state-banner is-price-up" role="alert">
      <strong>El precio cambió.</strong>
      <span>Precio asegurado: <b>${escapeHtml(locked)} USDT</b> - ahora: <b>${escapeHtml(current)} USDT</b>.</span>
      <div class="price-decision-buttons">
        <button type="button" data-price-action="second_proof">Subir diferencia</button>
        <button type="button" data-price-action="wait">Esperar</button>
        <button type="button" class="danger" data-price-action="cancel">Cancelar</button>
      </div>
    </div>
  `;
}

function itemRowsHtml(order) {
  return (order.items || []).map((item) => {
    const status = itemStatusFor(item);
    const action = canMarkItemReady(order, item)
      ? `<button type="button" class="order-item-ready-button" data-order-item-ready="${escapeHtml(item.id)}" data-item-sequence="${escapeHtml(item.sequence)}">Equipo listo</button>`
      : "";
    return `
      <li class="order-equipment-row is-${escapeHtml(status.stage)}">
        <div class="order-equipment-main">
          <strong>${escapeHtml(itemTitle(item))}</strong>
          <span>${escapeHtml(itemDetail(item))}</span>
        </div>
        <div class="order-equipment-side">
          <span class="order-item-status" data-stage="${escapeHtml(status.stage)}">${escapeHtml(status.label)}</span>
          ${action}
        </div>
      </li>
    `;
  }).join("");
}

function renderOrderCard(order) {
  const card = document.createElement("article");
  const orderStatus = orderStatusFor(order);
  const receiptEnabled = allItemsFinalized(order);
  const receiptHref = `/api/portal/orders/${encodeURIComponent(order.id)}/comprobante.pdf?accessCode=${encodeURIComponent(order.accessCode || "")}`;
  card.className = "order-card order-card-v1";
  card.dataset.orderId = order.id;
  card.dataset.publicStatus = order.publicStatus || "";
  card.innerHTML = `
    <div class="order-card-head">
      <div>
        <strong class="order-code">${escapeHtml(order.code || order.id)}</strong>
        <span class="order-meta">${escapeHtml(formatOrderMeta(order))}</span>
      </div>
      <span class="status-pill" data-stage="${escapeHtml(orderStatus.stage)}">${escapeHtml(orderStatus.label)}</span>
    </div>
    ${priceDecisionHtml(order)}
    <ul class="order-equipment-list">
      ${itemRowsHtml(order)}
    </ul>
    <div class="order-card-actions order-card-actions-v1">
      <a
        class="order-receipt-button${receiptEnabled ? "" : " is-disabled"}"
        href="${escapeHtml(receiptHref)}"
        target="_blank"
        rel="noopener"
        aria-disabled="${receiptEnabled ? "false" : "true"}"
      >Recibo de operación</a>
    </div>
    <p class="message order-message" aria-live="polite"></p>
  `;
  wireOrderCard(card, order);
  return card;
}

function wireOrderCard(card, order) {
  const cardMessage = card.querySelector(".order-message");
  card.querySelectorAll("[data-order-item-ready]").forEach((button) => {
    button.addEventListener("click", async () => {
      const itemId = button.dataset.orderItemReady;
      const sequence = button.dataset.itemSequence || "";
      card.querySelectorAll("[data-order-item-ready]").forEach((node) => { node.disabled = true; });
      setMessage(cardMessage, `Marcando equipo ${sequence} como listo...`);
      try {
        const payload = await api(`/api/portal/orders/${encodeURIComponent(order.id)}/items/${encodeURIComponent(itemId)}/ready`, {
          method: "POST",
        });
        if (payload?.customer) state.customer = payload.customer;
        customerUpdateHandler();
      } catch (error) {
        setMessage(cardMessage, error.message, "error");
        card.querySelectorAll("[data-order-item-ready]").forEach((node) => { node.disabled = false; });
      }
    });
  });

  card.querySelectorAll("[data-price-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const action = button.dataset.priceAction;
      if (action === "cancel" && !window.confirm("¿Cancelar la orden? El reembolso se procesa manualmente.")) return;
      card.querySelectorAll("[data-price-action]").forEach((node) => { node.disabled = true; });
      setMessage(cardMessage, "Registrando decisión...");
      try {
        const payload = await api(`/api/portal/orders/${encodeURIComponent(order.id)}/price-decision`, {
          method: "POST",
          body: JSON.stringify({ action }),
        });
        if (payload?.customer) state.customer = payload.customer;
        customerUpdateHandler();
      } catch (error) {
        setMessage(cardMessage, error.message, "error");
        card.querySelectorAll("[data-price-action]").forEach((node) => { node.disabled = false; });
      }
    });
  });

  const receipt = card.querySelector(".order-receipt-button");
  if (receipt?.classList.contains("is-disabled")) {
    receipt.addEventListener("click", (event) => event.preventDefault());
  }
}

export function renderOrders(orders) {
  const list = $("#ordersList");
  list.innerHTML = "";
  const visible = (orders || []).filter((order) => VISIBLE_IN_MY_ORDERS.has(order.publicStatus));
  if (!visible.length) {
    const empty = document.createElement("div");
    empty.className = "orders-empty-state";
    empty.innerHTML = `
      <strong>Aún no tenés órdenes.</strong>
      <span>Tu primera orden aparecerá acá.</span>
    `;
    list.append(empty);
    return;
  }
  sortOrdersForDisplay(visible).forEach((order) => {
    list.append(renderOrderCard(order));
  });
}
