import { BentoGridSection } from "@/components/sections/BentoGridSection"
import { DevicesSection } from "@/components/sections/DevicesSection"
import { FaqSection } from "@/components/sections/FaqSection"
import { FeaturesSection } from "@/components/sections/FeaturesSection"
import { GuideSection } from "@/components/sections/GuideSection"
import { Hero } from "@/components/sections/Hero"
import { PricingSection } from "@/components/sections/PricingSection"
import { ServiciosSection } from "@/components/sections/ServiciosSection"
import { SupportSection } from "@/components/sections/SupportSection"
import { useSeo } from "@/lib/seo"

export function HomePage() {
  useSeo({
    titulo: "AriadGSM — Ari-Tool (Security Plugin y AntiCrack), Xiaomi FRP, Cuentas MI y Motorola",
    descripcion:
      "AriadGSM: software y servicios remotos para técnicos. Ari-Tool remueve el Security Plugin (MDM) y el AntiCrack en Tecno, Infinix e itel con MediaTek (424 modelos, Android 12 a 16). Además Xiaomi Reset + FRP, Cuentas MI, Motorola F4 y servicios especiales.",
    ruta: "/",
  })

  return (
    <>
      <Hero />
      {/* Primero el catálogo completo: el cliente ve de una todo lo que hacemos.
          Después, el detalle de Ari-Tool (producto, dispositivos, precios...). */}
      <ServiciosSection />
      <BentoGridSection />
      <FeaturesSection />
      <DevicesSection />
      <PricingSection />
      {/* La guia y el soporte vivian en /guia y /soporte. Ahora son secciones
          de la portada: el sitio publico queda con una sola direccion y el
          tecnico no tiene que saltar de pagina para leer como se usa. */}
      <GuideSection />
      <FaqSection />
      <SupportSection />
    </>
  )
}
