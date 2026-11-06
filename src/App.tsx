import { lazy, Suspense } from "react"
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"

import { MarcoAriTool } from "@/components/aritool/Marco"
import { RootLayout } from "@/components/layout/RootLayout"
import { ReleaseProvider } from "@/lib/release"
import { HomeAriTool } from "@/pages/HomeAriTool"

// Páginas secundarias en fragmentos separados: la portada carga solo lo que necesita.
const AppAriToolPage = lazy(() =>
  import("@/pages/AppAriToolPage").then((m) => ({ default: m.AppAriToolPage }))
)
const NovedadesPage = lazy(() =>
  import("@/pages/NovedadesPage").then((m) => ({ default: m.NovedadesPage }))
)
const DescargarAriToolPage = lazy(() =>
  import("@/pages/DescargarAriToolPage").then((m) => ({ default: m.DescargarAriToolPage }))
)
const MiCuentaPage = lazy(() =>
  import("@/pages/MiCuentaPage").then((m) => ({ default: m.MiCuentaPage }))
)
const HistorialPage = lazy(() =>
  import("@/pages/HistorialPage").then((m) => ({ default: m.HistorialPage }))
)
const RecargarPage = lazy(() =>
  import("@/pages/RecargarPage").then((m) => ({ default: m.RecargarPage }))
)
const LicenciaPage = lazy(() =>
  import("@/pages/RecargarPage").then((m) => ({ default: m.LicenciaPage }))
)
const NoExistePage = lazy(() =>
  import("@/pages/NoExistePage").then((m) => ({ default: m.NoExistePage }))
)

// Web anterior: solo lo que la web nueva todavía no reemplazó.
// Panel: Recargar (W14) y Licencia (W15) siguen acá hasta que existan sus páginas nuevas.
const DashboardPage = lazy(() =>
  import("@/pages/DashboardPage").then((m) => ({ default: m.DashboardPage }))
)
// Portal cliente FRP (pendiente: Peter decidió retirarlo, 4-nov).
const PortalPage = lazy(() =>
  import("@/pages/gsm/portal/PortalPage").then((m) => ({ default: m.PortalPage }))
)
// Políticas y términos (una sola página con secciones ancladas).
const LegalPage = lazy(() =>
  import("@/pages/LegalPage").then((m) => ({ default: m.LegalPage }))
)

// TEMPORAL, solo para revisar contra el Figma: galería de estados de la Cuenta (presentación) e índice.
const CuentaEstadosPreview = lazy(() =>
  import("@/pages/CuentaEstadosPreview").then((m) => ({ default: m.CuentaEstadosPreview }))
)
// Cuenta: en compu, dos paneles con el emblema y las herramientas (W11-E, elegido por Peter 5-nov); en celular, W11m.
const IngresarPrototipoPage = lazy(() =>
  import("@/pages/IngresarPrototipoPage").then((m) => ({ default: m.IngresarPrototipoPage }))
)
const PreviewIndex = lazy(() =>
  import("@/pages/PreviewIndex").then((m) => ({ default: m.PreviewIndex }))
)

const pagina = (el: React.ReactNode) => <Suspense fallback={null}>{el}</Suspense>

// Direcciones de la etapa de vista previa: llevan a la definitiva (por si alguien guardó el enlace).
const VISTA_PREVIA: [string, string][] = [
  ["preview-home", "/"],
  ["preview-app", "/app"],
  ["preview-novedades", "/novedades"],
  ["preview-descargar", "/descargas"],
  ["preview-cuenta", "/cuenta"],
  ["preview-mi-cuenta", "/mi-cuenta"],
]

export default function App() {
  return (
    <ReleaseProvider>
      <BrowserRouter>
        <Routes>
          {/* Web AriTool. Las direcciones salen del mapa RUTAS (components/aritool/chrome). */}
          <Route element={<MarcoAriTool />}>
            <Route index element={<HomeAriTool />} />
            <Route path="app" element={pagina(<AppAriToolPage />)} />
            <Route path="novedades" element={pagina(<NovedadesPage />)} />
            {/* "/descargar" es del servidor: entrega el programa. La página es "/descargas". */}
            <Route path="descargas" element={pagina(<DescargarAriToolPage />)} />
            <Route path="cuenta" element={pagina(<IngresarPrototipoPage />)} />
            <Route path="mi-cuenta" element={pagina(<MiCuentaPage />)} />
            <Route path="mi-cuenta/historial" element={pagina(<HistorialPage />)} />
            <Route path="mi-cuenta/recargar" element={pagina(<RecargarPage />)} />
            <Route path="mi-cuenta/licencia" element={pagina(<LicenciaPage />)} />
            {/* Dirección vieja: la landing GSM ahora es el Inicio (regla W8 #13). */}
            <Route path="gsm" element={<Navigate to="/" replace />} />
            {VISTA_PREVIA.map(([vieja, nueva]) => <Route key={vieja} path={vieja} element={<Navigate to={nueva} replace />} />)}
            <Route path="preview-cuenta-estados" element={pagina(<CuentaEstadosPreview />)} />
            <Route path="preview-ingresar" element={<Navigate to="/cuenta" replace />} />
            <Route path="preview" element={pagina(<PreviewIndex />)} />
            <Route path="*" element={pagina(<NoExistePage />)} />
          </Route>
          <Route element={<RootLayout />}>
            <Route path="panel" element={<DashboardPage />} />
            <Route path="cliente" element={<PortalPage />} />
            <Route path="legal" element={<LegalPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ReleaseProvider>
  )
}
