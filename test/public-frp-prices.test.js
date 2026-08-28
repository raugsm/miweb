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

test("public MI account prices use per-country keys with global fallback", () => {
  const report = buildClientAppFrpPriceReport({
    settingsRows: [
      { key: "frp_cost_usdt", value: "3.00" },
      { key: "frp_profit_usdt", value: "1.00" },
      { key: "cuenta_mi_cost_usdt", value: "6.00" },
      { key: "cuenta_mi_profit_usdt", value: "2.50" },
      { key: "cuenta_mi_cost_usdt_pe", value: "3.00" },
      { key: "cuenta_mi_profit_usdt_pe", value: "1.50" },
    ],
    exchangeRateRows: [
      { country_code: "PE", currency: "PEN", rate: "3.55" },
      { country_code: "MX", currency: "MXN", rate: "19" },
      { country_code: "AR", currency: "USDT", rate: "1" },
      { country_code: "EC", currency: "USDT", rate: "1" },
      { country_code: "WW", currency: "USDT", rate: "1" },
    ],
    paymentMethodRows: [
      { country_code: "PE", method_name: "Yape Peregrina", display_order: 1 },
      { country_code: "WW", method_name: "Binance Pay", display_order: 0 },
    ],
  });

  assert.equal(report.miAvailable, true);
  // Cuentas MI no incluye la tarjeta generica USDT; FRP si la conserva.
  assert.deepEqual(
    report.miPrices.map((price) => price.countryCode),
    ["AR", "CL", "CO", "EC", "MX", "PE", "WW"]
  );
  assert.equal(report.miPrices.some((price) => price.countryCode === "USDT"), false);
  assert.equal(report.prices.some((price) => price.countryCode === "USDT"), true);

  const peru = report.miPrices.find((price) => price.countryCode === "PE");
  assert.equal(peru.priceUsdt, 4.5);
  assert.equal(peru.amount, 15.975);
  assert.deepEqual(peru.methods, ["Yape Peregrina"]);

  // Sin llaves por pais cae al global 6.00 + 2.50.
  const mexico = report.miPrices.find((price) => price.countryCode === "MX");
  assert.equal(mexico.priceUsdt, 8.5);
  assert.equal(mexico.amountFormatted, "$161.50 MXN");

  // Argentina, Ecuador y Worldwide se cobran en USDT con tipo de cambio 1.
  const worldwide = report.miPrices.find((price) => price.countryCode === "WW");
  assert.equal(worldwide.country, "Worldwide");
  assert.equal(worldwide.flagCode, "ww");
  assert.equal(worldwide.amountFormatted, "8.50 USDT");
  assert.deepEqual(worldwide.methods, ["Binance Pay"]);

  const argentina = report.miPrices.find((price) => price.countryCode === "AR");
  assert.equal(argentina.available, true);
  assert.equal(argentina.amountFormatted, "8.50 USDT");
  assert.equal(report.miPrices.find((price) => price.countryCode === "EC").amountFormatted, "8.50 USDT");

  // El bloque FRP no cambia.
  assert.equal(report.prices.map((price) => price.countryCode).join(","), "CL,CO,MX,PE,USDT");
  assert.equal(report.prices.find((price) => price.countryCode === "PE").priceUsdt, 4);
});

test("new MI plazas honour their own dashboard keys when loaded", () => {
  const report = buildClientAppFrpPriceReport({
    settingsRows: [
      { key: "cuenta_mi_cost_usdt", value: "6.00" },
      { key: "cuenta_mi_profit_usdt", value: "2.50" },
      { key: "cuenta_mi_cost_usdt_ar", value: "4.00" },
      { key: "cuenta_mi_profit_usdt_ar", value: "1.25" },
    ],
    exchangeRateRows: [
      { country_code: "AR", currency: "USDT", rate: "1" },
      { country_code: "EC", currency: "USDT", rate: "1" },
    ],
  });

  assert.equal(report.miPrices.find((price) => price.countryCode === "AR").priceUsdt, 5.25);
  // Ecuador sigue en la global mientras no tenga sus llaves.
  assert.equal(report.miPrices.find((price) => price.countryCode === "EC").priceUsdt, 8.5);
  // Sin tipo de cambio cargado la tarjeta queda en "Consultar".
  assert.equal(report.miPrices.find((price) => price.countryCode === "WW").available, false);
});

test("tool rental prices convert the tool price per country without USDT", () => {
  const report = buildClientAppFrpPriceReport({
    settingsRows: [
      { key: "frp_cost_usdt", value: "3.00" },
      { key: "frp_profit_usdt", value: "1.00" },
    ],
    exchangeRateRows: [
      { country_code: "CL", currency: "CLP", rate: "975" },
      { country_code: "CO", currency: "COP", rate: "3250" },
      { country_code: "MX", currency: "MXN", rate: "18" },
      { country_code: "PE", currency: "PEN", rate: "3.50" },
    ],
    paymentMethodRows: [{ country_code: "PE", method_name: "Yape Peregrina", display_order: 1 }],
    toolRows: [
      { id: "tool-1", name: "DFT Pro", brand: "", duration_hours: 48, price_usdt: "1.5", sort_order: 0 },
      { id: "tool-2", name: "Sin precio", duration_hours: 24, price_usdt: "0", sort_order: 1 },
    ],
  });

  assert.equal(report.rentalsAvailable, true);
  // La herramienta sin precio cargado no se publica.
  assert.equal(report.rentals.length, 1);

  const dft = report.rentals[0];
  assert.equal(dft.name, "DFT Pro");
  assert.equal(dft.priceUsdt, 1.5);
  assert.equal(dft.durationLabel, "2 dias");
  // El alquiler conserva la tarjeta USDT porque acepta Binance Pay.
  assert.equal(dft.prices.length, 5);
  assert.equal(dft.prices.find((price) => price.countryCode === "USDT").amountFormatted, "1.50 USDT");

  const colombia = dft.prices.find((price) => price.countryCode === "CO");
  assert.equal(colombia.amountFormatted, "4.875 COP");
  assert.equal(colombia.unitLabel, "2 dias");

  const mexico = dft.prices.find((price) => price.countryCode === "MX");
  assert.equal(mexico.amountFormatted, "$27.00 MXN");
});

function rentalReport(toolRows) {
  return buildClientAppFrpPriceReport({
    settingsRows: [
      { key: "frp_cost_usdt", value: "3.00" },
      { key: "frp_profit_usdt", value: "1.00" },
    ],
    exchangeRateRows: [{ country_code: "PE", currency: "PEN", rate: "3.50" }],
    toolRows,
  });
}

test("an exhausted tool pool publishes the price with the external surcharge", () => {
  const report = rentalReport([
    { id: "t1", name: "DFT Pro", duration_hours: 48, price_usdt: "2.10", sort_order: 0, cuentas_libres: 0 },
  ]);

  const dft = report.rentals[0];
  assert.equal(dft.agotada, true);
  assert.equal(dft.precioBaseUsdt, 2.1);
  assert.equal(dft.recargoUsdt, 1);
  assert.equal(dft.priceUsdt, 3.1);
});

test("a tool with free accounts publishes its base price untouched", () => {
  const report = rentalReport([
    { id: "t2", name: "Unlock Tool", duration_hours: 6, price_usdt: "0.70", sort_order: 1, cuentas_libres: 2 },
  ]);

  const tool = report.rentals[0];
  assert.equal(tool.agotada, false);
  assert.equal(tool.recargoUsdt, 0);
  assert.equal(tool.priceUsdt, 0.7);
  assert.equal(tool.precioBaseUsdt, 0.7);
});

test("a missing cuentas_libres never invents a surcharge", () => {
  // undefined, null y "" son \"no se\", no \"cero libres\". Number(null) es 0,
  // asi que este caso es el que rompe si se confia en Number.isFinite a secas.
  for (const rawValue of [undefined, null, ""]) {
    const tool = {
      id: "t3", name: "Vista vieja", duration_hours: 24, price_usdt: "1.00", sort_order: 0,
    };
    if (rawValue !== undefined) tool.cuentas_libres = rawValue;
    const rental = rentalReport([tool]).rentals[0];
    assert.equal(rental.agotada, false, `cuentas_libres=${String(rawValue)} no debe marcar agotada`);
    assert.equal(rental.recargoUsdt, 0);
    assert.equal(rental.priceUsdt, 1);
    assert.equal(rental.cuentasLibres, null);
  }
});

test("the local currency conversion uses the surcharged price", () => {
  const report = rentalReport([
    { id: "t4", name: "DFT Pro", duration_hours: 48, price_usdt: "2.10", sort_order: 0, cuentas_libres: 0 },
  ]);

  const peru = report.rentals[0].prices.find((price) => price.countryCode === "PE");
  // 3.10 x 3.50 = 10.85, no 2.10 x 3.50 = 7.35.
  assert.equal(peru.amount, 10.85);
  assert.equal(peru.amountFormatted, "S/ 10.85");

  const usdt = report.rentals[0].prices.find((price) => price.countryCode === "USDT");
  assert.equal(usdt.amountFormatted, "3.10 USDT");
});

test("an exhausted tool without a base price stays unpublished", () => {
  // El recargo no debe convertir una herramienta sin precio cargado en una de 1 USDT.
  const report = rentalReport([
    { id: "t5", name: "Sin precio", duration_hours: 24, price_usdt: "0", sort_order: 0, cuentas_libres: 0 },
  ]);

  assert.deepEqual(report.rentals, []);
  assert.equal(report.rentalsAvailable, false);
});

test("the rental surcharge leaves FRP and Cuentas MI untouched", () => {
  const settingsRows = [
    { key: "frp_cost_usdt", value: "3.00" },
    { key: "frp_profit_usdt", value: "1.00" },
    { key: "cuenta_mi_cost_usdt", value: "6.00" },
    { key: "cuenta_mi_profit_usdt", value: "2.50" },
  ];
  const exchangeRateRows = [{ country_code: "PE", currency: "PEN", rate: "3.50" }];
  const toolRows = [
    { id: "t6", name: "DFT Pro", duration_hours: 48, price_usdt: "2.10", sort_order: 0, cuentas_libres: 0 },
  ];

  const without = buildClientAppFrpPriceReport({ settingsRows, exchangeRateRows });
  const with_ = buildClientAppFrpPriceReport({ settingsRows, exchangeRateRows, toolRows });

  assert.deepEqual(with_.prices, without.prices);
  assert.deepEqual(with_.miPrices, without.miPrices);
});

test("tool rentals are omitted when the dashboard exposes no tools", () => {
  const report = buildClientAppFrpPriceReport({
    settingsRows: [
      { key: "frp_cost_usdt", value: "3.00" },
      { key: "frp_profit_usdt", value: "1.00" },
    ],
    exchangeRateRows: [{ country_code: "PE", currency: "PEN", rate: "3.50" }],
  });

  assert.deepEqual(report.rentals, []);
  assert.equal(report.rentalsAvailable, false);
  // El resto del reporte sigue funcionando.
  assert.equal(report.prices.length, 5);
});

test("public landing renders separate FRP and Cuentas MI price groups", () => {
  const html = readFileSync(new URL("../public/landing.html", import.meta.url), "utf8");
  const source = readFileSync(new URL("../public/landing-prices.js", import.meta.url), "utf8");

  assert.match(html, /id="public-price-list"/);
  assert.match(html, /id="public-mi-price-list"/);
  assert.match(html, /class="price-group-title">Xiaomi Reset \+ FRP</);
  assert.match(html, /class="price-group-title">Xiaomi Cuentas MI</);
  assert.match(html, /id="public-rental-price-groups"/);
  assert.match(source, /report\?\.miPrices/);
  assert.match(source, /Alquiler de herramientas - \$\{escapeHtml\(rental\.name\)\}/);
  // El aviso de stock agotado solo se pinta cuando el reporte lo confirma.
  assert.match(source, /rental\.agotada/);
  assert.match(source, /Sin stock ahora/);
  assert.match(source, /price-group-note/);
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
