import { Globe } from "lucide-react"

import { cn } from "@/lib/utils"

// Banderas reales en SVG, servidas desde el propio dominio (la CSP del servidor
// sólo permite `img-src 'self'`, así que no se usa ningún CDN externo).
import "flag-icons/css/flag-icons.min.css"

type FlagProps = {
  /** Código ISO de 2 letras ("pe", "MX"), o los especiales "binance" y "ww". */
  code: string
  /** Redonda (para las pills) o rectangular 4x3 (para listas). */
  shape?: "circle" | "rect"
  className?: string
  title?: string
  style?: React.CSSProperties
}

const ESPECIALES = new Set(["binance", "ww", "global", "usdt", "int"])

export function Flag({ code, shape = "rect", className, title, style }: FlagProps) {
  const iso = String(code || "")
    .trim()
    .toLowerCase()
  const esPais = /^[a-z]{2}$/.test(iso) && !ESPECIALES.has(iso)

  // Internacional / USDT / Worldwide: no hay país, se usa un globo.
  if (!esPais) {
    return (
      <span
        role="img"
        aria-label={title ?? "Internacional"}
        style={style}
        className={cn(
          "inline-flex shrink-0 items-center justify-center overflow-hidden bg-cobalt/15 text-cyan",
          shape === "circle" ? "rounded-full" : "rounded-[2px]",
          className
        )}
      >
        <Globe aria-hidden="true" className="size-[70%]" />
      </span>
    )
  }

  return (
    <span
      role="img"
      aria-label={title ?? iso.toUpperCase()}
      style={style}
      className={cn(
        "fi shrink-0 bg-cover bg-center",
        `fi-${iso}`,
        shape === "circle" ? "fis rounded-full" : "rounded-[2px]",
        className
      )}
    />
  )
}
