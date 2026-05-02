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
import { $, $$, copyText, setMessage } from "./dom.js";
import { activeOrderForFlow, notifyEquipoConectado } from "./flow-state.js";
import { checkEligibilityHint, parseItems, setQuantity, syncDetectedItems } from "./frp.js";
import { refreshOrdersSilently, setOrdersLiveStatus, stopOrdersLive } from "./live-orders.js";
import { orderNeedsPaymentProof } from "./order-state.js";
import {
  closePaymentModal,
  paymentSelectedInDropdown,
  paymentUploadTargetOrder,
  renderPaymentModal,
  setSelectedPayment,
  updateQuote,
} from "./payments.js";
import { filesToProofs, hasDraggedFiles, uploadPaymentProofFromFlow, wireGlobalFileDropGuard } from "./proofs.js";
import { renderTrackedOrder } from "./deep-links.js";
import { state } from "./state.js";

// QUE: crea la orden y adjunta el comprobante en una sola request al endpoint
// existente /api/portal/orders/frp con `paymentProofs` en el body. El backend
// hace ambas operaciones atomicas (un solo readDb -> writeDb).
// POR QUE: FINAL §15 — el cliente sube el comprobante y la orden se crea sola.
// Antes habia un boton "Crear solicitud" que primero creaba la orden y despues el
// dropzone se habilitaba para PATCH. Ese flujo se elimina.
async function submitOrderWithProofs(files) {
  const form = $("#orderForm");
  const message = $("#orderMessage");
  setMessage(message, "");
  let proofs;
  try {
    proofs = await filesToProofs(files);
  } catch (error) {
    setMessage(message, error.message, "error");
    return;
  }
  try {
    syncDetectedItems();
    const data = Object.fromEntries(new FormData(form));
    const quantity = Math.max(1, Math.min(50, Number.parseInt(data.quantity, 10) || 1));
    const modelHint = ($("#flowEligibilityInput")?.value || "").trim();
    const payload = await api("/api/portal/orders/frp", {
      method: "POST",
      body: JSON.stringify({
        quantity,
        paymentMethod: data.paymentMethod,
        items: parseItems(modelHint, quantity),
        note: data.note,
        turnstileToken: turnstileToken("order"),
        paymentProofs: proofs,
      }),
    });
    state.customer = payload.customer;
    state.activePaymentOrderId = orderNeedsPaymentProof(payload.order) ? payload.order.id : "";
    const selectedPayment = payload.order?.paymentMethod || data.paymentMethod;
    renderCatalog();
    if (paymentSelectedInDropdown(selectedPayment)) {
      setSelectedPayment(selectedPayment);
    }
    updateQuote();
    renderCustomer();
    resetTurnstile("order");
    const createdMessage = payload.order?.publicStatus === "REVISION_COMPATIBILIDAD"
      ? `Solicitud ${payload.order.code} creada para revision de compatibilidad. Espera confirmacion antes de pagar.`
      : `Comprobante recibido para ${payload.order.code}. Queda en revision.`;
    setMessage(message, createdMessage, "success");
  } catch (error) {
    setMessage(message, error.message, "error");
    resetTurnstile("order");
  }
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

  // QUE: el form ya no tiene boton submit (FINAL §15). Bloqueamos submits implicitos
  // por Enter para evitar reload accidental de la pagina si el cliente aprieta Enter
  // dentro de un input.
  $("#orderForm").addEventListener("submit", (event) => {
    event.preventDefault();
  });

  // Click delegado para el CTA "Equipo conectado" del paso 4.
  // applyFlowState() reemplaza el innerHTML de .connection-actions en cada render,
  // asi que un listener directo se perderia; delegamos al form que es estable.
  $("#orderForm")?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-flow-action='notify-connected']");
    if (!button) return;
    event.preventDefault();
    const order = activeOrderForFlow(state.customer);
    if (!order) return;
    const message = $("#orderMessage");
    button.disabled = true;
    setMessage(message, "Avisando al equipo tecnico...");
    try {
      await notifyEquipoConectado(order.id);
      setMessage(message, "Aviso enviado al equipo tecnico.", "success");
      renderCustomer();
    } catch (error) {
      setMessage(message, error.message, "error");
      button.disabled = false;
    }
  });

  // PR-2a-final.fase2: stepper +/- en paso 2 reemplaza al textarea de items.
  $("#orderForm")?.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-quantity-action]");
    if (!btn) return;
    event.preventDefault();
    const current = Number($("#flowQuantityDisplay")?.textContent || "1") || 1;
    const next = btn.dataset.quantityAction === "inc" ? current + 1 : current - 1;
    setQuantity(next);
    syncDetectedItems();
    updateQuote();
  });
  // PR-2a-final.fase2: buscador inverso — chequeo client-side contra
  // catalog.eligibilityHints. Sin round-trip al backend (FINAL §5: lógica
  // invertida, solo verifica NO soportados).
  $("#flowEligibilityInput")?.addEventListener("input", (event) => {
    const feedback = $("#flowEligibilityFeedback");
    if (!feedback) return;
    const result = checkEligibilityHint(event.currentTarget.value);
    if (result.status === "EMPTY") {
      feedback.hidden = true;
      feedback.textContent = "";
      feedback.dataset.eligibility = "";
      return;
    }
    feedback.hidden = false;
    feedback.textContent = result.message;
    feedback.dataset.eligibility = result.status.toLowerCase();
  });
  // PR-2a-final.fase3: pills de paso 1 reemplazan el select. Click delegado
  // en el container actualiza hidden input + recalcula precio en moneda nueva.
  $("#flowPaymentPills")?.addEventListener("click", (event) => {
    const pill = event.target.closest("[data-payment-pill]");
    if (!pill) return;
    setSelectedPayment(pill.dataset.paymentPill);
    updateQuote();
  });
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

  // QUE: cuando el cliente sube un comprobante sin orden activa, creamos la orden +
  // adjuntamos el comprobante en un solo POST. Si ya hay orden esperando pago, solo
  // adjuntamos al endpoint PATCH existente.
  // POR QUE: FINAL §15 — la orden se crea automaticamente al subir comprobante en
  // paso 3. La decision endpoint vs flag esta documentada en el commit message.
  const handleProofFiles = async (files) => {
    const fileList = Array.from(files || []);
    if (!fileList.length) return;
    if (paymentUploadTargetOrder()) {
      await uploadPaymentProofFromFlow(fileList, renderCustomer);
      return;
    }
    await submitOrderWithProofs(fileList);
  };

  flowPaymentDropzone?.addEventListener("click", (event) => {
    // Si el dropzone esta deshabilitado, su hint interno ya explica el motivo
    // (auth, verificacion, orden en revision). Solo bloqueamos el file picker.
    if (flowPaymentDropzone.dataset.disabled === "true") event.preventDefault();
  });
  flowPaymentInput?.addEventListener("change", async () => {
    const files = flowPaymentInput.files;
    try {
      await handleProofFiles(files);
    } finally {
      if (flowPaymentInput) flowPaymentInput.value = "";
    }
  });
  ["dragenter", "dragover"].forEach((eventName) => {
    flowPaymentDropzone?.addEventListener(eventName, (event) => {
      if (!hasDraggedFiles(event)) return;
      event.preventDefault();
      event.stopPropagation();
      if (flowPaymentDropzone.dataset.disabled === "true") {
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
    flowPaymentDropzone.classList.remove("drag-active");
    if (flowPaymentDropzone.dataset.disabled === "true") return;
    await handleProofFiles(event.dataTransfer?.files || []);
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
