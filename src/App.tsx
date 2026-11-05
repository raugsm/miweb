import { lazy, Suspense } from "react"
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
// Descarga: última versión (en vivo) + changelog.
const DownloadPage = lazy(() =>
  import("@/pages/DownloadPage").then((m) => ({ default: m.DownloadPage }))
)
// TEMPORAL: vista previa de la grilla de alquiler (se quita al integrar el Inicio nuevo).
const PreviewAlquiler = lazy(() =>
  import("@/pages/PreviewAlquiler").then((m) => ({ default: m.PreviewAlquiler }))
)
// TEMPORAL: portada AriTool (W1) completa para revisar/capturar antes de reemplazar el Inicio.
const HomeAriTool = lazy(() =>
  import("@/pages/HomeAriTool").then((m) => ({ default: m.HomeAriTool }))
)
const AppAriToolPage = lazy(() =>
  import("@/pages/AppAriToolPage").then((m) => ({ default: m.AppAriToolPage }))
)
const NovedadesPage = lazy(() =>
  import("@/pages/NovedadesPage").then((m) => ({ default: m.NovedadesPage }))
)
const DescargarAriToolPage = lazy(() =>
  import("@/pages/DescargarAriToolPage").then((m) => ({ default: m.DescargarAriToolPage }))
)
const CuentaPage = lazy(() =>
  import("@/pages/CuentaPage").then((m) => ({ default: m.CuentaPage }))
)
// TEMPORAL: índice único que embebe TODAS las pantallas de preview en un solo link.
const PreviewIndex = lazy(() =>
  import("@/pages/PreviewIndex").then((m) => ({ default: m.PreviewIndex }))
)

export default function App() {
  return (
    <ReleaseProvider>
      <BrowserRouter>
        <Routes>
          {/* TEMPORAL: vista previa de la grilla, fuera del layout viejo. */}
          <Route
            path="preview-alquiler"
            element={
              <Suspense fallback={null}>
                <PreviewAlquiler />
              </Suspense>
            }
          />
          <Route
            path="preview-home"
            element={
              <Suspense fallback={null}>
                <HomeAriTool />
              </Suspense>
            }
          />
          <Route
            path="preview-app"
            element={
              <Suspense fallback={null}>
                <AppAriToolPage />
              </Suspense>
            }
          />
          <Route
            path="preview-novedades"
            element={
              <Suspense fallback={null}>
                <NovedadesPage />
              </Suspense>
            }
          />
          <Route
            path="preview-descargar"
            element={
              <Suspense fallback={null}>
                <DescargarAriToolPage />
              </Suspense>
            }
          />
          <Route
            path="preview-cuenta"
            element={
              <Suspense fallback={null}>
                <CuentaPage />
              </Suspense>
            }
          />
          <Route
            path="preview"
            element={
              <Suspense fallback={null}>
                <PreviewIndex />
              </Suspense>
            }
          />
          <Route element={<RootLayout />}>
            <Route index element={<HomePage />} />
            <Route path="cuenta" element={<AccountPage />} />
            <Route path="gsm" element={<GsmLandingPage />} />
            <Route path="cliente" element={<PortalPage />} />
            <Route path="panel" element={<DashboardPage />} />
            <Route path="descargas" element={<DownloadPage />} />
            <Route path="legal" element={<LegalPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ReleaseProvider>
  )
}
