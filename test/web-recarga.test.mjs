// Recargar saldo (src/lib/recarga.ts). Corre con pnpm test:web.
import assert from "node:assert/strict";
import { test } from "node:test";

import { enGrupos, limpiarMonto, metodosDe, minSeg, montoDeDireccion, montoElegido, montoValido, pagoDeActivo, pagoTexto, restan } from "../src/lib/recarga.ts";

test("otro monto: solo dígitos, sin ceros adelante, sin cero suelto, 4 cifras como mucho", () => {
  assert.equal(limpiarMonto(""), "");
  assert.equal(limpiarMonto("0"), "");
  assert.equal(limpiarMonto("000"), "");
  assert.equal(limpiarMonto("007"), "7");
  assert.equal(limpiarMonto("25"), "25");
  assert.equal(limpiarMonto("2 5,50"), "2550");
  assert.equal(limpiarMonto("-30"), "30");
  assert.equal(limpiarMonto("1e3"), "13");
  assert.equal(limpiarMonto("US$ 40"), "40");
  assert.equal(limpiarMonto("123456789"), "1234");
  assert.equal(limpiarMonto("٣٤"), ""); // dígitos de otro alfabeto: no cuentan
  assert.equal(limpiarMonto("<script>"), "");
});

test("monto válido: entero entre 10 y 5000", () => {
  for (const ok of [10, 11, 20, 4999, 5000]) assert.equal(montoValido(ok), true, String(ok));
  for (const mal of [null, 0, 9, 5001, 9999, -20, 10.5, NaN, Infinity]) assert.equal(montoValido(mal), false, String(mal));
});

test("con qué monto se sigue: lo escrito le gana a la tarjeta, aunque no sirva", () => {
  assert.equal(montoElegido(20, ""), 20);
  assert.equal(montoElegido(20, "35"), 35);
  assert.equal(montoElegido(20, "5"), 5); // no sirve: la pantalla avisa y no deja seguir
  assert.equal(montoElegido(20, "000"), 20); // solo ceros = campo vacío
  assert.equal(montoElegido(null, ""), null);
  assert.equal(montoElegido(null, "9999"), 9999);
});

test("monto en la dirección: solo un entero limpio; lo raro se ignora", () => {
  assert.equal(montoDeDireccion("35"), 35);
  assert.equal(montoDeDireccion("5000"), 5000);
  for (const raro of [null, "", "0", "007", "1e3", "-5", "20.5", "abc", "12345", " 20", "20 ", "0x10", "٣٤"]) assert.equal(montoDeDireccion(raro), null, String(raro));
});

test("formas de pago: Yape solo en Perú", () => {
  assert.deepEqual(metodosDe("PE"), ["yape", "binance"]);
  for (const p of ["AR", "MX", "WW", "", "pe"]) assert.deepEqual(metodosDe(p), ["binance"], p);
});

test("números para copiar: en grupos de tres; lo que no es número queda igual", () => {
  assert.equal(enGrupos("999888777"), "999 888 777");
  assert.equal(enGrupos("452118907"), "452 118 907");
  assert.equal(enGrupos("1234567"), "123 456 7");
  assert.equal(enGrupos(" 935186037 "), "935 186 037");
  assert.equal(enGrupos("ariad@pay"), "ariad@pay");
  assert.equal(enGrupos("12345"), "12345");
  assert.equal(enGrupos(""), "");
});

test("tiempo y montos como texto", () => {
  assert.equal(minSeg(872), "14:32");
  assert.equal(minSeg(60), "1:00");
  assert.equal(minSeg(59.9), "0:59");
  assert.equal(minSeg(0), "0:00");
  assert.equal(minSeg(-5), "0:00");
  assert.equal(pagoTexto("yape", "71.00"), "S/ 71.00");
  assert.equal(pagoTexto("binance", "20.00"), "20.00 USDT");
});

test("retomar un pago: mismos datos que al crearlo, y los que faltan no rompen", () => {
  const a = { cobro_id: "c1", metodo: "yape", estado: "creado", vence_en: "2026-11-05T12:15:00Z", producto: "credito", creditos: 20, monto: "71.00", moneda: "PEN", codigo: "ref", codigo_declarado: "417", destino: "999888777", pago_url: "" };
  assert.deepEqual(pagoDeActivo(a), { id: "c1", metodo: "yape", producto: "credito", creditos: 20, monto: "71.00", codigo: "ref", destino: "999888777", pagoUrl: "", venceEn: "2026-11-05T12:15:00Z", codigoDeclarado: "417" });
  const sinNada = pagoDeActivo({ ...a, destino: undefined, pago_url: undefined, codigo_declarado: undefined });
  assert.deepEqual([sinNada.destino, sinNada.pagoUrl, sinNada.codigoDeclarado], ["", "", null]);
});

test("cuánto le queda al pago: nunca negativo, y una fecha rota cuenta como vencida", () => {
  const ahora = Date.parse("2026-11-05T12:00:00Z");
  assert.equal(restan({ venceEn: "2026-11-05T12:14:32Z" }, ahora), 872);
  assert.equal(restan({ venceEn: "2026-11-05T11:00:00Z" }, ahora), 0);
  assert.equal(restan({ venceEn: "no es fecha" }, ahora), 0);
});
