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
