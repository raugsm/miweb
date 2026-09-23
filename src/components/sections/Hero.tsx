import { useRef } from "react"
import { ArrowRight, Check } from "lucide-react"

import { Container } from "@/components/Container"
import { DownloadButton } from "@/components/DownloadButton"
import WorldMapAscii from "@/components/registry/world-map-ascii/world-map-ascii"
import { heroContent, product } from "@/data/product"
import { useInView } from "@/hooks/use-in-view"
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion"
import { useRelease } from "@/lib/release"

export function Hero() {
  const { versionLabel } = useRelease()
  const sectionRef = useRef<HTMLElement>(null)
  const reducedMotion = usePrefersReducedMotion()
  const inView = useInView(sectionRef)

  return (
    <section
      ref={sectionRef}
      aria-labelledby="hero-title"
      className="relative isolate overflow-hidden border-b border-line font-tech"
    >
      {/* Fondo: mapa mundi de partículas */}
      <div aria-hidden="true" className="absolute inset-0 -z-10">
        <WorldMapAscii
          color="#4d8dff"
          particleSize={0.85}
          density={7}
          mouseRadius={90}
          drift={0.05}
          paused={reducedMotion || !inView}
          interactionTarget={sectionRef}
          className="opacity-80 [mask-image:radial-gradient(ellipse_70%_75%_at_50%_50%,black_35%,transparent_100%)]"
        />
        {/* Halo azul central */}
        <div className="absolute top-1/2 left-1/2 h-[42rem] w-[68rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(0,82,212,0.16),transparent)]" />
        {/* Degradados de legibilidad */}
        <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-background to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-background to-transparent" />
        <div className="absolute inset-y-0 left-0 w-full bg-gradient-to-r from-background/85 via-background/40 to-transparent lg:w-[62%]" />
      </div>

      <Container className="relative py-16 sm:py-24 lg:py-28">
        <div className="grid items-center gap-14 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-10">
          {/* Columna de texto */}
          <div className="min-w-0">
            <p className="inline-flex items-center gap-2 rounded-full border border-cobalt/40 bg-cobalt/10 px-3 py-1 font-display text-[11px] font-bold tracking-[0.2em] text-kicker uppercase">
              <span className="size-1.5 rounded-full bg-[#4d8dff] shadow-[0_0_10px_#4d8dff]" />
              {heroContent.kicker}
            </p>

            <h1
              id="hero-title"
              className="mt-6 max-w-2xl font-display text-[2.1rem] leading-[1.12] font-extrabold tracking-[0.04em] text-balance text-foreground uppercase sm:text-5xl lg:text-[3.4rem]"
            >
              {heroContent.title}
            </h1>

            <p className="mt-6 max-w-2xl text-[13px] leading-[1.8] font-semibold tracking-[0.08em] text-pretty text-foreground/70 uppercase sm:text-sm">
              {heroContent.lead}
            </p>

            <ul className="mt-7 flex flex-wrap gap-x-6 gap-y-2.5 text-xs font-bold tracking-[0.14em] text-foreground/75 uppercase">
              {heroContent.highlights.map((item) => (
                <li key={item} className="inline-flex items-center gap-2">
                  <Check
                    aria-hidden="true"
                    className="size-4 shrink-0 text-cyan"
                    strokeWidth={2.5}
                  />
                  {item}
                </li>
              ))}
            </ul>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
              <DownloadButton
                label={heroContent.primaryCta}
                className="text-xs font-bold tracking-[0.14em] uppercase"
              />
              <a
                href="#producto"
                className="group inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-line bg-foreground/[0.03] px-5 text-xs font-bold tracking-[0.14em] text-foreground uppercase transition-colors hover:border-foreground/30 hover:bg-foreground/[0.06] focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                {heroContent.secondaryCta}
                <ArrowRight
                  aria-hidden="true"
                  className="size-4 transition-transform group-hover:translate-x-0.5"
                />
              </a>
            </div>

            <p className="mt-6 text-xs font-semibold tracking-[0.16em] text-foreground/50 uppercase">
              {product.name} {versionLabel} · {heroContent.trustSuffix}
            </p>
          </div>

          {/* Columna visual: mano con el certificado de garantia en pantalla */}
          <div className="relative flex min-w-0 items-center justify-center lg:justify-end">
            <div
              aria-hidden="true"
              className="absolute top-1/2 left-1/2 h-[30rem] w-[30rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(77,141,255,0.30),rgba(0,82,212,0.14)_45%,rgba(0,82,212,0.04)_70%,transparent)] sm:h-[38rem] sm:w-[38rem]"
            />
            <div
              aria-hidden="true"
              className="absolute top-1/2 left-1/2 h-[22rem] w-[22rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-cobalt/25 sm:h-[30rem] sm:w-[30rem]"
            />
            <div
              aria-hidden="true"
              className="absolute top-1/2 left-1/2 h-[28rem] w-[28rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-cobalt/10 sm:h-[38rem] sm:w-[38rem]"
            />
            <img
              src="/mano-garantia.avif"
              alt="Mano sosteniendo un celular que muestra el certificado de garantía del equipo"
              width={632}
              height={1024}
              fetchPriority="high"
              decoding="async"
              className="relative h-[24rem] w-auto max-w-full object-contain drop-shadow-[0_30px_60px_rgba(0,82,212,0.45)] motion-safe:animate-hero-float sm:h-[30rem] lg:h-[34rem] xl:h-[36rem]"
            />
          </div>
        </div>
      </Container>
    </section>
  )
}
