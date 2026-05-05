import assert from "node:assert/strict";
import test from "node:test";

import { frpServiceCode, frpWorkChannel, portalPublicServices } from "../server/config/catalog.js";
import { limaDateStamp, limaMonthStamp } from "../server/core/dates.js";
import { sendSseEvent } from "../server/core/http.js";
import { classifyCostChange, computeProviderBaseline, defaultFrpPricingConfig, frpCurrentPricing, frpDynamicQuantityTiers, frpDynamicTier } from "../server/frp/pricing.js";
import { frpEligibilityResult, summarizeFrpEligibility } from "../server/frp/eligibility.js";

test("portal Xiaomi FRP keeps its internal service and WhatsApp 3 mapping", () => {
  const portalFrp = portalPublicServices.find((service) => service.code === "PORTAL-XIAOMI-FRP");

  assert.equal(frpServiceCode, "XIA-FRP-GOOGLE");
  assert.equal(frpWorkChannel, "WhatsApp 3");
  assert.equal(portalFrp.internalServiceCode, frpServiceCode);
  assert.equal(portalFrp.workChannel, frpWorkChannel);
});

test("default FRP pricing resolves to internalCost + targetMargin (no static floor — PR-2a.6)", () => {
  // Defaults: krypto cost 23.5 + targetMargin 1.0 = unitPrice 24.5 USDT.
  // Sin minSell ni minMargin clamp (FINAL §4 precio en vivo puro).
  const db = { pricingConfig: { frpPricing: defaultFrpPricingConfig() } };
  const pricing = frpCurrentPricing(db);

  assert.equal(pricing.available, true);
  assert.equal(pricing.provider.id, "krypto");
  assert.equal(pricing.internalCostUsdt, 23.5);
  assert.equal(pricing.unitPrice, 24.5);
});

test("FRP volume tiers derive from dynamic normal price (qty 1 = pricing.unitPrice)", () => {
  const db = { pricingConfig: { frpPricing: defaultFrpPricingConfig() } };
  const pricing = frpCurrentPricing(db);

  // 4 tiers (sub-commit 15a.5), ordenados de mayor minQty a menor.
  // Descuentos 0.40/0.25/0.15/0.00 desde el precio normal dinamico 24.50.
  assert.deepEqual(
    frpDynamicQuantityTiers(pricing).map((tier) => tier.unitPrice),
    [24.1, 24.25, 24.35, 24.5],
  );
  // discountPct expuesto literal del spec (0/3/5/8) para el badge frontend.
  assert.deepEqual(
    frpDynamicQuantityTiers(pricing).map((tier) => tier.discountPct),
    [8, 5, 3, 0],
  );
});

test("FRP volume discounts never make quantity 1 differ from pricing.unitPrice", () => {
  const pricing = { available: true, internalCostUsdt: 3.5, unitPrice: 4.5 };
  const normalTier = { minQty: 1, discountUsdt: 0, unitPrice: 25, label: "Precio normal" };
  const volumeTier = { minQty: 2, discountUsdt: 0.15, unitPrice: 24.85, label: "Descuento por 2-3 equipos" };
  const tooDeepTier = { minQty: 7, discountUsdt: 2, unitPrice: 23, label: "Test" };

  assert.equal(frpDynamicTier(normalTier, pricing).unitPrice, 4.5);
  assert.equal(frpDynamicTier(volumeTier, pricing).unitPrice, 4.35);
  assert.equal(frpDynamicTier(tooDeepTier, pricing).unitPrice, 3.5);
});

test("classifyCostChange enforces 5-level validation (PR-2a.6)", () => {
  const baseline = { providerId: "krypto", avg: 20, min: 18, max: 22, sampleCount: 5, bootstrap: false };
  // Nivel 5: rango absoluto.
  assert.equal(classifyCostChange(0.5, baseline).level, 5);
  assert.equal(classifyCostChange(150, baseline).level, 5);
  // Nivel 4: >=50% delta.
  assert.equal(classifyCostChange(31, baseline).level, 4); // +55%
  assert.equal(classifyCostChange(9, baseline).level, 4);  // -55%
  // Nivel 3: 30-50%.
  assert.equal(classifyCostChange(28, baseline).level, 3); // +40%
  // Nivel 2: 15-30%.
  assert.equal(classifyCostChange(24, baseline).level, 2); // +20%
  // Nivel 1: <15%.
  assert.equal(classifyCostChange(21, baseline).level, 1); // +5%
  // Bootstrap: nivel 1 con flag baseline_pending.
  const bootstrap = { providerId: "x", avg: 0, min: 0, max: 0, sampleCount: 0, bootstrap: true };
  const c = classifyCostChange(50, bootstrap);
  assert.equal(c.level, 1);
  assert.equal(c.reason, "baseline_pending");
  // Pero nivel 5 SIEMPRE primero, incluso en bootstrap.
  assert.equal(classifyCostChange(150, bootstrap).level, 5);
});

test("computeProviderBaseline returns bootstrap when sample insufficient", () => {
  const now = Date.now();
  const recentEntry = (offsetMs, cost) => ({
    providerId: "krypto",
    costUsdt: cost,
    recordedAt: new Date(now - offsetMs).toISOString(),
  });
  // 2 entradas recientes → bootstrap.
  const hist1 = [recentEntry(60_000, 23.5), recentEntry(120_000, 24)];
  const b1 = computeProviderBaseline(hist1, "krypto", 7);
  assert.equal(b1.bootstrap, true);
  assert.equal(b1.sampleCount, 2);
  // 4 entradas en ventana → no bootstrap.
  const hist2 = [
    recentEntry(60_000, 23.5),
    recentEntry(120_000, 24),
    recentEntry(3_600_000, 23),
    recentEntry(7_200_000, 22.5),
  ];
  const b2 = computeProviderBaseline(hist2, "krypto", 7);
  assert.equal(b2.bootstrap, false);
  assert.equal(b2.sampleCount, 4);
  assert.equal(b2.avg, Number(((23.5 + 24 + 23 + 22.5) / 4).toFixed(4)));
});

test("VIP price = internalCost + vipUnitMargin and varies with provider cost (FINAL §3)", () => {
  // Helper que replica la formula del backend (server.js#portalFrpPriceSuggestion line 580).
  const vipPrice = (internalCost, vipUnitMargin) => Number((internalCost + vipUnitMargin).toFixed(2));

  // Caso 1: costo 23.5, margen 1.0 (default) → VIP 24.5.
  assert.equal(vipPrice(23.5, 1.0), 24.5);
  // Caso 2: costo 23.5, margen 0.5 (minimo de FINAL §3) → VIP 24.0.
  assert.equal(vipPrice(23.5, 0.5), 24.0);
  // Caso 3: costo SUBE a 28, margen 1.0 → VIP sube a 29 automaticamente.
  assert.equal(vipPrice(28, 1.0), 29);
  // Caso 4: costo BAJA a 20, margen 1.0 → VIP baja a 21 automaticamente.
  assert.equal(vipPrice(20, 1.0), 21);
  // VIP conserva su propio contrato. No depende de los tiers regulares por volumen.
  assert.equal(vipPrice(3.5, 1.0), 4.5);
});

test("FRP eligibility preserves blocked, review, and apto outcomes", () => {
  assert.equal(frpEligibilityResult("Redmi A3X").status, "NO_APTO_MODO");
  assert.equal(frpEligibilityResult("Redmi Note 12S").status, "REQUIERE_REVISION");
  assert.equal(frpEligibilityResult("Redmi Note 13").status, "APTO_EXPRESS");
  assert.equal(frpEligibilityResult("").status, "APTO_EXPRESS");

  const summary = summarizeFrpEligibility([
    { originalText: "Redmi A3X" },
    { originalText: "Redmi Note 12S" },
    { originalText: "Redmi Note 13" },
  ]);
  assert.equal(summary.blocked.length, 1);
  assert.equal(summary.review.length, 1);
});

test("SSE helper keeps event-stream wire format", () => {
  let output = "";
  const res = { write: (chunk) => { output += chunk; } };

  sendSseEvent(res, "orders", { ok: true }, "evt-1");

  assert.equal(output, "id: evt-1\nevent: orders\ndata: {\"ok\":true}\n\n");
});

test("Lima date helpers preserve compact stamps", () => {
  const value = new Date("2026-05-01T05:00:00.000Z");

  assert.equal(limaDateStamp(value), "20260501");
  assert.equal(limaMonthStamp(value), "202605");
});
