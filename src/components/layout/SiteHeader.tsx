import { lazy, Suspense, useState } from "react"
import { Link } from "react-router-dom"
import { Menu, Moon, Sun } from "lucide-react"

import { Container } from "@/components/Container"
import { Button } from "@/components/ui/button"
import { headerCta, headerLinks, product, sessionCta } from "@/data/product"
import { useTheme } from "@/lib/theme"

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
          className="hidden items-center gap-6 lg:flex"
        >
          {headerLinks.map((link) => (
            <Link
              key={link.href}
              to={link.href}
              className="rounded-md text-sm text-foreground/65 transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              {link.label}
            </Link>
          ))}
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

          <Button
            asChild
            variant="outline"
            className="hidden h-9 rounded-lg border-line bg-transparent px-4 text-sm font-medium text-foreground hover:border-foreground/30 hover:bg-foreground/[0.04] hover:text-foreground sm:inline-flex"
          >
            <Link to={headerCta.href}>{headerCta.label}</Link>
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
              <MobileMenu open={menuOpen} onOpenChange={setMenuOpen} />
            </Suspense>
          ) : null}
        </div>
      </Container>
    </header>
  )
}
