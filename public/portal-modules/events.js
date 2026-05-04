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
  setSelectedPayment,
  updateQuote,
} from "./payments.js";
import { filesToProofs, hasDraggedFiles, uploadPaymentProofFromFlow, wireGlobalFileDropGuard } from "./proofs.js";
import { renderTrackedOrder } from "./deep-links.js";
import { hidePanelNotice, showPanelNotice } from "./panel-notices.js";
import {
  flashCopyFeedback,
  flashPanel3DropzoneError,
  setPanel3ProofState,
  togglePanel3AlternativeAccount,
  togglePanel3Qr,
} from "./panel-3-account.js";
import { handlePanel4Copy } from "./panel-4-connection.js";
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

  // Click delegado para el botón "Equipo conectado" (#panel4EquipoConectado).
  // Sub-commit 15c.1: el click es NO-OP por decisión explícita — la llamada a
  // notifyEquipoConectado() se reconecta en 15c.4 cuando se cierre el wiring
  // backend del Panel 4. El selector y data-flow-action quedan intactos para
  // que la reactivación sea trivial. El listener delega al #orderForm que
  // envuelve la .panels-row (el botón está dentro de .panel.panel-4 que es
  // descendiente del form).
  $("#orderForm")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-flow-action='notify-connected']");
    if (!button) return;
    event.preventDefault();
    // 15c.4 restaurará: const order = activeOrderForFlow(state.customer);
    //                   await notifyEquipoConectado(order.id); ...
  });

  // Sub-commit 15c.1 — Panel 4 nuevo: botones Copiar (delegación por data-attr)
  // y botón Descargar Redirector (no-op en 15c.1; se conecta en 15c.3 con la
  // descarga real del .exe). Spec panel-4-conexion.md v1.1 §2.4 + §5.
  $("#panel4")?.addEventListener("click", async (event) => {
    if (!(event.target instanceof Element)) return;
    const copyBtn = event.target.closest(".panel-4-copy-btn");
    if (copyBtn) {
      await handlePanel4Copy(copyBtn);
      return;
    }
    const downloadBtn = event.target.closest("#panel4DownloadBtn");
    if (downloadBtn) {
      event.preventDefault();
      // 15c.3 restaurará: trigger descarga de /downloads/usb-redirector-customer.exe
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
  // Sub-commit 15b.2: el botón "Cuentas" (#copyPaymentButton) vivía en
  // .legacy-step-3 y ya no existe — eliminado del DOM al migrar la dropzone
  // al panel 3 nuevo. Los listeners del modal Cuentas (cerrar, click outside,
  // Escape) quedan vivos por si algún caller futuro vuelve a abrirlo.
  $("#closePaymentModal")?.addEventListener("click", closePaymentModal);
  $("#paymentModal")?.addEventListener("click", (event) => {
    if (event.target?.id === "paymentModal") closePaymentModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closePaymentModal();
  });

  // Sub-commit 15b.1 — panel 3 nuevo: botones Copiar (delegación por field),
  // toggle Mostrar/Ocultar QR, link "Ver otra cuenta Yape".
  // Spec panel-3-datos-de-pago.md v1.0 §5.
  $("#panel3AccountFields")?.addEventListener("click", (event) => {
    const button = event.target instanceof Element ? event.target.closest(".panel-3-copy-btn") : null;
    if (!button) return;
    const value = button.dataset.copyValue || "";
    if (!value) return;
    copyText(value);
    flashCopyFeedback(button);
  });
  $("#panel3QrToggle")?.addEventListener("click", () => {
    togglePanel3Qr();
    updateQuote();
  });
  $("#panel3YapeAltLink")?.addEventListener("click", () => {
    togglePanel3AlternativeAccount();
    updateQuote();
  });

  // Sub-commit 15b.2 — dropzone nueva en panel 3. Spec panel-3-datos-de-pago.md
  // v1.0 §2.5 + §5. Bifurcación POST/PATCH preservada (E.5 sesión 16):
  // - sin orden activa → POST /api/portal/orders/frp (crea + adjunta).
  // - con orden esperando → PATCH /api/portal/orders/:id/payment-proof.
  const panel3Proof = $("#panel3Proof");
  const panel3Dropzone = $("#panel3Dropzone");
  const panel3ProofInput = $("#panel3ProofInput");
  const panel3ProofAction = $("#panel3ProofAction");

  const dropzoneIsDisabled = () => panel3Proof?.dataset.locked === "true"
    || ["uploading", "validated"].includes(panel3Proof?.dataset.state || "");

  const handleProofFiles = async (files) => {
    const fileList = Array.from(files || []);
    if (!fileList.length) return;
    setPanel3ProofState("uploading");
    try {
      if (paymentUploadTargetOrder()) {
        await uploadPaymentProofFromFlow(fileList, renderCustomer);
      } else {
        await submitOrderWithProofs(fileList);
      }
      // Sub-commit 15b.2-ter Bug A: limpiar el "uploading" transitorio para
      // que renderProofBlock pueda pintar el estado lógico (uploaded/rejected)
      // según la orden ya actualizada en state.customer.orders.
      setPanel3ProofState("default");
      updateQuote();
    } catch (error) {
      // Errores de validación (tipo/tamaño) muestran cajón inline 4s y
      // vuelven a default. Otros errores (red/backend) usan flow de #orderMessage.
      if (error?.code === "TYPE") {
        flashPanel3DropzoneError("error-type", "Tipo no permitido. Solo JPG, PNG o PDF.");
      } else if (error?.code === "SIZE") {
        flashPanel3DropzoneError("error-size", "Archivo muy grande. Máximo 5 MB.");
      } else {
        setPanel3ProofState("default");
        setMessage($("#orderMessage"), error.message || "No se pudo subir el comprobante.", "error");
      }
    }
  };

  panel3Dropzone?.addEventListener("click", (event) => {
    if (dropzoneIsDisabled()) {
      event.preventDefault();
    }
  });
  panel3Dropzone?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      if (dropzoneIsDisabled()) return;
      event.preventDefault();
      panel3ProofInput?.click();
    }
  });
  panel3ProofInput?.addEventListener("change", async () => {
    const files = panel3ProofInput.files;
    try {
      await handleProofFiles(files);
    } finally {
      if (panel3ProofInput) panel3ProofInput.value = "";
    }
  });

  // Drag-over visual + drop en la dropzone Y sobre el thumbnail rechazado
  // (spec §5: "Drop de archivo encima del thumbnail rechazado lo reemplaza").
  const proofDropTargets = [panel3Dropzone, $("#panel3ProofCard")].filter(Boolean);
  proofDropTargets.forEach((target) => {
    ["dragenter", "dragover"].forEach((eventName) => {
      target.addEventListener(eventName, (event) => {
        if (!hasDraggedFiles(event)) return;
        event.preventDefault();
        event.stopPropagation();
        if (dropzoneIsDisabled()) {
          if (event.dataTransfer) event.dataTransfer.dropEffect = "none";
          return;
        }
        if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
        if (panel3Proof) panel3Proof.dataset.state = "dragover";
      });
    });
    ["dragleave", "dragend"].forEach((eventName) => {
      target.addEventListener(eventName, (event) => {
        event.preventDefault();
        event.stopPropagation();
        // Sólo limpiamos dragover si el cursor sale del bloque entero.
        if (panel3Proof?.dataset.state === "dragover") {
          // Restaurar al estado lógico (uploaded/rejected/default) según la orden.
          updateQuote();
        }
      });
    });
    target.addEventListener("drop", async (event) => {
      if (!hasDraggedFiles(event)) return;
      event.preventDefault();
      event.stopPropagation();
      if (dropzoneIsDisabled()) return;
      await handleProofFiles(event.dataTransfer?.files || []);
    });
  });

  // Botón Reemplazar / Subir otro (mismo nodo, label dinámico según estado).
  panel3ProofAction?.addEventListener("click", () => {
    if (dropzoneIsDisabled()) return;
    panel3ProofInput?.click();
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
