// Sub-commit 15b.1 + 15b.2 — render del panel 3 (Datos de pago) entero.
// Spec: docs/specs/cliente/panel-3-datos-de-pago.md v1.0 §1-§7.
//
// QUE: dado el método elegido en panel 1 + el total calculado en panel 2 +
// la lista de órdenes del cliente, renderiza:
//   - Card oscura "TOTAL A PAGAR" (bandera + monto local).
//   - Card cuenta del método (logo + displayName + fields + Copiar individual + toggle QR).
//   - Link "Ver otra cuenta Yape" cuando aplique.
//   - Bloque del comprobante con 6 estados de dropzone + 4 estados post-subida
//     (Subiendo, Subido, Validado, Rechazado con motivo).
//
// El bloque del comprobante reacciona a `state.customer.orders[]` — el SSE
// existente (live-orders.js) dispara updateQuote() ante cualquier cambio de
// orden, lo cual re-ejecuta updatePanel3 con el contexto actualizado.

import { $ } from "./dom.js";
import { paymentAmountText, paymentByCode, paymentFlagSvg } from "./payments.js";
import { state } from "./state.js";

// Estado in-memory del panel. Se resetea cuando cambia la pill (panel 1) o
// cuando el método deja de tener alternativa.
const panelState = {
  qrOpen: false,
  // Cuando el cliente apreta "Ver otra cuenta Yape", se setea al code de la
  // cuenta alternativa y la card pasa a renderizarla. Click en el link otra vez
  // vuelve a null y muestra la principal de la pill.
  overrideAccountCode: null,
  // Para detectar cambio de pill y resetear estado local.
  lastPaymentCode: null,
};

// SVGs inline de los logos por método. Cada uno es 22x22 para alinear con la
// bandera del header de la card oscura. Sub-commit 15b.1: shapes según spec §2.2
// (Yape morado con Y, Binance amarillo con B, MP con ícono genérico de banco).
const ACCOUNT_LOGO_SVGS = {
  yape: '<svg viewBox="0 0 22 22" width="22" height="22" aria-hidden="true"><circle cx="11" cy="11" r="11" fill="#642B73"/><text x="11" y="15" text-anchor="middle" font-size="13" font-weight="700" fill="#FFFFFF" font-family="Arial,sans-serif">Y</text></svg>',
  binance: '<svg viewBox="0 0 22 22" width="22" height="22" aria-hidden="true"><rect width="22" height="22" rx="4" fill="#F0B90B"/><text x="11" y="15" text-anchor="middle" font-size="12" font-weight="700" fill="#1E1E1E" font-family="Arial,sans-serif">B</text></svg>',
  stp: '<svg viewBox="0 0 22 22" width="22" height="22" aria-hidden="true"><circle cx="11" cy="11" r="11" fill="#E8EDF5"/><path d="M5 14h12M5 11h12M5 8h12M7 8v6M11 8v6M15 8v6M3 16h16" stroke="#314660" stroke-width="1.2" fill="none" stroke-linecap="round"/></svg>',
  bancolombia: '<svg viewBox="0 0 22 22" width="22" height="22" aria-hidden="true"><circle cx="11" cy="11" r="11" fill="#FCD116"/><path d="M5 14h12M5 11h12M5 8h12M7 8v6M11 8v6M15 8v6M3 16h16" stroke="#1F3D6B" stroke-width="1.2" fill="none" stroke-linecap="round"/></svg>',
  mp: '<svg viewBox="0 0 22 22" width="22" height="22" aria-hidden="true"><circle cx="11" cy="11" r="11" fill="#00B1EA"/><path d="M5 14h12M5 11h12M5 8h12M7 8v6M11 8v6M15 8v6M3 16h16" stroke="#FFFFFF" stroke-width="1.2" fill="none" stroke-linecap="round"/></svg>',
};

function logoSvg(logoId) {
  return ACCOUNT_LOGO_SVGS[logoId] || ACCOUNT_LOGO_SVGS.stp;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch] || ch));
}

// Devuelve el método "vigente" para el panel 3: si el cliente activó la
// alternativa Yape, devuelve la cuenta alternativa; si no, el método base.
function effectivePayment(basePayment) {
  if (panelState.overrideAccountCode) {
    const alt = paymentByCode(panelState.overrideAccountCode);
    if (alt) return alt;
  }
  return basePayment;
}

// Render de los fields dinámicos. Cada field con copyable: true tiene su
// propio botón Copiar individual con feedback "Copiado ✓" 1.5s.
// Spec §2.2 + acceptance 12-14.
function renderFieldsHtml(fields) {
  if (!Array.isArray(fields) || !fields.length) return "";
  return fields.map((field, index) => {
    const labelHtml = `<p class="panel-3-account-field-label">${escapeHtml(field.label)}</p>`;
    if (field.copyable) {
      const monoClass = field.monospace ? " is-monospace" : "";
      return `${labelHtml}
        <div class="panel-3-account-field-value is-copyable${monoClass}">
          <span class="panel-3-account-field-text">${escapeHtml(field.value)}</span>
          <button type="button" class="panel-3-copy-btn" data-copy-target="${index}" data-copy-value="${escapeHtml(field.value)}" aria-label="Copiar ${escapeHtml(field.label)}">Copiar</button>
        </div>`;
    }
    return `${labelHtml}
      <p class="panel-3-account-field-value">${escapeHtml(field.value)}</p>`;
  }).join("");
}

// Render principal del panel 3. Llamado desde payments.js#updateQuote.
// Recibe el contexto resuelto (payment seleccionado en panel 1, total en USDT).
export function updatePanel3(context = {}) {
  const basePayment = context.selectedPayment || null;
  const totalUsdt = Number(context.totalUsdt || 0);

  // Reset de estado local cuando cambia la pill seleccionada en panel 1.
  if (basePayment?.code !== panelState.lastPaymentCode) {
    panelState.qrOpen = false;
    panelState.overrideAccountCode = null;
    panelState.lastPaymentCode = basePayment?.code || null;
  }

  const totalCard = $("#panel3TotalCard");
  const totalFlag = $("#panel3TotalFlag");
  const totalAmount = $("#panel3TotalAmount");
  const accountCard = $("#panel3AccountCard");
  const accountLogo = $("#panel3AccountLogo");
  const accountName = $("#panel3AccountName");
  const accountFields = $("#panel3AccountFields");
  const accountQr = $("#panel3AccountQr");
  const accountQrImg = $("#panel3AccountQrImg");
  const qrToggle = $("#panel3QrToggle");
  const yapeAltLink = $("#panel3YapeAltLink");
  const emptyHint = $("#panel3EmptyHint");

  // Sin método elegido (caso raro — panel 1 autoelige país por perfil).
  // Spec §2.1 estado "Sin método elegido" + §3 edge 2.
  if (!basePayment) {
    if (totalCard) totalCard.hidden = true;
    if (accountCard) accountCard.hidden = true;
    if (yapeAltLink) yapeAltLink.hidden = true;
    if (emptyHint) emptyHint.hidden = false;
    return;
  }

  if (emptyHint) emptyHint.hidden = true;
  if (totalCard) totalCard.hidden = false;

  // Card oscura — bandera + monto. Sub-commit 15b.1-bis: usamos paymentAmountText
  // (que convierte USDT → moneda local + formatea) en vez de la función local
  // duplicada que olvidaba la conversión de tasa.
  if (totalFlag) totalFlag.innerHTML = paymentFlagSvg(basePayment);
  if (totalAmount) {
    totalAmount.textContent = totalUsdt > 0
      ? paymentAmountText(totalUsdt, basePayment)
      : "—";
  }

  // Card cuenta — usa el método "vigente" (principal o alternativa Yape).
  const activeAccount = effectivePayment(basePayment);
  if (accountCard) accountCard.hidden = false;
  if (accountLogo) accountLogo.innerHTML = logoSvg(activeAccount.logo);
  if (accountName) accountName.textContent = activeAccount.displayName || activeAccount.label || "Cuenta";
  if (accountFields) accountFields.innerHTML = renderFieldsHtml(activeAccount.fields || []);

  // Toggle QR — el botón sólo aparece si la cuenta vigente tiene qrImageUrl.
  // Spec §2.4 + §3 edge 9 (cambio de método cierra el QR automáticamente).
  if (qrToggle) {
    if (activeAccount.qrImageUrl) {
      qrToggle.hidden = false;
      qrToggle.textContent = panelState.qrOpen ? "Ocultar QR" : "Mostrar QR";
    } else {
      qrToggle.hidden = true;
      panelState.qrOpen = false;
    }
  }
  if (accountQr) {
    if (panelState.qrOpen && activeAccount.qrImageUrl) {
      accountQr.hidden = false;
      if (accountQrImg) accountQrImg.src = activeAccount.qrImageUrl;
    } else {
      accountQr.hidden = true;
    }
  }

  // Link Yape alternativa — sólo cuando el método base tiene
  // alternativeAccountKey definido. El texto cambia según override activo.
  // Spec §2.3 + acceptance 20-22.
  if (yapeAltLink) {
    if (basePayment.alternativeAccountKey) {
      yapeAltLink.hidden = false;
      yapeAltLink.textContent = panelState.overrideAccountCode
        ? "Volver a la cuenta principal"
        : "Ver otra cuenta Yape";
    } else {
      yapeAltLink.hidden = true;
    }
  }

  // Bloque del comprobante — sub-commit 15b.2. Spec §2.5 + §2.6.
  renderProofBlock();
}

// QUE: pinta el bloque #panel3Proof según el estado de la orden activa
// (state.customer.orders[]) o el estado transitorio (uploading / error).
// El estado transitorio (uploading, error-type, error-size, dragover) se
// preserva si está en curso — los timers de error se manejan en
// flashPanel3DropzoneError. El estado lógico (default/uploaded/validated/
// rejected) se deriva de la orden y siempre prevalece tras la transición.
function renderProofBlock() {
  const proof = $("#panel3Proof");
  if (!proof) return;

  // Estados transitorios mantienen su data-state hasta que su timer expire
  // o el upload termine. NO los pisamos en este re-render.
  const transitional = ["uploading", "error-type", "error-size", "error-backend", "dragover"];
  if (transitional.includes(proof.dataset.state)) return;

  const customer = state.customer;
  const orders = customer?.orders || [];
  const orderInReview = orders.find((order) => order.publicStatus === "PAGO_EN_REVISION") || null;
  const orderRejected = orders.find((order) => order.publicStatus === "PAGO_RECHAZADO") || null;
  const authenticated = Boolean(customer?.user && customer?.client);
  const emailVerified = Boolean(customer?.client?.emailVerified);
  const lock = !authenticated || !emailVerified;
  proof.dataset.locked = lock ? "true" : "false";

  const dropzone = $("#panel3Dropzone");
  const proofCard = $("#panel3ProofCard");
  const proofThumb = $("#panel3ProofThumb");
  const proofLabel = $("#panel3ProofLabel");
  const proofAction = $("#panel3ProofAction");
  const validated = $("#panel3ProofValidated");
  const rejectedReason = $("#panel3ProofRejectedReason");
  const rejectedText = $("#panel3ProofRejectedText");
  const dropHint = $("#panel3ProofDropHint");

  // Helper: oculta todos los sub-bloques antes de mostrar el correspondiente.
  const hideAll = () => {
    if (proofCard) proofCard.hidden = true;
    if (validated) validated.hidden = true;
    if (rejectedReason) rejectedReason.hidden = true;
    if (dropHint) dropHint.hidden = true;
    if (dropzone) dropzone.hidden = false;
  };

  if (orderInReview) {
    // Estado "Subido (esperando validación)" — thumbnail + Reemplazar.
    proof.dataset.state = "uploaded";
    hideAll();
    if (dropzone) dropzone.hidden = true;
    if (proofCard) {
      proofCard.hidden = false;
      const proofs = orderInReview.paymentProofs || [];
      const lastProof = proofs[proofs.length - 1];
      if (proofThumb) proofThumb.innerHTML = proofThumbSvg(lastProof);
      if (proofLabel) proofLabel.textContent = "Comprobante listo";
      if (proofAction) {
        proofAction.textContent = "Reemplazar";
        proofAction.setAttribute("aria-label", "Reemplazar comprobante");
      }
    }
    return;
  }

  if (orderRejected) {
    // Thumbnail con X roja + botón Subir otro + cajón rojo con motivo
    // + texto "o arrastrá un archivo nuevo encima". Spec §2.6 + §3 edge 11.
    proof.dataset.state = "rejected";
    hideAll();
    if (dropzone) dropzone.hidden = true;
    if (proofCard) {
      proofCard.hidden = false;
      const proofs = orderRejected.paymentProofs || [];
      const lastProof = proofs[proofs.length - 1];
      if (proofThumb) proofThumb.innerHTML = proofThumbSvg(lastProof, true);
      if (proofLabel) proofLabel.textContent = "Comprobante · Rechazado";
      if (proofAction) {
        proofAction.textContent = "Subir otro";
        proofAction.setAttribute("aria-label", "Subir otro comprobante");
      }
    }
    if (rejectedReason && rejectedText) {
      // Spec §2.6 + decisión E.3 sesión 16: el operador escribe texto libre
      // (no dropdown). Mostramos el string entero sin parsing title/detail.
      const reason = String(orderRejected.paymentRejectedReason || "").trim()
        || "Comprobante rechazado.";
      rejectedText.textContent = reason;
      rejectedReason.hidden = false;
    }
    if (dropHint) dropHint.hidden = false;
    return;
  }

  // Estado default — sin orden activa o sin comprobante en flujo. Spec §2.5.
  proof.dataset.state = "default";
  hideAll();
}

// Devuelve un SVG simple según el tipo de archivo del proof. Si no hay proof,
// devuelve el ícono genérico de imagen.
function proofThumbSvg(proof, rejected = false) {
  const isPdf = String(proof?.type || "").toLowerCase() === "application/pdf";
  const opacity = rejected ? "0.5" : "1";
  if (isPdf) {
    return `<svg viewBox="0 0 24 24" width="48" height="48" aria-hidden="true" opacity="${opacity}"><rect x="4" y="2" width="16" height="20" rx="2" fill="#A32D2D"/><text x="12" y="16" text-anchor="middle" font-size="7" font-weight="700" fill="#FFFFFF" font-family="Arial,sans-serif">PDF</text></svg>`;
  }
  return `<svg viewBox="0 0 24 24" width="48" height="48" aria-hidden="true" opacity="${opacity}"><rect x="3" y="4" width="18" height="16" rx="2" fill="#E8EDF5" stroke="#314660" stroke-width="0.5"/><circle cx="9" cy="10" r="1.5" fill="#314660"/><path d="M3 18l5-5 4 4 3-3 6 6H3z" fill="#314660"/></svg>`;
}

// Setea el estado transitorio del bloque proof (uploading/dragover/etc.).
// Llamado desde events.js cuando arranca un upload o cambia el visual de drag.
export function setPanel3ProofState(stateName) {
  const proof = $("#panel3Proof");
  if (!proof) return;
  proof.dataset.state = stateName;
}

// Muestra el cajón rojo inline con el mensaje de error de validación durante
// 4 segundos, después vuelve a default. Spec §2.5 (estados error-type / error-size).
// Tambien se usa para errores backend/red del comprobante con estado error-backend.
let dropzoneErrorTimer = null;
export function flashPanel3DropzoneError(stateName, message) {
  const proof = $("#panel3Proof");
  const errorNode = $("#panel3DropzoneError");
  if (!proof || !errorNode) return;
  proof.dataset.state = stateName;
  errorNode.textContent = message;
  errorNode.hidden = false;
  if (dropzoneErrorTimer) clearTimeout(dropzoneErrorTimer);
  dropzoneErrorTimer = setTimeout(() => {
    errorNode.hidden = true;
    errorNode.textContent = "";
    proof.dataset.state = "default";
    renderProofBlock();
    dropzoneErrorTimer = null;
  }, 4000);
}

// Toggle del QR — invocado desde events.js. Sólo muta estado; quien llama
// debe disparar el re-render (events.js llama a updateQuote() después).
export function togglePanel3Qr() {
  panelState.qrOpen = !panelState.qrOpen;
}

// Alterna entre cuenta principal y alternativa (Yape doble). Sólo muta estado.
export function togglePanel3AlternativeAccount() {
  const basePayment = paymentByCode(panelState.lastPaymentCode);
  if (!basePayment?.alternativeAccountKey) return;
  panelState.overrideAccountCode = panelState.overrideAccountCode
    ? null
    : basePayment.alternativeAccountKey;
  // El QR de la alternativa puede ser distinto — reset por seguridad.
  panelState.qrOpen = false;
}

// Helper de feedback "Copiado ✓" 1.5s. Cada botón tiene su propio timer.
const copyTimers = new WeakMap();
export function flashCopyFeedback(button) {
  if (!button) return;
  const original = button.dataset.originalLabel || button.textContent;
  if (!button.dataset.originalLabel) button.dataset.originalLabel = original;
  button.textContent = "Copiado ✓";
  button.classList.add("is-copied");
  const previous = copyTimers.get(button);
  if (previous) clearTimeout(previous);
  const timer = setTimeout(() => {
    button.textContent = original;
    button.classList.remove("is-copied");
    copyTimers.delete(button);
  }, 1500);
  copyTimers.set(button, timer);
}
