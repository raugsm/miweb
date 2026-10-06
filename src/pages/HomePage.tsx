import { BentoGridSection } from "@/components/sections/BentoGridSection"
import { DevicesSection } from "@/components/sections/DevicesSection"
import { FaqSection } from "@/components/sections/FaqSection"
import { FeaturesSection } from "@/components/sections/FeaturesSection"
import { GuideSection } from "@/components/sections/GuideSection"
import { Hero } from "@/components/sections/Hero"
import { PricingSection } from "@/components/sections/PricingSection"
import { ServiciosGsmSection } from "@/components/sections/ServiciosGsmSection"
import { SupportSection } from "@/components/sections/SupportSection"
import { useSeo } from "@/lib/seo"

export function HomePage() {
  useSeo({
    titulo: "Ari-Tool — Remover Security Plugin y AntiCrack (MDM) en Tecno, Infinix e itel | AriadGSM",
    descripcion:
      "Ari-Tool de AriadGSM remueve el Security Plugin (MDM) y el AntiCrack en equipos Tecno, Infinix e itel con MediaTek. La ROM del modelo llega lista: conectás por Fastboot, flasheás y el equipo vuelve a ser del cliente. 424 modelos, Android 12 a 16.",
    ruta: "/",
  })

  return (
    <>
      <Hero />
      <BentoGridSection />
      <FeaturesSection />
      {/* Servicios AriadGSM en la portada: el cliente de siempre ve que los
          servicios remotos (Xiaomi FRP, Cuentas MI, Motorola, especiales)
          siguen activos. Une Ari-Tool + servicios en una sola cara. */}
      <ServiciosGsmSection />
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
