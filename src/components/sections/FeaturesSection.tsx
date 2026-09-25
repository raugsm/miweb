import type { ComponentType } from "react"
import { Check, HardDriveDownload, Monitor, ShieldCheck, ShieldOff, Smartphone, Unlock } from "lucide-react"

import { Container } from "@/components/Container"
import { Panel } from "@/components/Panel"
import { SectionHeading } from "@/components/SectionHeading"
import { features } from "@/data/product"

// Mapea la clave de la data al ícono, para no meter componentes en la data.
const iconos: Record<string, ComponentType<{ className?: string }>> = {
  security: ShieldOff,
  anticrack: Unlock,
  flasheo: HardDriveDownload,
  catalogo: Smartphone,
  cobertura: ShieldCheck,
  escritorio: Monitor,
}

export function FeaturesSection() {
  return (
    <section id="caracteristicas" aria-labelledby="caracteristicas-title" className="scroll-mt-20 py-16 sm:py-24">
      <Container>
        <SectionHeading
          id="caracteristicas-title"
          eyebrow={features.eyebrow}
          title={features.title}
          lead={features.lead}
        />

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.groups.map((group) => {
            const Icono = iconos[group.icon] ?? ShieldCheck
            return (
              <Panel as="article" key={group.title} className="flex flex-col p-6">
                <span className="flex size-11 items-center justify-center rounded-xl border border-cobalt/40 bg-cobalt/10 text-kicker">
                  <Icono className="size-5" />
                </span>
                <h3 className="mt-5 font-display text-base font-extrabold tracking-[0.02em] text-foreground uppercase">
                  {group.title}
                </h3>
                <ul className="mt-4 space-y-2.5">
                  {group.items.map((item) => (
                    <li key={item} className="flex gap-2.5 text-sm leading-relaxed text-foreground/65">
                      <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-cyan" strokeWidth={2.5} />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </Panel>
            )
          })}
        </div>
      </Container>
    </section>
  )
}
