import { BentoGridSection } from "@/components/sections/BentoGridSection"
import { GuideSection } from "@/components/sections/GuideSection"
import { Hero } from "@/components/sections/Hero"
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
      {/* La guia y el soporte vivian en /guia y /soporte. Ahora son secciones
          de la portada: el sitio publico queda con cuatro direcciones y el
          tecnico no tiene que saltar de pagina para leer como se usa. */}
      <GuideSection />
      <SupportSection />
    </>
  )
}
