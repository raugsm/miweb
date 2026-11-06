/**
 * El "pre": la pantalla que el servidor manda ya dibujada en el primer HTML (hoy, Ingresar), para que se
 * vea antes de que cargue React. La genera scripts/prerender-web.mjs con los mismos componentes.
 *
 * Mientras React no cargó, el cliente puede escribir y tocar botones en el pre. Este archivo es el pase:
 * la pantalla real arranca con lo que ya se escribió, sigue lo que quedó pendiente y recién entonces
 * retira el pre. Sin pre (desarrollo, o navegación interna) todo esto no hace nada.
 */

type Pre = {
  /** Botón que el cliente tocó antes de tiempo. */
  pendiente?: "ingresar" | "crear" | "recuperar"
  /** "quieto" = el emblema ya está dibujado en el pre: la escena animada entra armada, sin entrada. */
  emblema?: "quieto"
}

const pre = (): HTMLElement | null => (typeof document === "undefined" ? null : document.getElementById("pre"))
const estado = (): Pre => (typeof window === "undefined" ? {} : ((window as { __pre?: Pre }).__pre ?? {}))

/** Los campos del pre que están a la vista (hay una versión de compu y una de celular). */
function campo(nombre: string): HTMLInputElement | null {
  const todos = pre()?.querySelectorAll<HTMLInputElement>(`[data-pre="${nombre}"]`) ?? []
  return Array.from(todos).find((el) => el.offsetParent !== null) ?? null
}

/** Lo que el cliente ya escribió en el pre en el campo `nombre` ("correo", "clave"). */
export function valorPrevio(nombre: string): string {
  return campo(nombre)?.value ?? ""
}

/** El botón que tocó antes de que cargara la página (se consume: la segunda vez devuelve null). */
export function pendientePrevio(): Pre["pendiente"] | null {
  const e = estado()
  const p = e.pendiente ?? null
  delete e.pendiente
  return p
}

/** ¿El pre ya mostró el emblema quieto? Entonces la escena no hace entrada. */
export function emblemaPrevioQuieto(): boolean {
  return pre() !== null && estado().emblema === "quieto"
}

/**
 * La pantalla real ya está armada: se retira el pre y, si el cliente estaba escribiendo, el cursor pasa
 * al mismo campo de la pantalla real. (La pantalla real se muestra sola al irse el pre: ver el CSS del pre.)
 */
export function entregarPrevio(): void {
  const p = pre()
  if (!p) return
  const activo = document.activeElement instanceof HTMLInputElement && p.contains(document.activeElement) ? document.activeElement : null
  const nombre = activo?.dataset.pre
  const cursor = activo ? [activo.selectionStart, activo.selectionEnd] : null
  p.remove()
  if (!nombre) return
  const real = document.getElementById(nombre)
  if (!(real instanceof HTMLInputElement)) return
  real.focus()
  try {
    if (cursor) real.setSelectionRange(cursor[0], cursor[1])
  } catch {
    /* los campos de correo no dejan mover el cursor: queda al final */
  }
}
