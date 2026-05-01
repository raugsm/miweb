import { api } from "./api.js";
import {
  detectCountryFromWhatsapp,
  normalizeWhatsappInput,
  renderCatalog,
  renderCustomer,
  resetTurnstile,
  setTab,
  turnstileToken,
  updatePhoneCountryFromInput,
  validateRegisterName,
} from "./auth-forms.js";
import { connectionGuideText } from "./connection.js";
import { $, $$, copyText, setMessage } from "./dom.js";
import { parseItems, syncDetectedItems } from "./frp.js";
import { refreshOrdersSilently, setOrdersLiveStatus, stopOrdersLive } from "./live-orders.js";
import { orderNeedsPaymentProof } from "./order-state.js";
import {
  closePaymentModal,
  paymentSelectedInDropdown,
  paymentUploadTargetOrder,
  renderPaymentModal,
  updateQuote,
} from "./payments.js";
import { hasDraggedFiles, uploadPaymentProofFromFlow, wireGlobalFileDropGuard } from "./proofs.js";
import { renderTrackedOrder } from "./deep-links.js";
import { state } from "./state.js";

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

export function wireEvents() {
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
      if (paymentSelectedInDropdown(selectedPayment)) {
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
    await uploadPaymentProofFromFlow(flowPaymentInput.files, renderCustomer);
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
    await uploadPaymentProofFromFlow(event.dataTransfer?.files || [], renderCustomer);
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
