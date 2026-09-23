/**
 * Título y descripción por página.
 *
 * El sitio es una sola página que cambia de contenido sin recargar, así que
 * el <title> del HTML sería el mismo para todas. Buscadores y enlaces
 * compartidos mostrarían siempre lo mismo. Este gancho lo corrige al entrar
 * a cada pantalla.
 */
import { useEffect } from "react"

export const SITIO = "https://ariadgsm.com"

/**
 * Cómo nos busca la gente. Nadie escribe el nombre completo: teclea "ari",
 * "ariad", "aritool", "ariad gsm". Todas esas formas tienen que llevar acá.
 */
export const NOMBRES = [
  "Ari-Tool",
  "Ari Tool",
  "AriTool",
  "Ari",
  "Ariad",
  "AriadGSM",
  "Ariad GSM",
  "Ariad Desbloqueador",
]

type Seo = {
  titulo: string
  descripcion: string
  /** Ruta sin el dominio, con barra inicial. */
  ruta: string
  /** Las pantallas privadas o sin valor de búsqueda no se indexan. */
  indexar?: boolean
}

function etiqueta(selector: string, crear: () => HTMLElement): HTMLElement {
  let el = document.head.querySelector<HTMLElement>(selector)
  if (!el) {
    el = crear()
    document.head.appendChild(el)
  }
  return el
}

function meta(nombre: string, contenido: string, porPropiedad = false) {
  const attr = porPropiedad ? "property" : "name"
  const el = etiqueta(`meta[${attr}="${nombre}"]`, () => {
    const m = document.createElement("meta")
    m.setAttribute(attr, nombre)
    return m
  })
  el.setAttribute("content", contenido)
}

export function useSeo({ titulo, descripcion, ruta, indexar = true }: Seo) {
  useEffect(() => {
    const url = `${SITIO}${ruta}`
    document.title = titulo
    meta("description", descripcion)

    // Canónica: le dice al buscador cuál es la dirección buena de esta página,
    // para que www y sin www no cuenten como dos páginas distintas.
    const canon = etiqueta('link[rel="canonical"]', () => {
      const l = document.createElement("link")
      l.setAttribute("rel", "canonical")
      return l
    })
    canon.setAttribute("href", url)

    meta("og:title", titulo, true)
    meta("og:description", descripcion, true)
    meta("og:url", url, true)
    meta("twitter:title", titulo)
    meta("twitter:description", descripcion)

    meta("robots", indexar ? "index, follow" : "noindex, follow")
  }, [titulo, descripcion, ruta, indexar])
}
