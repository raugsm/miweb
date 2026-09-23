import type { ComponentProps } from "react"

import { cn } from "@/lib/utils"

type PanelProps = ComponentProps<"div"> & {
  as?: "div" | "article" | "section"
  glow?: boolean
}

/** Panel oscuro con borde fino, brillo superior y acento cobalto al pasar el cursor. */
export function Panel({
  as: Tag = "div",
  glow = false,
  className,
  children,
  ...props
}: PanelProps) {
  return (
    <Tag
      className={cn(
        "group/panel relative overflow-hidden rounded-2xl border border-line bg-card shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-[transform,border-color,box-shadow] duration-300 hover:-translate-y-0.5 hover:border-cobalt/40 hover:shadow-[0_20px_48px_-26px_rgba(0,82,212,0.55)]",
        className
      )}
      {...props}
    >
      {glow ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-[radial-gradient(closest-side,rgba(0,82,212,0.28),transparent)] opacity-70 transition-opacity duration-500 group-hover/panel:opacity-100"
        />
      ) : null}
      {children}
    </Tag>
  )
}

/** Etiqueta pequeña en mayúsculas espaciadas, al estilo del hero. */
export function Kicker({ className, ...props }: ComponentProps<"p">) {
  return (
    <p
      className={cn(
        "font-display text-[11px] font-bold tracking-[0.22em] text-kicker uppercase",
        className
      )}
      {...props}
    />
  )
}

/** Fondo de rejilla técnica muy sutil para paneles grandes. */
export function GridPattern({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:36px_36px] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_75%)]",
        className
      )}
    />
  )
}
