import type { ComponentProps } from "react"

import { cn } from "@/lib/utils"

/**
 * Bloque de carga. Reserva el espacio del contenido real y late suavemente,
 * para que nada aparezca de golpe ni el layout salte cuando lleguen los datos.
 * Usa bg-foreground/10 (no bg-card): en modo oscuro card ≈ fondo y no se vería.
 */
export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded-md bg-foreground/10", className)}
      {...props}
    />
  )
}
