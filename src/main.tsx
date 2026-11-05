import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./index.css"
import App from "./App.tsx"
import { ThemeProvider } from "./lib/theme.tsx"
import { PaisProvider } from "./lib/pais.tsx"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <PaisProvider>
        <App />
      </PaisProvider>
    </ThemeProvider>
  </StrictMode>,
)
