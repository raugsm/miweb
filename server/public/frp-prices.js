import { moneyNumber } from "../core/money.js";

const clientAppCountries = [
  { code: "CL", country: "Chile", currency: "CLP", flag: "\u{1F1E8}\u{1F1F1}", flagCode: "cl" },
  { code: "CO", country: "Colombia", currency: "COP", flag: "\u{1F1E8}\u{1F1F4}", flagCode: "co" },
  { code: "MX", country: "M\u00e9xico", currency: "MXN", flag: "\u{1F1F2}\u{1F1FD}", flagCode: "mx" },
  { code: "PE", country: "Peru", currency: "PEN", flag: "\u{1F1F5}\u{1F1EA}", flagCode: "pe" },
  { code: "USDT", country: "Internacional", currency: "USDT", flag: "\u{1F310}", flagCode: "binance" },
];

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

function numericSetting(settingsRows, key) {
  const row = (settingsRows || []).find((item) => item?.key === key);
  const rawValue = typeof row?.value === "object" && row?.value !== null
    ? row.value.value
    : row?.value;
  return moneyNumber(rawValue);
}

function rateForCountryCode(exchangeRateRows, countryCode) {
  if (countryCode === "USDT") return { rate: 1, updatedAt: "" };
  const row = (exchangeRateRows || []).find((item) => item?.country_code === countryCode);
  return {
    rate: moneyNumber(row?.rate || 0),
    updatedAt: row?.updated_at || "",
  };
}

function methodsForCountry(paymentMethodRows, countryCode) {
  return [...(paymentMethodRows || [])]
    .filter((method) => method?.country_code === countryCode && method?.method_name)
    .sort((a, b) => {
      const orderA = Number.isFinite(Number(a.display_order)) ? Number(a.display_order) : 999;
      const orderB = Number.isFinite(Number(b.display_order)) ? Number(b.display_order) : 999;
      return orderA - orderB || String(a.method_name).localeCompare(String(b.method_name), "es");
    })
    .map((method) => String(method.method_name).trim())
    .filter(Boolean);
}

export function buildClientAppFrpPriceReport({
  settingsRows = [],
  exchangeRateRows = [],
  paymentMethodRows = [],
  updatedAt = "",
} = {}) {
  const costUsdt = numericSetting(settingsRows, "frp_cost_usdt");
  const profitUsdt = numericSetting(settingsRows, "frp_profit_usdt");
  const unitPriceUsdt = moneyNumber(costUsdt + profitUsdt);
  const available = unitPriceUsdt > 0;

  const prices = clientAppCountries.map((country) => {
    const rate = rateForCountryCode(exchangeRateRows, country.code);
    const ratePerUsdt = moneyNumber(rate.rate || 0);
    const amount = available && ratePerUsdt > 0 ? moneyNumber(unitPriceUsdt * ratePerUsdt) : 0;
    return {
      country: country.country,
      countryCode: country.code,
      flag: country.flag,
      flagCode: country.flagCode,
      currency: country.currency,
      available: Boolean(available && ratePerUsdt > 0),
      quantity: 1,
      priceUsdt: unitPriceUsdt,
      amount,
      amountFormatted: amount > 0 ? formatCurrency(amount, country.currency) : "Consultar por WhatsApp",
      methods: methodsForCountry(paymentMethodRows, country.code).slice(0, 3),
      ratePerUsdt,
      updatedAt: rate.updatedAt || updatedAt || "",
    };
  });

  return {
    available,
    quantity: 1,
    source: "ariadgsm_cliente_app",
    sourceLabel: "Dashboard AriadGSM Cliente",
    updatedAt: updatedAt || "",
    prices,
  };
}
