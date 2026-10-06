import { gsmMotorola, gsmVentasWhatsappUrl } from "@/data/gsm"

export type Servicio = {
  titulo: string
  descripcion: string
  /** Cómo se hace: software en la PC del técnico o proceso remoto nuestro. */
  modo: string
  cta: { label: string; href: string; externo?: boolean }
  /** La tarjeta grande del catálogo. */
  destacado?: boolean
}

/**
 * Catálogo único de la portada. Todos los servicios al mismo nivel, como lo
 * que son: lo que hace AriadGSM. Sin "lo nuevo" contra "lo de antes".
 */
export const serviciosSection = {
  id: "servicios",
  eyebrow: "Servicios",
  title: "Elegí lo que necesitás",
  lead: "Software para trabajar desde tu PC o un proceso remoto hecho por nuestro equipo. Todo con el mismo soporte por WhatsApp.",
  items: [
    {
      titulo: "Ari-Tool · Security Plugin y AntiCrack",
      descripcion:
        "Software para Windows: remueve el Security Plugin (MDM) y el AntiCrack en Tecno, Infinix e itel con MediaTek. 424 modelos con la ROM del modelo ya lista.",
      modo: "Software · Windows",
      cta: { label: "Conocer Ari-Tool", href: "#producto" },
      destacado: true,
    },
    {
      titulo: "Xiaomi Reset + FRP",
      descripcion:
        "Proceso remoto desde la app AriadGSM para Windows: precio por país, pedido guiado y comprobante automático.",
      modo: "Remoto · App AriadGSM",
      cta: { label: "Ver precios", href: "/gsm" },
    },
    {
      titulo: "Cuentas MI",
      descripcion:
        "Gestión de cuenta MI de Xiaomi. Consultá disponibilidad y precio por país dentro de la app.",
      modo: "Remoto · App AriadGSM",
      cta: { label: "Ver precios", href: "/gsm" },
    },
    {
      titulo: "Motorola F4",
      descripcion:
        "Modelos soportados por procesador y modalidad, con validación previa del equipo.",
      modo: "Remoto · WhatsApp",
      cta: { label: "Consultar modelo", href: gsmMotorola.whatsappUrl, externo: true },
    },
    {
      titulo: "Servicios especiales",
      descripcion:
        "Otras marcas y pedidos puntuales: los coordinamos directo con ventas por WhatsApp.",
      modo: "Remoto · WhatsApp",
      cta: { label: "Hablar con ventas", href: gsmVentasWhatsappUrl, externo: true },
    },
  ] satisfies Servicio[],
}
