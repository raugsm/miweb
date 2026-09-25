import { Link } from "react-router-dom"
import { Check } from "lucide-react"

import { Container } from "@/components/Container"
import { GridPattern, Panel } from "@/components/Panel"
import { SectionHeading } from "@/components/SectionHeading"
import { Button } from "@/components/ui/button"
import { pricing } from "@/data/product"
import { cn } from "@/lib/utils"

export function PricingSection() {
  return (
    <section
      id="precios"
      aria-labelledby="precios-title"
      className="scroll-mt-20 border-t border-line bg-carbon/40 py-16 sm:py-24"
    >
      <Container>
        <SectionHeading
          id="precios-title"
          align="center"
          eyebrow={pricing.eyebrow}
          title={pricing.title}
          lead={pricing.lead}
        />

        <div className="mx-auto mt-12 grid max-w-3xl gap-4 md:grid-cols-2">
          {pricing.plans.map((plan) => (
            <Panel
              as="article"
              glow={plan.featured}
              key={plan.name}
              className={cn(
                "flex flex-col p-7",
                plan.featured && "border-cobalt/50",
                plan.disabled && "opacity-90"
              )}
            >
              {plan.featured ? <GridPattern /> : null}
              <div className="relative flex flex-1 flex-col">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-display text-lg font-extrabold tracking-[0.02em] text-foreground uppercase">
                    {plan.name}
                  </h3>
                  {plan.badge ? (
                    <span className="inline-flex items-center rounded-full border border-line bg-field px-2.5 py-1 font-display text-[10px] font-bold tracking-[0.16em] text-foreground/60 uppercase">
                      {plan.badge}
                    </span>
                  ) : plan.featured ? (
                    <span className="inline-flex items-center rounded-full border border-cobalt/50 bg-cobalt/10 px-2.5 py-1 font-display text-[10px] font-bold tracking-[0.16em] text-kicker uppercase">
                      Recomendado
                    </span>
                  ) : null}
                </div>

                <div className="mt-5 flex items-end gap-2">
                  <span className="font-display text-5xl font-extrabold tracking-tight text-foreground tabular-nums">
                    {plan.price}
                  </span>
                  <span className="pb-1.5 text-sm font-medium text-foreground/50">{plan.unit}</span>
                </div>
                <p className="mt-1 text-sm font-medium text-cyan">{plan.tagline}</p>

                <ul className="mt-6 flex-1 space-y-3">
                  {plan.features.map((feat) => (
                    <li key={feat} className="flex gap-2.5 text-sm leading-relaxed text-foreground/70">
                      <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-cobalt" strokeWidth={2.5} />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>

                {plan.disabled ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled
                    className="mt-7 h-11 rounded-lg border-line bg-transparent font-medium text-foreground/60"
                  >
                    {plan.cta.label}
                  </Button>
                ) : (
                  <Button
                    asChild
                    variant={plan.featured ? undefined : "outline"}
                    className={cn(
                      "mt-7 h-11 rounded-lg font-medium",
                      !plan.featured && "border-line bg-transparent text-foreground hover:border-foreground/30"
                    )}
                  >
                    <Link to={plan.cta.href}>{plan.cta.label}</Link>
                  </Button>
                )}
              </div>
            </Panel>
          ))}
        </div>

        <p className="mx-auto mt-6 max-w-2xl text-center text-xs leading-relaxed text-foreground/45">
          {pricing.note}
        </p>
      </Container>
    </section>
  )
}
