import { api } from "./api.js";
import { renderCustomer, setTab } from "./auth-forms.js";
import { $, setMessage } from "./dom.js";
import { renderOrders } from "./orders.js";
import { loadSession } from "./session.js";
import { state } from "./state.js";

export function renderTrackedOrder(order) {
  state.customer = null;
  renderCustomer();
  const list = document.createElement("div");
  list.className = "orders-list";
  const tempCustomer = { orders: [order] };
  $("#appPanel").classList.remove("hidden");
  $("#accessPanel").classList.remove("hidden");
  $("#clientTitle").textContent = "Consulta de pedido";
  $("#clientStatus").textContent = "Consulta";
  $("#monthlyUsage").textContent = "-";
  $("#deviceStatus").textContent = "-";
  renderOrders(tempCustomer.orders);
  setMessage($("#authMessage"), "Orden encontrada.", "success");
}

export function applyQueryTracking() {
  const params = new URLSearchParams(location.search);
  const code = params.get("orden");
  const accessCode = params.get("codigo");
  if (!code || !accessCode) return;
  if (state.customer?.user && state.customer?.client) {
    setMessage($("#orderMessage"), "Ya tienes sesion activa. Revisa el avance desde Mis órdenes.", "success");
    return;
  }
  setTab("track");
  $("#trackForm input[name='code']").value = code;
  $("#trackForm input[name='accessCode']").value = accessCode;
}

export async function applyEmailVerification() {
  const params = new URLSearchParams(location.search);
  const token = params.get("verifyEmail");
  if (!token) return;
  try {
    const payload = await api("/api/portal/verify-email", {
      method: "POST",
      body: JSON.stringify({ token }),
    });
    setMessage($("#authMessage"), payload.message || "Correo verificado.", "success");
    history.replaceState({}, "", location.pathname);
    await loadSession();
  } catch (error) {
    setMessage($("#authMessage"), error.message, "error");
  }
}
