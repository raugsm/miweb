import { $, $$, copyText, escapeHtml, setMessage } from "./dom.js";
import { estimatePortalPrice, syncDetectedItems } from "./frp.js";
import { money } from "./format.js";
import { orderNeedsPaymentProof, sortOrdersForDisplay } from "./order-state.js";
import { state } from "./state.js";

export function exchangeRateForPayment(payment = currentPayment()) {
  if (!payment?.currency || payment.currency === "USDT") return 1;
  const rate = (state.catalog?.exchangeRates || []).find((candidate) => candidate.currency === payment.currency);
  return Number(rate?.ratePerUsdt || 0);
}

export function paymentCurrencyAmount(value, payment = currentPayment()) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return 0;
  if (!payment || payment.currency === "USDT") return amount;
  const rate = exchangeRateForPayment(payment);
  return rate > 0 ? amount * rate : null;
}

export function paymentAmountText(value, payment = currentPayment()) {
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

// PR-2a-final.fase3: SVG flags inline reemplazan emoji per FINAL §4. Cada
// flag es una aproximacion sencilla (rectangulos de color del pais). Logos
// oficiales descargados quedan para PR-3.
const PAYMENT_FLAG_SVGS = {
  Mexico: '<svg viewBox="0 0 18 12" width="18" height="12" aria-hidden="true"><rect width="6" height="12" fill="#006847"/><rect x="6" width="6" height="12" fill="#fff"/><rect x="12" width="6" height="12" fill="#ce1126"/></svg>',
  Peru: '<svg viewBox="0 0 18 12" width="18" height="12" aria-hidden="true"><rect width="6" height="12" fill="#d91023"/><rect x="6" width="6" height="12" fill="#fff"/><rect x="12" width="6" height="12" fill="#d91023"/></svg>',
  Colombia: '<svg viewBox="0 0 18 12" width="18" height="12" aria-hidden="true"><rect width="18" height="6" fill="#fcd116"/><rect y="6" width="18" height="3" fill="#003893"/><rect y="9" width="18" height="3" fill="#ce1126"/></svg>',
  Chile: '<svg viewBox="0 0 18 12" width="18" height="12" aria-hidden="true"><rect width="9" height="6" fill="#0039a6"/><rect x="9" width="9" height="6" fill="#fff"/><rect y="6" width="18" height="6" fill="#d52b1e"/><polygon points="4.5,3 5,4.4 6.5,4.4 5.3,5.3 5.7,6.7 4.5,5.9 3.3,6.7 3.7,5.3 2.5,4.4 4,4.4" fill="#fff"/></svg>',
  Global: '<svg viewBox="0 0 18 12" width="18" height="12" aria-hidden="true"><circle cx="9" cy="6" r="5.5" fill="#26A17B"/><text x="9" y="9" fill="#fff" font-size="7" font-weight="700" text-anchor="middle" font-family="Arial,sans-serif">₮</text></svg>',
};

export function paymentFlagSvg(payment = currentPayment()) {
  const country = String(payment?.country || "");
  return PAYMENT_FLAG_SVGS[country] || PAYMENT_FLAG_SVGS.Global;
}

// Compat con consumidores que esperan un texto corto (operator panel, etc).
export function paymentFlag(payment = currentPayment()) {
  const country = String(payment?.country || "");
  const byCountry = { Mexico: "🇲🇽", Peru: "🇵🇪", Colombia: "🇨🇴", Chile: "🇨🇱", Global: "🌎" };
  return byCountry[country] || "🌎";
}

export function paymentOptionLabel(payment) {
  if (!payment) return "Método de pago";
  return `${paymentFlag(payment)} ${payment.label}`;
}

// PR-2a-final.fase3: render del listado de pills de paso 1 (FINAL §4). Cada
// pill tiene flag SVG + nombre del pais. Click setea hidden input value y
// dispara updateQuote para recalcular el precio en la nueva moneda.
export function renderPaymentPills() {
  const container = $("#flowPaymentPills");
  const hidden = $("#paymentSelect");
  if (!container || !hidden) return;
  const compatible = compatiblePaymentMethodsForCustomer();
  if (!compatible.length) {
    container.innerHTML = "";
    hidden.value = "";
    return;
  }
  const previousValue = hidden.value;
  const preferred = preferredPaymentForCustomer();
  const selectedCode = compatible.find((p) => p.code === previousValue)?.code
    || preferred?.code
    || compatible[0]?.code
    || "";
  hidden.value = selectedCode;
  container.innerHTML = compatible.map((payment) => {
    const isSelected = payment.code === selectedCode;
    const country = String(payment.country || "");
    const label = country === "Global" ? "USDT" : country;
    return `
      <button type="button" role="radio" class="flow-payment-pill${isSelected ? " is-selected" : ""}"
              data-payment-pill="${payment.code}" aria-checked="${isSelected ? "true" : "false"}">
        <span class="flow-payment-pill-flag">${paymentFlagSvg(payment)}</span>
        <span class="flow-payment-pill-label">${label}</span>
      </button>
    `;
  }).join("");
}

// Helper para que events.js sincronice valor + UI cuando cambia desde fuera.
export function setSelectedPayment(code) {
  const hidden = $("#paymentSelect");
  if (!hidden) return;
  hidden.value = code;
  $$(".flow-payment-pill").forEach((pill) => {
    const isSelected = pill.dataset.paymentPill === code;
    pill.classList.toggle("is-selected", isSelected);
    pill.setAttribute("aria-checked", isSelected ? "true" : "false");
  });
}

export function compatiblePaymentMethodsForCustomer() {
  const methods = state.catalog?.paymentMethods || [];
  const country = state.customer?.client?.country;
  if (!country) return methods;
  const local = methods.filter((payment) => payment.country === country);
  const global = methods.filter((payment) => payment.globalOption);
  const others = methods.filter((payment) => payment.country !== country && !payment.globalOption);
  return local.concat(global, others);
}

export function preferredPaymentForCustomer() {
  const compatible = compatiblePaymentMethodsForCustomer();
  return compatible.find((payment) => !payment.globalOption) || compatible[0] || null;
}

export function currentPayment() {
  const paymentCode = $("#paymentSelect")?.value;
  return compatiblePaymentMethodsForCustomer().find((payment) => payment.code === paymentCode) || preferredPaymentForCustomer();
}

export function paymentByCode(code) {
  return (state.catalog?.paymentMethods || []).find((payment) => payment.code === code) || null;
}

export function binancePayment() {
  return paymentByCode("BINANCE_PAY")
    || (state.catalog?.paymentMethods || []).find((payment) => payment.globalOption && payment.currency === "USDT")
    || null;
}

export function paymentText(payment, totalText = "") {
  if (!payment) return "";
  return [
    totalText ? `Total en ticket: ${totalText}` : "",
    payment.label,
    ...(payment.details || []),
    "Despues de pagar, sube captura del comprobante para validar mas rapido.",
  ].filter(Boolean).join("\n");
}

export function paymentUploadTargetOrder() {
  const orders = state.customer?.orders || [];
  const candidates = sortOrdersForDisplay(orders).filter(orderNeedsPaymentProof);
  if (!candidates.length) return null;
  return candidates.find((order) => order.id === state.activePaymentOrderId) || candidates[0];
}

export function activePaymentContext() {
  const targetOrder = paymentUploadTargetOrder();
  const quantity = syncDetectedItems();
  const estimate = estimatePortalPrice(quantity);
  const selectedPayment = targetOrder ? paymentByCode(targetOrder.paymentMethod) : currentPayment();
  const totalUsdt = Number(targetOrder?.totalPrice || estimate.total || 0);
  return { targetOrder, estimate, selectedPayment, totalUsdt };
}

export function paymentOptionsForContext(context = activePaymentContext()) {
  const selected = context.selectedPayment || currentPayment();
  const binance = binancePayment();
  return [selected, binance].filter(Boolean).filter((payment, index, list) => (
    list.findIndex((candidate) => candidate.code === payment.code) === index
  ));
}

export function paymentOptionAmountText(payment, context = activePaymentContext()) {
  if (context.targetOrder && payment.code === context.targetOrder.paymentMethod) {
    return context.targetOrder.priceFormatted || paymentAmountText(context.totalUsdt, payment);
  }
  return paymentAmountText(context.totalUsdt, payment);
}

export function closePaymentModal() {
  $("#paymentModal")?.classList.add("hidden");
}

export function renderPaymentModal() {
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

export function updateQuote() {
  const quantity = syncDetectedItems();
  const context = activePaymentContext();
  const estimate = context.estimate;
  const payment = context.selectedPayment || currentPayment();
  const unitNode = $("#currentUnitPrice");
  const unitUsdtNode = $("#currentUnitPriceUsdt");
  const paymentBadge = $("#currentPaymentBadge");
  // QUE: paso 1 muestra precio BASE por unidad (constante FINAL §4), no el
  // precio efectivo con tier de volumen aplicado. El total ya descontado vive
  // en paso 3 (#quoteTotalUsdt / #quoteTotalLocal).
  // POR QUE: PR-2a-fix. Antes el paso 1 caia de 25 a 24.6 al subir cantidad,
  // confundiendo al cliente. FINAL §4 spec: precio del paso 1 es "el precio
  // en vivo del momento por unidad", sin volume discount.
  const baseUnit = Number(estimate.base ?? estimate.unit ?? 0);
  if (unitNode) unitNode.textContent = paymentAmountText(baseUnit, payment);
  if (unitUsdtNode) unitUsdtNode.textContent = money(baseUnit);
  if (paymentBadge) paymentBadge.textContent = paymentOptionLabel(payment);

  // QUE: paso 2 muestra el precio EFECTIVO por unidad (con tier de volumen)
  // y el total tambien con tier aplicado.
  // POR QUE: BUG 9-10. #flowQuantityUnitPrice y #flowQuantityTotal estaban en
  // el HTML pero ningun lugar los hidrataba — quedaban como "-" siempre. Spec
  // FINAL §5: stepper muestra precio c/u y total recalculado en vivo.
  const effectiveUnit = Number(estimate.unit ?? estimate.base ?? 0);
  const quantityCount = $("#flowQuantityCount");
  const quantityUnitPrice = $("#flowQuantityUnitPrice");
  const quantityTotal = $("#flowQuantityTotal");
  if (quantityCount) quantityCount.textContent = String(quantity);
  if (quantityUnitPrice) quantityUnitPrice.textContent = paymentAmountText(effectiveUnit, payment);
  if (quantityTotal) quantityTotal.textContent = paymentAmountText(context.totalUsdt, payment);

  const quoteUsdt = $("#quoteTotalUsdt");
  const quoteLocal = $("#quoteTotalLocal");
  const quoteCurrencyLabel = $("#quoteCurrencyLabel");
  if (quoteUsdt) quoteUsdt.textContent = money(context.totalUsdt);
  if (quoteLocal) quoteLocal.textContent = paymentAmountText(context.totalUsdt, payment);
  if (quoteCurrencyLabel) quoteCurrencyLabel.textContent = `${paymentFlag(payment)} ${payment?.currency || "Tu moneda"}`;
  updateFlowPaymentDropzone();
}

export function updateFlowPaymentDropzone() {
  const dropzone = $("#flowPaymentDropzone");
  const hint = $("#flowPaymentDropzoneHint");
  const statusBanner = $("#flowProofStatusBanner");
  const rejectionBanner = $("#flowProofRejectionBanner");
  if (!dropzone || !hint) return;
  // QUE: paso 3 visual segun estado de la orden activa:
  //  - PAGO_EN_REVISION: dropzone OCULTO, banner azul "Comprobante recibido..." VISIBLE.
  //  - PAGO_RECHAZADO:   dropzone VISIBLE habilitado, banner rojo con motivo arriba.
  //  - ESPERANDO_PAGO o sin orden: dropzone VISIBLE habilitado o disabled segun auth+verif.
  //  - Otros (in-flight): dropzone visible-pero-disabled. step-locked CSS lo grisea igual.
  // POR QUE: ajuste post PR-0.5 — el banner azul no es notificacion, es estado del paso
  // (reemplaza al dropzone mientras esta en revision). El banner rojo es feedback de
  // rechazo + invitacion a re-subir, no notificacion tampoco.
  const customer = state.customer;
  const orders = customer?.orders || [];
  const orderInReview = orders.find((order) => order.publicStatus === "PAGO_EN_REVISION") || null;
  const orderRejected = orders.find((order) => order.publicStatus === "PAGO_RECHAZADO") || null;
  const targetOrder = paymentUploadTargetOrder();
  const authenticated = Boolean(customer?.user && customer?.client);
  const emailVerified = Boolean(customer?.client?.emailVerified);
  const hasInFlightOrder = orders.some((order) => (
    ["PAGO_EN_REVISION", "EN_PREPARACION", "LISTO_PARA_CONEXION", "EN_PROCESO", "REVISION_COMPATIBILIDAD"].includes(order.publicStatus)
  ));

  if (statusBanner) statusBanner.hidden = !orderInReview;
  if (rejectionBanner) {
    rejectionBanner.hidden = !orderRejected;
    if (orderRejected) {
      const reasonNode = rejectionBanner.querySelector("[data-flow-rejection-reason]");
      const reason = String(orderRejected.paymentRejectedReason || "").trim() || "Comprobante rechazado.";
      if (reasonNode) reasonNode.textContent = `Motivo: ${reason} Subí un nuevo comprobante.`;
    }
  }
  dropzone.hidden = Boolean(orderInReview);

  const enabled = authenticated && emailVerified && (Boolean(targetOrder) || !hasInFlightOrder);
  dropzone.dataset.disabled = enabled ? "false" : "true";
  dropzone.classList.toggle("is-disabled", !enabled);
  dropzone.dataset.orderId = targetOrder?.id || "";
  if (!authenticated) {
    hint.textContent = "Inicia sesion para subir tu comprobante";
  } else if (!emailVerified) {
    hint.textContent = "Verifica tu correo para subir tu comprobante";
  } else if (orderRejected) {
    hint.textContent = `Subir nuevo comprobante para ${orderRejected.code}`;
  } else if (targetOrder) {
    hint.textContent = `Pago de ${targetOrder.code}`;
  } else if (hasInFlightOrder) {
    hint.textContent = "Tu solicitud esta avanzando. No subas otro comprobante.";
  } else {
    hint.textContent = "Sube tu comprobante (foto o PDF)";
  }
}

export function paymentSelectedInDropdown(paymentCode) {
  // PR-2a-final.fase3: pills reemplazan al <select>. Chequea si el codigo
  // existe entre las pills disponibles.
  if (!paymentCode) return false;
  const compatible = compatiblePaymentMethodsForCustomer();
  return compatible.some((payment) => payment.code === paymentCode);
}
