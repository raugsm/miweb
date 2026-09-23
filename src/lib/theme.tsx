import { createContext, useContext, useEffect, useState, type ReactNode } from "react"

type Theme = "dark" | "light"

const STORAGE_KEY = "ariad-theme"

function initialTheme(): Theme {
  if (typeof window === "undefined") return "dark"
  const stored = window.localStorage.getItem(STORAGE_KEY)
  if (stored === "light" || stored === "dark") return stored
  return "dark"
}

type ThemeContextValue = {
  theme: Theme
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  toggleTheme: () => {},
})

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(initialTheme)

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle("dark", theme === "dark")
    window.localStorage.setItem(STORAGE_KEY, theme)
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) {
      meta.setAttribute("content", theme === "dark" ? "#0B0B0C" : "#F7F7F8")
    }
  }, [theme])

  function toggleTheme() {
    setTheme((current) => (current === "dark" ? "light" : "dark"))
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext)
}
