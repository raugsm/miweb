const state = {
  customer: null,
  catalog: null,
  activeTab: "login",
  pollTimer: null,
  ordersStream: null,
  turnstileReady: null,
  activePaymentOrderId: "",
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

function setMessage(node, text, type = "") {
  if (!node) return;
  node.textContent = text || "";
  node.dataset.type = type;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "No se pudo completar la accion.");
  return payload;
}

function money(value) {
  return `${Number(value || 0).toFixed(2)} USDT`;
}

function exchangeRateForPayment(payment = currentPayment()) {
  if (!payment?.currency || payment.currency === "USDT") return 1;
  const rate = (state.catalog?.exchangeRates || []).find((candidate) => candidate.currency === payment.currency);
  return Number(rate?.ratePerUsdt || 0);
}

function paymentCurrencyAmount(value, payment = currentPayment()) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return 0;
  if (!payment || payment.currency === "USDT") return amount;
  const rate = exchangeRateForPayment(payment);
  return rate > 0 ? amount * rate : null;
}

function paymentAmountText(value, payment = currentPayment()) {
  const amount = paymentCurrencyAmount(value, payment);
  if (amount === null) return `Tasa pendiente ${payment?.currency || ""}`.trim();
  if (!Number.isFinite(amount)) return "";
  if (payment?.amountMode === "thousands") {
    return `${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(Math.round(amount))} ${payment.currency}`;
  }
  if (payment?.currency === "PEN") return `S/ ${amount.toFixed(2)}`;
  if (payment?.currency === "USDT") return `${amount.toFixed(2)} USDT`;
  if (payment?.currency === "MXN") return `$${amount.toFixed(2)} MXN`;
  return `$${amount.toFixed(2)} ${payment?.currency || "USD"}`;
}

function paymentFlag(payment = currentPayment()) {
  const country = String(payment?.country || "");
  const byCountry = {
    Mexico: "🇲🇽",
    Peru: "🇵🇪",
    Colombia: "🇨🇴",
    Chile: "🇨🇱",
    Global: "🌎",
  };
  return byCountry[country] || "🌎";
}

function paymentOptionLabel(payment) {
  if (!payment) return "Método de pago";
  return `${paymentFlag(payment)} ${payment.label}`;
}

function compatiblePaymentMethodsForCustomer() {
  const methods = state.catalog?.paymentMethods || [];
  const country = state.customer?.client?.country;
  if (!country) return methods;
  const local = methods.filter((payment) => payment.country === country);
  const global = methods.filter((payment) => payment.globalOption);
  const others = methods.filter((payment) => payment.country !== country && !payment.globalOption);
  return local.concat(global, others);
}

function preferredPaymentForCustomer() {
  const compatible = compatiblePaymentMethodsForCustomer();
  return compatible.find((payment) => !payment.globalOption) || compatible[0] || null;
}

function currentPayment() {
  const paymentCode = $("#paymentSelect")?.value;
  return compatiblePaymentMethodsForCustomer().find((payment) => payment.code === paymentCode) || preferredPaymentForCustomer();
}

function paymentByCode(code) {
  return (state.catalog?.paymentMethods || []).find((payment) => payment.code === code) || null;
}

function binancePayment() {
  return paymentByCode("BINANCE_PAY")
    || (state.catalog?.paymentMethods || []).find((payment) => payment.globalOption && payment.currency === "USDT")
    || null;
}

function paymentText(payment, totalText = "") {
  if (!payment) return "";
  return [
    totalText ? `Total en ticket: ${totalText}` : "",
    payment.label,
    ...(payment.details || []),
    "Despues de pagar, sube captura del comprobante para validar mas rapido.",
  ].filter(Boolean).join("\n");
}

function orderHasPaymentProof(order) {
  return (order?.paymentProofs || []).length > 0;
}

function orderNeedsPaymentProof(order) {
  if (!order || order.publicStatus === "REVISION_COMPATIBILIDAD") return false;
  if (order.paymentStatus === "RECHAZADO" || order.proofStatus === "RECHAZADO") return true;
  return order.publicStatus === "ESPERANDO_PAGO" && !orderHasPaymentProof(order);
}

function paymentUploadTargetOrder() {
  const orders = state.customer?.orders || [];
  const candidates = sortOrdersForDisplay(orders).filter(orderNeedsPaymentProof);
  if (!candidates.length) return null;
  return candidates.find((order) => order.id === state.activePaymentOrderId) || candidates[0];
}

function activePaymentContext() {
  const targetOrder = paymentUploadTargetOrder();
  const quantity = syncDetectedItems();
  const estimate = estimatePortalPrice(quantity);
  const selectedPayment = targetOrder ? paymentByCode(targetOrder.paymentMethod) : currentPayment();
  const totalUsdt = Number(targetOrder?.totalPrice || estimate.total || 0);
  return { targetOrder, estimate, selectedPayment, totalUsdt };
}

function paymentOptionsForContext(context = activePaymentContext()) {
  const selected = context.selectedPayment || currentPayment();
  const binance = binancePayment();
  return [selected, binance].filter(Boolean).filter((payment, index, list) => (
    list.findIndex((candidate) => candidate.code === payment.code) === index
  ));
}

function paymentOptionAmountText(payment, context = activePaymentContext()) {
  if (context.targetOrder && payment.code === context.targetOrder.paymentMethod) {
    return context.targetOrder.priceFormatted || paymentAmountText(context.totalUsdt, payment);
  }
  return paymentAmountText(context.totalUsdt, payment);
}

function operationCode(order, item = null) {
  const base = order?.code || "CL-YYYYMMDD-001";
  const sequence = Number(item?.sequence || 1);
  return `${base}-${String(sequence).padStart(2, "0")}`;
}

function connectionGuideText(order = null) {
  const firstItem = order?.items?.[0] || null;
  const ticketCode = order ? operationCode(order, firstItem) : "CL-YYYYMMDD-001-01";
  return [
    "AriadGSM - Conexion Xiaomi FRP Express",
    order?.code ? `Pedido: ${order.code}` : "",
    "",
    "1. Abre USB Redirector Technician Edition.",
    "2. En Technician ID escribe la DDNS indicada por AriadGSM.",
    `3. En Additional information escribe: ${ticketCode}`,
    "4. Pulsa Connect y no desconectes el equipo mientras el tecnico procesa.",
    "",
    "Cuando estes listo, marca 'Estoy listo para conectar' en el portal.",
  ].filter(Boolean).join("\n");
}

function redirectorMiniGuideMarkup(order = null) {
  const firstItem = order?.items?.[0] || null;
  const code = order ? operationCode(order, firstItem) : "CL-YYYYMMDD-001-01";
  return `
    <div class="redirector-mini" aria-label="Guia visual USB Redirector">
      <div class="redirector-stage">
        <div class="redirector-screen redirector-welcome">
          <div class="usb-cover" aria-hidden="true"></div>
          <div>
            <strong>Welcome to USB Redirector</strong>
            <span>Technician Edition</span>
          </div>
          <button class="redirector-next" type="button" disabled>Next</button>
        </div>
        <div class="redirector-screen redirector-connect">
          <div class="window-bar">Connect With Technician</div>
          <label>Technician ID <code class="typed-value typed-ddns">DDNS AriadGSM</code></label>
          <label>Additional information <code class="typed-value typed-code">${escapeHtml(code)}</code></label>
          <button class="redirector-connect-button" type="button" disabled>Connect</button>
        </div>
      </div>
    </div>
  `;
}

function copyText(text, messageNode) {
  const done = () => setMessage(messageNode, "Copiado. Ya puedes pegarlo.", "success");
  const fail = () => setMessage(messageNode, "No se pudo copiar automaticamente.", "error");
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(fail);
    return;
  }
  const helper = document.createElement("textarea");
  helper.value = text;
  document.body.appendChild(helper);
  helper.select();
  try {
    document.execCommand("copy");
    done();
  } catch {
    fail();
  } finally {
    helper.remove();
  }
}

function closePaymentModal() {
  $("#paymentModal")?.classList.add("hidden");
}

function renderPaymentModal() {
  const modal = $("#paymentModal");
  const list = $("#paymentOptionsList");
  if (!modal || !list) return;
  const context = activePaymentContext();
  const options = paymentOptionsForContext(context);
  list.innerHTML = options.length
    ? options.map((payment) => {
      const amount = paymentOptionAmountText(payment, context);
      const details = paymentText(payment, amount)
        .split("\n")
        .map((line) => `<span>${escapeHtml(line)}</span>`)
        .join("");
      return `
        <article class="payment-option-card">
          <div class="payment-option-head">
            <strong>${escapeHtml(paymentOptionLabel(payment))}</strong>
            <b>${escapeHtml(amount)}</b>
          </div>
          <div class="payment-option-details">${details}</div>
          <button class="ghost copy-payment-option" type="button" data-payment="${escapeHtml(payment.code)}">Copiar esta cuenta</button>
        </article>
      `;
    }).join("")
    : "<p class=\"message\">No hay cuentas disponibles.</p>";

  $$(".copy-payment-option", list).forEach((button) => {
    button.addEventListener("click", () => {
      const payment = paymentByCode(button.dataset.payment);
      if (!payment) return;
      copyText(paymentText(payment, paymentOptionAmountText(payment, context)), $("#orderMessage"));
      closePaymentModal();
    });
  });
  modal.classList.remove("hidden");
}

function setTab(tab) {
  state.activeTab = tab;
  $$(".tab").forEach((button) => button.classList.toggle("active", button.dataset.tab === tab));
  $$(".auth-form").forEach((form) => form.classList.remove("active"));
  $(`#${tab}Form`)?.classList.add("active");
  setMessage($("#authMessage"), "");
}

function customerEmailVerified() {
  return Boolean(state.customer?.client?.emailVerified);
}

function normalizeForMatch(value) {
  return String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function nameHasCountry(value) {
  const normalized = ` ${normalizeForMatch(value)} `;
  return (state.catalog?.countries || [])
    .filter((country) => country !== "USDT")
    .some((country) => normalized.includes(` ${normalizeForMatch(country)} `));
}

function validateRegisterName(value) {
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

function phoneCountryEntries() {
  return (state.catalog?.phoneCountries || [])
    .flatMap((item) => (item.callingPrefixes || []).map((prefix) => ({ country: item.country, prefix })))
    .sort((a, b) => b.prefix.length - a.prefix.length);
}

function normalizeWhatsappInput(value) {
  const raw = String(value || "").trim();
  const normalized = raw.replace(/[^\d+]/g, "");
  if (!normalized) return { ok: false, error: "Escribe tu WhatsApp con codigo internacional." };
  if (!normalized.startsWith("+")) return { ok: false, error: "WhatsApp debe iniciar con + y codigo de pais." };
  if (!/^\+[1-9]\d{6,14}$/.test(normalized)) return { ok: false, error: "WhatsApp debe tener formato internacional. Ejemplo: +573001234567." };
  return { ok: true, phone: normalized };
}

function detectCountryFromWhatsapp(value) {
  const normalized = normalizeWhatsappInput(value);
  if (!normalized.ok) return null;
  const digits = normalized.phone.slice(1);
  return phoneCountryEntries().find((entry) => digits.startsWith(entry.prefix)) || null;
}

function updatePhoneCountryFromInput() {
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

function ensureTurnstileScript() {
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

async function renderTurnstileWidgets() {
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

function turnstileToken(name) {
  if (!state.catalog?.turnstileEnabled) return "";
  return $(`[data-turnstile-widget="${name}"]`)?.dataset.token || "";
}

function resetTurnstile(name) {
  const box = $(`[data-turnstile-widget="${name}"]`);
  if (!box?.dataset.widgetId || !window.turnstile) return;
  box.dataset.token = "";
  window.turnstile.reset(box.dataset.widgetId);
}

function renderCatalog() {
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

function itemLinesFromText(text) {
  return String(text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function detectedItemCount() {
  const lines = itemLinesFromText($("#orderForm textarea[name='items']")?.value || "");
  return Math.max(1, Math.min(50, lines.length || 1));
}

function syncDetectedItems() {
  const count = detectedItemCount();
  const quantityInput = $("#orderForm input[name='quantity']");
  if (quantityInput) quantityInput.value = String(count);
  const preview = $("#previewOperationCode");
  if (preview) {
    preview.textContent = count === 1
      ? "CL-YYYYMMDD-001-01"
      : `CL-YYYYMMDD-001-01 ... -${String(count).padStart(2, "0")}`;
  }
  return count;
}

function estimatePortalPrice(quantity) {
  const qty = Math.max(1, Math.min(50, Number.parseInt(quantity, 10) || 1));
  const service = state.catalog?.services?.[0];
  const base = Number(service?.baseUnitPrice || 25);
  const benefit = state.customer?.benefit;
  if (!benefit?.usableNow) {
    return { unit: base, total: base * qty, label: "Precio base. Beneficios bloqueados para este dispositivo." };
  }
  const quantityTier = (state.catalog?.quantityTiers || [])
    .filter((tier) => qty >= Number(tier.minQty || 0))
    .sort((a, b) => Number(a.unitPrice) - Number(b.unitPrice))[0];
  const monthlyUsage = Number(state.customer?.monthlyUsage || 0);
  const monthlyTier = (state.catalog?.monthlyTiers || [])
    .filter((tier) => monthlyUsage >= Number(tier.minJobs || 0))
    .sort((a, b) => Number(a.unitPrice) - Number(b.unitPrice))[0];
  const vipTier = Number(benefit.vipUnitPrice || 0) > 0 ? { unitPrice: Number(benefit.vipUnitPrice), label: "VIP aprobado" } : null;
  const selected = [quantityTier, monthlyTier, vipTier]
    .filter(Boolean)
    .sort((a, b) => Number(a.unitPrice) - Number(b.unitPrice))[0] || { unitPrice: base, label: "Precio base" };
  return { unit: Number(selected.unitPrice || base), total: Number(selected.unitPrice || base) * qty, label: selected.label || "Precio base" };
}

function updateQuote() {
  syncDetectedItems();
  const context = activePaymentContext();
  const estimate = context.estimate;
  const payment = context.selectedPayment || currentPayment();
  const unitNode = $("#currentUnitPrice");
  const unitUsdtNode = $("#currentUnitPriceUsdt");
  const currencyLabel = $("#currentCurrencyLabel");
  const paymentBadge = $("#currentPaymentBadge");
  if (unitNode) unitNode.textContent = paymentAmountText(estimate.unit, payment);
  if (unitUsdtNode) unitUsdtNode.textContent = money(estimate.unit);
  if (currencyLabel) currencyLabel.textContent = `${paymentFlag(payment)} ${payment?.currency || "Tu moneda"}`;
  if (paymentBadge) paymentBadge.textContent = paymentOptionLabel(payment);
  const quoteUsdt = $("#quoteTotalUsdt");
  const quoteLocal = $("#quoteTotalLocal");
  const quoteCurrencyLabel = $("#quoteCurrencyLabel");
  if (quoteUsdt) quoteUsdt.textContent = money(context.totalUsdt);
  if (quoteLocal) quoteLocal.textContent = paymentAmountText(context.totalUsdt, payment);
  if (quoteCurrencyLabel) quoteCurrencyLabel.textContent = `${paymentFlag(payment)} ${payment?.currency || "Tu moneda"}`;
  updateFlowPaymentDropzone();
}

function updateFlowPaymentDropzone() {
  const dropzone = $("#flowPaymentDropzone");
  const hint = $("#flowPaymentDropzoneHint");
  if (!dropzone || !hint) return;
  const targetOrder = paymentUploadTargetOrder();
  const enabled = Boolean(state.customer?.user && state.customer?.client && targetOrder);
  dropzone.dataset.disabled = enabled ? "false" : "true";
  dropzone.classList.toggle("is-disabled", !enabled);
  dropzone.dataset.orderId = targetOrder?.id || "";
  hint.textContent = targetOrder
    ? `Pago de ${targetOrder.code}`
    : "Disponible después de crear la solicitud";
}

function customerCanRequestApprovalOptions() {
  const status = normalizeForMatch(state.customer?.client?.status || "");
  const markedClient = ["vip", "empresa"].includes(status);
  const benefit = state.customer?.benefit;
  return Boolean(markedClient || (benefit?.usableNow && Number(benefit?.vipUnitPrice || 0) > 0));
}

function renderCustomer() {
  const customer = state.customer;
  const logged = Boolean(customer?.user && customer?.client);
  $("#accessPanel").classList.toggle("hidden", logged);
  $("#appPanel").classList.toggle("hidden", !logged);
  if (!logged) {
    stopOrdersLive();
    return;
  }
  $("#clientTitle").textContent = `${customer.client.name}`;
  $("#clientStatus").textContent = customer.client.emailVerified ? "Correo verificado" : "Correo pendiente";
  $("#monthlyUsage").textContent = String(customer.monthlyUsage || 0);
  $("#deviceStatus").textContent = customer.device?.authorizedForBenefits ? "Autorizado" : "Sin beneficios";
  $("#verificationCard").classList.toggle("hidden", customer.client.emailVerified);
  $("#orderSubmitButton").disabled = !customer.client.emailVerified;
  $("#copyPaymentButton").disabled = !customer.client.emailVerified;
  const canRequestApproval = customerCanRequestApprovalOptions();
  $("#approvalOptions")?.classList.toggle("hidden", !canRequestApproval);
  if (!canRequestApproval) {
    $$("#approvalOptions input[type='checkbox']").forEach((input) => { input.checked = false; });
  }
  updateFlowPaymentDropzone();
  renderOrders(customer.orders || []);
  startOrdersLive();
}

function statusLabel(code) {
  return state.catalog?.statuses?.find((status) => status.code === code)?.label || code || "Pendiente";
}

function itemStatusLabel(code) {
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

function customerNextAction(order) {
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

function orderBadges(order) {
  const badges = [];
  if (order?.customerConnectionReadyAt) badges.push("Conexion lista");
  if (order?.urgentRequested) badges.push(order.urgentStatus === "APROBADO" ? "Urgente aprobado" : "Urgente solicitado");
  if (order?.postpayRequested) badges.push(order.postpayStatus === "APROBADO" ? "Postpago aprobado" : "Postpago solicitado");
  return badges;
}

function orderCopyText(order) {
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

function trackingStage(order) {
  if (order?.publicStatus === "FINALIZADO") return "DONE";
  if (order?.publicStatus === "EN_PROCESO" || (order?.items || []).some((item) => item.status === "EN_PROCESO")) return "PROCESS";
  return "RECEIVED";
}

function trackingStageLabel(order) {
  const labels = {
    RECEIVED: "Pedido recibido",
    PROCESS: "En proceso",
    DONE: "Done",
  };
  return labels[trackingStage(order)] || "Pedido recibido";
}

function orderSortPriority(order) {
  const stage = trackingStage(order);
  if (stage === "PROCESS") return 0;
  if (stage === "RECEIVED") return 1;
  return 2;
}

function sortOrdersForDisplay(orders) {
  return [...orders].sort((a, b) => {
    const priority = orderSortPriority(a) - orderSortPriority(b);
    if (priority) return priority;
    return new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0);
  });
}

function compactDiscountLabel(order) {
  const label = String(order?.discountLabel || "").trim();
  if (!label || ["Normal", "Precio base"].includes(label)) return "";
  return label;
}

function compactOrderMeta(order) {
  const parts = [
    `${order.quantity} equipo${Number(order.quantity) === 1 ? "" : "s"}`,
    order.priceFormatted || money(order.totalPrice),
    compactDiscountLabel(order),
  ].filter(Boolean);
  return parts.join(" - ");
}

function orderDoneText(order) {
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

function trackingMarkup(order) {
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

function orderAlertText(order) {
  if (order?.publicStatus === "REVISION_COMPATIBILIDAD") return "Modelo en revision: AriadGSM confirmara si aplica FRP Express antes de pedir pago.";
  if (order?.publicStatus === "REQUIERE_ATENCION") return order.nextAction || "Se requiere atencion: revisa la indicacion de AriadGSM.";
  if ((order?.items || []).some((item) => item.status === "REQUIERE_REVISION")) return "Hay un equipo en revision. Revisa el detalle antes de continuar.";
  if (order?.paymentStatus === "RECHAZADO" || order?.proofStatus === "RECHAZADO") return "Comprobante rechazado. Sube una imagen valida del pago.";
  return "";
}

function renderOrders(orders) {
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
        renderCustomer();
      } catch (error) {
        setMessage(message, error.message, "error");
      }
    });
    copyConnectionButton.addEventListener("click", () => copyText(connectionGuideText(order), $(".order-message", card)));
    copyOrderButton.addEventListener("click", () => copyText(stage === "DONE" ? orderDoneText(order) : orderCopyText(order), $(".order-message", card)));
    list.append(card);
  });
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function parseItems(text, quantity) {
  const lines = itemLinesFromText(text);
  return Array.from({ length: quantity }, (_, index) => {
    const line = lines[index] || "";
    const imei = (line.match(/\b\d{14,16}\b/) || [])[0] || "";
    return { raw: line, model: line.replace(imei, "").trim(), imei };
  });
}

async function filesToProofs(fileList) {
  const files = Array.from(fileList || []).slice(0, 4);
  if (!files.length) throw new Error("Selecciona al menos una imagen.");
  return Promise.all(files.map((file) => new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Solo se aceptan imagenes."));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, type: file.type, size: file.size, dataUrl: reader.result });
    reader.onerror = () => reject(new Error("No se pudo leer la imagen."));
    reader.readAsDataURL(file);
  })));
}

async function uploadPaymentProofFromFlow(files) {
  const message = $("#orderMessage");
  const dropzone = $("#flowPaymentDropzone");
  const input = $("#flowPaymentProofInput");
  const order = paymentUploadTargetOrder();
  if (!order) {
    setMessage(message, "Primero crea una solicitud pendiente de pago.", "error");
    if (input) input.value = "";
    return;
  }
  setMessage(message, `Subiendo comprobante para ${order.code}...`);
  try {
    const proofs = await filesToProofs(files);
    const payload = await api(`/api/portal/orders/${order.id}/payment-proof`, {
      method: "PATCH",
      body: JSON.stringify({ paymentProofs: proofs }),
    });
    state.customer = payload.customer;
    setMessage(message, `Comprobante recibido para ${order.code}. Queda en revision.`, "success");
    renderCustomer();
  } catch (error) {
    setMessage(message, error.message, "error");
  } finally {
    if (input) input.value = "";
    dropzone?.classList.remove("drag-active");
    updateFlowPaymentDropzone();
  }
}

function hasDraggedFiles(event) {
  const data = event.dataTransfer;
  if (!data) return false;
  return Array.from(data.items || []).some((item) => item.kind === "file") || Array.from(data.files || []).length > 0;
}

function wireGlobalFileDropGuard() {
  ["dragover", "drop"].forEach((eventName) => {
    window.addEventListener(eventName, (event) => {
      if (!hasDraggedFiles(event)) return;
      if (event.target?.closest?.(".proof-dropzone")) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "none";
    });
  });
}

function setOrdersLiveStatus(text, type = "") {
  const node = $("#ordersLiveStatus");
  if (!node) return;
  node.textContent = text;
  node.dataset.type = type;
}

async function refreshOrdersSilently() {
  if (!state.customer?.user || !state.customer?.client) return;
  const payload = await api("/api/portal/orders");
  state.customer.orders = payload.orders || [];
  updateQuote();
  renderOrders(state.customer.orders);
}

async function loadSession() {
  const payload = await api("/api/portal/session");
  state.customer = payload.customer;
  state.catalog = payload.catalog;
  renderCatalog();
  renderCustomer();
}

function startFallbackPolling() {
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

function stopFallbackPolling() {
  if (state.pollTimer) clearTimeout(state.pollTimer);
  state.pollTimer = null;
}

function startOrdersLive() {
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

function stopOrdersLive() {
  stopFallbackPolling();
  if (state.ordersStream) state.ordersStream.close();
  state.ordersStream = null;
  setOrdersLiveStatus("Desconectado", "");
}

function wirePasswordToggles() {
  $$("[data-password-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const field = button.closest(".password-field")?.querySelector("input");
      if (!field) return;
      const shouldShow = field.type === "password";
      field.type = shouldShow ? "text" : "password";
      button.dataset.visible = String(shouldShow);
      button.setAttribute("aria-pressed", String(shouldShow));
      button.setAttribute("aria-label", shouldShow ? "Ocultar contraseña" : "Mostrar contraseña");
      field.focus();
    });
  });
}

function wireEvents() {
  wirePasswordToggles();
  wireGlobalFileDropGuard();
  $$(".tab").forEach((button) => button.addEventListener("click", () => setTab(button.dataset.tab)));
  $("#loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    setMessage($("#authMessage"), "");
    try {
      const body = Object.fromEntries(new FormData(event.currentTarget));
      const payload = await api("/api/portal/login", { method: "POST", body: JSON.stringify(body) });
      state.customer = payload.customer;
      state.catalog = payload.catalog;
      renderCatalog();
      renderCustomer();
    } catch (error) {
      setMessage($("#authMessage"), error.message, "error");
    }
  });

  $("#registerForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    setMessage($("#authMessage"), "");
    try {
      const body = Object.fromEntries(new FormData(event.currentTarget));
      const name = validateRegisterName(body.name);
      if (!name.ok) throw new Error(name.error);
      const phone = normalizeWhatsappInput(body.whatsapp);
      if (!phone.ok) throw new Error(phone.error);
      const detected = detectCountryFromWhatsapp(phone.phone);
      body.name = name.name;
      body.whatsapp = phone.phone;
      if (detected?.country) body.country = detected.country;
      body.turnstileToken = turnstileToken("register");
      const payload = await api("/api/portal/register", { method: "POST", body: JSON.stringify(body) });
      if (payload.customer) {
        state.customer = payload.customer;
        state.catalog = payload.catalog;
        renderCatalog();
        renderCustomer();
      }
      setMessage($("#authMessage"), payload.message || "Si los datos son validos, revisa tu correo para continuar.", "success");
      resetTurnstile("register");
    } catch (error) {
      setMessage($("#authMessage"), error.message, "error");
      resetTurnstile("register");
    }
  });

  $("#registerForm input[name='name']").addEventListener("input", (event) => {
    const result = validateRegisterName(event.currentTarget.value);
    event.currentTarget.setCustomValidity(result.ok || !event.currentTarget.value.trim() ? "" : result.error);
  });
  $("#registerForm input[name='whatsapp']").addEventListener("input", updatePhoneCountryFromInput);
  $("#showTrackLink").addEventListener("click", () => setTab("track"));
  $("#backToLoginLink").addEventListener("click", () => setTab("login"));

  $("#trackForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    setMessage($("#authMessage"), "");
    try {
      const data = Object.fromEntries(new FormData(event.currentTarget));
      const payload = await api(`/api/portal/orders/${encodeURIComponent(data.code)}?accessCode=${encodeURIComponent(data.accessCode)}`);
      renderTrackedOrder(payload.order);
    } catch (error) {
      setMessage($("#authMessage"), error.message, "error");
    }
  });

  $("#orderForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const message = $("#orderMessage");
    setMessage(message, "");
    try {
      syncDetectedItems();
      const data = Object.fromEntries(new FormData(form));
      const quantity = Math.max(1, Math.min(50, Number.parseInt(data.quantity, 10) || 1));
      const payload = await api("/api/portal/orders/frp", {
        method: "POST",
        body: JSON.stringify({
          quantity,
          paymentMethod: data.paymentMethod,
          items: parseItems(data.items, quantity),
          note: data.note,
          urgentRequested: data.urgentRequested === "on",
          postpayRequested: data.postpayRequested === "on",
          turnstileToken: turnstileToken("order"),
        }),
      });
      state.customer = payload.customer;
      state.activePaymentOrderId = orderNeedsPaymentProof(payload.order) ? payload.order.id : "";
      const selectedPayment = payload.order?.paymentMethod || data.paymentMethod;
      form.reset();
      renderCatalog();
      if (selectedPayment && Array.from($("#paymentSelect").options).some((option) => option.value === selectedPayment)) {
        $("#paymentSelect").value = selectedPayment;
      }
      updateQuote();
      renderCustomer();
      resetTurnstile("order");
      const createdMessage = payload.order?.publicStatus === "REVISION_COMPATIBILIDAD"
        ? `Solicitud ${payload.order.code} creada para revision de compatibilidad. Espera confirmacion antes de pagar.`
        : `Solicitud ${payload.order.code} creada. Paso 3 listo para copiar pago y subir comprobante.`;
      setMessage(message, createdMessage, "success");
    } catch (error) {
      setMessage(message, error.message, "error");
      resetTurnstile("order");
    }
  });

  $("#orderForm textarea[name='items']").addEventListener("input", updateQuote);
  $("#paymentSelect").addEventListener("change", updateQuote);
  $("#copyPaymentButton").addEventListener("click", () => renderPaymentModal());
  $("#closePaymentModal")?.addEventListener("click", closePaymentModal);
  $("#paymentModal")?.addEventListener("click", (event) => {
    if (event.target?.id === "paymentModal") closePaymentModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closePaymentModal();
  });
  const flowPaymentDropzone = $("#flowPaymentDropzone");
  const flowPaymentInput = $("#flowPaymentProofInput");
  flowPaymentDropzone?.addEventListener("click", (event) => {
    if (paymentUploadTargetOrder()) return;
    event.preventDefault();
    setMessage($("#orderMessage"), "Primero crea la solicitud. Luego sube aquí el comprobante.", "error");
  });
  flowPaymentInput?.addEventListener("change", async () => {
    await uploadPaymentProofFromFlow(flowPaymentInput.files);
  });
  ["dragenter", "dragover"].forEach((eventName) => {
    flowPaymentDropzone?.addEventListener(eventName, (event) => {
      if (!hasDraggedFiles(event)) return;
      event.preventDefault();
      event.stopPropagation();
      if (!paymentUploadTargetOrder()) {
        if (event.dataTransfer) event.dataTransfer.dropEffect = "none";
        return;
      }
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
      flowPaymentDropzone.classList.add("drag-active");
    });
  });
  ["dragleave", "dragend"].forEach((eventName) => {
    flowPaymentDropzone?.addEventListener(eventName, (event) => {
      event.preventDefault();
      event.stopPropagation();
      flowPaymentDropzone.classList.remove("drag-active");
    });
  });
  flowPaymentDropzone?.addEventListener("drop", async (event) => {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    event.stopPropagation();
    await uploadPaymentProofFromFlow(event.dataTransfer?.files || []);
  });
  $("#copyConnectionGuideButton")?.addEventListener("click", () => {
    copyText(connectionGuideText(), $("#orderMessage"));
  });
  $("#refreshButton").addEventListener("click", async () => {
    await refreshOrdersSilently();
    setOrdersLiveStatus(state.ordersStream ? "En vivo" : "Actualizado", state.ordersStream ? "success" : "warn");
  });
  $("#resendVerificationButton").addEventListener("click", async () => {
    setMessage($("#orderMessage"), "");
    try {
      const payload = await api("/api/portal/resend-verification", { method: "POST", body: "{}" });
      setMessage($("#orderMessage"), payload.message || "Revisa tu correo.", "success");
    } catch (error) {
      setMessage($("#orderMessage"), error.message, "error");
    }
  });
  $("#logoutButton").addEventListener("click", async () => {
    await api("/api/portal/logout", { method: "POST", body: "{}" });
    state.customer = null;
    stopOrdersLive();
    renderCustomer();
    setTab("login");
  });
}

function renderTrackedOrder(order) {
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

function applyQueryTracking() {
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

async function applyEmailVerification() {
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

wireEvents();
loadSession()
  .then(applyEmailVerification)
  .then(applyQueryTracking)
  .catch((error) => setMessage($("#authMessage"), error.message, "error"));
