/**
 * Buscador de la web AriTool — computadora (W4 1075:1787 con resultados, W5 1075:20723 sin resultados)
 * y celular (W6 1064:25794), aprobados por Peter 4-nov.
 *
 * Busca en el catálogo EN VIVO (lib/buscador sobre usePrecios), nunca en una lista fija. Regla W8 #4:
 * máximo 6 resultados, Enter abre el primero, Esc cierra, sin resultados ofrece WhatsApp.
 * Las tarjetas no se abren (regla #5): "abrir" un resultado lleva a donde está en la web.
 */
import { Search, X } from "lucide-react"
import { useEffect, useId, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Link, useNavigate } from "react-router-dom"

import { C, IconoWA, LogoAriCaja, LogoTool, RUTAS, WA } from "@/components/aritool/chrome"
import { usePrecios } from "@/hooks/use-precios"
import { buscar, type Resultado } from "@/lib/buscador"
import { formatearPrecio } from "@/lib/precios"

const AYUDA = "Buscá: Unlock, FRP, Cuenta MI…"
// Tope de lo que se puede escribir: alcanza para cualquier búsqueda y acota el mensaje de WhatsApp.
const MAX_TEXTO = 60
// Atajos del celular (W6). Solo se muestran los que hoy encuentran algo en el catálogo.
const SUGERENCIAS = ["FRP Xiaomi", "Cuenta MI", "DFT Pro", "Security Plugin"]
const ICONO_SERVICIO: Record<string, string> = { xiaomi_frp: "/brand/xiaomi.png", cuenta_mi: "/brand/xiaomi.png" }

// Sección + tarjeta: "/#alquiler/unlock_tool" o "/servicios#servicios/xiaomi_frp" (lo resuelve useAncla).
function destino(r: Resultado): string {
  if (r.tipo === "app") return RUTAS.app
  if (r.tipo === "herramienta") return `${RUTAS.alquiler}/${r.clave}`
  return `${RUTAS.servicios}#servicios/${r.clave}`
}

function IconoResultado({ r, size }: { r: Resultado; size: number }) {
  if (r.tipo === "herramienta") return <LogoTool clave={r.clave} size={size} apagado={!r.disponible} />
  if (r.tipo === "app") return <LogoAriCaja lado={size} radio={Math.round(size / 4)} />
  const logo = ICONO_SERVICIO[r.clave]
  if (logo) return <img src={logo} alt="" className="shrink-0" style={{ width: size, height: size }} />
  return <span aria-hidden="true" className="shrink-0 rounded-md" style={{ width: size, height: size, background: C.border }} />
}

// Mismos estados que las tarjetas (W8): apagada → "Próximamente"; sin precio → "Precio en la app".
function Precio({ r }: { r: Resultado }) {
  if (!r.disponible) return <span className="shrink-0" style={{ color: C.faint, fontSize: 13 }}>Próximamente</span>
  if (r.precio == null) return <span className="shrink-0" style={{ color: C.muted, fontSize: 13 }}>Precio en la app</span>
  const texto = r.tipo === "app" ? `$${r.precio} por proceso` : formatearPrecio(r.precio, r.moneda)
  return <span className="shrink-0" style={{ color: C.green, fontWeight: 700, fontSize: 14, lineHeight: "17px" }}>{texto}</span>
}

function Fila({ r, id, activo, icono, onAbrir, onActivar }: { r: Resultado; id: string; activo: boolean; icono: number; onAbrir: () => void; onActivar?: () => void }) {
  return (
    <Link id={id} role="option" aria-selected={activo} to={destino(r)} onClick={onAbrir} onMouseEnter={onActivar} className="flex items-center gap-3 rounded-lg" style={{ padding: "9px 14px", background: activo ? C.iconBg : "transparent" }}>
      <IconoResultado r={r} size={icono} />
      <span className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="truncate" style={{ color: r.disponible ? C.text : C.muted, fontWeight: 600, fontSize: 14, lineHeight: "17px" }}>{r.nombre}</span>
        <span className="truncate" style={{ color: C.muted, fontSize: 12, lineHeight: "15px" }}>{r.detalle}</span>
      </span>
      <Precio r={r} />
    </Link>
  )
}

function FilaCargando({ icono }: { icono: number }) {
  return (
    <div className="flex items-center gap-3" style={{ padding: "9px 14px", height: 51 }}>
      <span className="shrink-0 animate-pulse rounded-full" style={{ width: icono, height: icono, background: C.border }} />
      <span className="flex flex-1 flex-col gap-1.5">
        <span className="h-3 w-28 animate-pulse rounded" style={{ background: C.border }} />
        <span className="h-2.5 w-20 animate-pulse rounded" style={{ background: C.border }} />
      </span>
    </div>
  )
}

function enlaceWhatsApp(base: string, texto: string): string {
  const mensaje = `Hola, necesito ayuda con AriTool. Busco: ${Array.from(texto).slice(0, MAX_TEXTO).join("")}`
  return `${base}${base.includes("?") ? "&" : "?"}text=${encodeURIComponent(mensaje)}`
}

function SinResultados({ texto, whatsapp, sombra }: { texto: string; whatsapp: string; sombra?: boolean }) {
  return (
    <div className="flex flex-col items-start gap-2.5 rounded-xl" style={{ background: C.cardAlt, border: `1px solid ${C.borderAlt}`, padding: 18, boxShadow: sombra ? "0 12px 16px rgba(0,0,0,0.5)" : undefined }}>
      <p className="max-w-full break-words" style={{ color: C.text, fontWeight: 600, fontSize: 15, lineHeight: "18px" }}>Todavía no tenemos "{texto}".</p>
      <p style={{ color: C.muted2, fontSize: 13, lineHeight: "16px" }}>Escribinos y te decimos si lo podemos hacer. Probá también con: Unlock, FRP, Cuenta MI.</p>
      <a href={enlaceWhatsApp(whatsapp, texto)} target="_blank" rel="noreferrer" className="flex items-center gap-2" style={{ border: `1px solid ${C.borderAlt}`, borderRadius: 9, padding: "10px 16px" }}>
        <IconoWA className="size-[18px]" style={{ color: C.waGreen }} />
        <span style={{ color: C.text, fontWeight: 600, fontSize: 14, lineHeight: "17px" }}>Consultar por WhatsApp</span>
      </a>
    </div>
  )
}

function NoSePudoLeer({ onReintentar, sombra }: { onReintentar: () => void; sombra?: boolean }) {
  return (
    <div className="flex flex-col items-start gap-2.5 rounded-xl" style={{ background: C.cardAlt, border: `1px solid ${C.borderAlt}`, padding: 18, boxShadow: sombra ? "0 12px 16px rgba(0,0,0,0.5)" : undefined }}>
      <p style={{ color: C.muted2, fontSize: 13, lineHeight: "16px" }}>No pudimos cargar las herramientas ahora mismo.</p>
      <button type="button" onClick={onReintentar} style={{ color: C.link, fontWeight: 500, fontSize: 14 }}>Reintentar</button>
    </div>
  )
}

// ======================= COMPUTADORA (W4 / W5) =======================
export function BuscadorCompu({ inicial = "", className = "" }: { inicial?: string; className?: string }) {
  const { cargando, error, datos, refrescar } = usePrecios()
  const navigate = useNavigate()
  const [texto, setTexto] = useState(inicial.slice(0, MAX_TEXTO))
  const [abierto, setAbierto] = useState(Boolean(inicial))
  const [enfocado, setEnfocado] = useState(false)
  const [activo, setActivo] = useState(0)
  const caja = useRef<HTMLDivElement>(null)
  const campo = useRef<HTMLInputElement>(null)
  const idLista = useId()
  const consulta = texto.trim()
  const resultados = useMemo(() => buscar(datos, consulta), [datos, consulta])
  const mostrar = abierto && consulta !== ""

  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent) => {
      if (!caja.current?.contains(e.target as Node)) setAbierto(false)
    }
    document.addEventListener("mousedown", fuera)
    return () => document.removeEventListener("mousedown", fuera)
  }, [abierto])

  const cerrar = () => {
    setTexto("")
    setAbierto(false)
    setActivo(0)
  }
  const teclas = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      cerrar()
      campo.current?.blur()
    } else if (e.key === "Enter") {
      const r = resultados[activo] ?? resultados[0]
      if (!mostrar || !r) return
      e.preventDefault()
      cerrar()
      campo.current?.blur()
      navigate(destino(r))
    } else if ((e.key === "ArrowDown" || e.key === "ArrowUp") && resultados.length) {
      e.preventDefault()
      setAbierto(true)
      setActivo((i) => (i + (e.key === "ArrowDown" ? 1 : resultados.length - 1)) % resultados.length)
    }
  }

  return (
    <div ref={caja} className={`relative ${className}`}>
      <div className="flex h-[54px] items-center gap-3" style={{ background: C.cardAlt, border: `1px solid ${enfocado || consulta ? C.blue : C.borderAlt}`, borderRadius: 12, padding: "0 18px" }}>
        <Search size={20} className="shrink-0" style={{ color: C.muted }} />
        <input
          ref={campo}
          type="text"
          role="combobox"
          aria-label="Buscar herramientas y servicios"
          aria-expanded={mostrar}
          aria-controls={idLista}
          aria-autocomplete="list"
          aria-activedescendant={mostrar && resultados.length ? `${idLista}-${activo}` : undefined}
          autoComplete="off"
          spellCheck={false}
          maxLength={MAX_TEXTO}
          placeholder={AYUDA}
          value={texto}
          onChange={(e) => { setTexto(e.target.value); setAbierto(true); setActivo(0) }}
          onFocus={() => { setEnfocado(true); setAbierto(true) }}
          onClick={() => setAbierto(true)}
          onBlur={() => setEnfocado(false)}
          onKeyDown={teclas}
          className="min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-[#5b6475]"
          style={{ color: C.title }}
        />
        {texto ? (
          <button type="button" aria-label="Borrar" onClick={() => { cerrar(); campo.current?.focus() }} className="shrink-0">
            <X size={18} style={{ color: C.muted }} />
          </button>
        ) : null}
      </div>
      {mostrar ? (
        <div id={idLista} role="listbox" aria-label="Resultados" className="absolute inset-x-0 z-30" style={{ top: "calc(100% + 3px)" }}>
          {resultados.length || (cargando && !datos) ? (
            <div className="flex flex-col gap-0.5 rounded-xl" style={{ background: C.cardAlt, border: `1px solid ${C.borderAlt}`, padding: 6, boxShadow: "0 12px 16px rgba(0,0,0,0.5)" }}>
              {resultados.length
                ? resultados.map((r, i) => <Fila key={r.clave} r={r} id={`${idLista}-${i}`} activo={i === activo} icono={30} onAbrir={cerrar} onActivar={() => setActivo(i)} />)
                : [0, 1].map((i) => <FilaCargando key={i} icono={30} />)}
            </div>
          ) : error && !datos ? (
            <NoSePudoLeer onReintentar={refrescar} sombra />
          ) : (
            <SinResultados texto={consulta} whatsapp={datos?.soporte.whatsapp ?? WA} sombra />
          )}
        </div>
      ) : null}
    </div>
  )
}

// ======================= CELULAR (W6) =======================
export function BuscadorCelular({ inicial = "", onClose }: { inicial?: string; onClose: () => void }) {
  const { cargando, error, datos, refrescar } = usePrecios()
  const navigate = useNavigate()
  const [texto, setTexto] = useState(inicial.slice(0, MAX_TEXTO))
  const campo = useRef<HTMLInputElement>(null)
  const idLista = useId()
  const consulta = texto.trim()
  const resultados = useMemo(() => buscar(datos, consulta), [datos, consulta])
  const sugerencias = useMemo(() => SUGERENCIAS.filter((s) => buscar(datos, s).length > 0), [datos])

  useEffect(() => {
    campo.current?.focus()
    const previo = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", tecla)
    return () => {
      document.body.style.overflow = previo
      document.removeEventListener("keydown", tecla)
    }
  }, [onClose])

  const abrirPrimero = (e: React.FormEvent) => {
    e.preventDefault()
    if (!resultados[0]) return
    onClose()
    navigate(destino(resultados[0]))
  }

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Buscar" className="fixed inset-0 z-[60] flex flex-col overflow-y-auto lg:hidden" style={{ background: C.page, color: C.text, fontFamily: "Inter, system-ui, sans-serif", lineHeight: 1.2 }}>
      <form onSubmit={abrirPrimero} className="flex shrink-0 items-center gap-2.5" style={{ padding: "12px 21px 12px 16px" }}>
        <div className="flex h-11 min-w-0 flex-1 items-center gap-2.5" style={{ background: C.cardAlt, border: `1px solid ${C.blue}`, borderRadius: 10, padding: "0 12px" }}>
          <Search size={18} className="shrink-0" style={{ color: C.muted }} />
          {/* 15 px como en el Figma; en iPhone 16 px para que Safari no haga zoom al escribir. */}
          <input
            ref={campo}
            type="text"
            role="combobox"
            aria-label="Buscar herramientas y servicios"
            aria-expanded={resultados.length > 0}
            aria-controls={idLista}
            aria-autocomplete="list"
            enterKeyHint="search"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={MAX_TEXTO}
            placeholder={AYUDA}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-[#5b6475] supports-[-webkit-touch-callout:none]:text-[16px]"
            style={{ color: C.title }}
          />
          {texto ? (
            <button type="button" aria-label="Borrar" onClick={() => { setTexto(""); campo.current?.focus() }} className="shrink-0">
              <X size={16} style={{ color: C.muted }} />
            </button>
          ) : null}
        </div>
        <button type="button" onClick={onClose} className="shrink-0" style={{ color: C.link, fontWeight: 500, fontSize: 14 }}>Cerrar</button>
      </form>
      {consulta === "" ? null : resultados.length || (cargando && !datos) ? (
        <div id={idLista} role="listbox" aria-label="Resultados" className="flex shrink-0 flex-col gap-0.5 px-2">
          {resultados.length
            ? resultados.map((r, i) => <Fila key={r.clave} r={r} id={`${idLista}-${i}`} activo={i === 0} icono={32} onAbrir={onClose} />)
            : [0, 1].map((i) => <FilaCargando key={i} icono={32} />)}
        </div>
      ) : (
        <div className="shrink-0 px-4">
          {error && !datos ? <NoSePudoLeer onReintentar={refrescar} /> : <SinResultados texto={consulta} whatsapp={datos?.soporte.whatsapp ?? WA} />}
        </div>
      )}
      {sugerencias.length ? (
        <div className="flex shrink-0 flex-col items-start gap-2.5" style={{ padding: "18px 22px 22px" }}>
          <p style={{ color: C.muted, fontWeight: 700, fontSize: 11, lineHeight: "13px", letterSpacing: "1.1px" }}>LO MÁS BUSCADO</p>
          {sugerencias.map((s) => (
            <button key={s} type="button" onClick={() => { setTexto(s); campo.current?.focus() }} className="flex items-center gap-2.5 py-1">
              <Search size={14} style={{ color: C.faint }} />
              <span style={{ color: C.muted2, fontSize: 14, lineHeight: "17px" }}>{s}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>,
    document.body,
  )
}
