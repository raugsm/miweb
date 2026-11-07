/**
 * W12b · Tu historial — compu (1135:2), aprobado por Peter 4-nov. En celular se adapta con la lista de W12m.
 * Todos los movimientos de la cuenta, de a 20 y del más nuevo al más viejo, con filtro por tipo y por período.
 *
 * PENDIENTE (espera OK de Peter): la función `cliente_historial` (supabase/functions/cliente_historial), que
 * es la que pagina. Mientras no esté en producción, esta página muestra los últimos 20 movimientos que ya
 * entrega `cliente_resumen` y filtra ahí mismo (sin "Cargar 20 más").
 */
import { ArrowLeft, ArrowRight, ChevronDown } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link, useNavigate } from "react-router-dom"

import { C, Cont, FranjaSoporte, HeaderDesktop, HeaderMobile, MenuMobile, PieDesktop, PieMobile, RUTAS, WA } from "@/components/aritool/chrome"
import { SinPerfil } from "@/components/aritool/perfil"
import { CabeceraHistorial, FilaCelular, FilaCompu, FilasCargandoCelular, FilasCargandoCompu, HistorialVacio, NoSePudo } from "@/components/aritool/historial"
import { usePrecios } from "@/hooks/use-precios"
import { NOMBRE_WEB } from "@/lib/buscador"
import { historialCliente, resumenCliente, type PaginaHistorial } from "@/lib/cuenta"
import { filasHistorial, filtrarHistorial, type FilaHistorial, type FiltroHistorial } from "@/lib/historial"
import { motivoRechazo } from "@/lib/sesion"
import { useSeo } from "@/lib/seo"
import { supabase } from "@/lib/supabase"

const FILTROS: [FiltroHistorial, string][] = [["todo", "Todo"], ["recargas", "Recargas"], ["usos", "Usos"], ["devoluciones", "Devoluciones"]]
/** Períodos del desplegable. `dias: null` = sin límite. */
const PERIODOS: { dias: number | null; texto: string }[] = [
  { dias: 7, texto: "Últimos 7 días" },
  { dias: 30, texto: "Últimos 30 días" },
  { dias: 90, texto: "Últimos 90 días" },
  { dias: null, texto: "Desde el inicio" },
]

type Datos = Pick<PaginaHistorial, "movimientos" | "trabajos"> & { siguiente: string | null; /** TEMPORAL: vino de `cliente_resumen`; se filtra acá. */ local: boolean }
type Carga = { estado: "cargando" } | { estado: "error" } | { estado: "sinPerfil" } | { estado: "listo"; datos: Datos }

type CuerpoProps = {
  carga: Carga
  filas: FilaHistorial[]
  filtro: FiltroHistorial
  dias: number | null
  cargandoMas: boolean
  alFiltrar: (f: FiltroHistorial) => void
  alPeriodo: (d: number | null) => void
  cargarMas: () => void
  reintentar: () => void
}

function Filtros({ filtro, alFiltrar, chico }: { filtro: FiltroHistorial; alFiltrar: (f: FiltroHistorial) => void; chico?: boolean }) {
  return (
    <div role="group" aria-label="Qué mostrar" className={`flex items-center gap-0.5 rounded-[10px] p-1 ${chico ? "w-full" : ""}`} style={{ background: C.cardAlt, border: `1px solid ${C.borderSoft}` }}>
      {FILTROS.map(([clave, texto]) => {
        const activo = clave === filtro
        return (
          <button key={clave} type="button" aria-pressed={activo} onClick={() => alFiltrar(clave)} className={`flex items-center justify-center rounded-lg py-2 ${chico ? "flex-auto px-2" : "px-[14px]"}`}
            style={{ background: activo ? "#1e3a8a" : "transparent", color: activo ? "#fff" : C.muted2, fontWeight: activo ? 600 : 500, fontSize: chico ? 13 : 14, lineHeight: chico ? "16px" : "17px" }}>
            {texto}
          </button>
        )
      })}
    </div>
  )
}

function Periodo({ dias, alPeriodo }: { dias: number | null; alPeriodo: (d: number | null) => void }) {
  // El desplegable del sistema va encima, invisible: así se abre como en cada celular y con el teclado.
  return (
    <label className="relative flex shrink-0 items-center gap-2" style={{ border: `1px solid ${C.borderAlt}`, borderRadius: 10, padding: "10px 12px 10px 14px" }}>
      <span style={{ color: "#d1d5db", fontWeight: 500, fontSize: 14, lineHeight: "17px" }}>{PERIODOS.find((p) => p.dias === dias)?.texto}</span>
      <ChevronDown className="size-4" style={{ color: C.muted }} />
      <select aria-label="Período" value={dias ?? ""} onChange={(e) => alPeriodo(e.target.value ? Number(e.target.value) : null)} className="absolute inset-0 cursor-pointer opacity-0">
        {PERIODOS.map((p) => <option key={p.texto} value={p.dias ?? ""}>{p.texto}</option>)}
      </select>
    </label>
  )
}

const NOTA = "Se muestran de a 20, del más nuevo al más viejo."
const SIN_FILTRO = "No hay movimientos con ese filtro"

// ======================= COMPUTADORA =======================
function CuerpoCompu({ carga, filas, filtro, dias, cargandoMas, alFiltrar, alPeriodo, cargarMas, reintentar }: CuerpoProps) {
  const listo = carga.estado === "listo" ? carga.datos : null
  return (
    <main>
      <Cont className="flex flex-col items-start gap-5 pb-14 pt-8">
        <Link to={RUTAS.miCuenta} className="flex items-center gap-1.5" style={{ color: C.link, fontWeight: 500, fontSize: 14, lineHeight: "17px" }}>
          <ArrowLeft className="size-4" />Volver a Mi cuenta
        </Link>
        <h1 style={{ color: C.title, fontWeight: 700, fontSize: 32, lineHeight: "39px" }}>Tu historial</h1>
        {carga.estado === "error" ? <NoSePudo onReintentar={reintentar} /> : (
          <>
            <div className="flex w-full items-center gap-3">
              <Filtros filtro={filtro} alFiltrar={alFiltrar} />
              <div className="flex-1" />
              <Periodo dias={dias} alPeriodo={alPeriodo} />
            </div>
            <div className="flex w-full flex-col rounded-[14px]" style={{ background: C.card, border: `1px solid ${C.border}` }}>
              <CabeceraHistorial />
              {!listo ? <FilasCargandoCompu /> : filas.length === 0 ? (
                <div style={{ borderTop: `1px solid ${C.border}` }}>
                  {filtro === "todo" && dias == null ? <HistorialVacio /> : <p className="px-6 py-[14px]" style={{ color: C.muted, fontSize: 14, lineHeight: "17px" }}>{SIN_FILTRO}</p>}
                </div>
              ) : filas.map((f, i) => <FilaCompu key={`${f.fecha}-${i}`} f={f} />)}
              {listo?.siguiente ? (
                <button type="button" onClick={cargarMas} disabled={cargandoMas} className="flex items-center gap-1.5 pb-4 pl-6 pt-[14px] disabled:opacity-60" style={{ borderTop: `1px solid ${C.border}`, color: C.link, fontWeight: 500, fontSize: 14, lineHeight: "17px" }}>
                  Cargar 20 más<ArrowRight className="size-[14px]" />
                </button>
              ) : null}
            </div>
            <p style={{ color: C.faint, fontSize: 13, lineHeight: "16px" }}>{NOTA}</p>
          </>
        )}
      </Cont>
    </main>
  )
}

// ======================= CELULAR =======================
function CuerpoCelular({ carga, filas, filtro, dias, cargandoMas, alFiltrar, alPeriodo, cargarMas, reintentar }: CuerpoProps) {
  const listo = carga.estado === "listo" ? carga.datos : null
  return (
    <main>
      <section className="flex flex-col items-start gap-3 px-5 py-6">
        <Link to={RUTAS.miCuenta} className="flex items-center gap-1.5" style={{ color: C.link, fontWeight: 500, fontSize: 13, lineHeight: "16px" }}>
          <ArrowLeft className="size-[15px]" />Volver a Mi cuenta
        </Link>
        <h1 style={{ color: C.title, fontWeight: 700, fontSize: 26, lineHeight: "31px" }}>Tu historial</h1>
        {carga.estado === "error" ? <NoSePudo onReintentar={reintentar} /> : (
          <>
            <Filtros filtro={filtro} alFiltrar={alFiltrar} chico />
            <Periodo dias={dias} alPeriodo={alPeriodo} />
          </>
        )}
      </section>
      {carga.estado === "error" ? null : (
        <section className="flex flex-col items-start gap-2.5 px-5 pb-6">
          <div className="flex w-full flex-col rounded-[14px]" style={{ background: C.card, border: `1px solid ${C.border}` }}>
            {!listo ? <FilasCargandoCelular /> : filas.length === 0 ? (
              filtro === "todo" && dias == null ? <HistorialVacio /> : <p className="p-[14px]" style={{ color: C.muted, fontSize: 13, lineHeight: "18px" }}>{SIN_FILTRO}</p>
            ) : filas.map((f, i) => <FilaCelular key={`${f.fecha}-${i}`} f={f} primera={i === 0} />)}
          </div>
          {listo?.siguiente ? (
            <button type="button" onClick={cargarMas} disabled={cargandoMas} className="flex items-center gap-1.5 disabled:opacity-60" style={{ color: C.link, fontWeight: 500, fontSize: 13, lineHeight: "16px" }}>
              Cargar 20 más<ArrowRight className="size-[13px]" />
            </button>
          ) : null}
          <p style={{ color: C.faint, fontSize: 12, lineHeight: "15px" }}>{NOTA}</p>
        </section>
      )}
    </main>
  )
}

export function HistorialPage() {
  const nav = useNavigate()
  const { datos } = usePrecios()
  const [menu, setMenu] = useState(false)
  const [filtro, setFiltro] = useState<FiltroHistorial>("todo")
  const [dias, setDias] = useState<number | null>(30)
  const [carga, setCarga] = useState<Carga>({ estado: "cargando" })
  const [cargandoMas, setCargandoMas] = useState(false)
  const turno = useRef(0) // si cambia el filtro mientras llega una respuesta, la vieja se descarta
  useSeo({ titulo: "Tu historial | AriTool", descripcion: "Cada recarga y cada uso de tu cuenta AriTool, con su número de pedido.", ruta: RUTAS.historial, indexar: false })

  /** Pide una página. `antes` = cursor de la anterior (null = desde el principio). */
  const pedir = useCallback(async (antes: string | null, previos: Datos | null) => {
    const mio = ++turno.current
    if (antes) setCargandoMas(true)
    else setCarga({ estado: "cargando" })
    try {
      const { data } = await supabase.auth.getSession()
      const ses = data.session
      if (!ses) return nav(RUTAS.cuenta, { replace: true })
      // TEMPORAL: la función todavía no está en producción (no responde o da 404) → los últimos 20 de
      // `cliente_resumen`. Sin internet esa segunda llamada también falla y sale "No pudimos cargar".
      const r = await historialCliente(ses.access_token, { filtro, dias, antes }).catch(() => null)
      const rr = !r || r.status === 404 ? await resumenCliente(ses.access_token) : null
      if (mio !== turno.current) return
      if (r?.ok && r.data) {
        return setCarga({ estado: "listo", datos: { movimientos: [...(previos?.movimientos ?? []), ...r.data.movimientos], trabajos: [...(previos?.trabajos ?? []), ...r.data.trabajos], siguiente: r.data.hay_mas ? r.data.siguiente : null, local: false } })
      }
      if (rr?.ok && rr.data) return setCarga({ estado: "listo", datos: { movimientos: rr.data.movimientos, trabajos: rr.data.trabajos, siguiente: null, local: true } })
      const motivo = await motivoRechazo((rr ?? r)?.status ?? 0)
      // La sesión venció (W13 S8): vuelve a entrar y regresa acá.
      if (motivo === "vencida") return nav(`${RUTAS.cuenta}?vencida=1&volver=${encodeURIComponent(RUTAS.historial)}`, { replace: true })
      if (motivo === "perfil") return setCarga({ estado: "sinPerfil" })
      setCarga({ estado: "error" })
    } catch {
      if (mio === turno.current) setCarga({ estado: "error" })
    } finally {
      if (mio === turno.current) setCargandoMas(false)
    }
  }, [nav, filtro, dias])

  useEffect(() => { void pedir(null, null) }, [pedir])
  useEffect(() => {
    const prev = document.body.style.background
    document.body.style.background = C.page
    return () => { document.body.style.background = prev }
  }, [])

  // Nombres de los servicios: los del catálogo en vivo, con el nombre de la web donde difiere.
  const catalogo = useMemo(() => ({ ...Object.fromEntries((datos?.servicios ?? []).map((s) => [s.clave, s.nombre])), ...NOMBRE_WEB }), [datos])
  const filas = useMemo(() => {
    if (carga.estado !== "listo") return []
    const todas = filasHistorial({ ...carga.datos, saldo: 0 }, catalogo)
    return carga.datos.local ? filtrarHistorial(todas, filtro, dias) : todas
  }, [carga, catalogo, filtro, dias])
  const listo = carga.estado === "listo" ? carga.datos : null
  const whatsapp = datos?.soporte.whatsapp ?? WA
  const salir = async () => {
    await supabase.auth.signOut({ scope: "local" })
    nav(RUTAS.cuenta)
  }
  const props: CuerpoProps = {
    carga, filas, filtro, dias, cargandoMas, alFiltrar: setFiltro, alPeriodo: setDias,
    cargarMas: () => { if (listo?.siguiente) void pedir(listo.siguiente, listo) },
    reintentar: () => void pedir(null, null),
  }

  return (
    <div className="min-h-screen overflow-x-hidden" style={{ background: C.page, color: C.text, fontFamily: "Inter, system-ui, sans-serif", lineHeight: "normal" }}>
      <div className="hidden min-h-screen flex-col lg:flex">
        <HeaderDesktop datos={datos} />
        {carga.estado === "sinPerfil" ? <main className="flex-1"><SinPerfil whatsapp={whatsapp} movil={false} onSalir={salir} /></main> : <CuerpoCompu {...props} />}
        <PieDesktop />
      </div>
      <div className="flex min-h-screen flex-col lg:hidden">
        <HeaderMobile onMenu={() => setMenu(true)} mostrarBuscar={carga.estado !== "sinPerfil"} />
        <FranjaSoporte datos={datos} />
        {carga.estado === "sinPerfil" ? <main className="flex-1"><SinPerfil whatsapp={whatsapp} movil onSalir={salir} /></main> : <CuerpoCelular {...props} />}
        <PieMobile />
        {menu ? <MenuMobile datos={datos} onClose={() => setMenu(false)} /> : null}
      </div>
    </div>
  )
}
