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

function hasSetting(settingsRows, key) {
  return (settingsRows || []).some((item) => item?.key === key);
}

// Espeja _reseller_compute_unit_pricing: cuentas MI usan llaves por pais con
// fallback a las llaves globales cuando el pais no esta cargado.
function miUnitPriceUsdt(settingsRows, countryCode) {
  if (countryCode && countryCode !== "USDT") {
    const suffix = String(countryCode).toLowerCase();
    const costKey = `cuenta_mi_cost_usdt_${suffix}`;
    if (hasSetting(settingsRows, costKey)) {
      return moneyNumber(
        numericSetting(settingsRows, costKey) + numericSetting(settingsRows, `cuenta_mi_profit_usdt_${suffix}`)
      );
    }
  }
  return moneyNumber(
    numericSetting(settingsRows, "cuenta_mi_cost_usdt") + numericSetting(settingsRows, "cuenta_mi_profit_usdt")
  );
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

function rentalDurationLabel(hours) {
  const value = Number(hours);
  if (!Number.isFinite(value) || value <= 0) return "alquiler";
  if (value % 24 === 0) {
    const days = value / 24;
    return days === 1 ? "1 dia" : `${days} dias`;
  }
  return value === 1 ? "1 hora" : `${value} horas`;
}

export function buildClientAppFrpPriceReport({
  settingsRows = [],
  exchangeRateRows = [],
  paymentMethodRows = [],
  toolRows = [],
  updatedAt = "",
} = {}) {
  const costUsdt = numericSetting(settingsRows, "frp_cost_usdt");
  const profitUsdt = numericSetting(settingsRows, "frp_profit_usdt");
  const unitPriceUsdt = moneyNumber(costUsdt + profitUsdt);
  const available = unitPriceUsdt > 0;

  const buildCountryPrice = (country, priceUsdt, serviceAvailable, unitLabel = "1 equipo") => {
    const rate = rateForCountryCode(exchangeRateRows, country.code);
    const ratePerUsdt = moneyNumber(rate.rate || 0);
    const amount = serviceAvailable && ratePerUsdt > 0 ? moneyNumber(priceUsdt * ratePerUsdt) : 0;
    return {
      country: country.country,
      countryCode: country.code,
      flag: country.flag,
      flagCode: country.flagCode,
      currency: country.currency,
      available: Boolean(serviceAvailable && ratePerUsdt > 0),
      quantity: 1,
      unitLabel,
      priceUsdt,
      amount,
      amountFormatted: amount > 0 ? formatCurrency(amount, country.currency) : "Consultar por WhatsApp",
      methods: methodsForCountry(paymentMethodRows, country.code).slice(0, 3),
      ratePerUsdt,
      updatedAt: rate.updatedAt || updatedAt || "",
    };
  };

  const prices = clientAppCountries.map((country) => buildCountryPrice(country, unitPriceUsdt, available));

  // Cuentas MI no se cobra en USDT: el bloque publico solo lista los paises
  // con moneda local.
  const miPrices = clientAppCountries
    .filter((country) => country.code !== "USDT")
    .map((country) => {
      const priceUsdt = miUnitPriceUsdt(settingsRows, country.code);
      return buildCountryPrice(country, priceUsdt, priceUsdt > 0);
    });
  const miAvailable = miPrices.some((price) => price.available);

  // Alquiler de herramientas: una tarjeta por pais para cada herramienta activa.
  // El precio ya viene en USDT desde tools_available, sin costo/ganancia aparte.
  const rentals = [...(toolRows || [])]
    .filter((tool) => tool && tool.name)
    .sort((a, b) => {
      const orderA = Number.isFinite(Number(a.sort_order)) ? Number(a.sort_order) : 999;
      const orderB = Number.isFinite(Number(b.sort_order)) ? Number(b.sort_order) : 999;
      return orderA - orderB || String(a.name).localeCompare(String(b.name), "es");
    })
    .map((tool) => {
      const priceUsdt = moneyNumber(tool.price_usdt);
      const durationHours = Number(tool.duration_hours) || 0;
      const unitLabel = rentalDurationLabel(durationHours);
      return {
        id: String(tool.id || ""),
        name: String(tool.name).trim(),
        brand: String(tool.brand || "").trim(),
        durationHours,
        durationLabel: unitLabel,
        priceUsdt,
        // El alquiler si acepta Binance Pay, asi que conserva la tarjeta USDT.
        prices: clientAppCountries.map((country) =>
          buildCountryPrice(country, priceUsdt, priceUsdt > 0, unitLabel)
        ),
      };
    })
    .filter((rental) => rental.prices.some((price) => price.available));

  return {
    available,
    miAvailable,
    rentalsAvailable: rentals.length > 0,
    quantity: 1,
    source: "ariadgsm_cliente_app",
    sourceLabel: "Dashboard AriadGSM Cliente",
    updatedAt: updatedAt || "",
    prices,
    miPrices,
    rentals,
  };
}
