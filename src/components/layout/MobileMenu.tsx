import { Link } from "react-router-dom"
import { BookOpen, Boxes, Download, LifeBuoy, Moon, Smartphone, Sun, Tag } from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { crossNav, downloadNav, mainNav, product, sessionCta } from "@/data/product"
import { useTheme } from "@/lib/theme"
import { cn } from "@/lib/utils"

type MobileMenuProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Sección donde está parado el visitante, para resaltarla en la lista. */
  activeSection: string | null
}

const iconoPorSeccion: Record<string, LucideIcon> = {
  producto: Boxes,
  precios: Tag,
  dispositivos: Smartphone,
  guia: BookOpen,
  soporte: LifeBuoy,
  descargas: Download,
  gsm: Smartphone,
}

/**
 * Menú lateral móvil. Se carga bajo demanda (lazy) la primera vez que se abre,
 * así el diálogo de Radix no forma parte del JS inicial de la portada.
 */
export function MobileMenu({ open, onOpenChange, activeSection }: MobileMenuProps) {
  const { theme, toggleTheme } = useTheme()
  const items = [...mainNav, downloadNav, crossNav]

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="border-line">
        <SheetHeader>
          <SheetTitle>{product.name}</SheetTitle>
          <SheetDescription>Navegación del sitio</SheetDescription>
        </SheetHeader>
        <nav aria-label="Navegación móvil" className="flex flex-col gap-1 px-3">
          {items.map((item) => {
            const active = activeSection === item.section
            const Icon = iconoPorSeccion[item.section] ?? Boxes
            return (
              <SheetClose asChild key={item.href}>
                <Link
                  to={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                    active
                      ? "bg-cobalt/10 text-foreground"
                      : "text-foreground/75 hover:bg-foreground/[0.04] hover:text-foreground"
                  )}
                >
                  <span
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-lg border",
                      active
                        ? "border-cobalt/40 bg-cobalt/15 text-cyan"
                        : "border-line bg-field text-foreground/60"
                    )}
                  >
                    <Icon aria-hidden="true" className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{item.label}</span>
                    <span className="block truncate text-xs text-foreground/50">
                      {item.hint}
                    </span>
                  </span>
                </Link>
              </SheetClose>
            )
          })}
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
            <Button asChild className="h-11 w-full rounded-lg font-medium hover:bg-cobalt-deep">
              <Link to={sessionCta.href}>{sessionCta.label}</Link>
            </Button>
          </SheetClose>
        </div>
      </SheetContent>
    </Sheet>
  )
}
