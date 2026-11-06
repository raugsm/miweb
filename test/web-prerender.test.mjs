// HTML inicial ya dibujado (server/web/prerender.js). Corre con pnpm test:web.
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { archivoPrerender, cargarPrerender, cspConHuellas } from "../server/web/prerender.js";

const H1 = "'sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='";
const H2 = "'sha256-BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB='";
const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:";

function distCon(manifest) {
  const dist = mkdtempSync(path.join(tmpdir(), "prerender-"));
  mkdirSync(path.join(dist, "prerender"));
  writeFileSync(path.join(dist, "prerender", "manifest.json"), typeof manifest === "string" ? manifest : JSON.stringify(manifest));
  return dist;
}

test("sin build o sin manifiesto: no hay HTML inicial y la política queda igual", () => {
  const pre = cargarPrerender(path.join(tmpdir(), "no-existe-esta-carpeta"));
  assert.equal(archivoPrerender(pre, "/preview-ingresar"), null);
  assert.equal(cspConHuellas(CSP, pre), CSP);
  assert.equal(cspConHuellas(CSP, cargarPrerender(distCon("esto no es json"))), CSP);
});

test("con manifiesto: cada dirección tiene su archivo y las huellas entran solo en style-src y script-src", () => {
  const pre = cargarPrerender(distCon({ rutas: { "/preview-ingresar": "preview-ingresar.html" }, csp: { style: [H1], script: [H2] } }));
  assert.equal(archivoPrerender(pre, "/preview-ingresar"), "preview-ingresar.html");
  assert.equal(archivoPrerender(pre, "/preview-ingresar/"), "preview-ingresar.html");
  assert.equal(archivoPrerender(pre, "/"), null);
  assert.equal(archivoPrerender(pre, "/constructor"), null);
  assert.equal(cspConHuellas(CSP, pre), `default-src 'self'; script-src 'self' ${H2}; style-src 'self' ${H1}; img-src 'self' data: blob:`);
});

test("un manifiesto raro no puede abrir la política ni salir de la carpeta", () => {
  const pre = cargarPrerender(distCon({
    rutas: { "/a": "../../server.js", "/b": "ok.html", "sin-barra": "x.html", "/c": 7 },
    csp: { style: ["'unsafe-inline'", "*", H1], script: ["'unsafe-eval'", "https://malo.example", "'sha256-corta='"] },
  }));
  assert.deepEqual(pre.rutas, { "/b": "ok.html" });
  assert.deepEqual(pre.csp, { style: [H1], script: [] });
  assert.equal(cspConHuellas(CSP, pre), `default-src 'self'; script-src 'self'; style-src 'self' ${H1}; img-src 'self' data: blob:`);
});
