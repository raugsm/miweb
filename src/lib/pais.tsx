/**
 * País elegido, compartido por todo el sitio (como el tema).
 *
 * Se detecta solo: primero `?pais=`, después la elección guardada, después la IP (Cloudflare,
 * sin guardar la dirección) y, si no hay dato, la zona horaria y el idioma del navegador.
 * Se puede cambiar en la barra de arriba y se recuerda en el navegador.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react"

import { detectarPais, paisDeIp, paisElegido, recordarPais } from "@/lib/precios"

type PaisContextValue = {
  /** Código del país elegido: 'PE', 'MX', … o 'WW'. */
  pais: string
  /** Cambia el país y lo recuerda. */
  setPais: (codigo: string) => void
}

const PaisContext = createContext<PaisContextValue>({
  pais: "WW",
  setPais: () => {},
})

export function PaisProvider({ children }: { children: ReactNode }) {
  const [pais, setPaisState] = useState<string>(() => detectarPais())

  // La IP manda sobre zona horaria/idioma, pero nunca sobre una elección del visitante.
  useEffect(() => {
    if (paisElegido()) return
    let vivo = true
    fetch("/api/pais")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!vivo || paisElegido()) return
        const porIp = paisDeIp(d?.pais)
        if (porIp) setPaisState(porIp)
      })
      .catch(() => { /* sin IP: queda la zona horaria/idioma */ })
    return () => { vivo = false }
  }, [])

  function setPais(codigo: string) {
    setPaisState(codigo)
    recordarPais(codigo)
  }

  return <PaisContext.Provider value={{ pais, setPais }}>{children}</PaisContext.Provider>
}

export function usePais(): PaisContextValue {
  return useContext(PaisContext)
}
