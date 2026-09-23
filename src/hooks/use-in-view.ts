import { useEffect, useState } from "react"
import type { RefObject } from "react"

/** true mientras el elemento está (parcialmente) dentro del viewport. */
export function useInView(
  target: RefObject<Element | null>,
  rootMargin = "120px"
): boolean {
  const [inView, setInView] = useState(true)

  useEffect(() => {
    const element = target.current
    if (!element || typeof IntersectionObserver === "undefined") {
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { rootMargin }
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [target, rootMargin])

  return inView
}
