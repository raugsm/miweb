// HTML inicial ya dibujado de algunas pantallas de la web (hoy, Ingresar).
//
// El build (scripts/prerender-web.mjs) deja en dist/prerender/ un HTML por pantalla, con su CSS critico
// y un script chico en linea, y un manifest.json que dice que direccion usa cada uno y la huella (hash)
// de esos dos bloques. Aca se lee ese manifiesto y se arman las dos cosas que necesita server.js:
// que archivo mandar y que huellas sumar a la politica de seguridad de contenido.
//
// La politica sigue sin permitir estilos ni scripts en linea en general: solo se autorizan esos bloques
// exactos, por su huella sha256. Si el contenido cambia un caracter, la huella ya no coincide y el
// navegador lo bloquea.

import { readFileSync } from "node:fs";
import path from "node:path";

const HUELLA = /^'sha256-[A-Za-z0-9+/]{43}='$/;
const ARCHIVO = /^[a-z0-9-]+\.html$/;
const VACIO = Object.freeze({ rutas: Object.freeze({}), csp: Object.freeze({ style: [], script: [] }) });

function soloHuellas(lista) {
  return Array.isArray(lista) ? lista.filter((h) => typeof h === "string" && HUELLA.test(h)) : [];
}

/** Lee dist/prerender/manifest.json. Sin build, sin prerender o con el archivo roto: nada que servir. */
export function cargarPrerender(distDir) {
  try {
    const m = JSON.parse(readFileSync(path.join(distDir, "prerender", "manifest.json"), "utf8"));
    const rutas = {};
    for (const [ruta, archivo] of Object.entries(m.rutas ?? {})) {
      if (ruta.startsWith("/") && typeof archivo === "string" && ARCHIVO.test(archivo)) rutas[ruta] = archivo;
    }
    return { rutas, csp: { style: soloHuellas(m.csp?.style), script: soloHuellas(m.csp?.script) } };
  } catch {
    return VACIO;
  }
}

/** Nombre del archivo (dentro de dist/prerender/) con el HTML inicial de `pathname`, o null si no tiene. */
export function archivoPrerender(pre, pathname) {
  const ruta = pathname.length > 1 ? pathname.replace(/\/+$/, "") : "/";
  return Object.hasOwn(pre.rutas, ruta) ? pre.rutas[ruta] : null;
}

/** La politica `csp` con las huellas de los bloques en linea del HTML inicial sumadas a style-src y script-src. */
export function cspConHuellas(csp, pre) {
  const sumar = (directiva, huellas) => (parte) =>
    huellas.length && parte.trim().startsWith(`${directiva} `) ? `${parte} ${huellas.join(" ")}` : parte;
  return csp
    .split(";")
    .map(sumar("style-src", pre.csp.style))
    .map(sumar("script-src", pre.csp.script))
    .join(";");
}
