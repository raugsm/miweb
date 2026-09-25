import { lazy, Suspense, useState } from "react"
import { Link, useLocation } from "react-router-dom"
import { Menu, Moon, Sun } from "lucide-react"

import { Container } from "@/components/Container"
import { Button } from "@/components/ui/button"
import { crossNav, downloadNav, mainNav, product, sessionCta } from "@/data/product"
import { useScrollSpy } from "@/hooks/use-scroll-spy"
import { useTheme } from "@/lib/theme"
import { cn } from "@/lib/utils"

const MobileMenu = lazy(() =>
  import("@/components/layout/MobileMenu").then((m) => ({
    default: m.MobileMenu,
  }))
)

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false)
  // El menú móvil solo se monta (y descarga su código) tras el primer clic.
  const [menuRequested, setMenuRequested] = useState(false)
  const { theme, toggleTheme } = useTheme()

  // "Dónde estoy": en la portada lo dice el scroll (scrollspy); en /gsm, la ruta.
  const { pathname, hash } = useLocation()
  const onHome = pathname === "/"
  const spy = useScrollSpy(
    ["producto", "caracteristicas", "dispositivos", "precios", "guia", "faq", "soporte"],
    onHome
  )
  const activeSection = onHome
    ? spy ?? (hash ? hash.slice(1) : null)
    : pathname.startsWith("/gsm")
      ? "gsm"
      : pathname.startsWith("/descargas")
        ? "descargas"
        : null

  function openMenu() {
    setMenuRequested(true)
    setMenuOpen(true)
  }

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-background/75 backdrop-blur">
      <Container className="flex h-14 items-center justify-between gap-4">
        <Link
          to="/"
          aria-label={`${product.name}, ir al inicio`}
          className="flex min-w-0 items-center gap-2.5 rounded-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <img
            src="/ariad-logo.webp"
            alt="Logotipo de Ari-Tool"
            width={169}
            height={112}
            fetchPriority="high"
            className="h-7 w-auto"
          />
          <span className="truncate font-heading text-[15px] font-semibold tracking-tight text-foreground">
            {product.name}
          </span>
        </Link>

        <nav
          aria-label="Navegación principal"
          className="hidden items-center gap-1 lg:flex"
        >
          {mainNav.map((item) => {
            const active = activeSection === item.section
            return (
              <Link
                key={item.href}
                to={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group relative rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                  active ? "text-foreground" : "text-foreground/65 hover:text-foreground"
                )}
              >
                {item.label}
                <span
                  aria-hidden="true"
                  className={cn(
                    "pointer-events-none absolute inset-x-3 -bottom-px h-0.5 origin-left rounded-full bg-gradient-to-r from-cobalt to-cyan transition-transform duration-300",
                    active ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100"
                  )}
                />
              </Link>
            )
          })}

          <Link
            to={downloadNav.href}
            aria-current={activeSection === "descargas" ? "page" : undefined}
            className={cn(
              "group relative rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
              activeSection === "descargas"
                ? "text-foreground"
                : "text-foreground/65 hover:text-foreground"
            )}
          >
            {downloadNav.label}
            <span
              aria-hidden="true"
              className={cn(
                "pointer-events-none absolute inset-x-3 -bottom-px h-0.5 origin-left rounded-full bg-gradient-to-r from-cobalt to-cyan transition-transform duration-300",
                activeSection === "descargas" ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100"
              )}
            />
          </Link>

          <span aria-hidden="true" className="mx-2 h-4 w-px bg-line" />

          <Link
            to={crossNav.href}
            aria-current={activeSection === "gsm" ? "page" : undefined}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
              activeSection === "gsm"
                ? "border-cobalt/50 bg-cobalt/10 text-foreground"
                : "border-line text-foreground/65 hover:border-cobalt/40 hover:text-foreground"
            )}
          >
            <span aria-hidden="true" className="size-1.5 rounded-full bg-cyan" />
            {crossNav.label}
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-10 rounded-lg border-line bg-transparent text-foreground hover:border-foreground/30 hover:bg-foreground/[0.04]"
            aria-label={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
            onClick={toggleTheme}
          >
            {theme === "dark" ? (
              <Sun aria-hidden="true" className="size-4" />
            ) : (
              <Moon aria-hidden="true" className="size-4" />
            )}
          </Button>

          <Button asChild className="hidden h-9 rounded-lg px-4 text-sm font-medium sm:inline-flex">
            <Link to={sessionCta.href}>{sessionCta.label}</Link>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-10 border-line bg-transparent text-foreground lg:hidden"
            aria-label="Abrir menú de navegación"
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
            onClick={openMenu}
          >
            <Menu aria-hidden="true" />
          </Button>

          {menuRequested ? (
            <Suspense fallback={null}>
              <MobileMenu
                open={menuOpen}
                onOpenChange={setMenuOpen}
                activeSection={activeSection}
              />
            </Suspense>
          ) : null}
        </div>
      </Container>
    </header>
  )
}
