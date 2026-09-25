import { useEffect } from "react"
import { CalendarDays, Check, Package, ShieldCheck } from "lucide-react"

import { Container } from "@/components/Container"
import { DownloadButton } from "@/components/DownloadButton"
import { GridPattern, Kicker, Panel } from "@/components/Panel"
import { changelog, tagLabel, type ChangeTag } from "@/data/changelog"
import { product, requirements } from "@/data/product"
import { useRelease } from "@/lib/release"
import { useSeo } from "@/lib/seo"

const tagColor: Record<ChangeTag, string> = {
  nuevo: "border-cobalt/50 bg-cobalt/10 text-kicker",
  mejora: "border-[#1C5A44] bg-[#0F2E24] text-[#7CE6B4]",
  arreglo: "border-[#5A4A20] bg-[#2E2513] text-[#F0C97D]",
}

function fmtFecha(iso: string): string {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00`) : new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" })
}

export function DownloadPage() {
  const { versionLabel, buildDateLabel } = useRelease()

  // La versión vigente llega en vivo del servidor; el changelog es texto que se
  // mantiene a mano. Si la vigente es más nueva que la última anotada, avisamos.
  const vigente = versionLabel.replace(/^v/i, "")
  const anotada = changelog[0]?.version ?? ""
  const changelogAtrasado = Boolean(vigente && anotada && vigente !== anotada)

  useSeo({
    titulo: "Descargar Ari-Tool — última versión y novedades | AriadGSM",
    descripcion:
      "Descargá la última versión de Ari-Tool para Windows 10/11. Remoción de Security Plugin (MDM) y AntiCrack en Tecno, Infinix e itel. Mirá el changelog con las novedades de cada versión.",
    ruta: "/descargas",
  })

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  return (
    <Container className="py-16 sm:py-20">
      {/* Encabezado + descarga */}
      <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <div>
          <Kicker className="text-cyan">Descargar</Kicker>
          <h1 className="mt-4 font-display text-3xl font-extrabold tracking-[0.02em] text-balance text-foreground uppercase sm:text-4xl">
            Descargá {product.name}
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-foreground/65 sm:text-base">
            La app de escritorio para remover el Security Plugin (MDM) y el AntiCrack en equipos
            Tecno, Infinix e itel con MediaTek. La ROM del modelo ya viene lista.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <DownloadButton label="Descargar para Windows" />
            <span className="inline-flex items-center gap-2 text-xs font-semibold tracking-[0.14em] text-foreground/50 uppercase">
              <Package aria-hidden="true" className="size-4 text-cyan" />
              {versionLabel}
            </span>
            <span className="inline-flex items-center gap-2 text-xs font-semibold tracking-[0.14em] text-foreground/50 uppercase">
              <CalendarDays aria-hidden="true" className="size-4 text-cyan" />
              {buildDateLabel}
            </span>
          </div>
          <p className="mt-4 text-xs text-foreground/45">
            Windows 10/11 de 64 bits · La app se actualiza sola después de instalar.
          </p>
        </div>

        {/* Requisitos */}
        <Panel glow className="p-6">
          <GridPattern />
          <div className="relative">
            <h2 className="inline-flex items-center gap-2 font-display text-sm font-extrabold tracking-[0.02em] text-foreground uppercase">
              <ShieldCheck aria-hidden="true" className="size-4 text-cyan" />
              Antes de instalar
            </h2>
            <ul className="mt-4 space-y-2.5">
              {requirements.map((req) => (
                <li key={req} className="flex gap-2.5 text-sm leading-relaxed text-foreground/65">
                  <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-cobalt" strokeWidth={2.5} />
                  <span>{req}</span>
                </li>
              ))}
            </ul>
          </div>
        </Panel>
      </div>

      {/* Changelog */}
      <div className="mt-16 border-t border-line pt-12">
        <Kicker className="text-cyan">Novedades</Kicker>
        <h2 className="mt-4 font-display text-2xl font-extrabold tracking-[0.02em] text-foreground uppercase sm:text-3xl">
          Changelog
        </h2>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-foreground/60">
          Qué cambió en cada versión. Actualizamos seguido: por eso conviene tener la última.
        </p>
        {changelogAtrasado ? (
          <p className="mt-4 inline-flex items-center gap-2 rounded-lg border border-line bg-field px-3 py-2 text-xs text-foreground/60">
            <Package aria-hidden="true" className="size-3.5 text-cyan" />
            La versión vigente es <span className="font-semibold text-foreground">{versionLabel}</span>. Vamos
            completando el detalle de cada versión acá.
          </p>
        ) : null}

        <ol className="mt-10 space-y-10">
          {changelog.map((entry) => (
            <li key={entry.version} className="relative pl-8 sm:pl-10">
              <span
                aria-hidden="true"
                className="absolute top-1.5 left-0 size-3 rounded-full border-2 border-cobalt bg-background"
              />
              <span
                aria-hidden="true"
                className="absolute top-5 bottom-[-2.5rem] left-[5px] w-px bg-line last:hidden"
              />
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-display text-lg font-extrabold tracking-tight text-foreground tabular-nums">
                  v{entry.version}
                </span>
                <span
                  className={`inline-flex items-center rounded-full border px-2.5 py-0.5 font-display text-[10px] font-bold tracking-[0.16em] uppercase ${tagColor[entry.tag]}`}
                >
                  {tagLabel[entry.tag]}
                </span>
                <span className="text-xs text-foreground/45">{fmtFecha(entry.date)}</span>
              </div>
              <ul className="mt-4 space-y-2.5">
                {entry.notes.map((note) => (
                  <li key={note} className="flex gap-2.5 text-sm leading-relaxed text-foreground/70">
                    <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-cyan" strokeWidth={2.5} />
                    <span>{note}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </div>
    </Container>
  )
}
