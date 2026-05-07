import { $, $$, setMessage } from "./dom.js";
// PR-2a-final.2: customerCanRequestApprovalOptions removido — UI eliminada.
import { normalizeForMatch } from "./format.js";
import { startOrdersLive, stopOrdersLive } from "./live-orders.js";
import { renderOrders } from "./orders.js";
import {
  renderPaymentPills,
  updateQuote,
} from "./payments.js";
import { startTechnicianPolling, stopTechnicianPolling } from "./technician.js";
import { deriveFlowState } from "./flow-state.js";
import { setQuantity } from "./frp.js";
import { resetPaso2InactivityTimer } from "./paso2-timer.js";
import { state } from "./state.js";

// Sub-commit 15c.1: renderStaticStepGuide eliminado (vivía sobre #stepGuide
// que era el contenedor del Panel 4 viejo). El Panel 4 nuevo tiene su propio
// HTML estático en portal.html y se rellena dinámicamente vía updatePanel4()
// desde panel-4-connection.js.

export function setTab(tab) {
  state.activeTab = tab;
  $$(".tab").forEach((button) => button.classList.toggle("active", button.dataset.tab === tab));
  $$(".auth-form").forEach((form) => form.classList.remove("active"));
  $(`#${tab}Form`)?.classList.add("active");
  setMessage($("#authMessage"), "");
}

export function customerEmailVerified() {
  return Boolean(state.customer?.client?.emailVerified);
}

export function nameHasCountry(value) {
  const normalized = ` ${normalizeForMatch(value)} `;
  return (state.catalog?.countries || [])
    .filter((country) => country !== "USDT")
    .some((country) => normalized.includes(` ${normalizeForMatch(country)} `));
}

export function validateRegisterName(value) {
  const name = String(value || "").trim().replace(/\s+/g, " ");
  if (!name) return { ok: false, error: "Escribe tu nombre y apellido." };
  if (name.length < 5 || name.length > 90) return { ok: false, error: "Nombre y apellido deben tener entre 5 y 90 caracteres." };
  if (/@|https?:\/\/|www\./i.test(name)) return { ok: false, error: "No escribas correo o enlaces en el nombre." };
  if (/\d/.test(name) || /\+?\d[\d\s().-]{5,}\d/.test(name)) return { ok: false, error: "No escribas telefono ni numeros en el nombre." };
  if (!/^[\p{L}\p{M}][\p{L}\p{M}'’ -]*[\p{L}\p{M}]$/u.test(name)) {
    return { ok: false, error: "Usa solo letras, espacios, acentos, guiones o apostrofes en el nombre." };
  }
  const connectorWords = new Set(["de", "del", "la", "las", "los", "y", "da", "do", "dos"]);
  const significantWords = name
    .split(/\s+/)
    .map((word) => normalizeForMatch(word.replace(/['’-]/g, "")))
    .filter((word) => word.length >= 2 && !connectorWords.has(word));
  if (significantWords.length < 2) return { ok: false, error: "Escribe al menos nombre y apellido." };
  if (nameHasCountry(name)) return { ok: false, error: "No agregues el pais dentro del nombre." };
  return { ok: true, name };
}

export function phoneCountryEntries() {
  return (state.catalog?.phoneCountries || [])
    .flatMap((item) => (item.callingPrefixes || []).map((prefix) => ({ country: item.country, prefix })))
    .sort((a, b) => b.prefix.length - a.prefix.length);
}

export function normalizeWhatsappInput(value) {
  const raw = String(value || "").trim();
  const normalized = raw.replace(/[^\d+]/g, "");
  if (!normalized) return { ok: false, error: "Escribe tu WhatsApp con codigo internacional." };
  if (!normalized.startsWith("+")) return { ok: false, error: "WhatsApp debe iniciar con + y codigo de pais." };
  if (!/^\+[1-9]\d{6,14}$/.test(normalized)) return { ok: false, error: "WhatsApp debe tener formato internacional. Ejemplo: +573001234567." };
  return { ok: true, phone: normalized };
}

export function detectCountryFromWhatsapp(value) {
  const normalized = normalizeWhatsappInput(value);
  if (!normalized.ok) return null;
  const digits = normalized.phone.slice(1);
  return phoneCountryEntries().find((entry) => digits.startsWith(entry.prefix)) || null;
}

export function updatePhoneCountryFromInput() {
  const input = $("#registerForm input[name='whatsapp']");
  const countrySelect = $("#countrySelect");
  const hint = $("#phoneCountryHint");
  if (!input || !countrySelect || !hint) return;
  const detected = detectCountryFromWhatsapp(input.value);
  if (detected?.country && Array.from(countrySelect.options).some((option) => option.value === detected.country)) {
    countrySelect.value = detected.country;
    hint.textContent = `Pais detectado por WhatsApp: ${detected.country}.`;
    hint.dataset.type = "success";
    return;
  }
  hint.textContent = "Escribe el numero con + y codigo internacional.";
  hint.dataset.type = input.value.trim() ? "warn" : "";
}

export function ensureTurnstileScript() {
  if (!state.catalog?.turnstileEnabled || !state.catalog?.turnstileSiteKey) return Promise.resolve(false);
  if (window.turnstile) return Promise.resolve(true);
  if (state.turnstileReady) return state.turnstileReady;
  state.turnstileReady = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(true);
    script.onerror = () => reject(new Error("No se pudo cargar la validacion anti-spam."));
    document.head.append(script);
  });
  return state.turnstileReady;
}

export async function renderTurnstileWidgets() {
  if (!state.catalog?.turnstileEnabled || !state.catalog?.turnstileSiteKey) {
    $$(".turnstile-box").forEach((box) => box.classList.remove("active"));
    return;
  }
  await ensureTurnstileScript();
  $$(".turnstile-box").forEach((box) => {
    box.classList.add("active");
    if (box.dataset.widgetId) return;
    const widgetId = window.turnstile.render(box, {
      sitekey: state.catalog.turnstileSiteKey,
      callback: (token) => { box.dataset.token = token; },
      "expired-callback": () => { box.dataset.token = ""; },
      "error-callback": () => { box.dataset.token = ""; },
    });
    box.dataset.widgetId = widgetId;
  });
}

export function turnstileToken(name) {
  if (!state.catalog?.turnstileEnabled) return "";
  return $(`[data-turnstile-widget="${name}"]`)?.dataset.token || "";
}

export function resetTurnstile(name) {
  const box = $(`[data-turnstile-widget="${name}"]`);
  if (!box?.dataset.widgetId || !window.turnstile) return;
  box.dataset.token = "";
  window.turnstile.reset(box.dataset.widgetId);
}

export function renderCatalog() {
  const countries = (state.catalog?.countries || []).filter((country) => country !== "USDT");
  const countrySelect = $("#countrySelect");
  if (countrySelect && !countrySelect.options.length) {
    countries.forEach((country) => {
      const option = document.createElement("option");
      option.value = country;
      option.textContent = country;
      countrySelect.append(option);
    });
  }
  updatePhoneCountryFromInput();
  // PR-2a-final.fase3: paso 1 al spec FINAL §4 — 5 pills con flags SVG en
  // lugar de <select>. paymentSelect queda como hidden input para preservar
  // el form data; el valor se setea cuando el cliente clickea una pill.
  renderPaymentPills();
  updateQuote();
  renderTurnstileWidgets().catch((error) => setMessage($("#authMessage"), error.message, "error"));
}

export function renderCustomer() {
  const customer = state.customer;
  const logged = Boolean(customer?.user && customer?.client);
  document.querySelector(".brand-panel")?.classList.toggle("hidden", logged);
  $("#accessPanel").classList.toggle("hidden", logged);
  $("#appPanel").classList.toggle("hidden", !logged);
  if (!logged) {
    stopOrdersLive();
    stopTechnicianPolling();
    return;
  }
  $("#clientTitle").textContent = `${customer.client.name}`;
  $("#clientStatus").textContent = customer.client.emailVerified ? "Correo verificado" : "Correo pendiente";
  $("#monthlyUsage").textContent = String(customer.monthlyUsage || 0);
  $("#deviceStatus").textContent = customer.device?.authorizedForBenefits ? "Autorizado" : "Sin beneficios";
  $("#verificationCard").classList.toggle("hidden", customer.client.emailVerified);
  // PR-2a.4: banner deuda VIP pendiente del cierre anterior. Bloquea creacion
  // de nuevas ordenes desde el backend (POST /api/portal/orders/frp → 403).
  const debtBanner = $("#vipDebtBanner");
  const debt = Number(customer.pendingDebtUsdt || 0);
  if (debtBanner) {
    debtBanner.hidden = debt <= 0;
    const amountNode = $("#vipDebtAmount");
    if (amountNode) amountNode.textContent = debt.toFixed(2);
  }
  applyFlowState(customer);
  // Sub-commit 15b.2: el render de la dropzone del panel 3 se hace dentro de
  // updatePanel3() (llamado desde updateQuote en applyFlowState → renderCustomer).
  // PR-2a-final.bundle2 item 2: arrancar/refrescar el timer de inactividad
  // paso 2. Auto-stop interno cuando hay orden in-flight (paso 3+).
  resetPaso2InactivityTimer();
  // Sub-commit 15c.1: el banner "¿Listo para conectar?" 2 min post-aprobación
  // (paso4-timer.js) fue eliminado. Sustituido por el sistema de 3 fases / 5
  // min implementado en sesiones 15a/15b dentro del Panel 3.
  renderOrders(customer.orders || []);
  startOrdersLive();
  startTechnicianPolling(() => {
    renderOrders(state.customer?.orders || []);
    updateQuote();
  });
}

// QUE: aplica el flujo (CTA paso 4, lock 1-3, aviso preventivo, transition reset) en cada
// renderCustomer. Centraliza aqui la reaccion a deriveFlowState para que un solo
// punto del codigo decida que ve el cliente segun la fase.
function applyFlowState(customer) {
  const flowState = deriveFlowState(customer);
  const previous = state.lastFlowState || "draft";

  // Transition non-draft a draft: orden cerrada o cancelada; ahora podemos limpiar el form.
  if (previous !== "draft" && flowState === "draft") {
    document.querySelector("#orderForm")?.reset();
  }
  // Compatibilidad con sesiones antiguas: si algun cliente tenia el estado viejo
  // awaiting_connection en memoria, al pasar a connected limpiamos el borrador.
  if (previous === "awaiting_connection" && flowState === "connected") {
    resetPostConnectionDraftControls();
  }
  if (previous === "in_review" && flowState === "connected") {
    resetPostConnectionDraftControls();
  }
  state.lastFlowState = flowState;

  applyStepLocks(flowState);
  // Corte 5: Paso 4 queda como guia de preparacion. Ya no hay accion visible
  // "Equipo conectado" que bloquee paneles 1-3.
}

function applyStepLocks(flowState) {
  // Sub-commit 15b.2-ter Bug C: estado "rejected" desbloquea paneles 1-2-3.
  // Spec panel-3 §3 edge 11: "Paneles 1-2-3 se vuelven a congelar [cuando el
  // nuevo comprobante entra a uploading]" → durante el rechazo NO están
  // congelados, el cliente puede cambiar pill/cantidad antes de re-subir.
  const lockPanels12 = ["awaiting_proof", "in_review"].includes(flowState);
  const lockPanel3 = false;
  // Sub-commit 15a.1: selectores actualizados a paneles nuevos. Paneles 1-2-3
  // se congelan cuando hay orden in-flight (mismo comportamiento que antes —
  // mecánica congelar/descongelar de la spec pantalla-principal-cliente.md
  // v1.1 § "Concepto clave"). Panel 4 NO se congela (decisión spec v1.0 §1
  // contexto: "a diferencia de paneles 1-2-3, NO se congela").
  document.querySelector(".panel-1")?.classList.toggle("step-locked", lockPanels12);
  document.querySelector(".panel-2")?.classList.toggle("step-locked", lockPanels12);
  // Panel 3 no se bloquea durante PAGO_EN_REVISION: debe permitir Reemplazar
  // comprobante sin desbloquear metodo/cantidad.
  document.querySelector(".panel-3")?.classList.toggle("step-locked", lockPanel3);
}

function resetPostConnectionDraftControls() {
  setQuantity(1);
  const modelInput = $("#panel2ModelInput");
  if (modelInput) {
    modelInput.value = "";
    modelInput.dataset.eligibilityState = "";
  }
  state.activePaymentOrderId = "";
}

// Sub-commit 15c.1: applyStep4Visibility eliminada. El Panel 4 nuevo es
// SIEMPRE visible (como cualquier otro panel del .panels-row) y muestra
// distinto contenido según data-state. La transición a estado "validado"
// que antes activaba el panel ahora se traduce en data-state="3".
