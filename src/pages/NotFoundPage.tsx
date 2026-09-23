import { Link } from "react-router-dom"

import { Container } from "@/components/Container"
import { Button } from "@/components/ui/button"
import { useSeo } from "@/lib/seo"

export function NotFoundPage() {
  useSeo({
    titulo: "Página no encontrada | Ari-Tool",
    descripcion:
      "La página que buscás no existe. Volvé al inicio de Ari-Tool.",
    ruta: "/404",
    indexar: false,
  })

  return (
    <Container className="flex min-h-[60vh] flex-col items-center justify-center py-24 text-center">
      <p className="text-xs font-medium tracking-[0.2em] text-foreground/45 uppercase">
        Error 404
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
        Página no encontrada
      </h1>
      <p className="mt-4 max-w-md text-base leading-relaxed text-foreground/65">
        La página que buscas no existe o cambió de dirección.
      </p>
      <Button
        asChild
        size="lg"
        className="mt-8 h-11 rounded-lg px-5 font-medium hover:bg-cobalt-deep"
      >
        <Link to="/">Volver al inicio</Link>
      </Button>
    </Container>
  )
}
