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
    version: "1.1.18",
    date: "2026-10-23",
    tag: "nuevo",
    notes: [
      "Cuenta MI renovada: creá el pedido, pagá y seguí el estado en una sola pantalla.",
      "Pago por Yape (con QR) y por Binance más claros y legibles.",
      "Si ya tenés un pago abierto, la app te avisa con el ticket y te deja cerrarlo y seguir, o ir a ese pedido (antes mostraba un error confuso de \"servicio no disponible\").",
      "Vista previa de la foto que subís.",
      "Ajustes visuales para que nada se corte en pantallas chicas.",
    ],
  },
  {
    version: "1.1.17",
    date: "2026-10-22",
    tag: "arreglo",
    notes: [
      "La ventana ahora se adapta a cualquier tamaño y resolución de monitor (ya no se sale de pantalla en laptops chicas).",
    ],
  },
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
