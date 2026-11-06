/**
 * HTML inicial de Ingresar: la pantalla dibujada sin navegador, con los MISMOS componentes que usa la
 * página (mismas medidas del Figma). Lo llama scripts/prerender-web.mjs al final del build; el resultado
 * viaja en el primer HTML para que la pantalla se vea antes de que cargue React.
 *
 * Van las dos versiones, compu y celular: cuál se ve lo decide el CSS por el ancho de la ventana.
 * Acá no hay sesión ni precios: es la pantalla tal como arranca para alguien que no ingresó.
 */
import { LucideProvider } from "lucide-react"
import { renderToStaticMarkup } from "react-dom/server"
import { StaticRouter } from "react-router-dom"

import { WA } from "@/components/aritool/chrome"
import { PaisProvider } from "@/lib/pais"
import { ReleaseProvider } from "@/lib/release"
import { CuentaCelular } from "@/pages/CuentaPage"
import { IngresarCompu } from "@/pages/IngresarPrototipoPage"

/** Dirección que recibe este HTML inicial. */
export const RUTA = "/cuenta"

function Marco({ children }: { children: React.ReactNode }) {
  return (
    <PaisProvider>
      <ReleaseProvider>
        <StaticRouter location={RUTA}>
          <LucideProvider nonScalingStroke>{children}</LucideProvider>
        </StaticRouter>
      </ReleaseProvider>
    </PaisProvider>
  )
}

export function render(): { compu: string; celular: string } {
  return {
    compu: renderToStaticMarkup(<Marco><IngresarCompu whatsapp={WA} /></Marco>),
    celular: renderToStaticMarkup(<Marco><CuentaCelular /></Marco>),
  }
}
