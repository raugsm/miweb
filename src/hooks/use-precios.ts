/**
 * Hook de precios/catálogo EN VIVO para el país elegido.
 *
 * Expone los tres estados que pide la regla W8: `cargando` (barra gris, nunca un precio viejo ni "S/ 0"),
 * `error` (no se pudo leer → la web muestra "Precio en la app", nunca inventa un número) y `datos`.
 * Reacciona al cambio de país. Usa la caché de 60 s de `traerPrecios`.
 */
import { useEffect, useState } from "react"

import { usePais } from "@/lib/pais"
import { traerPrecios, type Precios } from "@/lib/precios"

type EstadoPrecios = {
  cargando: boolean
  error: boolean
  datos: Precios | null
}

export function usePrecios(): EstadoPrecios & { pais: string; refrescar: () => void } {
  const { pais } = usePais()
  const [estado, setEstado] = useState<EstadoPrecios>({ cargando: true, error: false, datos: null })
  const [intento, setIntento] = useState(0)

  useEffect(() => {
    let vivo = true
    setEstado((e) => ({ cargando: true, error: false, datos: e.datos }))
    traerPrecios(pais)
      .then((datos) => {
        if (vivo) setEstado({ cargando: false, error: false, datos })
      })
      .catch(() => {
        if (vivo) setEstado({ cargando: false, error: true, datos: null })
      })
    return () => {
      vivo = false
    }
  }, [pais, intento])

  return { ...estado, pais, refrescar: () => setIntento((n) => n + 1) }
}
