import { Check, Cpu } from "lucide-react"

import { Container } from "@/components/Container"
import { GridPattern, Kicker, Panel } from "@/components/Panel"
import { SectionHeading } from "@/components/SectionHeading"
import { devices } from "@/data/product"

export function DevicesSection() {
  return (
    <section
      id="dispositivos"
      aria-labelledby="dispositivos-title"
      className="scroll-mt-20 border-t border-line py-16 sm:py-24"
    >
      <Container>
        <SectionHeading
          id="dispositivos-title"
          eyebrow={devices.eyebrow}
          title={devices.title}
          lead={devices.lead}
        />

        {/* Datos generales */}
        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {devices.stats.map((stat) => (
            <Panel key={stat.label} className="p-6 text-center sm:text-left">
              <p className="bg-[linear-gradient(140deg,var(--foreground),#4d8dff)] bg-clip-text font-display text-4xl font-extrabold tracking-tight text-transparent tabular-nums [-webkit-background-clip:text] sm:text-5xl">
                {stat.value}
              </p>
              <p className="mt-2 font-display text-[11px] font-bold tracking-[0.18em] text-foreground/50 uppercase">
                {stat.label}
              </p>
            </Panel>
          ))}
        </div>

        {/* Marcas + modelos */}
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {devices.brands.map((brand) => (
            <Panel as="article" glow key={brand.name} className="p-6">
              <GridPattern />
              <div className="relative">
                <Kicker>{brand.name}</Kicker>
                <ul className="mt-4 space-y-2.5">
                  {brand.models.map((model) => (
                    <li key={model} className="flex items-center gap-2.5 text-sm text-foreground/70">
                      <Check aria-hidden="true" className="size-3.5 shrink-0 text-cobalt/70" strokeWidth={2.5} />
                      <span>{model}</span>
                    </li>
                  ))}
                  <li className="pt-1 text-xs text-foreground/40">y más modelos en el catálogo…</li>
                </ul>
              </div>
            </Panel>
          ))}
        </div>

        <div className="mt-6 flex flex-col items-start justify-between gap-3 rounded-2xl border border-line bg-carbon/40 p-5 sm:flex-row sm:items-center">
          <p className="inline-flex items-center gap-2 font-display text-[11px] font-bold tracking-[0.18em] text-foreground/70 uppercase">
            <Cpu aria-hidden="true" className="size-4 text-cyan" />
            {devices.chipset}
          </p>
          <p className="text-sm text-foreground/55">{devices.note}</p>
        </div>
      </Container>
    </section>
  )
}
