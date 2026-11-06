/**
 * Servicios v3 (W17) — página propia con buscador grande, filtros y las MISMAS tarjetas chicas
 * del Inicio W1/W2. Compu 1197:2 · celular 1198:4 · estados 1199:2.
 *
 * Datos EN VIVO de `sop_publico.precios` (usePrecios): nunca se inventa un precio. Si no se
 * puede leer, la tarjeta dice "Precio en la app" y la página ofrece reintentar. El contador
 * "N disponibles" y los filtros se recalculan al instante.
 */
import { ArrowRight, Copy, Download, Monitor, Search } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"

import { C, Cont, FranjaSoporte, HeaderDesktop, HeaderMobile, IconoWA, LogoAriCaja, LogoTool, MenuMobile, PieDesktop, PieMobile, RUTAS, WA, useAncla } from "@/components/aritool/chrome"
import { descargaDe } from "@/data/descargas"
import { usePrecios } from "@/hooks/use-precios"
import { APP_ARITOOL, NOMBRE_WEB, normalizar } from "@/lib/buscador"
import { formatearPrecio, type HerramientaPrecio, type Moneda, type Precios, type ServicioPrecio } from "@/lib/precios"
import { useSeo } from "@/lib/seo"

type Filtro = "todo" | "alquiler" | "servicios"
type ServicioVista = { clave: string; nombre: string; precio: string; nota: string; palabras: string[]; disponible: boolean }

const SERVICIOS_FIJOS = ["xiaomi_frp", "cuenta_mi"] as const
// Mismo orden que las tarjetas del Inicio/Figma W17: primero las herramientas disponibles y
// después las que están en mantenimiento o próximamente.
const ORDEN_HERRAMIENTAS = new Map(["unlock_tool", "dft_pro", "tsm_tool_pro", "android_multi_tool", "ts_tool", "androidwin_tool", "tr_tools_pro", "pandora", "tfm_tool_pro"].map((clave, i) => [clave, i]))
const FILTROS: Array<{ id: Filtro; texto: string }> = [
  { id: "todo", texto: "Todo" },
  { id: "alquiler", texto: "Alquiler" },
  { id: "servicios", texto: "Servicios" },
]

function nombreServicio(s: ServicioPrecio | null, clave: string, fallback: string) {
  return NOMBRE_WEB[clave] ?? s?.nombre ?? fallback
}

/** Precio local; si el país no tiene tasa, el precio de referencia en USDT. Nunca inventa. */
function precioDe(local: number | null | undefined, usd: number | null | undefined, moneda: Moneda | undefined, error: boolean) {
  if (error) return "Precio en la app"
  if (local != null) return formatearPrecio(local, moneda ?? "usdt")
  if (usd != null) return formatearPrecio(usd, "usdt")
  return "Precio en la app"
}

function precioApp(app: Precios["app"] | undefined, error: boolean) {
  if (error || app?.credito_usd == null) return "Precio en la app"
  return `$${app.credito_usd} por proceso`
}

function coincide(consulta: string, textos: Array<string | null | undefined>) {
  const q = normalizar(consulta)
  if (!q) return true
  const texto = normalizar(textos.filter(Boolean).join(" "))
  return q.split(" ").every((parte) => texto.includes(parte))
}

function LogoDe({ clave, size }: { clave: string; size: number }) {
  if (clave === APP_ARITOOL.clave) return <LogoAriCaja lado={size} radio={size > 40 ? 13 : 10} />
  if (clave === "xiaomi_frp" || clave === "cuenta_mi") return <img src="/brand/xiaomi.png" alt="" className="shrink-0 rounded-[10px]" style={{ width: size, height: size }} />
  return <LogoTool clave={clave} size={size} />
}

function TarjetaServicio({ s, movil, indice }: { s: ServicioVista; movil: boolean; indice: number }) {
  const lado = movil ? 40 : 52
  return (
    <Link to={RUTAS.app} data-ancla={s.clave} className="serv-card flex items-center rounded-xl" style={{ gap: movil ? 12 : 14, padding: movil ? 12 : 16, border: `1px solid ${C.border}`, background: C.card, animationDelay: `${Math.min(indice, 8) * 35}ms` }}>
      <LogoDe clave={s.clave} size={lado} />
      <span className="flex min-w-0 flex-col gap-1">
        <span className="truncate" style={{ color: s.disponible ? C.text : C.muted, fontWeight: 600, fontSize: movil ? 14 : 16, lineHeight: movil ? "17px" : "19px" }}>{s.nombre}</span>
        <span className="flex items-baseline gap-2 whitespace-nowrap">
          <span style={{ color: s.disponible ? C.green : C.faint, fontWeight: 700, fontSize: movil ? 14 : 16, lineHeight: movil ? "17px" : "19px" }}>{s.precio}</span>
          <span style={{ color: C.muted, fontSize: movil ? 12 : 13, lineHeight: movil ? "15px" : "16px" }}>{movil ? "remoto" : s.nota}</span>
        </span>
      </span>
    </Link>
  )
}

function TarjetaHerramienta({ h, movil, indice }: { h: HerramientaPrecio; movil: boolean; indice: number }) {
  const desc = h.disponible ? descargaDe(h.clave) : null
  const estilo = { border: `1px solid ${C.border}`, background: C.card, animationDelay: `${Math.min(indice, 8) * 35}ms` } as const
  const clase = "serv-card rounded-xl"
  if (movil) {
    // En celular la tarjeta es vertical, como las del Inicio W2: logo arriba y los datos debajo.
    const cuerpo = (
      <div className="flex min-w-0 flex-col p-3" style={{ minHeight: h.disponible ? 141 : 114 }}>
        <LogoTool clave={h.clave} size={40} apagado={!h.disponible} />
        <div className="mt-2 truncate" style={{ color: h.disponible ? C.text : C.muted, fontWeight: 600, fontSize: 14, lineHeight: "17px" }}>{h.nombre}</div>
        {h.disponible ? (
          <div className="mt-2 flex items-baseline gap-1.5 whitespace-nowrap">
            <span style={{ color: C.green, fontWeight: 700, fontSize: 14, lineHeight: "17px" }}>{precioDe(h.precio_local, h.precio_usdt, h.moneda, false)}</span>
            <span style={{ color: C.muted, fontSize: 12, lineHeight: "15px" }}>{h.horas} h</span>
          </div>
        ) : (
          <div className="mt-2" style={{ color: C.faint, fontSize: 12, lineHeight: "15px" }}>{h.aviso || "Próximamente"}</div>
        )}
        {desc ? <span className="mt-2 inline-flex items-center gap-[5px] whitespace-nowrap" style={{ color: C.link, fontWeight: 500, fontSize: 12, lineHeight: "15px" }}><Download className="size-[12px]" strokeWidth={2} />Descargar programa</span> : null}
      </div>
    )
    if (desc) return <a href={desc.pagina} target="_blank" rel="noreferrer" data-ancla={h.clave} className={clase} style={estilo}>{cuerpo}</a>
    return <div data-ancla={h.clave} className={clase} style={estilo}>{cuerpo}</div>
  }
  const contenido = (
    <div className="flex min-w-0 items-center" style={{ gap: 14 }}>
      <LogoTool clave={h.clave} size={52} apagado={!h.disponible} />
      <div className="flex min-w-0 flex-col" style={{ gap: 4 }}>
        <div className="truncate" style={{ color: h.disponible ? C.text : C.muted, fontWeight: 600, fontSize: 16, lineHeight: "19px" }}>{h.nombre}</div>
        {h.disponible ? (
          <div className="flex items-baseline gap-2 whitespace-nowrap">
            <span style={{ color: C.green, fontWeight: 700, fontSize: 16, lineHeight: "19px" }}>{precioDe(h.precio_local, h.precio_usdt, h.moneda, false)}</span>
            <span style={{ color: C.muted, fontSize: 13, lineHeight: "16px" }}>{h.horas} h</span>
          </div>
        ) : (
          <div style={{ color: C.faint, fontSize: 13, lineHeight: "16px" }}>{h.aviso || "Próximamente"}</div>
        )}
        {desc ? (
          <span className="inline-flex items-center gap-[5px] whitespace-nowrap" style={{ color: C.link, fontWeight: 500, fontSize: 13, lineHeight: "16px" }}>
            <Download className="size-[13px]" strokeWidth={2} />Descargar programa
          </span>
        ) : null}
      </div>
    </div>
  )
  const claseDesktop = "serv-card flex items-center rounded-xl"
  const estiloDesktop = { ...estilo, padding: 17, minHeight: 98 } as const
  if (desc) return <a href={desc.pagina} target="_blank" rel="noreferrer" data-ancla={h.clave} className={claseDesktop} style={estiloDesktop}>{contenido}</a>
  return <div data-ancla={h.clave} className={claseDesktop} style={estiloDesktop}>{contenido}</div>
}

function TarjetaProximamente({ items }: { items: HerramientaPrecio[] }) {
  return (
    <div data-ancla={items.map((h) => h.clave).join(" ")} className="serv-card flex min-w-0 flex-col rounded-xl p-3" style={{ border: `1px solid ${C.border}`, background: C.card, minHeight: 114 }}>
      <div className="flex">
        {items.slice(0, 3).map((h, i) => (
          <span key={h.clave} style={{ marginLeft: i === 0 ? 0 : -10 }}><LogoTool clave={h.clave} size={40} apagado /></span>
        ))}
      </div>
      <div className="mt-2" style={{ color: C.muted, fontWeight: 600, fontSize: 14, lineHeight: "17px" }}>{items.length} más</div>
      <div className="mt-2" style={{ color: C.faint, fontSize: 12, lineHeight: "15px" }}>Próximamente</div>
    </div>
  )
}

function Skeleton({ movil }: { movil: boolean }) {
  return (
    <div className="serv-card flex items-center rounded-xl" style={{ gap: movil ? 12 : 14, padding: movil ? 12 : 16, border: `1px solid ${C.border}`, background: C.card }}>
      <span className="shrink-0 animate-pulse rounded-full" style={{ width: movil ? 40 : 52, height: movil ? 40 : 52, background: C.border }} />
      <span className="flex flex-1 flex-col gap-2">
        <span className="block animate-pulse rounded" style={{ width: movil ? 120 : 150, height: movil ? 14 : 16, background: C.border }} />
        <span className="block animate-pulse rounded" style={{ width: movil ? 90 : 120, height: movil ? 12 : 14, background: C.border }} />
      </span>
    </div>
  )
}

function TituloSeccion({ texto, derecha }: { texto: string; derecha?: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="uppercase whitespace-nowrap" style={{ color: C.muted, fontWeight: 700, fontSize: 12, lineHeight: "15px", letterSpacing: "1.2px" }}>{texto}</span>
      <span className="flex-1" style={{ height: 1, background: C.border }} />
      {derecha ? <span className="whitespace-nowrap" style={{ color: C.faint, fontSize: 13, lineHeight: "16px" }}>{derecha}</span> : null}
    </div>
  )
}

function CampoBusqueda({ valor, onCambio, movil }: { valor: string; onCambio: (v: string) => void; movil: boolean }) {
  return (
    <label className="flex w-full items-center" style={{ height: movil ? 54 : 68, gap: movil ? 10 : 14, background: C.card, border: `1px solid ${C.borderAlt}`, borderRadius: movil ? 10 : 12, padding: movil ? "0 17px" : "0 23px" }}>
      <Search className={movil ? "size-5" : "size-6"} style={{ color: C.muted }} />
      <input value={valor} onChange={(e) => onCambio(e.target.value)} placeholder="Buscá: Unlock, FRP, Cuenta MI, MDM…" aria-label="Buscar servicios y herramientas" className="min-w-0 flex-1 bg-transparent outline-none" style={{ color: C.text, fontSize: movil ? 15 : 17, lineHeight: movil ? "18px" : "22px" }} />
    </label>
  )
}

function Filtros({ filtro, onFiltro, disponibles, movil }: { filtro: Filtro; onFiltro: (f: Filtro) => void; disponibles: number; movil: boolean }) {
  return (
    <div className="flex items-center gap-2">
      {FILTROS.map((f) => (
        <button key={f.id} type="button" onClick={() => onFiltro(f.id)} className="whitespace-nowrap transition-colors" style={{ height: 35, borderRadius: 9, padding: "0 16px", background: filtro === f.id ? C.blue : C.card, border: `1px solid ${filtro === f.id ? C.blue : C.border}`, color: filtro === f.id ? "#fff" : C.muted2, fontWeight: 600, fontSize: 14, lineHeight: "17px" }}>{f.texto}</button>
      ))}
      <span className="flex-1" />
      {!movil ? <span className="whitespace-nowrap" style={{ color: C.faint, fontSize: 13, lineHeight: "16px" }}>{disponibles} disponibles</span> : null}
    </div>
  )
}

function SinResultados({ consulta, onSugerencia }: { consulta: string; onSugerencia: (v: string) => void }) {
  return (
    <div className="rounded-2xl p-6" style={{ background: C.card, border: `1px solid ${C.border}` }}>
      <p style={{ color: C.title, fontWeight: 700, fontSize: 20, lineHeight: "25px" }}>Todavía no tenemos “{consulta}”.</p>
      <p className="mt-2" style={{ color: C.muted2, fontSize: 14, lineHeight: "20px" }}>Escribinos y te decimos si lo podemos hacer. Probá también con: {["Unlock", "FRP", "Cuenta MI"].map((s, i) => <span key={s}>{i ? ", " : ""}<button type="button" onClick={() => onSugerencia(s)} style={{ color: C.link }}>{s}</button></span>)}.</p>
      <a href={WA} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 rounded-lg" style={{ background: C.waBg, border: `1px solid ${C.waBorder}`, padding: "9px 12px", color: C.waText, fontWeight: 700, fontSize: 13 }}><IconoWA className="size-[15px]" />Consultar por WhatsApp</a>
    </div>
  )
}

function EnTuPC({ whatsapp }: { whatsapp: string }) {
  const [copiado, setCopiado] = useState(false)
  return (
    <section className="px-5 pb-6">
      <div className="rounded-2xl p-4" style={{ background: C.cardAlt, border: `1px solid ${C.pcBorder}` }}>
        <div className="flex items-center gap-2.5"><Monitor className="size-5" style={{ color: C.link }} /><span style={{ color: C.title, fontWeight: 700, fontSize: 16, lineHeight: "19px" }}>AriTool se usa en tu PC</span></div>
        <p className="mt-2.5" style={{ color: C.muted2, fontSize: 13, lineHeight: "18px" }}>Mandate el enlace y abrilo en tu computadora con Windows.</p>
        <a href={whatsapp} target="_blank" rel="noreferrer" className="mt-2.5 flex h-[42px] items-center justify-center gap-2 rounded-lg text-white" style={{ background: C.blue }}><IconoWA className="size-[18px]" style={{ color: "#fff" }} /><span style={{ fontWeight: 600, fontSize: 14 }}>Enviarme el enlace por WhatsApp</span></a>
        <button type="button" onClick={() => { void navigator.clipboard?.writeText(`${window.location.origin}${RUTAS.descargar}`).then(() => { setCopiado(true); window.setTimeout(() => setCopiado(false), 1500) }).catch(() => {}) }} className="mt-2.5 flex h-[43px] w-full items-center justify-center gap-2 rounded-lg" style={{ border: `1px solid ${C.borderAlt}`, color: C.text }}><Copy className="size-4" /><span style={{ fontWeight: 600, fontSize: 14 }}>{copiado ? "Enlace copiado" : "Copiar enlace"}</span></button>
      </div>
    </section>
  )
}

export function ServiciosPage() {
  useSeo({ titulo: "Servicios | AriTool", descripcion: "Alquilá herramientas por horas o pedí un servicio remoto: Xiaomi Reset + FRP, Cuenta MI y AriTool. Precios en vivo y soporte por WhatsApp.", ruta: "/servicios" })
  const { cargando, error, datos, refrescar } = usePrecios()
  const [consulta, setConsulta] = useState(() => new URLSearchParams(window.location.search).get("q") ?? "")
  const [filtro, setFiltro] = useState<Filtro>("todo")
  const [menuAbierto, setMenuAbierto] = useState(false)
  const [ultimo, setUltimo] = useState<Precios | null>(null)
  useAncla()

  useEffect(() => {
    if (datos) setUltimo(datos)
  }, [datos])
  useEffect(() => {
    const prev = document.body.style.background
    document.body.style.background = C.page
    return () => { document.body.style.background = prev }
  }, [])

  const vista = datos ?? ultimo
  const errorPrecio = error && !!vista
  const whatsapp = vista?.soporte.whatsapp ?? WA
  const moneda = vista?.pais.moneda
  const usaUSDT = moneda === "usd" || moneda === "usdt"
  const servicio = (clave: string) => vista?.servicios.find((s) => s.clave === clave) ?? null

  const servicios = useMemo<ServicioVista[]>(() => {
    const filas: ServicioVista[] = SERVICIOS_FIJOS.map((clave) => {
      const s = servicio(clave)
      return {
        clave,
        nombre: nombreServicio(s, clave, clave === "xiaomi_frp" ? "Xiaomi Reset + FRP" : "Cuenta MI"),
        precio: precioDe(s?.precio_local, s?.precio_usd, s?.moneda, errorPrecio),
        nota: "Remoto · desde la app",
        palabras: [s?.nombre ?? "", ...(s?.palabras_clave ?? [])],
        disponible: s?.disponible !== false,
      }
    })
    filas.push({
      clave: APP_ARITOOL.clave,
      nombre: APP_ARITOOL.nombre,
      precio: precioApp(vista?.app, errorPrecio),
      nota: APP_ARITOOL.detalle,
      palabras: [APP_ARITOOL.nombre, APP_ARITOOL.detalle],
      disponible: true,
    })
    return filas
  }, [vista, errorPrecio])

  const herramientas = useMemo<HerramientaPrecio[]>(() => {
    if (!vista || errorPrecio) return []
    const orden = (h: HerramientaPrecio) => ORDEN_HERRAMIENTAS.get(h.clave) ?? 999
    return [...vista.herramientas].sort((a, b) => orden(a) - orden(b) || Number(b.disponible) - Number(a.disponible))
  }, [vista, errorPrecio])

  const serviciosVisibles = useMemo(() => {
    if (filtro === "alquiler") return []
    return servicios.filter((s) => coincide(consulta, [s.nombre, ...s.palabras]))
  }, [servicios, consulta, filtro])

  const herramientasVisibles = useMemo(() => {
    if (filtro === "servicios") return []
    return herramientas.filter((h) => coincide(consulta, [h.nombre, ...(h.palabras_clave ?? [])]))
  }, [herramientas, consulta, filtro])

  const disponibles = useMemo(() => serviciosVisibles.filter((s) => s.disponible).length + herramientasVisibles.filter((h) => h.disponible).length, [serviciosVisibles, herramientasVisibles])
  const hayBusqueda = consulta.trim().length > 0
  const sinResultados = (hayBusqueda || filtro !== "todo") && serviciosVisibles.length === 0 && herramientasVisibles.length === 0
  const apagadas = herramientasVisibles.filter((h) => !h.disponible)
  const cargandoSinDatos = cargando && !vista

  return (
    <div className="min-h-screen overflow-x-hidden" style={{ background: C.page, color: C.text, fontFamily: "Inter, system-ui, sans-serif", lineHeight: "normal" }}>
      <div className="hidden lg:block">
        <HeaderDesktop datos={vista} active="Servicios" />
        <main>
          <Cont className="pb-12 pt-11">
            <h1 style={{ color: C.title, fontWeight: 700, fontSize: 41, lineHeight: 1 }}>Servicios</h1>
            <p className="mt-3" style={{ color: C.muted2, fontSize: 18, lineHeight: "22px" }}>Alquilá herramientas o pedí un servicio. Se paga y se usa en la app AriTool.</p>
            <div className="mt-6"><CampoBusqueda valor={consulta} onCambio={setConsulta} movil={false} /></div>
            <div className="mt-6"><Filtros filtro={filtro} onFiltro={setFiltro} disponibles={disponibles} movil={false} /></div>
            {usaUSDT ? <p className="mt-2 text-right" style={{ color: C.faint, fontSize: 12 }}>Precios en USDT</p> : null}

            {error && !vista ? (
              <div className="mt-6 rounded-xl p-5" style={{ background: C.card, border: `1px solid ${C.border}` }}>
                <p style={{ color: C.title, fontWeight: 700, fontSize: 15 }}>No pudimos leer los precios.</p>
                <p className="mt-1" style={{ color: C.muted, fontSize: 13 }}>Las tarjetas van a mostrar “Precio en la app”.</p>
                <button type="button" onClick={refrescar} className="mt-3 rounded-lg px-4 py-2 text-white" style={{ background: C.blue, fontSize: 13, fontWeight: 600 }}>Reintentar</button>
              </div>
            ) : null}

            {cargandoSinDatos ? (
              <>
                <section className="mt-6"><TituloSeccion texto="Servicios" /><div className="mt-[14px] grid grid-cols-3 gap-[14px]">{[0, 1, 2].map((i) => <Skeleton key={i} movil={false} />)}</div></section>
                <section className="mt-6"><TituloSeccion texto="Alquiler de herramientas" derecha="Precio por uso, en tu moneda" /><div className="mt-[14px] grid grid-cols-4 gap-[14px]">{[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <Skeleton key={i} movil={false} />)}</div></section>
              </>
            ) : (
              <>
                {serviciosVisibles.length ? <section className="mt-6"><TituloSeccion texto="Servicios" /><div className="mt-[14px] grid grid-cols-3 gap-[14px]">{serviciosVisibles.map((s, i) => <TarjetaServicio key={s.clave} s={s} movil={false} indice={i} />)}</div></section> : null}
                {herramientasVisibles.length ? <section className="mt-6"><TituloSeccion texto="Alquiler de herramientas" derecha="Precio por uso, en tu moneda" /><div className="mt-[14px] grid grid-cols-4 gap-[14px]">{herramientasVisibles.map((h, i) => <TarjetaHerramienta key={h.clave} h={h} movil={false} indice={i} />)}</div></section> : null}
                {sinResultados ? <div className="mt-6"><SinResultados consulta={consulta} onSugerencia={setConsulta} /></div> : null}
              </>
            )}

            <p className="mt-6 flex flex-wrap items-center gap-2" style={{ color: C.muted, fontSize: 14, lineHeight: "17px" }}>¿Otra marca o pedido especial? <a href={whatsapp} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2" style={{ color: C.link, fontWeight: 500 }}>Consultar por WhatsApp<ArrowRight className="size-[14px]" /></a></p>
          </Cont>
        </main>
        <PieDesktop />
      </div>

      <div className="lg:hidden">
        <HeaderMobile onMenu={() => setMenuAbierto(true)} />
        <FranjaSoporte datos={vista} />
        <main>
          <section className="px-5 pb-6 pt-6">
            <h1 style={{ color: C.title, fontWeight: 700, fontSize: 26, lineHeight: "31px" }}>Servicios</h1>
            <div className="mt-4"><CampoBusqueda valor={consulta} onCambio={setConsulta} movil /></div>
            <div className="mt-4"><Filtros filtro={filtro} onFiltro={setFiltro} disponibles={disponibles} movil /></div>
          </section>
          {error && !vista ? <section className="px-5 pb-4"><div className="rounded-xl p-4" style={{ background: C.card, border: `1px solid ${C.border}` }}><p style={{ color: C.title, fontWeight: 700, fontSize: 14 }}>No pudimos leer los precios.</p><p className="mt-1" style={{ color: C.muted, fontSize: 12 }}>Las tarjetas van a mostrar “Precio en la app”.</p><button type="button" onClick={refrescar} className="mt-3 rounded-lg px-4 py-2 text-white" style={{ background: C.blue, fontSize: 12, fontWeight: 600 }}>Reintentar</button></div></section> : null}
          {cargandoSinDatos ? (
            <>
              <section className="px-5 pb-6"><div className="flex items-center gap-3"><span className="uppercase" style={{ color: C.muted, fontWeight: 700, fontSize: 11, letterSpacing: "1.1px" }}>SERVICIOS</span><span className="flex-1" style={{ height: 1, background: C.border }} /></div><div className="mt-3 flex flex-col gap-2.5">{[0, 1, 2].map((i) => <Skeleton key={i} movil />)}</div></section>
              <section className="px-5 pb-6"><div className="flex items-center gap-3"><span className="uppercase" style={{ color: C.muted, fontWeight: 700, fontSize: 11, letterSpacing: "1.1px" }}>ALQUILER DE HERRAMIENTAS</span><span className="flex-1" style={{ height: 1, background: C.border }} /></div><div className="mt-3 grid grid-cols-2 gap-2.5">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} movil />)}</div></section>
            </>
          ) : (
            <>
              {serviciosVisibles.length ? <section className="px-5 pb-6"><div className="flex items-center gap-3"><span className="uppercase" style={{ color: C.muted, fontWeight: 700, fontSize: 11, letterSpacing: "1.1px" }}>SERVICIOS</span><span className="flex-1" style={{ height: 1, background: C.border }} /></div><div className="mt-3 flex flex-col gap-2.5">{serviciosVisibles.map((s, i) => <TarjetaServicio key={s.clave} s={s} movil indice={i} />)}</div></section> : null}
              {herramientasVisibles.length ? <section className="px-5 pb-6"><div className="flex items-center gap-3"><span className="uppercase" style={{ color: C.muted, fontWeight: 700, fontSize: 11, letterSpacing: "1.1px" }}>ALQUILER DE HERRAMIENTAS</span><span className="flex-1" style={{ height: 1, background: C.border }} /><span style={{ color: C.faint, fontSize: 11 }}>precio por uso</span></div><div className="mt-3 grid grid-cols-2 items-start gap-2.5">{herramientasVisibles.filter((h) => h.disponible).map((h, i) => <TarjetaHerramienta key={h.clave} h={h} movil indice={i} />)}{apagadas.length ? <TarjetaProximamente items={apagadas} /> : null}</div></section> : null}
              {sinResultados ? <div className="px-5 pb-6"><SinResultados consulta={consulta} onSugerencia={setConsulta} /></div> : null}
            </>
          )}
          <EnTuPC whatsapp={whatsapp} />
        </main>
        <PieMobile />
        {menuAbierto ? <MenuMobile datos={vista} onClose={() => setMenuAbierto(false)} /> : null}
      </div>
    </div>
  )
}
