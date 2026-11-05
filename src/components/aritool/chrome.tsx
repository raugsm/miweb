/**
 * Chrome compartido de las páginas AriTool: paleta, contenedor, header (compu y celular),
 * franja de soporte, menú del celular (W3) y pie. Lo usan todas las pantallas salvo que necesiten
 * algo propio. Fuente Inter, dark-only, datos en vivo por props (usePrecios se llama en la página).
 */
import { ChevronDown, ChevronRight, LogIn, Menu, Search, X } from "lucide-react"
import { useState } from "react"
import { Link } from "react-router-dom"

import { Flag } from "@/components/Flag"
import { usePais } from "@/lib/pais"
import { nombreMoneda, paisesDisponibles, simboloMoneda, type Precios } from "@/lib/precios"
import { useRelease } from "@/lib/release"

export const WA = "https://wa.me/51935186037"

// Destinos de navegación. Hoy apuntan a las rutas de vista previa (preview-*); cuando la web
// nueva pise a la vieja, se cambian acá en un solo lugar (→ "/", "/app", "/novedades", ...).
export const RUTAS = {
  inicio: "/preview-home",
  app: "/preview-app",
  novedades: "/preview-novedades",
  descargar: "/preview-descargar",
  cuenta: "/preview-cuenta?estado=c1",
  alquiler: "/preview-home#alquiler",
  servicios: "/preview-home#servicios",
}

export const C = {
  page: "#060a12",
  card: "#0a101c",
  cardAlt: "#0c1322",
  iconBg: "#111a2b",
  border: "#141c2a",
  borderAlt: "#243049",
  borderSoft: "#1b2433",
  title: "#f3f4f6",
  text: "#e5e7eb",
  green: "#34d399",
  blue: "#3b82f6",
  link: "#93c5fd",
  muted: "#8b95a7",
  muted2: "#aab3c2",
  faint: "#5b6475",
  waBg: "#0b1a14",
  waBorder: "#1f5b3a",
  waGreen: "#25D366",
  waText: "#4ade80",
  pcBorder: "#1e3a5f",
}

export function Cont({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-[1440px] px-5 md:px-10 xl:px-20 ${className}`}>{children}</div>
}

export function IconoWA({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} style={style} aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.71.306 1.263.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  )
}

const MENU = [
  { t: "Alquiler", to: RUTAS.alquiler },
  { t: "Servicios", to: RUTAS.servicios },
  { t: "App AriTool", to: RUTAS.app },
  { t: "Novedades", to: RUTAS.novedades },
]

function PaisSelector({ datos }: { datos: Precios | null }) {
  const { pais, setPais } = usePais()
  const [abierto, setAbierto] = useState(false)
  const actual = datos?.pais
  const etiqueta = actual ? `${actual.nombre} · ${simboloMoneda(actual.moneda)}` : "País"
  return (
    <div className="relative">
      <button type="button" onClick={() => setAbierto((v) => !v)} className="flex items-center gap-2" style={{ border: `1px solid ${C.borderSoft}`, borderRadius: 8, padding: "7px 10px" }}>
        <Flag code={pais.toLowerCase()} shape="rect" style={{ width: 18, height: 12 }} />
        <span style={{ color: C.muted2, fontWeight: 500, fontSize: 13 }}>{etiqueta}</span>
        <ChevronDown className="size-[14px]" style={{ color: C.muted }} />
      </button>
      {abierto ? (
        <div className="absolute right-0 z-50 mt-2 w-52 overflow-hidden rounded-xl py-1" style={{ border: `1px solid ${C.border}`, background: C.card }}>
          {paisesDisponibles(datos).map((p) => (
            <button key={p.codigo} type="button" onClick={() => { setPais(p.codigo); setAbierto(false) }} className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-white/5" style={{ color: pais === p.codigo ? C.text : C.muted2, fontSize: 13 }}>
              <Flag code={p.codigo.toLowerCase()} shape="rect" style={{ width: 18, height: 12 }} />
              {p.nombre}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function HeaderDesktop({ datos, active }: { datos: Precios | null; active?: string }) {
  return (
    <header className="sticky top-0 z-40 backdrop-blur" style={{ borderBottom: `1px solid ${C.border}`, background: `${C.page}f2` }}>
      <Cont className="flex h-[79px] items-center">
        <Link to={RUTAS.inicio} className="flex shrink-0 items-center gap-2.5">
          <img src="/aritool-logo.png" alt="AriTool" className="size-[38px] rounded-lg" />
          <span style={{ color: C.title, fontWeight: 700, fontSize: 19 }}>AriTool</span>
        </Link>
        <nav className="ml-9 flex items-center gap-7">
          {MENU.map((m) => (
            <Link key={m.t} to={m.to} className="transition-colors hover:text-white" style={{ color: active === m.t ? C.title : C.muted2, fontWeight: 500, fontSize: 14 }}>{m.t}</Link>
          ))}
        </nav>
        <div className="flex-1" />
        <div className="flex items-center gap-3">
          <a href={datos?.soporte.whatsapp ?? WA} target="_blank" rel="noreferrer" className="flex items-center gap-2" style={{ background: C.waBg, border: `1px solid ${C.waBorder}`, borderRadius: 999, padding: "5px 14px 5px 5px" }}>
            <span className="flex size-[30px] items-center justify-center rounded-full" style={{ background: C.waGreen }}><IconoWA className="size-[18px]" style={{ color: "#fff" }} /></span>
            <span className="flex flex-col leading-tight">
              <span style={{ color: C.waText, fontWeight: 700, fontSize: 9, letterSpacing: "0.8px" }}>SOPORTE WHATSAPP</span>
              <span style={{ color: C.title, fontWeight: 600, fontSize: 14 }}>+51 935 186 037</span>
            </span>
          </a>
          <PaisSelector datos={datos} />
          <Link to={RUTAS.cuenta} className="flex items-center gap-2" style={{ background: C.cardAlt, border: `1.5px solid ${C.blue}`, borderRadius: 8, padding: "10px 18px 10px 16px" }}>
            <LogIn className="size-[16px]" style={{ color: C.text }} />
            <span style={{ color: C.text, fontWeight: 600, fontSize: 14 }}>Ingresar</span>
          </Link>
        </div>
      </Cont>
    </header>
  )
}

export function PieDesktop() {
  return (
    <footer style={{ borderTop: `1px solid ${C.border}` }}>
      <Cont className="flex items-center gap-7 py-7">
        <div className="flex items-center gap-2">
          <img src="/aritool-logo.png" alt="" className="size-6 rounded-md" />
          <span style={{ color: C.text, fontWeight: 700, fontSize: 15 }}>AriTool</span>
          <span style={{ color: C.faint, fontSize: 13 }}>© 2026</span>
        </div>
        <a href="#" style={{ color: C.muted, fontSize: 13 }}>Términos</a>
        <a href="#" style={{ color: C.muted, fontSize: 13 }}>Privacidad</a>
      </Cont>
    </footer>
  )
}

export function HeaderMobile({ onMenu, mostrarIngresar = true, alto = 64 }: { onMenu: () => void; mostrarIngresar?: boolean; alto?: number }) {
  return (
    <header className="sticky top-0 z-40" style={{ borderBottom: `1px solid ${C.border}`, background: `${C.page}f2` }}>
      <div className="flex items-center gap-3 px-5" style={{ height: alto }}>
        <Link to={RUTAS.inicio} className="flex items-center gap-2"><img src="/aritool-logo.png" alt="AriTool" className="size-7 rounded-lg" /><span style={{ color: C.title, fontWeight: 700, fontSize: 17 }}>AriTool</span></Link>
        <div className="flex-1" />
        {mostrarIngresar ? (
          <Link to={RUTAS.cuenta} className="flex h-[35px] items-center gap-1.5 rounded-lg px-3" style={{ background: C.cardAlt, border: `1.5px solid ${C.blue}` }}><LogIn className="size-[15px]" style={{ color: C.text }} /><span style={{ color: C.text, fontWeight: 600, fontSize: 13 }}>Ingresar</span></Link>
        ) : null}
        <button type="button" aria-label="Buscar" className="p-1"><Search className="size-[22px]" style={{ color: C.muted2 }} /></button>
        <button type="button" aria-label="Menú" onClick={onMenu} className="p-1"><Menu className="size-[22px]" style={{ color: C.muted2 }} /></button>
      </div>
    </header>
  )
}

export function FranjaSoporte({ datos }: { datos: Precios | null }) {
  return (
    <a href={datos?.soporte.whatsapp ?? WA} target="_blank" rel="noreferrer" className="flex h-9 items-center justify-center gap-2" style={{ background: C.waBg, borderBottom: "1px solid #14532d" }}>
      <IconoWA className="size-4" style={{ color: C.waGreen }} />
      <span style={{ color: "#86efac", fontWeight: 500, fontSize: 13 }}>Soporte</span>
      <span style={{ color: C.title, fontWeight: 700, fontSize: 14 }}>+51 935 186 037</span>
    </a>
  )
}

export function PieMobile() {
  return (
    <footer style={{ borderTop: `1px solid ${C.border}` }}>
      <div className="p-5">
        <div className="flex items-center gap-2">
          <img src="/aritool-logo.png" alt="" className="size-[22px] rounded-md" />
          <span style={{ color: C.text, fontWeight: 700, fontSize: 14 }}>AriTool</span>
          <span style={{ color: C.faint, fontSize: 12 }}>© 2026</span>
        </div>
        <div className="mt-3" style={{ color: C.muted, fontSize: 12 }}>Términos · Privacidad</div>
      </div>
    </footer>
  )
}

export function MenuMobile({ datos, onClose }: { datos: Precios | null; onClose: () => void }) {
  const { pais, setPais } = usePais()
  const r = useRelease()
  const [paisOpen, setPaisOpen] = useState(false)
  const nDisp = datos ? datos.herramientas.filter((h) => h.disponible).length : 0
  const paisTxt = datos ? `${datos.pais.nombre} · precios en ${nombreMoneda(datos.pais.moneda)}` : "País"
  const opciones = [
    { t: "Alquiler de herramientas", s: datos ? `${nDisp} herramientas` : "", to: RUTAS.alquiler },
    { t: "Servicios", s: "Xiaomi FRP · Cuenta MI", to: RUTAS.servicios },
    { t: "App AriTool", s: "Security Plugin y AntiCrack", to: RUTAS.app },
    { t: "Novedades", s: `versión ${r.version}`, to: RUTAS.novedades },
  ]
  return (
    <div className="fixed inset-0 z-50 flex flex-col lg:hidden" style={{ background: C.page }}>
      <div className="flex h-[57px] items-center justify-between px-5" style={{ borderBottom: `1px solid ${C.border}` }}>
        <div className="flex items-center gap-2"><img src="/aritool-logo.png" alt="" className="size-7 rounded-lg" /><span style={{ color: C.title, fontWeight: 700, fontSize: 17 }}>AriTool</span></div>
        <button type="button" aria-label="Cerrar" onClick={onClose} className="p-1"><X className="size-[22px]" style={{ color: C.muted2 }} /></button>
      </div>
      <nav className="flex flex-col px-5 pt-2">
        {opciones.map((o) => (
          <Link key={o.t} to={o.to} onClick={onClose} className="flex items-center justify-between" style={{ height: 72, borderBottom: `1px solid ${C.border}` }}>
            <span className="flex flex-col">
              <span style={{ color: C.text, fontWeight: 600, fontSize: 17 }}>{o.t}</span>
              <span className="mt-0.5" style={{ color: C.muted, fontSize: 13 }}>{o.s}</span>
            </span>
            <ChevronRight className="size-[18px]" style={{ color: C.muted }} />
          </Link>
        ))}
      </nav>
      <div className="flex flex-col gap-3 px-5 pb-6 pt-6">
        <div className="relative">
          <button type="button" onClick={() => setPaisOpen((v) => !v)} className="flex h-[43px] w-full items-center gap-2" style={{ border: `1px solid ${C.borderSoft}`, borderRadius: 10, padding: "0 12px" }}>
            <Flag code={pais.toLowerCase()} shape="rect" style={{ width: 18, height: 12 }} />
            <span style={{ color: C.muted2, fontWeight: 500, fontSize: 14 }}>{paisTxt}</span>
            <span className="flex-1" />
            <ChevronDown className="size-4" style={{ color: C.muted }} />
          </button>
          {paisOpen ? (
            <div className="absolute bottom-[48px] left-0 z-50 max-h-64 w-full overflow-auto rounded-xl py-1" style={{ border: `1px solid ${C.border}`, background: C.card }}>
              {paisesDisponibles(datos).map((p) => (
                <button key={p.codigo} type="button" onClick={() => { setPais(p.codigo); setPaisOpen(false) }} className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-white/5" style={{ color: pais === p.codigo ? C.text : C.muted2, fontSize: 14 }}>
                  <Flag code={p.codigo.toLowerCase()} shape="rect" style={{ width: 18, height: 12 }} />{p.nombre}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <Link to={RUTAS.cuenta} onClick={onClose} className="flex h-11 items-center justify-center gap-2" style={{ background: C.cardAlt, border: `1.5px solid ${C.blue}`, borderRadius: 10 }}>
          <LogIn className="size-[16px]" style={{ color: C.text }} /><span style={{ color: C.text, fontWeight: 600, fontSize: 14 }}>Ingresar</span>
        </Link>
        <a href={datos?.soporte.whatsapp ?? WA} target="_blank" rel="noreferrer" className="flex items-center gap-3" style={{ background: C.waBg, border: `1px solid ${C.waBorder}`, borderRadius: 12, padding: 12 }}>
          <span className="flex size-9 items-center justify-center rounded-full" style={{ background: C.waGreen }}><IconoWA className="size-[21px]" style={{ color: "#fff" }} /></span>
          <span className="flex flex-col"><span style={{ color: "#86efac", fontWeight: 500, fontSize: 12 }}>Soporte por WhatsApp</span><span style={{ color: C.title, fontWeight: 700, fontSize: 17 }}>+51 935 186 037</span></span>
        </a>
      </div>
    </div>
  )
}
