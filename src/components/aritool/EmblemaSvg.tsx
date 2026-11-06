/**
 * El panel de Ingresar en SVG (Figma W11-E 1172:301): la red de fondo y el emblema quieto (isotipo AR,
 * anillo, anillo de puntos y rayos). Es el estado final válido de la pantalla: sale de una, sin esperar
 * a nada, y es lo que queda si la escena animada no carga. Sale de la misma geometría que la escena
 * (hero/emblema.ts), así al pasar de uno a otra nada salta. Lienzo de 860 × 900.
 */
import { ANCHO_GLIFO, ANILLO, ANILLO_PUNTOS, ARCOS, GLYPH_CAJA, GLYPH_CUT, GLYPH_FILLS, GLYPH_STROKES, LIENZO, LOGOS, punto, RAYO_DESDE, RED_LINEAS, RED_NODOS } from "@/components/hero/emblema"

const { cx: CX, cy: CY } = LIENZO
const n = (v: number) => Math.round(v * 10) / 10
const CAJA = `0 0 ${LIENZO.w} ${LIENZO.h}`

const ESCALA = ANCHO_GLIFO / (GLYPH_CAJA.x1 - GLYPH_CAJA.x0)
const GLIFO_T = `translate(${n(CX - ((GLYPH_CAJA.x0 + GLYPH_CAJA.x1) / 2) * ESCALA)} ${n(CY - ((GLYPH_CAJA.y0 + GLYPH_CAJA.y1) / 2) * ESCALA)}) scale(${ESCALA.toFixed(4)})`

function arco(desde: number, largo: number): string {
  const [x0, y0] = punto(ANILLO, desde)
  const [x1, y1] = punto(ANILLO, desde + largo)
  return `M${n(x0)} ${n(y0)}A${ANILLO} ${ANILLO} 0 ${largo > 180 ? 1 : 0} 0 ${n(x1)} ${n(y1)}`
}

type Props = { className?: string; style?: React.CSSProperties }

/** Red de fondo: siempre en SVG, quieta. No se calcula nada en cada cuadro. */
export function RedFondo({ className, style }: Props) {
  return (
    <svg viewBox={CAJA} fill="none" aria-hidden="true" className={className} style={style}>
      <path d={RED_LINEAS} stroke="#3b82f6" strokeOpacity=".13" />
      <path d={RED_NODOS} stroke="#60a5fa" strokeOpacity=".5" strokeWidth="3.2" strokeLinecap="round" />
    </svg>
  )
}

/** El emblema quieto: isotipo, anillo, anillo de puntos y rayos hacia los logos. */
export function EmblemaSvg({ className, style }: Props) {
  return (
    <svg viewBox={CAJA} fill="none" aria-hidden="true" className={className} style={style}>
      <defs>
        <linearGradient id="em-glifo" x1="0" y1={GLYPH_CAJA.y0} x2="0" y2={GLYPH_CAJA.y1} gradientUnits="userSpaceOnUse">
          <stop stopColor="#fff" /><stop offset="1" stopColor="#7ea6ff" />
        </linearGradient>
        <mask id="em-corte" maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024">
          <rect width="1024" height="1024" fill="#fff" />
          <path d={GLYPH_CUT} fill="#000" />
          {GLYPH_STROKES.map(([d, ancho]) => <path key={d} d={d} stroke="#000" strokeWidth={ancho} strokeLinecap="round" />)}
        </mask>
      </defs>
      <circle cx={CX} cy={CY} r={ANILLO_PUNTOS} stroke="#3b82f6" strokeOpacity=".4" strokeDasharray="3 4" />
      {LOGOS.map(({ angulo }) => {
        const [x0, y0] = punto(RAYO_DESDE, angulo)
        const [x1, y1] = punto(ANILLO_PUNTOS, angulo)
        return (
          <g key={angulo}>
            <path d={`M${n(x0)} ${n(y0)}L${n(x1)} ${n(y1)}`} stroke="#3b82f6" strokeOpacity=".6" />
            <circle cx={n(x0)} cy={n(y0)} r="2.5" fill="#93c5fd" />
          </g>
        )
      })}
      <circle cx={CX} cy={CY} r={ANILLO} stroke="#3b82f6" strokeOpacity=".4" />
      {ARCOS.map(([desde, largo]) => <path key={desde} d={arco(desde, largo)} stroke="#60a5fa" strokeWidth="3" strokeLinecap="round" />)}
      <g transform={GLIFO_T} mask="url(#em-corte)" fill="url(#em-glifo)">
        {GLYPH_FILLS.map((d) => <path key={d} d={d} />)}
      </g>
    </svg>
  )
}
