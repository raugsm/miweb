// Buscador de la web AriTool (src/lib/buscador.ts): reglas W8 #4.
// Corre aparte de la API (pnpm test:web); Node >= 24 lee el .ts directo.
import assert from "node:assert/strict";
import { test } from "node:test";

import { MAX_RESULTADOS, buscar, normalizar } from "../src/lib/buscador.ts";

// Misma forma que devuelve sop_publico.precios('PE'). Las palabras clave las carga el panel.
function catalogo({ claves = {}, herramientasExtra = [] } = {}) {
  const herr = (clave, nombre, horas, precio, disponible = true) => ({
    clave, nombre, horas, moneda: "pen", aviso: null, disponible,
    precio_usdt: disponible ? 1 : null,
    precio_local: disponible ? precio : null,
    palabras_clave: claves[clave] ?? [],
  });
  const serv = (clave, nombre, precio) => ({
    clave, nombre, moneda: "pen", disponible: true, precio_usd: 1, precio_local: precio,
    palabras_clave: claves[clave] ?? [],
  });
  return {
    pais: { codigo: "PE", nombre: "Perú", moneda: "pen", tasa: 3.55 },
    app: { credito_usd: 1, licencia_anual_usd: 25, credito_local: 3.5, licencia_anual_local: 88.75 },
    soporte: { whatsapp: "https://wa.me/51935186037" },
    actualizado_en: "2026-11-05T00:00:00Z",
    servicios: [
      serv("xiaomi_frp", "Xiaomi Reset + FRP", 7.1),
      serv("cuenta_mi", "Xiaomi Mi Account", 56.8),
      { clave: "alquiler", nombre: "Alquiler de herramientas", moneda: "pen", disponible: true, precio_usd: null, precio_local: null, palabras_clave: [] },
    ],
    herramientas: [
      herr("android_multi_tool", "Android Multi Tool", 2, 2.49),
      herr("dft_pro", "DFT Pro", 48, 11.01),
      herr("tr_tools_pro", "TR Tools Pro", 24, null, false),
      herr("tsm_tool_pro", "TSM Tool Pro", 5, 2.49),
      herr("unlock_tool", "Unlock Tool", 6, 6.04),
      herr("ts_tool", "Ts Tool", 2, 5.33),
      herr("tfm_tool_pro", "TFM Tool Pro", 4, null, false),
      ...herramientasExtra.map((n, i) => herr(`extra_${i}`, n, 1, 1)),
    ],
  };
}

const nombres = (r) => r.map((x) => x.nombre);

test("normalizar: sin tildes, sin mayúsculas, sin signos", () => {
  assert.equal(normalizar("  Xiaomi Reset + FRP "), "xiaomi reset frp");
  assert.equal(normalizar("ÁNTICRACK—MDM"), "anticrack mdm");
  assert.equal(normalizar(" + "), "");
});

test("sin texto o sin catálogo no hay resultados", () => {
  assert.deepEqual(buscar(catalogo(), ""), []);
  assert.deepEqual(buscar(catalogo(), "   "), []);
  assert.deepEqual(buscar(null, "frp"), []);
});

test("busca por nombre aunque se escriba a medias", () => {
  const r = buscar(catalogo(), "unlo");
  assert.deepEqual(nombres(r), ["Unlock Tool"]);
  assert.deepEqual(r[0], {
    tipo: "herramienta", clave: "unlock_tool", nombre: "Unlock Tool",
    detalle: "Alquiler · 6 h", precio: 6.04, moneda: "pen", disponible: true,
  });
});

test("el servicio sale con el nombre de la web y se encuentra por los dos nombres", () => {
  assert.deepEqual(nombres(buscar(catalogo(), "cuenta mi")), ["Cuenta MI"]);
  assert.deepEqual(nombres(buscar(catalogo(), "mi account")), ["Cuenta MI"]);
  assert.equal(buscar(catalogo(), "cuenta mi")[0].detalle, "Servicio remoto, desde la app");
});

test("sin palabras clave en el panel, 'frp' encuentra solo lo que se llama FRP", () => {
  assert.deepEqual(nombres(buscar(catalogo(), "frp")), ["Xiaomi Reset + FRP"]);
});

test("con palabras clave del panel: primero el nombre, después las palabras clave (W4)", () => {
  const datos = catalogo({ claves: { unlock_tool: ["frp", "google"], tsm_tool_pro: ["frp"], dft_pro: ["FRP", "mdm"] } });
  assert.deepEqual(nombres(buscar(datos, "frp")), ["Xiaomi Reset + FRP", "DFT Pro", "TSM Tool Pro", "Unlock Tool"]);
  assert.deepEqual(nombres(buscar(datos, "google")), ["Unlock Tool"]);
  assert.deepEqual(nombres(buscar(datos, "MDM")), ["DFT Pro"]);
});

test("lo que no existe no devuelve nada (W5)", () => {
  assert.deepEqual(buscar(catalogo(), "iphone icloud"), []);
  // Todas las palabras tienen que coincidir: no alcanza con una.
  assert.deepEqual(buscar(catalogo(), "unlock iphone"), []);
});

test("máximo 6 resultados", () => {
  const datos = catalogo({ herramientasExtra: ["Alfa Tool", "Beta Tool", "Gama Tool"] });
  const r = buscar(datos, "tool");
  assert.equal(r.length, MAX_RESULTADOS);
});

test("las apagadas van al final, sin precio y sin horas", () => {
  const r = buscar(catalogo(), "pro");
  assert.deepEqual(nombres(r), ["DFT Pro", "TSM Tool Pro", "TR Tools Pro", "TFM Tool Pro"]);
  const apagada = r.find((x) => x.clave === "tr_tools_pro");
  assert.equal(apagada.disponible, false);
  assert.equal(apagada.precio, null);
  assert.equal(apagada.detalle, "Alquiler");
});

test("una o dos letras solo cuentan como comienzo de palabra", () => {
  // "mi" es Cuenta MI, no xiaoMI ni tsM.
  assert.deepEqual(nombres(buscar(catalogo(), "mi")), ["Cuenta MI"]);
  assert.deepEqual(nombres(buscar(catalogo(), "ts")), ["TSM Tool Pro", "Ts Tool"]);
});

test("'alquiler' encuentra las herramientas por su renglón chico", () => {
  const r = buscar(catalogo(), "alquiler");
  assert.equal(r.length, MAX_RESULTADOS);
  assert.ok(r.every((x) => x.tipo === "herramienta"));
  assert.ok(r.slice(0, 5).every((x) => x.disponible));
});

test("la app AriTool se encuentra y su precio sale del catálogo, no de un número fijo", () => {
  const r = buscar(catalogo(), "security plugin");
  assert.deepEqual(nombres(r), ["AriTool · Security Plugin y AntiCrack"]);
  assert.equal(r[0].tipo, "app");
  assert.equal(r[0].precio, 1);
  assert.equal(r[0].moneda, "usd");
  assert.deepEqual(nombres(buscar(catalogo(), "anticrack")), ["AriTool · Security Plugin y AntiCrack"]);
  assert.deepEqual(nombres(buscar(catalogo(), "tecno")), ["AriTool · Security Plugin y AntiCrack"]);

  const sinApp = catalogo();
  delete sinApp.app;
  assert.equal(buscar(sinApp, "anticrack")[0].precio, null);
});

test("las sugerencias del celular encuentran algo en el catálogo", () => {
  for (const s of ["FRP Xiaomi", "Cuenta MI", "DFT Pro", "Security Plugin"]) {
    assert.ok(buscar(catalogo(), s).length > 0, s);
  }
});
