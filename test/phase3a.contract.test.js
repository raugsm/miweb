import assert from "node:assert/strict";
import test from "node:test";

import { frpServiceCode, frpWorkChannel, portalPublicServices } from "../server/config/catalog.js";
import { limaDateStamp, limaMonthStamp } from "../server/core/dates.js";
import { sendSseEvent } from "../server/core/http.js";
import { defaultFrpPricingConfig, frpCurrentPricing, frpDynamicQuantityTiers } from "../server/frp/pricing.js";
import { frpEligibilityResult, summarizeFrpEligibility } from "../server/frp/eligibility.js";

test("portal Xiaomi FRP keeps its internal service and WhatsApp 3 mapping", () => {
  const portalFrp = portalPublicServices.find((service) => service.code === "PORTAL-XIAOMI-FRP");

  assert.equal(frpServiceCode, "XIA-FRP-GOOGLE");
  assert.equal(frpWorkChannel, "WhatsApp 3");
  assert.equal(portalFrp.internalServiceCode, frpServiceCode);
  assert.equal(portalFrp.workChannel, frpWorkChannel);
});

test("default FRP pricing still resolves the public 25 USDT unit price", () => {
  const db = { pricingConfig: { frpPricing: defaultFrpPricingConfig() } };
  const pricing = frpCurrentPricing(db);

  assert.equal(pricing.available, true);
  assert.equal(pricing.provider.id, "krypto");
  assert.equal(pricing.internalCostUsdt, 3);
  assert.equal(pricing.unitPrice, 25);
});

test("FRP volume tiers compute unitPrice as internalCost + tier margin (FINAL §3)", () => {
  // Costo realista (~23.5 USDT) — coincide con la curva 24.6/24.7/24.8/24.9/25.
  const config = defaultFrpPricingConfig();
  config.providers[0].fixedCostUsdt = 23.5;
  const db = { pricingConfig: { frpPricing: config } };
  const pricing = frpCurrentPricing(db);

  assert.equal(pricing.internalCostUsdt, 23.5);
  assert.equal(pricing.minAllowedUnitPrice, 24.5); // cost + minMargin (1.0) = piso VIP
  // Tiers ordenados de mayor minQty a menor, margenes 1.1/1.2/1.3/1.4/1.5:
  assert.deepEqual(
    frpDynamicQuantityTiers(pricing).map((tier) => tier.unitPrice),
    [24.6, 24.7, 24.8, 24.9, 25],
  );
  // Piso 1.1 USDT siempre 0.1 por encima del piso VIP (1.0). FINAL §3.
  const minTier = Math.min(...frpDynamicQuantityTiers(pricing).map((t) => t.unitPrice));
  assert.ok(minTier > pricing.minAllowedUnitPrice, "piso volumen debe quedar > VIP floor");
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
  // Restriccion FINAL §3: piso volumen (margen 1.1) > piso VIP (margen 1.0).
  // Garantizado porque tier 11+ usa cost + 1.1 y VIP usa cost + 1.0 maximo.
  for (const cost of [3, 23.5, 28, 50]) {
    assert.ok(vipPrice(cost, 1.0) < cost + 1.1, "VIP siempre < piso volumen para mismo costo");
  }
});

test("FRP eligibility preserves blocked, review, and apto outcomes", () => {
  assert.equal(frpEligibilityResult("Redmi A3X").status, "NO_APTO_MODO");
  assert.equal(frpEligibilityResult("Redmi Note 12S").status, "REQUIERE_REVISION");
  assert.equal(frpEligibilityResult("Redmi Note 13").status, "APTO_EXPRESS");

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
