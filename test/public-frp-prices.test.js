import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildClientAppFrpPriceReport } from "../server/public/frp-prices.js";

test("public FRP price report uses AriadGSM Cliente app dashboard rows", () => {
  const report = buildClientAppFrpPriceReport({
    settingsRows: [
      { key: "frp_cost_usdt", value: "3.00" },
      { key: "frp_profit_usdt", value: "1.50" },
    ],
    exchangeRateRows: [
      { country_code: "PE", currency: "PEN", rate: "3.65" },
      { country_code: "MX", currency: "MXN", rate: "19" },
      { country_code: "CO", currency: "COP", rate: "3700" },
      { country_code: "CL", currency: "CLP", rate: "950" },
    ],
    paymentMethodRows: [
      { country_code: "PE", method_name: "Yape Peru", display_order: 2 },
      { country_code: "PE", method_name: "Yape Alterno", display_order: 3 },
      { country_code: "MX", method_name: "Mexico STP", display_order: 1 },
      { country_code: "USDT", method_name: "Binance Pay", display_order: 1 },
    ],
  });

  assert.equal(report.source, "ariadgsm_cliente_app");
  assert.equal(report.sourceLabel, "Dashboard AriadGSM Cliente");
  assert.equal(report.prices.length, 5);

  const peru = report.prices.find((price) => price.country === "Peru");
  assert.equal(peru.flagCode, "pe");
  assert.equal(peru.priceUsdt, 4.5);
  assert.equal(peru.amount, 16.425);
  assert.equal(peru.amountFormatted, "S/ 16.43");
  assert.deepEqual(peru.methods, ["Yape Peru", "Yape Alterno"]);

  const mexico = report.prices.find((price) => price.country === "M\u00e9xico");
  assert.equal(mexico.amountFormatted, "$85.50 MXN");

  const global = report.prices.find((price) => price.country === "Internacional");
  assert.equal(global.flagCode, "binance");
  assert.equal(global.amountFormatted, "4.50 USDT");
  assert.deepEqual(global.methods, ["Binance Pay"]);
});

test("public landing prices refresh near-live from app dashboard endpoint", () => {
  const source = readFileSync(new URL("../public/landing-prices.js", import.meta.url), "utf8");
  assert.match(source, /const livePriceRefreshMs = 5_000/);
  assert.match(source, /window\.setInterval\(schedulePriceRefresh, livePriceRefreshMs\)/);
  assert.doesNotMatch(source, /\/api\/portal\/admin-config\/events/);
});

test("public landing shows latest AriadGSM Cliente version from download RPC endpoint", () => {
  const html = readFileSync(new URL("../public/landing.html", import.meta.url), "utf8");
  const source = readFileSync(new URL("../public/landing-version.js", import.meta.url), "utf8");

  assert.match(html, /data-client-version/);
  assert.match(html, /\/landing-version\.js/);
  assert.match(source, /\/api\/public\/latest-client-version/);
  assert.match(source, /Versi\\u00f3n v/);
});
