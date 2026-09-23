import { Suspense } from "react"
import { Outlet } from "react-router-dom"

import { PageSkeleton } from "@/components/layout/PageSkeleton"
import { ScrollManager } from "@/components/layout/ScrollManager"
import { SiteBackground } from "@/components/layout/SiteBackground"
import { SiteFooter } from "@/components/layout/SiteFooter"
import { SiteHeader } from "@/components/layout/SiteHeader"

export function RootLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <ScrollManager />
      <SiteBackground />
      <SiteHeader />
      {/* El Suspense vive acá adentro, no arriba de las rutas: así el header,
          el footer y el fondo NO se desmontan al cambiar de página. Solo el
          contenido muestra el esqueleto. */}
      <main className="flex-1">
        <Suspense fallback={<PageSkeleton />}>
          <Outlet />
        </Suspense>
      </main>
      <SiteFooter />
    </div>
  )
}
