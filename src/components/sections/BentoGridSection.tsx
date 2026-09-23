import type { ReactNode } from "react"
import { Check, Cpu, Monitor, ShieldCheck, Smartphone, Usb } from "lucide-react"

import { Container } from "@/components/Container"
import { GridPattern, Kicker, Panel } from "@/components/Panel"
import { SectionHeading } from "@/components/SectionHeading"
import { bento, productSection } from "@/data/product"
import { cn } from "@/lib/utils"

export function BentoGridSection() {
  const { productCard, modelsCard, controlCard, warrantyCard } = bento

  return (
    <section
      id="producto"
      aria-labelledby="producto-title"
      className="scroll-mt-20 py-16 sm:py-24"
    >
      <Container>
        <SectionHeading
          id="producto-title"
          eyebrow={productSection.eyebrow}
          title={productSection.title}
          lead={productSection.lead}
        />

        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {/* ROM lista: tabla de particiones */}
          <Panel as="article" glow className="p-6 sm:p-7 md:col-span-2">
            <GridPattern />
            <div className="relative grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <img
                    src="/ariad-logo.webp"
                    alt=""
                    width={169}
                    height={112}
 loading="lazy"
 decoding="async"
                    className="h-7 w-auto object-contain"
                  />
                  <Kicker>Escritorio · Windows</Kicker>
                </div>
                <h3 className="mt-6 font-display text-2xl font-extrabold tracking-[0.02em] text-foreground uppercase">
                  {productCard.title}
                </h3>
                <p className="mt-3 max-w-sm text-sm leading-relaxed text-foreground/60">
                  {productCard.caption}
                </p>
              </div>

              <div className="min-w-0 rounded-xl border border-line bg-foreground/[0.03] p-4 dark:bg-[#0b0c10]/90">
                <div className="flex items-center justify-between gap-4">
                  <Kicker className="text-foreground/45">{productCard.tableTitle}</Kicker>
                  <span className="inline-flex items-center gap-1.5 font-display text-[10px] font-bold tracking-[0.2em] text-cyan uppercase">
                    <span className="size-1.5 rounded-full bg-cyan shadow-[0_0_8px_#7dd3fc]" />
                    Fastboot
                  </span>
                </div>
                <ul className="mt-4 space-y-2.5">
                  {productCard.partitions.map((partition) => (
                    <li key={partition.name} className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-3">
                      <span className="truncate font-mono text-xs text-foreground/80">
                        {partition.name}
                      </span>
                      <span className="h-1.5 overflow-hidden rounded-full bg-foreground/[0.07]">
                        <span
                          className={cn(
                            "block h-full rounded-full bg-gradient-to-r from-cobalt to-[#4d8dff]",
                            partition.progress < 100 && "animate-pulse"
                          )}
                          style={{ width: `${partition.progress}%` }}
                        />
                      </span>
                      <span className="flex items-center gap-2 text-right">
                        <span className="hidden font-mono text-[11px] text-foreground/35 sm:inline">
                          {partition.size}
                        </span>
                        <span
                          className={cn(
                            "inline-flex h-5 min-w-[5.5rem] items-center justify-center rounded-full border px-2 font-display text-[9px] font-bold tracking-[0.16em] uppercase",
                            partition.progress < 100
                              ? "border-line text-foreground/45"
                              : "border-cobalt/40 bg-cobalt/15 text-kicker"
                          )}
                        >
                          {partition.status}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Panel>

          {/* Compatibilidad */}
          <Panel as="article" className="flex flex-col p-6 sm:p-7">
            <div className="flex items-center justify-between gap-3">
              <Kicker>{modelsCard.kicker}</Kicker>
              <Cpu aria-hidden="true" className="size-4 text-foreground/35" />
            </div>
            <p className="mt-auto pt-10 font-display text-6xl leading-none font-extrabold tracking-tight text-foreground sm:text-7xl">
              {modelsCard.value}
            </p>
            <p className="mt-3 font-display text-[11px] font-bold tracking-[0.22em] text-foreground/50 uppercase">
              {modelsCard.unit}
            </p>
            <ul className="mt-5 flex flex-wrap gap-2">
              {modelsCard.brands.map((brand) => (
                <li
                  key={brand}
                  className="inline-flex h-7 items-center rounded-full border border-line bg-foreground/[0.03] px-3 font-display text-[10px] font-bold tracking-[0.18em] text-foreground/80 uppercase"
                >
                  {brand}
                </li>
              ))}
            </ul>
            <div className="mt-5 border-t border-line pt-4">
              <p className="font-display text-[10px] font-bold tracking-[0.2em] text-foreground/40 uppercase">
                {modelsCard.examplesTitle}
              </p>
              <ul className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1.5">
                {modelsCard.examples.map((modelo) => (
                  <li key={modelo} className="text-[13px] text-foreground/65">
                    {modelo}
                  </li>
                ))}
              </ul>
            </div>
            <p className="mt-4 text-sm text-foreground/55">{modelsCard.caption}</p>
          </Panel>

          {/* Control de cada fase */}
          <Panel as="article" className="flex flex-col p-6 sm:p-7">
            <Kicker>{controlCard.kicker}</Kicker>
            <h3 className="mt-4 font-display text-xl font-extrabold tracking-[0.02em] text-foreground uppercase">
              {controlCard.title}
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-foreground/60">
              {controlCard.caption}
            </p>
            <ol className="mt-6 space-y-0">
              {controlCard.phases.map((phase, index) => {
                const done = index < 2
                const active = index === 2
                return (
                  <li key={phase} className="relative flex items-center gap-3 py-2.5">
                    {index < controlCard.phases.length - 1 ? (
                      <span
                        aria-hidden="true"
                        className="absolute top-[2.1rem] left-[0.8rem] h-[calc(100%-1.1rem)] w-px bg-foreground/10"
                      />
                    ) : null}
                    <span
                      className={cn(
                        "relative flex size-[1.65rem] shrink-0 items-center justify-center rounded-full border font-mono text-[10px]",
                        done && "border-cobalt bg-cobalt text-white",
                        active && "border-cyan text-cyan shadow-[0_0_14px_rgba(125,211,252,0.35)]",
                        !done && !active && "border-line text-foreground/40"
                      )}
                    >
                      {done ? <Check aria-hidden="true" className="size-3.5" strokeWidth={3} /> : `0${index + 1}`}
                    </span>
                    <span
                      className={cn(
                        "text-sm",
                        done || active ? "text-foreground" : "text-foreground/45"
                      )}
                    >
                      {phase}
                    </span>
                  </li>
                )
              })}
            </ol>
          </Panel>

          {/* Garantia opcional */}
          <Panel as="article" glow className="p-6 sm:p-7 md:col-span-2">
            <GridPattern />
            <div className="relative grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
              <div className="min-w-0">
                <Kicker>{warrantyCard.kicker}</Kicker>
                <h3 className="mt-4 font-display text-2xl font-extrabold tracking-[0.02em] text-foreground uppercase">
                  {warrantyCard.title}
                </h3>
                <p className="mt-3 max-w-sm text-sm leading-relaxed text-foreground/60">
                  {warrantyCard.caption}
                </p>
                <p className="mt-5 inline-flex items-center gap-2 rounded-full border border-line bg-foreground/[0.03] px-3 py-1.5 font-display text-[10px] font-bold tracking-[0.18em] text-foreground/70 uppercase">
                  <ShieldCheck aria-hidden="true" className="size-3.5 text-cyan" />
                  {warrantyCard.badge}
                </p>
              </div>

              <div className="relative flex items-center justify-between gap-3 rounded-xl border border-line bg-foreground/[0.03] px-5 py-8 sm:px-8 dark:bg-[#0b0c10]/90">
                <Node icon={<Monitor aria-hidden="true" className="size-6" />} label={warrantyCard.from} />
                <div className="relative flex min-w-0 flex-1 flex-col items-center gap-2">
                  <span className="relative h-px w-full overflow-hidden bg-foreground/10">
                    <span
                      aria-hidden="true"
                      className="absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-[#4d8dff] to-transparent motion-safe:animate-usb-flow"
                    />
                  </span>
                  <span className="inline-flex items-center gap-1.5 font-display text-[10px] font-bold tracking-[0.2em] whitespace-nowrap text-kicker uppercase">
                    <Usb aria-hidden="true" className="size-3.5" />
                    {warrantyCard.link}
                  </span>
                </div>
                <Node icon={<Smartphone aria-hidden="true" className="size-6" />} label={warrantyCard.to} />
              </div>
            </div>
          </Panel>
        </div>
      </Container>
    </section>
  )
}

function Node({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="flex shrink-0 flex-col items-center gap-3">
      <span className="flex size-14 items-center justify-center rounded-2xl border border-cobalt/40 bg-cobalt/10 text-kicker shadow-[0_0_30px_rgba(0,82,212,0.25)]">
        {icon}
      </span>
      <span className="font-display text-[10px] font-bold tracking-[0.16em] whitespace-nowrap text-foreground/70 uppercase">
        {label}
      </span>
    </div>
  )
}
