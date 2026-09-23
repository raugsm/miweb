import { useEffect } from "react"
import { useLocation } from "react-router-dom"

import { Container } from "@/components/Container"
import { legalContact, legalSections, legalUpdated } from "@/data/legal"

/**
 * Página de políticas (Términos, Privacidad, Reembolsos, Uso aceptable).
 * Una sola ruta /legal con secciones ancladas (#terminos, #privacidad, ...),
 * enlazadas desde el pie. Da la capa de legitimidad que revisa una pasarela
 * de pago sin tocar el contenido técnico de la web.
 */
export function LegalPage() {
  const { hash } = useLocation()

  useEffect(() => {
    if (hash) {
      const el = document.getElementById(hash.slice(1))
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" })
        return
      }
    }
    window.scrollTo(0, 0)
  }, [hash])

  return (
    <Container className="py-16 sm:py-20">
      <div className="mx-auto max-w-3xl">
        <p className="font-display text-[11px] font-bold tracking-[0.18em] text-cyan uppercase">
          Legal
        </p>
        <h1 className="mt-3 font-display text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
          Políticas y términos
        </h1>
        <p className="mt-3 text-sm text-foreground/50">
          Última actualización: {legalUpdated}
        </p>
        <p className="mt-6 text-sm leading-relaxed text-foreground/70">
          AriadGSM es un servicio para técnicos profesionales de reparación y
          mantenimiento de equipos móviles. Acá están las reglas de uso,
          privacidad y pagos. Ante cualquier duda escribinos a{" "}
          <a href={`mailto:${legalContact}`} className="text-cyan hover:underline">
            {legalContact}
          </a>
          .
        </p>

        <nav aria-label="Índice de políticas" className="mt-8 rounded-xl border border-line bg-card p-4">
          <ul className="grid gap-2 sm:grid-cols-2">
            {legalSections.map((section) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className="rounded-md text-sm text-foreground/70 transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  {section.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="mt-12 space-y-12">
          {legalSections.map((section) => (
            <section key={section.id} id={section.id} className="scroll-mt-24">
              <h2 className="font-display text-xl font-bold text-foreground">
                {section.title}
              </h2>
              <div className="mt-4 space-y-4">
                {section.blocks.map((block, index) =>
                  "ul" in block ? (
                    <ul key={index} className="ml-5 list-disc space-y-2">
                      {block.ul.map((item, i) => (
                        <li key={i} className="text-sm leading-relaxed text-foreground/70">
                          {item}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p key={index} className="text-sm leading-relaxed text-foreground/70">
                      {block.p}
                    </p>
                  )
                )}
              </div>
            </section>
          ))}
        </div>
      </div>
    </Container>
  )
}
