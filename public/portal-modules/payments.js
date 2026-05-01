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

export function paymentFlag(payment = currentPayment()) {
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

export function paymentOptionLabel(payment) {
  if (!payment) return "Método de pago";
  return `${paymentFlag(payment)} ${payment.label}`;
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

export function updateFlowPaymentDropzone() {
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

export function paymentSelectedInDropdown(paymentCode) {
  return paymentCode && Array.from($("#paymentSelect").options).some((option) => option.value === paymentCode);
}
