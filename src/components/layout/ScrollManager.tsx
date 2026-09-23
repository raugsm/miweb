import { useEffect } from "react"
import { useLocation } from "react-router-dom"

export function ScrollManager() {
  const { pathname, hash, key } = useLocation()

  useEffect(() => {
    if (!hash) {
      window.scrollTo({ top: 0, behavior: "auto" })
      return
    }

    const id = hash.slice(1)
    const target = document.getElementById(id)

    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" })
      return
    }

    // The target may not be mounted yet during a route transition: retry on the next frame.
    const frame = window.requestAnimationFrame(() => {
      document
        .getElementById(id)
        ?.scrollIntoView({ behavior: "smooth", block: "start" })
    })

    return () => window.cancelAnimationFrame(frame)
  }, [pathname, hash, key])

  return null
}
