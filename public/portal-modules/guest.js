import { escapeHtml, setMessage } from "./dom.js";
import { estimatePortalPrice } from "./frp.js";
import { paymentAmountText, paymentOptionLabel } from "./payments.js";
import { filesToProofs } from "./proofs.js";
import { renderGuestClaimBanner } from "./guest-claim.js";
import { state } from "./state.js";

const GUEST_TOKEN_HEADER = "X-AriadGSM-Guest-Token";

function guestPanel() {
  return document.getElementById("guestPanel");
}

function guestCodeFromPath() {
  const match = location.pathname.match(/^\/pedido\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : "";
}

function guestTokenFromUrl() {
  return new URLSearchParams(location.search).get("t") || "";
}

async function guestApi(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(options.token ? { [GUEST_TOKEN_HEADER]: options.token } : {}),
      ...(options.headers || {}),
    },
    ...options,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || "No se pudo completar la accion.");
    error.status = response.status;
    throw error;
  }
  return payload;
}

function activePayment() {
  return (state.catalog?.paymentMethods || []).find((payment) => payment.active !== false) || null;
}

function paymentOptionsHtml() {
  const methods = (state.catalog?.paymentMethods || []).filter((payment) => payment.active !== false);
  return methods.map((payment) => (
    `<option value="${escapeHtml(payment.code)}">${escapeHtml(paymentOptionLabel(payment))}</option>`
  )).join("");
}

function quantityValue() {
  const raw = document.getElementById("guestQuantity")?.value || "1";
  return Math.max(1, Math.min(10, Number.parseInt(raw, 10) || 1));
}

function guestTotalText() {
  const paymentCode = document.getElementById("guestPaymentMethod")?.value;
  const payment = (state.catalog?.paymentMethods || []).find((item) => item.code === paymentCode) || activePayment();
  const estimate = estimatePortalPrice(quantityValue(), { isGuest: true });
  return paymentAmountText(estimate.total, payment);
}

function orderCode(order = state.guest?.order) {
  return order?.shortCode || order?.code || order?.id || "";
}

function renderGuestOrder(order) {
  const code = orderCode(order);
  const proofVisible = !["FINALIZADO", "CANCELADO"].includes(order?.publicStatus || "");
  return `
    <article class="guest-order-card">
      <p class="eyebrow">Seguimiento invitado</p>
      <h3>Tu codigo esta listo</h3>
      <strong class="guest-code">${escapeHtml(code)}</strong>
      <p>Guarda este codigo. Si pierdes el acceso, pidelo por WhatsApp.</p>
      <p>Estado: <b>${escapeHtml(order?.publicStatus || "ESPERANDO_PAGO")}</b></p>
      <div class="guest-order-actions">
        <a class="primary-btn" href="/downloads/usbredirector-customer-module.exe" download>Descargar Redirector</a>
        ${proofVisible ? '<button type="button" class="ghost" id="guestReplaceProof">Subir comprobante</button>' : ""}
        ${order?.publicStatus === "FINALIZADO" ? `<a class="ghost" href="/api/portal/guest/orders/${encodeURIComponent(code)}/comprobante.pdf" target="_blank" rel="noopener">Descargar recibo</a>` : ""}
      </div>
      <input id="guestProofInput" type="file" accept="image/*,.pdf,application/pdf" capture="environment" hidden />
      <p class="guest-message message" id="guestMessage" aria-live="polite"></p>
    </article>
  `;
}

function renderGuestForm() {
  return `
    <form class="guest-form" id="guestOrderForm">
      <label>WhatsApp
        <input name="whatsapp" type="tel" inputmode="tel" autocomplete="tel" placeholder="+51987654321" required />
      </label>
      <label>Equipos
        <input id="guestQuantity" name="quantity" type="number" inputmode="numeric" min="1" max="10" value="1" required />
      </label>
      <label>Metodo de pago
        <select id="guestPaymentMethod" name="paymentMethod" required>${paymentOptionsHtml()}</select>
      </label>
      <div class="guest-proof-row">
        <label>Comprobante
          <input id="guestCreateProofInput" type="file" accept="image/*,.pdf,application/pdf" capture="environment" />
        </label>
      </div>
      <div class="guest-total-card">
        <span>Total estimado</span>
        <strong id="guestTotal">${escapeHtml(guestTotalText())}</strong>
      </div>
      <button type="submit">Pagar y crear codigo</button>
    </form>
    <p class="guest-message message" id="guestMessage" aria-live="polite"></p>
  `;
}

export function renderGuest() {
  const panel = guestPanel();
  if (!panel) return;
  renderGuestClaimBanner();
  const logged = Boolean(state.customer?.user && state.customer?.client);
  const enabled = Boolean(state.guest?.enabled);
  panel.classList.toggle("hidden", logged || !enabled);
  if (logged || !enabled) return;
  panel.innerHTML = `
    <div class="guest-card">
      <div class="guest-card-head">
        <div>
          <p class="eyebrow">FRP Express sin cuenta</p>
          <h2>Procesa tu Xiaomi con WhatsApp y comprobante.</h2>
        </div>
      </div>
      <div class="guest-account-banner">
        <span>Quieres guardar tu historial? Crea cuenta.</span>
        <button type="button" class="ghost" id="guestCreateAccount">Crear cuenta</button>
      </div>
      ${state.guest.order ? renderGuestOrder(state.guest.order) : renderGuestForm()}
    </div>
  `;
  updateGuestTotal();
}

export async function loadGuestState() {
  try {
    const payload = await guestApi("/api/portal/guest/state");
    state.guest = { ...(state.guest || {}), enabled: true };
    if (payload.catalog) state.catalog = payload.catalog;
  } catch (error) {
    if (error.status === 404) {
      state.guest = { enabled: false };
      renderGuest();
      return;
    }
    throw error;
  }
  const code = guestCodeFromPath();
  const token = guestTokenFromUrl();
  if (code) {
    await loadGuestOrder(code, token);
    if (token) history.replaceState({}, "", `/pedido/${encodeURIComponent(code)}`);
  }
  renderGuest();
}

async function loadGuestOrder(code, token = state.guest?.token || "") {
  const query = token ? `?t=${encodeURIComponent(token)}` : "";
  const payload = await guestApi(`/api/portal/guest/orders/${encodeURIComponent(code)}${query}`, { token });
  state.guest = { ...(state.guest || {}), enabled: true, order: payload.order, recoveryLink: payload.recoveryLink || "", token };
  startGuestEvents();
  return payload.order;
}

function updateGuestTotal() {
  const total = document.getElementById("guestTotal");
  if (total) total.textContent = guestTotalText();
}

async function submitGuestOrder(form) {
  const message = document.getElementById("guestMessage");
  setMessage(message, "");
  const data = Object.fromEntries(new FormData(form));
  const fileInput = document.getElementById("guestCreateProofInput");
  const proofs = fileInput?.files?.length ? await filesToProofs(fileInput.files) : [];
  const payload = await guestApi("/api/portal/guest/orders", {
    method: "POST",
    body: JSON.stringify({ ...data, quantity: quantityValue(), paymentProofs: proofs }),
  });
  state.guest = { ...(state.guest || {}), enabled: true, order: payload.order, recoveryLink: payload.recoveryLink || "" };
  renderGuest();
  startGuestEvents();
}

async function uploadGuestProof(files) {
  const order = state.guest?.order;
  if (!order || !files?.length) return;
  const proofs = await filesToProofs(files);
  const payload = await guestApi(`/api/portal/guest/orders/${encodeURIComponent(orderCode(order))}/payment-proof`, {
    method: "PATCH",
    token: state.guest?.token || "",
    body: JSON.stringify({ paymentProofs: proofs }),
  });
  state.guest.order = payload.order;
  renderGuest();
}

function startGuestEvents() {
  const order = state.guest?.order;
  if (!order || !window.EventSource) return;
  if (state.guest.events) state.guest.events.close();
  const source = new EventSource(`/api/portal/guest/orders/${encodeURIComponent(orderCode(order))}/events`);
  source.addEventListener("orders", (event) => {
    const payload = JSON.parse(event.data || "{}");
    if (payload.order) {
      state.guest.order = payload.order;
      renderGuest();
    }
  });
  source.onerror = () => {};
  state.guest.events = source;
}

export function wireGuestEvents() {
  document.addEventListener("input", (event) => {
    if (event.target?.id === "guestQuantity") updateGuestTotal();
  });
  document.addEventListener("change", (event) => {
    if (event.target?.id === "guestPaymentMethod") updateGuestTotal();
    if (event.target?.id === "guestProofInput") {
      uploadGuestProof(event.target.files).catch((error) => setMessage(document.getElementById("guestMessage"), error.message, "error"));
    }
  });
  document.addEventListener("submit", (event) => {
    if (event.target?.id !== "guestOrderForm") return;
    event.preventDefault();
    submitGuestOrder(event.target).catch((error) => setMessage(document.getElementById("guestMessage"), error.message, "error"));
  });
  document.addEventListener("click", (event) => {
    if (event.target?.id === "guestCreateAccount") {
      document.querySelector("[data-tab='register']")?.click();
      document.getElementById("accessPanel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    if (event.target?.id === "guestReplaceProof") document.getElementById("guestProofInput")?.click();
  });
}
