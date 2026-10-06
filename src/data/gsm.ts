export type GsmPrice = {
  country: string
  countryCode: string
  flag: string
  flagCode: string
  currency: string
  available: boolean
  unitLabel: string
  amountFormatted: string
  methods: string[]
}

export type GsmRental = {
  name: string
  agotada: boolean
  recargoUsdt: number
  prices: GsmPrice[]
}

export type GsmPriceReport = {
  prices: GsmPrice[]
  miPrices: GsmPrice[]
  rentals: GsmRental[]
}

export const gsmPage = {
  heroEyebrow: "AriadGSM Cliente para Windows",
  heroTitleLine1: "Xiaomi Reset + FRP",
  heroTitleLine2: "desde AriadGSM Cliente",
  heroLead:
    "Descargá la app, consultá el precio por país y creá tu pedido guiado para procesar equipos Xiaomi desde Windows.",
  heroCardStatus: "Disponible en la app",
  heroCardTitle: "Xiaomi Reset + FRP",
  heroCardItems: [
    "Precio claro por país",
    "Pedido guiado desde Windows",
    "Soporte directo por WhatsApp",
  ],
  heroHint: "Windows 10 o superior · Gratis",
}

export const gsmSteps = [
  {
    number: "1",
    title: "Instalá la app",
    description: "Descargá AriadGSM Cliente y abrila en tu PC.",
  },
  {
    number: "2",
    title: "Hacé tu pedido",
    description: "Elegí tu país, adjuntá el comprobante de pago y confirmá.",
  },
  {
    number: "3",
    title: "Conectá el equipo",
    description: "Poné tu Xiaomi en modo sideload. El técnico toma control automáticamente.",
  },
  {
    number: "4",
    title: "Listo en minutos",
    description: "Tu equipo reinicia desbloqueado. Recibís comprobante automático.",
  },
]

export const gsmMotorola = {
  kicker: "Nuevo servicio",
  title: "Motorola F4 modelos soportados",
  description:
    "Consulta soporte por modelo, procesador y modalidad disponible. La atención de este servicio se realiza por WhatsApp ventas.",
  tags: ["MTK / SPD", "Vía remota", "Validación previa"],
  whatsappUrl:
    "https://wa.me/51970748831?text=Hola%2C%20quiero%20consultar%20Motorola%20F4%20modelos%20soportados",
}

export const gsmWhatsappSupportUrl = "https://wa.me/51961751354"
export const gsmVentasWhatsappUrl =
  "https://wa.me/51970748831?text=Hola%2C%20quiero%20consultar%20un%20servicio%20de%20AriadGSM"

/**
 * Sección "Servicios AriadGSM" que vive en la PORTADA (home). Existe para que un
 * cliente de siempre —que entra y ve Ari-Tool— vea de una que los servicios
 * remotos de AriadGSM SIGUEN activos (no se dejaron de vender). Es la pieza que
 * une las dos caras: software Ari-Tool + servicios remotos, una sola casa.
 */
export const serviciosGsm = {
  id: "servicios",
  eyebrow: "AriadGSM · Servicios remotos",
  title: "Y seguimos con todos los servicios de siempre.",
  lead:
    "Ari-Tool es nuestro software para Tecno, Infinix e itel. Pero AriadGSM es toda la casa: los servicios remotos para técnicos siguen 100% activos, con la misma cuenta y el mismo WhatsApp de siempre.",
  items: [
    {
      titulo: "Xiaomi Reset + FRP",
      descripcion:
        "El servicio de siempre, ahora desde la app AriadGSM Cliente para Windows: precio por país, pedido guiado y proceso remoto.",
      etiqueta: "App · precio por país",
    },
    {
      titulo: "Cuentas MI (Xiaomi)",
      descripcion:
        "Gestión de cuenta MI de Xiaomi. Consultá disponibilidad y precio por país dentro de la app.",
      etiqueta: "App",
    },
    {
      titulo: "Motorola F4",
      descripcion:
        "Modelos soportados por procesador y modalidad. Se valida y atiende directo con ventas por WhatsApp.",
      etiqueta: "WhatsApp ventas",
    },
    {
      titulo: "Servicios especiales",
      descripcion:
        "Otras marcas y pedidos puntuales que no están en la app se coordinan directo con ventas por WhatsApp.",
      etiqueta: "WhatsApp",
    },
  ],
  appCta: { label: "Ver servicios y precios", href: "/gsm" },
  waCta: { label: "Consultar por WhatsApp", href: gsmVentasWhatsappUrl },
}
