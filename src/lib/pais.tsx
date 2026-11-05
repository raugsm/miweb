/**
 * País elegido, compartido por todo el sitio (como el tema).
 *
 * Se detecta solo (región del navegador), se puede cambiar en la barra de arriba y se recuerda
 * en el navegador. Todo el que muestre precios lee de acá, así el cambio de país se ve en toda la web.
 */
import { createContext, useContext, useState, type ReactNode } from "react"

import { detectarPais, recordarPais } from "@/lib/precios"

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

  function setPais(codigo: string) {
    setPaisState(codigo)
    recordarPais(codigo)
  }

  return <PaisContext.Provider value={{ pais, setPais }}>{children}</PaisContext.Provider>
}

export function usePais(): PaisContextValue {
  return useContext(PaisContext)
}
