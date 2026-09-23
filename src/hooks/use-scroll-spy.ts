import { useEffect, useState } from "react"

/**
 * Devuelve el id de la sección que el visitante está mirando, para que el menú
 * resalte "dónde estoy". Observa una banda cerca del borde superior: la sección
 * cuyo inicio cae en esa banda es la activa.
 *
 * Solo tiene sentido en una página con esas secciones (la portada); en el resto
 * se pasa enabled=false y no observa nada.
 */
export function useScrollSpy(ids: string[], enabled: boolean): string | null {
  const [active, setActive] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled || ids.length === 0) {
      setActive(null)
      return
    }

    const elementos = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => Boolean(el))
    if (elementos.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        const visibles = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visibles.length > 0) {
          setActive(visibles[0].target.id)
        }
      },
      // Banda de activación entre ~18% y ~32% desde arriba, debajo del header.
      { rootMargin: "-18% 0px -68% 0px", threshold: 0 }
    )

    elementos.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [ids.join(","), enabled])

  return active
}
