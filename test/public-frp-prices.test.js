import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
  assert.equal(peru.flag, "🇵🇪");
  assert.equal(peru.flagCode, "pe");
  assert.equal(peru.amount, 16.34);
  assert.equal(peru.amountFormatted, "S/ 16.34");
  assert.deepEqual(peru.methods, ["Yape Peru", "Yape Peru Alterno"]);

  const global = report.prices.find((price) => price.country === "Internacional");
  assert.equal(global.flag, "🌐");
  assert.equal(global.flagCode, "binance");
  assert.equal(global.amountFormatted, "4.30 USDT");
});

test("public landing prices refresh live from worker dashboard pricing events", () => {
  const source = readFileSync(new URL("../public/landing-prices.js", import.meta.url), "utf8");
  assert.match(source, /new EventSource\("\/api\/portal\/admin-config\/events"\)/);
  assert.match(source, /exchange_rate_changed/);
  assert.match(source, /payment_method_toggled/);
  assert.match(source, /portal_catalog_changed/);
  assert.match(source, /payload\.scope !== "frp_pricing"/);
});
