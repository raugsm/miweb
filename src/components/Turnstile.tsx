import { useEffect, useRef, useState } from "react"

/**
 * Recuadro anti-robot de Cloudflare (Turnstile).
 *
 * Entrega un vale de un solo uso que el servidor comprueba contra Cloudflare.
 * Si el vale no llega o no es válido, la función rechaza el intento: así una
 * máquina no puede probar contraseñas ni abrir cuentas en cadena.
 *
 * La clave de sitio es pública a propósito (va en el HTML de cualquier página
 * que use Turnstile). La secreta vive solo en el servidor.
 */
export const TURNSTILE_SITE_KEY = "0x4AAAAAAFAfU54N6WcgdVf2"

const SCRIPT_ID = "cf-turnstile"
const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"

type TurnstileApi = {
  render: (
    el: HTMLElement,
    opciones: {
      sitekey: string
      callback: (token: string) => void
      "expired-callback"?: () => void
      "error-callback"?: (codigo: string) => void
      theme?: "auto" | "light" | "dark"
      language?: string
    }
  ) => string
  reset: (id: string) => void
  remove: (id: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

/** Carga el script una sola vez, aunque haya varios recuadros en la página. */
function cargarScript(): Promise<void> {
  return new Promise((listo, falla) => {
    if (window.turnstile) {
      listo()
      return
    }
    const previo = document.getElementById(SCRIPT_ID)
    if (previo) {
      previo.addEventListener("load", () => listo())
      previo.addEventListener("error", () => falla(new Error("turnstile")))
      return
    }
    const s = document.createElement("script")
    s.id = SCRIPT_ID
    s.src = SCRIPT_SRC
    s.async = true
    s.defer = true
    s.onload = () => listo()
    s.onerror = () => falla(new Error("turnstile"))
    document.head.appendChild(s)
  })
}

export type TurnstileProps = {
  /** Se llama con el vale cuando el visitante pasa la comprobación. */
  onToken: (token: string) => void
  /** Se llama si el vale vence o el recuadro falla: hay que dejar de usarlo. */
  onVencido?: () => void
}

export function Turnstile({ onToken, onVencido }: TurnstileProps) {
  const caja = useRef<HTMLDivElement>(null)
  // Si el recuadro no carga, el visitante no puede entrar. Callarse dejaria un
  // hueco en blanco y un boton que falla sin explicar por que.
  // Se guarda el codigo de Cloudflare: el mismo hueco en blanco puede ser un
  // bloqueador, un corte de red o un dominio sin registrar, y cada uno se
  // arregla distinto.
  const [falla, setFalla] = useState<string | null>(null)
  // En refs para que volver a dibujar el formulario no rehaga el recuadro:
  // cada dibujado nuevo pierde el vale que el visitante ya había conseguido.
  const alToken = useRef(onToken)
  const alVencido = useRef(onVencido)
  alToken.current = onToken
  alVencido.current = onVencido

  useEffect(() => {
    let vivo = true
    let id: string | null = null

    void cargarScript()
      .then(() => {
        if (!vivo || !caja.current || !window.turnstile) return
        id = window.turnstile.render(caja.current, {
          sitekey: TURNSTILE_SITE_KEY,
          theme: "auto",
          language: "es",
          callback: (token) => {
            setFalla(null)
            alToken.current(token)
          },
          "expired-callback": () => alVencido.current?.(),
          "error-callback": (codigo: string) => {
            setFalla(String(codigo ?? ""))
            alVencido.current?.()
          },
        })
      })
      .catch(() => {
        // Sin script no hay vale. El servidor va a rechazar el intento, asi que
        // se avisa acá en vez de dejar un hueco en blanco.
        setFalla("sin_script")
        alVencido.current?.()
      })

    return () => {
      vivo = false
      if (id && window.turnstile) {
        try {
          window.turnstile.remove(id)
        } catch {
          /* ya no estaba */
        }
      }
    }
  }, [])

  return (
    <div className="mt-5">
      <div ref={caja} className="flex justify-center" />
      {falla ? (
        <p className="text-center text-[11px] leading-relaxed text-amber-400/90">
          {falla === "110200"
            ? // Solo lo ve quien abre la web desde una dirección que no está
              // dada de alta en el widget de Cloudflare: en la práctica, nadie
              // más que nosotros mientras probamos.
              "Esta dirección no está autorizada para la comprobación anti-robot. Hay que agregarla en el widget de Turnstile."
            : "No se pudo cargar la comprobación anti-robot. Revisá tu conexión o desactivá el bloqueador de anuncios para este sitio, y recargá."}
        </p>
      ) : null}
    </div>
  )
}
