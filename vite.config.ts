import path from "node:path"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    proxy: {
      // La API Node de AriadGSM corre en 4173. En dev se proxea todo lo que
      // aun vive en el servidor: API + rutas legacy (landing GSM, portal,
      // operador, verificacion, manual) hasta migrarlas a React.
      "/api": {
        target: "http://127.0.0.1:4173",
        changeOrigin: true,
      },
      // /gsm ya es ruta React (no se proxea). El resto de rutas legacy van al
      // servidor Node hasta migrarlas.
      "^/gsm-legacy": "http://127.0.0.1:4173",
      // /cliente ya es ruta React (portal FRP migrado). El portal legacy sigue
      // servido por el Node en produccion hasta hacer el cutover en server.js.
      "^/pedido": "http://127.0.0.1:4173",
      "^/portal": "http://127.0.0.1:4173",
      "^/admin": "http://127.0.0.1:4173",
      "^/v/": "http://127.0.0.1:4173",
      "^/manual": "http://127.0.0.1:4173",
      "^/servicios": "http://127.0.0.1:4173",
      "^/owner-recovery": "http://127.0.0.1:4173",
      "^/descargar": "http://127.0.0.1:4173",
      "^/instrucciones": "http://127.0.0.1:4173",
    },
  },
  build: {
    target: "es2022",
    // Las banderas de `flag-icons` NO se incrustan como data URI: si se
    // inlinean, el CSS pasa de unos pocos kB a más de 400 kB porque mete las
    // 255 banderas. Como archivos sueltos, el navegador baja solo las que ve.
    assetsInlineLimit: (filePath: string) =>
      filePath.includes("flag-icons") ? false : undefined,
    rollupOptions: {
      output: {
        // React y el router en fragmentos propios: cambian poco y se cachean
        // aparte del código de la página.
        manualChunks(id) {
          if (/node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) {
            return "react"
          }
          if (/node_modules[\\/]react-router/.test(id)) {
            return "router"
          }
        },
      },
    },
  },
})
