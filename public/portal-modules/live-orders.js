import { api } from "./api.js";
import { $ } from "./dom.js";
import { renderOrders } from "./orders.js";
import { updateQuote } from "./payments.js";
import { state } from "./state.js";

export function setOrdersLiveStatus(text, type = "") {
  const node = $("#ordersLiveStatus");
  if (!node) return;
  node.textContent = text;
  node.dataset.type = type;
}

export async function refreshOrdersSilently() {
  if (!state.customer?.user || !state.customer?.client) return;
  const payload = await api("/api/portal/orders");
  state.customer.orders = payload.orders || [];
  updateQuote();
  renderOrders(state.customer.orders);
}

export function startFallbackPolling() {
  if (state.pollTimer || !state.customer?.user) return;
  const tick = async () => {
    try {
      await refreshOrdersSilently();
    } catch {
      stopFallbackPolling();
      setOrdersLiveStatus("Sin conexion", "error");
      return;
    }
    state.pollTimer = setTimeout(tick, 20000);
  };
  state.pollTimer = setTimeout(tick, 3000);
}

export function stopFallbackPolling() {
  if (state.pollTimer) clearTimeout(state.pollTimer);
  state.pollTimer = null;
}

export function startOrdersLive() {
  if (!state.customer?.user || !state.customer?.client || state.ordersStream) return;
  if (!window.EventSource) {
    setOrdersLiveStatus("Modo respaldo", "warn");
    startFallbackPolling();
    return;
  }
  setOrdersLiveStatus("Conectando", "warn");
  const stream = new EventSource("/api/portal/orders/events");
  state.ordersStream = stream;
  stream.onopen = () => {
    stopFallbackPolling();
    setOrdersLiveStatus("En vivo", "success");
  };
  stream.addEventListener("orders", (event) => {
    try {
      const payload = JSON.parse(event.data || "{}");
      state.customer.orders = payload.orders || [];
      updateQuote();
      renderOrders(state.customer.orders);
      setOrdersLiveStatus("En vivo", "success");
    } catch {
      setOrdersLiveStatus("Revisar conexion", "warn");
    }
  });
  stream.onerror = () => {
    setOrdersLiveStatus("Reconectando", "warn");
    startFallbackPolling();
  };
}

export function stopOrdersLive() {
  stopFallbackPolling();
  if (state.ordersStream) state.ordersStream.close();
  state.ordersStream = null;
  setOrdersLiveStatus("Desconectado", "");
}
