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
  { label: "Guía", href: "/guia" },
  { label: "Soporte", href: "/soporte" },
]

export const footerLinks: NavItem[] = [
  { label: "Guía", href: "/guia" },
  { label: "Soporte", href: "/soporte" },
  { label: "AriadGSM", href: "/gsm" },
]

// Sin boton de descarga en la barra: confundia, porque aparecia en todas las
// paginas sin decir que descargaba. Cada producto tiene el suyo donde
// corresponde: Ari-Tool en la portada y AriadGSM Cliente en /gsm.

/** Acceso de clientes: reemplaza al item "Mi cuenta" que antes vivia en el menu. */
export const sessionCta: NavItem = { label: "Iniciar sesión", href: "/cuenta" }

export const heroContent = {
  kicker: "Security Plugin · Tecno, Infinix e itel",
  title: "Sacá el Security Plugin y devolvé el equipo libre.",
  lead: "Ari-Tool quita el bloqueo de administración remota de equipos Tecno, Infinix e itel con MediaTek. La ROM de tu modelo ya viene lista: conectás, flasheás y el equipo vuelve a ser del cliente.",
  highlights: ["424 modelos en catálogo", "ROM lista para flashear", "Cobertura incluida"],
  primaryCta: "Descargar para Windows",
  secondaryCta: "Ver el producto",
  trustSuffix: "Windows 10/11",
}

export const productSection = {
  eyebrow: "Producto",
  title: "Una herramienta de escritorio con control total",
  lead: "Sin preparar firmware ni buscar archivos sueltos: elegís el modelo, la ROM llega lista y la herramienta te guía en cada escritura.",
}

export const bento = {
  productCard: {
    title: "ROM lista",
    caption:
      "No tenés que armar el paquete ni conseguir el firmware. Elegís el modelo y la ROM ya viene preparada para escribir.",
    tableTitle: "Particiones que se escriben",
    partitions: [
      { name: "product", size: "", status: "Lista", progress: 100 },
      { name: "system", size: "", status: "Lista", progress: 100 },
      { name: "system_ext", size: "", status: "Lista", progress: 100 },
      { name: "vbmeta", size: "", status: "Verificada", progress: 100 },
    ],
  },
  modelsCard: {
    kicker: "Compatibilidad",
    value: "424",
    unit: "modelos en catálogo",
    brands: ["Infinix", "Tecno", "itel"],
    // Modelos tomados del catálogo real, no inventados.
    examplesTitle: "Algunos de los que trabajamos",
    examples: [
      "TECNO Spark 20 Pro",
      "TECNO Camon 40 Pro",
      "TECNO Pop 4",
      "Infinix Hot 50 Pro Plus",
      "Infinix Note 50 Pro",
      "Infinix Smart 8",
      "itel A60s",
      "itel A70",
    ],
    caption: "Chipset MediaTek · Android 12 al 16. Consultá tu modelo desde la app.",
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
