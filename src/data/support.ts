import type { IconName } from "@/lib/icons"

export type SupportChecklistItem = {
  icon: IconName
  label: string
  description: string
}

export type SupportShortcut = {
  label: string
  description: string
  href: string
}

export const supportPage = {
  eyebrow: "Soporte",
  title: "Soporte por WhatsApp, directo",
  lead: "Accesos, errores de flasheo y dudas. Te responde una persona, no un bot.",
  channelTitle: "Canal oficial",
  channelBody:
    "Escribinos por WhatsApp: ahí se gestionan accesos y cualquier problema con la herramienta. Las recargas ya son automáticas desde tu panel.",
  channelTip: "Ten el equipo y el reporte a mano.",
  creditsTitle: "Cómo funcionan los créditos",
  creditsBody:
    "Cada proceso cuesta 1 crédito ($1) y se cobra recién cuando termina bien. Recargás al instante desde tu panel (Binance Pay, o Yape en Perú) y los créditos se acreditan en segundos; el saldo y el historial se ven en Mi cuenta y en la app.",
  checklistTitle: "Qué incluir en el reporte",
  checklistLead: "Un reporte preciso acelera el diagnóstico.",
  shortcutsTitle: "Respuestas rápidas",
  shortcutsLead: "Resuelven la mayoría de las dudas.",
}

export const supportChecklist: SupportChecklistItem[] = [
  {
    icon: "smartphone",
    label: "Modelo exacto",
    description: "Por ejemplo, Infinix X6850 o Tecno KM7.",
  },
  {
    icon: "fileCheck",
    label: "Compilación",
    description: "Está en la información del sistema del equipo.",
  },
  {
    icon: "info",
    label: "Versión de la app",
    description: "Indica v1.0.0.",
  },
  {
    icon: "listChecks",
    label: "Paso donde falló",
    description: "Descarga, conexión o flasheo.",
  },
  {
    icon: "circleAlert",
    label: "Mensaje de error",
    description: "Texto o captura de pantalla.",
  },
  {
    icon: "monitorCheck",
    label: "Versión de Windows",
    description: "Windows 10 u 11, 64 bits.",
  },
]

export const supportShortcuts: SupportShortcut[] = [
  {
    label: "Descarga y requisitos",
    description: "Versión, hash y avisos.",
    href: "/",
  },
  {
    label: "Guía de uso",
    description: "El procedimiento paso a paso.",
    href: "/#guia",
  },
]
