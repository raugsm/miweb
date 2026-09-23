import { BentoGridSection } from "@/components/sections/BentoGridSection"
import { Hero } from "@/components/sections/Hero"
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
    </>
  )
}
