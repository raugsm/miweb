/**
 * Escena animada del panel de Ingresar (Three.js) — Figma W11-E 1172:301.
 *
 * Suma movimiento al dibujo SVG, que ya es el estado final: las partículas arman el isotipo AR, se
 * dibuja el anillo y los rayos salen uno por uno hacia los logos (2 s como mucho). Las partículas son
 * solo para la entrada: al terminar, el isotipo queda liso, con su degradado y su brillo. Después queda casi
 * quieta: el anillo de puntos gira muy lento y cada 4–6 s una luz viaja de un logo al emblema.
 * Los logos y la red de fondo NO están acá: son imágenes y SVG de la página, quietos.
 *
 * Se importa con import() dinámico desde EscenaIngresar.tsx: Three no entra en el JS inicial. Reusa el
 * muestreo del isotipo y las texturas de la escena de la portada (hero-scene.ts).
 */
import * as THREE from "three"

import { ANCHO_GLIFO, ANILLO, ANILLO_PUNTOS, ARCOS, LIENZO, LOGO, LOGOS, RAYO_DESDE } from "@/components/hero/emblema"
import { CAMZ, canvas2d, clamp01, drawGlyph, ease, FOV, hasWebGL, lin, S, SPAN, spriteTexture, srgbTexture } from "@/components/hero/hero-scene"

export type IngresarSceneOptions = {
  canvas: HTMLCanvasElement
  /** El lienzo de 860 × 900 del panel: define el tamaño y las coordenadas. */
  host: HTMLElement
  /** true = arranca armada, sin entrada (visita repetida en la sesión, o la escena llegó tarde). */
  directo: boolean
  maxFps: number
  maxPixelRatio: number
  /** Entrada: al logo `i` (orden de LOGOS) le toca aparecer. */
  onLogo: (i: number) => void
  /** La entrada terminó. */
  onLista: () => void
  /** El equipo no llega a 24 cuadros por segundo en el arranque: quien la monta la retira. */
  onLenta: () => void
}

export type IngresarScene = {
  setActive: (active: boolean) => void
  /** Enciende o pausa la luz que viaja por los rayos (se pausa mientras el cliente escribe). */
  setPulsos: (on: boolean) => void
  /** El cliente entró bien: los seis logos mandan un pulso al emblema (0.4 s). */
  pulsoExito: () => void
  destroy: () => void
}

// Entrada: todo termina antes de los 2 s.
const DUR = 0.9 // vuelo de cada partícula
const T_SOLIDO = 1.15 // el isotipo queda nítido
const T_LOGO0 = 0.8 // sale el primer rayo
const PASO_LOGO = 0.14
const T_LISTA = 1.95
const RAD = Math.PI / 180

export function createIngresarScene(o: IngresarSceneOptions): IngresarScene | null {
  if (!hasWebGL()) return null

  // ---------- 1) isotipo: puntos para las partículas + textura nítida ----------
  const [, g] = canvas2d(S)
  drawGlyph(g, 1, "#fff")
  const data = g.getImageData(0, 0, S, S).data
  const [dA, da] = canvas2d(S * 2)
  const grad = da.createLinearGradient(0, 157 * 2, 0, 386 * 2)
  grad.addColorStop(0, "#ffffff")
  grad.addColorStop(1, "#7ea6ff") // el degradado del emblema del Figma
  drawGlyph(da, 2, grad)
  const [dB, db] = canvas2d(S * 2)
  db.shadowColor = "rgba(32,112,252,.9)"
  db.shadowBlur = 40
  db.drawImage(dA, 0, 0)
  db.shadowBlur = 0
  db.drawImage(dA, 0, 0)

  const toW = (px: number) => ((px - 256) / 256) * (SPAN / 2)
  const pts: [number, number][] = []
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (let y = 0; y < S; y += 3) {
    for (let x = 0; x < S; x += 3) {
      if (data[(y * S + x) * 4 + 3] > 140) {
        const wx = toW(x + (Math.random() - 0.5) * 3)
        const wy = -toW(y + (Math.random() - 0.5) * 3)
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
  if (pts.length > 4500) pts.length = 4500
  const G = { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, w: maxX - minX, h: maxY - minY }

  // ---------- 2) escena ----------
  let renderer: THREE.WebGLRenderer
  try {
    renderer = new THREE.WebGLRenderer({ canvas: o.canvas, antialias: true, alpha: true })
  } catch {
    return null
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, o.maxPixelRatio))
  renderer.setClearColor(0x000000, 0)
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 120)
  camera.position.set(0, 0, CAMZ)

  const SPR = spriteTexture()
  const ADD = THREE.AdditiveBlending
  const disposables: { dispose: () => void }[] = [SPR]
  function keep<T extends { dispose: () => void }>(x: T): T {
    disposables.push(x)
    return x
  }

  // Todo cuelga de `lienzo`, que trabaja en píxeles del Figma con el origen en el centro del emblema
  // (x a la derecha, y hacia arriba). `iso` lleva el isotipo a su ancho en píxeles.
  const lienzo = new THREE.Group()
  const iso = new THREE.Group()
  const inner = new THREE.Group()
  iso.scale.setScalar(ANCHO_GLIFO / G.w)
  inner.position.set(-G.cx, -G.cy, 0)
  scene.add(lienzo)
  lienzo.add(iso)
  iso.add(inner)

  // --- partículas del isotipo ---
  const N = pts.length
  const pos = new Float32Array(N * 3)
  const home = new Float32Array(N * 3)
  const start = new Float32Array(N * 3)
  const col = new Float32Array(N * 3)
  const phase = new Float32Array(N)
  const delay = new Float32Array(N)
  const BLUE = [0.125, 0.44, 0.99].map(lin)
  const LIGHT = [0.48, 0.66, 1].map(lin)
  const WHITE = [0.94, 0.97, 1].map(lin)
  for (let i = 0; i < N; i++) {
    const [hx, hy] = pts[i]
    home[i * 3] = hx
    home[i * 3 + 1] = hy
    home[i * 3 + 2] = (Math.random() - 0.5) * 0.22
    const r = 5 + Math.random() * 6
    const th = Math.random() * Math.PI * 2
    const ph = Math.acos(2 * Math.random() - 1)
    start[i * 3] = G.cx + Math.sin(ph) * Math.cos(th) * r
    start[i * 3 + 1] = G.cy + Math.sin(ph) * Math.sin(th) * r * 0.7
    start[i * 3 + 2] = Math.cos(ph) * r - 2
    const q = Math.random()
    const cc = q > 0.9 ? WHITE : q > 0.6 ? LIGHT : BLUE
    for (let m = 0; m < 3; m++) col[i * 3 + m] = Math.min(1, cc[m] + (Math.random() - 0.5) * 0.04)
    phase[i] = Math.random() * Math.PI * 2
    // Llegan primero los del centro: el isotipo se arma de adentro hacia afuera.
    delay[i] = (Math.hypot(hx - G.cx, hy - G.cy) / (SPAN / 2)) * 0.18 + Math.random() * 0.12
    const src = o.directo ? home : start
    for (let m = 0; m < 3; m++) pos[i * 3 + m] = src[i * 3 + m]
  }
  const geo = keep(new THREE.BufferGeometry())
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3))
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3))
  const pMat = keep(new THREE.PointsMaterial({ size: 0.05, map: SPR, vertexColors: true, transparent: true, depthWrite: false, blending: ADD }))
  const logoPts = new THREE.Points(geo, pMat)
  logoPts.position.z = 0.05
  inner.add(logoPts)

  const logoMat = keep(new THREE.MeshBasicMaterial({ map: keep(srgbTexture(dB)), transparent: true, opacity: 0, depthWrite: false }))
  inner.add(new THREE.Mesh(keep(new THREE.PlaneGeometry(SPAN, SPAN)), logoMat))

  const [hc, hx2] = canvas2d(256)
  const hg = hx2.createRadialGradient(128, 128, 0, 128, 128, 128)
  hg.addColorStop(0, "rgba(32,112,252,.42)")
  hg.addColorStop(0.5, "rgba(32,112,252,.12)")
  hg.addColorStop(1, "rgba(32,112,252,0)")
  hx2.fillStyle = hg
  hx2.fillRect(0, 0, 256, 256)
  const glowMat = keep(new THREE.MeshBasicMaterial({ map: keep(srgbTexture(hc)), transparent: true, opacity: 0, depthWrite: false, blending: ADD }))
  const glow = new THREE.Mesh(keep(new THREE.PlaneGeometry(ANILLO * 2.6, ANILLO * 2.6)), glowMat)
  glow.position.z = -0.5
  lienzo.add(glow)

  // --- anillo: línea fina + tres tramos brillantes que se dibujan ---
  const ringV: number[] = []
  for (let k = 0; k <= 180; k++) ringV.push(Math.cos((k / 180) * Math.PI * 2) * ANILLO, Math.sin((k / 180) * Math.PI * 2) * ANILLO, 0)
  const ringGeo = keep(new THREE.BufferGeometry())
  ringGeo.setAttribute("position", new THREE.Float32BufferAttribute(ringV, 3))
  const ringMat = keep(new THREE.LineBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0, depthWrite: false }))
  lienzo.add(new THREE.Line(ringGeo, ringMat))
  const ARC_SEG = 48
  const arcMat = keep(new THREE.MeshBasicMaterial({ color: 0x60a5fa, transparent: true, depthWrite: false, side: THREE.DoubleSide }))
  const arcos = ARCOS.map(([desde, largo]) => {
    const geoA = keep(new THREE.RingGeometry(ANILLO - 1.5, ANILLO + 1.5, ARC_SEG, 1, desde * RAD, largo * RAD))
    lienzo.add(new THREE.Mesh(geoA, arcMat))
    return geoA
  })

  // --- anillo de puntos: gira muy lento ---
  const dashes = Math.round((2 * Math.PI * ANILLO_PUNTOS) / 7)
  const dashV: number[] = []
  for (let k = 0; k < dashes; k++) {
    const a0 = (k / dashes) * Math.PI * 2
    const a1 = a0 + 3 / ANILLO_PUNTOS
    dashV.push(Math.cos(a0) * ANILLO_PUNTOS, Math.sin(a0) * ANILLO_PUNTOS, 0, Math.cos(a1) * ANILLO_PUNTOS, Math.sin(a1) * ANILLO_PUNTOS, 0)
  }
  const dashGeo = keep(new THREE.BufferGeometry())
  dashGeo.setAttribute("position", new THREE.Float32BufferAttribute(dashV, 3))
  const dashMat = keep(new THREE.LineBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0, depthWrite: false }))
  const puntos = new THREE.LineSegments(dashGeo, dashMat)
  lienzo.add(puntos)

  // --- rayos hacia los logos, con su punto en el anillo ---
  const dir = LOGOS.map(({ angulo }) => [Math.cos(angulo * RAD), Math.sin(angulo * RAD)])
  const rayPos = new Float32Array(LOGOS.length * 6)
  const rayGeo = keep(new THREE.BufferGeometry())
  rayGeo.setAttribute("position", new THREE.BufferAttribute(rayPos, 3))
  lienzo.add(new THREE.LineSegments(rayGeo, keep(new THREE.LineBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.6, depthWrite: false }))))
  const dotGeo = keep(new THREE.CircleGeometry(2.5, 16))
  const dotMat = keep(new THREE.MeshBasicMaterial({ color: 0x93c5fd, transparent: true, depthWrite: false }))
  const dots = dir.map(([dx, dy]) => {
    const m = new THREE.Mesh(dotGeo, dotMat)
    m.position.set(dx * RAYO_DESDE, dy * RAYO_DESDE, 0.01)
    lienzo.add(m)
    return m
  })
  // la luz que viaja por un rayo, del logo al emblema
  const luzPos = new Float32Array(LOGOS.length * 3)
  const luzGeo = keep(new THREE.BufferGeometry())
  luzGeo.setAttribute("position", new THREE.BufferAttribute(luzPos, 3))
  const luzMat = keep(new THREE.PointsMaterial({ size: 0.1, map: SPR, color: 0xd6e4ff, transparent: true, depthWrite: false, blending: ADD }))
  lienzo.add(new THREE.Points(luzGeo, luzMat))
  const LUZ_DESDE = ANILLO_PUNTOS - LOGO / 2 // sale del borde del logo

  // ---------- 3) tamaño: el lienzo se dibuja 1 a 1 con los píxeles del Figma ----------
  function layout() {
    const w = o.host.clientWidth
    const h = o.host.clientHeight
    if (!w || !h) return
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    const upp = (2 * CAMZ * Math.tan((FOV * Math.PI) / 360)) / h // unidades de mundo por píxel
    lienzo.scale.setScalar(upp)
    lienzo.position.set((LIENZO.cx - w / 2) * upp, (h / 2 - LIENZO.cy) * upp, 0)
    pMat.size = 5 * upp
    luzMat.size = 18 * upp
  }
  const ro = new ResizeObserver(layout)
  ro.observe(o.host)
  layout()

  const ptr = { x: 0, y: 0, tx: 0, ty: 0 }
  function onPointer(e: PointerEvent) {
    ptr.tx = e.clientX / window.innerWidth - 0.5
    ptr.ty = e.clientY / window.innerHeight - 0.5
  }
  window.addEventListener("pointermove", onPointer, { passive: true })

  // ---------- 4) línea de tiempo ----------
  let t = o.directo ? 10 : 0
  let last = 0
  let raf = 0
  let active = false
  let lista = o.directo
  const avisado = LOGOS.map(() => o.directo)
  const luz = { k: -1, u: 0, espera: 2 } // una sola luz por vez
  let pulsosOn = true
  let exito = -1 // avance 0..1 del pulso de "entraste bien"; -1 = no hay
  const minGap = 1000 / o.maxFps - 3
  let vigia: { t0: number; n: number } | null = null
  let vigiaHecha = false

  function frame(ts: number) {
    raf = requestAnimationFrame(frame)
    if (last && ts - last < minGap) return
    const dt = last ? Math.min(0.05, (ts - last) / 1000) : 0
    last = ts
    t += dt
    draw(dt)
    // Vigía de los primeros 2 s: si el equipo no da, se avisa y la página vuelve al SVG.
    if (!vigiaHecha) {
      if (!vigia) vigia = { t0: ts, n: 0 }
      else if (ts - vigia.t0 < 2000) vigia.n++
      else {
        vigiaHecha = true
        if (vigia.n / ((ts - vigia.t0) / 1000) < 24) o.onLenta()
      }
    }
  }

  function draw(dt: number) {
    const T = t
    // partículas: vuelan a su lugar y, cuando el isotipo ya está nítido, desaparecen (queda liso)
    const sv = ease(clamp01((T - T_SOLIDO) / 0.5))
    logoPts.visible = sv < 1
    if (logoPts.visible) {
      for (let i = 0; i < N; i++) {
        const ix = i * 3
        const p = ease(clamp01((T - delay[i]) / DUR))
        const sw = (1 - p) * 1.2
        const a = phase[i] + p * 2.2
        pos[ix] = start[ix] + (home[ix] - start[ix]) * p + Math.cos(a) * sw * (1 - p)
        pos[ix + 1] = start[ix + 1] + (home[ix + 1] - start[ix + 1]) * p + Math.sin(a) * sw * (1 - p)
        pos[ix + 2] = start[ix + 2] + (home[ix + 2] - start[ix + 2]) * p
      }
      geo.attributes.position.needsUpdate = true
    }

    const ex = exito >= 0 ? Math.sin(Math.PI * Math.min(1, exito)) : 0
    logoMat.opacity = sv
    pMat.opacity = 1 - sv
    glowMat.opacity = Math.min(1, 0.8 * sv + 0.2 * ex)
    glow.scale.setScalar(1 + 0.25 * ex)

    // el anillo se dibuja
    ringMat.opacity = 0.4 * ease(clamp01((T - 0.4) / 0.6))
    const trazo = ease(clamp01((T - 0.5) / 0.9))
    for (const a of arcos) a.setDrawRange(0, Math.round(ARC_SEG * trazo) * 6)
    dashMat.opacity = 0.4 * ease(clamp01((T - 1.2) / 0.6))
    puntos.rotation.z += dt * 0.02

    // los rayos salen uno por uno; cuando llegan, aparece su logo
    for (let k = 0; k < LOGOS.length; k++) {
      const t0 = T_LOGO0 + k * PASO_LOGO
      const largo = clamp01((T - t0) / 0.22)
      const r1 = RAYO_DESDE + (ANILLO_PUNTOS - RAYO_DESDE) * largo
      rayPos[k * 6] = dir[k][0] * RAYO_DESDE
      rayPos[k * 6 + 1] = dir[k][1] * RAYO_DESDE
      rayPos[k * 6 + 3] = dir[k][0] * r1
      rayPos[k * 6 + 4] = dir[k][1] * r1
      dots[k].scale.setScalar(ease(clamp01((T - t0) / 0.15)))
      if (!avisado[k] && T >= t0 + 0.12) {
        avisado[k] = true
        o.onLogo(k)
      }
    }
    rayGeo.attributes.position.needsUpdate = true
    if (!lista && T >= T_LISTA) {
      lista = true
      o.onLista()
    }

    // la luz: en reposo, una cada 4–6 s por un rayo; al entrar bien, las seis juntas
    if (exito >= 0) {
      exito += dt / 0.4
      if (exito >= 1.2) exito = -1
    } else if (luz.k >= 0) {
      luz.u += dt / 0.9
      if (luz.u > 1) {
        luz.k = -1
        luz.espera = 4 + Math.random() * 2
      }
    } else if (pulsosOn && lista) {
      luz.espera -= dt
      if (luz.espera <= 0) {
        luz.k = (Math.random() * LOGOS.length) | 0
        luz.u = 0
      }
    }
    for (let k = 0; k < LOGOS.length; k++) {
      const u = exito >= 0 ? exito : k === luz.k ? luz.u : 2
      const r = u <= 1 ? LUZ_DESDE + (RAYO_DESDE - LUZ_DESDE) * u : 1e5
      luzPos[k * 3] = dir[k][0] * r
      luzPos[k * 3 + 1] = dir[k][1] * r
      luzPos[k * 3 + 2] = 0.02
    }
    luzGeo.attributes.position.needsUpdate = true

    // el isotipo sigue al mouse apenas: 6 px como mucho para cada lado
    ptr.x += (ptr.tx - ptr.x) * 0.05
    ptr.y += (ptr.ty - ptr.y) * 0.05
    iso.position.set(ptr.x * 12, -ptr.y * 12, 0)
    renderer.render(scene, camera)
  }

  return {
    setActive(next: boolean) {
      if (next === active) return
      active = next
      if (active) {
        last = 0
        raf = requestAnimationFrame(frame)
      } else {
        cancelAnimationFrame(raf)
        // La medición vuelve a empezar: una pestaña oculta no cuenta como equipo lento.
        vigia = null
      }
    },
    setPulsos(on: boolean) {
      pulsosOn = on
    },
    pulsoExito() {
      exito = 0
      luz.k = -1
    },
    destroy() {
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener("pointermove", onPointer)
      for (const d of disposables) d.dispose()
      renderer.dispose()
    },
  }
}
