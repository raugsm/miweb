// HTML inicial ya dibujado de Ingresar. Corre al final de `pnpm build`.
//
// Con internet lento, React tarda en llegar. Para que la pantalla se VEA desde el primer HTML, acá se
// dibuja con los mismos componentes de la página (src/prerender/ingresar.tsx) y se arma un HTML que ya
// la trae adentro, con el CSS que necesita en línea. Queda en dist/prerender/ y lo sirve server.js
// (server/web/prerender.js) solo para esa dirección; el resto de la web sigue igual.
//
// El servidor no permite estilos ni scripts en línea (política de seguridad de contenido). Por eso:
//  - todos los `style="…"` del dibujo se pasan a clases dentro del bloque <style>;
//  - el bloque <style> y el <script> chico se autorizan por su huella sha256, que va en manifest.json.
//
// Cuando React termina de cargar, la página real toma lo que el cliente ya escribió y retira este
// dibujo (src/lib/previo.ts). Los nombres que se usan en los dos lados: #pre, data-pre, window.__pre.

import { createHash } from "node:crypto"
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createServer } from "vite"

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), "..")
const dist = path.join(raiz, "dist")
const CORTE = 1024 // de este ancho para arriba va la versión de compu (igual que `lg:` y que la página)

// ---------- 1) dibujar la pantalla sin navegador ----------
const vite = await createServer({ root: raiz, server: { middlewareMode: true }, appType: "custom", logLevel: "warn" })
let dibujo, RUTA, WA
try {
  const mod = await vite.ssrLoadModule("/src/prerender/ingresar.tsx")
  dibujo = mod.render()
  RUTA = mod.RUTA
  WA = (await vite.ssrLoadModule("/src/components/aritool/chrome.tsx")).WA
} finally {
  await vite.close()
}

// ---------- 2) acomodar el HTML del dibujo ----------
const reglasEstilo = new Map() // declaraciones → clase generada
function claseDe(declaraciones) {
  if (!reglasEstilo.has(declaraciones)) reglasEstilo.set(declaraciones, `s${reglasEstilo.size + 1}`)
  return reglasEstilo.get(declaraciones)
}
const desescapar = (t) => t.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, "&")

/** `rama`: "c" (compu) o "m" (celular). Los campos quedan con otro id para no chocar con los de la página real. */
function acomodar(html, rama) {
  return html
    // React agrega avisos de precarga de imágenes: acá no hacen falta, las imágenes ya están en el dibujo.
    .replace(/<link rel="preload"[^>]*>/g, "")
    .replace(/<[a-zA-Z][^>]*>/g, (etiqueta) => {
      let t = etiqueta
      // style="…" → clase (el servidor no permite estilos en línea)
      const estilo = t.match(/ style="([^"]*)"/)
      if (estilo) {
        const clase = claseDe(desescapar(estilo[1]))
        t = t.replace(estilo[0], "")
        t = / class="/.test(t) ? t.replace(/ class="([^"]*)"/, ` class="$1 ${clase}"`) : t.replace(/^<([a-zA-Z0-9]+)/, `<$1 class="${clase}"`)
      }
      // ids de los campos: "correo" → "pre-c-correo", y data-pre="correo" para encontrarlos después.
      // (Solo los campos: los ids de adentro de los SVG se usan entre ellos y no se tocan.)
      if (/^<(input|select|textarea)\b/.test(t)) t = t.replace(/ id="([^"]+)"/, ` id="pre-${rama}-$1" data-pre="$1"`)
      t = t.replace(/ for="([^"]+)"/, ` for="pre-${rama}-$1"`)
      return t
    })
}
const compu = acomodar(dibujo.compu, "c")
const celular = acomodar(dibujo.celular, "m")
const cuerpoPre = `<div class="pre-compu">${compu}</div><div class="pre-celular">${celular}</div>`
if (/ style="/.test(cuerpoPre)) throw new Error("prerender: quedó un style en línea; el servidor lo bloquearía")

const telefono = WA.replace(/\D/g, "").replace(/^(\d{2})(\d{3})(\d{3})(\d{3})$/, "+$1 $2 $3 $4")
const sinJs = `<noscript><div class="pre-sinjs">Para ingresar hace falta JavaScript, y en este navegador está apagado. Activalo y volvé a cargar la página, o escribinos por WhatsApp: <a href="${WA}">${telefono}</a></div></noscript>`

// ---------- 3) CSS crítico: del CSS del build, solo lo que usa el dibujo ----------
const archivosCss = (await readdir(path.join(dist, "assets"))).filter((f) => /^index-.*\.css$/.test(f))
if (archivosCss.length !== 1) throw new Error(`prerender: esperaba un index-*.css en dist/assets y hay ${archivosCss.length}`)
const cssBuild = (await readFile(path.join(dist, "assets", archivosCss[0]), "utf8")).replace(/\/\*[\s\S]*?\*\//g, "")

const usadas = new Set(["dark"])
for (const m of cuerpoPre.matchAll(/ class="([^"]*)"/g)) for (const c of m[1].split(/\s+/)) if (c) usadas.add(c)

/** Parte un CSS en sus piezas de primer nivel: bloques `cabeza{cuerpo}` y sentencias sueltas `…;`. */
function piezas(css) {
  const out = []
  let hondo = 0, inicio = 0, finCabeza = -1
  for (let i = 0; i < css.length; i++) {
    const c = css[i]
    if (c === '"' || c === "'") {
      i = css.indexOf(c, i + 1)
      if (i < 0) throw new Error("prerender: comilla sin cerrar en el CSS")
    } else if (c === "{") {
      if (hondo === 0) finCabeza = i
      hondo++
    } else if (c === "}") {
      hondo--
      if (hondo === 0) {
        out.push({ cabeza: css.slice(inicio, finCabeza).trim(), cuerpo: css.slice(finCabeza + 1, i) })
        inicio = i + 1
      }
    } else if (c === ";" && hondo === 0) {
      out.push({ suelta: css.slice(inicio, i + 1).trim() })
      inicio = i + 1
    }
  }
  return out
}

/** ¿Algún selector de la lista usa solo clases que están en el dibujo? `sinClases`: qué hacer con los que no tienen ninguna. */
function selectorSirve(lista, sinClases) {
  return lista.split(",").some((sel) => {
    const clases = [...sel.matchAll(/\.((?:\\.|[\w-])+)/g)].map((m) => m[1].replace(/\\(.)/g, "$1"))
    return clases.length ? clases.every((c) => usadas.has(c)) : sinClases
  })
}

function filtrar(css, sinClases) {
  let out = ""
  for (const p of piezas(css)) {
    if (p.suelta) continue
    if (/^@(media|supports|container|layer)\b/.test(p.cabeza)) {
      const dentro = filtrar(p.cuerpo, sinClases)
      if (dentro) out += `${p.cabeza}{${dentro}}`
    } else if (!p.cabeza.startsWith("@") && selectorSirve(p.cabeza, sinClases)) {
      out += `${p.cabeza}{${p.cuerpo}}`
    }
  }
  return out
}

let critico = ""
const sueltas = []
for (const p of piezas(cssBuild)) {
  if (p.suelta) {
    if (p.suelta.startsWith("@layer")) critico += p.suelta // el orden de las capas
  } else if (/^@layer (theme|base)$/.test(p.cabeza)) {
    critico += `${p.cabeza}{${p.cuerpo}}` // variables y estilos base: enteros
  } else if (/^@layer\b/.test(p.cabeza)) {
    const dentro = filtrar(p.cuerpo, false)
    if (dentro) critico += `${p.cabeza}{${dentro}}`
  } else {
    sueltas.push(p)
  }
}
for (const p of sueltas) {
  if (p.cabeza.startsWith("@font-face")) {
    if (p.cuerpo.includes("inter-3.19")) critico += `${p.cabeza}{${p.cuerpo}}` // la tipografía de la web nueva
  } else if (p.cabeza.startsWith("@property")) {
    if (critico.includes(`var(${p.cabeza.split(/\s+/)[1]}`)) critico += `${p.cabeza}{${p.cuerpo}}`
  } else if (/^@(media|supports|container)\b/.test(p.cabeza)) {
    const dentro = filtrar(p.cuerpo, false)
    if (dentro) critico += `${p.cabeza}{${dentro}}`
  } else if (!p.cabeza.startsWith("@") && selectorSirve(p.cabeza, true)) {
    critico += `${p.cabeza}{${p.cuerpo}}`
  }
}

// Reglas propias del dibujo. Van fuera de las capas, así que le ganan a las utilidades (como le gana un style en línea).
const propias = [
  "#pre{position:relative}",
  "#pre~#root{display:none}", // la página real se muestra sola cuando se retira el dibujo
  `@media (min-width:${CORTE}px){.pre-celular{display:none}}`,
  `@media not (min-width:${CORTE}px){.pre-compu{display:none}}`,
  ".pre-espera .pre-emblema{opacity:0}", // esperando la entrada animada (ver el script de abajo)
  ".pre-cargando{opacity:.6;pointer-events:none}",
  // Pegado abajo de la ventana pero ocupando su lugar al final de la página: al bajar del todo no tapa nada.
  ".pre-sinjs{position:sticky;z-index:99;bottom:0;padding:12px 16px;background:#1f1a0e;border-top:1px solid #5c4a1a;color:#fcd34d;font:14px/1.45 Inter,system-ui,sans-serif;text-align:center}",
  ".pre-sinjs a{color:#86efac;font-weight:600;white-space:nowrap}",
  ...[...reglasEstilo].map(([declaraciones, clase]) => `.${clase}{${declaraciones}}`),
].join("")
const estilo = critico + propias

// ---------- 4) el script chico: lo mínimo para que el dibujo no falle antes de que llegue React ----------
const indice = await readFile(path.join(dist, "index.html"), "utf8")
const hojas = [...indice.matchAll(/[ \t]*<link rel="stylesheet"[^>]*href="(\/assets\/[^"]+\.css)"[^>]*>\n?/g)]
if (!hojas.some((h) => /\/index-/.test(h[1]))) throw new Error("prerender: no encontré la hoja de estilos en dist/index.html")
if (!indice.includes('<div id="root"></div>')) throw new Error('prerender: no encontré <div id="root"></div> en dist/index.html')

// Lo primero que hace es pedir las hojas de estilo completas, en su orden. Puestas como <link> en el HTML
// frenaban el primer dibujo (y a este script) hasta que llegaban; pedidas desde acá, no frenan nada.
const guion = `(function(){var d=document;${JSON.stringify(hojas.map((h) => h[1]))}.forEach(function(h){var l=d.createElement("link");l.rel="stylesheet";l.crossOrigin="";l.href=h;d.head.appendChild(l)});
var p=d.getElementById("pre");if(!p)return;
var sesion=false;try{sesion=!!localStorage.getItem("sb-sdarsjdwnuimjruthjwz-auth-token")}catch(e){sesion=true}
if(sesion||/[?&]v=/.test(location.search)){p.remove();return}
var w=window.__pre={},c=navigator.connection||{},vista=false;
try{vista=sessionStorage.getItem("aritool-ingresar-entrada")==="1"}catch(e){}
var anima=innerWidth>=${CORTE}&&!matchMedia("(prefers-reduced-motion: reduce)").matches&&!c.saveData&&!/2g|3g/.test(c.effectiveType||"");
if(anima&&!vista){p.classList.add("pre-espera");setTimeout(function(){p.classList.remove("pre-espera");w.emblema="quieto"},2500)}else w.emblema="quieto";
function tocar(b){var t=(b.textContent||"").trim();
if(t==="Ingresar"){w.pendiente="ingresar";b.classList.add("pre-cargando");var s=b.querySelector("span")||b;s.textContent="Cargando\\u2026"}
else if(t==="Crear cuenta")w.pendiente="crear";
else if(t.indexOf("Olvidaste")>=0)w.pendiente="recuperar"}
p.addEventListener("click",function(e){var b=e.target.closest("button");if(b){e.preventDefault();tocar(b)}});
p.addEventListener("keydown",function(e){if(e.key==="Enter"&&e.target.tagName==="INPUT"){var bs=p.querySelectorAll("button");for(var i=0;i<bs.length;i++)if(bs[i].offsetParent&&(bs[i].textContent||"").trim()==="Ingresar"){tocar(bs[i]);break}}});
})();`

// ---------- 5) armar el HTML y el manifiesto ----------
// El CSS crítico va en línea. La hoja completa se avisa con "preload" (baja ya, sin frenar el dibujo) y la
// pone el script; sin JavaScript va por <noscript>. Las funciones de reemplazo evitan que un "$" del
// contenido se tome como parte de un patrón.
const enlaces = (rel) => hojas.map((h) => `<link rel="${rel}" crossorigin href="${h[1]}">`).join("")
let html = indice
hojas.forEach((h, i) => {
  // en el lugar de la primera hoja va todo; las demás se quitan
  html = html.replace(h[0], () => (i ? "" : `    ${enlaces('preload" as="style')}\n    <noscript>${enlaces("stylesheet")}</noscript>\n    <style>${estilo}</style>\n`))
})
html = html
  .replace('<div id="root"></div>', () => `<div id="pre">${cuerpoPre}${sinJs}</div>\n    <script>${guion}</script>\n    <div id="root"></div>`)

const huella = (texto) => `'sha256-${createHash("sha256").update(texto, "utf8").digest("base64")}'`
const archivo = `${RUTA.replace(/^\//, "").replace(/[^a-z0-9-]/g, "-")}.html`
await mkdir(path.join(dist, "prerender"), { recursive: true })
await writeFile(path.join(dist, "prerender", archivo), html)
await writeFile(path.join(dist, "prerender", "manifest.json"), JSON.stringify({ rutas: { [RUTA]: archivo }, csp: { style: [huella(estilo)], script: [huella(guion)] } }, null, 2))

const kb = (t) => (Buffer.byteLength(t) / 1024).toFixed(1)
console.log(`prerender ${RUTA}: dibujo ${kb(cuerpoPre)} kB · CSS crítico ${kb(estilo)} kB (${reglasEstilo.size} estilos pasados a clase) · HTML ${kb(html)} kB`)
