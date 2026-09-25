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

/**
 * Navegación principal del encabezado. `section` es el id de la sección en la
 * portada, para resaltar en el menú dónde está parado el visitante (scrollspy).
 * `hint` es la ayuda que se muestra debajo del nombre en el menú móvil.
 */
export type MainNavItem = { label: string; href: string; section: string; hint: string }

export const mainNav: MainNavItem[] = [
  { label: "Producto", href: "/#producto", section: "producto", hint: "Qué hace Ari-Tool" },
  { label: "Precios", href: "/#precios", section: "precios", hint: "Créditos y licencia" },
  { label: "Dispositivos", href: "/#dispositivos", section: "dispositivos", hint: "Marcas y modelos" },
  { label: "Guía", href: "/#guia", section: "guia", hint: "Cómo usarlo, paso a paso" },
  { label: "Soporte", href: "/#soporte", section: "soporte", hint: "WhatsApp y ayuda" },
]

/** Página de descarga con versión y changelog (aparte de la portada). */
export const downloadNav: MainNavItem = {
  label: "Descargar",
  href: "/descargas",
  section: "descargas",
  hint: "Última versión y novedades",
}

/** AriadGSM es otra sección/producto: va aparte, no como una sección de la portada. */
export const crossNav: MainNavItem = {
  label: "AriadGSM",
  href: "/gsm",
  section: "gsm",
  hint: "Desbloqueo FRP de Xiaomi y más",
}

export const pageLinks: NavItem[] = [
  { label: "Guía", href: "/#guia" },
  { label: "Soporte", href: "/#soporte" },
]

export const footerLinks: NavItem[] = [
  { label: "Producto", href: "/#producto" },
  { label: "Precios", href: "/#precios" },
  { label: "Dispositivos", href: "/#dispositivos" },
  { label: "Descargar", href: "/descargas" },
  { label: "Guía", href: "/#guia" },
  { label: "Preguntas frecuentes", href: "/#faq" },
  { label: "Soporte", href: "/#soporte" },
  { label: "AriadGSM", href: "/gsm" },
]

/** Enlaces legales del pie: una sola página /legal con secciones ancladas. */
export const legalLinks: NavItem[] = [
  { label: "Términos", href: "/legal#terminos" },
  { label: "Privacidad", href: "/legal#privacidad" },
  { label: "Reembolsos", href: "/legal#reembolsos" },
  { label: "Uso aceptable", href: "/legal#uso-aceptable" },
]

// Sin boton de descarga en la barra: confundia, porque aparecia en todas las
// paginas sin decir que descargaba. Cada producto tiene el suyo donde
// corresponde: Ari-Tool en la portada y AriadGSM Cliente en /gsm.

/** Acceso de clientes: reemplaza al item "Mi cuenta" que antes vivia en el menu. */
export const sessionCta: NavItem = { label: "Iniciar sesión", href: "/cuenta" }

export const heroContent = {
  kicker: "Security Plugin (MDM) + AntiCrack · MediaTek",
  title: "Remoción de Security Plugin y AntiCrack.",
  lead: "Ari-Tool trabaja equipos Tecno, Infinix e itel con MediaTek: remueve el Security Plugin (MDM) y el AntiCrack, con la ROM del modelo ya lista. Conectás por Fastboot, flasheás y el equipo vuelve a ser del cliente.",
  highlights: ["Security Plugin fuera", "AntiCrack fuera", "424 modelos, ROM lista"],
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
      "La cobertura viaja dentro del proceso: si el equipo presenta un problema después, sabemos qué pasó. Para operar necesitás tu cuenta activa y créditos (1 crédito = $1 · 1 proceso = 1 crédito), y el cobro se hace recién al terminar.",
    from: "Tu PC",
    to: "Equipo del cliente",
    link: "USB · Fastboot",
    badge: "Cobertura incluida",
  },
}

export const requirements: string[] = [
  "Windows 10/11 de 64 bits con drivers USB.",
  "Cuenta activa con créditos suficientes (1 proceso = 1 crédito = $1).",
  "Bootloader desbloqueado.",
  "Equipo en modo Fastboot o Fastbootd.",
  "Batería con buena carga: la app avisa si el voltaje está bajo.",
  "Alrededor de 15 GB libres en disco.",
  "Tener presente que el proceso formatea los datos del equipo.",
]

export const footerContent = {
  tagline:
    "Ari-Tool es la herramienta de AriadGSM para remover el Security Plugin (MDM) y el AntiCrack de equipos Tecno, Infinix e itel con MediaTek.",
  navTitle: "Navegación",
  resourcesTitle: "Recursos",
  copyright: "© 2026 AriadGSM · Ariad. Todos los derechos reservados.",
  /** Cuarta columna del pie, junto a Recursos. */
  noticeTitle: "Antes de flashear",
  disclaimer:
    "El flasheo reescribe el firmware y borra los datos del equipo. Verificá el modelo y respaldá antes de empezar: cada proceso queda a cargo del técnico que lo ejecuta.",
  /** Aviso de uso profesional en la barra inferior del pie (todas las páginas). */
  professionalUse:
    "Herramienta para uso profesional autorizado. Prohibido su uso en equipos robados, perdidos o sin autorización del propietario.",
}

// ------------------------------------------------------------------
// PRECIOS · el modelo es pago por uso (créditos) + una licencia futura.
// 1 crédito = 1 USD = 1 proceso. El cobro se hace recién al terminar.
// ------------------------------------------------------------------
export type PricingPlan = {
  name: string
  price: string
  unit: string
  tagline: string
  featured?: boolean
  badge?: string
  features: string[]
  cta: { label: string; href: string }
  disabled?: boolean
}

export const pricing: {
  eyebrow: string
  title: string
  lead: string
  plans: PricingPlan[]
  note: string
} = {
  eyebrow: "Precios",
  title: "Pagás por lo que usás",
  lead: "Sin mensualidad obligatoria. Cada proceso descuenta créditos y el cobro se hace recién cuando termina bien.",
  plans: [
    {
      name: "Créditos",
      price: "$1",
      unit: "por crédito",
      tagline: "1 crédito = 1 proceso",
      featured: true,
      features: [
        "Pagás solo cuando trabajás.",
        "El cobro se hace al terminar el proceso, no antes.",
        "Recarga al instante con Binance Pay desde tu panel.",
        "Cobertura incluida en cada proceso.",
        "Tus créditos no vencen.",
      ],
      cta: { label: "Crear cuenta y recargar", href: "/cuenta" },
    },
    {
      name: "Licencia",
      price: "$25",
      unit: "próximamente",
      tagline: "Plan por período",
      badge: "Próximamente",
      features: [
        "Un plan por período, pensado para taller.",
        "Los procesos se siguen pagando con créditos.",
        "Activación por cuenta.",
        "Te contamos los detalles cuando esté lista.",
      ],
      cta: { label: "Avisarme", href: "/#soporte" },
      disabled: true,
    },
  ],
  note: "Precios en dólares (USDT). El proceso formatea los datos del equipo: respaldá antes de empezar.",
}

// ------------------------------------------------------------------
// CARACTERÍSTICAS por categoría. `icon` mapea a un ícono en el componente.
// ------------------------------------------------------------------
export type FeatureGroup = { icon: string; title: string; items: string[] }

export const features: { eyebrow: string; title: string; lead: string; groups: FeatureGroup[] } = {
  eyebrow: "Características",
  title: "Todo lo que resuelve Ari-Tool",
  lead: "Organizado por lo que hacés en el taller. Cada bloque llega listo, sin armar paquetes ni buscar archivos.",
  groups: [
    {
      icon: "security",
      title: "Security Plugin (MDM)",
      items: [
        "Remoción del Security Plugin en Tecno, Infinix e itel.",
        "El equipo vuelve a ser del cliente.",
        "Sin depender de la cuenta del fabricante.",
      ],
    },
    {
      icon: "anticrack",
      title: "AntiCrack",
      items: [
        "Remoción del AntiCrack en equipos MediaTek.",
        "Proceso guiado con validaciones.",
        "Compatibilidad verificada por modelo.",
      ],
    },
    {
      icon: "flasheo",
      title: "Flasheo · ROM lista",
      items: [
        "La ROM del modelo ya viene armada.",
        "Escribís con checklist y progreso.",
        "Verificación de arranque al final.",
      ],
    },
    {
      icon: "catalogo",
      title: "Catálogo por modelo",
      items: [
        "424 modelos en catálogo.",
        "Tecno, Infinix e itel con MediaTek.",
        "Android 12 a 16.",
      ],
    },
    {
      icon: "cobertura",
      title: "Cobertura incluida",
      items: [
        "La cobertura viaja dentro del proceso.",
        "Si el equipo falla después, sabemos qué pasó.",
        "Sin costo aparte.",
      ],
    },
    {
      icon: "escritorio",
      title: "App de escritorio",
      items: [
        "Para Windows 10/11 de 64 bits.",
        "Conexión por USB · Fastboot.",
        "Se actualiza sola.",
      ],
    },
  ],
}

// ------------------------------------------------------------------
// DISPOSITIVOS soportados. Modelos verificados contra el catálogo real.
// ------------------------------------------------------------------
export type DeviceBrand = { name: string; models: string[] }

export const devices: {
  eyebrow: string
  title: string
  lead: string
  stats: { value: string; label: string }[]
  chipset: string
  brands: DeviceBrand[]
  note: string
} = {
  eyebrow: "Dispositivos",
  title: "Marcas y modelos soportados",
  lead: "Equipos con chipset MediaTek de Tecno, Infinix e itel. El catálogo completo se consulta desde la app; acá van los datos generales.",
  stats: [
    { value: "424", label: "Modelos en catálogo" },
    { value: "3", label: "Marcas" },
    { value: "12–16", label: "Android" },
  ],
  chipset: "MediaTek (Helio · Dimensity)",
  brands: [
    { name: "Infinix", models: ["Note 50 Pro+ 5G", "Hot 50 Pro Plus", "Zero 40 5G"] },
    { name: "TECNO", models: ["Camon 40 Premier", "Camon 40 Pro 5G", "Spark 50 Pro"] },
    { name: "itel", models: ["A100", "A95 5G", "City 100"] },
  ],
  note: "¿No ves tu modelo? Consultá el catálogo actualizado desde la app o escribinos por WhatsApp.",
}

// ------------------------------------------------------------------
// PREGUNTAS FRECUENTES (incluye política de licencia y requisitos).
// ------------------------------------------------------------------
export type Faq = { q: string; a: string }

export const faqs: { eyebrow: string; title: string; lead: string; items: Faq[] } = {
  eyebrow: "Preguntas frecuentes",
  title: "Dudas comunes",
  lead: "Lo que más nos preguntan antes de empezar.",
  items: [
    {
      q: "¿Cómo activo Ari-Tool?",
      a: "Creás tu cuenta, la validás con el código que te llega por correo y recargás créditos desde tu panel. Con créditos ya podés trabajar.",
    },
    {
      q: "¿Cómo pago o recargo créditos?",
      a: "Desde tu panel, con Binance Pay: pagás el monto exacto con el código que te damos y los créditos se acreditan solos en segundos. 1 crédito = 1 USD = 1 proceso.",
    },
    {
      q: "¿Puedo cambiar de PC?",
      a: "Sí, tu cuenta te sigue: entrás desde otra PC con tu correo y contraseña. Pero cambiar de PC no incluye procesos: para procesar seguís necesitando créditos, y cada proceso descuenta créditos de tu saldo.",
    },
    {
      q: "¿Cuándo se me cobra un proceso?",
      a: "Recién cuando el proceso termina bien. Si algo falla antes, no se descuenta el crédito.",
    },
    {
      q: "¿Hay reembolsos?",
      a: "Los créditos no usados quedan en tu cuenta sin vencimiento. Para casos puntuales, escribinos por WhatsApp y lo revisamos. La política completa está en /legal.",
    },
    {
      q: "¿Qué necesito para usarlo?",
      a: "Windows 10/11 de 64 bits con drivers USB, el equipo en modo Fastboot con el bootloader desbloqueado y unos 15 GB libres. El proceso formatea los datos: respaldá antes.",
    },
    {
      q: "¿Qué marcas y modelos soporta?",
      a: "Tecno, Infinix e itel con chipset MediaTek: 424 modelos, Android 12 a 16. El catálogo se consulta desde la app.",
    },
    {
      q: "¿Cómo funciona la licencia?",
      a: "Estamos por lanzar una licencia ($25, próximamente). Los procesos se siguen pagando con créditos: la licencia no los reemplaza. Te contamos los detalles cuando esté lista.",
    },
  ],
}
