/**
 * Marco de las páginas AriTool. Hoy solo fija el trazo de los íconos de línea: 2 px reales a
 * cualquier tamaño, como en el Figma (lucide, si no, lo achica junto con el ícono).
 */
import { LucideProvider } from "lucide-react"
import { Outlet } from "react-router-dom"

export function MarcoAriTool() {
  return (
    <LucideProvider nonScalingStroke>
      <Outlet />
    </LucideProvider>
  )
}
