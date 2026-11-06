/**
 * Piezas de las páginas "paso a paso" (W14 Recargar; W15 Licencia usa las mismas): la página con su barra,
 * el indicador de pasos, el título, los avisos de "cuando algo no sale" (W14-E 1133:103), el botón grande
 * y las filas para copiar. Medidas del Figma: compu 1118:2 / 1119:2; celular 1121:2 / 1121:67.
 * Cada pieza recibe `m` (celular) porque las dos versiones tienen tamaños distintos.
 */
import { ArrowLeft, ArrowRight, Check, Copy, type LucideIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { C, FranjaSoporte, HeaderDesktop, HeaderMobile, IconoWA, MenuMobile, WA } from "@/components/aritool/chrome"
import type { Precios } from "@/lib/precios"

const VERDE = "#22c55e"
const VERDE_TXT = "#86efac"
const AZUL = "#3b82f6"

/** ¿Pantalla de compu? Se monta UNA sola versión: adentro hay campos de verdad. */
export function useCompu(): boolean {
  const [compu, setCompu] = useState(() => window.matchMedia("(min-width: 1024px)").matches)
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)")
    const cambio = () => setCompu(mq.matches)
    mq.addEventListener("change", cambio)
    return () => mq.removeEventListener("change", cambio)
  }, [])
  return compu
}

/** La página: barra del sitio arriba y una columna angosta con el paso. Sin pie, como en el dibujo. */
export function PaginaPasos({ datos, m, children }: { datos: Precios | null; m: boolean; children: React.ReactNode }) {
  const [menu, setMenu] = useState(false)
  useEffect(() => {
    const prev = document.body.style.background
    document.body.style.background = C.page
    return () => { document.body.style.background = prev }
  }, [])
  return (
    <div className="min-h-screen overflow-x-hidden" style={{ background: C.page, color: C.text, fontFamily: "Inter, system-ui, sans-serif", lineHeight: "normal" }}>
      {m ? (
        <>
          <HeaderMobile onMenu={() => setMenu(true)} />
          <FranjaSoporte datos={datos} />
          <main className="flex flex-col items-start gap-[18px] px-5 pb-10 pt-5">{children}</main>
          {menu ? <MenuMobile datos={datos} onClose={() => setMenu(false)} /> : null}
        </>
      ) : (
        <>
          <HeaderDesktop datos={datos} />
          <main className="mx-auto flex w-full max-w-[800px] flex-col items-start gap-7 px-5 pb-[72px] pt-8">{children}</main>
        </>
      )}
    </div>
  )
}

/** "← Volver a Mi cuenta" / "← Volver al paso anterior". */
export function Volver({ texto, onClick, m }: { texto: string; onClick: () => void; m: boolean }) {
  return (
    <button type="button" onClick={onClick} className="flex items-center gap-1.5" style={{ color: C.link, fontWeight: 500, fontSize: m ? 13 : 14, lineHeight: m ? "16px" : "17px" }}>
      <ArrowLeft className={m ? "size-[15px]" : "size-4"} />{texto}
    </button>
  )
}

/** Indicador de pasos. `actual` de 1 a N; con `todos` quedan todos hechos (el último paso, "Listo"). */
export function Pasos({ nombres, actual, todos, m }: { nombres: string[]; actual: number; todos?: boolean; m: boolean }) {
  const lado = m ? 26 : 34
  return (
    <ol className="flex items-center" style={{ gap: m ? 6 : 12 }} aria-label={`Paso ${actual} de ${nombres.length}`}>
      {nombres.map((nombre, i) => {
        const n = i + 1
        const hecho = todos || n < actual
        const activo = !todos && n === actual
        return (
          <li key={nombre} className="flex items-center" style={{ gap: m ? 6 : 12 }} aria-current={activo ? "step" : undefined}>
            {i > 0 ? <span className="block shrink-0" style={{ width: m ? 28 : 56, height: 2, borderRadius: m ? 0 : 1, background: hecho || activo ? VERDE : C.borderSoft }} /> : null}
            <span className="flex items-center gap-2.5">
              <span className="flex shrink-0 items-center justify-center rounded-full" style={{ width: lado, height: lado, background: hecho ? "#0c1f19" : activo ? AZUL : C.cardAlt, border: `1.5px solid ${hecho ? VERDE : activo ? AZUL : C.borderAlt}`, color: activo ? "#fff" : C.faint, fontWeight: 700, fontSize: m ? 12 : 15 }}>
                {hecho ? <Check className={m ? "size-[14px]" : "size-[18px]"} style={{ color: VERDE }} /> : n}
              </span>
              {m ? <span className="sr-only">{nombre}</span> : (
                <span style={{ color: hecho ? VERDE_TXT : activo ? C.title : C.faint, fontWeight: activo || (todos && n === nombres.length) ? 700 : 500, fontSize: 15, lineHeight: "18px" }}>{nombre}</span>
              )}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

/** "PASO 1 DE 4" + título + (opcional) una línea de ayuda. */
export function TituloPaso({ paso, de, titulo, texto, m }: { paso: number; de: number; titulo: string; texto?: string; m: boolean }) {
  const etiqueta = <p style={{ color: C.link, fontWeight: 700, fontSize: m ? 11 : 12, lineHeight: m ? "13px" : "15px", letterSpacing: m ? "1.3px" : "1.4px" }}>PASO {paso} DE {de}</p>
  const h1 = <h1 className="w-full" style={{ color: C.title, fontWeight: 700, fontSize: m ? 26 : 36, lineHeight: m ? "30px" : "41px" }}>{titulo}</h1>
  if (m) {
    return (
      <>
        {etiqueta}
        {h1}
        {texto ? <p className="w-full" style={{ color: C.muted, fontSize: 14, lineHeight: "20px" }}>{texto}</p> : null}
      </>
    )
  }
  return (
    <div className="flex w-full flex-col items-start gap-2">
      {etiqueta}
      {h1}
      {texto ? <p className="w-full" style={{ color: C.muted, fontSize: 17, lineHeight: "25px" }}>{texto}</p> : null}
    </div>
  )
}

const TONOS = {
  rojo: { bg: "#1f1014", bd: "#5b2129", fg: "#fca5a5", icono: "#f87171" },
  ambar: { bg: "#1f1a0e", bd: "#5c4a1a", fg: "#fcd34d", icono: "#fbbf24" },
  azul: { bg: "#0f1a2e", bd: "#1e3a5f", fg: "#bfdbfe", icono: "#60a5fa" },
}

/** Aviso dentro del paso (W14-E): ícono, título y una explicación. Nunca en una ventana encima. */
export function Aviso({ tono, icono: Icono, titulo, children, gira, m }: { tono: keyof typeof TONOS; icono: LucideIcon; titulo: string; children: React.ReactNode; gira?: boolean; m: boolean }) {
  const t = TONOS[tono]
  return (
    <div role={tono === "rojo" ? "alert" : "status"} className="flex w-full items-start gap-3" style={{ background: t.bg, border: `1px solid ${t.bd}`, borderRadius: 12, padding: m ? 14 : 16 }}>
      <Icono className={`size-[22px] shrink-0 ${gira ? "animate-spin" : ""}`} style={{ color: t.icono }} />
      <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
        <p style={{ color: C.title, fontWeight: 700, fontSize: m ? 15 : 16, lineHeight: m ? "18px" : "19px" }}>{titulo}</p>
        <p className="w-full" style={{ color: t.fg, fontSize: m ? 13 : 14, lineHeight: m ? "19px" : "20px" }}>{children}</p>
      </div>
    </div>
  )
}

type Boton = { children: React.ReactNode; onClick: () => void; ocupado?: boolean; apagado?: boolean; flecha?: boolean; m: boolean }

/** El botón grande que dice qué sigue ("Seguir con US$ 20 →"). */
export function BotonGrande({ children, onClick, ocupado, apagado, flecha, m }: Boton) {
  const no = ocupado || apagado
  return (
    <button type="button" onClick={onClick} disabled={no} aria-busy={ocupado || undefined} className="flex w-full items-center justify-center gap-2.5 text-white" style={{ background: AZUL, borderRadius: 12, padding: m ? "16px 0" : "18px 0", fontWeight: 700, fontSize: m ? 17 : 18, lineHeight: m ? "21px" : "22px", opacity: no ? 0.55 : 1, cursor: no ? "default" : "pointer" }}>
      {children}{flecha ? <ArrowRight className={m ? "size-[18px]" : "size-5"} /> : null}
    </button>
  )
}

/** Botones de los avisos (W14-E): el principal azul y el secundario con borde. */
export function BotonAviso({ children, onClick, ocupado, secundario }: { children: React.ReactNode; onClick: () => void; ocupado?: boolean; secundario?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={ocupado} aria-busy={ocupado || undefined} className="flex w-full items-center justify-center" style={{ background: secundario ? "transparent" : AZUL, border: secundario ? "1px solid #2a3650" : undefined, color: secundario ? C.text : "#fff", borderRadius: 11, padding: "14px 0", fontWeight: 600, fontSize: 15, lineHeight: "18px", opacity: ocupado ? 0.55 : 1 }}>
      {children}
    </button>
  )
}

/** "WhatsApp +51 935 186 037" (W14-E, demora y pausa). `mensaje`: lo que ya va escrito al abrir el chat. */
export function BotonWhatsApp({ datos, mensaje }: { datos: Precios | null; mensaje?: string }) {
  const base = datos?.soporte.whatsapp ?? WA
  const numero = base.split("?")[0].replace(/\D/g, "").replace(/^(\d{2})(\d{3})(\d{3})(\d{3})$/, "+$1 $2 $3 $4")
  const href = mensaje ? `${base.split("?")[0]}?text=${encodeURIComponent(mensaje)}` : base
  return (
    <a href={href} target="_blank" rel="noreferrer" className="flex w-full items-center justify-center gap-2" style={{ background: "#0b1a14", border: "1px solid #1f5b3a", borderRadius: 11, padding: "14px 0", color: C.text, fontWeight: 600, fontSize: 15, lineHeight: "18px" }}>
      <IconoWA className="size-[18px]" style={{ color: C.waGreen }} />WhatsApp {numero}
    </a>
  )
}

/** "¿Dudas? Escribinos al WhatsApp +51 …" al pie de cada paso (solo compu). */
export function Ayuda({ datos }: { datos: Precios | null }) {
  const href = datos?.soporte.whatsapp ?? WA
  const numero = href.replace(/\D/g, "").replace(/^(\d{2})(\d{3})(\d{3})(\d{3})$/, "+$1 $2 $3 $4")
  return (
    <p className="flex items-center gap-2" style={{ fontSize: 14, lineHeight: "17px" }}>
      <span style={{ color: C.muted }}>¿Dudas?</span>
      <a href={href} target="_blank" rel="noreferrer" style={{ color: VERDE_TXT, fontWeight: 500 }}>Escribinos al WhatsApp {numero}</a>
    </p>
  )
}

/** Tarjeta de cada instrucción del paso 3: número en un círculo + título + contenido. */
export function Instruccion({ n, titulo, children, m }: { n: number; titulo: string; children: React.ReactNode; m: boolean }) {
  const numero = <span className="flex shrink-0 items-center justify-center rounded-full text-white" style={{ width: m ? 28 : 36, height: m ? 28 : 36, background: AZUL, fontWeight: 700, fontSize: m ? 14 : 17 }}>{n}</span>
  const h2 = <h2 style={{ color: C.title, fontWeight: 700, fontSize: m ? 16 : 18, lineHeight: m ? "19px" : "22px" }}>{titulo}</h2>
  if (m) {
    return (
      <section className="flex w-full flex-col items-start gap-2.5 rounded-[14px] p-4" style={{ background: C.card, border: `1px solid ${C.borderSoft}` }}>
        <div className="flex items-center gap-2.5">{numero}{h2}</div>
        {children}
      </section>
    )
  }
  return (
    <section className="flex w-full items-start gap-4 rounded-[14px] p-5" style={{ background: C.card, border: `1px solid ${C.borderSoft}` }}>
      {numero}
      <div className="flex min-w-0 flex-1 flex-col items-start gap-3">{h2}{children}</div>
    </section>
  )
}

/** Alto de línea que da el Figma para cada tamaño de letra de los datos a copiar. */
const ALTO_LINEA: Record<number, number> = { 19: 23, 20: 24, 24: 29, 26: 31, 28: 34 }

/**
 * Fila para copiar un dato: etiqueta chica, el valor grande y el botón "Copiar".
 * `fuerte`: el dato que no se puede equivocar (monto exacto, código de la nota): borde y botón azules.
 * `copia`: lo que va al portapapeles (sin espacios ni símbolo), si es distinto de lo que se muestra.
 */
export function FilaCopiar({ etiqueta, valor, copia, fuerte, botonAzul, grande, m }: { etiqueta: string; valor: string; copia?: string; fuerte?: boolean; botonAzul?: boolean; grande?: number; m: boolean }) {
  const [copiado, setCopiado] = useState(false)
  const reloj = useRef(0)
  useEffect(() => () => window.clearTimeout(reloj.current), [])
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(copia ?? valor)
      setCopiado(true)
      window.clearTimeout(reloj.current)
      reloj.current = window.setTimeout(() => setCopiado(false), 1600)
    } catch {
      /* sin permiso para copiar: el dato está a la vista para copiarlo a mano */
    }
  }
  const azul = fuerte || botonAzul
  return (
    // El borde fuerte es de 1.5 px: como borde de verdad se dibuja de 1 px, así que va como anillo interior.
    <div className="flex w-full items-center" style={{ gap: m ? 10 : 12, background: fuerte ? "#0f1a2e" : C.cardAlt, border: fuerte ? undefined : `1px solid ${C.borderAlt}`, boxShadow: fuerte ? "inset 0 0 0 1.5px #2563eb" : undefined, borderRadius: 10, padding: fuerte ? (m ? "13.5px 11.5px 13.5px 15.5px" : "13.5px 13.5px 13.5px 17.5px") : (m ? "12px 10px 12px 14px" : "12px 12px 12px 16px") }}>
      <div className="flex min-w-0 flex-col items-start gap-0.5 whitespace-nowrap">
        <span style={{ color: fuerte ? C.link : C.muted, fontWeight: 500, fontSize: 12, lineHeight: "15px" }}>{etiqueta}</span>
        <span className="select-all" style={{ color: "#fff", fontWeight: 700, fontSize: grande ?? 20, lineHeight: `${ALTO_LINEA[grande ?? 20] ?? Math.round((grande ?? 20) * 1.21)}px` }}>{valor}</span>
      </div>
      <div className="flex-1" />
      <button type="button" onClick={copiar} className="flex shrink-0 items-center gap-1.5 text-white" style={{ background: azul ? "#2563eb" : C.border, border: azul ? undefined : "1px solid #2a3650", borderRadius: 9, padding: m ? "10px 12px" : azul ? "9px 14px" : "9px 14px", fontWeight: 600, fontSize: 14, lineHeight: "17px" }}>
        {copiado ? <Check className="size-[15px]" /> : <Copy className="size-[15px]" />}{copiado ? "Copiado" : "Copiar"}
      </button>
    </div>
  )
}
