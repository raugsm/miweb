import { Container } from "@/components/Container"
import { Icon } from "@/components/Icon"
import { SectionHeading } from "@/components/SectionHeading"
import { guidePage, guideSteps, troubleshootingItems } from "@/data/guide"
import { requirements } from "@/data/product"

export function GuideSection() {

  return (
    <>
      <section id="guia" className="scroll-mt-16 border-b border-line bg-carbon/40 py-14 sm:py-20">
        <Container>
          <p className="text-xs font-medium tracking-[0.2em] text-foreground/45 uppercase">
            {guidePage.eyebrow}
          </p>
          <h2 className="mt-3 text-4xl leading-[1.05] font-semibold tracking-tight text-balance text-foreground sm:text-5xl">
            {guidePage.title}
          </h2>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-foreground/65">
            {guidePage.lead}
          </p>
        </Container>
      </section>

      <section className="py-16 sm:py-24">
        <Container>
          <div className="grid gap-12 lg:grid-cols-[0.85fr_1.4fr]">
            <aside>
              <div className="rounded-2xl border border-line bg-carbon p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] lg:sticky lg:top-20">
                <h3 className="text-base font-semibold tracking-tight text-foreground">
                  {guidePage.beforeStartTitle}
                </h3>
                <ul className="mt-4 space-y-3">
                  {requirements.map((requirement) => (
                    <li
                      key={requirement}
                      className="flex gap-3 text-sm text-foreground/65"
                    >
                      <span
                        aria-hidden="true"
                        className="mt-1.5 size-1.5 shrink-0 rounded-full bg-cobalt"
                      />
                      <span className="leading-relaxed">{requirement}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-5 text-xs leading-relaxed text-foreground/45">
                  {guidePage.beforeStartNote}
                </p>
              </div>
            </aside>

            <ol className="space-y-10">
              {guideSteps.map((step, index) => (
                <li key={step.title} className="relative pl-14">
                  <span
                    aria-hidden="true"
                    className="absolute top-0 left-0 flex size-9 items-center justify-center rounded-full bg-cobalt text-sm font-semibold text-white"
                  >
                    {index + 1}
                  </span>
                  {index < guideSteps.length - 1 ? (
                    <span
                      aria-hidden="true"
                      className="absolute top-11 bottom-[-2.5rem] left-[18px] w-px bg-line"
                    />
                  ) : null}
                  <h3 className="text-xl font-semibold tracking-tight text-foreground">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-foreground/65 sm:text-base">
                    {step.intro}
                  </p>
                  <ul className="mt-4 space-y-2.5">
                    {step.bullets.map((bullet) => (
                      <li
                        key={bullet}
                        className="flex gap-3 text-sm leading-relaxed text-foreground/65"
                      >
                        <span
                          aria-hidden="true"
                          className="mt-1.5 size-1.5 shrink-0 rounded-full bg-cobalt"
                        />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                  {step.command ? (
                    <div className="mt-5 rounded-lg border border-line bg-field px-4 py-3 dark:border-white/10 dark:bg-[#0E0F12]">
                      <p className="text-xs font-medium tracking-wider text-foreground/45 uppercase">
                        {step.command.label}
                      </p>
                      <code className="mt-2 block overflow-x-auto font-mono text-xs text-foreground/85">
                        {step.command.value}
                      </code>
                    </div>
                  ) : null}
                </li>
              ))}
            </ol>
          </div>
        </Container>
      </section>

      <section className="border-t border-line py-16 sm:py-24">
        <Container>
          <SectionHeading
            eyebrow={guidePage.troubleshootingEyebrow}
            title={guidePage.troubleshootingTitle}
          />
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {troubleshootingItems.map((item) => (
              <article
                key={item.title}
                className="rounded-2xl border border-line bg-carbon p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition-colors hover:border-line"
              >
                <span className="flex size-9 items-center justify-center rounded-lg border border-line bg-field text-cyan">
                  <Icon name={item.icon} className="size-4" />
                </span>
                <h4 className="mt-4 text-base font-semibold tracking-tight text-foreground">
                  {item.title}
                </h4>
                <p className="mt-2 text-sm leading-relaxed text-foreground/65">
                  {item.solution}
                </p>
              </article>
            ))}
          </div>
          <p className="mt-8 max-w-3xl text-sm leading-relaxed text-foreground/65">
            {guidePage.closing}
          </p>
        </Container>
      </section>
    </>
  )
}
