/**
 * Panel del emblema de Ingresar (Figma W11-E 1172:301).
 *
 * Lo que se ve sin Three ya es la pantalla terminada: red de fondo, emblema, anillos y rayos en SVG, y
 * los seis logos como imágenes livianas. Si el equipo y la conexión dan, después se baja la escena
 * (aparte y solo cuando el navegador está libre) y le suma movimiento.
 *
 * La escena NO se carga con: ahorro de datos, conexión 2g o 3g, "reducir movimiento", sin WebGL,
 * pantallas de menos de 1024 px o equipo lento (menos de 24 cuadros por segundo en el arranque).
 * Se pausa con la pestaña oculta y a los 60 s sin actividad.
 *
 * Vive dentro del lienzo de PanelEmblema, donde 1em = 1 píxel del Figma (se achica con el panel).
 */
import { useEffect, useImperativeHandle, useRef, useState } from "react"

import { EmblemaSvg, RedFondo } from "@/components/aritool/EmblemaSvg"
import { ANILLO_PUNTOS, LOGO, LOGOS, punto } from "@/components/hero/emblema"
import type { IngresarScene } from "@/components/hero/ingresar-scene"
import { emblemaPrevioQuieto } from "@/lib/previo"

export type EscenaRef = {
  /** El cliente entró bien: pulso corto hacia el emblema. Se resuelve cuando termina (0.4 s), o enseguida si no hay escena. */
  pulso: () => Promise<void>
  /** El cliente está escribiendo: la luz de los rayos se pausa un rato. */
  escribiendo: () => void
}

/**
 * - "espera":  primera visita de la sesión y la escena puede venir: el emblema todavía no se muestra,
 *              para que la entrada no arranque borrando algo ya dibujado. Dura 1.2 s como mucho.
 * - "quieto":  el dibujo SVG completo. Es el estado final válido.
 * - "entrada": la escena arma el emblema; los logos aparecen uno por uno.
 * - "viva":    la escena en reposo.
 */
type Modo = "espera" | "quieto" | "entrada" | "viva"

const ENTRADA_VISTA = "aritool-ingresar-entrada"
const ESPERA_MS = 1200
const QUIETO_MS = 60_000
const PAUSA_AL_ESCRIBIR_MS = 3000

function entradaYaVista(): boolean {
  try {
    return sessionStorage.getItem(ENTRADA_VISTA) === "1"
  } catch {
    return false
  }
}

/** ¿Vale la pena bajar la escena en este equipo y con esta conexión? */
function convieneEscena(): boolean {
  if (typeof window === "undefined") return false // HTML inicial: va el dibujo quieto
  const red = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false
  if (red?.saveData || ["slow-2g", "2g", "3g"].includes(red?.effectiveType ?? "")) return false
  return window.innerWidth >= 1024
}

const SUAVE = "opacity .35s"

export function EscenaIngresar({ ref }: { ref?: React.Ref<EscenaRef> }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const escena = useRef<IngresarScene | null>(null)
  const reanudar = useRef(0)
  // Si el servidor ya mandó el emblema dibujado (lib/previo), no se lo borra para hacer la entrada.
  const [modo, setModo] = useState<Modo>(() => (convieneEscena() && !entradaYaVista() && !emblemaPrevioQuieto() ? "espera" : "quieto"))
  const modoRef = useRef(modo)
  const [logos, setLogos] = useState<boolean[]>(() => LOGOS.map(() => false)) // los que ya aparecieron en la entrada
  const pasar = (m: Modo) => {
    modoRef.current = m
    setModo(m)
  }

  useImperativeHandle(ref, () => ({
    pulso: () => {
      if (!escena.current) return Promise.resolve()
      escena.current.pulsoExito()
      return new Promise((listo) => window.setTimeout(listo, 400))
    },
    escribiendo: () => {
      const e = escena.current
      if (!e) return
      e.setPulsos(false)
      window.clearTimeout(reanudar.current)
      reanudar.current = window.setTimeout(() => escena.current?.setPulsos(true), PAUSA_AL_ESCRIBIR_MS)
    },
  }), [])

  useEffect(() => {
    if (!convieneEscena()) return
    let cancelado = false
    let ultima = Date.now() // última vez que el cliente movió algo
    let reloj = 0

    const retirar = () => {
      escena.current?.destroy()
      escena.current = null
      pasar("quieto")
    }
    const activar = () => escena.current?.setActive(!document.hidden && Date.now() - ultima < QUIETO_MS)
    const actividad = () => {
      ultima = Date.now()
      activar()
    }
    // Si la escena no llegó a tiempo, se muestra el dibujo y listo: cuando llegue, entra ya armada.
    const tope = window.setTimeout(() => { if (modoRef.current === "espera") pasar("quieto") }, ESPERA_MS)

    const montar = () => {
      import("@/components/hero/ingresar-scene").then(({ createIngresarScene }) => {
        const canvas = canvasRef.current, host = hostRef.current
        if (cancelado || !canvas || !host) return
        const conEntrada = modoRef.current === "espera"
        try {
          escena.current = createIngresarScene({
            canvas, host,
            directo: !conEntrada,
            maxFps: 30,
            maxPixelRatio: 1.5,
            onLogo: (i) => setLogos((v) => v.map((x, k) => x || k === i)),
            onLista: () => {
              pasar("viva")
              try {
                sessionStorage.setItem(ENTRADA_VISTA, "1")
              } catch {
                /* sin almacenamiento: la próxima visita repite la entrada */
              }
            },
            onLenta: retirar,
          })
        } catch {
          escena.current = null
        }
        if (!escena.current) return pasar("quieto") // sin WebGL: queda el dibujo
        pasar(conEntrada ? "entrada" : "viva")
        activar()
        document.addEventListener("visibilitychange", activar)
        for (const ev of ["pointermove", "pointerdown", "keydown"] as const) window.addEventListener(ev, actividad, { passive: true })
        reloj = window.setInterval(activar, 5000)
      }).catch(() => { if (modoRef.current === "espera") pasar("quieto") }) // no llegó: queda el dibujo y nadie nota nada
    }
    // Recién cuando el navegador está libre: el formulario va primero. (Safari no tiene requestIdleCallback.)
    const libre = "requestIdleCallback" in window
    const turno = libre ? window.requestIdleCallback(montar, { timeout: ESPERA_MS }) : window.setTimeout(montar, 300)

    return () => {
      cancelado = true
      if (libre) window.cancelIdleCallback(turno)
      else window.clearTimeout(turno)
      window.clearTimeout(tope)
      window.clearInterval(reloj)
      window.clearTimeout(reanudar.current)
      document.removeEventListener("visibilitychange", activar)
      for (const ev of ["pointermove", "pointerdown", "keydown"] as const) window.removeEventListener(ev, actividad)
      escena.current?.destroy()
      escena.current = null
    }
  }, [])

  const conEscena = modo === "entrada" || modo === "viva"
  return (
    <div ref={hostRef} className="absolute inset-0">
      <RedFondo className="absolute inset-0 size-full" />
      {/* "pre-emblema": en el HTML inicial, lo que se oculta mientras se espera la entrada animada. */}
      <EmblemaSvg className="pre-emblema absolute inset-0 size-full" style={{ opacity: modo === "quieto" ? 1 : 0, transition: SUAVE }} />
      <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 size-full" style={{ opacity: conEscena ? 1 : 0, transition: SUAVE }} />
      {LOGOS.map(({ archivo, angulo }, i) => {
        const [x, y] = punto(ANILLO_PUNTOS, angulo)
        const visible = modo === "quieto" || modo === "viva" || (modo === "entrada" && logos[i])
        return (
          <img key={archivo} src={`/tools/${archivo}`} alt="" width={LOGO} height={LOGO} draggable={false} className="pre-emblema absolute"
            style={{ left: `${x - LOGO / 2}em`, top: `${y - LOGO / 2}em`, width: `${LOGO}em`, height: `${LOGO}em`, opacity: visible ? 1 : 0, transform: visible ? "none" : "scale(.82)", transition: "opacity .3s, transform .3s" }} />
        )
      })}
    </div>
  )
}
