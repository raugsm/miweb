// Recargar saldo (src/lib/recarga.ts). Corre con pnpm test:web.
import assert from "node:assert/strict";
import { test } from "node:test";

import { diaMesAnio, enGrupos, hoyLocal, licenciaActivada, licenciaVigente, limpiarMonto, metodosDe, minSeg, montoDeDireccion, montoElegido, montoValido, pagoDeActivo, pagoTexto, restan } from "../src/lib/recarga.ts";

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

// ---------- Licencia anual (W15) ----------
const lic = (fecha_fin, estado = "vigente") => ({ estado, fecha_inicio: "2026-01-01", fecha_fin, pcs: 1 });

test("licencia vigente: estado vigente y sin vencer (el día que vence todavía vale)", () => {
  const hoy = "2026-11-06";
  assert.equal(licenciaVigente(undefined, hoy), false); // el servidor todavía no la entrega
  assert.equal(licenciaVigente(null, hoy), false); // nunca tuvo
  assert.equal(licenciaVigente(lic("2027-03-01"), hoy), true);
  assert.equal(licenciaVigente(lic("2026-11-06T23:59:59Z"), hoy), true);
  assert.equal(licenciaVigente(lic("2026-11-05"), hoy), false);
  assert.equal(licenciaVigente(lic("2027-03-01", "vencida"), hoy), false);
  assert.equal(licenciaVigente(lic("2027-03-01", "anulada"), hoy), false);
});

test("licencia recién pagada: solo cuenta si vence más tarde que la que tenía", () => {
  const hoy = "2026-11-06";
  // primera compra
  assert.equal(licenciaActivada(null, lic("2027-11-06"), hoy), true);
  assert.equal(licenciaActivada(undefined, lic("2027-11-06"), hoy), true);
  assert.equal(licenciaActivada(null, null, hoy), false); // pagó y todavía no figura
  assert.equal(licenciaActivada(null, undefined, hoy), false);
  // renovar: la misma fecha de antes = todavía no se sumó el año
  assert.equal(licenciaActivada(lic("2027-03-01"), lic("2027-03-01"), hoy), false);
  assert.equal(licenciaActivada(lic("2027-03-01"), lic("2028-03-01"), hoy), true);
  // tenía una vencida y compra de nuevo
  assert.equal(licenciaActivada(lic("2026-05-01", "vencida"), lic("2026-05-01", "vencida"), hoy), false);
  assert.equal(licenciaActivada(lic("2026-05-01", "vencida"), lic("2027-11-06"), hoy), true);
  // nunca una licencia que no está vigente
  assert.equal(licenciaActivada(null, lic("2027-11-06", "pendiente"), hoy), false);
  assert.equal(licenciaActivada(lic("2027-03-01"), lic("2026-01-01"), hoy), false);
});

test("fechas de la licencia", () => {
  assert.equal(diaMesAnio("2027-11-04"), "04/11/2027");
  assert.equal(diaMesAnio("2027-11-04T05:00:00.000Z"), "04/11/2027");
  assert.equal(hoyLocal(new Date(2026, 0, 5, 23, 59)), "2026-01-05");
  assert.equal(hoyLocal(new Date(2026, 10, 6)), "2026-11-06");
});
