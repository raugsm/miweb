/**
 * Componentes de las pantallas de cuenta (W11): tarjeta centrada, cabeza, campos, botones, banners y divisor.
 * Medidas y colores EXACTOS del Figma (grupo Ingresar 1097:2..135, aprobado por Peter 4-nov). Dark-only, Inter.
 * La lógica de auth (Supabase) se cablea aparte; acá sólo la presentación + estados.
 */
import { AlertCircle, Check, ChevronDown, type LucideIcon, X } from "lucide-react"
import { useState } from "react"
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

export function AuthCard({ children }: { children: React.ReactNode }) {
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
  return (
    <div className="flex w-full flex-col items-start gap-2">
      <img src="/aritool-logo.png" alt="AriTool" className="size-11 object-contain" />
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

/** Campo de texto. `valor` lo muestra lleno (#e5e7eb); si no, muestra `placeholder` (#5b6475). */
export function Campo({ label, placeholder, valor, error }: { label: string; placeholder?: string; valor?: string; error?: string }) {
  return (
    <div className="flex w-full flex-col items-start gap-1.5">
      <label style={{ color: C.muted2, fontWeight: 500, fontSize: 13 }}>{label}</label>
      <div className="flex h-12 w-full items-center gap-2.5" style={{ background: C.cardAlt, border: `${error ? 1.5 : 1}px solid ${error ? ERR_BORDE : C.borderAlt}`, borderRadius: 10, padding: "0 14px" }}>
        <span className="truncate" style={{ color: valor ? C.text : C.faint, fontSize: 15 }}>{valor || placeholder}</span>
      </div>
      {error ? (
        <div className="flex items-center gap-1.5">
          <AlertCircle className="size-[14px] shrink-0" style={{ color: ERR_BORDE }} />
          <span style={{ color: ERR_TXT, fontSize: 13 }}>{error}</span>
        </div>
      ) : null}
    </div>
  )
}

export function CampoPassword({ label, valor, error, enfoque, check, debajo }: { label: string; valor?: string; error?: string; enfoque?: boolean; check?: boolean; debajo?: React.ReactNode }) {
  const borde = error ? `1.5px solid ${ERR_BORDE}` : enfoque ? `1.5px solid ${AZUL_ENFOQUE}` : `1px solid ${C.borderAlt}`
  return (
    <div className="flex w-full flex-col items-start gap-1.5">
      <label style={{ color: C.muted2, fontWeight: 500, fontSize: 13 }}>{label}</label>
      <div className="flex h-12 w-full items-center gap-2.5" style={{ background: C.cardAlt, border: borde, borderRadius: 10, padding: "0 14px" }}>
        <span className="flex-1 truncate" style={{ color: valor ? C.text : C.faint, fontSize: 15, letterSpacing: valor ? "0.1em" : undefined }}>{valor || "Tu contraseña"}</span>
        <OjoIcono />
        {check ? <Check className="size-[18px] shrink-0" style={{ color: C.green }} /> : null}
      </div>
      {error ? (
        <div className="flex items-center gap-1.5">
          <AlertCircle className="size-[14px] shrink-0" style={{ color: ERR_BORDE }} />
          <span style={{ color: ERR_TXT, fontSize: 13 }}>{error}</span>
        </div>
      ) : null}
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

/** Selector tipo País: bandera + nombre + chevron (presentación; el dropdown real se cablea aparte). */
export function CampoSelect({ label, bandera, texto }: { label: string; bandera?: string; texto: string }) {
  return (
    <div className="flex w-full flex-col items-start gap-1.5">
      <label style={{ color: C.muted2, fontWeight: 500, fontSize: 13 }}>{label}</label>
      <div className="flex h-12 w-full items-center gap-2.5" style={{ background: C.cardAlt, border: `1px solid ${C.borderAlt}`, borderRadius: 10, padding: "0 14px" }}>
        {bandera ? <Flag code={bandera} style={{ width: 20, height: 14 }} /> : null}
        <span className="flex-1 truncate" style={{ color: C.text, fontSize: 15 }}>{texto}</span>
        <ChevronDown className="size-[18px] shrink-0" style={{ color: C.muted }} />
      </div>
    </div>
  )
}

/** 6 casillas de código. `valor` las llena de izq. a der.; `activa` marca la casilla en foco (azul);
 *  `error` pinta de rojo todas las llenas. */
export function CodigoCorreo({ valor = "", activa, error }: { valor?: string; activa?: number; error?: boolean }) {
  return (
    <div className="flex w-full items-center gap-2.5">
      {Array.from({ length: 6 }).map((_, i) => {
        const ch = valor[i]
        const foco = i === activa
        const borde = error ? `1.5px solid ${ERR_BORDE}` : foco ? `1.5px solid ${AZUL_ENFOQUE}` : `1px solid ${C.borderAlt}`
        return (
          <div key={i} className="flex h-[60px] w-[54px] items-center justify-center" style={{ background: C.cardAlt, border: borde, borderRadius: 10 }}>
            {ch ? <span style={{ color: C.title, fontWeight: 700, fontSize: 24 }}>{ch}</span> : null}
          </div>
        )
      })}
    </div>
  )
}

function OjoIcono() {
  const [ver, setVer] = useState(false)
  return (
    <button type="button" onClick={() => setVer((v) => !v)} aria-label={ver ? "Ocultar" : "Ver"} className="shrink-0">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    </button>
  )
}

export function BotonPrimario({ children, icono: Icono, to }: { children: React.ReactNode; icono?: LucideIcon; to?: string }) {
  const cls = "flex w-full items-center justify-center gap-2 text-white"
  const sty = { background: C.blue, borderRadius: 10, padding: "13px 18px", fontWeight: 600, fontSize: 15, lineHeight: "18px" } as const
  const inner = <>{Icono ? <Icono className="size-4" /> : null}{children}</>
  return to ? <Link to={to} className={cls} style={sty}>{inner}</Link> : <button type="button" className={cls} style={sty}>{inner}</button>
}

export function BotonSecundario({ children, icono: Icono, to }: { children: React.ReactNode; icono?: LucideIcon; to?: string }) {
  const cls = "flex w-full items-center justify-center gap-2"
  const sty = { border: `1px solid ${C.borderAlt}`, color: C.text, borderRadius: 10, padding: "13px 18px", fontWeight: 600, fontSize: 15, lineHeight: "18px" } as const
  const inner = <>{Icono ? <Icono className="size-4" style={{ color: C.text }} /> : null}{children}</>
  return to ? <Link to={to} className={cls} style={sty}>{inner}</Link> : <button type="button" className={cls} style={sty}>{inner}</button>
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

export function EnlaceCentro({ children, to }: { children: React.ReactNode; to?: string }) {
  const sty = { color: C.link, fontWeight: 500, fontSize: 14 } as const
  return (
    <div className="flex w-full items-center justify-center">
      {to ? <Link to={to} style={sty}>{children}</Link> : <a href="#" style={sty}>{children}</a>}
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
