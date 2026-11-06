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
import { Cuenta, CuentaCelular } from "@/pages/CuentaPage"

const FONDO = "#03060d"

/**
 * El panel del emblema: un lienzo de 860 × 900 que se achica para entrar en el espacio que haya.
 * La escala es solo CSS (sin JavaScript), así el HTML que llega primero ya se ve bien a cualquier ancho:
 * adentro del lienzo 1em = 1 píxel del Figma, y ese em se achica con el panel.
 */
const EM = `min(1px, calc(100cqw / ${LIENZO.w}), calc(100cqh / ${LIENZO.h}))`

export function PanelEmblema({ escena }: { escena?: React.Ref<EscenaRef> }) {
  return (
    <div className="sticky top-0 h-screen min-w-0 flex-1 overflow-hidden" style={{ containerType: "size" }}>
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ fontSize: EM, width: `${LIENZO.w}em`, height: `${LIENZO.h}em` }}>
        {/* brillo de fondo (1172:302) */}
        <div className="absolute" style={{ left: `${LIENZO.cx - 510}em`, top: `${LIENZO.cy - 480}em`, width: "1020em", height: "960em", background: "radial-gradient(closest-side, rgba(29,78,216,0.3), rgba(29,78,216,0.12) 55%, rgba(29,78,216,0))" }} />
        <EscenaIngresar ref={escena} />
        {/* El lienzo se achica entero, pero el texto no baja de 26 y 14 px en pantalla. */}
        <div className="absolute inset-x-0 flex flex-col items-center whitespace-nowrap text-center" style={{ top: "626em", gap: "max(8px, 12em)" }}>
          <p style={{ color: "#f9fafb", fontWeight: 700, fontSize: "max(26px, 38em)", lineHeight: 1.21 }}>Todo tu taller,<br />en una sola cuenta.</p>
          <p style={{ color: "#aab3c2", fontSize: "max(14px, 16em)", lineHeight: 1.19 }}>Saldo, pedidos y licencia en un solo lugar.</p>
        </div>
      </div>
    </div>
  )
}

/** La pantalla de compu: panel del emblema a la izquierda y la tarjeta a la derecha. */
export function IngresarCompu({ whatsapp }: { whatsapp: string }) {
  const escena = useRef<EscenaRef>(null)
  return (
    <div className="relative flex min-h-screen items-start" style={{ background: FONDO, fontFamily: "Inter, system-ui, sans-serif", lineHeight: "normal" }}>
      <PanelEmblema escena={escena} />
      {/* La tarjeta: se ve y se usa desde el primer momento, cargue o no la escena. Si es más alta que la
          ventana (Crear cuenta), la página baja con scroll y el panel del emblema se queda en su lugar. */}
      <main className="flex min-h-screen w-[580px] shrink-0 items-center pb-12 pl-5 pr-10 pt-[76px]" onInputCapture={() => escena.current?.escribiendo()}>
        <EstiloAuth.Provider value="paneles">
          <Cuenta whatsapp={whatsapp} alEntrar={() => escena.current?.pulso()} />
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

export function IngresarPrototipoPage() {
  const { datos } = usePrecios()
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
  return compu ? <IngresarCompu whatsapp={datos?.soporte.whatsapp ?? WA} /> : <CuentaCelular />
}
