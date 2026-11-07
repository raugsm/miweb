/**
 * Herramientas que la web todavía NO muestra por falta de logo (Ari-Diseño, 7-nov: TFM).
 * El panel las sigue devolviendo en el catálogo; acá solo se esconden de la lista y del buscador.
 * Cuando haya logo, se saca la clave de acá: no se inventa un icono.
 *
 * Vive en su propio archivo sin imports para que `pnpm test:web` pueda leerlo con Node
 * (el test del buscador importa el .ts directo, sin el alias @).
 */
export const HERRAMIENTAS_OCULTAS = new Set(["tfm_tool_pro"])

export function herramientaVisible(h: { clave: string }): boolean {
  return !HERRAMIENTAS_OCULTAS.has(h.clave)
}
