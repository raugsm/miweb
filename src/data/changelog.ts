// Historial de versiones de Ari-Tool. La versión VIGENTE y el enlace de descarga
// se toman en vivo del servidor (ver lib/release.tsx); este historial es el texto
// de las novedades. Para publicar una versión nueva: agregá una entrada arriba.

export type ChangeTag = "nuevo" | "mejora" | "arreglo"

export type ChangelogEntry = {
  version: string
  date: string // ISO (YYYY-MM-DD)
  tag: ChangeTag
  notes: string[]
}

export const changelog: ChangelogEntry[] = [
  {
    version: "1.0.0",
    date: "2026-09-21",
    tag: "nuevo",
    notes: [
      "Primer lanzamiento público de Ari-Tool.",
      "Remoción de Security Plugin (MDM) y AntiCrack en Tecno, Infinix e itel.",
      "Catálogo con 424 modelos MediaTek, Android 12 a 16.",
      "Proceso guiado con checklist, progreso y verificación de arranque.",
      "Recarga de créditos con Binance Pay desde el panel.",
    ],
  },
]

export const tagLabel: Record<ChangeTag, string> = {
  nuevo: "Nuevo",
  mejora: "Mejora",
  arreglo: "Arreglo",
}
