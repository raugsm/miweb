import { moneyNumber } from "../core/money.js";

function formatCurrency(amount, currency) {
  const value = moneyNumber(amount);
  if (currency === "PEN") return `S/ ${value.toFixed(2)}`;
  if (currency === "USDT") return `${value.toFixed(2)} USDT`;
  if (currency === "MXN") return `$${value.toFixed(2)} MXN`;
  if (currency === "COP" || currency === "CLP") {
    return `${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(value)} ${currency}`;
  }
  return `${value.toFixed(2)} ${currency || ""}`.trim();
}

function publicCountryName(country) {
  return country === "Global" ? "Internacional" : country;
}

function rateForCountryOrCurrency(exchangeRates, country, currency) {
  if (currency === "USDT") return { ratePerUsdt: 1, updatedAt: "" };
  return (exchangeRates || []).find((rate) => rate.country === country || rate.currency === currency) || null;
}

export function buildPublicFrpPriceReport({
  available = false,
  quantity = 1,
  totalUsdt = 0,
  exchangeRates = [],
  paymentMethods = [],
  updatedAt = "",
} = {}) {
  const safeQuantity = Math.max(1, Math.min(10, Number.parseInt(quantity, 10) || 1));
  const groups = new Map();

  for (const method of paymentMethods || []) {
    if (!method?.ticketOption || method.active === false || !method.currency) continue;
    const key = `${method.country || "Global"}:${method.currency}`;
    if (!groups.has(key)) {
      groups.set(key, {
        country: method.country || "Global",
        currency: method.currency,
        methods: [],
      });
    }
    groups.get(key).methods.push(method.displayName || method.label || method.code);
  }

  const prices = [...groups.values()].map((group) => {
    const rate = rateForCountryOrCurrency(exchangeRates, group.country, group.currency);
    const ratePerUsdt = moneyNumber(rate?.ratePerUsdt || 0);
    const amount = available && ratePerUsdt > 0 ? moneyNumber(totalUsdt * ratePerUsdt) : 0;
    return {
      country: publicCountryName(group.country),
      currency: group.currency,
      available: Boolean(available && ratePerUsdt > 0),
      quantity: safeQuantity,
      priceUsdt: moneyNumber(totalUsdt),
      amount,
      amountFormatted: amount > 0 ? formatCurrency(amount, group.currency) : "Consultar por WhatsApp",
      methods: [...new Set(group.methods)].slice(0, 3),
      ratePerUsdt,
      updatedAt: rate?.updatedAt || updatedAt || "",
    };
  });

  prices.sort((a, b) => {
    if (a.currency === "USDT") return 1;
    if (b.currency === "USDT") return -1;
    return a.country.localeCompare(b.country, "es");
  });

  return {
    available: Boolean(available),
    quantity: safeQuantity,
    source: "panel_operario",
    sourceLabel: "Panel de trabajadores AriadGSM",
    updatedAt: updatedAt || "",
    prices,
  };
}
