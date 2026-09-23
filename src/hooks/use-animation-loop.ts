import { useCallback, useEffect, useMemo, useRef } from "react"
import type { RefObject } from "react"

export interface Metrics {
  width: number
  height: number
  dpr: number
}

export interface FrameInfo {
  now: number
  delta: number
}

interface AnimationLoopOptions {
  target: RefObject<HTMLElement | null>
  halted?: boolean
  dpr?: number
  resizeDebounceMs?: number
  onResize?: (metrics: Metrics) => void
  onFrame?: (frame: FrameInfo) => void | false
}

interface AnimationLoop {
  start: () => void
  stop: () => void
  resize: () => void
}

export function useAnimationLoop(options: AnimationLoopOptions): AnimationLoop {
  // Keep the latest options without re-creating the stable callbacks below.
  const optionsRef = useRef(options)
  optionsRef.current = options

  const runningRef = useRef(false)
  const frameIdRef = useRef<number | null>(null)
  const lastTimeRef = useRef<number | null>(null)
  const resizeTimerRef = useRef<number | null>(null)

  const stop = useCallback(() => {
    runningRef.current = false
    if (frameIdRef.current !== null) {
      cancelAnimationFrame(frameIdRef.current)
      frameIdRef.current = null
    }
    lastTimeRef.current = null
  }, [])

  const step = useCallback(
    (now: number) => {
      if (!runningRef.current) {
        return
      }

      const last = lastTimeRef.current
      const delta = last === null ? 0 : now - last
      lastTimeRef.current = now

      const result = optionsRef.current.onFrame?.({ now, delta })
      if (result === false) {
        stop()
        return
      }

      frameIdRef.current = requestAnimationFrame(step)
    },
    [stop]
  )

  const start = useCallback(() => {
    if (runningRef.current) {
      return
    }
    runningRef.current = true
    lastTimeRef.current = null
    frameIdRef.current = requestAnimationFrame(step)
  }, [step])

  const resize = useCallback(() => {
    const element = optionsRef.current.target.current
    if (!element) {
      return
    }

    const scale = optionsRef.current.dpr ?? 1
    const rect = element.getBoundingClientRect()
    const metrics: Metrics = {
      width: Math.max(1, Math.round(rect.width * scale)),
      height: Math.max(1, Math.round(rect.height * scale)),
      dpr: scale,
    }
    optionsRef.current.onResize?.(metrics)
  }, [])

  useEffect(() => {
    const element = options.target.current
    if (!element) {
      return
    }

    // Measure once immediately on mount.
    resize()

    const observer = new ResizeObserver(() => {
      if (resizeTimerRef.current !== null) {
        window.clearTimeout(resizeTimerRef.current)
      }
      resizeTimerRef.current = window.setTimeout(() => {
        resizeTimerRef.current = null
        resize()
      }, optionsRef.current.resizeDebounceMs ?? 0)
    })
    observer.observe(element)

    return () => {
      observer.disconnect()
      if (resizeTimerRef.current !== null) {
        window.clearTimeout(resizeTimerRef.current)
        resizeTimerRef.current = null
      }
    }
  }, [options.target, resize])

  useEffect(() => {
    if (options.halted) {
      stop()
    }
  }, [options.halted, stop])

  useEffect(() => {
    return () => {
      stop()
    }
  }, [stop])

  return useMemo(() => ({ start, stop, resize }), [start, stop, resize])
}
