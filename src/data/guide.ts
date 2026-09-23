import type { IconName } from "@/lib/icons"

export type GuideStep = {
  title: string
  intro: string
  bullets: string[]
  command?: { label: string; value: string }
}

export type TroubleshootingItem = {
  icon: IconName
  title: string
  solution: string
}

export const guidePage = {
  eyebrow: "Guía",
  title: "Guía de uso",
  lead: "El procedimiento completo, paso a paso.",
  beforeStartTitle: "Antes de empezar",
  beforeStartNote: "Revisa los requisitos antes de conectar el equipo.",
  troubleshootingEyebrow: "Solución de problemas",
  troubleshootingTitle: "Problemas comunes",
  closing:
    "Si el problema persiste, contacta a tu proveedor con los datos de la página de soporte.",
}

export const guideSteps: GuideStep[] = [
  {
    title: "Descarga y abre la aplicación",
    intro: "Guarda el .exe y ábrelo con doble clic.",
    bullets: [
      "Es portable: no requiere instalación.",
      "Si Windows muestra un aviso, permite la ejecución.",
    ],
  },
  {
    title: "Inicia sesión",
    intro: "La aplicación siempre abre en la pantalla de acceso.",
    bullets: [
      "Entra con tu correo y contraseña.",
      "La primera vez validas tu correo con un código de 6 números; después entras directo.",
      "Arriba ves tu saldo de créditos.",
    ],
  },
  {
    title: "Prepara el equipo",
    intro: "Bootloader desbloqueado y conexión USB en Fastboot o Fastbootd.",
    bullets: [
      "El bootloader desbloqueado es un requisito: si está bloqueado, el proceso se detiene.",
      "Si el equipo no aparece, revisa cable, puerto y drivers. Prefiere un puerto USB 2.0.",
    ],
  },
  {
    title: "Revisa la compatibilidad (recomendado)",
    intro: "Puedes leer el equipo antes de escribir nada.",
    bullets: [
      "La lectura es solo de consulta: no modifica el equipo.",
      "Te confirma si hay una versión disponible para ese modelo.",
    ],
  },
  {
    title: "Confirma el modelo",
    intro: "La ROM de tu equipo ya viene lista: solo confirma que el modelo es el correcto.",
    bullets: [
      "No hace falta conseguir ni preparar el firmware.",
      "El cobro se hace al terminar: si el flasheo falla o se corta, no se descuentan créditos.",
    ],
  },
  {
    title: "Flashea el equipo",
    intro: "Sigue el asistente de flasheo guiado.",
    bullets: [
      "El proceso FORMATEA los datos del equipo: avisa al cliente y respalda antes de empezar.",
      "No desconectes el equipo durante la escritura.",
      "Ten el equipo con buena carga: la aplicación avisa si el voltaje de la batería está bajo.",
    ],
  },
  {
    title: "Verifica el resultado",
    intro: "Comprueba que el bloqueo ya no está.",
    bullets: [
      "El equipo debe arrancar con normalidad.",
      "El primer arranque puede tardar entre 3 y 5 minutos: es normal, no lo desconectes.",
    ],
  },
]

export const troubleshootingItems: TroubleshootingItem[] = [
  {
    icon: "cable",
    title: "El equipo no se detecta",
    solution:
      "Revisa cable, puerto y drivers, y confirma el modo Fastboot o Fastbootd. Prueba con un puerto USB 2.0.",
  },
  {
    icon: "wrench",
    title: "La aplicación no abre",
    solution:
      "Permite la ejecución si Windows lo solicita y revisa tu software de seguridad.",
  },
  {
    icon: "triangleAlert",
    title: "No hay versión para mi equipo",
    solution:
      "El catálogo crece por modelo. Escribe al WhatsApp de soporte con el modelo exacto para consultar disponibilidad.",
  },
  {
    icon: "wrench",
    title: "Me quedé sin créditos",
    solution:
      "Escribe al WhatsApp de soporte para recargar. El saldo se ve siempre en la parte superior de la aplicación.",
  },
  {
    icon: "triangleAlert",
    title: "El equipo no arranca",
    solution:
      "Espera unos minutos: el primer arranque es lento. No lo desconectes durante el flasheo y contacta a tu proveedor con los detalles.",
  },
]
