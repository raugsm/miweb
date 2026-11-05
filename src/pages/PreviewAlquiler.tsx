/**
 * Vista previa TEMPORAL de la grilla de alquiler, para ver y capturar la sección con precios en vivo
 * mientras se arma la portada completa. Incluye un selector de país rápido. Se elimina cuando el Inicio
 * (W1) esté integrado. Ruta: /preview-alquiler.
 */
import { useEffect } from "react"

import { Container } from "@/components/Container"
import { AlquilerSection } from "@/components/sections/AlquilerSection"
import { usePais } from "@/lib/pais"
import { PAISES } from "@/lib/precios"
import { cn } from "@/lib/utils"

export function PreviewAlquiler() {
  const { pais, setPais } = usePais()

  // Dev: permite fijar el país por URL (?pais=PE) para capturas.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("pais")
    if (q) setPais(q.toUpperCase())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Container className="flex flex-wrap items-center gap-2 border-b border-line py-4">
        <span className="mr-1 text-sm text-muted-foreground">Vista previa · país:</span>
        {PAISES.map((p) => (
          <button
            key={p.codigo}
            type="button"
            onClick={() => setPais(p.codigo)}
            className={cn(
              "rounded-full border px-3 py-1 text-sm transition-colors",
              pais === p.codigo
                ? "border-cobalt bg-cobalt/10 text-foreground"
                : "border-line text-muted-foreground hover:text-foreground"
            )}
          >
            {p.bandera} {p.codigo}
          </button>
        ))}
      </Container>
      <AlquilerSection />
    </div>
  )
}
