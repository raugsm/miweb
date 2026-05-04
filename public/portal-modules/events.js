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
import { checkEligibilityHint, clampQuantityWithFlag, parseItems, setQuantity, syncDetectedItems } from "./frp.js";
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

// Sub-commit 15a.1: helpers para mostrar/ocultar cajones (notices) en los
// paneles 1 y 2 con duración configurable. Cada panel tiene UN solo cajón a la
// vez; si llega un segundo evento mientras el primero está visible, el segundo
// reemplaza al primero (decisión spec panel-1 §3 edge 10: "prevalece el primero
// que se disparó" se interpreta acá como "el último click del cliente reemplaza
// el cajón visible" — los cajones admin-driven en vivo viven en sub-commit
// 15a.2 con SSE admin-config).
const noticeTimers = new Map();

function showPanelNotice(nodeId, content, { durationMs = 15000, variant = "warning" } = {}) {
  const node = document.getElementById(nodeId);
  if (!node) return;
  if (noticeTimers.has(nodeId)) clearTimeout(noticeTimers.get(nodeId));
  node.textContent = content;
  node.dataset.variant = variant;
  node.hidden = false;
  if (durationMs > 0) {
    noticeTimers.set(nodeId, setTimeout(() => hidePanelNotice(nodeId), durationMs));
  }
}

function hidePanelNotice(nodeId) {
  const node = document.getElementById(nodeId);
  if (noticeTimers.has(nodeId)) {
    clearTimeout(noticeTimers.get(nodeId));
    noticeTimers.delete(nodeId);
  }
  if (node) {
    node.hidden = true;
    node.textContent = "";
    node.removeAttribute("data-variant");
  }
}

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
    // PR-2a-final.bundle2-bugs BUG 11: el buscador del paso 2 es helper visual
    // CLIENT-SIDE solamente — no propagamos su valor al body. Si propagaramos
    // "Redmi Note 12S" (REVISION_REQUERIDA) o "Redmi A3X" (NO_APTO_MODO), el
    // backend bloquea con 409 "AriadGSM debe confirmar compatibilidad...". Spec
    // FINAL: validacion OPCIONAL — el cliente experto sabe lo que pide y la
    // orden no debe gate por hint en el buscador. Items con originalText vacio
    // retornan APTO_EXPRESS via la guarda al inicio de frpEligibilityResult,
    // sin review y sin gate.
    const payload = await api("/api/portal/orders/frp", {
      method: "POST",
      body: JSON.stringify({
        quantity,
        paymentMethod: data.paymentMethod,
        items: parseItems("", quantity),
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

  // Sub-commit 15a.1: stepper +/- del panel 2. setQuantity() ya cap interno a
  // 1-10. El cajón verde "Para más de 10..." NO se dispara desde botones (no
  // permitimos al usuario ir más allá de 10 con +); se dispara solo cuando el
  // usuario tipea directo en el input un número >10 (handler abajo).
  $("#orderForm")?.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-quantity-action]");
    if (!btn) return;
    event.preventDefault();
    const input = $("#panel2QuantityInput");
    const current = Number(input?.value || "1") || 1;
    const next = btn.dataset.quantityAction === "inc" ? current + 1 : current - 1;
    setQuantity(next);
    syncDetectedItems();
    updateQuote();
  });

  // Sub-commit 15a.1: input directo en stepper. Filtro no-dígitos en `input`
  // event; cap + cajón verde en `change` (Enter o blur).
  const panel2QuantityInput = $("#panel2QuantityInput");
  panel2QuantityInput?.addEventListener("input", (event) => {
    const cleaned = String(event.currentTarget.value || "").replace(/[^\d]/g, "");
    if (cleaned !== event.currentTarget.value) {
      event.currentTarget.value = cleaned;
    }
  });
  panel2QuantityInput?.addEventListener("change", (event) => {
    const { value, capped } = clampQuantityWithFlag(event.currentTarget.value);
    setQuantity(value);
    syncDetectedItems();
    updateQuote();
    if (capped) {
      showPanelNotice("panel2Notice", "Para más de 10 equipos, contactanos por WhatsApp", {
        durationMs: 15000,
        variant: "success",
      });
    } else {
      // Si el usuario bajó la cantidad por debajo de 10 antes de que se cierre
      // el cajón verde, lo escondemos. Si el cajón actual es de modelo (warning),
      // lo dejamos vivo — no es del mismo trigger.
      const notice = document.getElementById("panel2Notice");
      if (notice && notice.dataset.variant === "success") hidePanelNotice("panel2Notice");
    }
  });

  // Sub-commit 15a.1: input modelo del panel 2. Debounce 300ms, 3 estados
  // visuales (apto / no-supported / not-recognized) + cajón amarillo dentro
  // de la card oscura del panel 2. Cajón dura 15s o se cierra al corregir.
  const panel2ModelInput = $("#panel2ModelInput");
  let modelDebounceTimer = null;
  panel2ModelInput?.addEventListener("input", (event) => {
    if (modelDebounceTimer) clearTimeout(modelDebounceTimer);
    const value = event.currentTarget.value;
    modelDebounceTimer = setTimeout(() => {
      const result = checkEligibilityHint(value);
      if (result.status === "EMPTY") {
        panel2ModelInput.dataset.eligibilityState = "";
        const notice = document.getElementById("panel2Notice");
        if (notice && notice.dataset.variant === "warning") hidePanelNotice("panel2Notice");
        return;
      }
      if (result.status === "ASSUMED_OK") {
        panel2ModelInput.dataset.eligibilityState = "apto";
        const notice = document.getElementById("panel2Notice");
        if (notice && notice.dataset.variant === "warning") hidePanelNotice("panel2Notice");
        return;
      }
      // NO_APTO_MODO o REQUIERE_REVISION → border rojo + cajón amarillo.
      // Spec panel-2 §2.2 distingue 3 estados visuales: NO_APTO_MODO mapea a
      // "not-supported"; REQUIERE_REVISION mapea a "not-recognized" en la spec
      // (modelo "no reconocido"), aunque en backend sea otro flag — la UX para
      // el cliente es la misma intención (border rojo + cajón amarillo informando).
      const isNotSupported = result.status === "NO_APTO_MODO";
      panel2ModelInput.dataset.eligibilityState = isNotSupported ? "not-supported" : "not-recognized";
      const message = isNotSupported
        ? "Este modelo no es soportado"
        : "No reconocemos el modelo, revisalo o dejalo vacío";
      showPanelNotice("panel2Notice", message, { durationMs: 15000, variant: "warning" });
    }, 300);
  });

  // Sub-commit 15a.1: pills delegado del panel 1. Click en pill desactivada
  // dispara cajón amarillo en `#panel1EstimateNotice` (4s, decisión spec v2.0
  // §2.2). Click en pill activa setea + persiste en localStorage + recalcula.
  $("#flowPaymentPills")?.addEventListener("click", (event) => {
    const pill = event.target.closest("[data-payment-pill]");
    if (!pill) return;
    if (pill.dataset.disabled === "true") {
      // El mensaje "USDT pausado por mantenimiento" / equivalente vendrá del
      // catálogo backend (`payment.customMessage`) cuando el Centro de
      // configuración exista (sub-commit 15a.2). Por ahora usamos el default.
      showPanelNotice("panel1EstimateNotice", "No disponible temporalmente", {
        durationMs: 4000,
        variant: "warning",
      });
      return;
    }
    setSelectedPayment(pill.dataset.paymentPill);
    updateQuote();
  });
  // PR-2a-final.fase4: modal "¿Dónde pegar?" — abrir desde paso 4.
  $("#orderForm")?.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-action='open-where-paste']");
    if (!btn) return;
    event.preventDefault();
    document.querySelector("#wherePasteDialog")?.showModal();
  });
  document.querySelector("#wherePasteDialog")?.addEventListener("click", (event) => {
    if (event.target.closest("[data-where-paste-action='close']")) {
      event.preventDefault();
      document.querySelector("#wherePasteDialog")?.close();
    }
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
