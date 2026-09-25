import { useCallback, useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  Activity,
  Download,
  HelpCircle,
  LifeBuoy,
  RefreshCw,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react"

import { Container } from "@/components/Container"
import { OnboardingTour, type TourStep } from "@/components/OnboardingTour"
import { RecargaBinance } from "@/components/RecargaBinance"
import { SearchableSelect } from "@/components/SearchableSelect"
import { Button } from "@/components/ui/button"
import { PAISES } from "@/data/paises"
import { resumenCliente, completarCuenta, verificado, type ResumenCliente } from "@/lib/cuenta"
import { supabase } from "@/lib/supabase"

const inputClass =
  "mt-1 h-11 w-full rounded-lg border border-line bg-field px-3 text-sm text-foreground placeholder:text-foreground/30 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"

const TOUR_KEY = "ariad-tour-panel-v1"

const tourSteps: TourStep[] = [
  {
    id: "tour-saldo",
    title: "Tus créditos",
    body: "Este es tu saldo. Cada proceso descuenta créditos: 1 crédito = 1 proceso = $1. Sin créditos no se puede iniciar un proceso.",
  },
  {
    id: "tour-recargar",
    title: "Recargá al instante",
    body: "Pagás con Binance Pay: te damos el monto exacto y un código, pagás desde tu Binance y los créditos entran solos, sin avisar a nadie.",
  },
  {
    id: "tour-descargar",
    title: "Descargá la app",
    body: "Bajá Ari-Tool para Windows: es el programa donde hacés los procesos (remover Security Plugin y AntiCrack).",
  },
  {
    id: "tour-stats",
    title: "Tu resumen",
    body: "De un vistazo: procesos hechos, créditos usados, créditos cargados y el estado de tu cuenta.",
  },
  {
    id: "tour-pasos",
    title: "Cómo se trabaja",
    body: "En la app: elegí el modelo, confirmá y flasheá. La ROM de tu modelo ya viene lista; el crédito se descuenta al terminar.",
  },
  {
    id: "tour-historial",
    title: "Tu historial",
    body: "Cada recarga y cada proceso quedan registrados acá, con fecha y detalle. Así siempre sabés en qué anda tu cuenta.",
  },
]

function fmtFecha(iso: string): string {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) {
      return iso
    }
    return `${d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" })} ${d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}`
  } catch {
    return iso
  }
}

function fmtDia(iso: string): string {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) {
      return iso
    }
    return d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" })
  } catch {
    return iso
  }
}

const tipoLabel: Record<string, string> = {
  recarga: "Recarga",
  consumo: "Proceso",
  ajuste: "Ajuste",
  devolucion: "Devolución",
}

const tipoColor: Record<string, string> = {
  recarga: "border-[#1C5A44] bg-[#0F2E24] text-[#7CE6B4]",
  consumo: "border-[#5A4A20] bg-[#2E2513] text-[#F0C97D]",
  ajuste: "border-[#2A4C86] bg-[#14213C] text-[#A9C8F7]",
  devolucion: "border-[#4A2A66] bg-[#251437] text-[#C9A9F7]",
}

const estadoTrabajo: Record<string, { label: string; color: string }> = {
  listo: { label: "Completado", color: "border-[#1C5A44] bg-[#0F2E24] text-[#7CE6B4]" },
  en_proceso: { label: "En proceso", color: "border-[#2A4C86] bg-[#14213C] text-[#A9C8F7]" },
  fallido: { label: "Fallido", color: "border-[#5A2620] bg-[#2E1513] text-[#F0A49D]" },
}

function Badge({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-medium ${className}`}>
      {children}
    </span>
  )
}

// Tarjeta de estadística con ícono y micro-interacción al pasar el cursor.
function StatCard({
  icon,
  label,
  value,
  hint,
  valueClass = "text-foreground",
}: {
  icon: React.ReactNode
  label: string
  value: React.ReactNode
  hint: string
  valueClass?: string
}) {
  return (
    <div className="group rounded-2xl border border-line bg-card p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition-[transform,border-color] duration-300 hover:-translate-y-0.5 hover:border-cobalt/40">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium tracking-[0.14em] text-foreground/45 uppercase">{label}</p>
        <span className="flex size-8 items-center justify-center rounded-lg border border-line bg-field text-foreground/50 transition-colors group-hover:text-cyan">
          {icon}
        </span>
      </div>
      <p className={`mt-2 text-3xl font-semibold tracking-tight ${valueClass}`}>{value}</p>
      <p className="mt-1 text-xs text-foreground/45">{hint}</p>
    </div>
  )
}

export function DashboardPage() {
  const nav = useNavigate()
  const [cargando, setCargando] = useState(true)
  const [correo, setCorreo] = useState("")
  const [datos, setDatos] = useState<ResumenCliente | null>(null)
  const [error, setError] = useState<"sin_cuenta" | "conexion" | null>(null)
  const [modo, setModo] = useState<"datos" | "completar">("datos")
  const [nombreC, setNombreC] = useState("")
  const [paisC, setPaisC] = useState("PE")
  const [creando, setCreando] = useState(false)
  const [jwt, setJwt] = useState("")
  const [recarga, setRecarga] = useState(false)
  const [tour, setTour] = useState(false)

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const { data: s } = await supabase.auth.getSession()
      const ses = s.session
      if (!ses) {
        nav("/cuenta")
        return
      }
      setCorreo(ses.user.email ?? "")
      setJwt(ses.access_token)
      const r = await resumenCliente(ses.access_token)
      if (r.ok && r.data) {
        setDatos(r.data)
        setError(null)
        setModo("datos")
        return
      }
      if (r.status === 403) {
        // ¿Todavia no tiene perfil creado? → completar registro.
        const v = await verificado(ses.access_token)
        if (v.ok && v.data?.estado === "ausente") {
          const meta = ses.user.user_metadata as
            | { full_name?: string; name?: string }
            | undefined
          setNombreC(meta?.full_name ?? meta?.name ?? (ses.user.email ?? "").split("@")[0])
          setError(null)
          setModo("completar")
          return
        }
        setError("sin_cuenta")
        return
      }
      setError("conexion")
    } catch {
      setError("conexion")
    } finally {
      setCargando(false)
    }
  }, [nav])

  useEffect(() => {
    void cargar()
  }, [cargar])

  // Tutorial automático SOLO la primera vez que un técnico entra a su panel.
  // Se marca como visto AL ABRIRLO (no al cerrarlo): así nunca reaparece solo,
  // ni aunque recargue la página o vuelva a entrar. El ref evita repetirlo dentro
  // de la misma sesión aunque los datos se recarguen (Actualizar, recarga, etc.).
  // Para verlo de nuevo cuando quiera, está el botón "Ver tutorial".
  const tourAuto = useRef(false)
  useEffect(() => {
    if (modo !== "datos" || error || cargando || !datos) return
    if (tourAuto.current) return
    let vista = false
    try {
      vista = Boolean(localStorage.getItem(TOUR_KEY))
    } catch {
      vista = false
    }
    if (vista) return
    tourAuto.current = true
    try {
      localStorage.setItem(TOUR_KEY, "1")
    } catch {
      /* sin persistencia: el ref igual evita repetirlo en esta sesión */
    }
    const t = window.setTimeout(() => setTour(true), 700)
    return () => window.clearTimeout(t)
  }, [modo, error, cargando, datos])

  function cerrarTour() {
    setTour(false)
  }

  async function salir() {
    await supabase.auth.signOut()
    nav("/cuenta")
  }

  async function completarRegistro() {
    try {
      setCreando(true)
      const { data: s } = await supabase.auth.getSession()
      if (!s.session) {
        nav("/cuenta")
        return
      }
      const r = await completarCuenta(s.session.access_token, nombreC.trim(), paisC)
      if (!r.ok) {
        setModo("datos")
        setError("conexion")
        return
      }
      await cargar()
    } finally {
      setCreando(false)
    }
  }

  const wsp = datos?.parametros?.soporte_whatsapp ?? ""
  const costo = datos?.parametros?.credito_por_tramite ?? "1"
  const precio = datos?.parametros?.precio_credito_usd ?? "1"
  const saldo = datos?.saldo ?? 0
  const costoNum = parseInt(costo, 10) || 1
  const alcanza = saldo >= costoNum
  const procesosPosibles = Math.floor(saldo / costoNum)
  const totales = datos?.totales ?? { procesos: 0, consumidos: 0, recargados: 0 }
  const cred = (n: number) => (n === 1 ? "crédito" : "créditos")
  const proc = (n: number) => (n === 1 ? "proceso" : "procesos")

  return (
    <>
      <section className="relative overflow-hidden border-b border-line bg-carbon/40 py-12 sm:py-16">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 right-0 h-64 w-96 rounded-full bg-[radial-gradient(closest-side,rgba(0,82,212,0.16),transparent)]"
        />
        <Container>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-500">
              <p className="text-xs font-medium tracking-[0.2em] text-foreground/45 uppercase">
                Mi panel
              </p>
              <h1 className="mt-3 text-3xl leading-[1.05] font-semibold tracking-tight text-balance text-foreground sm:text-4xl">
                Hola{datos?.nombre ? `, ${datos.nombre}` : ""} 👋
              </h1>
              {correo ? <p className="mt-2 text-sm text-foreground/55">{correo}</p> : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {modo === "datos" && !error ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 rounded-lg border-line bg-transparent text-foreground hover:border-cobalt/40 hover:bg-foreground/[0.04]"
                  onClick={() => setTour(true)}
                >
                  <HelpCircle aria-hidden="true" className="size-4" />
                  Ver tutorial
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-lg border-line bg-transparent text-foreground hover:border-foreground/30 hover:bg-foreground/[0.04]"
                onClick={() => void cargar()}
                disabled={cargando}
              >
                <RefreshCw aria-hidden="true" className={`size-4 ${cargando ? "animate-spin" : ""}`} />
                {cargando ? "Actualizando…" : "Actualizar"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-lg border-line bg-transparent text-foreground hover:border-foreground/30 hover:bg-foreground/[0.04]"
                onClick={salir}
              >
                Cerrar sesión
              </Button>
            </div>
          </div>
        </Container>
      </section>

      <section className="py-12 sm:py-16">
        <Container>
          {modo === "completar" ? (
            <div className="mx-auto max-w-xl rounded-2xl border border-line bg-card p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
              <h2 className="text-base font-semibold tracking-tight text-foreground">
                Completá tu registro
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-foreground/65">
                Tu correo ya quedó verificado. Solo falta tu país para crear la
                cuenta y entrar a tu panel.
              </p>
              <label className="mt-4 block text-sm text-foreground/65" htmlFor="nombreC">
                Nombre
              </label>
              <input
                id="nombreC"
                value={nombreC}
                onChange={(e) => setNombreC(e.target.value)}
                className={inputClass}
              />
              <label className="mt-4 block text-sm text-foreground/65" htmlFor="paisC">
                País
              </label>
              <SearchableSelect
                id="paisC"
                options={PAISES.map((p) => ({ value: p.iso, label: p.nombre, flag: p.iso }))}
                value={paisC}
                onChange={setPaisC}
                placeholder="Escribí tu país…"
                emptyLabel="No encontramos ese país"
              />
              <Button
                type="button"
                className="mt-5 h-11 w-full rounded-lg font-medium"
                disabled={creando || nombreC.trim().length === 0}
                onClick={completarRegistro}
              >
                {creando ? "Creando…" : "Crear mi cuenta"}
              </Button>
            </div>
          ) : error === "sin_cuenta" ? (
            <div className="mx-auto max-w-xl rounded-2xl border border-line bg-card p-6">
              <h2 className="text-base font-semibold tracking-tight text-foreground">
                Tu cuenta todavía no está activa
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-foreground/65">
                Validá tu correo con el código de 6 dígitos (se envía al entrar por primera vez) o
                escribí al WhatsApp de soporte para revisarlo o pedir una recarga de créditos.
              </p>
              {wsp ? (
                <Button asChild className="mt-5 h-10 rounded-lg font-medium">
                  <a href={wsp} target="_blank" rel="noreferrer">
                    Escribir por WhatsApp
                  </a>
                </Button>
              ) : null}
            </div>
          ) : error === "conexion" ? (
            <div className="mx-auto max-w-xl rounded-2xl border border-line bg-card p-6">
              <h2 className="text-base font-semibold tracking-tight text-foreground">
                No se pudo cargar tu panel
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-foreground/65">
                Revisá tu conexión e intentá de nuevo.
              </p>
              <Button
                type="button"
                className="mt-5 h-10 rounded-lg font-medium"
                onClick={() => void cargar()}
              >
                Reintentar
              </Button>
            </div>
          ) : (
            <div className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-3 motion-safe:duration-500">
              {/* SALDO + ACCIONES */}
              <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
                <div
                  id="tour-saldo"
                  className="relative overflow-hidden rounded-2xl border border-cobalt/25 bg-[linear-gradient(135deg,#E8F0FC_0%,#F4F8FE_60%,#EEF3FB_100%)] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] dark:border-[#2C4A78] dark:bg-[linear-gradient(135deg,#10203C_0%,#0A1424_60%,#0C1626_100%)]"
                >
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute -top-16 -right-10 h-48 w-48 rounded-full bg-[radial-gradient(closest-side,rgba(0,82,212,0.35),transparent)]"
                  />
                  <div className="relative flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-xs font-medium tracking-[0.2em] text-cobalt uppercase dark:text-[#7FB3FF]">
                        Créditos disponibles
                      </p>
                      <p className="mt-2 text-5xl font-semibold tracking-tight text-[#0A1424] tabular-nums dark:text-white">
                        {cargando && !datos ? "—" : saldo}
                      </p>
                      <p className="mt-3 text-sm leading-relaxed text-[#26354F]/70 dark:text-white/65">
                        {precio} USD por crédito · cada proceso cuesta {costoNum} {cred(costoNum)} ($
                        {(Number(precio) * costoNum).toFixed(0)}).
                      </p>
                      <p className={`mt-2 text-sm font-medium ${alcanza ? "text-[#0E7A4C] dark:text-[#7CE6B4]" : "text-[#B42318] dark:text-[#F0A49D]"}`}>
                        {alcanza
                          ? `Tenés para ${procesosPosibles} ${proc(procesosPosibles)}.`
                          : `Te faltan ${costoNum - saldo} ${cred(costoNum - saldo)} para tu próximo proceso.`}
                      </p>
                    </div>
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-cobalt/25 bg-cobalt/10 text-cobalt dark:border-[#2C4A78] dark:bg-[#0E1B30] dark:text-[#7FB3FF]">
                      <Wallet aria-hidden="true" className="size-5" />
                    </span>
                  </div>
                  <div className="relative mt-5 flex flex-wrap gap-2">
                    <Button
                      id="tour-recargar"
                      type="button"
                      className="h-10 rounded-lg font-medium hover:bg-cobalt-deep"
                      onClick={() => setRecarga(true)}
                    >
                      <span aria-hidden="true" className="text-base leading-none">◈</span>
                      Recargar con Binance Pay
                    </Button>
                    {wsp ? (
                      <Button
                        asChild
                        variant="outline"
                        className="h-10 rounded-lg border-line bg-transparent text-foreground hover:border-foreground/30 hover:bg-foreground/[0.04]"
                      >
                        <a href={wsp} target="_blank" rel="noreferrer">
                          Recargar por WhatsApp
                        </a>
                      </Button>
                    ) : null}
                    <Button
                      id="tour-descargar"
                      asChild
                      variant="outline"
                      className="h-10 rounded-lg border-line bg-transparent text-foreground hover:border-foreground/30 hover:bg-foreground/[0.04]"
                    >
                      <a href="/descargas">
                        <Download aria-hidden="true" className="size-4" />
                        Descargar app
                      </a>
                    </Button>
                  </div>
                </div>

                <div id="tour-stats" className="grid grid-cols-2 gap-4">
                  <StatCard
                    icon={<Activity aria-hidden="true" className="size-4" />}
                    label="Procesos"
                    value={totales.procesos}
                    hint="realizados en total"
                  />
                  <StatCard
                    icon={<TrendingDown aria-hidden="true" className="size-4" />}
                    label="Consumidos"
                    value={totales.consumidos}
                    hint="créditos usados"
                    valueClass="text-[#F0C97D]"
                  />
                  <StatCard
                    icon={<TrendingUp aria-hidden="true" className="size-4" />}
                    label="Recargados"
                    value={totales.recargados}
                    hint="créditos cargados"
                    valueClass="text-[#7CE6B4]"
                  />
                  <div className="group rounded-2xl border border-line bg-card p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition-[transform,border-color] duration-300 hover:-translate-y-0.5 hover:border-cobalt/40">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-medium tracking-[0.14em] text-foreground/45 uppercase">
                        Estado
                      </p>
                      <span className="flex size-8 items-center justify-center rounded-lg border border-line bg-field text-foreground/50 transition-colors group-hover:text-cyan">
                        <ShieldCheck aria-hidden="true" className="size-4" />
                      </span>
                    </div>
                    <p className="mt-3">
                      <Badge className="border-[#1C5A44] bg-[#0F2E24] text-[#7CE6B4]">Activa</Badge>
                    </p>
                    <p className="mt-2 text-xs text-foreground/45">cuenta al día</p>
                  </div>
                </div>
              </div>

              {/* CÓMO FUNCIONA */}
              <div id="tour-pasos" className="mt-4 grid gap-4 sm:grid-cols-3">
                {[
                  { n: "1", t: "Elegí el modelo", d: "Conectá el equipo en fastboot: la app lo detecta solo." },
                  { n: "2", t: "Confirmá", d: "La ROM de tu modelo ya viene lista (descuenta los créditos del proceso)." },
                  { n: "3", t: "Flasheá", d: "Flasheo guiado paso a paso, con verificación final." },
                ].map((p) => (
                  <div
                    key={p.n}
                    className="flex items-start gap-3 rounded-2xl border border-line bg-card p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition-[transform,border-color] duration-300 hover:-translate-y-0.5 hover:border-cobalt/40"
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-[#2A4C86] bg-[#14213C] text-sm font-semibold text-[#A9C8F7]">
                      {p.n}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-foreground">{p.t}</p>
                      <p className="mt-1 text-xs leading-relaxed text-foreground/55">{p.d}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* TABLAS */}
              <div id="tour-historial" className="mt-8 grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-line bg-card p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-base font-semibold tracking-tight text-foreground">
                      Últimos movimientos
                    </h2>
                    <span className="text-xs text-foreground/40">créditos</span>
                  </div>
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="text-xs tracking-[0.12em] text-foreground/45 uppercase">
                          <th className="pb-2 pr-3 font-medium">Fecha</th>
                          <th className="pb-2 pr-3 font-medium">Tipo</th>
                          <th className="pb-2 pr-3 font-medium">Cantidad</th>
                          <th className="pb-2 pr-3 font-medium">Saldo</th>
                          <th className="pb-2 font-medium">Detalle</th>
                        </tr>
                      </thead>
                      <tbody className="text-foreground/75">
                        {(datos?.movimientos ?? []).length === 0 ? (
                          <tr>
                            <td colSpan={5} className="py-4 text-sm text-foreground/45">
                              Todavía no hay movimientos. Cuando recargues o hagas un proceso, acá
                              queda todo el historial.
                            </td>
                          </tr>
                        ) : (
                          (datos?.movimientos ?? []).map((m, i) => (
                            <tr key={`${m.fecha_registro}-${i}`} className="border-t border-line">
                              <td className="py-2.5 pr-3 whitespace-nowrap">{fmtFecha(m.fecha_registro)}</td>
                              <td className="py-2.5 pr-3">
                                <Badge className={tipoColor[m.tipo] ?? "border-line bg-[#0E1B30] text-white/70"}>
                                  {tipoLabel[m.tipo] ?? m.tipo}
                                </Badge>
                              </td>
                              <td
                                className={`py-2.5 pr-3 font-medium ${m.cantidad >= 0 ? "text-[#7CE6B4]" : "text-[#F0A49D]"}`}
                              >
                                {m.cantidad >= 0 ? `+${m.cantidad}` : m.cantidad}
                              </td>
                              <td className="py-2.5 pr-3">{m.saldo_despues}</td>
                              <td className="py-2.5 text-foreground/55">
                                {m.motivo}
                                {m.referencia ? ` · ${m.referencia}` : ""}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="rounded-2xl border border-line bg-card p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-base font-semibold tracking-tight text-foreground">
                      Últimos procesos
                    </h2>
                    <span className="text-xs text-foreground/40">por equipo</span>
                  </div>
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="text-xs tracking-[0.12em] text-foreground/45 uppercase">
                          <th className="pb-2 pr-3 font-medium">Fecha</th>
                          <th className="pb-2 pr-3 font-medium">Folio</th>
                          <th className="pb-2 pr-3 font-medium">Modelo</th>
                          <th className="pb-2 font-medium">Estado</th>
                        </tr>
                      </thead>
                      <tbody className="text-foreground/75">
                        {(datos?.trabajos ?? []).length === 0 ? (
                          <tr>
                            <td colSpan={4} className="py-4 text-sm text-foreground/45">
                              Todavía no registraste procesos. Cuando hagas el primero, acá vas a ver
                              su folio y estado.
                            </td>
                          </tr>
                        ) : (
                          (datos?.trabajos ?? []).map((t) => {
                            const est = estadoTrabajo[t.estado] ?? {
                              label: t.estado,
                              color: "border-line bg-[#0E1B30] text-white/70",
                            }
                            return (
                              <tr key={t.folio} className="border-t border-line">
                                <td className="py-2.5 pr-3 whitespace-nowrap">{fmtDia(t.fecha)}</td>
                                <td className="py-2.5 pr-3">{t.folio}</td>
                                <td className="py-2.5 pr-3">{t.modelo || "—"}</td>
                                <td className="py-2.5">
                                  <Badge className={est.color}>{est.label}</Badge>
                                </td>
                              </tr>
                            )
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* SOPORTE */}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line bg-card p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                <div className="flex items-center gap-3">
                  <span className="flex size-9 items-center justify-center rounded-lg border border-line bg-field text-cyan">
                    <LifeBuoy aria-hidden="true" className="size-4" />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-foreground">¿Dudas o recargas?</p>
                    <p className="text-xs text-foreground/55">
                      El saldo se descuenta solo al generar cada proceso. Sin créditos suficientes no
                      se puede iniciar.
                    </p>
                  </div>
                </div>
                {wsp ? (
                  <Button asChild variant="outline" className="h-10 rounded-lg border-line bg-transparent text-foreground hover:border-foreground/30 hover:bg-foreground/[0.04]">
                    <a href={wsp} target="_blank" rel="noreferrer">
                      WhatsApp de soporte
                    </a>
                  </Button>
                ) : null}
              </div>
            </div>
          )}
        </Container>
      </section>

      {recarga && jwt ? (
        <RecargaBinance
          jwt={jwt}
          onClose={() => setRecarga(false)}
          onConfirmado={() => void cargar()}
        />
      ) : null}

      <OnboardingTour steps={tourSteps} open={tour} onClose={cerrarTour} />
    </>
  )
}
