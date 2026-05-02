import { $, $$, setMessage } from "./dom.js";
import { customerCanRequestApprovalOptions } from "./frp.js";
import { normalizeForMatch } from "./format.js";
import { startOrdersLive, stopOrdersLive } from "./live-orders.js";
import { renderOrders } from "./orders.js";
import {
  compatiblePaymentMethodsForCustomer,
  paymentOptionLabel,
  preferredPaymentForCustomer,
  updateFlowPaymentDropzone,
  updateQuote,
} from "./payments.js";
import { stepGuideMarkup } from "./connection.js";
import { startTechnicianPolling, stopTechnicianPolling, wireCopyButtonsWithin } from "./technician.js";
import { deriveFlowState } from "./flow-state.js";
import { state } from "./state.js";

export function renderStaticStepGuide() {
  const container = document.querySelector("#stepGuide");
  if (!container) return;
  container.innerHTML = stepGuideMarkup({
    order: null,
    technicianState: state.activeTechnician,
    customerName: state.customer?.client?.name || "",
    customerModuleUrl: state.catalog?.customerModuleUrl || state.customerModuleUrl || "",
  });
  wireCopyButtonsWithin(container);
}

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
  const paymentSelect = $("#paymentSelect");
  if (paymentSelect) {
    const previousValue = paymentSelect.value;
    const compatiblePayments = compatiblePaymentMethodsForCustomer();
    paymentSelect.innerHTML = "";
    compatiblePayments.forEach((payment) => {
      const option = document.createElement("option");
      option.value = payment.code;
      option.textContent = paymentOptionLabel(payment);
      paymentSelect.append(option);
    });
    const previousOption = Array.from(paymentSelect.options).find((option) => option.value === previousValue);
    const preferred = preferredPaymentForCustomer();
    if (previousOption) {
      paymentSelect.value = previousValue;
    } else if (preferred) {
      paymentSelect.value = preferred.code;
    }
  }
  updateQuote();
  renderTurnstileWidgets().catch((error) => setMessage($("#authMessage"), error.message, "error"));
}

export function renderCustomer() {
  const customer = state.customer;
  const logged = Boolean(customer?.user && customer?.client);
  $("#accessPanel").classList.toggle("hidden", logged);
  $("#appPanel").classList.toggle("hidden", !logged);
  if (!logged) {
    stopOrdersLive();
    stopTechnicianPolling();
    renderStaticStepGuide();
    return;
  }
  $("#clientTitle").textContent = `${customer.client.name}`;
  $("#clientStatus").textContent = customer.client.emailVerified ? "Correo verificado" : "Correo pendiente";
  $("#monthlyUsage").textContent = String(customer.monthlyUsage || 0);
  $("#deviceStatus").textContent = customer.device?.authorizedForBenefits ? "Autorizado" : "Sin beneficios";
  $("#verificationCard").classList.toggle("hidden", customer.client.emailVerified);
  $("#copyPaymentButton").disabled = !customer.client.emailVerified;
  const canRequestApproval = customerCanRequestApprovalOptions();
  $("#approvalOptions")?.classList.toggle("hidden", !canRequestApproval);
  if (!canRequestApproval) {
    $$("#approvalOptions input[type='checkbox']").forEach((input) => { input.checked = false; });
  }
  applyFlowState(customer);
  updateFlowPaymentDropzone();
  renderOrders(customer.orders || []);
  startOrdersLive();
  renderStaticStepGuide();
  startTechnicianPolling(() => {
    renderStaticStepGuide();
    renderOrders(state.customer?.orders || []);
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
  state.lastFlowState = flowState;

  renderFlowCta(flowState);
  applyStepLocks(flowState);
  toggleProofWarning(flowState);
  applyStep4Visibility(customer);
}

// QUE: pinta el CTA del paso 4 (boton "Equipo conectado") cuando el cliente entra
// al paso 4 con orden en preparacion/lista. En estados previos no hay CTA — el
// dropzone del paso 3 es la unica accion pendiente, y el paso 4 mismo esta oculto
// (ver applyStep4Visibility).
// POR QUE: FINAL §15 elimina el boton "Crear solicitud" — la orden se crea al
// subir comprobante. La verificacion de email vive en el dropzone (paso 3).
function renderFlowCta(flowState) {
  const cta = document.querySelector("#orderForm .connection-actions");
  if (!cta) return;
  if (flowState === "connected") {
    cta.innerHTML = '<button id="orderSubmitButton" class="flow-cta-connected" type="button" data-flow-action="notify-connected">Equipo conectado</button>';
    return;
  }
  cta.innerHTML = "";
}

function applyStepLocks(flowState) {
  const lock = flowState !== "draft";
  [".flow-price-card", ".flow-request-card", ".flow-payment-card"].forEach((selector) => {
    document.querySelector(selector)?.classList.toggle("step-locked", lock);
  });
}

function toggleProofWarning(flowState) {
  const warning = document.querySelector("#flowProofWarning");
  if (!warning) return;
  warning.classList.toggle("hidden", flowState !== "awaiting_proof");
}

// QUE: muestra el paso 4 (Conexion) solo cuando el pago fue VALIDADO por un
// operador, no apenas se subio el comprobante.
// POR QUE: FINAL §7 / bug 3 del PR-0 — antes el paso 4 estaba siempre visible con
// datos pre-llenados antes de pagar. Lo correcto es ocultarlo hasta EN_PREPARACION
// (operador aprobo) y hasta que la orden quede dentro de la ventana de conexion.
function applyStep4Visibility(customer) {
  const article = document.querySelector(".flow-connect-card");
  if (!article) return;
  const validatedOrder = (customer?.orders || []).find((order) => (
    ["EN_PREPARACION", "LISTO_PARA_CONEXION", "EN_PROCESO"].includes(order.publicStatus)
  ));
  article.hidden = !validatedOrder;
}
