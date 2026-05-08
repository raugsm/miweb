import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [vue()],
  base: "/xiaomi-frp-spa/",
  build: {
    outDir: "../../public/xiaomi-frp-spa",
    emptyOutDir: true,
    sourcemap: false,
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:4173",
      "/downloads": "http://127.0.0.1:4173",
      "/images": "http://127.0.0.1:4173",
    },
  },
});
