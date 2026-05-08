import { api } from "./api.js";
import { $, escapeHtml, setMessage } from "./dom.js";
import { money } from "./format.js";
import {
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
  "PAGO_EN_REVISION",
  "PAGO_RECHAZADO",
  "EN_PREPARACION",
  "LISTO_PARA_CONEXION",
  "EN_PROCESO",
  "FINALIZADO",
  "REQUIERE_ATENCION",
]);

const ITEM_STATUS = {
  ESPERANDO_PREPARACION: { label: "Pendiente", stage: "pending" },
  ESPERANDO_CLIENTE: { label: "Pendiente", stage: "pending" },
  LISTO_PARA_TECNICO: { label: "Esperando técnico", stage: "ready" },
  EN_PROCESO: { label: "En proceso", stage: "process" },
  FINALIZADO: { label: "Finalizado", stage: "done" },
  REQUIERE_REVISION: { label: "Revisión", stage: "warn" },
  CANCELADO: { label: "Cancelado", stage: "canceled" },
};

const ORDER_STATUS = {
  PAGO_EN_REVISION: { label: "Pago en revisión", stage: "review", detail: "Estamos revisando tu comprobante." },
  PAGO_RECHAZADO: { label: "Pago rechazado", stage: "review", detail: "Revisa el motivo y sube un nuevo comprobante." },
  EN_PREPARACION: { label: "Pago aprobado", stage: "approved", detail: "Prepara el equipo para el servicio." },
  LISTO_PARA_CONEXION: { label: "Pago aprobado", stage: "approved", detail: "Mantente disponible para el servicio." },
  EN_PROCESO: { label: "En proceso", stage: "process", detail: "Servicio en proceso. No desconectes el equipo." },
  REQUIERE_ATENCION: { label: "Requiere conexión", stage: "attention", detail: "Necesitamos que conectes el equipo o respondas el aviso." },
  FINALIZADO: { label: "Finalizado", stage: "done", detail: "Servicio finalizado. Descarga tu recibo abajo." },
};

const ORDER_FLAG_SVGS = {
  Peru: '<svg viewBox="0 0 28 28" width="28" height="28" aria-hidden="true"><circle cx="14" cy="14" r="14" fill="#D91023"/><rect x="9.33" y="0" width="9.34" height="28" fill="#FFFFFF"/></svg>',
  Mexico: '<svg viewBox="0 0 28 28" width="28" height="28" aria-hidden="true"><circle cx="14" cy="14" r="14" fill="#006847"/><rect x="9.33" y="0" width="9.34" height="28" fill="#FFFFFF"/><rect x="18.67" y="0" width="9.33" height="28" fill="#CE1126"/></svg>',
  Chile: '<svg viewBox="0 0 28 28" width="28" height="28" aria-hidden="true"><circle cx="14" cy="14" r="14" fill="#FFFFFF"/><rect x="0" y="14" width="28" height="14" fill="#D52B1E"/><rect x="0" y="0" width="14" height="14" fill="#0039A6"/></svg>',
  Colombia: '<svg viewBox="0 0 28 28" width="28" height="28" aria-hidden="true"><circle cx="14" cy="14" r="14" fill="#FCD116"/><path d="M0 14h28v7H0z" fill="#003893"/><path d="M0 21h28v7H0z" fill="#CE1126"/></svg>',
  Global: '<svg viewBox="0 0 28 28" width="28" height="28" aria-hidden="true"><circle cx="14" cy="14" r="14" fill="#26A17B"/><text x="14" y="19" text-anchor="middle" font-size="16" font-weight="700" fill="#FFFFFF" font-family="Arial,sans-serif">T</text></svg>',
};

function orderStatusFor(order) {
  return ORDER_STATUS[order?.publicStatus] || { label: order?.publicStatus || "Pedido recibido", stage: "review", detail: order?.nextAction || "Revisa el avance de tu pedido." };
}

function itemStatusFor(order, item) {
  if (order?.publicStatus === "PAGO_EN_REVISION") return { label: "En revisión", stage: "review" };
  if (order?.publicStatus === "PAGO_RECHAZADO") return { label: "Revisar pago", stage: "warn" };
  if (["EN_PREPARACION", "LISTO_PARA_CONEXION"].includes(order?.publicStatus) && ["ESPERANDO_PREPARACION", "ESPERANDO_CLIENTE", "LISTO_PARA_TECNICO"].includes(item?.status)) {
    return { label: "Pago aprobado", stage: "approved" };
  }
  if (order?.publicStatus === "REQUIERE_ATENCION" && ["ESPERANDO_PREPARACION", "ESPERANDO_CLIENTE"].includes(item?.status)) {
    return { label: "Requiere conexión", stage: "warn" };
  }
  return ITEM_STATUS[item?.status] || { label: item?.status || "Pendiente", stage: "pending" };
}

function itemsForOrder(order) {
  return [...(Array.isArray(order?.items) ? order.items : [])].sort((a, b) => Number(a.sequence || 0) - Number(b.sequence || 0));
}

function activeItemsForOrder(order) {
  return itemsForOrder(order).filter((item) => item.status !== "CANCELADO");
}

function paymentForOrder(order) {
  const methods = state.catalog?.paymentMethods || [];
  return methods.find((method) => method.code === order?.paymentMethod) || null;
}

function orderFlagHtml(order) {
  const country = String(paymentForOrder(order)?.country || "Global");
  return ORDER_FLAG_SVGS[country] || ORDER_FLAG_SVGS.Global;
}

function formatTime(value) {
  const timestamp = Date.parse(value || "");
  if (!Number.isFinite(timestamp)) return "";
  return new Date(timestamp).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
}

function formatOrderDate(order) {
  const value = order?.customerConnectedAt || order?.createdAt || order?.updatedAt || "";
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "";
  const date = new Date(timestamp);
  const now = new Date();
  const limaDay = (candidate) => candidate.toLocaleDateString("es-PE", { timeZone: "America/Lima" });
  const time = date.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", timeZone: "America/Lima" });
  if (limaDay(date) === limaDay(now)) return `Hoy · ${time}`;
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  if (limaDay(date) === limaDay(yesterday)) return `Ayer · ${time}`;
  const shortDate = date.toLocaleDateString("es-PE", { day: "2-digit", month: "short", timeZone: "America/Lima" });
  return `${shortDate} · ${time}`;
}

function formatOrderAmount(order) {
  return order?.priceFormatted || money(order?.totalPrice);
}

function pluralEquipos(count) {
  return `${count} equipo${Number(count) === 1 ? "" : "s"}`;
}

function orderSummaryText(order) {
  const items = itemsForOrder(order);
  const activeItems = activeItemsForOrder(order);
  const canceledCount = items.length - activeItems.length;
  const displayCount = activeItems.length || Number(order?.quantity || 0);
  const models = [...new Set(activeItems.map((item) => String(item.model || "").trim()).filter(Boolean))];
  const parts = [pluralEquipos(displayCount)];
  if (models.length === 1) parts.push(models[0]);
  if (models.length > 1) parts.push("Varios modelos");
  if (canceledCount > 0) parts.push(`${pluralEquipos(canceledCount)} cancelado${canceledCount === 1 ? "" : "s"}`);
  return parts.join(" · ");
}

function itemTitle(item) {
  return item?.shortCode || `Equipo ${item?.sequence || ""}`.trim();
}

function allProcessableItemsFinalized(order) {
  const activeItems = activeItemsForOrder(order);
  return activeItems.length > 0 && activeItems.every((item) => item.status === "FINALIZADO");
}

function canAbortOrder(order) {
  if (!order || ["CANCELADO", "FINALIZADO"].includes(order.publicStatus)) return false;
  return activeItemsForOrder(order).some((item) => item.status !== "FINALIZADO");
}

function itemSideHtml(item, status) {
  if (item.status === "FINALIZADO") {
    const doneTime = formatTime(item.doneAt);
    return `<span class="order-item-text" data-stage="${escapeHtml(status.stage)}">Finalizado${doneTime ? ` · ${escapeHtml(doneTime)}` : ""}</span>`;
  }
  return `<span class="order-item-text" data-stage="${escapeHtml(status.stage)}">${escapeHtml(status.label)}</span>`;
}

function itemRowsHtml(order) {
  const items = itemsForOrder(order);
  if (items.length <= 1) return "";
  return items.map((item) => {
    const status = itemStatusFor(order, item);
    return `
      <li class="order-equipment-row is-${escapeHtml(status.stage)}">
        <span class="order-equipment-marker" aria-hidden="true"></span>
        <strong class="order-equipment-title">${escapeHtml(itemTitle(item))}</strong>
        <div class="order-equipment-side">
          ${itemSideHtml(item, status)}
        </div>
      </li>
    `;
  }).join("");
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

function orderMenuHtml(order) {
  if (!canAbortOrder(order)) return "";
  return `
    <div class="order-menu-wrap">
      <button type="button" class="order-menu-button" data-order-menu-toggle aria-label="Opciones del pedido">⋮</button>
      <div class="order-menu" hidden>
        <button type="button" data-order-abort>Abortar pedido</button>
      </div>
    </div>
  `;
}

function renderOrderCard(order) {
  const card = document.createElement("article");
  const status = orderStatusFor(order);
  const receiptEnabled = allProcessableItemsFinalized(order);
  const receiptHref = `/api/portal/orders/${encodeURIComponent(order.id)}/comprobante.pdf`;
  const shortCode = order.shortCode || order.code || order.id;
  const rowsHtml = itemRowsHtml(order);
  card.className = `order-card order-card-v1 is-${status.stage}`;
  card.dataset.orderId = order.id;
  card.dataset.publicStatus = order.publicStatus || "";
  card.dataset.operatorStatus = order.operatorStatus || "";
  card.innerHTML = `
    <div class="order-card-head">
      <div class="order-card-identity">
        <span class="order-country-flag">${orderFlagHtml(order)}</span>
        <div class="order-card-titleblock">
          <strong class="order-code">${escapeHtml(shortCode)}</strong>
        </div>
      </div>
      <div class="order-card-status">
        <span class="order-status-pill is-${escapeHtml(status.stage)}">${escapeHtml(status.label)}</span>
        <time class="order-date">${escapeHtml(formatOrderDate(order))}</time>
      </div>
    </div>
    <p class="order-meta">${escapeHtml(orderSummaryText(order))}</p>
    <p class="order-next-action">${escapeHtml(order.nextAction || status.detail)}</p>
    ${priceDecisionHtml(order)}
    ${rowsHtml ? `<ul class="order-equipment-list">${rowsHtml}</ul>` : ""}
    <div class="order-card-actions order-card-actions-v1">
      <a
        class="order-receipt-button${receiptEnabled ? "" : " is-disabled"}"
        href="${escapeHtml(receiptHref)}"
        target="_blank"
        rel="noopener"
        aria-disabled="${receiptEnabled ? "false" : "true"}"
      >Recibo de operación</a>
      ${orderMenuHtml(order)}
    </div>
    <p class="message order-message" aria-live="polite"></p>
  `;
  wireOrderCard(card, order);
  return card;
}

function disableCardActions(card, disabled) {
  card.querySelectorAll("[data-order-abort]").forEach((node) => {
    node.disabled = disabled;
  });
}

function wireOrderCard(card, order) {
  const cardMessage = card.querySelector(".order-message");
  card.querySelectorAll("[data-order-item-ready]").forEach((button) => {
    button.addEventListener("click", async () => {
      const itemId = button.dataset.orderItemReady;
      const sequence = button.dataset.itemSequence || "";
      disableCardActions(card, true);
      setMessage(cardMessage, `Marcando equipo ${sequence} como listo...`);
      try {
        const payload = await api(`/api/portal/orders/${encodeURIComponent(order.id)}/items/${encodeURIComponent(itemId)}/ready`, {
          method: "POST",
        });
        if (payload?.customer) state.customer = payload.customer;
        customerUpdateHandler();
      } catch (error) {
        setMessage(cardMessage, error.message, "error");
        disableCardActions(card, false);
      }
    });
  });

  card.querySelectorAll("[data-order-item-cancel]").forEach((button) => {
    button.addEventListener("click", async () => {
      const itemId = button.dataset.orderItemCancel;
      const sequence = button.dataset.itemSequence || "";
      if (!window.confirm(`¿Cancelar el equipo ${sequence}? AriadGSM te contactará por WhatsApp para el reembolso manual.`)) return;
      disableCardActions(card, true);
      setMessage(cardMessage, `Cancelando equipo ${sequence}...`);
      try {
        const payload = await api(`/api/portal/orders/${encodeURIComponent(order.id)}/items/${encodeURIComponent(itemId)}/cancel`, {
          method: "POST",
          body: JSON.stringify({ reason: "CUSTOMER_ITEM_CANCEL" }),
        });
        if (payload?.customer) state.customer = payload.customer;
        customerUpdateHandler();
      } catch (error) {
        setMessage(cardMessage, error.message, "error");
        disableCardActions(card, false);
      }
    });
  });

  card.querySelector("[data-order-menu-toggle]")?.addEventListener("click", () => {
    const menu = card.querySelector(".order-menu");
    if (!menu) return;
    menu.hidden = !menu.hidden;
  });

  card.querySelector("[data-order-abort]")?.addEventListener("click", async () => {
    if (!window.confirm("¿Abortar este pedido? AriadGSM te contactará por WhatsApp para el reembolso manual. No es reversible.")) return;
    disableCardActions(card, true);
    setMessage(cardMessage, "Abortando pedido...");
    try {
      const payload = await api(`/api/portal/orders/${encodeURIComponent(order.id)}/abort`, {
        method: "POST",
        body: JSON.stringify({ reason: "CUSTOMER_ORDER_ABORT" }),
      });
      if (payload?.customer) state.customer = payload.customer;
      customerUpdateHandler();
    } catch (error) {
      setMessage(cardMessage, error.message, "error");
      disableCardActions(card, false);
    }
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
