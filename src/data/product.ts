export type Product = {
  name: string
  version: string
  versionLabel: string
  buildDateLabel: string
  downloadPath: string
  downloadAvailable: boolean
}

export const product: Product = {
  name: "Ari-Tool",
  version: "1.0.0",
  versionLabel: "v1.0.0",
  buildDateLabel: "21/09/2026",
  downloadPath: "/downloads/Ari-Tool.exe",
  downloadAvailable: false,
}

export type NavItem = { label: string; href: string }

export const headerLinks: NavItem[] = [
  { label: "Producto", href: "/#producto" },
  { label: "AriadGSM", href: "/gsm" },
]

export const pageLinks: NavItem[] = [
  { label: "Guía", href: "/#guia" },
  { label: "Soporte", href: "/#soporte" },
]

export const footerLinks: NavItem[] = [
  { label: "Guía", href: "/#guia" },
  { label: "Soporte", href: "/#soporte" },
  { label: "AriadGSM", href: "/gsm" },
]

// Sin boton de descarga en la barra: confundia, porque aparecia en todas las
// paginas sin decir que descargaba. Cada producto tiene el suyo donde
// corresponde: Ari-Tool en la portada y AriadGSM Cliente en /gsm.

/** Acceso de clientes: reemplaza al item "Mi cuenta" que antes vivia en el menu. */
export const sessionCta: NavItem = { label: "Iniciar sesión", href: "/cuenta" }

export const heroContent = {
  kicker: "Security Plugin + AntiCrack · MediaTek",
  title: "Remoción de Security Plugin, lectura de AntiCrack.",
  lead: "Ari-Tool resuelve dos frentes en Tecno, Infinix e itel con MediaTek: remueve el bloqueo de administración remota y te reporta el estado del AntiCrack antes de flashear. Conectás por Fastboot, la ROM de tu modelo ya viene lista y el equipo vuelve a ser del cliente.",
  highlights: ["Security Plugin fuera", "AntiCrack sin sorpresas", "424 modelos, ROM lista"],
  primaryCta: "Descargar para Windows",
  secondaryCta: "Ver el producto",
  trustSuffix: "Windows 10/11",
}

export const productSection = {
  eyebrow: "Producto",
  title: "Una sola herramienta, control total",
  lead: "Todo en una app de escritorio: catálogo listo, proceso guiado y validaciones en cada escritura.",
}

export const bento = {
  // Tarjeta única: "ROM lista" + "Compatibilidad" fusionadas. La tabla de
  // particiones se retiró a propósito: nombraba el mecanismo interno que no
  // debe verse. En su lugar, un lado técnico orientado al cliente.
  catalogCard: {
    kicker: "Escritorio · Windows",
    title: "La ROM de tu modelo, ya viene lista",
    caption: "Elegís el modelo del catálogo y escribís. Sin buscar archivos ni armar paquetes.",
    stat: 424,
    statUnit: "modelos en catálogo",
    brands: ["Infinix", "Tecno", "itel"],
    readoutTitle: "Compatibilidad",
    mode: "Fastboot",
    // Modelos 2026 verificados contra el catálogo real, no inventados.
    examples: [
      "Infinix Note 50 Pro+ 5G",
      "Infinix Hot 50 Pro Plus",
      "Infinix Zero 40 5G",
      "TECNO Camon 40 Premier",
      "TECNO Camon 40 Pro 5G",
      "TECNO Spark 50 Pro",
      "itel A100",
      "itel A95 5G",
      "itel City 100",
    ],
    meta: "Chipset MediaTek · Android 12 a 16 · Consultá tu modelo desde la app.",
  },
  controlCard: {
    kicker: "Proceso",
    title: "Control de cada fase",
    caption: "Checklist, progreso y validaciones antes de cada escritura.",
    phases: ["Detectar el equipo", "Confirmar el modelo", "Flashear particiones", "Verificar arranque"],
  },
  warrantyCard: {
    kicker: "Garantía",
    title: "Sabemos qué pasó",
    caption:
      "La cobertura viaja dentro del proceso: si el equipo presenta un problema después, sabemos qué pasó. Para operar necesitás tu cuenta activa y créditos (5 créditos = $5 · 1 proceso = 5 créditos), y el cobro se hace recién al terminar.",
    from: "Tu PC",
    to: "Equipo del cliente",
    link: "USB · Fastboot",
    badge: "Cobertura incluida",
  },
}

export const requirements: string[] = [
  "Windows 10/11 de 64 bits con drivers USB.",
  "Cuenta activa con créditos suficientes (1 proceso = 5 créditos = $5).",
  "Bootloader desbloqueado.",
  "Equipo en modo Fastboot o Fastbootd.",
  "Batería con buena carga: la app avisa si el voltaje está bajo.",
  "Alrededor de 15 GB libres en disco.",
  "Tener presente que el proceso formatea los datos del equipo.",
]

export const footerContent = {
  tagline:
    "Ari-Tool es la herramienta de AriadGSM para quitar el Security Plugin de equipos Tecno, Infinix e itel con MediaTek.",
  navTitle: "Navegación",
  resourcesTitle: "Recursos",
  copyright: "© 2026 AriadGSM · Ariad. Todos los derechos reservados.",
  /** Cuarta columna del pie, junto a Recursos. */
  noticeTitle: "Antes de flashear",
  disclaimer:
    "El flasheo reescribe el firmware y borra los datos del equipo. Verificá el modelo y respaldá antes de empezar: cada proceso queda a cargo del técnico que lo ejecuta.",
}
