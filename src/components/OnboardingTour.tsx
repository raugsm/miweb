import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react"
import { ArrowLeft, ArrowRight, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type TourStep = { id: string; title: string; body: string }
type Rect = { top: number; left: number; width: number; height: number }

const PAD = 8

/**
 * Tutorial guiado tipo "spotlight": oscurece la pantalla y deja iluminado el
 * elemento (por su id), con una tarjeta que explica qué es y para qué. Sin
 * librerías: mide el elemento con getBoundingClientRect y se re-ubica al hacer
 * scroll o resize. Se cierra con Saltar, la X o Escape.
 */
export function OnboardingTour({
  steps,
  open,
  onClose,
}: {
  steps: TourStep[]
  open: boolean
  onClose: () => void
}) {
  const [i, setI] = useState(0)
  const [rect, setRect] = useState<Rect | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  const medir = useCallback(() => {
    const step = steps[i]
    const el = step ? document.getElementById(step.id) : null
    if (!el) {
      setRect(null)
      return
    }
    const r = el.getBoundingClientRect()
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
  }, [i, steps])

  // Al abrir, siempre empieza en el primer paso.
  useEffect(() => {
    if (open) setI(0)
  }, [open])

  // Al cambiar de paso: llevar el elemento a la vista y medirlo.
  useLayoutEffect(() => {
    if (!open) return
    const step = steps[i]
    const el = step ? document.getElementById(step.id) : null
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" })
    medir()
    const t = window.setTimeout(medir, 340) // volver a medir cuando el scroll frenó
    return () => window.clearTimeout(t)
  }, [open, i, steps, medir])

  // Mantener el foco puesto sobre el elemento aunque se mueva la pantalla.
  useEffect(() => {
    if (!open) return
    const on = () => medir()
    window.addEventListener("resize", on)
    window.addEventListener("scroll", on, true)
    return () => {
      window.removeEventListener("resize", on)
      window.removeEventListener("scroll", on, true)
    }
  }, [open, medir])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
      else if (e.key === "ArrowRight") setI((v) => Math.min(v + 1, steps.length - 1))
      else if (e.key === "ArrowLeft") setI((v) => Math.max(v - 1, 0))
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose, steps.length])

  if (!open || steps.length === 0) return null

  const step = steps[i]
  const vw = typeof window !== "undefined" ? window.innerWidth : 1024
  const vh = typeof window !== "undefined" ? window.innerHeight : 768
  const ancho = Math.min(360, vw - 32)

  let tipStyle: CSSProperties
  if (rect) {
    const left = Math.min(Math.max(16, rect.left), vw - ancho - 16)
    const abajo = vh - (rect.top + rect.height) > 240
    tipStyle = abajo
      ? { top: rect.top + rect.height + 12, left, width: ancho }
      : { bottom: vh - rect.top + 12, left, width: ancho }
  } else {
    tipStyle = { top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: ancho }
  }

  const ultimo = i === steps.length - 1

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="Tutorial del panel">
      {/* Oscurecido + hueco iluminado sobre el elemento */}
      {rect ? (
        <div
          className="pointer-events-none absolute rounded-xl ring-2 ring-cobalt transition-all duration-300 motion-reduce:transition-none"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            boxShadow: "0 0 0 9999px rgba(3, 6, 15, 0.74)",
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-[rgba(3,6,15,0.74)]" />
      )}

      {/* Tarjeta explicativa */}
      <div
        ref={cardRef}
        style={tipStyle}
        className="absolute max-w-[calc(100vw-2rem)] rounded-2xl border border-line bg-card p-5 shadow-2xl animate-in fade-in zoom-in-95 duration-200 motion-reduce:animate-none"
      >
        <div className="flex items-start justify-between gap-3">
          <span className="font-display text-[11px] font-bold tracking-[0.16em] text-kicker uppercase">
            Paso {i + 1} de {steps.length}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar tutorial"
            className="-mt-1 -mr-1 flex size-7 items-center justify-center rounded-lg text-foreground/50 transition-colors hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <h3 className="mt-3 font-display text-lg font-extrabold tracking-tight text-foreground">
          {step.title}
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-foreground/70">{step.body}</p>

        <div className="mt-4 flex items-center gap-1.5" aria-hidden="true">
          {steps.map((_, idx) => (
            <span
              key={idx}
              className={cn(
                "h-1.5 rounded-full transition-all duration-300",
                idx === i ? "w-5 bg-cobalt" : "w-1.5 bg-foreground/20"
              )}
            />
          ))}
        </div>

        <div className="mt-5 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md text-xs font-medium text-foreground/50 transition-colors hover:text-foreground"
          >
            Saltar
          </button>
          <div className="flex gap-2">
            {i > 0 ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => setI((v) => Math.max(v - 1, 0))}
                className="h-9 rounded-lg border-line bg-transparent px-3 text-sm text-foreground hover:border-foreground/30"
              >
                <ArrowLeft className="size-4" /> Atrás
              </Button>
            ) : null}
            <Button
              type="button"
              onClick={() => (ultimo ? onClose() : setI((v) => Math.min(v + 1, steps.length - 1)))}
              className="h-9 rounded-lg px-4 text-sm font-medium"
            >
              {ultimo ? "Entendido" : "Siguiente"}
              {ultimo ? null : <ArrowRight className="size-4" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
