/**
 * Escena 3D del hero de la portada (Three.js).
 *
 * Miles de partículas se arman en el monograma AR de Ariad, el logo se
 * materializa nítido y queda rodeado por un HUD: anillos tipo dial, pistas de
 * circuito con pulsos que entran al logo, una red de nodos de fondo y una
 * grilla en perspectiva. Es la cara de AriadGSM como una sola empresa.
 *
 * Se importa con import() dinámico desde Hero.tsx: Three.js no entra en el JS
 * inicial de la portada. Si WebGL no está disponible, createHeroScene devuelve
 * null y el hero queda con el logo estático.
 */
import * as THREE from "three"

export type HeroSceneOptions = {
  canvas: HTMLCanvasElement
  /** La sección del hero: define el tamaño del lienzo. */
  host: HTMLElement
  /** Zona libre arriba del texto: el logo se centra y escala dentro de ella. */
  stage: HTMLElement
  /** Paneles de datos a los costados; se ubican al final de las pistas. */
  panels: { left: HTMLElement; right: HTMLElement }
  reduced: boolean
  /** Visita repetida en la sesión: armado rápido, sin la secuencia larga. */
  quick: boolean
  /** Las partículas terminaron de armar el logo (momento de mostrar el texto). */
  onFormed: () => void
  /** El logo quedó nítido y el HUD completo (momento de los paneles). */
  onSolid: () => void
}

export type HeroScene = {
  setActive: (active: boolean) => void
  destroy: () => void
}

// Trazos del isotipo AR (mismo dibujo que public/brand/favicon.svg).
const GLYPH_FILLS = [
  "M92 790L362 202H505L790 790H610L552 660H338L281 790Z",
  "M508 202H790C887 202 933 274 896 363L854 463C832 516 790 544 728 548L897 790H699L548 562H473L531 428H712C742 428 765 414 776 388L790 354C805 319 785 292 744 292H467Z",
]
const GLYPH_CUT = "M414 368L365 520H498L447 368Z"
const GLYPH_STROKES: [string, number][] = [
  ["M506 202L366 520", 34],
  ["M338 660H552", 38],
  ["M548 562L699 790", 32],
]

const S = 512 // lienzo de muestreo
const SPAN = 4.6 // 512 px del lienzo = SPAN unidades de mundo
const FOV = 45
const CAMZ = 8
const TRACE_LEN = 2.0

function drawGlyph(ctx: CanvasRenderingContext2D, k: number, fill: string | CanvasGradient) {
  ctx.setTransform(0.39 * k, 0, 0, 0.39 * k, 58 * k, 78 * k)
  ctx.fillStyle = fill
  for (const d of GLYPH_FILLS) ctx.fill(new Path2D(d))
  ctx.globalCompositeOperation = "destination-out"
  ctx.fill(new Path2D(GLYPH_CUT))
  ctx.lineCap = "round"
  for (const [d, w] of GLYPH_STROKES) {
    ctx.lineWidth = w
    ctx.stroke(new Path2D(d))
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalCompositeOperation = "source-over"
}

function canvas2d(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas")
  c.width = c.height = size
  const ctx = c.getContext("2d")
  if (!ctx) throw new Error("2d no disponible")
  return [c, ctx]
}

function srgbTexture(source: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(source)
  t.colorSpace = THREE.SRGBColorSpace
  t.minFilter = THREE.LinearFilter
  return t
}

function spriteTexture(): THREE.CanvasTexture {
  const [c, x] = canvas2d(64)
  const r = x.createRadialGradient(32, 32, 0, 32, 32, 32)
  r.addColorStop(0, "rgba(255,255,255,1)")
  r.addColorStop(0.22, "rgba(235,243,255,.95)")
  r.addColorStop(0.5, "rgba(122,169,255,.5)")
  r.addColorStop(1, "rgba(32,112,252,0)")
  x.fillStyle = r
  x.fillRect(0, 0, 64, 64)
  return srgbTexture(c)
}

/** Color sRGB (0..1) a lineal, para los vertex colors (Three trabaja en lineal). */
const lin = (v: number) => Math.pow(v, 2.2)
const ease = (x: number) => 1 - Math.pow(1 - x, 3)
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)

function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas")
    return !!(c.getContext("webgl2") || c.getContext("webgl"))
  } catch {
    return false
  }
}

export function createHeroScene(o: HeroSceneOptions): HeroScene | null {
  if (!hasWebGL()) return null

  // ---------- 1) glifo: muestreo de puntos + textura nítida ----------
  const [, g] = canvas2d(S)
  drawGlyph(g, 1, "#fff")
  const data = g.getImageData(0, 0, S, S).data

  const D = S * 2
  const [dA, da] = canvas2d(D)
  const grad = da.createLinearGradient(0, 157 * 2, 0, 386 * 2)
  grad.addColorStop(0, "#ffffff")
  grad.addColorStop(0.55, "#e4eeff")
  grad.addColorStop(1, "#9fc0ff")
  drawGlyph(da, 2, grad)
  const [dB, db] = canvas2d(D)
  db.shadowColor = "rgba(32,112,252,.95)"
  db.shadowBlur = 46
  db.drawImage(dA, 0, 0)
  db.shadowBlur = 14
  db.shadowColor = "rgba(150,190,255,.8)"
  db.drawImage(dA, 0, 0)
  db.shadowBlur = 0
  db.drawImage(dA, 0, 0)

  const toW = (px: number) => ((px - 256) / 256) * (SPAN / 2)
  const pts: [number, number][] = []
  const step = 3
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (let y = 0; y < S; y += step) {
    for (let x = 0; x < S; x += step) {
      if (data[(y * S + x) * 4 + 3] > 140) {
        const wx = toW(x + (Math.random() - 0.5) * step)
        const wy = -toW(y + (Math.random() - 0.5) * step)
        pts.push([wx, wy])
        if (wx < minX) minX = wx
        if (wx > maxX) maxX = wx
        if (wy < minY) minY = wy
        if (wy > maxY) maxY = wy
      }
    }
  }
  for (let k = pts.length - 1; k > 0; k--) {
    const j = (Math.random() * (k + 1)) | 0
    ;[pts[k], pts[j]] = [pts[j], pts[k]]
  }
  // En pantallas chicas, menos partículas: mismo efecto, menos trabajo.
  const maxPts = o.host.clientWidth < 640 ? 4200 : 7000
  if (pts.length > maxPts) pts.length = maxPts
  const G = { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, w: maxX - minX, h: maxY - minY }
  const R = Math.hypot(G.w, G.h) * 0.5 * 1.08

  // ---------- 2) escena ----------
  let renderer: THREE.WebGLRenderer
  try {
    renderer = new THREE.WebGLRenderer({ canvas: o.canvas, antialias: true, alpha: true })
  } catch {
    return null
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.setClearColor(0x000000, 0)
  const scene = new THREE.Scene()
  scene.fog = new THREE.FogExp2(0x04060d, 0.05)
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 120)
  camera.position.set(0, 0, CAMZ)

  const SPR = spriteTexture()
  const ADD = THREE.AdditiveBlending
  const disposables: { dispose: () => void }[] = [SPR]
  function keep<T extends { dispose: () => void }>(x: T): T {
    disposables.push(x)
    return x
  }

  // --- fondo: red de nodos con pulsos de datos ---
  const net = new THREE.Group()
  scene.add(net)
  const NN = 150
  const nBase = new Float32Array(NN * 3)
  const nPos = new Float32Array(NN * 3)
  const nPh = new Float32Array(NN)
  for (let n = 0; n < NN; n++) {
    nBase[n * 3] = (Math.random() - 0.5) * 40
    nBase[n * 3 + 1] = (Math.random() - 0.5) * 20
    nBase[n * 3 + 2] = -6 - Math.random() * 16
    nPh[n] = Math.random() * Math.PI * 2
  }
  const links: number[] = []
  for (let a = 0; a < NN; a++) {
    let c = 0
    for (let b = a + 1; b < NN && c < 3; b++) {
      const dx = nBase[a * 3] - nBase[b * 3]
      const dy = nBase[a * 3 + 1] - nBase[b * 3 + 1]
      const dz = nBase[a * 3 + 2] - nBase[b * 3 + 2]
      if (dx * dx + dy * dy + dz * dz < 22) {
        links.push(a, b)
        c++
      }
    }
  }
  const nGeo = keep(new THREE.BufferGeometry())
  nGeo.setAttribute("position", new THREE.BufferAttribute(nPos, 3))
  net.add(
    new THREE.Points(
      nGeo,
      keep(new THREE.PointsMaterial({ size: 0.16, map: SPR, color: 0x5f8fff, transparent: true, opacity: 0.8, depthWrite: false, blending: ADD }))
    )
  )
  const lPos = new Float32Array(links.length * 3)
  const lGeo = keep(new THREE.BufferGeometry())
  lGeo.setAttribute("position", new THREE.BufferAttribute(lPos, 3))
  net.add(
    new THREE.LineSegments(
      lGeo,
      keep(new THREE.LineBasicMaterial({ color: 0x2a5cc8, transparent: true, opacity: 0.35, depthWrite: false, blending: ADD }))
    )
  )
  const NP = links.length ? 26 : 0
  const pulses = Array.from({ length: NP }, () => ({
    l: (Math.random() * (links.length / 2)) | 0,
    u: Math.random(),
    v: 0.25 + Math.random() * 0.5,
  }))
  const pPos = new Float32Array(Math.max(1, NP) * 3)
  const pGeo = keep(new THREE.BufferGeometry())
  pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3))
  net.add(
    new THREE.Points(
      pGeo,
      keep(new THREE.PointsMaterial({ size: 0.26, map: SPR, color: 0xbcd4ff, transparent: true, opacity: 0.95, depthWrite: false, blending: ADD }))
    )
  )

  // --- piso: grilla en perspectiva que avanza ---
  const gridG = new THREE.Group()
  gridG.position.y = -3.6
  scene.add(gridG)
  const GS = 1.6
  const gv: number[] = []
  for (let gx = -36; gx <= 36; gx += GS) gv.push(gx, 0, -70, gx, 0, 10)
  for (let gz = -70; gz <= 10; gz += GS) gv.push(-36, 0, gz, 36, 0, gz)
  const gGeo = keep(new THREE.BufferGeometry())
  gGeo.setAttribute("position", new THREE.Float32BufferAttribute(gv, 3))
  gridG.add(
    new THREE.LineSegments(
      gGeo,
      keep(new THREE.LineBasicMaterial({ color: 0x2070fc, transparent: true, opacity: 0.28, depthWrite: false }))
    )
  )

  // --- logo: outer (layout) > tilt (parallax) > inner (centra el glifo) ---
  const outer = new THREE.Group()
  const tilt = new THREE.Group()
  const inner = new THREE.Group()
  inner.position.set(-G.cx, -G.cy, 0)
  scene.add(outer)
  outer.add(tilt)
  tilt.add(inner)

  const N = pts.length
  const pos = new Float32Array(N * 3)
  const home = new Float32Array(N * 3)
  const start = new Float32Array(N * 3)
  const base = new Float32Array(N * 3)
  const col = new Float32Array(N * 3)
  const phase = new Float32Array(N)
  const delay = new Float32Array(N)
  const BLUE = [0.125, 0.44, 0.99].map(lin)
  const LIGHT = [0.48, 0.66, 1].map(lin)
  const WHITE = [0.94, 0.97, 1].map(lin)
  const spread = o.quick ? 0.35 : 1
  for (let i = 0; i < N; i++) {
    const [hx, hy] = pts[i]
    const hz = (Math.random() - 0.5) * 0.22
    home[i * 3] = hx
    home[i * 3 + 1] = hy
    home[i * 3 + 2] = hz
    const r = (6 + Math.random() * 8) * spread
    const th = Math.random() * Math.PI * 2
    const ph = Math.acos(2 * Math.random() - 1)
    start[i * 3] = G.cx + Math.sin(ph) * Math.cos(th) * r
    start[i * 3 + 1] = G.cy + Math.sin(ph) * Math.sin(th) * r * 0.7
    start[i * 3 + 2] = Math.cos(ph) * r - 2 * spread
    const q = Math.random()
    const cc = q > 0.9 ? WHITE : q > 0.6 ? LIGHT : BLUE
    for (let m = 0; m < 3; m++) {
      base[i * 3 + m] = Math.min(1, cc[m] + (Math.random() - 0.5) * 0.04)
      col[i * 3 + m] = base[i * 3 + m]
    }
    phase[i] = Math.random() * Math.PI * 2
    // Llegan primero los del centro: el logo se dibuja de adentro hacia afuera.
    delay[i] = (Math.hypot(hx - G.cx, hy - G.cy) / (SPAN / 2)) * 0.45 + Math.random() * 0.3
    const src = o.reduced ? home : start
    pos[i * 3] = src[i * 3]
    pos[i * 3 + 1] = src[i * 3 + 1]
    pos[i * 3 + 2] = src[i * 3 + 2]
  }
  const geo = keep(new THREE.BufferGeometry())
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3))
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3))
  const pMat = keep(new THREE.PointsMaterial({ size: 0.055, map: SPR, vertexColors: true, transparent: true, depthWrite: false, blending: ADD, fog: false }))
  const logoPts = new THREE.Points(geo, pMat)
  logoPts.position.z = 0.05
  inner.add(logoPts)

  const logoGeo = keep(new THREE.PlaneGeometry(SPAN, SPAN))
  const logoTex = keep(srgbTexture(dB))
  const logoMat = keep(new THREE.MeshBasicMaterial({ map: logoTex, transparent: true, opacity: 0, depthWrite: false, fog: false }))
  inner.add(new THREE.Mesh(logoGeo, logoMat))

  const [hc, hx2] = canvas2d(256)
  const hg = hx2.createRadialGradient(128, 128, 0, 128, 128, 128)
  hg.addColorStop(0, "rgba(32,112,252,.5)")
  hg.addColorStop(0.5, "rgba(32,112,252,.14)")
  hg.addColorStop(1, "rgba(32,112,252,0)")
  hx2.fillStyle = hg
  hx2.fillRect(0, 0, 256, 256)
  const glowMat = keep(new THREE.MeshBasicMaterial({ map: keep(srgbTexture(hc)), transparent: true, opacity: 0, depthWrite: false, blending: ADD, fog: false }))
  const glow = new THREE.Mesh(keep(new THREE.PlaneGeometry(R * 3, R * 3)), glowMat)
  glow.position.set(G.cx, G.cy, -0.5)
  inner.add(glow)

  const scanMat = keep(new THREE.MeshBasicMaterial({ color: 0xa9c8ff, transparent: true, opacity: 0, depthWrite: false, blending: ADD, fog: false }))
  const scanLine = new THREE.Mesh(keep(new THREE.PlaneGeometry(G.w * 1.25, G.h * 0.012)), scanMat)
  scanLine.position.set(G.cx, G.cy, 0.1)
  inner.add(scanLine)

  // --- anillos HUD ---
  const hud = new THREE.Group()
  hud.position.set(G.cx, G.cy, 0)
  inner.add(hud)
  const tv: number[] = []
  for (let tk = 0; tk < 180; tk++) {
    const ang = (tk / 180) * Math.PI * 2
    const len = tk % 15 === 0 ? R * 0.085 : tk % 5 === 0 ? R * 0.045 : R * 0.022
    tv.push(Math.cos(ang) * R, Math.sin(ang) * R, 0, Math.cos(ang) * (R - len), Math.sin(ang) * (R - len), 0)
  }
  const tGeo = keep(new THREE.BufferGeometry())
  tGeo.setAttribute("position", new THREE.Float32BufferAttribute(tv, 3))
  const tickMat = keep(new THREE.LineBasicMaterial({ color: 0x7aa9ff, transparent: true, opacity: 0, depthWrite: false, blending: ADD, fog: false }))
  const ticks = new THREE.LineSegments(tGeo, tickMat)
  hud.add(ticks)
  const cv: number[] = []
  for (let k = 0; k <= 256; k++) {
    const a = (k / 256) * Math.PI * 2
    cv.push(Math.cos(a) * R * 1.14, Math.sin(a) * R * 1.14, 0)
  }
  const cGeo = keep(new THREE.BufferGeometry())
  cGeo.setAttribute("position", new THREE.Float32BufferAttribute(cv, 3))
  const circMat = keep(new THREE.LineBasicMaterial({ color: 0x2070fc, transparent: true, opacity: 0, depthWrite: false, blending: ADD, fog: false }))
  hud.add(new THREE.Line(cGeo, circMat))
  const arcs = new THREE.Group()
  hud.add(arcs)
  const arcMat = keep(new THREE.MeshBasicMaterial({ color: 0x7aa9ff, transparent: true, opacity: 0, depthWrite: false, blending: ADD, side: THREE.DoubleSide, fog: false }))
  for (const [s0, len] of [[0, 0.55], [2.2, 0.3], [3.9, 0.85]]) {
    arcs.add(new THREE.Mesh(keep(new THREE.RingGeometry(R * 1.105, R * 1.125, 64, 1, s0, len)), arcMat))
  }
  const arcs2 = new THREE.Group()
  hud.add(arcs2)
  const arc2Mat = keep(new THREE.MeshBasicMaterial({ color: 0x2070fc, transparent: true, opacity: 0, depthWrite: false, blending: ADD, side: THREE.DoubleSide, fog: false }))
  for (const [s0, len] of [[1, 0.9], [4.4, 0.5]]) {
    arcs2.add(new THREE.Mesh(keep(new THREE.RingGeometry(R * 1.2, R * 1.208, 64, 1, s0, len)), arc2Mat))
  }

  const shockMat = keep(new THREE.MeshBasicMaterial({ color: 0x9cc0ff, transparent: true, opacity: 0, depthWrite: false, blending: ADD, side: THREE.DoubleSide, fog: false }))
  const shock = new THREE.Mesh(keep(new THREE.RingGeometry(0.985, 1, 128)), shockMat)
  shock.position.set(G.cx, G.cy, 0)
  inner.add(shock)

  // --- pistas de circuito: la energía entra al logo desde los costados ---
  type Trace = { p: [number, number][]; segs: number[]; tot: number; off: number; v: number }
  const traceV: number[] = []
  const traceC: number[] = []
  const traces: Trace[] = []
  for (const sd of [-1, 1]) {
    for (let tr = 0; tr < 5; tr++) {
      const y0 = G.cy + (tr - 2) * R * 0.22
      const x0 = G.cx + sd * Math.sqrt(Math.max(0, (R * 1.21) ** 2 - (y0 - G.cy) ** 2))
      const a1 = 0.25 + Math.random() * 0.35
      const dg = (0.18 + Math.random() * 0.22) * (tr < 2 ? -1 : tr > 2 ? 1 : 0)
      const b1 = TRACE_LEN - a1 - Math.abs(dg)
      const p: [number, number][] = [
        [x0, y0],
        [x0 + sd * a1, y0],
        [x0 + sd * (a1 + Math.abs(dg)), y0 + dg],
        [x0 + sd * (a1 + Math.abs(dg) + b1), y0 + dg],
      ]
      const segs: number[] = []
      let tot = 0
      for (let s = 0; s < 3; s++) {
        const l = Math.hypot(p[s + 1][0] - p[s][0], p[s + 1][1] - p[s][1])
        segs.push(l)
        tot += l
        const f0 = 1 - ((tot - l) / TRACE_LEN) * 0.9
        const f1 = 1 - (tot / TRACE_LEN) * 0.9
        traceV.push(p[s][0], p[s][1], 0, p[s + 1][0], p[s + 1][1], 0)
        traceC.push(lin(0.2 * f0), lin(0.42 * f0), lin(0.95 * f0), lin(0.2 * f1), lin(0.42 * f1), lin(0.95 * f1))
      }
      traces.push({ p, segs, tot, off: Math.random(), v: 0.35 + Math.random() * 0.25 })
    }
  }
  const trGeo = keep(new THREE.BufferGeometry())
  trGeo.setAttribute("position", new THREE.Float32BufferAttribute(traceV, 3))
  trGeo.setAttribute("color", new THREE.Float32BufferAttribute(traceC, 3))
  const trMat = keep(new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, depthWrite: false, blending: ADD, fog: false }))
  inner.add(new THREE.LineSegments(trGeo, trMat))
  const tpPos = new Float32Array(traces.length * 3)
  const tpGeo = keep(new THREE.BufferGeometry())
  tpGeo.setAttribute("position", new THREE.BufferAttribute(tpPos, 3))
  const tpMat = keep(new THREE.PointsMaterial({ size: 0.13, map: SPR, color: 0xd6e4ff, transparent: true, opacity: 0, depthWrite: false, blending: ADD, fog: false }))
  inner.add(new THREE.Points(tpGeo, tpMat))
  function alongTrace(T: Trace, u: number): [number, number] {
    let d = (1 - u) * T.tot // u=0 extremo externo, u=1 borde del anillo
    for (let s = 0; s < 3; s++) {
      if (d <= T.segs[s] || s === 2) {
        const f = Math.min(1, d / T.segs[s])
        return [T.p[s][0] + (T.p[s + 1][0] - T.p[s][0]) * f, T.p[s][1] + (T.p[s + 1][1] - T.p[s][1]) * f]
      }
      d -= T.segs[s]
    }
    return T.p[0]
  }

  // ---------- 3) layout: el logo vive en el "stage", nunca bajo el texto ----------
  function layout() {
    const w = o.host.clientWidth
    const h = o.host.clientHeight
    if (!w || !h) return
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    const visH = 2 * CAMZ * Math.tan((FOV * Math.PI) / 360)
    const upp = visH / h
    const hostRect = o.host.getBoundingClientRect()
    const st = o.stage.getBoundingClientRect()
    const stTop = st.top - hostRect.top
    const avail = Math.max(170, st.height)
    const ringPx = Math.max(170, Math.min(avail * 0.94, w * 0.88, 620))
    const sc = (ringPx * upp) / (2 * R * 1.21)
    const centerPx = stTop + avail / 2
    outer.scale.setScalar(sc)
    outer.position.set(0, (h / 2 - centerPx) * upp, 0)
    // Paneles: al final de las pistas, solo si entran con margen.
    const kpx = sc / upp
    const reach = (R * 1.21 + TRACE_LEN) * kpx
    const pw = o.panels.left.offsetWidth || 190
    const cx = w / 2
    const left = cx - reach - pw - 14
    const fits = w >= 900 && left >= 16
    for (const el of [o.panels.left, o.panels.right]) {
      el.style.display = fits ? "block" : "none"
      el.style.top = `${centerPx}px`
    }
    if (fits) {
      o.panels.left.style.left = `${left}px`
      o.panels.right.style.left = `${cx + reach + 14}px`
    }
  }
  const ro = new ResizeObserver(layout)
  ro.observe(o.host)
  ro.observe(o.stage)
  layout()

  const ptr = { x: 0, y: 0, tx: 0, ty: 0 }
  function onPointer(e: PointerEvent) {
    const r = o.host.getBoundingClientRect()
    ptr.tx = (e.clientX - r.left) / r.width - 0.5
    ptr.ty = (e.clientY - r.top) / r.height - 0.5
  }
  o.host.addEventListener("pointermove", onPointer, { passive: true })

  // ---------- 4) línea de tiempo ----------
  const DUR = o.quick ? 1.0 : 2.2
  const T_FORM = DUR + (o.quick ? 0.35 : 0.75)
  const T_SOLID = T_FORM + 0.1
  let formed = false
  let solid = false
  let waveDone = o.reduced
  let t = o.reduced ? 99 : 0
  let clock = 0 // tiempo de animación del fondo (red y grilla)
  let last = 0
  let raf = 0
  let active = false

  function frame(ts: number) {
    raf = requestAnimationFrame(frame)
    const dt = last ? Math.min(0.05, (ts - last) / 1000) : 0
    last = ts
    if (!o.reduced) {
      t += dt
      clock += dt
    }
    draw(dt)
  }

  function draw(dt: number) {
    const T = t
    // red de fondo
    for (let n = 0; n < NN; n++) {
      const ph = nPh[n] + clock * 0.4
      nPos[n * 3] = nBase[n * 3] + Math.sin(ph) * 0.35
      nPos[n * 3 + 1] = nBase[n * 3 + 1] + Math.cos(ph * 1.3) * 0.3
      nPos[n * 3 + 2] = nBase[n * 3 + 2]
    }
    for (let li = 0; li < links.length; li++) {
      const id = links[li] * 3
      lPos[li * 3] = nPos[id]
      lPos[li * 3 + 1] = nPos[id + 1]
      lPos[li * 3 + 2] = nPos[id + 2]
    }
    for (let q = 0; q < NP; q++) {
      const P = pulses[q]
      P.u += dt * P.v
      if (P.u > 1) {
        P.u = 0
        P.l = (Math.random() * (links.length / 2)) | 0
      }
      const A = links[P.l * 2] * 3
      const B = links[P.l * 2 + 1] * 3
      for (let m = 0; m < 3; m++) pPos[q * 3 + m] = nPos[A + m] + (nPos[B + m] - nPos[A + m]) * P.u
    }
    nGeo.attributes.position.needsUpdate = true
    lGeo.attributes.position.needsUpdate = true
    pGeo.attributes.position.needsUpdate = true
    gridG.position.z = (clock * 0.9) % GS

    // partículas del logo
    if (!o.reduced && T < T_FORM + 1) {
      for (let i = 0; i < N; i++) {
        const ix = i * 3
        const p = ease(clamp01((T - delay[i]) / DUR))
        const sw = (1 - p) * 1.4 * spread
        const a = phase[i] + p * 2.2
        pos[ix] = start[ix] + (home[ix] - start[ix]) * p + Math.cos(a) * sw * (1 - p)
        pos[ix + 1] = start[ix + 1] + (home[ix + 1] - start[ix + 1]) * p + Math.sin(a) * sw * (1 - p)
        pos[ix + 2] = start[ix + 2] + (home[ix + 2] - start[ix + 2]) * p
      }
      geo.attributes.position.needsUpdate = true
    } else if (!o.reduced) {
      // ya armado: respiración sutil
      for (let i = 0; i < N; i++) {
        const ix = i * 3
        const b = phase[i] + T * 1.5
        pos[ix] = home[ix] + Math.cos(b) * 0.008
        pos[ix + 1] = home[ix + 1] + Math.sin(b * 1.13) * 0.008
        pos[ix + 2] = home[ix + 2] + Math.sin(b * 0.7) * 0.035
      }
      geo.attributes.position.needsUpdate = true
    }

    const sv = ease(clamp01((T - T_SOLID) / 0.9))
    logoMat.opacity = 0.96 * sv
    glowMat.opacity = sv
    pMat.opacity = 1 - 0.62 * sv

    // HUD: los arcos giran rápido como "cargando" y frenan al completarse
    const load = clamp01((T - 0.2) / 0.6)
    arcMat.opacity = 0.85 * load
    arc2Mat.opacity = 0.55 * load
    const spin = T < T_FORM ? 2.6 : 0.22 + 2.4 * Math.exp(-(T - T_FORM) * 2)
    arcs.rotation.z += dt * spin
    arcs2.rotation.z -= dt * spin * 0.6
    const hv = ease(clamp01((T - T_SOLID) / 1.1))
    tickMat.opacity = 0.55 * hv
    circMat.opacity = 0.45 * hv
    ticks.rotation.z -= dt * 0.05
    hud.scale.setScalar(0.82 + 0.18 * ease(clamp01((T - 0.2) / T_SOLID)))

    // pistas y pulsos
    const tv2 = ease(clamp01((T - T_SOLID - 0.2) / 1))
    trMat.opacity = tv2
    tpMat.opacity = tv2
    for (let k = 0; k < traces.length; k++) {
      const TR = traces[k]
      const u = (T * TR.v + TR.off) % 1.25
      const pp = u <= 1 ? alongTrace(TR, u) : [1e3, 1e3]
      tpPos[k * 3] = pp[0]
      tpPos[k * 3 + 1] = pp[1]
      tpPos[k * 3 + 2] = 0.02
    }
    tpGeo.attributes.position.needsUpdate = true

    // onda expansiva (una vez)
    if (!waveDone) {
      const wv = (T - T_FORM) / 1.3
      if (wv >= 0 && wv <= 1) {
        const rs = R * (0.6 + wv * 2.2)
        shock.scale.set(rs, rs, 1)
        shockMat.opacity = 0.9 * (1 - wv) * (1 - wv)
      } else if (wv > 1) {
        shockMat.opacity = 0
        waveDone = true
      }
    }

    // barrido de luz por las partículas + línea de escaneo
    if (!o.reduced && T > T_SOLID + 0.6) {
      const cyc = ((T - T_SOLID - 0.6) % 5.2) / 1.5
      const sx = G.cx - G.w * 0.8 + cyc * G.w * 1.6
      for (let j = 0; j < N; j++) {
        const jx = j * 3
        const dd = home[jx] - sx + (home[jx + 1] - G.cy) * 0.35
        const gl = cyc <= 1 ? Math.exp((-dd * dd) / 0.05) : 0
        col[jx] = base[jx] + (1 - base[jx]) * gl
        col[jx + 1] = base[jx + 1] + (1 - base[jx + 1]) * gl
        col[jx + 2] = base[jx + 2] + (1 - base[jx + 2]) * gl
      }
      geo.attributes.color.needsUpdate = true
      const sc2 = ((T - T_SOLID - 0.6 + 2.6) % 5.2) / 1.6
      if (sc2 <= 1) {
        scanLine.position.y = G.cy + G.h * 0.62 - sc2 * G.h * 1.24
        scanMat.opacity = 0.75 * Math.sin(Math.PI * sc2)
      } else scanMat.opacity = 0
    }

    if (!formed && T > T_FORM) {
      formed = true
      o.onFormed()
    }
    if (!solid && T > T_SOLID + 0.5) {
      solid = true
      o.onSolid()
    }

    ptr.x += (ptr.tx - ptr.x) * 0.05
    ptr.y += (ptr.ty - ptr.y) * 0.05
    tilt.rotation.y = ptr.x * 0.3 + Math.sin(T * 0.3) * 0.05
    tilt.rotation.x = ptr.y * 0.2
    net.rotation.y = ptr.x * 0.08
    net.rotation.x = ptr.y * 0.05
    renderer.render(scene, camera)
  }

  function setActive(next: boolean) {
    if (o.reduced) {
      // Sin animación: un cuadro final y listo (se redibuja al cambiar tamaño).
      draw(0)
      return
    }
    if (next === active) return
    active = next
    if (active) {
      last = 0
      raf = requestAnimationFrame(frame)
    } else cancelAnimationFrame(raf)
  }

  if (o.reduced) {
    const redraw = () => draw(0)
    ro.disconnect()
    const ro2 = new ResizeObserver(() => {
      layout()
      redraw()
    })
    ro2.observe(o.host)
    ro2.observe(o.stage)
    disposables.push({ dispose: () => ro2.disconnect() })
  }

  return {
    setActive,
    destroy() {
      cancelAnimationFrame(raf)
      ro.disconnect()
      o.host.removeEventListener("pointermove", onPointer)
      for (const d of disposables) d.dispose()
      renderer.dispose()
    },
  }
}
