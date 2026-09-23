import { useEffect } from "react"
import { useLocation } from "react-router-dom"

/**
 * Lleva la vista al principio de la página, o a la sección del ancla.
 *
 * El salto al ancla no se hace una sola vez: la página sigue creciendo
 * después (tipografías, imágenes, las tarjetas que se miden solas), y un
 * salto único aterriza donde la sección estaba, no donde queda. En pruebas
 * se pasaba más de 400 px y el título quedaba arriba, fuera de la pantalla.
 *
 * Por eso se repite unas cuantas veces durante el primer segundo, y se corta
 * apenas el visitante mueve la pantalla por su cuenta: nadie quiere pelearse
 * con una página que lo devuelve a donde él no quiere estar.
 */
const REINTENTOS_MS = [0, 80, 200, 400, 700, 1000]

export function ScrollManager() {
  const { pathname, hash, key } = useLocation()

  useEffect(() => {
    if (!hash) {
      window.scrollTo({ top: 0, behavior: "auto" })
      return
    }

    const id = hash.slice(1)
    let cancelado = false
    const temporizadores: number[] = []

    const cancelar = () => {
      cancelado = true
      temporizadores.forEach(window.clearTimeout)
    }

    const acomodar = () => {
      if (cancelado) return
      document.getElementById(id)?.scrollIntoView({ behavior: "auto", block: "start" })
    }

    REINTENTOS_MS.forEach((ms) => {
      temporizadores.push(window.setTimeout(acomodar, ms))
    })

    // Si el visitante toma el control, se lo deja en paz.
    const opciones = { passive: true } as const
    window.addEventListener("wheel", cancelar, opciones)
    window.addEventListener("touchstart", cancelar, opciones)
    window.addEventListener("keydown", cancelar, opciones)

    return () => {
      cancelar()
      window.removeEventListener("wheel", cancelar)
      window.removeEventListener("touchstart", cancelar)
      window.removeEventListener("keydown", cancelar)
    }
  }, [pathname, hash, key])

  return null
}
