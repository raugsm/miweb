/**
 * W14 · Recargar saldo, paso a paso (aprobado por Peter 4-nov). Sin ventanas: una decisión por pantalla.
 *   1 Cuánto (1118:2 · celular 1121:2)        2 Cómo pagás (1118:98 · 1134:2)
 *   3 Pagá: Yape (1119:2 · 1121:67) o Binance (1119:187 · 1134:98)        4 Listo (1119:378 · 1134:228)
 *   Cuando algo no sale: W14-E 1133:103 (los avisos van dentro del paso).
 *
 * El paso vive en la dirección (?paso=2&monto=20, ?paso=3): refrescar o volver con el navegador no pierde
 * nada. El cliente tiene UN solo pago a la vez y lo guarda el servidor: al entrar se pregunta si hay uno
 * (`pago_cobro_activo`) y se retoma ESE, nunca se crea otro por las dudas.
 *
 * E9 a E12 (fila nueva de W14-E, 1187:114) los dibujó Ari-Diseño el 5-nov y ESPERAN EL OK DE PETER:
 * no se pudo preparar el pago, Yape apagado, sin conexión y "ese pago se canceló".
 *
 * W15 · Comprar licencia anual (1132:2 y 1132:118) es esta misma página con `producto="licencia"`: cambian el
 * paso 1 (la tarjeta de la licencia) y el 4; los pasos 2 y 3 son los de W14. El precio lo pone el servidor.
 */
import { ArrowRight, Check, CircleAlert, CircleCheck, Clock, Info, LoaderCircle, Lock, Pencil, Timer, Wallet, WifiOff } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"

import { C, RUTAS } from "@/components/aritool/chrome"
import { Aviso, Ayuda, BotonAviso, BotonGrande, BotonWhatsApp, FilaCopiar, Instruccion, PaginaPasos, Pasos, TituloPaso, useCompu, Volver } from "@/components/aritool/pasos"
import { usePrecios } from "@/hooks/use-precios"
import { cobroActivo, cobroCancelar, pagoCobroCrear, pagoCobroEstado, resumenCliente, yapeConfirmar, yapeCrear, yapeEstado, type ResumenCliente } from "@/lib/cuenta"
import { formatearPrecio, PAISES, type Precios } from "@/lib/precios"
import { diaMesAnio, dosDecimales, enGrupos, hoyLocal, licenciaActivada, licenciaVigente, limpiarMonto, metodosDe, minSeg, MONTO_INICIAL, MONTO_MAX, MONTO_MIN, MONTOS, montoDeDireccion, montoElegido, montoValido, pagoDeActivo, pagoTexto, restan, type Metodo, type Pago } from "@/lib/recarga"
import { motivoRechazo } from "@/lib/sesion"
import { useSeo } from "@/lib/seo"
import { supabase } from "@/lib/supabase"

type Producto = Pago["producto"]
const NOMBRES: Record<Producto, string[]> = { credito: ["Cuánto", "Cómo pagás", "Pagá", "Listo"], licencia: ["Licencia", "Cómo pagás", "Pagá", "Listo"] }
const RUTA: Record<Producto, string> = { credito: RUTAS.recargar, licencia: RUTAS.licencia }
/** Lo que trae la licencia (W15-1). */
const LICENCIA_TRAE = [
  "Procesos sin límite de Tecno, Infinix e itel (Security Plugin y AntiCrack).",
  "Vale en 1 PC: la que abras con AriTool cuando la actives.",
  "Si ya tenés una, se te suma un año más.",
  "Xiaomi, FRP, Cuenta MI y Alquiler se siguen pagando con saldo.",
]
const SONDEO_MS = 5000
const DEMORA_MS = 120_000 // con el código de Yape mandado y sin cargarse: "tarda más de lo normal"

/** Lo que salió mal al tocar un botón: sin internet (E11), no se pudo preparar el pago (E9) o Yape apagado (E10). */
type Fallo = "red" | "generar" | "yape"

type Listo = { cargado: number; saldo: number | null; /** Licencia: hasta cuándo quedó activa ("04/11/2027"); null = el servidor todavía no lo dice. */ hasta?: string | null }
/** Qué pasa con el código de Yape que mandó el cliente. */
type Codigo = { tipo: "nada" } | { tipo: "mal"; quedan: number | null } | { tipo: "confirmando" } | { tipo: "pausa"; minutos: number }

const usd = (n: number) => `US$ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const LOGO = { yape: "/brand/yape.webp", binance: "/brand/binance.webp" }
const NOMBRE = { yape: "Yape", binance: "Binance Pay" }

function Logo({ metodo, lado, radio }: { metodo: Metodo; lado: number; radio: number }) {
  return <img src={LOGO[metodo]} alt="" width={lado} height={lado} className="shrink-0 bg-white object-contain" style={{ width: lado, height: lado, borderRadius: radio }} />
}

/** Los 3 casilleros del código de seguridad de Yape. Un solo campo invisible encima: se escribe y se pega como en uno normal. */
function CodigoYape({ valor, onChange, onEnter, mal, apagado, m }: { valor: string; onChange: (v: string) => void; onEnter: () => void; mal: boolean; apagado: boolean; m: boolean }) {
  const [foco, setFoco] = useState(false)
  const lado = m ? 58 : 64
  return (
    <label className="relative flex shrink-0" style={{ gap: m ? 10 : 12 }}>
      <span className="sr-only">Código de seguridad de tu Yape, 3 números</span>
      {[0, 1, 2].map((i) => {
        const activo = foco && i === Math.min(valor.length, 2)
        return (
          <span key={i} className="flex items-center justify-center" style={{ width: lado, height: lado, background: C.cardAlt, borderRadius: 10, border: mal ? "1.5px solid #f87171" : activo ? "1.5px solid #3b82f6" : `1px solid ${C.borderAlt}`, color: C.title, fontWeight: 700, fontSize: m ? 22 : 24 }}>
            {valor[i] ?? ""}
          </span>
        )
      })}
      <input id="codigoYape" inputMode="numeric" autoComplete="off" maxLength={3} value={valor} disabled={apagado} aria-invalid={mal || undefined}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 3))} onKeyDown={(e) => { if (e.key === "Enter") onEnter() }} onFocus={() => setFoco(true)} onBlur={() => setFoco(false)}
        className="absolute inset-0 size-full cursor-text opacity-0" />
    </label>
  )
}

/** "Tenés 14:32 para pagar" (+ "Cancelar este pago" en compu). */
function Tiempo({ falta, cancelar, ocupado, m }: { falta: number; cancelar?: () => void; ocupado: boolean; m: boolean }) {
  return (
    <div className="flex w-full items-center" style={{ gap: m ? 8 : 10, background: C.cardAlt, border: `1px solid ${C.borderSoft}`, borderRadius: 10, padding: m ? 12 : "12px 16px" }}>
      <Timer className={m ? "size-4" : "size-[18px]"} style={{ color: "#fbbf24" }} />
      <span role="timer" style={{ color: "#fcd34d", fontWeight: 600, fontSize: m ? 14 : 15, lineHeight: m ? "17px" : "18px" }}>Tenés {minSeg(falta)} para pagar</span>
      <div className="flex-1" />
      {cancelar ? <button type="button" onClick={cancelar} disabled={ocupado} style={{ color: C.muted, fontWeight: 500, fontSize: 14, lineHeight: "17px", opacity: ocupado ? 0.55 : 1 }}>Cancelar este pago</button> : null}
    </div>
  )
}

export const RecargarPage = () => <PasoAPaso producto="credito" />
export const LicenciaPage = () => <PasoAPaso producto="licencia" />

function PasoAPaso({ producto }: { producto: Producto }) {
  const lic = producto === "licencia"
  const nombres = NOMBRES[producto]
  const nav = useNavigate()
  const m = !useCompu()
  const { datos, pais } = usePrecios()
  const [params, setParams] = useSearchParams()
  const paso = params.get("paso") === "3" ? 3 : params.get("paso") === "2" ? 2 : 1
  useSeo(lic
    ? { titulo: "Licencia anual | AriTool", descripcion: "Comprá o renová la licencia anual de AriTool con Yape o Binance Pay.", ruta: RUTAS.licencia, indexar: false }
    : { titulo: "Recargar saldo | AriTool", descripcion: "Recargá tu saldo de AriTool con Yape o Binance Pay.", ruta: RUTAS.recargar, indexar: false })

  // ----- lo que se sabe del servidor -----
  const [carga, setCarga] = useState<"cargando" | "error" | "lista">("cargando")
  const [pago, setPago] = useState<Pago | null>(null) // el pago en curso, si hay
  const [listo, setListo] = useState<Listo | null>(null)
  // ----- licencia: la que tenía al entrar (undefined = el servidor todavía no la entrega) y el pago que se confirmó sin activarla -----
  const [licAntes, setLicAntes] = useState<ResumenCliente["licencia"]>(undefined)
  const [sinActivar, setSinActivar] = useState<Pago | null>(null)
  // ----- lo que va eligiendo -----
  // Si viene un monto en la dirección (refrescó en el paso 2), se sigue con ese.
  const [tarjeta, setTarjeta] = useState<number | null>(() => {
    const q = montoDeDireccion(params.get("monto"))
    return q == null ? MONTO_INICIAL : MONTOS.includes(q) ? q : null
  })
  const [otro, setOtro] = useState(() => {
    const q = montoDeDireccion(params.get("monto"))
    return q != null && !MONTOS.includes(q) ? String(q) : ""
  })
  const [metodo, setMetodo] = useState<Metodo | null>(null)
  // ----- el paso 3 -----
  const [falta, setFalta] = useState(0)
  const [vencido, setVencido] = useState(false)
  const [codigo, setCodigo] = useState("")
  const [estadoCodigo, setEstadoCodigo] = useState<Codigo>({ tipo: "nada" })
  const [demora, setDemora] = useState(false)
  const [enRevision, setEnRevision] = useState(false) // quiso cancelar y el pago ya se está verificando
  const [qr, setQr] = useState<string | null>(null)
  // ----- botones -----
  const [ocupado, setOcupado] = useState(false)
  const [fallo, setFallo] = useState<Fallo | null>(null)
  const [yapeApagado, setYapeApagado] = useState(false) // el servidor avisó que Yape no está andando
  const [canceladoAfuera, setCanceladoAfuera] = useState(false) // E12: se canceló en otra pestaña
  const enCurso = useRef(false) // contra el doble clic: el estado de React llega un instante tarde

  const monto = montoElegido(tarjeta, otro)
  const metodos = metodosDe(pais)
  const disponibles = metodos.filter((x) => !(x === "yape" && yapeApagado))
  const elegido: Metodo = metodo && disponibles.includes(metodo) ? metodo : disponibles[0] // si cambia de país, Yape deja de estar
  const irA = useCallback((p: 1 | 2 | 3, conMonto?: number) => {
    setFallo(null)
    setParams(p === 1 ? {} : p === 3 ? { paso: "3" } : lic ? { paso: "2" } : { paso: "2", monto: String(conMonto) })
  }, [lic, setParams])

  /** A Ingresar, una sola vez; al volver retoma en el paso donde estaba. */
  const saliendo = useRef(false)
  const aIngresar = useCallback(() => {
    if (saliendo.current) return
    saliendo.current = true
    nav(`${RUTAS.cuenta}?vencida=1&volver=${encodeURIComponent(window.location.pathname + window.location.search)}`, { replace: true })
  }, [nav])
  /** La sesión, o null si no hay (y ya se mandó a Ingresar). */
  const sesion = useCallback(async (): Promise<string | null> => {
    const { data } = await supabase.auth.getSession()
    if (data.session) return data.session.access_token
    aIngresar()
    return null
  }, [aIngresar])
  /** ¿El servidor rechazó la sesión? Entonces a Ingresar. */
  const sesionVencida = useCallback(async (status: number): Promise<boolean> => {
    if ((await motivoRechazo(status)) !== "vencida") return false
    aIngresar()
    return true
  }, [aIngresar])

  /** Pregunta por el pago en curso. Devuelve si pudo preguntar. */
  const traerPago = useCallback(async (): Promise<boolean> => {
    const jwt = await sesion()
    if (!jwt) return false
    const r = await cobroActivo(jwt)
    if (!r.ok) {
      if (!(await sesionVencida(r.status))) setCarga("error")
      return false
    }
    const a = r.data?.activo ? pagoDeActivo(r.data.activo) : null
    setPago(a)
    if (a?.metodo === "yape" && a.codigoDeclarado) {
      setCodigo(a.codigoDeclarado)
      setEstadoCodigo({ tipo: "confirmando" })
    }
    if (lic) { // ¿ya tiene una? Entonces es renovar. Si no se puede saber, se sigue igual.
      const res = await resumenCliente(jwt).catch(() => null)
      if (res?.ok && res.data) setLicAntes(res.data.licencia)
    }
    setCarga("lista")
    return true
  }, [lic, sesion, sesionVencida])

  useEffect(() => {
    traerPago().catch(() => setCarga("error"))
  }, [traerPago])

  // En el paso 3 sin pago (lo abrió a mano, o ya venció): al paso 1. En el 2 manda el monto de la
  // dirección: si no sirve, al paso 1; si es otro que el elegido (Atrás/Adelante del navegador), se toma ese.
  const montoUrl = montoDeDireccion(params.get("monto"))
  useEffect(() => {
    if (carga !== "lista" || listo || sinActivar) return
    if (pago) { // el pago en curso es de lo otro (recarga / licencia): su paso 3 está en la otra página
      if (paso === 3 && pago.producto !== producto) void nav(`${RUTA[pago.producto]}?paso=3`, { replace: true })
      return
    }
    if (paso === 3) return irA(1)
    if (paso !== 2 || lic) return
    if (!montoValido(montoUrl)) return irA(1)
    if (montoUrl !== monto) {
      setTarjeta(MONTOS.includes(montoUrl) ? montoUrl : null)
      setOtro(MONTOS.includes(montoUrl) ? "" : String(montoUrl))
    }
  }, [carga, listo, sinActivar, paso, pago, producto, lic, monto, montoUrl, irA, nav])

  /** Corre una acción de un botón: una sola a la vez, y si se cae la red lo dice. */
  const accion = useCallback(async (f: (jwt: string) => Promise<void>) => {
    if (enCurso.current) return
    enCurso.current = true
    setOcupado(true)
    setFallo(null)
    try {
      const jwt = await sesion()
      if (jwt) await f(jwt)
    } catch {
      setFallo("red")
    } finally {
      enCurso.current = false
      setOcupado(false)
    }
  }, [sesion])

  const limpiarPaso3 = () => {
    setVencido(false)
    setCodigo("")
    setEstadoCodigo({ tipo: "nada" })
    setDemora(false)
    setEnRevision(false)
    setQr(null)
  }

  // ---------- paso 2 → 3: generar el pago ----------
  const generar = (con: Metodo = elegido) => accion(async (jwt) => {
    if (!lic && !montoValido(monto)) return irA(1)
    const cuanto = lic ? 0 : monto ?? 0 // la licencia no lleva monto: el precio lo pone el servidor
    setCanceladoAfuera(false)
    const r = con === "yape" ? await yapeCrear(jwt, cuanto, producto) : await pagoCobroCrear(jwt, cuanto, producto)
    // Ya había uno (otra pestaña, o un doble envío): se muestra ESE, no se crea otro.
    if (r.status === 409 || r.data?.error === "cobro_en_curso") return void (await traerPago())
    if (r.status === 503 && con === "yape") {
      setYapeApagado(true)
      return setFallo("yape")
    }
    if (!r.ok || !r.data?.cobro_id) {
      if (!(await sesionVencida(r.status))) setFallo("generar")
      return
    }
    const d = r.data
    limpiarPaso3()
    setPago({ id: d.cobro_id, metodo: con, producto, creditos: cuanto, monto: d.monto, codigo: d.codigo, destino: d.destino ?? "", pagoUrl: ("pago_url" in d ? d.pago_url : "") ?? "", venceEn: d.vence_en, codigoDeclarado: null })
    irA(3)
  })

  // ---------- cancelar ----------
  const cancelar = () => accion(async (jwt) => {
    if (!pago) return
    const r = await cobroCancelar(jwt, pago.id)
    if (r.ok && (r.data?.cancelado || r.data?.ya)) {
      setPago(null)
      limpiarPaso3()
      if (paso === 3) irA(1)
      return
    }
    if (r.data?.motivo === "en_revision") return setEnRevision(true)
    if (!(await sesionVencida(r.status))) setFallo("red")
  })

  // ---------- llegó el pago: paso 4 ----------
  const terminar = useCallback(async (p: Pago) => {
    let res: ResumenCliente | null = null
    try {
      const { data } = await supabase.auth.getSession()
      const r = data.session ? await resumenCliente(data.session.access_token) : null
      if (r?.ok && r.data) res = r.data
    } catch {
      /* sin el resumen: en la recarga se muestra lo que se cargó y nada más; en la licencia se vuelve a preguntar */
    }
    setPago(null)
    if (p.producto === "licencia") {
      // El pago está confirmado, pero "activa" se dice solo si el servidor lo dice. Antes de la v19 de
      // cliente_resumen la licencia no viene (undefined): ahí se confía en el pago y no se muestra fecha.
      if (!res || (res.licencia !== undefined && !licenciaActivada(licAntes, res.licencia, hoyLocal()))) return setSinActivar(p)
      setSinActivar(null)
      return setListo({ cargado: 0, saldo: null, hasta: res.licencia ? diaMesAnio(res.licencia.fecha_fin) : null })
    }
    setListo({ cargado: p.creditos, saldo: res ? res.saldo_usd ?? res.saldo : null })
  }, [licAntes])

  // Licencia pagada que todavía no figura activa: se vuelve a preguntar hasta que aparezca.
  useEffect(() => {
    if (!sinActivar) return
    const id = window.setInterval(() => void terminar(sinActivar), SONDEO_MS)
    return () => window.clearInterval(id)
  }, [sinActivar, terminar])

  // ---------- Yape: mandar el código de seguridad ----------
  const confirmar = () => accion(async (jwt) => {
    if (!pago || codigo.length < 3 || estadoCodigo.tipo === "pausa") return
    const r = await yapeConfirmar(jwt, pago.id, codigo)
    const d = r.data
    if (r.ok && d && (d.casado || d.ya)) return terminar(pago)
    if (d?.motivo === "codigo_incorrecto" || d?.motivo === "codigo_invalido") return setEstadoCodigo({ tipo: "mal", quedan: typeof d.intentos_restantes === "number" ? d.intentos_restantes : null })
    if (d?.motivo === "bloqueado" || d?.motivo === "bloqueo_temporal") return setEstadoCodigo({ tipo: "pausa", minutos: typeof d.minutos === "number" ? d.minutos : 15 })
    if (r.ok && d) return setEstadoCodigo({ tipo: "confirmando" }) // código anotado: se carga cuando llegue el Yape
    if (!(await sesionVencida(r.status))) setFallo("red")
  })

  // ---------- reloj del pago (en el paso 3 y en el aviso "Tenés un pago esperando") ----------
  useEffect(() => {
    if (!pago) return
    const tic = () => {
      const s = restan(pago)
      setFalta(s)
      if (s > 0) return
      if (paso === 3) setVencido(true)
      else setPago(null) // venció mientras miraba el aviso: ya no hay pago que retomar
    }
    tic()
    const id = window.setInterval(tic, 1000)
    return () => window.clearInterval(id)
  }, [paso, pago])

  // ---------- paso 3: preguntar si ya llegó el pago (también después de vencido: puede llegar tarde) ----------
  useEffect(() => {
    if (paso !== 3 || !pago) return
    let vivo = true
    const preguntar = async () => {
      try {
        const { data } = await supabase.auth.getSession()
        if (!data.session || !vivo) return
        const jwt = data.session.access_token
        const r = pago.metodo === "yape" ? await yapeEstado(jwt, pago.id) : await pagoCobroEstado(jwt, pago.id)
        if (!vivo) return
        if (!r.ok) return void (await sesionVencida(r.status))
        const estado = r.data?.estado
        if (estado === "confirmado" || (r.data && "pagado" in r.data && r.data.pagado)) return void (await terminar(pago))
        if (estado === "caducado") setVencido(true)
        if (estado === "anulado") { // se canceló desde otra pestaña (E12)
          setPago(null)
          limpiarPaso3()
          irA(1)
          setCanceladoAfuera(true)
        }
      } catch {
        /* sin red: se vuelve a preguntar en la próxima vuelta */
      }
    }
    const id = window.setInterval(preguntar, vencido ? SONDEO_MS * 2 : SONDEO_MS)
    const alVolver = () => { if (!document.hidden) void preguntar() } // volvió de la app de Yape o de Binance
    document.addEventListener("visibilitychange", alVolver)
    return () => {
      vivo = false
      window.clearInterval(id)
      document.removeEventListener("visibilitychange", alVolver)
    }
  }, [paso, pago, vencido, terminar, sesionVencida, irA])

  // ---------- Yape: con el código mandado y sin cargarse en 2 minutos ----------
  useEffect(() => {
    if (estadoCodigo.tipo !== "confirmando") return setDemora(false)
    const id = window.setTimeout(() => setDemora(true), DEMORA_MS)
    return () => window.clearTimeout(id)
  }, [estadoCodigo.tipo])

  // ---------- Binance: el QR sale del enlace de pago ----------
  useEffect(() => {
    if (m || !pago || pago.metodo !== "binance" || !pago.pagoUrl) return setQr(null)
    let vivo = true
    import("qrcode").then((Q) => Q.toDataURL(pago.pagoUrl, { margin: 1, width: 300 })).then((url) => { if (vivo) setQr(url) }).catch(() => { if (vivo) setQr(null) })
    return () => { vivo = false }
  }, [m, pago])

  // =============================== dibujo ===============================
  const sinConexion = fallo === "red" ? <Aviso tono="ambar" icono={WifiOff} titulo="Sin conexión" m={m}>Revisá tu internet y probá de nuevo.</Aviso> : null
  const confirmando = <Aviso tono="azul" icono={LoaderCircle} gira titulo="Estamos confirmando tu pago" m={m}>Se carga solo apenas llegue. Puede tardar un par de minutos. Podés cerrar esta página.</Aviso>
  const marco = (hijos: React.ReactNode) => <PaginaPasos datos={datos} m={m}>{hijos}</PaginaPasos>
  const titulo1 = !lic ? "¿Cuánto querés cargar?" : licenciaVigente(licAntes, hoyLocal()) ? "Renovar licencia anual" : "Licencia anual"

  // ---------- paso 4 · Listo ----------
  if (listo) {
    return marco(<>
      <Pasos nombres={nombres} actual={4} todos m={m} />
      <TituloPaso paso={4} de={4} titulo={lic ? "Listo, tu licencia está activa" : "Listo, ya tenés tu saldo"} m={m} />
      <div className="flex w-full flex-col items-start" style={{ gap: m ? 10 : 14, padding: m ? 20 : 32, background: "#0c1f19", border: "1px solid #14532d", borderRadius: 16 }}>
        <div className="flex items-center" style={{ gap: m ? 10 : 14 }}>
          <CircleCheck className={`shrink-0 ${m ? "size-[30px]" : "size-10"}`} style={{ color: "#4ade80" }} />
          <p style={{ color: "#fff", fontWeight: 700, fontSize: m ? 22 : 28, lineHeight: m ? "27px" : "34px" }}>{lic ? (listo.hasta ? `Licencia activa hasta el ${listo.hasta}` : "Licencia activa") : `Cargamos ${usd(listo.cargado)}`}</p>
        </div>
        {lic ? <p style={{ color: "#86efac", fontWeight: 600, fontSize: m ? 17 : 20, lineHeight: m ? "21px" : "24px" }}>Vale en 1 PC</p>
          : listo.saldo != null ? <p style={{ color: "#86efac", fontWeight: 600, fontSize: m ? 17 : 20, lineHeight: m ? "21px" : "24px" }}>Tu saldo ahora: {usd(listo.saldo)}</p> : null}
        <p style={{ color: C.muted2, fontSize: m ? 14 : 15, lineHeight: m ? "17px" : "18px" }}>{lic ? "Abrí AriTool en la PC donde trabajás y se activa sola en esa PC." : "Ya lo podés usar en la app AriTool."}</p>
      </div>
      <BotonGrande onClick={() => nav(RUTAS.miCuenta)} m={m}>Volver a Mi cuenta</BotonGrande>
    </>)
  }

  // Licencia: el pago llegó pero todavía no figura activa. No se dice "activa" hasta que el servidor lo diga.
  if (sinActivar) {
    return marco(<>
      <Pasos nombres={nombres} actual={3} m={m} />
      <TituloPaso paso={3} de={4} titulo={sinActivar.metodo === "yape" ? "Pagá con Yape" : "Pagá con Binance Pay"} m={m} />
      {confirmando}
      <BotonWhatsApp datos={datos} />
      {m ? null : <Ayuda datos={datos} />}
    </>)
  }

  if (carga !== "lista") {
    return marco(<>
      <Volver texto="Volver a Mi cuenta" onClick={() => nav(RUTAS.miCuenta)} m={m} />
      <Pasos nombres={nombres} actual={paso} m={m} />
      {carga === "error" ? (
        <div className="flex w-full max-w-[420px] flex-col items-start gap-4 rounded-2xl p-7" style={{ border: `1px solid ${C.borderSoft}`, background: C.card }}>
          <p style={{ color: C.title, fontWeight: 700, fontSize: 20, lineHeight: "24px" }}>No pudimos cargar tu cuenta</p>
          <p style={{ color: C.muted, fontSize: 14, lineHeight: "20px" }}>Revisá tu internet y probá de nuevo.</p>
          <BotonAviso onClick={() => { setCarga("cargando"); traerPago().catch(() => setCarga("error")) }}>Reintentar</BotonAviso>
        </div>
      ) : <span className="block h-[34px] w-[260px] max-w-full animate-pulse rounded-md" style={{ background: C.border }} />}
    </>)
  }

  // ---------- "Tenés un pago esperando" (E6): en los pasos 1 y 2 no se arma otro mientras haya uno ----------
  if (pago && paso !== 3) {
    return marco(<>
      <Volver texto="Volver a Mi cuenta" onClick={() => nav(RUTAS.miCuenta)} m={m} />
      <Pasos nombres={nombres} actual={paso} m={m} />
      <TituloPaso paso={paso} de={4} titulo={paso === 1 ? titulo1 : "¿Cómo vas a pagar?"} m={m} />
      {enRevision ? confirmando : (
        <Aviso tono="azul" icono={Info} titulo={`Tenés un pago esperando: ${pago.producto === "licencia" ? "licencia anual" : `recarga de ${usd(pago.creditos)}`}`} m={m}>{pagoTexto(pago.metodo, pago.monto)} por {pago.metodo === "yape" ? "Yape" : "Binance"}. Vence en {minSeg(falta || restan(pago))}. Solo se puede tener un pago a la vez.</Aviso>
      )}
      {sinConexion}
      <div className="flex w-full flex-col gap-3.5">
        <BotonAviso onClick={() => (pago.producto === producto ? irA(3) : void nav(`${RUTA[pago.producto]}?paso=3`))}>Seguir con ese pago</BotonAviso>
        {enRevision ? null : <BotonAviso secundario onClick={cancelar} ocupado={ocupado}>Cancelarlo y empezar otro</BotonAviso>}
      </div>
      {m ? null : <Ayuda datos={datos} />}
    </>)
  }

  // ---------- paso 1 · Licencia (W15-1; en celular, adaptada con las medidas de W14) ----------
  if (paso === 1 && lic) {
    const app = datos?.app
    const local = datos && app?.licencia_anual_local != null && datos.pais.moneda !== "usd" && datos.pais.moneda !== "usdt" ? ` · ≈ ${formatearPrecio(app.licencia_anual_local, datos.pais.moneda)}` : ""
    return marco(<>
      <Volver texto="Volver a Mi cuenta" onClick={() => nav(RUTAS.miCuenta)} m={m} />
      <Pasos nombres={nombres} actual={1} m={m} />
      <TituloPaso paso={1} de={4} titulo={titulo1} texto="Para Tecno, Infinix e itel. Con la licencia, esos procesos no te gastan saldo." m={m} />
      {canceladoAfuera ? <Aviso tono="azul" icono={Info} titulo="Ese pago se canceló" m={m}>Lo cancelaste en otra pestaña o ventana. Podés empezar otro acá.</Aviso> : null}
      <div className="flex w-full flex-col items-start" style={{ gap: m ? 12 : 16, padding: m ? 18 : 28, background: "#0f1a2e", border: "2px solid #3b82f6", borderRadius: 16 }}>
        {!datos ? <span className="block animate-pulse rounded-md" style={{ width: 150, height: m ? 41 : 53, background: C.border }} /> : app?.licencia_anual_usd != null ? (
          <div className="flex flex-wrap items-end whitespace-nowrap" style={{ columnGap: m ? 8 : 10 }}>
            <span style={{ color: "#fff", fontWeight: 700, fontSize: m ? 34 : 44, lineHeight: m ? "41px" : "53px" }}>US$ {app.licencia_anual_usd}</span>
            <span style={{ color: C.muted, fontSize: m ? 14 : 16, lineHeight: m ? "17px" : "19px" }}>por 1 año{local}</span>
          </div>
        ) : null}
        {LICENCIA_TRAE.map((t) => (
          <div key={t} className="flex w-full items-start gap-2.5">
            <Check className="size-[18px] shrink-0" style={{ color: "#4ade80" }} />
            <p className="min-w-0 flex-1" style={{ color: "#d1d5db", fontSize: m ? 14 : 15, lineHeight: m ? "20px" : "22px" }}>{t}</p>
          </div>
        ))}
      </div>
      <BotonGrande onClick={() => irA(2)} m={m}>Seguir con la licencia</BotonGrande>
      {m ? null : <Ayuda datos={datos} />}
    </>)
  }

  // ---------- paso 1 · Cuánto ----------
  if (paso === 1) {
    const sirve = montoValido(monto)
    const aprox = (n: number) => (datos?.app?.credito_local != null && datos.pais.moneda !== "usd" && datos.pais.moneda !== "usdt" ? `≈ ${formatearPrecio(n * datos.app.credito_local, datos.pais.moneda)}` : null)
    const tarjetaMonto = (n: number) => {
      const sel = !otro && tarjeta === n
      return (
        <button key={n} type="button" aria-pressed={sel} onClick={() => { setTarjeta(n); setOtro("") }} className={`flex min-w-0 flex-1 flex-col items-center whitespace-nowrap rounded-[14px] ${m ? "" : "self-stretch"}`}
          style={{ gap: m ? 3 : 4, padding: m ? "18px 0" : "22px 0", background: sel ? "#0f1a2e" : C.card, border: sel ? "2px solid #3b82f6" : `1px solid ${C.borderSoft}` }}>
          <span style={{ color: sel ? "#fff" : "#d1d5db", fontWeight: 700, fontSize: m ? 26 : 30, lineHeight: m ? "31px" : "36px" }}>US$ {n}</span>
          {aprox(n) ? <span style={{ color: C.muted, fontSize: m ? 13 : 14, lineHeight: m ? "16px" : "17px" }}>{aprox(n)}</span> : null}
          {sel && !m ? <span className="flex items-center gap-1.5 pt-1.5" style={{ color: "#60a5fa", fontWeight: 600, fontSize: 13, lineHeight: "16px" }}><Check className="size-[15px]" />Elegido</span> : null}
        </button>
      )
    }
    return marco(<>
      <Volver texto="Volver a Mi cuenta" onClick={() => nav(RUTAS.miCuenta)} m={m} />
      <Pasos nombres={nombres} actual={1} m={m} />
      <TituloPaso paso={1} de={4} titulo="¿Cuánto querés cargar?" texto={m ? undefined : "Elegí un monto. El saldo sirve para alquiler, Xiaomi FRP, Cuenta MI y Security Plugin."} m={m} />
      {canceladoAfuera ? <Aviso tono="azul" icono={Info} titulo="Ese pago se canceló" m={m}>Lo cancelaste en otra pestaña o ventana. Podés empezar otro acá.</Aviso> : null}
      {m ? (
        <div className="flex w-full flex-col gap-2.5">
          <div className="flex w-full items-center gap-2.5">{MONTOS.slice(0, 2).map(tarjetaMonto)}</div>
          <div className="flex w-full items-center gap-2.5">{MONTOS.slice(2).map(tarjetaMonto)}</div>
        </div>
      ) : <div className="flex w-full items-start gap-4">{MONTOS.map(tarjetaMonto)}</div>}
      <label htmlFor="otroMonto" className="flex w-full items-center" style={{ gap: m ? 8 : 12, padding: m ? 14 : 16, background: C.card, border: `1px solid ${C.borderSoft}`, borderRadius: 12 }}>
        {m ? null : <Pencil className="size-[18px]" style={{ color: C.muted2 }} />}
        <span style={{ color: C.muted2, fontWeight: 500, fontSize: 15, lineHeight: "18px" }}>Otro monto</span>
        <div className="flex-1" />
        <span className="flex items-center gap-1.5" style={m ? undefined : { width: 180, height: 44, padding: "0 14px", background: C.cardAlt, border: `1px solid ${otro && !sirve ? "#f87171" : C.borderAlt}`, borderRadius: 10 }}>
          <span style={{ color: m ? C.faint : C.muted, fontWeight: m ? 400 : 500, fontSize: 15, lineHeight: "18px" }}>US$</span>
          <input id="otroMonto" inputMode="numeric" autoComplete="off" value={otro} placeholder={m ? "…" : `mín. ${MONTO_MIN}`} aria-invalid={(otro !== "" && !sirve) || undefined}
            onChange={(e) => setOtro(limpiarMonto(e.target.value))} onKeyDown={(e) => { if (e.key === "Enter" && sirve) irA(2, monto) }}
            className="h-[18px] min-w-0 bg-transparent text-[15px] leading-[18px] outline-none placeholder:text-[#5b6475] supports-[-webkit-touch-callout:none]:text-[16px]" style={{ color: C.text, width: m ? 64 : "100%" }} />
        </span>
      </label>
      {otro && !sirve ? <Aviso tono="rojo" icono={CircleAlert} titulo="Ese monto no se puede" m={m}>Elegí entre US$ {MONTO_MIN} y US$ {MONTO_MAX}.</Aviso> : null}
      <BotonGrande onClick={() => { if (sirve) irA(2, monto) }} apagado={!sirve} flecha m={m}>{sirve ? `Seguir con US$ ${monto}` : "Seguir"}</BotonGrande>
      {m ? null : <Ayuda datos={datos} />}
    </>)
  }

  // ---------- paso 2 · Cómo pagás ----------
  if (paso === 2 && (lic || (montoValido(monto) && monto === montoUrl))) {
    const nombrePais = PAISES.find((p) => p.codigo === pais)?.nombre.replace(/ \(.*\)$/, "") ?? ""
    const paga = (met: Metodo) => precioDe(datos, met, lic ? null : monto)
    const precioLic = datos?.app?.licencia_anual_usd
    return marco(<>
      <Volver texto={m ? "Volver" : "Volver al paso anterior"} onClick={() => irA(1)} m={m} />
      <Pasos nombres={nombres} actual={2} m={m} />
      <TituloPaso paso={2} de={4} titulo="¿Cómo vas a pagar?" texto={m || !metodos.includes("yape") ? undefined : `Tocá el que usás. Te mostramos solo los que funcionan en ${nombrePais}.`} m={m} />
      <div className="flex w-full items-center" style={{ gap: m ? 8 : 10, padding: m ? "12px 13px" : "12px 16px", background: C.cardAlt, border: `1px solid ${C.borderSoft}`, borderRadius: 10 }}>
        <Wallet className={m ? "size-[15px]" : "size-4"} style={{ color: C.muted2 }} />
        {lic ? (
          <span style={{ color: C.muted2, fontSize: m ? 14 : 15, lineHeight: m ? "17px" : "18px" }}>Vas a comprar la licencia anual{precioLic != null ? <> · <b style={{ color: C.title, fontWeight: 700 }}>{usd(precioLic)}</b></> : null}</span>
        ) : <>
          <span style={{ color: C.muted2, fontSize: m ? 14 : 15, lineHeight: m ? "17px" : "18px" }}>Vas a cargar <b style={{ color: C.title, fontWeight: 700 }}>{usd(monto ?? 0)}</b></span>
          <div className="flex-1" />
          <button type="button" onClick={() => irA(1)} style={{ color: C.link, fontWeight: 500, fontSize: m ? 13 : 14, lineHeight: m ? "16px" : "17px" }}>Cambiar</button>
        </>}
      </div>
      {metodos.includes("yape") ? null : <Aviso tono="azul" icono={Info} titulo="En tu país, por ahora, con Binance" m={m}>Yape es solo para Perú. Si estás en Perú, cambiá el país arriba.</Aviso>}
      <div role="radiogroup" aria-label="Forma de pago" className="flex w-full flex-col" style={{ gap: m ? 18 : 14 }}>
        {metodos.map((met) => {
          const sel = met === elegido
          const apagada = !disponibles.includes(met)
          return (
            <button key={met} type="button" role="radio" aria-checked={sel} disabled={apagada} onClick={() => { setMetodo(met); setFallo(null) }} className="flex w-full items-center whitespace-nowrap rounded-[14px] text-left"
              style={{ gap: m ? 14 : 18, padding: m ? 16 : 20, background: sel ? "#0f1a2e" : C.card, border: sel ? "2px solid #3b82f6" : `1px solid ${C.borderSoft}`, opacity: apagada ? 0.45 : 1 }}>
              <Logo metodo={met} lado={m ? 44 : 56} radio={m ? 10 : 12} />
              <span className="flex flex-col items-start" style={{ gap: m ? 2 : 4 }}>
                <span style={{ color: C.title, fontWeight: 700, fontSize: m ? 17 : 20, lineHeight: m ? "21px" : "24px" }}>{NOMBRE[met]}</span>
                <span style={{ color: C.muted, fontSize: m ? 13 : 14, lineHeight: m ? "16px" : "17px" }}>{m ? (paga(met) ? `Pagás ${paga(met)}` : "") : met === "yape" ? "Desde tu celular, con QR o número" : "Con USDT, desde la app de Binance"}</span>
              </span>
              <span className="flex-1" />
              {!m && paga(met) ? (
                <span className="flex flex-col items-end gap-1">
                  <span style={{ color: C.muted, fontSize: 12, lineHeight: "15px" }}>Pagás</span>
                  <span style={{ color: C.title, fontWeight: 700, fontSize: 20, lineHeight: "24px" }}>{paga(met)}</span>
                </span>
              ) : null}
              <span className="flex shrink-0 items-center justify-center rounded-full" style={{ width: m ? 24 : 26, height: m ? 24 : 26, border: `2px solid ${sel ? "#3b82f6" : "#2a3650"}` }}>
                {sel ? <span className="block rounded-full" style={{ width: m ? 11 : 12, height: m ? 11 : 12, background: "#3b82f6" }} /> : null}
              </span>
            </button>
          )
        })}
      </div>
      {sinConexion}
      {fallo === "generar" ? (
        <>
          <Aviso tono="rojo" icono={CircleAlert} titulo="No se pudo preparar tu pago" m={m}>Probá de nuevo en un momento. Si sigue pasando, escribinos y te ayudamos.</Aviso>
          <div className="flex w-full flex-col gap-3.5">
            <BotonAviso onClick={() => generar()} ocupado={ocupado}>Probar de nuevo</BotonAviso>
            <BotonWhatsApp datos={datos} />
          </div>
        </>
      ) : fallo === "yape" ? (
        <>
          <Aviso tono="azul" icono={Info} titulo="Por ahora, con Binance Pay" m={m}>Yape no está disponible en este momento. Pagá con Binance Pay o probá con Yape más tarde.</Aviso>
          <BotonAviso onClick={() => generar("binance")} ocupado={ocupado}>Pagar con Binance Pay</BotonAviso>
        </>
      ) : <BotonGrande onClick={() => generar()} ocupado={ocupado} flecha m={m}>Seguir con {elegido === "yape" ? "Yape" : "Binance Pay"}</BotonGrande>}
      {m ? null : <Ayuda datos={datos} />}
    </>)
  }

  // ---------- paso 3 · Pagá ----------
  if (!pago || pago.producto !== producto) return marco(null) // el efecto de arriba ya lo está acomodando
  const yape = pago.metodo === "yape"
  const cabeza = <>
    <Volver texto={m ? "Volver" : "Volver al paso anterior"} onClick={() => irA(2, pago.creditos)} m={m} />
    <Pasos nombres={nombres} actual={3} m={m} />
  </>
  const linea = `${pagoTexto(pago.metodo, pago.monto)} → ${lic ? "licencia anual" : `se cargan ${usd(pago.creditos)}`}`
  const metodoLinea = (
    <div className="flex items-center" style={{ gap: m ? 10 : 12 }}>
      <Logo metodo={pago.metodo} lado={m ? 34 : 40} radio={m ? 7 : 9} />
      <span style={{ color: C.muted2, fontWeight: 500, fontSize: m ? 14 : 16, lineHeight: m ? "17px" : "19px" }}>{m ? linea : `${NOMBRE[pago.metodo]} · ${linea}`}</span>
    </div>
  )

  // Se terminó el tiempo (E5). Si el pago llega igual, el sondeo de arriba lo pasa a "Listo".
  if (vencido) {
    return marco(<>
      {cabeza}
      <TituloPaso paso={3} de={4} titulo={yape ? "Pagá con Yape" : "Pagá con Binance Pay"} m={m} />
      <Aviso tono="ambar" icono={Timer} titulo="Se terminó el tiempo para pagar" m={m}>Si ya pagaste el monto exacto, igual se carga y lo vas a ver en tu historial. Si no pagaste, empezá de nuevo.</Aviso>
      <div className="flex w-full flex-col gap-3.5">
        <BotonAviso onClick={() => { setPago(null); limpiarPaso3(); irA(1) }}>Empezar de nuevo</BotonAviso>
        <BotonAviso secundario onClick={() => nav(RUTAS.historial)}>Ver mi historial</BotonAviso>
      </div>
      {m ? null : <Ayuda datos={datos} />}
    </>)
  }

  const nota = (texto: string) => <p className="w-full" style={{ color: C.muted, fontSize: m ? 12 : 13, lineHeight: m ? "15px" : "16px" }}>{texto}</p>
  const tiempo = <Tiempo falta={falta} cancelar={m ? undefined : cancelar} ocupado={ocupado} m={m} />

  if (yape) {
    const pausa = estadoCodigo.tipo === "pausa"
    // Mientras se confirma (E2) no hay casilleros ni botón: así no se manda dos veces. Si tarda (E3) vuelven,
    // porque un código mal tipeado no tiene otra forma de corregirse.
    const sinCasilleros = pausa || (estadoCodigo.tipo === "confirmando" && !demora)
    const botonConfirmar = (
      <button type="button" onClick={confirmar} disabled={ocupado || codigo.length < 3} aria-busy={ocupado || undefined} className={`flex items-center gap-2.5 text-white ${m ? "w-full justify-center" : "min-w-0 flex-1"}`}
        style={{ background: "#3b82f6", borderRadius: 12, padding: m ? "16px 0" : "20px 26px", fontWeight: 700, fontSize: m ? 17 : 18, lineHeight: m ? "21px" : "22px", opacity: ocupado || codigo.length < 3 ? 0.55 : 1 }}>
        Confirmar mi pago<ArrowRight className={m ? "size-[18px]" : "size-5"} />
      </button>
    )
    const avisosCodigo = <>
      {estadoCodigo.tipo === "mal" ? <Aviso tono="rojo" icono={CircleAlert} titulo="Ese código no coincide" m={m}>Fijate el código de seguridad en tu comprobante de Yape.{estadoCodigo.quedan != null ? ` Te ${estadoCodigo.quedan === 1 ? "queda 1 intento" : `quedan ${estadoCodigo.quedan} intentos`}.` : ""}</Aviso> : null}
      {estadoCodigo.tipo === "confirmando" && !demora ? confirmando : null}
      {estadoCodigo.tipo === "confirmando" && demora ? <>
        <Aviso tono="ambar" icono={Clock} titulo="Está tardando más de lo normal" m={m}>Si ya pagaste el monto exacto, se va a cargar igual. Si pasan 10 minutos y no aparece, escribinos.</Aviso>
        <BotonWhatsApp datos={datos} />
      </> : null}
      {pausa ? <>
        <Aviso tono="rojo" icono={Lock} titulo="Pausamos los intentos un rato" m={m}>Por seguridad, después de 3 códigos que no coinciden esperamos {estadoCodigo.minutos} minutos. Si ya pagaste, escribinos y lo cargamos a mano.</Aviso>
        <BotonWhatsApp datos={datos} />
      </> : null}
    </>
    const casilleros = <CodigoYape valor={codigo} onChange={(v) => { setCodigo(v); setFallo(null); if (estadoCodigo.tipo === "mal") setEstadoCodigo({ tipo: "nada" }) }} onEnter={confirmar} mal={estadoCodigo.tipo === "mal"} apagado={ocupado} m={m} />
    return marco(<>
      {cabeza}
      <TituloPaso paso={3} de={4} titulo="Pagá con Yape" texto={m ? "Desde este mismo celular: copiá el número, yapeá y volvé acá." : "Hacé estos 3 pasos en tu celular. No cierres esta página."} m={m} />
      {metodoLinea}
      {m ? (
        <Instruccion n={1} titulo="Copiá el número de Yape" m>
          <FilaCopiar etiqueta="Yapeá a · AriTool" valor={enGrupos(pago.destino)} copia={pago.destino} botonAzul m />
        </Instruccion>
      ) : (
        <Instruccion n={1} titulo="Abrí Yape y yapeá" m={false}>
          <div className="flex w-full items-start gap-[18px]">
            <img src="/yape-qr.png" alt="QR de Yape de AriTool" width={150} height={150} className="size-[150px] shrink-0 rounded-xl bg-white object-contain" />
            <div className="flex min-w-0 flex-1 flex-col items-start gap-2.5">
              <p className="w-full" style={{ color: C.muted2, fontSize: 14, lineHeight: "20px" }}>Escaneá este QR desde Yape, o yapeá al número:</p>
              <FilaCopiar etiqueta="Número de Yape" valor={enGrupos(pago.destino)} copia={pago.destino} m={false} />
              {nota("A nombre de AriTool")}
            </div>
          </div>
        </Instruccion>
      )}
      <Instruccion n={2} titulo={m ? "Yapeá este monto exacto" : "Poné este monto exacto"} m={m}>
        <FilaCopiar etiqueta="Monto exacto" valor={`S/ ${pago.monto}`} copia={pago.monto} fuerte grande={m ? 26 : 28} m={m} />
        {nota(m ? "Sin cambiar los centavos." : "Sin cambiar los centavos. Si ponés otro monto, no se carga solo.")}
      </Instruccion>
      <Instruccion n={3} titulo={m ? "Volvé acá y poné el código" : "Escribí el código de seguridad de tu Yape"} m={m}>
        {nota(m ? "Son los 3 números de seguridad que te da Yape al pagar." : "Son 3 números. Te aparecen en Yape después de pagar.")}
        {avisosCodigo}
        {sinCasilleros ? null : m ? casilleros : <div className="flex w-full items-center gap-3">{casilleros}{botonConfirmar}</div>}
      </Instruccion>
      {m && !sinCasilleros ? botonConfirmar : null}
      {enRevision ? confirmando : null}
      {sinConexion}
      {tiempo}
      {m ? (
        <p className="flex w-full items-start gap-2" style={{ color: C.muted, fontSize: 12, lineHeight: "17px" }}><Info className="mt-px size-[15px] shrink-0" />¿Estás en la compu? Ahí te mostramos el QR para escanear con el celular.</p>
      ) : <Ayuda datos={datos} />}
    </>)
  }

  // Binance Pay
  return marco(<>
    {cabeza}
    <TituloPaso paso={3} de={4} titulo="Pagá con Binance Pay" texto={m ? undefined : "Hacé estos 3 pasos en Binance. Se carga solo apenas llegue."} m={m} />
    {metodoLinea}
    {m ? (
      <Instruccion n={1} titulo="En Binance: Pay → Enviar" m>
        <FilaCopiar etiqueta="Pay ID" valor={enGrupos(pago.destino)} copia={pago.destino} botonAzul grande={19} m />
      </Instruccion>
    ) : (
      <Instruccion n={1} titulo="Abrí Binance y buscá a quién pagar" m={false}>
        <div className="flex w-full items-start gap-[18px]">
          {qr ? <img src={qr} alt="QR de Binance Pay" width={150} height={150} className="size-[150px] shrink-0 rounded-xl bg-white" /> : null}
          <div className="flex min-w-0 flex-1 flex-col items-start gap-2.5">
            <p className="w-full" style={{ color: C.muted2, fontSize: 14, lineHeight: "20px" }}>{qr ? "En Binance tocá Pay → Enviar. Escaneá este QR o pegá el Pay ID:" : "En Binance tocá Pay → Enviar y pegá el Pay ID:"}</p>
            <FilaCopiar etiqueta="Pay ID" valor={enGrupos(pago.destino)} copia={pago.destino} m={false} />
          </div>
        </div>
      </Instruccion>
    )}
    <Instruccion n={2} titulo={m ? "Poné el monto exacto" : "Poné este monto exacto"} m={m}>
      <FilaCopiar etiqueta="Monto exacto" valor={`${pago.monto} USDT`} copia={pago.monto} botonAzul={m} grande={m ? 24 : 28} m={m} />
      {m ? null : nota("Sin cambiar los centavos.")}
    </Instruccion>
    <Instruccion n={3} titulo="En la nota, pegá este código" m={m}>
      <FilaCopiar etiqueta="Código para la nota (obligatorio)" valor={pago.codigo} fuerte grande={m ? 24 : 28} m={m} />
      {nota("Sin este código no sabemos que el pago es tuyo.")}
    </Instruccion>
    {enRevision ? confirmando : (
      <div role="status" className="flex w-full items-center gap-3" style={{ background: "#0f1a2e", border: "1px solid #1e3a5f", borderRadius: 12, padding: m ? 14 : 18 }}>
        <LoaderCircle className={`animate-spin ${m ? "size-[18px]" : "size-[22px]"}`} style={{ color: "#60a5fa" }} />
        {m ? <span style={{ color: C.text, fontWeight: 600, fontSize: 14, lineHeight: "17px" }}>Esperando tu pago… se carga solo</span> : (
          <div className="flex flex-col gap-0.5">
            <span style={{ color: C.text, fontWeight: 700, fontSize: 16, lineHeight: "19px" }}>Esperando tu pago…</span>
            <span style={{ color: C.muted2, fontSize: 13, lineHeight: "16px" }}>No hace falta tocar nada más: se carga solo.</span>
          </div>
        )}
      </div>
    )}
    {sinConexion}
    {tiempo}
    {m ? null : <Ayuda datos={datos} />}
  </>)
}

/**
 * Lo que va a pagar con esa forma, según los precios en vivo: "S/ 70.00" / "20.00 USDT". `monto` null = la
 * licencia anual. Devuelve null si todavía no se sabe. Es orientativo: el monto exacto lo da el servidor en el paso 3.
 */
function precioDe(datos: Precios | null, metodo: Metodo, monto: number | null): string | null {
  const app = datos?.app
  if (!app) return null
  const de = (unidad: number | null, licencia: number | null) => (monto == null ? licencia : unidad != null ? monto * unidad : null)
  if (metodo === "yape") {
    const soles = de(app.credito_local, app.licencia_anual_local)
    return datos.pais.moneda === "pen" && soles != null ? `S/ ${dosDecimales(soles)}` : null
  }
  const usdt = de(app.credito_usd, app.licencia_anual_usd)
  return usdt != null ? `${dosDecimales(usdt)} USDT` : null
}
