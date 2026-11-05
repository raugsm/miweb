/**
 * PLACEHOLDER de diseño para Novedades (W10).
 *
 * La FUENTE REAL la publica Ari-Cliente por cada versión (W8 regla 6): versión + fecha + notas, con su
 * ÁREA (Alquiler, Pagos, App, Cuenta MI, FRP…), del MISMO lugar que la actualización de la app. Cuando esa
 * fuente esté, la web la lee de ahí y se borra este archivo. No es contenido definitivo.
 *
 * Reglas al renderizar:
 *  - "actual" lo deriva la web de la versión VIVA (useRelease), NO de este archivo. Nunca se marca una
 *    versión vieja como actual.
 *  - Si una nota no trae área, se muestra SIN etiqueta (no se inventa una).
 *  - Notas cortas, una línea, para el cliente. La marca se escribe "AriTool".
 */
export type NotaArea = { area?: string; texto: string }
export type Novedad = { version: string; fecha: string; notas: NotaArea[] }

export const novedades: Novedad[] = [
  {
    version: "1.1.42",
    fecha: "2026-11-04",
    notas: [
      { area: "Alquiler", texto: "El tiempo de tus herramientas en uso baja en vivo, segundo a segundo." },
      { area: "Alquiler", texto: "La lista de herramientas en uso tiene su propio desplazamiento." },
    ],
  },
  {
    version: "1.1.40",
    fecha: "2026-11-02",
    notas: [
      { area: "Pagos", texto: "Binance: ahora ves el Pay ID al pagar." },
      { area: "Pagos", texto: "El botón Confirmar de Yape muestra en qué paso está." },
    ],
  },
  {
    version: "1.1.39",
    fecha: "2026-10-31",
    notas: [
      { area: "App", texto: "La consola muestra el avance de cada paso." },
      { area: "Pagos", texto: "Textos más claros al pagar." },
    ],
  },
  {
    version: "1.1.38",
    fecha: "2026-10-29",
    notas: [{ area: "Alquiler", texto: "Nuevo: alquilá herramientas por horas desde la app." }],
  },
]
