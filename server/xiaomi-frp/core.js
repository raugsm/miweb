export const xiaomiFrpServiceCode = "PORTAL-XIAOMI-FRP";
export const xiaomiFrpSource = "XIAOMI_FRP_SPA";
export const xiaomiFrpTransactionFeeUsdt = 0.30;
export const xiaomiFrpDefaultUnitPriceUsdt = 4.00;
export const xiaomiFrpMaxQuantity = 50;

const isoToCountry = {
  MX: "Mexico",
  PE: "Peru",
  CO: "Colombia",
  CL: "Chile",
  INTL: "Global",
};

const countryToIso = Object.fromEntries(Object.entries(isoToCountry).map(([iso, country]) => [country, iso]));

const orderStatuses = new Set([
  "ESPERANDO_PAGO",
  "PAGO_EN_REVISION",
  "PAGO_RECHAZADO",
  "LISTO_PARA_CONEXION",
  "EN_COLA",
  "EN_PROCESO",
  "FINALIZADO",
  "REQUIERE_ATENCION",
  "CANCELADO",
  "REEMBOLSO_SOLICITADO",
]);

export function normalizeCountryIso(value) {
  const iso = String(value || "").trim().toUpperCase();
  if (iso === "GLOBAL" || iso === "INTL") return "INTL";
  return /^[A-Z]{2}$/.test(iso) ? iso : "";
}

export function countryNameFromIso(value) {
  const iso = normalizeCountryIso(value);
  return isoToCountry[iso] || "";
}

export function countryIsoFromName(value) {
  return countryToIso[String(value || "").trim()] || "";
}

export function detectCountryIsoFromRequest(req) {
  const candidates = [
    req.headers["cf-ipcountry"],
    req.headers["x-vercel-ip-country"],
    req.headers["x-country-code"],
    req.headers["x-client-country"],
  ];
  for (const candidate of candidates) {
    const iso = normalizeCountryIso(Array.isArray(candidate) ? candidate[0] : candidate);
    if (iso && iso !== "XX") return iso;
  }
  return "";
}

export function ensureXiaomiServiceRule(db, nowIso) {
  db.pricingConfig ||= {};
  db.pricingConfig.serviceRules = Array.isArray(db.pricingConfig.serviceRules)
    ? db.pricingConfig.serviceRules
    : [];
  let rule = db.pricingConfig.serviceRules.find((entry) => entry.serviceCode === xiaomiFrpServiceCode);
  if (!rule) {
    rule = {
      serviceCode: xiaomiFrpServiceCode,
      pricingMode: "MANUAL",
      baseCostUsdt: xiaomiFrpDefaultUnitPriceUsdt,
      marginUsdt: 0,
      authCostUsdt: 0,
      criticalCostUsdt: 0,
      toolCostUsdt: 0,
      serverCostUsdt: 0,
      manualAdjustmentAllowed: true,
      serverStatus: "ACTIVE",
      maintenanceMessage: "",
      updatedAt: nowIso(),
      updatedBy: "",
    };
    db.pricingConfig.serviceRules.push(rule);
  }
  rule.pricingMode = "MANUAL";
  rule.manualAdjustmentAllowed = true;
  rule.baseCostUsdt = moneyValue(rule.baseCostUsdt || xiaomiFrpDefaultUnitPriceUsdt);
  rule.serverStatus = rule.serverStatus === "MAINTENANCE" ? "MAINTENANCE" : "ACTIVE";
  rule.maintenanceMessage = String(rule.maintenanceMessage || "");
  return rule;
}

export function xiaomiUnitPriceUsdt(db, nowIso) {
  const rule = ensureXiaomiServiceRule(db, nowIso);
  const price = moneyValue(rule.baseCostUsdt || xiaomiFrpDefaultUnitPriceUsdt);
  return price > 0 ? price : xiaomiFrpDefaultUnitPriceUsdt;
}

export function xiaomiServerStatus(db, nowIso) {
  const rule = ensureXiaomiServiceRule(db, nowIso);
  return {
    status: rule.serverStatus === "MAINTENANCE" ? "MAINTENANCE" : "ACTIVE",
    message: rule.maintenanceMessage || "",
  };
}

export function token10(crypto) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.randomBytes(10);
  let out = "";
  for (const byte of bytes) out += alphabet[byte % alphabet.length];
  return out;
}

export function nextAgOrderCode(db) {
  db.frpCounters ||= {};
  db.frpCounters.xiaomiFrpAg ||= {};
  const next = Number(db.frpCounters.xiaomiFrpAg.global || 0) + 1;
  db.frpCounters.xiaomiFrpAg.global = next;
  const width = next > 9999 ? 5 : 4;
  return `AG-${String(next).padStart(width, "0")}`;
}

export function isXiaomiOrder(order) {
  return Boolean(order && (order.source === xiaomiFrpSource || /^AG-\d{4,5}$/.test(String(order.code || ""))));
}

export function normalizeQuantity(value) {
  const quantity = Number.parseInt(value, 10);
  if (!Number.isFinite(quantity) || quantity < 1) return 1;
  return Math.min(quantity, xiaomiFrpMaxQuantity);
}

export function normalizeWhatsapp(value) {
  return String(value || "").trim().replace(/[^\d+]/g, "").slice(0, 40);
}

export function validWhatsapp(value) {
  const text = normalizeWhatsapp(value);
  return /\d{7,15}/.test(text.replace(/\D/g, ""));
}

export function moneyValue(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Number(number.toFixed(2)) : 0;
}

export function rateForCurrency(db, currency) {
  if (currency === "USDT") return { ratePerUsdt: 1, updatedAt: "" };
  const rates = Array.isArray(db?.pricingConfig?.exchangeRates) ? db.pricingConfig.exchangeRates : [];
  const rate = rates.find((entry) => entry.currency === currency);
  return {
    ratePerUsdt: Number(rate?.ratePerUsdt || 0),
    updatedAt: String(rate?.updatedAt || ""),
  };
}

export function localAmount(totalUsdt, payment, rate) {
  if (payment.currency === "USDT") return moneyValue(totalUsdt);
  if (!rate.ratePerUsdt) return 0;
  const amount = moneyValue(totalUsdt * rate.ratePerUsdt);
  if (payment.amountMode === "thousands") return Math.round(amount);
  return amount;
}

export function paymentMethodsForCountry(methods, countryIso) {
  const country = countryNameFromIso(countryIso);
  return methods
    .filter((method) => method && method.code !== "PAYPAL" && method.active !== false && method.ticketOption)
    .filter((method) => method.globalOption || (country && method.country === country));
}

export function qrUrlForPaymentMethod(code) {
  return `/api/xiaomi-frp/payment-methods/${encodeURIComponent(String(code || ""))}/qr`;
}

function publicQrImage(qrImage, code) {
  if (!qrImage || typeof qrImage !== "object") return null;
  const sha256 = String(qrImage.sha256 || qrImage.hash || "").trim();
  const url = String(qrImage.url || qrUrlForPaymentMethod(code || "")).trim();
  if (!sha256) return null;
  return {
    name: String(qrImage.name || "").trim(),
    type: String(qrImage.type || qrImage.contentType || "").trim(),
    size: Number(qrImage.size || qrImage.sizeBytes || 0) || 0,
    sha256,
    url,
    updatedAt: String(qrImage.updatedAt || qrImage.createdAt || "").trim(),
  };
}

export function publicPaymentMethod(method) {
  const qrImage = publicQrImage(method.qrImage, method.code);
  return {
    code: method.code,
    label: method.label,
    displayName: method.displayName || method.label,
    country: method.country,
    currency: method.currency,
    amountMode: method.amountMode || "decimal",
    fields: Array.isArray(method.fields) ? method.fields : [],
    details: Array.isArray(method.details) ? method.details : [],
    qrImageUrl: qrImage?.url || method.qrImageUrl || "",
    qrImage,
    customMessage: method.customMessage || "",
    globalOption: Boolean(method.globalOption),
  };
}

export function quoteXiaomiOrder(db, { countryIso, quantity, paymentMethodCode, methods, nowIso }) {
  const safeCountryIso = normalizeCountryIso(countryIso);
  const availableMethods = paymentMethodsForCountry(methods, safeCountryIso);
  const payment = availableMethods.find((method) => method.code === paymentMethodCode) || availableMethods[0] || null;
  const unitPriceUsdt = xiaomiUnitPriceUsdt(db, nowIso);
  const safeQuantity = normalizeQuantity(quantity);
  const subtotalUsdt = moneyValue(unitPriceUsdt * safeQuantity);
  const feeUsdt = xiaomiFrpTransactionFeeUsdt;
  const totalUsdt = moneyValue(subtotalUsdt + feeUsdt);
  const rate = payment ? rateForCurrency(db, payment.currency) : { ratePerUsdt: 0, updatedAt: "" };
  const amountLocal = payment ? localAmount(totalUsdt, payment, rate) : 0;
  return {
    countryIso: safeCountryIso,
    country: countryNameFromIso(safeCountryIso),
    quantity: safeQuantity,
    unitPriceUsdt,
    subtotalUsdt,
    feeUsdt,
    totalUsdt,
    paymentMethod: payment ? publicPaymentMethod(payment) : null,
    paymentAmount: amountLocal,
    currency: payment?.currency || "",
    exchangeRate: rate.ratePerUsdt || 0,
    exchangeRateUpdatedAt: rate.updatedAt || "",
    rateMissing: Boolean(payment && payment.currency !== "USDT" && !rate.ratePerUsdt),
    priceLockSeconds: 600,
  };
}

export function expectedPublicStatus(customerOrder, frpOrder, jobs = []) {
  if (!customerOrder) return "";
  if (orderStatuses.has(customerOrder.publicStatus)) {
    if (!["LISTO_PARA_CONEXION", "EN_COLA", "EN_PROCESO", "FINALIZADO"].includes(customerOrder.publicStatus)) {
      return customerOrder.publicStatus;
    }
  }
  if (jobs.length && jobs.every((job) => job.status === "FINALIZADO")) return "FINALIZADO";
  if (jobs.some((job) => job.status === "EN_PROCESO")) return "EN_PROCESO";
  if (jobs.some((job) => job.status === "LISTO_PARA_TECNICO")) return "EN_COLA";
  if (frpOrder?.checklist?.paymentValidated) return "LISTO_PARA_CONEXION";
  if (customerOrder.paymentProofs?.length) return "PAGO_EN_REVISION";
  return customerOrder.publicStatus || "ESPERANDO_PAGO";
}

export function publicXiaomiOrder(order, db) {
  const frpOrder = db.frpOrders.find((entry) => entry.id === order.frpOrderId || entry.portalOrderId === order.id) || null;
  const items = db.customerOrderItems.filter((item) => item.orderId === order.id);
  const jobs = frpOrder ? db.frpJobs.filter((job) => job.orderId === frpOrder.id) : [];
  const completed = jobs.filter((job) => job.status === "FINALIZADO").length;
  const canceled = jobs.filter((job) => job.status === "CANCELADO").length;
  const status = expectedPublicStatus(order, frpOrder, jobs);
  const totalProcesses = Number(order.quantity || items.length || jobs.length || 0);
  return {
    id: order.id,
    code: order.code,
    publicUrl: order.publicUrl || `/pedido/${order.code}`,
    status,
    quantity: order.quantity,
    completed,
    canceled,
    remaining: Math.max(0, totalProcesses - completed - canceled),
    countryIso: order.countryIso || countryIsoFromName(order.country),
    country: order.country || "",
    whatsapp: order.customerWhatsapp || order.whatsapp || "",
    unitPriceUsdt: moneyValue(order.unitPrice),
    feeUsdt: moneyValue(order.transactionFeeUsdt || xiaomiFrpTransactionFeeUsdt),
    totalUsdt: moneyValue(order.totalPrice),
    paymentMethod: order.paymentMethod || "",
    paymentLabel: order.paymentLabel || "",
    paymentAmount: order.paymentAmount || 0,
    currency: order.paymentCurrency || "",
    exchangeRate: order.exchangeRate || 0,
    priceLockedAt: order.priceLockedAt || "",
    priceLockExpiresAt: order.priceLockExpiresAt || "",
    paymentRejectedReason: frpOrder?.paymentRejectedReason || order.paymentRejectedReason || "",
    jobs: jobs.map((job) => ({
      id: job.id,
      code: job.code,
      sequence: job.sequence,
      status: job.status,
      doneAt: job.doneAt || "",
      cancelReason: job.cancelReason || "",
      reviewReason: job.reviewReason || "",
    })),
  };
}
