import { Link } from "react-router-dom"
import { ArrowRight, Cpu, KeyRound, MessageCircle, MonitorSmartphone, Smartphone } from "lucide-react"

import { Container } from "@/components/Container"
import { Panel } from "@/components/Panel"
import { SectionHeading } from "@/components/SectionHeading"
import { serviciosSection } from "@/data/servicios"
import { cn } from "@/lib/utils"

const ICONOS = [MonitorSmartphone, Smartphone, KeyRound, Cpu, MessageCircle]

/**
 * Catálogo de la portada: todo lo que hace AriadGSM, al mismo nivel. Ari-Tool
 * va como tarjeta destacada porque su detalle sigue más abajo en la página.
 */
export function ServiciosSection() {
  return (
    <section
      id={serviciosSection.id}
      aria-labelledby="servicios-title"
      className="scroll-mt-16 py-16 sm:py-24"
    >
      <Container>
        <SectionHeading
          id="servicios-title"
          eyebrow={serviciosSection.eyebrow}
          title={serviciosSection.title}
          lead={serviciosSection.lead}
        />

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {serviciosSection.items.map((item, i) => {
            const Icono = ICONOS[i] ?? Smartphone
            const ctaClass =
              "group/cta mt-5 inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-cyan transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none rounded-md"
            const ctaInner = (
              <>
                {item.cta.label}
                <ArrowRight
                  aria-hidden="true"
                  className="size-4 transition-transform group-hover/cta:translate-x-0.5"
                />
              </>
            )
            return (
              <Panel
                key={item.titulo}
                as="article"
                glow={item.destacado}
                className={cn("flex h-full flex-col p-6", item.destacado && "sm:col-span-2 sm:p-8")}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="flex size-10 items-center justify-center rounded-lg border border-line bg-field text-cyan">
                    <Icono aria-hidden="true" className="size-5" />
                  </span>
                  <span className="rounded-full border border-line bg-field px-2.5 py-1 text-[11px] font-medium tracking-wide text-kicker uppercase">
                    {item.modo}
                  </span>
                </div>
                <h3
                  className={cn(
                    "mt-5 font-display font-extrabold tracking-[0.02em] text-foreground uppercase",
                    item.destacado ? "text-lg sm:text-xl" : "text-base"
                  )}
                >
                  {item.titulo}
                </h3>
                <p
                  className={cn(
                    "mt-3 flex-1 leading-relaxed text-foreground/65",
                    item.destacado ? "max-w-xl text-[15px]" : "text-sm"
                  )}
                >
                  {item.descripcion}
                </p>
                {item.cta.externo ? (
                  <a href={item.cta.href} target="_blank" rel="noreferrer" className={ctaClass}>
                    {ctaInner}
                  </a>
                ) : item.cta.href.startsWith("#") ? (
                  <a href={item.cta.href} className={ctaClass}>
                    {ctaInner}
                  </a>
                ) : (
                  <Link to={item.cta.href} className={ctaClass}>
                    {ctaInner}
                  </Link>
                )}
              </Panel>
            )
          })}
        </div>
      </Container>
    </section>
  )
}
