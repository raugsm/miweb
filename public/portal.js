const state = {
  customer: null,
  catalog: null,
  activeTab: "login",
  pollTimer: null,
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

function currentPayment() {
  const paymentCode = $("#paymentSelect")?.value;
  return state.catalog?.paymentMethods?.find((payment) => payment.code === paymentCode) || state.catalog?.paymentMethods?.[0] || null;
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
  const countries = state.catalog?.countries || [];
  const countrySelect = $("#countrySelect");
  if (countrySelect && !countrySelect.options.length) {
    countries.forEach((country) => {
      const option = document.createElement("option");
      option.value = country;
      option.textContent = country;
      countrySelect.append(option);
    });
  }
  const paymentSelect = $("#paymentSelect");
  if (paymentSelect) {
    paymentSelect.innerHTML = "";
    (state.catalog?.paymentMethods || []).forEach((payment) => {
      const option = document.createElement("option");
      option.value = payment.code;
      option.textContent = payment.label;
      paymentSelect.append(option);
    });
    const binance = Array.from(paymentSelect.options).find((option) => option.value === "BINANCE_PAY");
    if (binance) paymentSelect.value = "BINANCE_PAY";
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
  $("#quoteTotal").textContent = money(estimate.total);
  $("#quoteHint").textContent = `${estimate.label}. El backend confirma el monto exacto.`;
}

function renderCustomer() {
  const customer = state.customer;
  const logged = Boolean(customer?.user && customer?.client);
  $("#accessPanel").classList.toggle("hidden", logged);
  $("#appPanel").classList.toggle("hidden", !logged);
  if (!logged) {
    stopPolling();
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
  startPolling();
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

async function loadSession() {
  const payload = await api("/api/portal/session");
  state.customer = payload.customer;
  state.catalog = payload.catalog;
  renderCatalog();
  renderCustomer();
}

function startPolling() {
  if (state.pollTimer) return;
  state.pollTimer = setInterval(async () => {
    try {
      const payload = await api("/api/portal/orders");
      state.customer.orders = payload.orders || [];
      renderOrders(state.customer.orders);
    } catch {
      stopPolling();
    }
  }, 8000);
}

function stopPolling() {
  if (state.pollTimer) clearInterval(state.pollTimer);
  state.pollTimer = null;
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
      form.reset();
      $("#paymentSelect").value = data.paymentMethod;
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
    copyText(paymentText(currentPayment(), money(estimate.total)), $("#orderMessage"));
  });
  $("#refreshButton").addEventListener("click", async () => {
    const payload = await api("/api/portal/orders");
    state.customer.orders = payload.orders || [];
    renderOrders(state.customer.orders);
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
    stopPolling();
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
  $("#clientTitle").textContent = "Seguimiento publico";
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
