import { Link } from "react-router-dom"
import { ArrowRight, LifeBuoy, Wallet } from "lucide-react"

import { Container } from "@/components/Container"
import { Icon } from "@/components/Icon"
import { Panel } from "@/components/Panel"
import { SectionHeading } from "@/components/SectionHeading"
import { Button } from "@/components/ui/button"
import { supportChecklist, supportPage, supportShortcuts } from "@/data/support"
import { useRelease } from "@/lib/release"

const cardTitle = "font-display text-base font-extrabold tracking-[0.02em] text-foreground uppercase"

export function SupportSection() {
  const release = useRelease()

  return (
    <>
      <section id="soporte" className="scroll-mt-16 border-b border-line bg-carbon/40 py-14 sm:py-20">
        <Container>
          <SectionHeading
            eyebrow={supportPage.eyebrow}
            title={supportPage.title}
            lead={supportPage.lead}
          />
        </Container>
      </section>

      <section className="py-16 sm:py-24">
        <Container>
          <div className="grid gap-4 lg:grid-cols-[0.9fr_1.3fr]">
            <Panel className="h-full p-6">
              <span className="flex size-9 items-center justify-center rounded-lg border border-line bg-field text-cyan">
                <LifeBuoy aria-hidden="true" className="size-4" />
              </span>
              <h3 className={`mt-4 ${cardTitle}`}>{supportPage.channelTitle}</h3>
              <p className="mt-3 text-sm leading-relaxed text-foreground/65">
                {supportPage.channelBody}
              </p>
              <p className="mt-3 text-sm leading-relaxed text-foreground/65">
                {supportPage.channelTip}
              </p>
            </Panel>

            <Panel className="h-full p-6">
              <h3 className={cardTitle}>{supportPage.checklistTitle}</h3>
              <p className="mt-1 text-sm text-foreground/55">
                {supportPage.checklistLead}
              </p>
              <ul className="mt-5 grid gap-5 sm:grid-cols-2">
                {supportChecklist.map((item) => (
                  <li key={item.label} className="flex gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-line bg-field text-cyan">
                      <Icon name={item.icon} className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {item.label}
                      </p>
                      <p className="mt-0.5 text-sm leading-relaxed text-foreground/65">
                        {item.description}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[0.9fr_1.3fr]">
            <Panel className="h-full p-6">
              <span className="flex size-9 items-center justify-center rounded-lg border border-line bg-field text-cyan">
                <Wallet aria-hidden="true" className="size-4" />
              </span>
              <h3 className={`mt-4 ${cardTitle}`}>{supportPage.creditsTitle}</h3>
              <p className="mt-3 text-sm leading-relaxed text-foreground/65">
                {supportPage.creditsBody}
              </p>
            </Panel>

            <Panel className="h-full p-6">
              <h3 className={cardTitle}>WhatsApp de soporte</h3>
              <p className="mt-1 text-sm text-foreground/55">
                Atención directa para accesos, recargas y problemas con la herramienta.
              </p>
              <Button asChild className="mt-5 h-10 rounded-lg font-medium">
                <a href={release.soporte} target="_blank" rel="noreferrer">
                  Escribir por WhatsApp
                </a>
              </Button>
              <p className="mt-3 text-xs text-foreground/45">+51 935 186 037</p>
            </Panel>
          </div>
        </Container>
      </section>

      <section className="border-t border-line py-16 sm:py-24">
        <Container>
          <SectionHeading
            eyebrow="Ayuda rápida"
            title={supportPage.shortcutsTitle}
            lead={supportPage.shortcutsLead}
          />
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {supportShortcuts.map((shortcut) => (
              <Link
                key={shortcut.href}
                to={shortcut.href}
                className="group rounded-2xl border border-line bg-card p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition-[transform,border-color,box-shadow] duration-300 hover:-translate-y-0.5 hover:border-cobalt/40 hover:shadow-[0_18px_44px_-24px_rgba(0,82,212,0.5)] focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <span className="flex items-center justify-between gap-4">
                  <span className="text-sm font-medium text-foreground">
                    {shortcut.label}
                  </span>
                  <ArrowRight
                    aria-hidden="true"
                    className="size-4 text-cyan transition-transform group-hover:translate-x-0.5"
                  />
                </span>
                <span className="mt-1 block text-sm text-foreground/65">
                  {shortcut.description}
                </span>
              </Link>
            ))}
          </div>
        </Container>
      </section>
    </>
  )
}
