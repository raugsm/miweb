/**
 * PROTOTIPO · Cuenta en compu con el emblema y las herramientas alrededor (Figma W11-E 1172:301, elegido
 * por Peter 5-nov; Crear cuenta 1178:2). Vive en /preview-ingresar para que Peter vea el movimiento;
 * todavía NO reemplaza a /cuenta. Sin la barra del sitio: arriba el logo y "Volver al inicio".
 * La tarjeta de la derecha es el flujo real (el mismo de CuentaPage) en todos sus estados, y nunca
 * espera a la escena. Con menos de 1024 px de ancho no hay panel: se muestra la pantalla de celular (W11m).
 */
import { ArrowLeft } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"

import { EstiloAuth } from "@/components/aritool/auth"
import { RUTAS, WA } from "@/components/aritool/chrome"
import { EscenaIngresar, type EscenaRef } from "@/components/aritool/EscenaIngresar"
import { LIENZO } from "@/components/hero/emblema"
import { usePrecios } from "@/hooks/use-precios"
import { useSeo } from "@/lib/seo"
import { Cuenta, CuentaPage } from "@/pages/CuentaPage"

const FONDO = "#03060d"

/** El panel del emblema: un lienzo de 860 × 900 que se achica para entrar en el espacio que haya. */
function PanelEmblema({ escena }: { escena: React.Ref<EscenaRef> }) {
  const marco = useRef<HTMLDivElement>(null)
  const [escala, setEscala] = useState(1)
  useEffect(() => {
    const el = marco.current
    if (!el) return
    const medir = () => setEscala(Math.min(1, el.clientWidth / LIENZO.w, el.clientHeight / LIENZO.h))
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    medir()
    return () => ro.disconnect()
  }, [])
  return (
    <div ref={marco} className="sticky top-0 h-screen min-w-0 flex-1 overflow-hidden">
      <div className="absolute left-1/2 top-1/2" style={{ width: LIENZO.w, height: LIENZO.h, transform: `translate(-50%, -50%) scale(${escala})` }}>
        {/* brillo de fondo (1172:302) */}
        <div className="absolute" style={{ left: LIENZO.cx - 510, top: LIENZO.cy - 480, width: 1020, height: 960, background: "radial-gradient(closest-side, rgba(29,78,216,0.3), rgba(29,78,216,0.12) 55%, rgba(29,78,216,0))" }} />
        <EscenaIngresar ref={escena} />
        {/* El lienzo se achica entero, pero el texto no baja de 26 y 14 px en pantalla: se agranda acá lo que la escala le quita. */}
        <div className="absolute inset-x-0 flex flex-col items-center whitespace-nowrap text-center" style={{ top: 626 }}>
          <p style={{ color: "#f9fafb", fontWeight: 700, fontSize: Math.max(38, 26 / escala), lineHeight: 1.21 }}>Todo tu taller,<br />en una sola cuenta.</p>
          <p style={{ color: "#aab3c2", fontSize: Math.max(16, 14 / escala), lineHeight: 1.19, marginTop: 12 }}>Saldo, pedidos y licencia en un solo lugar.</p>
        </div>
      </div>
    </div>
  )
}

export function IngresarPrototipoPage() {
  const { datos } = usePrecios()
  const escena = useRef<EscenaRef>(null)
  useSeo({ titulo: "Ingresar (prototipo) | AriTool", descripcion: "Prototipo de la pantalla de Ingresar.", ruta: "/preview-ingresar", indexar: false })
  const [compu, setCompu] = useState(() => window.matchMedia("(min-width: 1024px)").matches)
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)")
    const cambio = () => setCompu(mq.matches)
    mq.addEventListener("change", cambio)
    return () => mq.removeEventListener("change", cambio)
  }, [])
  useEffect(() => {
    const prev = document.body.style.background
    document.body.style.background = FONDO
    return () => { document.body.style.background = prev }
  }, [])
  if (!compu) return <CuentaPage />

  return (
    <div className="relative flex min-h-screen items-start" style={{ background: FONDO, fontFamily: "Inter, system-ui, sans-serif", lineHeight: "normal" }}>
      <PanelEmblema escena={escena} />
      {/* La tarjeta: se ve y se usa desde el primer momento, cargue o no la escena. Si es más alta que la
          ventana (Crear cuenta), la página baja con scroll y el panel del emblema se queda en su lugar. */}
      <main className="flex min-h-screen w-[580px] shrink-0 items-center pb-12 pl-5 pr-10 pt-[76px]" onInputCapture={() => escena.current?.escribiendo()}>
        <EstiloAuth.Provider value="paneles">
          <Cuenta whatsapp={datos?.soporte.whatsapp ?? WA} alEntrar={() => escena.current?.pulso()} />
        </EstiloAuth.Provider>
      </main>
      <Link to={RUTAS.inicio} className="absolute flex items-center gap-2.5" style={{ left: 64, top: 32 }}>
        <img src="/aritool-logo-192.webp" alt="" className="size-[38px] rounded-lg object-contain" />
        <span style={{ color: "#f3f4f6", fontWeight: 700, fontSize: 19, lineHeight: "23px" }}>AriTool</span>
      </Link>
      <Link to={RUTAS.inicio} className="absolute flex items-center gap-2" style={{ right: 80, top: 44, color: "#93c5fd", fontWeight: 500, fontSize: 14, lineHeight: "17px" }}>
        <ArrowLeft className="size-4" />Volver al inicio
      </Link>
    </div>
  )
}
