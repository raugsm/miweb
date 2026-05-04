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

// Sub-commit 15a.1: banderas circulares 14x14 (12x12 mobile via CSS) inline en JS.
// Reemplazan a las rectangulares 18x12 anteriores (D5 sesión 15). Colores per
// docs/specs/cliente/panel-1-metodo-de-pago.md §1 / mockup consolidado.
//
// Cada SVG es viewBox 14x14 con clip circular y franjas/elementos de la bandera.
// El círculo se logra con border-radius 50% en el contenedor `.flow-payment-pill-flag`.
const PAYMENT_FLAG_SVGS = {
  Peru: '<svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="7" fill="#D91023"/><rect x="4.67" y="0" width="4.66" height="14" fill="#FFFFFF"/></svg>',
  Mexico: '<svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="7" fill="#006847"/><rect x="4.67" y="0" width="4.66" height="14" fill="#FFFFFF"/><rect x="9.33" y="0" width="4.67" height="14" fill="#CE1126"/></svg>',
  Chile: '<svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="7" fill="#FFFFFF"/><rect x="0" y="7" width="14" height="7" fill="#D52B1E"/><rect x="0" y="0" width="7" height="7" fill="#0039A6"/></svg>',
  Colombia: '<svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="7" fill="#FCD116"/><path d="M0 7h14v3.5H0z" fill="#003893"/><path d="M0 10.5h14V14H0z" fill="#CE1126"/></svg>',
  Global: '<svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="7" fill="#26A17B"/><text x="7" y="10" text-anchor="middle" font-size="9" font-weight="500" fill="#FFFFFF" font-family="Arial,sans-serif">T</text></svg>',
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

// Sub-commit 15a.1: orden FIJO de pills del panel 1 (decisión spec panel-1 v2.0
// §1 — Perú · USDT · México arriba, Colombia · Chile · vacío abajo). El orden ya
// no se ajusta al país del cliente (cambio respecto a `compatiblePaymentMethodsForCustomer`,
// que sigue rigiendo el modal de cuentas del panel 3).
//
// Cada slot mapea a un código de método del catálogo backend. PE_YAPE_BRYAMS es la
// cuenta default de Perú (PE_YAPE_PEREGRINA queda para el link "Ver otra cuenta Yape"
// del panel 3, sub-commit 15c). PAYPAL no tiene pill en panel 1 — se elige desde
// el modal de Cuentas del panel 3.
const PANEL_1_PILL_SLOTS = [
  { country: "Peru", label: "Perú", primaryCode: "PE_YAPE_BRYAMS" },
  { country: "Global", label: "USDT", primaryCode: "BINANCE_PAY" },
  { country: "Mexico", label: "México", primaryCode: "MX_STP" },
  { country: "Colombia", label: "Colombia", primaryCode: "CO_BANCOLOMBIA_AHORROS" },
  { country: "Chile", label: "Chile", primaryCode: "CL_MERCADO_PAGO" },
  { empty: true },
];

// Sub-commit 15a.1: persistencia de la última pill elegida en `localStorage`
// (decisión D7 sesión 15 + spec panel-1 §5). Clave global del browser. Si la
// pill guardada no existe en el catálogo o está desactivada, fallback al país
// del perfil del cliente.
const LAST_PILL_KEY = "ariad_lastPill";

export function readLastSelectedPill() {
  try {
    const raw = localStorage.getItem(LAST_PILL_KEY);
    if (!raw) return "";
    const parsed = JSON.parse(raw);
    return typeof parsed?.code === "string" ? parsed.code : "";
  } catch {
    return "";
  }
}

export function writeLastSelectedPill(code) {
  if (!code) return;
  try {
    localStorage.setItem(LAST_PILL_KEY, JSON.stringify({ code, timestamp: new Date().toISOString() }));
  } catch {
    // Sin localStorage (modo privado / cuotas) — silencio: la persistencia es nice-to-have.
  }
}

// Sub-commit 15a.2: limpieza del localStorage cuando admin desactiva la pill
// recordada. Si no limpiáramos, en el próximo reload `renderPaymentPills`
// intentaría seleccionar una pill desactivada y caería al fallback igual,
// pero la entrada queda como ruido. Mejor limpio.
export function clearLastSelectedPill() {
  try {
    localStorage.removeItem(LAST_PILL_KEY);
  } catch {
    // ídem.
  }
}

// QUE: para el slot del panel 1, encontrar el método pill (preferido por
// `primaryCode`) y caer al primer método del país si el primary no está en el
// catálogo. Devuelve `null` si el país no tiene método activo configurado.
function paymentForPillSlot(slot) {
  if (slot.empty) return null;
  const methods = state.catalog?.paymentMethods || [];
  const byCode = methods.find((m) => m.code === slot.primaryCode);
  if (byCode) return byCode;
  return methods.find((m) => m.country === slot.country) || null;
}

// Sub-commit 15a.1: render del panel 1 según spec v2.0. Estructura 3+2 con
// slot vacío al final, banderas circulares, preselección por última pill /
// país del perfil / fallback al primer slot disponible.
export function renderPaymentPills() {
  const container = $("#flowPaymentPills");
  const hidden = $("#paymentSelect");
  if (!container || !hidden) return;

  const slots = PANEL_1_PILL_SLOTS.map((slot) => ({ ...slot, payment: paymentForPillSlot(slot) }));
  const availableCodes = slots.filter((s) => s.payment).map((s) => s.payment.code);

  if (!availableCodes.length) {
    container.innerHTML = "";
    hidden.value = "";
    return;
  }

  // Resolución de pill seleccionada:
  //   1. Valor actual del hidden input (si sigue siendo válido).
  //   2. localStorage `ariad_lastPill` (D7).
  //   3. País del perfil del cliente registrado.
  //   4. Primer slot disponible.
  const previousValue = hidden.value;
  const remembered = readLastSelectedPill();
  const profileCountry = state.customer?.client?.country || "";
  const profileSlot = slots.find((s) => s.payment && s.country === profileCountry);

  const selectedCode = (
    (availableCodes.includes(previousValue) && previousValue)
    || (availableCodes.includes(remembered) && remembered)
    || profileSlot?.payment?.code
    || availableCodes[0]
    || ""
  );
  hidden.value = selectedCode;

  container.innerHTML = slots.map((slot) => {
    if (slot.empty || !slot.payment) {
      return '<span class="flow-payment-pill flow-payment-pill-empty" aria-hidden="true"></span>';
    }
    const isSelected = slot.payment.code === selectedCode;
    const isDisabled = slot.payment.active === false;
    return `
      <button type="button" role="radio" class="flow-payment-pill${isSelected ? " is-selected" : ""}"
              data-payment-pill="${slot.payment.code}"
              data-pill-country="${slot.country}"
              data-disabled="${isDisabled ? "true" : "false"}"
              aria-checked="${isSelected ? "true" : "false"}"
              aria-disabled="${isDisabled ? "true" : "false"}">
        <span class="flow-payment-pill-flag">${paymentFlagSvg(slot.payment)}</span>
        <span class="flow-payment-pill-label">${slot.label}</span>
      </button>
    `;
  }).join("");
}

// Helper para que events.js sincronice valor + UI cuando cambia desde fuera.
// Persiste la elección en localStorage para próximas sesiones (D7).
export function setSelectedPayment(code) {
  const hidden = $("#paymentSelect");
  if (!hidden) return;
  hidden.value = code;
  $$(".flow-payment-pill").forEach((pill) => {
    const isSelected = pill.dataset.paymentPill === code;
    pill.classList.toggle("is-selected", isSelected);
    pill.setAttribute("aria-checked", isSelected ? "true" : "false");
  });
  if (code) writeLastSelectedPill(code);
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

// Sub-commit 15a.1: split de updateQuote en dos cards independientes.
//   - Panel 1 ESTIMADO: precio BASE por unidad en moneda local + USDT.
//   - Panel 2 TOTAL: precio EFECTIVO total (cantidad × unitario con tier) en
//     moneda local + USDT + breakdown "N equipos × monto unitario".
//
// Mantenemos también updates a IDs legacy del panel 3 (#quoteTotalUsdt,
// #quoteTotalLocal, #quoteCurrencyLabel) que viven en `<div class="legacy-step-3" hidden>`
// y se reescriben en sub-commit 15c. Sin update se rompería el wiring del modal
// de Cuentas y `paymentOptionAmountText`. Inocuo porque el contenedor está
// hidden pero los listeners siguen vivos.
export function updateQuote() {
  const quantity = syncDetectedItems();
  const context = activePaymentContext();
  const estimate = context.estimate;
  const payment = context.selectedPayment || currentPayment();
  const baseUnit = Number(estimate.base ?? estimate.unit ?? 0);
  const effectiveUnit = Number(estimate.unit ?? estimate.base ?? 0);
  const isUsdt = payment?.currency === "USDT";

  // Panel 1 — card "ESTIMADO · EN VIVO".
  const panel1Amount = $("#panel1EstimateAmount");
  const panel1Sub = $("#panel1EstimateSubAmount");
  const panel1Dot = $("#panel1EstimateDot");
  if (panel1Amount) {
    panel1Amount.textContent = baseUnit > 0
      ? paymentAmountText(baseUnit, payment)
      : "—";
  }
  if (panel1Sub) {
    if (baseUnit > 0 && !isUsdt) {
      panel1Sub.textContent = `≈ ${money(baseUnit)}`;
      panel1Sub.hidden = false;
    } else {
      panel1Sub.hidden = true;
    }
  }
  if (panel1Dot) {
    panel1Dot.dataset.state = baseUnit > 0 ? "live" : "loading";
  }

  // Panel 2 — card "TOTAL".
  const panel2Amount = $("#panel2TotalAmount");
  const panel2Sub = $("#panel2TotalSubAmount");
  const panel2Breakdown = $("#panel2TotalBreakdown");
  if (panel2Amount) {
    panel2Amount.textContent = context.totalUsdt > 0
      ? paymentAmountText(context.totalUsdt, payment)
      : "—";
  }
  if (panel2Sub) {
    if (context.totalUsdt > 0 && !isUsdt) {
      panel2Sub.textContent = `≈ ${money(context.totalUsdt)}`;
      panel2Sub.hidden = false;
    } else {
      panel2Sub.hidden = true;
    }
  }
  if (panel2Breakdown) {
    if (effectiveUnit > 0 && quantity > 0) {
      const unitText = paymentAmountText(effectiveUnit, payment);
      const equiposLabel = quantity === 1 ? "equipo" : "equipos";
      panel2Breakdown.textContent = `${quantity} ${equiposLabel} × ${unitText}`;
      panel2Breakdown.hidden = false;
    } else {
      panel2Breakdown.hidden = true;
    }
  }

  // Legacy IDs del panel 3 (hidden hasta 15c). Mantengo updates por compatibilidad
  // con el modal de Cuentas y `paymentOptionAmountText` que aún leen estos nodos.
  const quoteUsdt = $("#quoteTotalUsdt");
  const quoteLocal = $("#quoteTotalLocal");
  const quoteCurrencyLabel = $("#quoteCurrencyLabel");
  const paymentBadge = $("#currentPaymentBadge");
  if (quoteUsdt) quoteUsdt.textContent = money(context.totalUsdt);
  if (quoteLocal) quoteLocal.textContent = paymentAmountText(context.totalUsdt, payment);
  if (quoteCurrencyLabel) quoteCurrencyLabel.textContent = `${paymentFlag(payment)} ${payment?.currency || "Tu moneda"}`;
  if (paymentBadge) paymentBadge.textContent = paymentOptionLabel(payment);

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
