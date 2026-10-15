import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Frontend w web/. Serwer dev proxuje /api do lokalnego backendu, dzięki czemu
// strony obce nigdy nie są pobierane z przeglądarki (brak proxy CORS).
export default defineConfig({
  root: path.resolve(import.meta.dirname, "web"),
  base: "./",
  build: {
    outDir: path.resolve(import.meta.dirname, "web/dist"),
    emptyOutDir: true,
  },
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:4317",
        changeOrigin: false,
      },
    },
  },
});
