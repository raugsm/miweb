import { useCallback, useEffect, useRef, useState } from "react"
import { Download, MessageCircle, MonitorSmartphone } from "lucide-react"

import { Container } from "@/components/Container"
import { Flag } from "@/components/Flag"
import { GridPattern, Kicker, Panel } from "@/components/Panel"
import { Button } from "@/components/ui/button"
import {
  gsmMotorola,
  gsmPage,
  gsmSteps,
  gsmWhatsappSupportUrl,
  type GsmPrice,
  type GsmPriceReport,
} from "@/data/gsm"
import { useSeo } from "@/lib/seo"

const PRICE_REFRESH_MS = 15_000

function PriceCard({ price }: { price: GsmPrice }) {
  const muted = !price.available
  return (
    <article
      className={`rounded-xl border p-4 transition-colors ${
        muted
          ? "border-line bg-foreground/[0.01] opacity-60"
          : "border-line bg-foreground/[0.02] hover:border-cobalt/40"
      }`}
    >
      <div className="flex items-center gap-2.5">
        <Flag code={price.flagCode} title={price.country} className="h-5 w-7 shadow-sm" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{price.country}</p>
          <p className="truncate text-[11px] text-foreground/45">
            {price.methods.length ? price.methods.join(" · ") : "Método disponible en la app"}
          </p>
        </div>
      </div>
      <p className="mt-3 font-display text-xl font-bold tracking-tight text-foreground">
        {price.amountFormatted}
      </p>
      <p className="mt-1 text-[11px] text-foreground/45">
        {muted ? "Por WhatsApp" : `${price.currency} · ${price.unitLabel}`}
      </p>
    </article>
  )
}

function PriceGroup({
  title,
  prices,
  note,
}: {
  title: string
  prices: GsmPrice[]
  note?: string
}) {
  return (
    <div className="price-group">
      <h3 className="font-display text-[11px] font-bold tracking-[0.2em] text-kicker uppercase">
        {title}
      </h3>
      {note ? <p className="mt-1.5 text-xs text-foreground/50">{note}</p> : null}
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {prices.map((price) => (
          <PriceCard key={`${price.countryCode}-${price.currency}`} price={price} />
        ))}
      </div>
    </div>
  )
}

export function GsmLandingPage() {
  useSeo({
    titulo: "AriadGSM — Desbloqueo FRP Xiaomi y servicios GSM",
    descripcion:
      "AriadGSM (Ariad): desbloqueo FRP de Xiaomi, Redmi y POCO, cuentas Mi y servicios GSM para técnicos de toda Latinoamérica.",
    ruta: "/gsm",
  })

  const [report, setReport] = useState<GsmPriceReport | null>(null)
  const [failed, setFailed] = useState(false)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadPrices = useCallback(async () => {
    try {
      const response = await fetch("/api/public/frp-prices", {
        headers: { Accept: "application/json" },
        cache: "no-store",
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const payload = (await response.json()) as { report?: GsmPriceReport }
      setReport(payload?.report ?? null)
      setFailed(false)
    } catch {
      setReport(null)
      setFailed(true)
    }
  }, [])

  useEffect(() => {
    void loadPrices()
    timer.current = setInterval(() => void loadPrices(), PRICE_REFRESH_MS)
    const onVisible = () => {
      if (document.visibilityState === "visible") void loadPrices()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      if (timer.current) clearInterval(timer.current)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [loadPrices])

  const miVisible = (report?.miPrices ?? []).some((price) => price.available)
  const rentals = (report?.rentals ?? []).filter(
    (rental) => rental?.name && Array.isArray(rental.prices) && rental.prices.length
  )

  return (
    <>
      {/* HERO */}
      <section className="relative isolate overflow-hidden border-b border-line">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 left-1/2 h-[28rem] w-[52rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(0,82,212,0.16),transparent)]"
        />
        <Container className="relative py-16 sm:py-24">
          <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="min-w-0">
              <p className="inline-flex items-center gap-2 rounded-full border border-cobalt/40 bg-cobalt/10 px-3 py-1 font-display text-[11px] font-bold tracking-[0.2em] text-kicker uppercase">
                <span className="size-1.5 rounded-full bg-[#4d8dff] shadow-[0_0_10px_#4d8dff]" />
                {gsmPage.heroEyebrow}
              </p>
              <h1 className="mt-6 font-display text-[2rem] leading-[1.08] font-extrabold tracking-[0.04em] text-balance text-foreground uppercase sm:text-5xl">
                {gsmPage.heroTitleLine1}
                <span className="block text-foreground/60">{gsmPage.heroTitleLine2}</span>
              </h1>
              <p className="mt-5 max-w-xl text-[13px] leading-[1.8] font-semibold tracking-[0.06em] text-pretty text-foreground/70 uppercase sm:text-sm">
                {gsmPage.heroLead}
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button asChild className="h-11 rounded-lg font-display text-xs font-bold tracking-[0.14em] uppercase hover:bg-cobalt-deep">
                  <a href="/descargar">
                    <Download aria-hidden="true" className="size-4" />
                    Descargar AriadGSM Cliente
                  </a>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  className="h-11 rounded-lg border-line bg-transparent text-foreground hover:border-foreground/30 hover:bg-foreground/[0.04]"
                >
                  <a href="/manual">Cómo usar</a>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  className="h-11 rounded-lg border-line bg-transparent text-foreground hover:border-foreground/30 hover:bg-foreground/[0.04]"
                >
                  <a href={gsmWhatsappSupportUrl} target="_blank" rel="noreferrer">
                    <MessageCircle aria-hidden="true" className="size-4" />
                    Soporte WhatsApp
                  </a>
                </Button>
              </div>
              <p className="mt-6 text-xs font-semibold tracking-[0.16em] text-foreground/50 uppercase">
                {gsmPage.heroHint}
              </p>
            </div>

            <Panel className="p-6">
              <GridPattern className="opacity-40" />
              <div className="relative flex items-center gap-2.5">
                <span className="size-2.5 rounded-full bg-[#7CE6B4] shadow-[0_0_10px_#7CE6B4]" />
                <p className="font-display text-[10px] font-bold tracking-[0.2em] text-foreground/55 uppercase">
                  {gsmPage.heroCardStatus}
                </p>
              </div>
              <p className="mt-4 font-display text-2xl font-extrabold tracking-tight text-foreground">
                {gsmPage.heroCardTitle}
              </p>
              <ul className="mt-4 space-y-2.5">
                {gsmPage.heroCardItems.map((item) => (
                  <li key={item} className="flex items-center gap-2.5 text-sm text-foreground/70">
                    <span
                      aria-hidden="true"
                      className="mt-1.5 size-1.5 shrink-0 rounded-full bg-cobalt"
                    />
                    {item}
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        </Container>
      </section>

      {/* PRECIOS */}
      <section className="border-b border-line py-16 sm:py-24">
        <Container>
          <Kicker>Precios actuales</Kicker>
          <h2 className="mt-3 max-w-2xl font-display text-[1.75rem] leading-[1.12] font-extrabold tracking-[0.03em] text-balance text-foreground uppercase sm:text-4xl">
            Check rápido por país
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-foreground/60">
            Montos referenciales para responder rápido. Se actualizan desde el dashboard de
            AriadGSM Cliente.
          </p>

          <div className="mt-10 space-y-8">
            {failed ? (
              <p className="text-sm text-foreground/50">
                No se pudieron cargar los precios. Consulta por WhatsApp.
              </p>
            ) : !report ? (
              <p className="text-sm text-foreground/50">Cargando precios actuales...</p>
            ) : (
              <>
                {report.prices.length ? (
                  <PriceGroup title="Xiaomi Reset + FRP" prices={report.prices} />
                ) : null}
                {miVisible ? (
                  <PriceGroup title="Xiaomi Cuentas MI" prices={report.miPrices} />
                ) : null}
                {rentals.map((rental) => (
                  <PriceGroup
                    key={rental.name}
                    title={`Alquiler de herramientas - ${rental.name}`}
                    prices={rental.prices}
                    note={
                      rental.agotada
                        ? `Sin stock ahora: se consigue afuera, +${Number(rental.recargoUsdt || 0).toFixed(2)} USDT ya incluido en el precio.`
                        : undefined
                    }
                  />
                ))}
              </>
            )}
            <p className="text-xs text-foreground/40">
              Precio por 1 equipo. El monto final válido es el que confirma la app al crear el
              pedido.
            </p>
          </div>
        </Container>
      </section>

      {/* PASOS */}
      <section className="border-b border-line py-16 sm:py-24">
        <Container>
          <Kicker>Cómo funciona</Kicker>
          <h2 className="mt-3 max-w-2xl font-display text-[1.75rem] leading-[1.12] font-extrabold tracking-[0.03em] text-balance text-foreground uppercase sm:text-4xl">
            Un flujo simple para procesar equipos sin perder tiempo.
          </h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {gsmSteps.map((step) => (
              <Panel key={step.number} className="p-5">
                <span className="flex size-9 items-center justify-center rounded-lg border border-cobalt/40 bg-cobalt/10 font-display text-sm font-bold text-kicker">
                  {step.number}
                </span>
                <h3 className="mt-4 text-base font-semibold tracking-tight text-foreground">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-foreground/65">{step.description}</p>
              </Panel>
            ))}
          </div>
        </Container>
      </section>

      {/* VISTA RAPIDA */}
      <section className="border-b border-line py-16 sm:py-24">
        <Container>
          <div className="grid items-center gap-12 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="min-w-0">
              <Kicker>Vista rápida</Kicker>
              <h2 className="mt-3 font-display text-[1.75rem] leading-[1.12] font-extrabold tracking-[0.03em] text-balance text-foreground uppercase sm:text-4xl">
                El cliente ve cada paso guiado dentro de la app.
              </h2>
              <p className="mt-4 max-w-md text-base leading-relaxed text-foreground/60">
                La pantalla le muestra qué pagar, dónde subir el comprobante y cuándo conectar el
                Xiaomi. No necesita recordar instrucciones largas.
              </p>
              <Button
                asChild
                variant="outline"
                className="mt-6 h-10 rounded-lg border-line bg-transparent text-foreground hover:border-foreground/30 hover:bg-foreground/[0.04]"
              >
                <a href="/manual">Ver instrucciones completas</a>
              </Button>
            </div>

            <div className="relative space-y-4">
              <Panel className="p-5">
                <div className="flex items-center justify-between gap-3 border-b border-line pb-3">
                  <span className="font-display text-[10px] font-bold tracking-[0.2em] text-foreground/55 uppercase">
                    ARIADGSM
                  </span>
                  <span className="rounded-full border border-cyan/30 bg-cyan/10 px-2.5 py-0.5 font-display text-[10px] font-bold tracking-[0.14em] text-cyan uppercase">
                    Paso 1 de 3
                  </span>
                </div>
                <p className="mt-3 text-xs font-bold tracking-[0.16em] text-foreground/45 uppercase">
                  Prepará tu pedido
                </p>
                <dl className="mt-3 space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <dt className="text-foreground/55">Equipos</dt>
                    <dd className="font-semibold text-foreground">3</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-foreground/55">País y moneda</dt>
                    <dd className="font-semibold text-foreground">Perú · PEN</dd>
                  </div>
                  <div className="flex items-center justify-between border-t border-line pt-2">
                    <dt className="text-foreground/55">Total exacto</dt>
                    <dd className="font-display text-lg font-bold text-foreground">S/ 48.30</dd>
                  </div>
                </dl>
              </Panel>

              <Panel className="p-5">
                <div className="flex items-center gap-2.5">
                  <span className="font-display text-[10px] font-bold tracking-[0.2em] text-foreground/55 uppercase">
                    Conexión
                  </span>
                  <span className="rounded-full border border-line bg-foreground/[0.04] px-2.5 py-0.5 font-mono text-[10px] text-foreground/65">
                    AG-260512-001
                  </span>
                </div>
                <ul className="mt-4 space-y-2.5">
                  <li className="flex items-center gap-2.5 text-sm text-foreground/85">
                    <span className="size-1.5 rounded-full bg-[#7CE6B4] shadow-[0_0_8px_#7CE6B4]" />
                    Esperando tu Xiaomi en sideload
                  </li>
                  <li className="flex items-center gap-2.5 text-sm text-foreground/45">
                    <span className="size-1.5 rounded-full bg-foreground/20" />
                    El técnico toma el caso remoto
                  </li>
                  <li className="flex items-center gap-2.5 text-sm text-foreground/45">
                    <span className="size-1.5 rounded-full bg-foreground/20" />
                    Servicio completado
                  </li>
                </ul>
              </Panel>
            </div>
          </div>
        </Container>
      </section>

      {/* SERVICIOS WHATSAPP */}
      <section className="border-b border-line py-16 sm:py-24">
        <Container>
          <Kicker>Servicios por WhatsApp</Kicker>
          <h2 className="mt-3 max-w-2xl font-display text-[1.75rem] leading-[1.12] font-extrabold tracking-[0.03em] text-balance text-foreground uppercase sm:text-4xl">
            Otros servicios se atienden directo con ventas.
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-foreground/60">
            La app sigue siendo para Xiaomi Reset + FRP. Los servicios especiales se validan por
            WhatsApp antes de crear el pedido.
          </p>

          <Panel className="mt-10 grid overflow-hidden p-0 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="p-6 sm:p-8">
              <p className="rounded-full border border-cyan/30 bg-cyan/10 px-2.5 py-0.5 font-display text-[10px] font-bold tracking-[0.18em] text-cyan uppercase inline-flex">
                {gsmMotorola.kicker}
              </p>
              <h3 className="mt-4 font-display text-xl font-extrabold tracking-tight text-foreground sm:text-2xl">
                {gsmMotorola.title}
              </h3>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-foreground/65">
                {gsmMotorola.description}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {gsmMotorola.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-line bg-foreground/[0.03] px-3 py-1 text-xs text-foreground/65"
                  >
                    {tag}
                  </span>
                ))}
              </div>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Button
                  asChild
                  variant="outline"
                  className="h-10 rounded-lg border-line bg-transparent text-foreground hover:border-foreground/30 hover:bg-foreground/[0.04]"
                >
                  <a href="/servicios/motorola-f4">Ver modelos</a>
                </Button>
                <Button asChild className="h-10 rounded-lg font-medium hover:bg-cobalt-deep">
                  <a href={gsmMotorola.whatsappUrl} target="_blank" rel="noreferrer">
                    <MessageCircle aria-hidden="true" className="size-4" />
                    WhatsApp ventas
                  </a>
                </Button>
              </div>
            </div>
            <div className="relative flex items-center justify-center border-t border-line bg-foreground/[0.01] p-6 lg:border-t-0 lg:border-l">
              <img
                src="/images/motorola-cutout-web.png"
                alt="Equipo Motorola"
                loading="lazy"
                decoding="async"
                className="max-h-64 w-auto object-contain drop-shadow-[0_20px_40px_rgba(0,82,212,0.35)]"
              />
            </div>
          </Panel>
        </Container>
      </section>

      {/* DESCARGAR */}
      <section className="py-16 sm:py-24">
        <Container>
          <div className="relative overflow-hidden rounded-3xl border border-line bg-card dark:border-white/10 dark:bg-[#0c0e14]">
            <GridPattern className="[mask-image:radial-gradient(ellipse_at_top_right,black_10%,transparent_70%)]" />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -top-40 -right-32 h-[30rem] w-[30rem] rounded-full bg-[radial-gradient(closest-side,rgba(0,82,212,0.35),transparent)]"
            />
            <div className="relative grid gap-8 p-6 sm:p-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
              <div className="min-w-0">
                <Kicker>Descarga oficial</Kicker>
                <h2 className="mt-4 max-w-lg font-display text-[1.75rem] leading-[1.12] font-extrabold tracking-[0.03em] text-balance text-foreground uppercase sm:text-4xl">
                  Empezá desde la app de escritorio.
                </h2>
                <p className="mt-4 max-w-md text-base leading-relaxed text-foreground/60">
                  AriadGSM Cliente consulta la versión más reciente y guía el pedido completo
                  desde Windows.
                </p>
              </div>
              <div className="flex flex-col gap-3 lg:items-end">
                <Button asChild className="h-11 rounded-lg font-display text-xs font-bold tracking-[0.14em] uppercase hover:bg-cobalt-deep">
                  <a href="/descargar">
                    <MonitorSmartphone aria-hidden="true" className="size-4" />
                    Descargar AriadGSM Cliente
                  </a>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  className="h-11 rounded-lg border-line bg-transparent text-foreground hover:border-foreground/30 hover:bg-foreground/[0.04]"
                >
                  <a href="/manual">Leer manual completo</a>
                </Button>
              </div>
            </div>
          </div>
        </Container>
      </section>
    </>
  )
}
