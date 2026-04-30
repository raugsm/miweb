const state = {
  customer: null,
  catalog: null,
  activeTab: "login",
  pollTimer: null,
  ordersStream: null,
  turnstileReady: null,
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

function paymentAmountText(value, payment = currentPayment()) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return "";
  if (payment?.amountMode === "thousands") {
    const normalizedAmount = amount > 0 && amount < 1000 ? Math.round(amount * 1000) : Math.round(amount);
    return `${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(normalizedAmount)} ${payment.currency}`;
  }
  if (payment?.currency === "PEN") return `S/ ${amount.toFixed(2)}`;
  if (payment?.currency === "USDT") return `${amount.toFixed(2)} USDT`;
  if (payment?.currency === "MXN") return `$${amount.toFixed(2)} MXN`;
  return `$${amount.toFixed(2)} ${payment?.currency || "USD"}`;
}

function compatiblePaymentMethodsForCustomer() {
  const methods = state.catalog?.paymentMethods || [];
  const country = state.customer?.client?.country;
  if (!country) return methods;
  const local = methods.filter((payment) => payment.country === country);
  const global = methods.filter((payment) => payment.globalOption);
  return local.concat(global);
}

function preferredPaymentForCustomer() {
  const compatible = compatiblePaymentMethodsForCustomer();
  return compatible.find((payment) => !payment.globalOption) || compatible[0] || null;
}

function currentPayment() {
  const paymentCode = $("#paymentSelect")?.value;
  return compatiblePaymentMethodsForCustomer().find((payment) => payment.code === paymentCode) || preferredPaymentForCustomer();
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
      option.textContent = payment.label;
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
  const qty = $("#orderForm input[name='quantity']")?.value || 1;
  const estimate = estimatePortalPrice(qty);
  $("#quoteTotal").textContent = paymentAmountText(estimate.total);
  $("#quoteHint").textContent = `${estimate.label}. El backend confirma el monto exacto.`;
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
  renderOrders(customer.orders || []);
  startOrdersLive();
}

function statusLabel(code) {
  return state.catalog?.statuses?.find((status) => status.code === code)?.label || code || "Pendiente";
}

function orderCopyText(order) {
  return [
    `Pedido ${order.code}`,
    `${order.serviceName}`,
    `Equipos: ${order.quantity}`,
    `Total: ${order.priceFormatted || money(order.totalPrice)}`,
    `Estado: ${statusLabel(order.publicStatus)}`,
    `Seguimiento: ${location.origin}/cliente?orden=${encodeURIComponent(order.code)}&codigo=${encodeURIComponent(order.accessCode || "")}`,
    "",
    paymentText({ label: order.paymentLabel, details: order.paymentDetails }, order.priceFormatted || money(order.totalPrice)),
  ].join("\n");
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
  orders.forEach((order) => {
    const card = template.content.firstElementChild.cloneNode(true);
    $(".order-code", card).textContent = order.code;
    $(".order-service", card).textContent = order.serviceName;
    $(".status-pill", card).textContent = statusLabel(order.publicStatus);
    $(".order-meta", card).textContent = `${order.quantity} equipo(s) - ${order.priceFormatted || money(order.totalPrice)} - ${order.discountLabel || "Precio base"}`;
    $(".payment-block", card).innerHTML = paymentText({ label: order.paymentLabel, details: order.paymentDetails }, order.priceFormatted || money(order.totalPrice))
      .split("\n")
      .map((line) => `<div>${escapeHtml(line)}</div>`)
      .join("");
    $(".item-list", card).innerHTML = (order.items || []).map((item) => {
      const detail = [item.model, item.imei].filter(Boolean).join(" / ") || "Equipo sin detalle";
      const done = item.ardCode ? ` - ${item.ardCode}` : "";
      return `<div class="item-row">#${item.sequence} ${escapeHtml(detail)}<br><small>${escapeHtml(statusLabel(item.status))}${escapeHtml(done)}</small></div>`;
    }).join("");
    const fileInput = $("input[type='file']", card);
    const loggedCustomer = Boolean(state.customer?.user && state.customer?.client);
    $(".upload-button", card).style.display = loggedCustomer ? "inline-flex" : "none";
    fileInput.addEventListener("change", async () => {
      const message = $(".order-message", card);
      setMessage(message, "Subiendo comprobante...");
      try {
        const proofs = await filesToProofs(fileInput.files);
        const payload = await api(`/api/portal/orders/${order.id}/payment-proof`, {
          method: "PATCH",
          body: JSON.stringify({ paymentProofs: proofs }),
        });
        state.customer = payload.customer;
        setMessage(message, "Comprobante recibido. Queda en revision.", "success");
        renderCustomer();
      } catch (error) {
        setMessage(message, error.message, "error");
      } finally {
        fileInput.value = "";
      }
    });
    $(".copy-order", card).addEventListener("click", () => copyText(orderCopyText(order), $(".order-message", card)));
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
  const lines = String(text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return Array.from({ length: quantity }, (_, index) => {
    const line = lines[index] || "";
    const imei = (line.match(/\b\d{14,16}\b/) || [])[0] || "";
    return { model: line.replace(imei, "").trim(), imei };
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

function wireEvents() {
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
      const data = Object.fromEntries(new FormData(form));
      const quantity = Math.max(1, Math.min(50, Number.parseInt(data.quantity, 10) || 1));
      const payload = await api("/api/portal/orders/frp", {
        method: "POST",
        body: JSON.stringify({
          quantity,
          paymentMethod: data.paymentMethod,
          items: parseItems(data.items, quantity),
          note: data.note,
          turnstileToken: turnstileToken("order"),
        }),
      });
      state.customer = payload.customer;
      const selectedPayment = payload.order?.paymentMethod || data.paymentMethod;
      form.reset();
      renderCatalog();
      if (selectedPayment && Array.from($("#paymentSelect").options).some((option) => option.value === selectedPayment)) {
        $("#paymentSelect").value = selectedPayment;
      }
      updateQuote();
      renderCustomer();
      resetTurnstile("order");
      setMessage(message, `Solicitud ${payload.order.code} creada. Copia el pago o sube comprobante.`, "success");
    } catch (error) {
      setMessage(message, error.message, "error");
      resetTurnstile("order");
    }
  });

  $("#orderForm input[name='quantity']").addEventListener("input", updateQuote);
  $("#paymentSelect").addEventListener("change", updateQuote);
  $("#copyPaymentButton").addEventListener("click", () => {
    const estimate = estimatePortalPrice($("#orderForm input[name='quantity']").value);
    copyText(paymentText(currentPayment(), paymentAmountText(estimate.total)), $("#orderMessage"));
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
    setMessage($("#orderMessage"), "Ya tienes sesion activa. Revisa el avance desde Mis ordenes.", "success");
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
