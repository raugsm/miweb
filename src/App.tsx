import { lazy } from "react"
import { BrowserRouter, Route, Routes } from "react-router-dom"

import { RootLayout } from "@/components/layout/RootLayout"
import { ReleaseProvider } from "@/lib/release"
import { HomePage } from "@/pages/HomePage"

// Páginas secundarias en fragmentos separados: la portada carga solo lo que necesita.
const AccountPage = lazy(() =>
  import("@/pages/AccountPage").then((m) => ({ default: m.AccountPage }))
)
const GsmLandingPage = lazy(() =>
  import("@/pages/gsm/GsmLandingPage").then((m) => ({ default: m.GsmLandingPage }))
)
const DashboardPage = lazy(() =>
  import("@/pages/DashboardPage").then((m) => ({ default: m.DashboardPage }))
)
// Portal cliente FRP migrado a React (reemplaza a public/portal.html).
const PortalPage = lazy(() =>
  import("@/pages/gsm/portal/PortalPage").then((m) => ({ default: m.PortalPage }))
)
const NotFoundPage = lazy(() =>
  import("@/pages/NotFoundPage").then((m) => ({ default: m.NotFoundPage }))
)
// Políticas y términos (una sola página con secciones ancladas).
const LegalPage = lazy(() =>
  import("@/pages/LegalPage").then((m) => ({ default: m.LegalPage }))
)

export default function App() {
  return (
    <ReleaseProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<RootLayout />}>
            <Route index element={<HomePage />} />
            <Route path="cuenta" element={<AccountPage />} />
            <Route path="gsm" element={<GsmLandingPage />} />
            <Route path="cliente" element={<PortalPage />} />
            <Route path="panel" element={<DashboardPage />} />
            <Route path="legal" element={<LegalPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ReleaseProvider>
  )
}
