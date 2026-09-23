import { Link } from "react-router-dom"
import { ArrowRight, LifeBuoy, Wallet } from "lucide-react"

import { Container } from "@/components/Container"
import { Icon } from "@/components/Icon"
import { Button } from "@/components/ui/button"
import { supportChecklist, supportPage, supportShortcuts } from "@/data/support"
import { useRelease } from "@/lib/release"
import { useSeo } from "@/lib/seo"

export function SupportPage() {
  useSeo({
    titulo: "Soporte de Ari-Tool | AriadGSM",
    descripcion:
      "Soporte directo de Ari-Tool por WhatsApp: créditos, modelos compatibles, errores de flasheo y garantía. Atención para técnicos de Ariad GSM.",
    ruta: "/soporte",
  })

  const release = useRelease()

  return (
    <>
      <section className="border-b border-line bg-carbon/40 py-14 sm:py-20">
        <Container>
          <p className="text-xs font-medium tracking-[0.2em] text-foreground/45 uppercase">
            {supportPage.eyebrow}
          </p>
          <h1 className="mt-3 text-4xl leading-[1.05] font-semibold tracking-tight text-balance text-foreground sm:text-5xl">
            {supportPage.title}
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-foreground/65">
            {supportPage.lead}
          </p>
        </Container>
      </section>

      <section className="py-16 sm:py-24">
        <Container>
          <div className="grid gap-4 lg:grid-cols-[0.9fr_1.3fr]">
            <div className="h-full rounded-2xl border border-line bg-carbon p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
              <span className="flex size-9 items-center justify-center rounded-lg border border-line bg-field text-cyan">
                <LifeBuoy aria-hidden="true" className="size-4" />
              </span>
              <h2 className="mt-4 text-base font-semibold tracking-tight text-foreground">
                {supportPage.channelTitle}
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-foreground/65">
                {supportPage.channelBody}
              </p>
              <p className="mt-3 text-sm leading-relaxed text-foreground/65">
                {supportPage.channelTip}
              </p>
            </div>

            <div className="h-full rounded-2xl border border-line bg-carbon p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
              <h2 className="text-base font-semibold tracking-tight text-foreground">
                {supportPage.checklistTitle}
              </h2>
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
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[0.9fr_1.3fr]">
            <div className="h-full rounded-2xl border border-line bg-carbon p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
              <span className="flex size-9 items-center justify-center rounded-lg border border-line bg-field text-cyan">
                <Wallet aria-hidden="true" className="size-4" />
              </span>
              <h2 className="mt-4 text-base font-semibold tracking-tight text-foreground">
                {supportPage.creditsTitle}
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-foreground/65">
                {supportPage.creditsBody}
              </p>
            </div>

            <div className="h-full rounded-2xl border border-line bg-carbon p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
              <h2 className="text-base font-semibold tracking-tight text-foreground">
                WhatsApp de soporte
              </h2>
              <p className="mt-1 text-sm text-foreground/55">
                Atención directa para accesos, recargas y problemas con la herramienta.
              </p>
              <Button asChild className="mt-5 h-10 rounded-lg font-medium">
                <a href={release.soporte} target="_blank" rel="noreferrer">
                  Escribir por WhatsApp
                </a>
              </Button>
              <p className="mt-3 text-xs text-foreground/45">+51 935 186 037</p>
            </div>
          </div>
        </Container>
      </section>

      <section className="border-t border-line py-16 sm:py-24">
        <Container>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {supportPage.shortcutsTitle}
          </h2>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-foreground/65">
            {supportPage.shortcutsLead}
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {supportShortcuts.map((shortcut) => (
              <Link
                key={shortcut.href}
                to={shortcut.href}
                className="group rounded-2xl border border-line bg-carbon p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition-colors hover:border-line focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
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
