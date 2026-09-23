import { Link } from "react-router-dom"
import { Moon, Sun } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { headerCta, headerLinks, pageLinks, product, sessionCta } from "@/data/product"
import { useTheme } from "@/lib/theme"

type MobileMenuProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Menú lateral móvil. Se carga bajo demanda (lazy) la primera vez que se abre,
 * así el diálogo de Radix no forma parte del JS inicial de la portada.
 */
export function MobileMenu({ open, onOpenChange }: MobileMenuProps) {
  const { theme, toggleTheme } = useTheme()

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="border-line">
        <SheetHeader>
          <SheetTitle>{product.name}</SheetTitle>
          <SheetDescription>Navegación del sitio</SheetDescription>
        </SheetHeader>
        <nav aria-label="Navegación móvil" className="flex flex-col gap-1 px-4">
          {[...headerLinks, ...pageLinks].map((link) => (
            <SheetClose asChild key={link.href}>
              <Link
                to={link.href}
                className="rounded-md px-3 py-2.5 text-sm text-foreground/75 transition-colors hover:bg-foreground/[0.04] hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                {link.label}
              </Link>
            </SheetClose>
          ))}
        </nav>
        <div className="mt-auto space-y-2 p-4">
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full rounded-lg border-line bg-transparent text-foreground hover:border-foreground/30 hover:bg-foreground/[0.04]"
            onClick={toggleTheme}
          >
            {theme === "dark" ? (
              <Sun aria-hidden="true" className="size-4" />
            ) : (
              <Moon aria-hidden="true" className="size-4" />
            )}
            {theme === "dark" ? "Modo claro" : "Modo oscuro"}
          </Button>
          <SheetClose asChild>
            <Button
              asChild
              variant="outline"
              className="h-11 w-full rounded-lg border-line bg-transparent font-medium text-foreground hover:border-foreground/30 hover:bg-foreground/[0.04]"
            >
              <Link to={headerCta.href}>{headerCta.label}</Link>
            </Button>
          </SheetClose>
          <SheetClose asChild>
            <Button asChild className="h-11 w-full rounded-lg font-medium hover:bg-cobalt-deep">
              <Link to={sessionCta.href}>{sessionCta.label}</Link>
            </Button>
          </SheetClose>
        </div>
      </SheetContent>
    </Sheet>
  )
}
