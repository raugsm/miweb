import { frpMonthlyTiers, frpProviderCostModes, frpProviderStatuses, frpQuantityTiers } from "../config/catalog.js";
import { nowIso } from "../core/dates.js";
import { moneyNumber, percentNumber } from "../core/money.js";
import { cleanText } from "../core/validation.js";

export function defaultFrpPricingConfig() {
  return {
    policy: {
      // PR-2a.6: minMarginUsdt y minSellPriceUsdt ELIMINADOS — contradicen filosofia
      // "precio en vivo" (FINAL §4). La proteccion contra error humano vive en el
      // sistema dinamico de validacion (5 niveles + histórico 7d) en frp-routes.
      // Se conservan a 0 por compat de schema (algunas DBs viejas pueden tenerlos).
      minMarginUsdt: 0,
      targetMarginUsdt: 1,
      minSellPriceUsdt: 0,
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
        // PR-2a.6: default realista (FINAL §3 — costo cerca del precio
        // de venta; el operador ajusta dia a dia desde el panel).
        fixedCostUsdt: 23.5,
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
  // PR-2a.7: Preservar providers custom (no en defaults). Antes este normalize
  // SOLO iteraba defaults.providers, descartando cualquier provider creado via
  // API. Ahora: 1) normaliza los 3 defaults preservando overrides existentes,
  // 2) preserva providers extra (custom) aplicando la misma normalizacion.
  const normalizeOne = (existing, fallback = null) => {
    const base = fallback || existing || {};
    const status = frpProviderStatuses.has(String(existing?.status || "").toUpperCase())
      ? String(existing.status).toUpperCase()
      : base.status || "OFF";
    const costMode = frpProviderCostModes.has(String(existing?.costMode || "").toUpperCase())
      ? String(existing.costMode).toUpperCase()
      : base.costMode || "FIXED_USDT";
    return {
      id: String(existing?.id || base.id || ""),
      name: cleanText(existing?.name || base.name || "", 40),
      status,
      costMode,
      fixedCostUsdt: moneyNumber(existing?.fixedCostUsdt ?? base.fixedCostUsdt ?? 0),
      creditsPerProcess: moneyNumber(existing?.creditsPerProcess ?? base.creditsPerProcess ?? 0),
      creditUnitCostUsdt: moneyNumber(existing?.creditUnitCostUsdt ?? base.creditUnitCostUsdt ?? 0),
      priority: Math.max(1, Number.parseInt(existing?.priority ?? base.priority ?? 99, 10) || 99),
      reason: cleanText(existing?.reason || base.reason || "", 200),
      updatedAt: String(existing?.updatedAt || ""),
      updatedBy: String(existing?.updatedBy || ""),
    };
  };
  const defaultProviders = defaults.providers.map((defaultProvider) => {
    const existing = existingProviders.find((p) => p.id === defaultProvider.id || p.name === defaultProvider.name);
    return normalizeOne(existing, defaultProvider);
  });
  const customProviders = existingProviders
    .filter((p) => !defaults.providers.some((d) => d.id === p.id || d.name === p.name))
    .filter((p) => p && p.id) // descarta entradas corruptas sin id
    .map((p) => normalizeOne(p, null));
  return { policy, providers: [...defaultProviders, ...customProviders] };
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
  // PR-2a.6: pricing 100% dinamico. unitPrice = costo + targetMargin. Sin floors
  // estaticos (ni minSell ni minMargin). FINAL §4. La proteccion contra error
  // humano vive en la validacion del PATCH /pricing/providers (frp-routes.js).
  const internalCostUsdt = frpProviderCostUsdt(provider);
  const targetMargin = moneyNumber(config.policy.targetMarginUsdt);
  const unitPrice = moneyNumber(internalCostUsdt + targetMargin);
  // minAllowedUnitPrice se mantiene por compat con consumidores que lo leen,
  // pero ya no opera como clamp en frpDynamicTier. Vale exactamente unitPrice
  // (= cost + targetMargin) ya que es el "piso" semantico del precio normal.
  return {
    available: unitPrice > 0,
    reason: unitPrice > 0 ? "" : "Precio FRP no configurado",
    config,
    provider,
    internalCostUsdt,
    minAllowedUnitPrice: unitPrice,
    unitPrice,
  };
}

// QUE: calcula el unitPrice efectivo de un tier.
//   1. Tier con `discountUsdt` (frpQuantityTiers): unit = precio normal dinamico
//      menos descuento por unidad. Cantidad 1 usa discountUsdt=0, por lo tanto
//      queda exactamente igual a pricing.unitPrice.
//   2. Tier legacy con `marginUsdt`: se conserva por compatibilidad con datos viejos,
//      pero los tiers oficiales ya no lo usan como "precio normal" oculto.
//   3. Tier con `unitPrice` (frpMonthlyTiers, sin migrar — fallback legacy):
//      computa descuento contra el precio nominal 25.
export function frpDynamicTier(defaultTier, pricing) {
  if (!pricing?.available) return { ...defaultTier };
  const internalCost = moneyNumber(pricing.internalCostUsdt || 0);
  const breakEvenFloor = moneyNumber(internalCost);
  if (defaultTier.discountUsdt !== undefined) {
    const discount = moneyNumber(defaultTier.discountUsdt);
    const computed = moneyNumber(Number(pricing.unitPrice || 0) - discount);
    return {
      ...defaultTier,
      unitPrice: moneyNumber(Math.max(computed, breakEvenFloor)),
    };
  }
  if (defaultTier.marginUsdt !== undefined) {
    const margin = moneyNumber(defaultTier.marginUsdt);
    const computed = moneyNumber(internalCost + margin);
    return {
      ...defaultTier,
      unitPrice: moneyNumber(Math.max(computed, breakEvenFloor)),
    };
  }
  // Legacy unitPrice-based (frpMonthlyTiers).
  const discount = moneyNumber(25 - Number(defaultTier.unitPrice || 25));
  const computed = moneyNumber(Math.max(0, pricing.unitPrice - discount));
  return {
    ...defaultTier,
    unitPrice: moneyNumber(Math.max(computed, breakEvenFloor)),
  };
}

// PR-2a.6: helpers de proteccion contra error humano via histórico.

// QUE: clasifica un cambio de costo en 5 niveles segun el delta vs baseline.
// Niveles:
//   1: <15% — guarda directo, audit log.
//   2: 15-30% — confirmacion del operador.
//   3: 30-50% — confirmacion + motivo >= 15 chars + notif a admin.
//   4: >50% — bloqueado, requiere aprobacion de admin.
//   5: newCost < 1 OR > 100 USDT — rechazo absoluto (rangos no realistas).
// Si el provider esta en bootstrap (history < 3 entradas Y la primer entrada
// tiene < 7 dias), trata el cambio como nivel 1 con flag baseline_pending.
// El nivel 5 se evalua SIEMPRE primero (incluso en bootstrap).
export function classifyCostChange(newCost, baseline) {
  const cost = Number(newCost) || 0;
  if (cost < 1 || cost > 100) {
    return { level: 5, deltaPct: 0, reason: "absolute_range_violation", baseline };
  }
  if (!baseline || baseline.bootstrap) {
    return { level: 1, deltaPct: 0, reason: "baseline_pending", baseline };
  }
  const avg = Number(baseline.avg) || 0;
  if (avg <= 0) return { level: 1, deltaPct: 0, reason: "no_baseline", baseline };
  const deltaPct = Math.abs((cost - avg) / avg) * 100;
  let level = 1;
  if (deltaPct >= 50) level = 4;
  else if (deltaPct >= 30) level = 3;
  else if (deltaPct >= 15) level = 2;
  return { level, deltaPct: Number(deltaPct.toFixed(2)), reason: "computed", baseline };
}

// QUE: calcula avg/min/max del costo del proveedor en los ultimos N dias.
// Si hay menos de 3 entradas o la mas vieja tiene menos de N dias de antiguedad,
// devuelve bootstrap=true para que la validacion sea lenient.
export function computeProviderBaseline(history, providerId, days = 7) {
  const now = Date.now();
  const windowMs = days * 24 * 60 * 60 * 1000;
  const entries = (history || [])
    .filter((entry) => entry.providerId === providerId)
    .filter((entry) => {
      const ts = Date.parse(entry.recordedAt || "");
      return Number.isFinite(ts) && (now - ts) <= windowMs;
    });
  if (!entries.length) {
    return { providerId, avg: 0, min: 0, max: 0, sampleCount: 0, bootstrap: true };
  }
  const totalEntries = (history || []).filter((e) => e.providerId === providerId);
  const oldestTs = Math.min(...totalEntries.map((e) => Date.parse(e.recordedAt || "")).filter(Number.isFinite));
  const oldestAgeMs = Number.isFinite(oldestTs) ? now - oldestTs : 0;
  const bootstrap = totalEntries.length < 3 && oldestAgeMs < windowMs;
  const costs = entries.map((e) => Number(e.costUsdt) || 0);
  const avg = costs.reduce((sum, c) => sum + c, 0) / costs.length;
  return {
    providerId,
    avg: Number(avg.toFixed(4)),
    min: Math.min(...costs),
    max: Math.max(...costs),
    sampleCount: entries.length,
    bootstrap,
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
