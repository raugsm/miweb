import { useEffect, useRef, useState } from "react"

import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion"

type CountUpProps = {
  target: number
  /** Arranca el conteo cuando pasa a true (p. ej. al entrar en viewport). */
  run: boolean
  className?: string
  durationMs?: number
}

/**
 * Cuenta de 0 al objetivo una sola vez, al entrar en pantalla. Da vida al
 * número más fuerte del sitio sin librerías. Con "reduce motion" salta directo
 * al valor final: nadie se marea.
 */
export function CountUp({ target, run, className, durationMs = 1100 }: CountUpProps) {
  const reduced = usePrefersReducedMotion()
  const [value, setValue] = useState(0)
  const started = useRef(false)

  useEffect(() => {
    if (!run || started.current) return
    started.current = true

    if (reduced) {
      setValue(target)
      return
    }

    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs)
      const eased = 1 - Math.pow(1 - t, 3) // easeOutCubic: rápido y frena suave
      setValue(Math.round(eased * target))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [run, reduced, target, durationMs])

  return (
    <span className={className} aria-label={String(target)}>
      {value}
    </span>
  )
}
