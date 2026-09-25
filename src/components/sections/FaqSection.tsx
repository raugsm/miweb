import { Plus } from "lucide-react"

import { Container } from "@/components/Container"
import { SectionHeading } from "@/components/SectionHeading"
import { faqs } from "@/data/product"

export function FaqSection() {
  return (
    <section id="faq" aria-labelledby="faq-title" className="scroll-mt-20 py-16 sm:py-24">
      <Container>
        <SectionHeading id="faq-title" eyebrow={faqs.eyebrow} title={faqs.title} lead={faqs.lead} />

        <div className="mx-auto mt-10 max-w-3xl divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
          {faqs.items.map((item) => (
            <details key={item.q} className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-sm font-medium text-foreground transition-colors hover:bg-foreground/[0.03] focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
                <span>{item.q}</span>
                <Plus
                  aria-hidden="true"
                  className="size-4 shrink-0 text-cyan transition-transform duration-200 group-open:rotate-45"
                />
              </summary>
              <p className="px-5 pb-4 text-sm leading-relaxed text-foreground/65">{item.a}</p>
            </details>
          ))}
        </div>
      </Container>
    </section>
  )
}
