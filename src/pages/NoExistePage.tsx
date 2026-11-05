/**
 * W16 · Página que no existe — compu (1135:147, aprobado por Peter 4-nov).
 * El celular no está dibujado: es la adaptación de la compu (barra 64, franja de soporte, margen 20,
 * botones a todo el ancho), a revisar por Ari-Diseño.
 * Regla W8 #13: una dirección que no existe muestra esto, con Buscar e Inicio.
 */
import { House, Search } from "lucide-react"
import { useEffect, useState } from "react"
import { Link } from "react-router-dom"

import { BuscadorCelular, BuscadorCompu } from "@/components/aritool/buscador"
import { C, FranjaSoporte, HeaderDesktop, HeaderMobile, MenuMobile, PieDesktop, PieMobile, RUTAS } from "@/components/aritool/chrome"
import { usePrecios } from "@/hooks/use-precios"
import { useSeo } from "@/lib/seo"

const TITULO = "Esa página no existe"
const TEXTO = "Puede que el enlace sea viejo. Buscá lo que necesitás o volvé al inicio."

export function NoExistePage() {
  const { datos } = usePrecios()
  const [menu, setMenu] = useState(false)
  const [buscando, setBuscando] = useState(false)
  useSeo({ titulo: "Esa página no existe | AriTool", descripcion: TEXTO, ruta: "/404", indexar: false })
  useEffect(() => {
    const prev = document.body.style.background
    document.body.style.background = C.page
    return () => { document.body.style.background = prev }
  }, [])
  return (
    <div className="min-h-screen overflow-x-hidden" style={{ background: C.page, color: C.text, fontFamily: "Inter, system-ui, sans-serif", lineHeight: 1.2 }}>
      {/* COMPUTADORA */}
      <div className="hidden lg:block">
        <HeaderDesktop datos={datos} />
        <main className="flex flex-col items-center gap-[18px] px-10 pb-[140px] pt-[120px]">
          <h1 style={{ color: C.title, fontWeight: 700, fontSize: 40, lineHeight: "48px" }}>{TITULO}</h1>
          <p style={{ color: C.muted, fontSize: 17, lineHeight: "21px" }}>{TEXTO}</p>
          <BuscadorCompu className="w-[560px] max-w-full" />
          <Link to={RUTAS.inicio} className="flex items-center gap-2 text-white" style={{ background: C.blue, borderRadius: 10, padding: "13px 22px" }}>
            <House size={17} />
            <span style={{ fontWeight: 600, fontSize: 15, lineHeight: "18px" }}>Ir al inicio</span>
          </Link>
        </main>
        <PieDesktop />
      </div>
      {/* CELULAR */}
      <div className="lg:hidden">
        <HeaderMobile onMenu={() => setMenu(true)} />
        <FranjaSoporte datos={datos} />
        <main className="flex flex-col items-center px-5 pb-16 pt-14 text-center">
          <h1 style={{ color: C.title, fontWeight: 700, fontSize: 28, lineHeight: "116%" }}>{TITULO}</h1>
          <p className="mt-2.5" style={{ color: C.muted, fontSize: 15, lineHeight: "145%" }}>{TEXTO}</p>
          <button type="button" onClick={() => setBuscando(true)} className="mt-5 flex h-12 w-full items-center gap-2.5 text-left" style={{ background: C.cardAlt, border: `1px solid ${C.borderAlt}`, borderRadius: 12, padding: "0 14px" }}>
            <Search size={18} style={{ color: C.muted }} /><span style={{ color: C.faint, fontSize: 15 }}>Buscá: Unlock, FRP, Cuenta MI…</span>
          </button>
          <Link to={RUTAS.inicio} className="mt-2.5 flex h-[46px] w-full items-center justify-center gap-2 text-white" style={{ background: C.blue, borderRadius: 10 }}>
            <House size={17} />
            <span style={{ fontWeight: 600, fontSize: 15 }}>Ir al inicio</span>
          </Link>
        </main>
        <PieMobile />
        {menu ? <MenuMobile datos={datos} onClose={() => setMenu(false)} /> : null}
        {buscando ? <BuscadorCelular onClose={() => setBuscando(false)} /> : null}
      </div>
    </div>
  )
}
