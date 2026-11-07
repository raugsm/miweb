/**
 * Componentes de las pantallas de cuenta (W11): tarjeta centrada, cabeza, campos, botones, banners y divisor.
 * Medidas y colores EXACTOS del Figma (grupo Ingresar 1097:2..135, aprobado por Peter 4-nov). Dark-only, Inter.
 * Cada pieza sirve para las dos cosas: sin `onChange`/`onClick` es solo presentación (galería de
 * estados para revisar contra el Figma); con ellos es el campo o el botón de verdad (pages/CuentaPage).
 */
import { AlertCircle, Check, ChevronDown, Eye, EyeOff, type LucideIcon, X } from "lucide-react"
import { createContext, useContext, useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"

import { Flag } from "@/components/Flag"
import { C } from "@/components/aritool/chrome"

const ERR_BORDE = "#f87171"
const ERR_TXT = "#fca5a5"
const AZUL_ENFOQUE = "#3b82f6"
const ROJO = { bg: "#1f1014", bd: "#5b2129", fg: "#fca5a5" }
const AMBAR = { bg: "#1f1a0e", bd: "#5c4a1a", fg: "#fcd34d" }
const AZUL = { bg: "#0f1a2e", bd: "#1e3a5f", fg: "#bfdbfe" }

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-start justify-center px-5 py-12 sm:items-center" style={{ background: C.page, fontFamily: "Inter, system-ui, sans-serif", lineHeight: "normal" }}>
      {children}
    </div>
  )
}

/**
 * Armado de la tarjeta. "clasico" es W11, la tarjeta centrada. "paneles" es W11-E (1172:424), la de la
 * pantalla de dos paneles (pages/IngresarPrototipoPage): 480 de ancho, radio 20, sin logo y título de 30.
 */
export const EstiloAuth = createContext<"clasico" | "paneles">("clasico")

/** `compacta`: en "paneles", la tarjeta larga de Crear cuenta (1178:6647) va más apretada para entrar en 900 de alto. */
export function AuthCard({ children, compacta }: { children: React.ReactNode; compacta?: boolean }) {
  if (useContext(EstiloAuth) === "paneles") {
    return (
      <div className={`flex w-[480px] max-w-full flex-col items-start px-10 ${compacta ? "gap-[14px] py-7" : "gap-[18px] py-9"}`} style={{ background: "rgba(10,17,32,0.92)", border: "1px solid #26345a", borderRadius: 20, boxShadow: "0px 18px 30px rgba(13,51,153,0.45)" }}>
        {children}
      </div>
    )
  }
  return (
    <div
      className="flex w-full max-w-[440px] flex-col items-start gap-[18px] px-5 py-6 lg:p-8"
      style={{ background: C.card, border: `1px solid ${C.borderSoft}`, borderRadius: 16, boxShadow: "0px 16px 40px rgba(0,0,0,0.4)" }}
    >
      {children}
    </div>
  )
}

export function CabezaAuth({ titulo, texto }: { titulo: string; texto?: string }) {
  if (useContext(EstiloAuth) === "paneles") {
    return (
      <div className="flex w-full flex-col items-start gap-2">
        <div style={{ color: C.title, fontWeight: 700, fontSize: 30, lineHeight: "36px" }}>{titulo}</div>
        {texto ? <div className="w-full" style={{ color: C.muted, fontSize: 14, lineHeight: "20px" }}>{texto}</div> : null}
      </div>
    )
  }
  return (
    <div className="flex w-full flex-col items-start gap-2">
      <img src="/aritool-logo-192.webp" alt="AriTool" className="size-11 object-contain" />
      <div style={{ color: C.title, fontWeight: 700, fontSize: 24 }}>{titulo}</div>
      {texto ? <div className="w-full" style={{ color: C.muted, fontSize: 14, lineHeight: "20px" }}>{texto}</div> : null}
    </div>
  )
}

export function Banner({ tipo, icono: Icono, children }: { tipo: "rojo" | "ambar" | "azul"; icono: LucideIcon; children: React.ReactNode }) {
  const e = tipo === "rojo" ? ROJO : tipo === "ambar" ? AMBAR : AZUL
  return (
    <div className="flex w-full items-start gap-2.5" style={{ background: e.bg, border: `1px solid ${e.bd}`, borderRadius: 10, padding: 12 }}>
      <Icono className="size-[18px] shrink-0" style={{ color: e.fg }} />
      <span className="flex-1" style={{ color: e.fg, fontSize: 13, lineHeight: "19px" }}>{children}</span>
    </div>
  )
}

// Letra de los campos: 15 px como el Figma; en iPhone 16 px para que Safari no haga zoom al escribir.
const ENTRADA = "min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-[#5b6475] supports-[-webkit-touch-callout:none]:text-[16px]"

function ErrorCampo({ texto }: { texto: string }) {
  return (
    <div className="flex items-center gap-1.5" role="alert">
      <AlertCircle className="size-[14px] shrink-0" style={{ color: ERR_BORDE }} />
      <span style={{ color: ERR_TXT, fontSize: 13 }}>{texto}</span>
    </div>
  )
}

type EntradaProps = {
  id?: string
  autoComplete?: string
  autoFocus?: boolean
  /** Con `onChange` el campo es un <input> real; sin él, solo muestra `valor`. */
  onChange?: (valor: string) => void
  onEnter?: () => void
}

/** Campo de texto. `valor` lo muestra lleno (#e5e7eb); si no, muestra `placeholder` (#5b6475). */
export function Campo({ label, placeholder, valor, error, tipo = "text", id, autoComplete, autoFocus, onChange, onEnter }: { label: string; placeholder?: string; valor?: string; error?: string; tipo?: string } & EntradaProps) {
  const [foco, setFoco] = useState(false)
  const borde = error ? `1.5px solid ${ERR_BORDE}` : foco ? `1.5px solid ${AZUL_ENFOQUE}` : `1px solid ${C.borderAlt}`
  return (
    <div className="flex w-full flex-col items-start gap-1.5">
      <label htmlFor={id} style={{ color: C.muted2, fontWeight: 500, fontSize: 13 }}>{label}</label>
      <div className="flex h-12 w-full items-center gap-2.5" style={{ background: C.cardAlt, border: borde, borderRadius: 10, padding: "0 14px" }}>
        {onChange ? (
          <input id={id} type={tipo} value={valor ?? ""} placeholder={placeholder} autoComplete={autoComplete} autoFocus={autoFocus} autoCapitalize="none" spellCheck={false}
            onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") onEnter?.() }} onFocus={() => setFoco(true)} onBlur={() => setFoco(false)}
            aria-invalid={Boolean(error)} className={ENTRADA} style={{ color: C.text }} />
        ) : (
          <span className="truncate" style={{ color: valor ? C.text : C.faint, fontSize: 15 }}>{valor || placeholder}</span>
        )}
      </div>
      {error ? <ErrorCampo texto={error} /> : null}
    </div>
  )
}

export function CampoPassword({ label, valor, error, enfoque, check, debajo, id, autoComplete, autoFocus, onChange, onEnter }: { label: string; valor?: string; error?: string; enfoque?: boolean; check?: boolean; debajo?: React.ReactNode } & EntradaProps) {
  const [foco, setFoco] = useState(false)
  const [ver, setVer] = useState(false)
  const borde = error ? `1.5px solid ${ERR_BORDE}` : enfoque || foco ? `1.5px solid ${AZUL_ENFOQUE}` : `1px solid ${C.borderAlt}`
  return (
    <div className="flex w-full flex-col items-start gap-1.5">
      <label htmlFor={id} style={{ color: C.muted2, fontWeight: 500, fontSize: 13 }}>{label}</label>
      <div className="flex h-12 w-full items-center gap-2.5" style={{ background: C.cardAlt, border: borde, borderRadius: 10, padding: "0 14px" }}>
        {onChange ? (
          <input id={id} type={ver ? "text" : "password"} value={valor ?? ""} placeholder="Tu contraseña" autoComplete={autoComplete} autoFocus={autoFocus} autoCapitalize="none" spellCheck={false}
            onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") onEnter?.() }} onFocus={() => setFoco(true)} onBlur={() => setFoco(false)}
            aria-invalid={Boolean(error)} className={ENTRADA} style={{ color: C.text, letterSpacing: valor && !ver ? "0.1em" : undefined }} />
        ) : (
          <span className="flex-1 truncate" style={{ color: valor ? C.text : C.faint, fontSize: 15, letterSpacing: valor ? "0.1em" : undefined }}>{valor || "Tu contraseña"}</span>
        )}
        <button type="button" onClick={() => setVer((v) => !v)} aria-label={ver ? "Ocultar contraseña" : "Ver contraseña"} aria-pressed={ver} className="shrink-0">
          {ver ? <EyeOff className="size-[18px]" style={{ color: C.muted }} /> : <Eye className="size-[18px]" style={{ color: C.muted }} />}
        </button>
        {check ? <Check className="size-[18px] shrink-0" style={{ color: C.green }} /> : null}
      </div>
      {error ? <ErrorCampo texto={error} /> : null}
      {debajo}
    </div>
  )
}

/** Reglas de la contraseña en dos columnas: ✓ verde (cumplida) · ✗ gris (pendiente). */
export function ReglasPassword({ reglas }: { reglas: { texto: string; ok: boolean }[] }) {
  return (
    <div className="grid w-full grid-cols-2 gap-x-6 gap-y-1.5">
      {reglas.map((r) => (
        <div key={r.texto} className="flex items-center gap-1.5">
          {r.ok ? <Check className="size-[14px] shrink-0" style={{ color: C.green }} /> : <X className="size-[14px] shrink-0" style={{ color: C.faint }} />}
          <span style={{ color: r.ok ? C.muted2 : C.faint, fontSize: 12 }}>{r.texto}</span>
        </div>
      ))}
    </div>
  )
}

/**
 * Selector de país: bandera + nombre + chevron. Abre una lista oscura propia (no el `<select>`
 * nativo, que en Windows sale blanco y muestra países que no atendemos). Con `opciones` y
 * `onChange` es el campo real; sin ellos es solo presentación (galería de estados).
 */
export function CampoSelect({ label, bandera, texto, id, valor, opciones, onChange }: { label: string; bandera?: string; texto: string; id?: string; valor?: string; opciones?: { valor: string; texto: string }[]; onChange?: (valor: string) => void }) {
  const [abierto, setAbierto] = useState(false)
  const caja = useRef<HTMLDivElement>(null)
  const interactivo = Boolean(opciones && onChange && valor != null)

  useEffect(() => {
    if (!abierto) return
    const cerrarFuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false)
    }
    const cerrarTecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAbierto(false)
    }
    document.addEventListener("mousedown", cerrarFuera)
    document.addEventListener("keydown", cerrarTecla)
    return () => {
      document.removeEventListener("mousedown", cerrarFuera)
      document.removeEventListener("keydown", cerrarTecla)
    }
  }, [abierto])

  const elegir = (codigo: string) => {
    onChange?.(codigo)
    setAbierto(false)
  }

  return (
    <div ref={caja} className="relative flex w-full flex-col items-start gap-1.5">
      <label htmlFor={id} style={{ color: C.muted2, fontWeight: 500, fontSize: 13 }}>{label}</label>
      <button
        id={id}
        type="button"
        disabled={!interactivo}
        aria-haspopup={interactivo ? "listbox" : undefined}
        aria-expanded={interactivo ? abierto : undefined}
        onClick={() => { if (interactivo) setAbierto((v) => !v) }}
        className="flex h-12 w-full items-center gap-2.5 text-left disabled:cursor-default"
        style={{ background: C.cardAlt, border: `1px solid ${abierto ? AZUL_ENFOQUE : C.borderAlt}`, borderRadius: 10, padding: "0 14px" }}
      >
        {bandera ? <Flag code={bandera} style={{ width: 20, height: 14 }} /> : null}
        <span className="flex-1 truncate" style={{ color: C.text, fontSize: 15 }}>{texto}</span>
        <ChevronDown className="size-[18px] shrink-0" style={{ color: C.muted, transform: abierto ? "rotate(180deg)" : undefined }} />
      </button>

      {abierto && opciones ? (
        <div role="listbox" aria-label={label} className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-xl py-1" style={{ background: C.card, border: `1px solid ${C.borderAlt}`, boxShadow: "0 16px 40px rgba(0,0,0,.45)" }}>
          {opciones.map((o) => (
            <button
              key={o.valor}
              type="button"
              role="option"
              aria-selected={o.valor === valor}
              onClick={() => elegir(o.valor)}
              className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left hover:bg-white/5"
              style={{ color: o.valor === valor ? C.title : C.muted2, fontSize: 14 }}
            >
              <Flag code={o.valor.toLowerCase()} style={{ width: 20, height: 14 }} />
              <span className="flex-1 truncate">{o.texto}</span>
              {o.valor === valor ? <Check className="size-[15px] shrink-0" style={{ color: C.green }} /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/** 6 casillas de código. `valor` las llena de izq. a der.; `activa` marca la casilla en foco (azul);
 *  `error` pinta de rojo todas las llenas. Con `onChange` se escribe de verdad (un solo campo
 *  invisible encima: acepta pegar el código y el autocompletado del celular). */
export function CodigoCorreo({ valor = "", activa, error, id, autoFocus, onChange }: { valor?: string; activa?: number; error?: boolean; id?: string; autoFocus?: boolean; onChange?: (valor: string) => void }) {
  const [foco, setFoco] = useState(false)
  const enFoco = activa ?? (foco ? Math.min(valor.length, 5) : undefined)
  return (
    <div className="relative flex w-full items-center gap-2.5">
      {Array.from({ length: 6 }).map((_, i) => {
        const ch = valor[i]
        const borde = error ? `1.5px solid ${ERR_BORDE}` : i === enFoco ? `1.5px solid ${AZUL_ENFOQUE}` : `1px solid ${C.borderAlt}`
        return (
          <div key={i} className="flex h-[60px] w-[54px] min-w-0 shrink items-center justify-center" style={{ background: C.cardAlt, border: borde, borderRadius: 10 }}>
            {ch ? <span style={{ color: C.title, fontWeight: 700, fontSize: 24 }}>{ch}</span> : null}
          </div>
        )
      })}
      {onChange ? (
        <input id={id} aria-label="Código de 6 números" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus={autoFocus} value={valor}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))} onFocus={() => setFoco(true)} onBlur={() => setFoco(false)}
          className="absolute inset-0 size-full cursor-text text-[16px] opacity-0" />
      ) : null}
    </div>
  )
}

type BotonProps = { children: React.ReactNode; icono?: LucideIcon; to?: string; onClick?: () => void; ocupado?: boolean }
const apagado = (ocupado?: boolean) => (ocupado ? { opacity: 0.6, cursor: "default" } : undefined)

export function BotonPrimario({ children, icono: Icono, to, onClick, ocupado }: BotonProps) {
  const cls = "flex w-full items-center justify-center gap-2 text-white"
  const sty = { background: C.blue, borderRadius: 10, padding: "13px 18px", fontWeight: 600, fontSize: 15, lineHeight: "18px" } as const
  const inner = <>{Icono ? <Icono className="size-4" /> : null}{children}</>
  return to ? <Link to={to} className={cls} style={sty}>{inner}</Link> : <button type="button" onClick={onClick} disabled={ocupado} className={cls} style={{ ...sty, ...apagado(ocupado) }}>{inner}</button>
}

export function BotonSecundario({ children, icono: Icono, to, onClick, ocupado }: BotonProps) {
  const cls = "flex w-full items-center justify-center gap-2"
  const sty = { border: `1px solid ${C.borderAlt}`, color: C.text, borderRadius: 10, padding: "13px 18px", fontWeight: 600, fontSize: 15, lineHeight: "18px" } as const
  const inner = <>{Icono ? <Icono className="size-4" style={{ color: C.text }} /> : null}{children}</>
  return to ? <Link to={to} className={cls} style={sty}>{inner}</Link> : <button type="button" onClick={onClick} disabled={ocupado} className={cls} style={{ ...sty, ...apagado(ocupado) }}>{inner}</button>
}

export function BotonPausa({ children, icono: Icono }: { children: React.ReactNode; icono: LucideIcon }) {
  return (
    <button type="button" disabled className="flex w-full items-center justify-center gap-2" style={{ background: C.border, border: `1px solid ${C.borderSoft}`, color: C.faint, borderRadius: 10, padding: "13px 18px", fontWeight: 600, fontSize: 15, lineHeight: "18px" }}>
      <Icono className="size-4" style={{ color: C.faint }} />
      {children}
    </button>
  )
}

/** Divisor con texto al medio: línea + "texto" + línea. */
export function Divisor({ texto }: { texto: string }) {
  return (
    <div className="flex w-full items-center gap-3">
      <div className="h-px flex-1" style={{ background: C.borderSoft }} />
      <span style={{ color: C.muted, fontSize: 13 }}>{texto}</span>
      <div className="h-px flex-1" style={{ background: C.borderSoft }} />
    </div>
  )
}

export function EnlaceCentro({ children, to, onClick }: { children: React.ReactNode; to?: string; onClick?: () => void }) {
  const sty = { color: C.link, fontWeight: 500, fontSize: 14 } as const
  return (
    <div className="flex w-full items-center justify-center">
      {to ? <Link to={to} style={sty}>{children}</Link> : onClick ? <button type="button" onClick={onClick} style={sty}>{children}</button> : <a href="#" style={sty}>{children}</a>}
    </div>
  )
}

/** "¿No podés entrar? Escribinos por WhatsApp" */
export function AyudaWhatsApp({ wa }: { wa: string }) {
  return (
    <div className="flex w-full items-center justify-center gap-1.5">
      <span style={{ color: C.muted, fontSize: 13 }}>¿No podés entrar?</span>
      <a href={wa} target="_blank" rel="noreferrer" style={{ color: C.link, fontWeight: 500, fontSize: 14 }}>Escribinos por WhatsApp</a>
    </div>
  )
}
