import assert from "node:assert/strict";
import test from "node:test";

import { buildPublicFrpPriceReport } from "../server/public/frp-prices.js";

test("public FRP price report groups countries and converts current panel price", () => {
  const report = buildPublicFrpPriceReport({
    available: true,
    quantity: 1,
    totalUsdt: 4.30,
    exchangeRates: [
      { country: "Peru", currency: "PEN", ratePerUsdt: 3.8, updatedAt: "2026-05-12T10:00:00.000Z" },
      { country: "Mexico", currency: "MXN", ratePerUsdt: 17.2, updatedAt: "2026-05-12T10:00:00.000Z" },
    ],
    paymentMethods: [
      { country: "Peru", currency: "PEN", ticketOption: true, active: true, displayName: "Yape Peru" },
      { country: "Peru", currency: "PEN", ticketOption: true, active: true, displayName: "Yape Peru Alterno" },
      { country: "Mexico", currency: "MXN", ticketOption: true, active: true, displayName: "Mexico STP" },
      { country: "Global", currency: "USDT", ticketOption: true, active: true, displayName: "Binance Pay" },
      { country: "Global", currency: "USD", ticketOption: false, active: true, displayName: "PayPal" },
    ],
  });

  assert.equal(report.source, "panel_operario");
  assert.equal(report.prices.length, 3);

  const peru = report.prices.find((price) => price.country === "Peru");
  assert.equal(peru.amount, 16.34);
  assert.equal(peru.amountFormatted, "S/ 16.34");
  assert.deepEqual(peru.methods, ["Yape Peru", "Yape Peru Alterno"]);

  const global = report.prices.find((price) => price.country === "Internacional");
  assert.equal(global.amountFormatted, "4.30 USDT");
});
