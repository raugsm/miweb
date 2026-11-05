/**
 * Sección "Alquiler de herramientas" de la portada (W1).
 *
 * Lee el catálogo y los precios EN VIVO del país elegido (usePrecios → sop_publico.precios).
 * Reglas W1/W8:
 *  - Las tarjetas NO se abren ni despliegan nada.
 *  - Cada herramienta: logo, nombre, precio del momento · horas, "Descargar programa".
 *  - Precio cargando → barra gris (nunca "S/ 0" ni un precio viejo).
 *  - Apagada/mantenimiento → aviso si hay, si no "Próximamente" (no se vende lo que no se puede usar).
 *  - Debajo de la grilla, una sola línea de ayuda, sin enlace.
 */
import { Download } from "lucide-react"

import { Container } from "@/components/Container"
import { descargaDe } from "@/data/descargas"
import { usePrecios } from "@/hooks/use-precios"
import { formatearPrecio, type HerramientaPrecio } from "@/lib/precios"
import { cn } from "@/lib/utils"

function Inicial({ nombre, apagado = false }: { nombre: string; apagado?: boolean }) {
  const ini = nombre
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()
  return (
    <div
      aria-hidden="true"
      className={cn(
        "flex size-11 shrink-0 items-center justify-center rounded-xl border border-line bg-field font-heading text-sm font-semibold",
        apagado ? "text-muted-foreground" : "text-foreground"
      )}
    >
      {ini}
    </div>
  )
}

function TarjetaHerramienta({ h }: { h: HerramientaPrecio }) {
  // Apagada / mantenimiento → aviso si hay, si no "Próximamente".
  if (!h.disponible) {
    return (
      <div className="rounded-2xl border border-line bg-card/50 p-5 opacity-70">
        <div className="flex items-start gap-3">
          <Inicial nombre={h.nombre} apagado />
          <div className="min-w-0">
            <div className="truncate font-heading font-semibold text-foreground/70">{h.nombre}</div>
            <div className="mt-0.5 text-sm text-muted-foreground">{h.aviso ?? "Próximamente"}</div>
          </div>
        </div>
      </div>
    )
  }

  const precio =
    h.precio_local != null ? formatearPrecio(h.precio_local, h.moneda) : "Precio en la app"
  const desc = descargaDe(h.clave)

  return (
    <div className="rounded-2xl border border-line bg-card p-5 transition-colors hover:border-foreground/20">
      <div className="flex items-start gap-3">
        <Inicial nombre={h.nombre} />
        <div className="min-w-0">
          <div className="truncate font-heading font-semibold text-foreground">{h.nombre}</div>
          <div className="mt-0.5">
            <span className="font-semibold text-cobalt">{precio}</span>
            <span className="text-sm text-muted-foreground"> · {h.horas} h de uso</span>
          </div>
        </div>
      </div>
      {desc ? (
        <a
          href={desc.pagina}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <Download aria-hidden="true" className="size-4" />
          Descargar programa
        </a>
      ) : null}
    </div>
  )
}

function TarjetaSkeleton() {
  return (
    <div className="rounded-2xl border border-line bg-card p-5">
      <div className="flex items-start gap-3">
        <div className="size-11 shrink-0 animate-pulse rounded-xl bg-field" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-24 animate-pulse rounded bg-field" />
          <div className="h-3 w-32 animate-pulse rounded bg-field" />
        </div>
      </div>
      <div className="mt-4 h-3 w-28 animate-pulse rounded bg-field" />
    </div>
  )
}

export function AlquilerSection() {
  const { cargando, error, datos, refrescar } = usePrecios()

  return (
    <section id="alquiler" className="scroll-mt-20 py-14">
      <Container>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="font-heading text-sm font-semibold uppercase tracking-wider text-kicker">
            Alquiler de herramientas
          </h2>
          <span className="text-sm text-muted-foreground">Precio por uso, en tu moneda</span>
        </div>

        {error && !datos ? (
          <div className="mt-5 rounded-2xl border border-line bg-card p-6 text-center">
            <p className="text-sm text-muted-foreground">No pudimos cargar las herramientas ahora mismo.</p>
            <button
              type="button"
              onClick={refrescar}
              className="mt-3 inline-flex h-9 items-center rounded-lg bg-cobalt px-4 text-sm font-medium text-white"
            >
              Reintentar
            </button>
          </div>
        ) : (
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {cargando && !datos
              ? Array.from({ length: 8 }).map((_, i) => <TarjetaSkeleton key={i} />)
              : datos?.herramientas
                  // Disponibles primero (el sort es estable: respeta el orden del panel dentro de cada grupo).
                  .slice()
                  .sort((a, b) => Number(b.disponible) - Number(a.disponible))
                  .map((h) => <TarjetaHerramienta key={h.clave} h={h} />)}
          </div>
        )}

        <p className="mt-4 text-sm text-muted-foreground">
          Bajás el programa de cada herramienta acá y alquilás la cuenta en la app AriTool.
        </p>
      </Container>
    </section>
  )
}
