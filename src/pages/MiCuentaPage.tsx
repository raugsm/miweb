/**
 * W12 · Mi cuenta — compu (1099:2) + celular (1104:64), aprobado por Peter 4-nov.
 * Todo sale de la cuenta real (`cliente_resumen` con la sesión del cliente): saldo, licencia e historial.
 * Sin sesión manda a Ingresar. Nunca muestra un número que no vino del servidor.
 *
 * PENDIENTE (espera OK de Peter): la v19 de `cliente_resumen` (supabase/functions/cliente_resumen_v19),
 * que agrega la licencia, el detalle del alquiler y los procesos hechos con licencia. Con la versión de
 * hoy la tarjeta de licencia no puede decir el estado y manda a mirarlo en la app.
 * PENDIENTE: Recargar (W14), Licencia (W15) y el historial completo (W12b) todavía no existen; sus
 * botones van al panel de la web actual, que usa la misma sesión.
 */
import { ArrowRight, LogOut, Wallet } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Link, useNavigate } from "react-router-dom"

import { C, Cont, FranjaSoporte, HeaderDesktop, HeaderMobile, IconoWA, MenuMobile, PieDesktop, PieMobile, RUTAS, WA } from "@/components/aritool/chrome"
import { usePrecios } from "@/hooks/use-precios"
import { NOMBRE_WEB } from "@/lib/buscador"
import { resumenCliente, type ResumenCliente } from "@/lib/cuenta"
import { fechaCorta, filasHistorial, montoTexto, type FilaHistorial } from "@/lib/historial"
import { recordarNombre } from "@/lib/sesion"
import { useSeo } from "@/lib/seo"
import { supabase } from "@/lib/supabase"

type Carga = { estado: "cargando" } | { estado: "error" } | { estado: "listo"; datos: ResumenCliente; correo: string }

const usd = (n: number) => `US$ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const saldoTexto = (n: number) => n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
/** "2027-09-12" → "12/09/2027" (la fecha es un día, no una hora: no se pasa por zona horaria). */
const dia = (f: string) => f.slice(0, 10).split("-").reverse().join("/")

type LicenciaVista = { titulo: string | null; punto: string; linea: string; nota: string; enlace: string }
function vistaLicencia(l: ResumenCliente["licencia"]): LicenciaVista {
  const nota = "Tecno, Infinix e itel no te gastan saldo mientras esté activa."
  if (l === undefined) return { titulo: null, punto: C.faint, linea: "Mirá el estado de tu licencia en la app AriTool.", nota, enlace: "Ver la licencia anual" }
  if (l === null) return { titulo: "Sin licencia", punto: C.faint, linea: "Todavía no tenés la licencia anual.", nota: "Con la licencia, Tecno, Infinix e itel no te gastan saldo.", enlace: "Ver la licencia anual" }
  if (l.estado === "vigente") return { titulo: "Activa", punto: C.green, linea: `Hasta el ${dia(l.fecha_fin)} · en ${l.pcs} PC`, nota, enlace: "Renovar un año más" }
  return { titulo: "Vencida", punto: C.faint, linea: `Venció el ${dia(l.fecha_fin)}`, nota: "Mientras no esté activa, Tecno, Infinix e itel gastan saldo.", enlace: "Renovar un año más" }
}

function Monto({ f, chico }: { f: FilaHistorial; chico?: boolean }) {
  if (f.monto == null) return <span style={{ color: C.muted, fontSize: chico ? 12 : 14 }}>con licencia</span>
  return <span style={{ color: f.monto >= 0 ? C.green : C.text, fontWeight: 600, fontSize: chico ? 15 : 14 }}>{montoTexto(f.monto)}</span>
}

function Barra({ w, h }: { w: number; h: number }) {
  return <span className="block animate-pulse rounded" style={{ width: w, height: h, background: C.border }} />
}

function NoSePudo({ onReintentar }: { onReintentar: () => void }) {
  return (
    <div className="rounded-xl p-6 text-center" style={{ border: `1px solid ${C.border}`, background: C.card }}>
      <p style={{ color: C.muted, fontSize: 14 }}>No pudimos cargar tu cuenta ahora mismo.</p>
      <button type="button" onClick={onReintentar} className="mt-3 inline-flex h-9 items-center rounded-lg px-4 text-white" style={{ background: C.blue, fontSize: 14, fontWeight: 600 }}>Reintentar</button>
    </div>
  )
}

// ======================= COMPUTADORA =======================
const COL = ["w-[150px] shrink-0", "min-w-0 flex-1", "w-[200px] shrink-0", "w-[140px] shrink-0 text-right", "w-[140px] shrink-0 text-right"]

function CuerpoCompu({ carga, filas, whatsapp, salir, reintentar }: { carga: Carga; filas: FilaHistorial[]; whatsapp: string; salir: () => void; reintentar: () => void }) {
  const [todo, setTodo] = useState(false)
  const listo = carga.estado === "listo" ? carga : null
  const lic = listo ? vistaLicencia(listo.datos.licencia) : null
  const visibles = todo ? filas : filas.slice(0, 6)
  return (
    <main>
      <Cont className="flex flex-col gap-6 pb-14 pt-10">
        <div className="flex items-end gap-4">
          <div className="flex flex-col gap-1">
            <h1 style={{ color: C.title, fontWeight: 700, fontSize: 32, lineHeight: "39px" }}>Mi cuenta</h1>
            {listo ? <p style={{ color: C.muted, fontSize: 14, lineHeight: "17px" }}>{listo.correo} · la misma cuenta que usás en la app</p> : <span className="py-[3px]"><Barra w={300} h={11} /></span>}
          </div>
          <div className="flex-1" />
          <button type="button" onClick={salir} className="flex items-center gap-2" style={{ border: `1px solid ${C.borderAlt}`, borderRadius: 9, padding: "9px 14px" }}>
            <LogOut className="size-[15px]" style={{ color: C.text }} />
            <span style={{ color: C.text, fontWeight: 500, fontSize: 14, lineHeight: "17px" }}>Salir</span>
          </button>
        </div>

        {carga.estado === "error" ? <NoSePudo onReintentar={reintentar} /> : (
          <>
            <div className="flex items-stretch gap-5">
              <div className="flex min-w-0 flex-1 flex-col items-start gap-2.5 rounded-2xl p-7" style={{ background: "linear-gradient(90deg, #0f1c38, #0a0f1c)", border: `1px solid ${C.pcBorder}` }}>
                <p style={{ color: C.link, fontWeight: 700, fontSize: 12, lineHeight: "15px", letterSpacing: "1.3px" }}>TU SALDO</p>
                {listo ? <p style={{ color: "#fff", fontWeight: 700, fontSize: 52, lineHeight: "63px" }}>{usd(listo.datos.saldo_usd ?? listo.datos.saldo)}</p> : <span className="py-[11px]"><Barra w={260} h={41} /></span>}
                <p style={{ color: C.muted2, fontSize: 14, lineHeight: "17px" }}>Sirve para alquiler, Xiaomi FRP, Cuenta MI y Security Plugin.</p>
                <div className="flex items-center gap-3.5 pt-2">
                  <Link to={RUTAS.recargar} className="flex items-center gap-2 text-white" style={{ background: C.blue, borderRadius: 10, padding: "13px 20px" }}>
                    <Wallet className="size-[17px]" />
                    <span style={{ fontWeight: 600, fontSize: 15, lineHeight: "18px" }}>Recargar saldo</span>
                  </Link>
                  <span style={{ color: C.muted, fontSize: 13, lineHeight: "16px" }}>Con Yape o Binance · se carga solo</span>
                </div>
              </div>
              <div className="flex w-[440px] shrink-0 flex-col items-start gap-2.5 rounded-2xl p-7" style={{ background: C.card, border: `1px solid ${C.border}` }}>
                <p style={{ color: C.muted, fontWeight: 700, fontSize: 12, lineHeight: "15px", letterSpacing: "1.3px" }}>LICENCIA ANUAL</p>
                {!lic ? <span className="py-[5px]"><Barra w={120} h={17} /></span> : lic.titulo ? (
                  <div className="flex items-center gap-2">
                    <span className="size-2.5 rounded-full" style={{ background: lic.punto }} />
                    <span style={{ color: C.title, fontWeight: 700, fontSize: 22, lineHeight: "27px" }}>{lic.titulo}</span>
                  </div>
                ) : null}
                {lic ? <p style={{ color: C.muted2, fontSize: 14, lineHeight: "17px" }}>{lic.linea}</p> : <span className="py-[3px]"><Barra w={190} h={11} /></span>}
                <p className="w-full" style={{ color: C.muted, fontSize: 13, lineHeight: "19px" }}>{lic ? lic.nota : "Tecno, Infinix e itel no te gastan saldo mientras esté activa."}</p>
                {lic ? (
                  <Link to={RUTAS.licencia} className="flex items-center gap-1.5 pt-1.5" style={{ color: C.link, fontWeight: 500, fontSize: 14, lineHeight: "17px" }}>
                    {lic.enlace}<ArrowRight className="size-[14px]" />
                  </Link>
                ) : null}
              </div>
            </div>

            <div className="flex items-center pt-3">
              <h2 style={{ color: C.muted, fontWeight: 700, fontSize: 12, lineHeight: "15px", letterSpacing: "1.2px" }}>TU HISTORIAL</h2>
              <div className="flex-1" />
              <span style={{ color: C.faint, fontSize: 13, lineHeight: "16px" }}>Cada recarga y cada uso, con su número de pedido</span>
            </div>

            <div className="flex flex-col rounded-[14px]" style={{ background: C.card, border: `1px solid ${C.border}` }}>
              <div className="flex items-center px-6 py-3" style={{ color: C.faint, fontWeight: 500, fontSize: 12, lineHeight: "15px" }}>
                {["Fecha", "Qué fue", "Pedido", "Monto", "Saldo"].map((t, i) => <span key={t} className={COL[i]}>{t}</span>)}
              </div>
              {!listo ? [0, 1, 2].map((i) => (
                <div key={i} className="flex items-center px-6 py-[17px]" style={{ borderTop: `1px solid ${C.border}` }}><Barra w={420} h={11} /></div>
              )) : filas.length === 0 ? (
                <p className="px-6 py-[14px]" style={{ borderTop: `1px solid ${C.border}`, color: C.muted, fontSize: 14, lineHeight: "17px" }}>Todavía no hay movimientos. Cuando recargues o uses un servicio, aparece acá.</p>
              ) : visibles.map((f, i) => (
                <div key={`${f.fecha}-${i}`} className="flex items-center px-6 py-[14px]" style={{ borderTop: `1px solid ${C.border}`, fontSize: 14, lineHeight: "17px" }}>
                  <span className={COL[0]} style={{ color: "#d1d5db" }}>{fechaCorta(f.fecha)}</span>
                  <span className={`${COL[1]} truncate`} style={{ color: "#d1d5db" }}>{f.que}</span>
                  <span className={COL[2]} style={{ color: C.muted }}>{f.pedido ?? "—"}</span>
                  <span className={COL[3]}><Monto f={f} /></span>
                  <span className={COL[4]} style={{ color: C.muted }}>{f.saldo != null ? saldoTexto(f.saldo) : "—"}</span>
                </div>
              ))}
              {listo && filas.length > 6 && !todo ? (
                <button type="button" onClick={() => setTodo(true)} className="flex items-center gap-1.5 pb-4 pl-6 pt-[14px]" style={{ borderTop: `1px solid ${C.border}`, color: C.link, fontWeight: 500, fontSize: 14, lineHeight: "17px" }}>
                  Ver todo el historial<ArrowRight className="size-[14px]" />
                </button>
              ) : null}
            </div>
          </>
        )}

        <div className="flex items-center gap-2.5 pt-2" style={{ fontSize: 14, lineHeight: "17px" }}>
          <IconoWA className="size-[18px]" style={{ color: C.waGreen }} />
          <span style={{ color: C.muted }}>¿Algo no cuadra?</span>
          <a href={whatsapp} target="_blank" rel="noreferrer" style={{ color: C.link, fontWeight: 500 }}>Escribinos por WhatsApp</a>
        </div>
      </Cont>
    </main>
  )
}

// ======================= CELULAR =======================
function CuerpoCelular({ carga, filas, whatsapp, salir, reintentar }: { carga: Carga; filas: FilaHistorial[]; whatsapp: string; salir: () => void; reintentar: () => void }) {
  const [todo, setTodo] = useState(false)
  const listo = carga.estado === "listo" ? carga : null
  const lic = listo ? vistaLicencia(listo.datos.licencia) : null
  const visibles = todo ? filas : filas.slice(0, 5)
  return (
    <main>
      <section className="flex flex-col gap-1 px-5 py-6">
        <div className="flex items-center gap-2.5">
          <h1 style={{ color: C.title, fontWeight: 700, fontSize: 26, lineHeight: "31px" }}>Mi cuenta</h1>
          <div className="flex-1" />
          <button type="button" onClick={salir} className="flex items-center gap-1.5" style={{ border: `1px solid ${C.borderAlt}`, borderRadius: 8, padding: "7px 12px 7px 10px" }}>
            <LogOut className="size-[14px]" style={{ color: C.text }} />
            <span style={{ color: C.text, fontWeight: 500, fontSize: 13, lineHeight: "16px" }}>Salir</span>
          </button>
        </div>
        {listo ? <p className="truncate" style={{ color: C.muted, fontSize: 13, lineHeight: "16px" }}>{listo.correo}</p> : <span className="py-[3px]"><Barra w={150} h={10} /></span>}
      </section>

      {carga.estado === "error" ? <section className="px-5 pb-6 pt-3"><NoSePudo onReintentar={reintentar} /></section> : (
        <>
          <section className="flex flex-col gap-3 px-5 pb-6 pt-3">
            <div className="flex flex-col items-start gap-2 rounded-2xl p-5" style={{ background: "linear-gradient(90deg, #0f1c38, #0a0f1c)", border: `1px solid ${C.pcBorder}` }}>
              <p style={{ color: C.link, fontWeight: 700, fontSize: 11, lineHeight: "13px", letterSpacing: "1.2px" }}>TU SALDO</p>
              {listo ? <p style={{ color: "#fff", fontWeight: 700, fontSize: 40, lineHeight: "48px" }}>{usd(listo.datos.saldo_usd ?? listo.datos.saldo)}</p> : <span className="py-2"><Barra w={200} h={32} /></span>}
              <p className="w-full" style={{ color: C.muted2, fontSize: 13, lineHeight: "18px" }}>Sirve para alquiler, Xiaomi FRP, Cuenta MI y Security Plugin.</p>
              <Link to={RUTAS.recargar} className="flex w-full items-center justify-center gap-2 text-white" style={{ background: C.blue, borderRadius: 10, padding: "13px 0" }}>
                <Wallet className="size-[17px]" />
                <span style={{ fontWeight: 600, fontSize: 15, lineHeight: "18px" }}>Recargar saldo</span>
              </Link>
            </div>
            <div className="flex items-center gap-2.5 rounded-[14px] p-4" style={{ background: C.card, border: `1px solid ${C.border}` }}>
              <div className="flex min-w-0 flex-col gap-[3px]">
                <p style={{ color: C.muted, fontWeight: 700, fontSize: 11, lineHeight: "13px", letterSpacing: "1.1px" }}>LICENCIA ANUAL</p>
                {lic ? (
                  <div className="flex items-center gap-1.5">
                    {lic.titulo ? <span className="size-2 shrink-0 rounded-full" style={{ background: lic.punto }} /> : null}
                    <span className="truncate" style={{ color: C.text, fontWeight: 600, fontSize: 14, lineHeight: "17px" }}>
                      {listo?.datos.licencia?.estado === "vigente" ? `Activa hasta ${dia(listo.datos.licencia.fecha_fin)}` : lic.titulo ?? "Mirala en la app AriTool"}
                    </span>
                  </div>
                ) : <span className="py-[3px]"><Barra w={150} h={11} /></span>}
              </div>
              <div className="flex-1" />
              {lic ? <Link to={RUTAS.licencia} className="shrink-0" style={{ color: C.link, fontWeight: 500, fontSize: 13, lineHeight: "16px" }}>{lic.titulo === "Sin licencia" || !lic.titulo ? "Ver" : "Renovar"}</Link> : null}
            </div>
          </section>

          <section className="flex flex-col items-start gap-2.5 px-5 pb-6 pt-2">
            <h2 style={{ color: C.muted, fontWeight: 700, fontSize: 11, lineHeight: "13px", letterSpacing: "1.1px" }}>TU HISTORIAL</h2>
            <div className="flex w-full flex-col rounded-[14px]" style={{ background: C.card, border: `1px solid ${C.border}` }}>
              {!listo ? [0, 1, 2].map((i) => (
                <div key={i} className="p-[14px]" style={i ? { borderTop: `1px solid ${C.border}` } : undefined}><Barra w={200} h={35} /></div>
              )) : filas.length === 0 ? (
                <p className="p-[14px]" style={{ color: C.muted, fontSize: 13, lineHeight: "18px" }}>Todavía no hay movimientos. Cuando recargues o uses un servicio, aparece acá.</p>
              ) : visibles.map((f, i) => (
                <div key={`${f.fecha}-${i}`} className="flex items-center gap-2.5 p-[14px]" style={i ? { borderTop: `1px solid ${C.border}` } : undefined}>
                  <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
                    <span className="truncate" style={{ color: C.text, fontWeight: 500, fontSize: 14, lineHeight: "17px" }}>{f.que}</span>
                    <span className="truncate" style={{ color: C.muted, fontSize: 12, lineHeight: "15px" }}>{[fechaCorta(f.fecha), f.pedido].filter(Boolean).join(" · ")}</span>
                  </div>
                  <span className="shrink-0" style={{ lineHeight: "18px" }}><Monto f={f} chico /></span>
                </div>
              ))}
            </div>
            {listo && filas.length > 5 && !todo ? (
              <button type="button" onClick={() => setTodo(true)} className="flex items-center gap-1.5" style={{ color: C.link, fontWeight: 500, fontSize: 13, lineHeight: "16px" }}>
                Ver todo el historial<ArrowRight className="size-[13px]" />
              </button>
            ) : null}
            <div className="flex items-center gap-2 pt-1" style={{ fontSize: 13, lineHeight: "16px" }}>
              <IconoWA className="size-[17px]" style={{ color: C.waGreen }} />
              <span style={{ color: C.muted }}>¿Algo no cuadra?</span>
              <a href={whatsapp} target="_blank" rel="noreferrer" style={{ color: C.link, fontWeight: 500 }}>WhatsApp</a>
            </div>
          </section>
        </>
      )}
    </main>
  )
}

export function MiCuentaPage() {
  const nav = useNavigate()
  const { datos } = usePrecios()
  const [menu, setMenu] = useState(false)
  const [carga, setCarga] = useState<Carga>({ estado: "cargando" })
  useSeo({ titulo: "Mi cuenta | AriTool", descripcion: "Tu saldo, tu licencia y tu historial en AriTool.", ruta: "/mi-cuenta", indexar: false })

  const cargar = useCallback(async () => {
    setCarga({ estado: "cargando" })
    try {
      const { data } = await supabase.auth.getSession()
      const ses = data.session
      if (!ses) return nav(RUTAS.cuenta, { replace: true })
      const r = await resumenCliente(ses.access_token)
      if (r.ok && r.data) {
        recordarNombre(ses.user.id, r.data.nombre)
        return setCarga({ estado: "listo", datos: r.data, correo: ses.user.email ?? "" })
      }
      // 403 = la cuenta todavía no tiene su perfil armado: eso se completa en el panel de la web actual.
      if (r.status === 403) return nav(RUTAS.panelViejo, { replace: true })
      setCarga({ estado: "error" })
    } catch {
      setCarga({ estado: "error" })
    }
  }, [nav])

  useEffect(() => {
    void cargar()
    const prev = document.body.style.background
    document.body.style.background = C.page
    return () => { document.body.style.background = prev }
  }, [cargar])

  const salir = async () => {
    // Solo este navegador: cerrar en todos lados le cerraría la sesión de la app.
    await supabase.auth.signOut({ scope: "local" })
    nav(RUTAS.cuenta)
  }

  // Nombres de los servicios: los del catálogo en vivo, con el nombre de la web donde difiere.
  const catalogo = useMemo(() => ({ ...Object.fromEntries((datos?.servicios ?? []).map((s) => [s.clave, s.nombre])), ...NOMBRE_WEB }), [datos])
  const filas = useMemo(() => (carga.estado === "listo" ? filasHistorial(carga.datos, catalogo) : []), [carga, catalogo])
  const whatsapp = datos?.soporte.whatsapp ?? WA
  const props = { carga, filas, whatsapp, salir, reintentar: () => void cargar() }

  return (
    <div className="min-h-screen overflow-x-hidden" style={{ background: C.page, color: C.text, fontFamily: "Inter, system-ui, sans-serif", lineHeight: "normal" }}>
      <div className="hidden lg:block">
        <HeaderDesktop datos={datos} />
        <CuerpoCompu {...props} />
        <PieDesktop />
      </div>
      <div className="lg:hidden">
        <HeaderMobile onMenu={() => setMenu(true)} />
        <FranjaSoporte datos={datos} />
        <CuerpoCelular {...props} />
        <PieMobile />
        {menu ? <MenuMobile datos={datos} onClose={() => setMenu(false)} /> : null}
      </div>
    </div>
  )
}
