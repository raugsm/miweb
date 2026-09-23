import { BentoGridSection } from "@/components/sections/BentoGridSection"
import { GuideSection } from "@/components/sections/GuideSection"
import { Hero } from "@/components/sections/Hero"
import { SupportSection } from "@/components/sections/SupportSection"
import { useSeo } from "@/lib/seo"

export function HomePage() {
  useSeo({
    titulo: "Ari-Tool — Quitar el Security Plugin de Tecno, Infinix e itel | AriadGSM",
    descripcion:
      "Ari-Tool de AriadGSM quita el bloqueo de administración remota (Security Plugin) en equipos Tecno, Infinix e itel con MediaTek. 424 modelos, ROM lista para flashear y cobertura incluida.",
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
