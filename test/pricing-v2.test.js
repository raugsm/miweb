import assert from "node:assert/strict";
import test from "node:test";

import { defaultFrpPricingConfig, frpCurrentPricing, frpPriceBreakdown } from "../server/frp/pricing.js";
import { moneyNumber } from "../server/core/money.js";

function kryptoThreeDollarPricing() {
  const config = defaultFrpPricingConfig();
  config.providers = config.providers.map((provider) => (
    provider.id === "krypto" ? { ...provider, fixedCostUsdt: 3.00 } : provider
  ));
  config.policy.targetMarginUsdt = 1.00;
  return frpCurrentPricing({ pricingConfig: { frpPricing: config } });
}

test("pricing v2 canonical registered totals are exact", () => {
  const pricing = kryptoThreeDollarPricing();
  const expected = new Map([[1, 4.30], [2, 8.30], [3, 12.30], [5, 20.30], [10, 40.30]]);

  for (const [quantity, total] of expected.entries()) {
    assert.equal(frpPriceBreakdown(pricing, { quantity, isGuest: false }).totalUsdt, total);
  }
});

test("pricing v2 canonical guest totals are exact", () => {
  const pricing = kryptoThreeDollarPricing();
  const expected = new Map([[1, 4.50], [2, 8.70], [3, 12.90], [5, 21.30], [10, 42.30]]);

  for (const [quantity, total] of expected.entries()) {
    const breakdown = frpPriceBreakdown(pricing, { quantity, isGuest: true });
    assert.equal(breakdown.totalUsdt, total);
    assert.equal(breakdown.guestSurchargePerEquipmentUsdt, 0.20);
  }
});

test("pricing v2 VIP preserves manual margin and operator fee", () => {
  const pricing = kryptoThreeDollarPricing();
  for (const [vipUnitMargin, total] of [[0.5, 17.80], [1.0, 20.30]]) {
    const vipPricing = {
      ...pricing,
      baseUnitPriceUsdt: moneyNumber(pricing.internalCostUsdt + vipUnitMargin),
      unitPrice: moneyNumber(pricing.internalCostUsdt + vipUnitMargin),
    };
    const breakdown = frpPriceBreakdown(vipPricing, { quantity: 5, isGuest: false });
    assert.equal(breakdown.totalUsdt, total);
    assert.equal(breakdown.effectiveMarginUsdt, vipUnitMargin);
  }
});
