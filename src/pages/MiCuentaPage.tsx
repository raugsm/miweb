/**
 * W12 · Mi cuenta — compu (1099:2) + celular (1104:64), aprobado por Peter 4-nov.
 * Todo sale de la cuenta real (`cliente_resumen` con la sesión del cliente): saldo, licencia e historial.
 * Sin sesión manda a Ingresar. Nunca muestra un número que no vino del servidor.
 *
 * PENDIENTE (espera OK de Peter): la v19 de `cliente_resumen` (supabase/functions/cliente_resumen_v19),
 * que agrega la licencia, el detalle del alquiler y los procesos hechos con licencia. Con la versión de
 * hoy la tarjeta de licencia no puede decir el estado y manda a mirarlo en la app.
 * Recargar (W14) y Licencia (W15) ya son páginas propias (RUTAS.recargar y RUTAS.licencia).
 * PENDIENTE: una cuenta sin perfil armado todavía va a /panel (web anterior) hasta que el diseño lo cubra.
 *
 * Estados (W13 · 1100:271): sin licencia (S1), licencia por vencer (S2), saldo que no alcanza (S3),
 * pago esperando (S4), historial vacío (S5), cargando (S6), no se pudo cargar (S7) y sesión vencida
 * (S8, se muestra en Ingresar).
 */
import { ArrowRight, Key, LogOut, Timer, Wallet } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Link, useNavigate } from "react-router-dom"

import { Banner } from "@/components/aritool/auth"
import { Barra, CabeceraHistorial, FilaCelular, FilaCompu, FilasCargandoCelular, FilasCargandoCompu, HistorialVacio, NoSePudo } from "@/components/aritool/historial"
import { C, Cont, FranjaSoporte, HeaderDesktop, HeaderMobile, IconoWA, MenuMobile, PieDesktop, PieMobile, RUTAS, WA } from "@/components/aritool/chrome"
import { SinPerfil } from "@/components/aritool/perfil"
import { usePrecios } from "@/hooks/use-precios"
import { NOMBRE_WEB } from "@/lib/buscador"
import { cobroActivo, resumenCliente, type CobroActivo, type ResumenCliente } from "@/lib/cuenta"
import { filasHistorial, type FilaHistorial } from "@/lib/historial"
import { herramientaVisible, type Precios } from "@/lib/precios"
import { motivoRechazo, recordarNombre } from "@/lib/sesion"
import { useSeo } from "@/lib/seo"
import { supabase } from "@/lib/supabase"

type Carga = { estado: "cargando" } | { estado: "error" } | { estado: "sinPerfil" } | { estado: "listo"; datos: ResumenCliente; correo: string; pago: CobroActivo | null }

const usd = (n: number) => `US$ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
/** "2027-09-12" → "12/09/2027" (la fecha es un día, no una hora: no se pasa por zona horaria). */
const dia = (f: string) => f.slice(0, 10).split("-").reverse().join("/")

const AMBAR = "#fbbf24"
/** Desde cuántos días antes la licencia pasa a "por vencer" (W13 S2 dibuja "Vence en 9 días"). */
const AVISO_VENCE_DIAS = 30

type Licencia =
  | { tipo: "desconocida" } // el servidor todavía no la entrega (antes de la v19)
  | { tipo: "sin" } // S1: no tiene una vigente
  | { tipo: "porVencer"; dias: number; fecha: string; pcs: number } // S2
  | { tipo: "activa"; fecha: string; pcs: number } // W12

function leerLicencia(l: ResumenCliente["licencia"]): Licencia {
  if (l === undefined) return { tipo: "desconocida" }
  if (l === null || l.estado !== "vigente") return { tipo: "sin" }
  const [a, m, d] = l.fecha_fin.slice(0, 10).split("-").map(Number)
  const hoy = new Date()
  const dias = Math.round((new Date(a, m - 1, d).getTime() - new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).getTime()) / 86_400_000)
  if (dias < 0) return { tipo: "sin" }
  return dias <= AVISO_VENCE_DIAS ? { tipo: "porVencer", dias, fecha: dia(l.fecha_fin), pcs: l.pcs } : { tipo: "activa", fecha: dia(l.fecha_fin), pcs: l.pcs }
}
const venceEn = (dias: number) => (dias === 0 ? "Vence hoy" : `Vence en ${dias} ${dias === 1 ? "día" : "días"}`)

/** Lo más barato que se puede pagar con saldo hoy (catálogo en vivo). null = no se sabe. */
function minimoParaUsar(datos: Precios | null | undefined): number | null {
  if (!datos) return null
  const precios = [
    ...datos.servicios.filter((x) => x.disponible).map((x) => x.precio_usd),
    ...datos.herramientas.filter(herramientaVisible).filter((h) => h.disponible).map((h) => h.precio_usdt),
    datos.app?.credito_usd,
  ].filter((n): n is number => typeof n === "number" && n > 0)
  return precios.length ? Math.min(...precios) : null
}

function minSeg(total: number): string {
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`
}
/** Segundos que le quedan al pago en curso; se actualiza cada segundo. */
function useFalta(vence: string | undefined): number {
  const [ahora, setAhora] = useState(() => Date.now())
  useEffect(() => {
    if (!vence) return
    const id = window.setInterval(() => setAhora(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [vence])
  return vence ? Math.max(0, Math.round((new Date(vence).getTime() - ahora) / 1000)) : 0
}

/** Aviso bajo el saldo: pago esperando (S4) o saldo que no alcanza (S3). null = ninguno. */
function avisoSaldo(pago: CobroActivo | null, falta: number, bajo: boolean) {
  if (pago) return <Banner tipo="azul" icono={Timer}>Tenés un pago esperando: {pago.producto === "licencia" ? "licencia anual" : `recarga de US$ ${Number(pago.creditos).toFixed(2)}`}. {pago.metodo === "yape" ? `S/ ${pago.monto} por Yape` : `${pago.monto} USDT por Binance`}. Vence en {minSeg(falta)}.</Banner>
  if (bajo) return <Banner tipo="ambar" icono={Wallet}>Con esto no te alcanza para usar nada. Recargá para seguir.</Banner>
  return null
}

/** Lo que cambia en la tarjeta del saldo según el estado de la cuenta. */
function useSaldo(carga: Carga, minimo: number | null) {
  const listo = carga.estado === "listo" ? carga : null
  const falta = useFalta(listo?.pago?.vence_en)
  const pago = listo?.pago && falta > 0 ? listo.pago : null
  const lic = listo ? leerLicencia(listo.datos.licencia) : null
  const saldo = listo ? listo.datos.saldo_usd ?? listo.datos.saldo : 0
  // Con la licencia vigente sí puede trabajar sin saldo: ahí el aviso sería falso.
  const bajo = minimo != null && saldo < minimo && lic?.tipo !== "activa" && lic?.tipo !== "porVencer"
  return { listo, lic, saldo, pago, aviso: listo ? avisoSaldo(pago, falta, bajo) : null }
}

function Barras() {
  // W13 S6 · Cargando
  return (
    <div className="flex w-full flex-col items-start gap-4">
      {[[90, 12], [200, 34], [320, 12], [260, 12]].map(([w, h]) => <span key={w} className="block max-w-full animate-pulse rounded-md" style={{ width: w, height: h, background: C.border }} />)}
    </div>
  )
}

function TarjetaLicencia({ lic, precio }: { lic: Licencia | null; precio: number | null | undefined }) {
  const etiqueta = <p style={{ color: C.muted, fontWeight: 700, fontSize: 12, lineHeight: "15px", letterSpacing: "1.3px" }}>LICENCIA ANUAL</p>
  const nota = "Tecno, Infinix e itel no te gastan saldo mientras esté activa."
  const caja = (hueco: number, hijos: React.ReactNode) => <div className="flex w-[440px] shrink-0 flex-col items-start rounded-2xl p-7" style={{ background: C.card, border: `1px solid ${C.border}`, gap: hueco }}>{hijos}</div>
  if (!lic) return caja(16, <Barras />)
  if (lic.tipo === "sin") {
    return caja(16, <>
      {etiqueta}
      <p style={{ color: C.title, fontWeight: 700, fontSize: 20, lineHeight: "24px" }}>No tenés licencia</p>
      <p className="w-full" style={{ color: C.muted, fontSize: 13, lineHeight: "19px" }}>Con la licencia, Tecno, Infinix e itel no te gastan saldo durante 1 año, en 1 PC.</p>
      <Link to={RUTAS.licencia} className="flex w-full items-center justify-center gap-2" style={{ border: `1px solid ${C.borderAlt}`, borderRadius: 10, padding: "13px 18px", color: C.text, fontWeight: 600, fontSize: 15, lineHeight: "18px" }}>
        <Key className="size-4" />{precio != null ? `Comprar licencia · US$ ${precio}` : "Comprar licencia"}
      </Link>
    </>)
  }
  if (lic.tipo === "porVencer") {
    return caja(16, <>
      {etiqueta}
      <div className="flex items-center gap-2">
        <span className="size-2.5 rounded-full" style={{ background: AMBAR }} />
        <span style={{ color: C.title, fontWeight: 700, fontSize: 20, lineHeight: "24px" }}>{venceEn(lic.dias)}</span>
      </div>
      <p style={{ color: C.muted2, fontSize: 14, lineHeight: "17px" }}>El {lic.fecha} · en {lic.pcs} PC</p>
      <Link to={RUTAS.licencia} className="flex w-full items-center justify-center gap-2 text-white" style={{ background: C.blue, borderRadius: 10, padding: "13px 18px", fontWeight: 600, fontSize: 15, lineHeight: "18px" }}>
        <Key className="size-4" />Renovar un año más
      </Link>
    </>)
  }
  if (lic.tipo === "desconocida") {
    return caja(10, <>
      {etiqueta}
      <p style={{ color: C.muted2, fontSize: 14, lineHeight: "17px" }}>Mirá el estado de tu licencia en la app AriTool.</p>
      <p className="w-full" style={{ color: C.muted, fontSize: 13, lineHeight: "19px" }}>{nota}</p>
    </>)
  }
  return caja(10, <>
    {etiqueta}
    <div className="flex items-center gap-2">
      <span className="size-2.5 rounded-full" style={{ background: C.green }} />
      <span style={{ color: C.title, fontWeight: 700, fontSize: 22, lineHeight: "27px" }}>Activa</span>
    </div>
    <p style={{ color: C.muted2, fontSize: 14, lineHeight: "17px" }}>Hasta el {lic.fecha} · en {lic.pcs} PC</p>
    <p className="w-full" style={{ color: C.muted, fontSize: 13, lineHeight: "19px" }}>{nota}</p>
    <Link to={RUTAS.licencia} className="flex items-center gap-1.5 pt-1.5" style={{ color: C.link, fontWeight: 500, fontSize: 14, lineHeight: "17px" }}>
      Renovar un año más<ArrowRight className="size-[14px]" />
    </Link>
  </>)
}

type CuerpoProps = { carga: Carga; filas: FilaHistorial[]; whatsapp: string; minimo: number | null; precioLicencia: number | null | undefined; salir: () => void; reintentar: () => void }

// ======================= COMPUTADORA =======================
function CuerpoCompu({ carga, filas, whatsapp, minimo, precioLicencia, salir, reintentar }: CuerpoProps) {
  const { listo, lic, saldo, pago, aviso } = useSaldo(carga, minimo)
  const visibles = filas.slice(0, 6)
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
                {!listo ? <Barras /> : (
                  <>
                    <p style={{ color: C.link, fontWeight: 700, fontSize: 12, lineHeight: "15px", letterSpacing: "1.3px" }}>TU SALDO</p>
                    <p style={{ color: "#fff", fontWeight: 700, fontSize: 52, lineHeight: "63px" }}>{usd(saldo)}</p>
                    {aviso ?? <p style={{ color: C.muted2, fontSize: 14, lineHeight: "17px" }}>Sirve para alquiler, Xiaomi FRP, Cuenta MI y Security Plugin.</p>}
                    <div className="flex items-center gap-3.5 pt-2">
                      <Link to={pago ? `${RUTAS.recargar}?paso=3` : RUTAS.recargar} className="flex shrink-0 items-center gap-2 text-white" style={{ background: C.blue, borderRadius: 10, padding: "13px 20px" }}>
                        {pago ? null : <Wallet className="size-[17px]" />}
                        <span style={{ fontWeight: 600, fontSize: 15, lineHeight: "18px" }}>{pago ? "Ver mi pago" : "Recargar saldo"}</span>
                      </Link>
                      {pago
                        ? <span style={{ color: C.faint, fontSize: 12, lineHeight: "15px" }}>Solo un pago a la vez. Si lo cancelás, podés generar otro.</span>
                        : <span style={{ color: C.muted, fontSize: 13, lineHeight: "16px" }}>Con Yape o Binance · se carga solo</span>}
                    </div>
                  </>
                )}
              </div>
              <TarjetaLicencia lic={lic} precio={precioLicencia} />
            </div>

            <div className="flex items-center pt-3">
              <h2 style={{ color: C.muted, fontWeight: 700, fontSize: 12, lineHeight: "15px", letterSpacing: "1.2px" }}>TU HISTORIAL</h2>
              <div className="flex-1" />
              <span style={{ color: C.faint, fontSize: 13, lineHeight: "16px" }}>Cada recarga y cada uso, con su número de pedido</span>
            </div>

            <div className="flex flex-col rounded-[14px]" style={{ background: C.card, border: `1px solid ${C.border}` }}>
              <CabeceraHistorial />
              {!listo ? <FilasCargandoCompu /> : filas.length === 0 ? (
                <div style={{ borderTop: `1px solid ${C.border}` }}><HistorialVacio /></div>
              ) : visibles.map((f, i) => <FilaCompu key={`${f.fecha}-${i}`} f={f} />)}
              {listo && filas.length > 6 ? (
                <Link to={RUTAS.historial} className="flex items-center gap-1.5 pb-4 pl-6 pt-[14px]" style={{ borderTop: `1px solid ${C.border}`, color: C.link, fontWeight: 500, fontSize: 14, lineHeight: "17px" }}>
                  Ver todo el historial<ArrowRight className="size-[14px]" />
                </Link>
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
function CuerpoCelular({ carga, filas, whatsapp, minimo, salir, reintentar }: CuerpoProps) {
  const { listo, lic, saldo, pago, aviso } = useSaldo(carga, minimo)
  const visibles = filas.slice(0, 5)
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
              {!listo ? <Barras /> : (
                <>
                  <p style={{ color: C.link, fontWeight: 700, fontSize: 11, lineHeight: "13px", letterSpacing: "1.2px" }}>TU SALDO</p>
                  <p style={{ color: "#fff", fontWeight: 700, fontSize: 40, lineHeight: "48px" }}>{usd(saldo)}</p>
                  {aviso ?? <p className="w-full" style={{ color: C.muted2, fontSize: 13, lineHeight: "18px" }}>Sirve para alquiler, Xiaomi FRP, Cuenta MI y Security Plugin.</p>}
                  <Link to={pago ? `${RUTAS.recargar}?paso=3` : RUTAS.recargar} className="flex w-full items-center justify-center gap-2 text-white" style={{ background: C.blue, borderRadius: 10, padding: "13px 0" }}>
                    {pago ? null : <Wallet className="size-[17px]" />}
                    <span style={{ fontWeight: 600, fontSize: 15, lineHeight: "18px" }}>{pago ? "Ver mi pago" : "Recargar saldo"}</span>
                  </Link>
                  {pago ? <p style={{ color: C.faint, fontSize: 12, lineHeight: "15px" }}>Solo un pago a la vez. Si lo cancelás, podés generar otro.</p> : null}
                </>
              )}
            </div>
            <div className="flex items-center gap-2.5 rounded-[14px] p-4" style={{ background: C.card, border: `1px solid ${C.border}` }}>
              <div className="flex min-w-0 flex-col gap-[3px]">
                <p style={{ color: C.muted, fontWeight: 700, fontSize: 11, lineHeight: "13px", letterSpacing: "1.1px" }}>LICENCIA ANUAL</p>
                {lic ? (
                  <div className="flex items-center gap-1.5">
                    {lic.tipo === "activa" || lic.tipo === "porVencer" ? <span className="size-2 shrink-0 rounded-full" style={{ background: lic.tipo === "activa" ? C.green : AMBAR }} /> : null}
                    <span className="truncate" style={{ color: C.text, fontWeight: 600, fontSize: 14, lineHeight: "17px" }}>
                      {lic.tipo === "activa" ? `Activa hasta ${lic.fecha}` : lic.tipo === "porVencer" ? venceEn(lic.dias) : lic.tipo === "sin" ? "No tenés licencia" : "Mirala en la app AriTool"}
                    </span>
                  </div>
                ) : <span className="py-[3px]"><Barra w={150} h={11} /></span>}
              </div>
              <div className="flex-1" />
              {lic && lic.tipo !== "desconocida" ? <Link to={RUTAS.licencia} className="shrink-0" style={{ color: C.link, fontWeight: 500, fontSize: 13, lineHeight: "16px" }}>{lic.tipo === "sin" ? "Comprar" : "Renovar"}</Link> : null}
            </div>
          </section>

          <section className="flex flex-col items-start gap-2.5 px-5 pb-6 pt-2">
            <h2 style={{ color: C.muted, fontWeight: 700, fontSize: 11, lineHeight: "13px", letterSpacing: "1.1px" }}>TU HISTORIAL</h2>
            <div className="flex w-full flex-col rounded-[14px]" style={{ background: C.card, border: `1px solid ${C.border}` }}>
              {!listo ? <FilasCargandoCelular /> : filas.length === 0 ? <HistorialVacio /> : visibles.map((f, i) => <FilaCelular key={`${f.fecha}-${i}`} f={f} primera={i === 0} />)}
            </div>
            {listo && filas.length > 5 ? (
              <Link to={RUTAS.historial} className="flex items-center gap-1.5" style={{ color: C.link, fontWeight: 500, fontSize: 13, lineHeight: "16px" }}>
                Ver todo el historial<ArrowRight className="size-[13px]" />
              </Link>
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
        // Pago en curso (uno solo a la vez). Si esta consulta falla, la cuenta se muestra igual, sin el aviso.
        const p = await cobroActivo(ses.access_token).catch(() => null)
        return setCarga({ estado: "listo", datos: r.data, correo: ses.user.email ?? "", pago: p?.ok ? p.data?.activo ?? null : null })
      }
      const motivo = await motivoRechazo(r.status)
      // La sesión venció (W13 S8): vuelve a entrar y regresa acá.
      if (motivo === "vencida") return nav(`${RUTAS.cuenta}?vencida=1`, { replace: true })
      // La cuenta todavía no tiene su perfil de taller: se queda en la web nueva con un aviso.
      if (motivo === "perfil") return setCarga({ estado: "sinPerfil" })
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
  const props: CuerpoProps = { carga, filas, whatsapp, minimo: minimoParaUsar(datos), precioLicencia: datos?.app?.licencia_anual_usd, salir, reintentar: () => void cargar() }

  return (
    <div className="min-h-screen overflow-x-hidden" style={{ background: C.page, color: C.text, fontFamily: "Inter, system-ui, sans-serif", lineHeight: "normal" }}>
      <div className="hidden lg:block">
        <HeaderDesktop datos={datos} />
        {carga.estado === "sinPerfil" ? <SinPerfil whatsapp={whatsapp} movil={false} titulo="Mi cuenta" /> : <CuerpoCompu {...props} />}
        <PieDesktop />
      </div>
      <div className="lg:hidden">
        <HeaderMobile onMenu={() => setMenu(true)} />
        <FranjaSoporte datos={datos} />
        {carga.estado === "sinPerfil" ? <SinPerfil whatsapp={whatsapp} movil titulo="Mi cuenta" /> : <CuerpoCelular {...props} />}
        <PieMobile />
        {menu ? <MenuMobile datos={datos} onClose={() => setMenu(false)} /> : null}
      </div>
    </div>
  )
}
