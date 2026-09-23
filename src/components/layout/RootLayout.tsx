import { Outlet } from "react-router-dom"

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
      <main className="flex-1">
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  )
}
