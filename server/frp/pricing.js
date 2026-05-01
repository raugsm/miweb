import { frpMonthlyTiers, frpProviderCostModes, frpProviderStatuses, frpQuantityTiers } from "../config/catalog.js";
import { nowIso } from "../core/dates.js";
import { moneyNumber, percentNumber } from "../core/money.js";
import { cleanText } from "../core/validation.js";

export function defaultFrpPricingConfig() {
  return {
    policy: {
      minMarginUsdt: 1,
      targetMarginUsdt: 1.5,
      minSellPriceUsdt: 25,
      maxWorkerCostChangePct: 30,
      updatedAt: "",
      updatedBy: "",
    },
    providers: [
      {
        id: "krypto",
        name: "Krypto",
        status: "ACTIVE",
        costMode: "FIXED_USDT",
        fixedCostUsdt: 3,
        creditsPerProcess: 0,
        creditUnitCostUsdt: 0,
        priority: 1,
        reason: "Base inicial",
        updatedAt: "",
        updatedBy: "",
      },
      {
        id: "xfp",
        name: "XFP",
        status: "BACKUP",
        costMode: "CREDITS",
        fixedCostUsdt: 0,
        creditsPerProcess: 5,
        creditUnitCostUsdt: 0.85,
        priority: 2,
        reason: "Base inicial",
        updatedAt: "",
        updatedBy: "",
      },
      {
        id: "manual",
        name: "Manual / Otro",
        status: "OFF",
        costMode: "FIXED_USDT",
        fixedCostUsdt: 0,
        creditsPerProcess: 0,
        creditUnitCostUsdt: 0,
        priority: 3,
        reason: "Reserva",
        updatedAt: "",
        updatedBy: "",
      },
    ],
  };
}

export function normalizeFrpPricingConfig(config = {}) {
  const defaults = defaultFrpPricingConfig();
  const inputPolicy = config && typeof config.policy === "object" ? config.policy : {};
  const policy = {
    minMarginUsdt: moneyNumber(inputPolicy.minMarginUsdt ?? defaults.policy.minMarginUsdt),
    targetMarginUsdt: moneyNumber(inputPolicy.targetMarginUsdt ?? defaults.policy.targetMarginUsdt),
    minSellPriceUsdt: moneyNumber(inputPolicy.minSellPriceUsdt ?? defaults.policy.minSellPriceUsdt),
    maxWorkerCostChangePct: percentNumber(inputPolicy.maxWorkerCostChangePct ?? defaults.policy.maxWorkerCostChangePct),
    updatedAt: String(inputPolicy.updatedAt || ""),
    updatedBy: String(inputPolicy.updatedBy || ""),
  };
  const existingProviders = Array.isArray(config.providers) ? config.providers : [];
  const providers = defaults.providers.map((defaultProvider) => {
    const existing = existingProviders.find((provider) => provider.id === defaultProvider.id || provider.name === defaultProvider.name);
    const status = frpProviderStatuses.has(String(existing?.status || "").toUpperCase())
      ? String(existing.status).toUpperCase()
      : defaultProvider.status;
    const costMode = frpProviderCostModes.has(String(existing?.costMode || "").toUpperCase())
      ? String(existing.costMode).toUpperCase()
      : defaultProvider.costMode;
    return {
      ...defaultProvider,
      name: cleanText(existing?.name || defaultProvider.name, 40),
      status,
      costMode,
      fixedCostUsdt: moneyNumber(existing?.fixedCostUsdt ?? defaultProvider.fixedCostUsdt),
      creditsPerProcess: moneyNumber(existing?.creditsPerProcess ?? defaultProvider.creditsPerProcess),
      creditUnitCostUsdt: moneyNumber(existing?.creditUnitCostUsdt ?? defaultProvider.creditUnitCostUsdt),
      priority: Math.max(1, Number.parseInt(existing?.priority ?? defaultProvider.priority, 10) || defaultProvider.priority),
      reason: cleanText(existing?.reason || defaultProvider.reason || "", 160),
      updatedAt: String(existing?.updatedAt || ""),
      updatedBy: String(existing?.updatedBy || ""),
    };
  });
  return { policy, providers };
}

export function frpProviderCostUsdt(provider) {
  if (!provider) return 0;
  if (provider.costMode === "CREDITS") {
    return moneyNumber(moneyNumber(provider.creditsPerProcess) * moneyNumber(provider.creditUnitCostUsdt));
  }
  return moneyNumber(provider.fixedCostUsdt);
}

export function activeFrpProvider(config) {
  return [...(config.providers || [])]
    .filter((provider) => provider.status === "ACTIVE")
    .sort((a, b) => Number(a.priority || 99) - Number(b.priority || 99))[0] || null;
}

export function frpCurrentPricing(db) {
  const config = normalizeFrpPricingConfig(db.pricingConfig?.frpPricing);
  const provider = activeFrpProvider(config);
  if (!provider) {
    return {
      available: false,
      reason: "Sin proveedor FRP activo",
      config,
      provider: null,
      internalCostUsdt: 0,
      minAllowedUnitPrice: 0,
      unitPrice: 0,
    };
  }
  const internalCostUsdt = frpProviderCostUsdt(provider);
  const minAllowedUnitPrice = moneyNumber(internalCostUsdt + config.policy.minMarginUsdt);
  const unitPrice = moneyNumber(Math.max(
    minAllowedUnitPrice,
    internalCostUsdt + config.policy.targetMarginUsdt,
    config.policy.minSellPriceUsdt,
  ));
  return {
    available: unitPrice > 0,
    reason: unitPrice > 0 ? "" : "Precio FRP no configurado",
    config,
    provider,
    internalCostUsdt,
    minAllowedUnitPrice,
    unitPrice,
  };
}

export function frpDynamicTier(defaultTier, pricing) {
  if (!pricing?.available) return { ...defaultTier };
  const discount = moneyNumber(25 - Number(defaultTier.unitPrice || 25));
  return {
    ...defaultTier,
    unitPrice: moneyNumber(Math.max(pricing.minAllowedUnitPrice, pricing.unitPrice - discount)),
  };
}

export function frpDynamicQuantityTiers(pricing) {
  return frpQuantityTiers.map((tier) => frpDynamicTier(tier, pricing));
}

export function frpDynamicMonthlyTiers(pricing) {
  return frpMonthlyTiers.map((tier) => frpDynamicTier(tier, pricing));
}

export function frpPricingSnapshot(pricing, suggestion = {}) {
  const provider = pricing.provider;
  return {
    version: "frp-dynamic-v1",
    providerId: provider?.id || "",
    providerName: provider?.name || "",
    providerStatus: provider?.status || "",
    costMode: provider?.costMode || "",
    fixedCostUsdt: moneyNumber(provider?.fixedCostUsdt || 0),
    creditsPerProcess: moneyNumber(provider?.creditsPerProcess || 0),
    creditUnitCostUsdt: moneyNumber(provider?.creditUnitCostUsdt || 0),
    internalCostUsdt: moneyNumber(pricing.internalCostUsdt || 0),
    minMarginUsdt: moneyNumber(pricing.config?.policy?.minMarginUsdt || 0),
    targetMarginUsdt: moneyNumber(pricing.config?.policy?.targetMarginUsdt || 0),
    minSellPriceUsdt: moneyNumber(pricing.config?.policy?.minSellPriceUsdt || 0),
    minAllowedUnitPrice: moneyNumber(pricing.minAllowedUnitPrice || 0),
    baseUnitPrice: moneyNumber(pricing.unitPrice || 0),
    unitPrice: moneyNumber(suggestion.unitPrice ?? pricing.unitPrice),
    quantity: Number(suggestion.quantity || 1),
    total: moneyNumber(suggestion.total || 0),
    discountLabel: cleanText(suggestion.label || "", 80),
    calculatedAt: nowIso(),
  };
}
