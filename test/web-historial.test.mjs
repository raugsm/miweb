// Historial de "Mi cuenta" (src/lib/historial.ts). Corre con pnpm test:web.
import assert from "node:assert/strict";
import { test } from "node:test";

import { fechaCorta, filasHistorial, filtrarHistorial, iniciales, montoTexto } from "../src/lib/historial.ts";

const CATALOGO = { xiaomi_frp: "Xiaomi Reset + FRP", cuenta_mi: "Cuenta MI" };

// Misma forma que devuelve cliente_resumen; los valores imitan las formas reales de producción.
const mov = (o) => ({ tipo: "consumo", cantidad: -1, saldo_despues: 0, motivo: "", referencia: "", servicio: null, fecha_registro: "2026-11-03T18:05:00Z", ...o });
const resumen = (movimientos, trabajos = []) => ({ nombre: "Taller Rivera", saldo: 32, saldo_usd: 32.4, totales: { procesos: 0, consumidos: 0, recargados: 0 }, trabajos, movimientos, parametros: {} });

test("recargas: Yape, Binance y la del panel (el texto libre del operador no se muestra)", () => {
  const f = filasHistorial(resumen([
    mov({ tipo: "recarga", cantidad: 2000, cantidad_usd: 20, saldo_despues: 3240, saldo_despues_centavos: 3240, motivo: "Binance Pay", referencia: "Y9XN", fecha_registro: "2026-11-03T18:05:00Z" }),
    mov({ tipo: "recarga", cantidad_usd: 10, motivo: "Yape", referencia: "yape:35.5|123|99999999|S", fecha_registro: "2026-11-02T10:00:00Z" }),
    mov({ tipo: "recarga", cantidad_usd: 5, motivo: "Gracias por tu recarga", fecha_registro: "2026-11-01T10:00:00Z" }),
  ]), CATALOGO);
  assert.deepEqual(f.map((x) => x.que), ["Recarga · Binance", "Recarga · Yape", "Recarga"]);
  assert.deepEqual(f[0], { fecha: "2026-11-03T18:05:00Z", que: "Recarga · Binance", clase: "recarga", pedido: null, monto: 20, saldo: 32.4 });
});

test("consumos: el nombre sale del catálogo y el pedido del motivo o de la referencia", () => {
  const f = filasHistorial(resumen([
    mov({ servicio: "frp", cantidad_usd: -2.5, motivo: "FRP AT-261102-031", referencia: "fdfa111c-1111-411c-aab1-000000000000", fecha_registro: "2026-11-02T11:20:00Z" }),
    mov({ servicio: "cuenta_mi", cantidad_usd: -4.5, motivo: "pago con saldo · PE · 16.00 USD", referencia: "AT-261101-044", fecha_registro: "2026-11-01T18:40:00Z" }),
    mov({ servicio: null, cantidad_usd: -1, motivo: "Consumo proceso", referencia: "manual-2026-10-22", fecha_registro: "2026-10-22T18:40:00Z" }),
  ]), CATALOGO);
  assert.deepEqual(f.map((x) => [x.que, x.pedido, x.monto]), [
    ["Xiaomi Reset + FRP", "AT-261102-031", -2.5],
    ["Cuenta MI", "AT-261101-044", -4.5],
    ["Security Plugin", null, -1],
  ]);
});

test("alquiler: sin la v19 dice solo 'Alquiler'; con la v19 suma herramienta, horas y pedido", () => {
  const viejo = filasHistorial(resumen([mov({ servicio: "alquiler", cantidad_usd: -2.4, motivo: "Alquiler AT-261103-112", referencia: "c11e1111-1111-4ae1-bce1-000000000000" })]), CATALOGO);
  assert.deepEqual([viejo[0].que, viejo[0].pedido], ["Alquiler", "AT-261103-112"]);
  const nuevo = filasHistorial(resumen([mov({ servicio: "alquiler", cantidad_usd: -2.4, motivo: "Alquiler", referencia: "c11e1111-1111-4ae1-bce1-000000000000", pedido: "AT-261103-112", detalle: "Unlock Tool · 6 h" })]), CATALOGO);
  assert.deepEqual([nuevo[0].que, nuevo[0].pedido], ["Alquiler · Unlock Tool · 6 h", "AT-261103-112"]);
});

test("devoluciones: 'Devolución · servicio' y su pedido", () => {
  const f = filasHistorial(resumen([
    mov({ tipo: "devolucion", servicio: "cuenta_mi", cantidad_usd: 4.5, motivo: "devolución automática · fallido · AT-261101-044", referencia: "AT-261101-044" }),
    mov({ tipo: "devolucion", servicio: "frp", cantidad_usd: 2, motivo: "Devuelto al saldo · caso AT-261104-007 · Equipo con MDM", referencia: "f1f1111f-ae1f-4111-a111-000000000000", fecha_registro: "2026-11-01T00:00:00Z" }),
  ]), CATALOGO);
  assert.deepEqual(f.map((x) => [x.que, x.pedido, x.monto]), [["Devolución · Cuenta MI", "AT-261101-044", 4.5], ["Devolución · Xiaomi Reset + FRP", "AT-261104-007", 2]]);
});

test("procesos con licencia: entran por fecha, sin monto y con el saldo de ese momento; los cobrados no se duplican", () => {
  const f = filasHistorial(resumen(
    [mov({ tipo: "recarga", cantidad_usd: 20, motivo: "Yape", fecha_registro: "2026-11-03T18:05:00Z" }), mov({ servicio: "frp", cantidad_usd: -2, saldo_despues_centavos: 1730, motivo: "FRP AT-261029-001", fecha_registro: "2026-10-29T10:00:00Z" })],
    [{ folio: "88213", estado: "exitoso", fecha: "2026-10-30T10:15:00Z", modelo: "Infinix Hot 50 Pro", con_licencia: true }, { folio: "88100", estado: "exitoso", fecha: "2026-10-28T10:15:00Z", modelo: "Tecno Spark", con_licencia: false }, { folio: "88000", estado: "exitoso", fecha: "2026-10-27T10:15:00Z", modelo: "itel A70" }],
  ), CATALOGO);
  assert.deepEqual(f.map((x) => x.que), ["Recarga · Yape", "Security Plugin · Infinix Hot 50 Pro", "Xiaomi Reset + FRP"]);
  assert.deepEqual(f[1], { fecha: "2026-10-30T10:15:00Z", que: "Security Plugin · Infinix Hot 50 Pro", clase: "uso", pedido: "folio 88213", monto: null, saldo: 17.3 });
});

test("ajustes del panel: dicen 'Ajuste', no el nombre de un servicio", () => {
  const f = filasHistorial(resumen([
    mov({ tipo: "ajuste", cantidad_usd: -1, saldo_despues_centavos: 0, motivo: "Reverso Binance Pay", referencia: "VQQMJ3DE" }),
  ]), CATALOGO);
  assert.deepEqual([f[0].que, f[0].clase, f[0].pedido, f[0].monto], ["Ajuste", "otro", null, -1]);
});

test("historial completo: el saldo de un proceso con licencia viene del servidor y se respeta", () => {
  const f = filasHistorial(resumen([], [{ folio: "1", estado: "exitoso", fecha: "2026-10-30T10:00:00Z", modelo: "itel A70", con_licencia: true, saldo_centavos: 1730 }]));
  assert.equal(f[0].saldo, 17.3);
});

test("filtros del historial: por clase y por período", () => {
  const f = filasHistorial(resumen(
    [
      mov({ tipo: "recarga", cantidad_usd: 20, motivo: "Yape", fecha_registro: "2026-11-03T18:05:00Z" }),
      mov({ servicio: "frp", cantidad_usd: -2, fecha_registro: "2026-11-02T10:00:00Z" }),
      mov({ tipo: "devolucion", servicio: "frp", cantidad_usd: 2, fecha_registro: "2026-11-02T11:00:00Z" }),
      mov({ tipo: "ajuste", cantidad_usd: 1, fecha_registro: "2026-09-01T10:00:00Z" }),
    ],
    [{ folio: "1", estado: "exitoso", fecha: "2026-10-30T10:00:00Z", modelo: "itel A70", con_licencia: true }],
  ), CATALOGO);
  const hoy = new Date("2026-11-05T12:00:00Z");
  assert.equal(filtrarHistorial(f, "todo", null, hoy).length, 5);
  assert.deepEqual(filtrarHistorial(f, "recargas", null, hoy).map((x) => x.que), ["Recarga · Yape"]);
  assert.deepEqual(filtrarHistorial(f, "usos", null, hoy).map((x) => x.que), ["Xiaomi Reset + FRP", "Security Plugin · itel A70"]);
  assert.deepEqual(filtrarHistorial(f, "devoluciones", null, hoy).map((x) => x.que), ["Devolución · Xiaomi Reset + FRP"]);
  assert.equal(filtrarHistorial(f, "todo", 30, hoy).length, 4); // el ajuste de septiembre queda afuera
  assert.equal(filtrarHistorial(f, "todo", 7, hoy).length, 4);
  assert.deepEqual(filtrarHistorial(f, "todo", 3, hoy).map((x) => x.que), ["Recarga · Yape"]); // desde el mediodía del 2: los de esa mañana quedan afuera
});

test("saldo de un proceso con licencia: el del movimiento anterior; si no hay, el de antes del siguiente; si no hay ninguno, el de hoy", () => {
  const lic = (fecha, folio) => ({ folio, estado: "exitoso", fecha, modelo: "itel A70", con_licencia: true });
  // Dos seguidos: los dos quedan con el saldo del movimiento anterior.
  const seguidos = filasHistorial(resumen(
    [mov({ servicio: "frp", cantidad_usd: -2, saldo_despues_centavos: 1730, fecha_registro: "2026-10-29T10:00:00Z" })],
    [lic("2026-10-30T10:00:00Z", "1"), lic("2026-10-31T10:00:00Z", "2")],
  ));
  assert.deepEqual(seguidos.map((x) => x.saldo), [17.3, 17.3, 17.3]);
  // Sin movimiento anterior: lo que había antes del movimiento que sigue (32.40 − 20.00).
  const primero = filasHistorial(resumen(
    [mov({ tipo: "recarga", cantidad_usd: 20, saldo_despues_centavos: 3240, motivo: "Yape", fecha_registro: "2026-11-03T18:05:00Z" })],
    [lic("2026-10-30T10:00:00Z", "1")],
  ));
  assert.deepEqual(primero.map((x) => x.saldo), [32.4, 12.4]);
  // Sin ningún movimiento: el saldo no se movió, es el de hoy.
  assert.deepEqual(filasHistorial(resumen([], [lic("2026-10-30T10:00:00Z", "1")])).map((x) => x.saldo), [32.4]);
});

test("sin movimientos no hay filas", () => {
  assert.deepEqual(filasHistorial(resumen([])), []);
});

test("textos: monto con signo, fecha corta e iniciales", () => {
  assert.equal(montoTexto(20), "+20.00");
  assert.equal(montoTexto(-2.4), "−2.40");
  assert.equal(montoTexto(0), "+0.00");
  assert.match(fechaCorta("2026-11-03T18:05:00"), /^03\/11 18:05$/);
  assert.equal(fechaCorta("no es fecha"), "");
  assert.equal(iniciales("Taller Rivera"), "TR");
  assert.equal(iniciales("  raul "), "RA");
  assert.equal(iniciales("Juan Carlos Pérez"), "JC");
  assert.equal(iniciales(""), "");
});
