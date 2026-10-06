import { Link } from "react-router-dom"
import { ArrowRight, Cpu, KeyRound, MessageCircle, Smartphone } from "lucide-react"

import { Container } from "@/components/Container"
import { Panel } from "@/components/Panel"
import { SectionHeading } from "@/components/SectionHeading"
import { Button } from "@/components/ui/button"
import { serviciosGsm } from "@/data/gsm"

const ICONOS = [Smartphone, KeyRound, Cpu, MessageCircle]
const cardTitle =
  "font-display text-base font-extrabold tracking-[0.02em] text-foreground uppercase"

/**
 * Sección "Servicios AriadGSM" en la portada: le muestra al cliente de siempre
 * que los servicios remotos (Xiaomi Reset+FRP, Cuentas MI, Motorola, especiales)
 * siguen activos, aunque la home destaque el software Ari-Tool. Une las dos caras.
 */
export function ServiciosGsmSection() {
  return (
    <section
      id={serviciosGsm.id}
      className="scroll-mt-16 border-y border-line bg-carbon/40 py-16 sm:py-24"
    >
      <Container>
        <SectionHeading
          eyebrow={serviciosGsm.eyebrow}
          title={serviciosGsm.title}
          lead={serviciosGsm.lead}
        />

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {serviciosGsm.items.map((item, i) => {
            const Icono = ICONOS[i] ?? Smartphone
            return (
              <Panel key={item.titulo} className="flex h-full flex-col p-6">
                <span className="flex size-10 items-center justify-center rounded-lg border border-line bg-field text-cyan">
                  <Icono aria-hidden="true" className="size-5" />
                </span>
                <h3 className={`mt-4 ${cardTitle}`}>{item.titulo}</h3>
                <p className="mt-3 flex-1 text-sm leading-relaxed text-foreground/65">
                  {item.descripcion}
                </p>
                <span className="mt-4 inline-flex w-fit items-center rounded-full border border-line bg-field px-2.5 py-1 text-[11px] font-medium text-kicker uppercase tracking-wide">
                  {item.etiqueta}
                </span>
              </Panel>
            )
          })}
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button asChild className="h-11 rounded-xl font-medium">
            <Link to={serviciosGsm.appCta.href}>
              {serviciosGsm.appCta.label}
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            className="h-11 rounded-xl border-line bg-transparent font-medium text-foreground hover:border-cobalt/40 hover:bg-foreground/[0.04]"
          >
            <a href={serviciosGsm.waCta.href} target="_blank" rel="noreferrer">
              {serviciosGsm.waCta.label}
            </a>
          </Button>
        </div>
      </Container>
    </section>
  )
}
