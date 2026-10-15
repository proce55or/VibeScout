import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Frontend lives in web/. The dev server proxies /api to the local backend so
// that foreign pages are never fetched from the browser (no CORS proxy, no
// front-end fetching of third-party sites — the backend does all of that).
export default defineConfig({
  root: path.resolve(__dirname, "web"),
  base: "./",
  build: {
    outDir: path.resolve(__dirname, "web/dist"),
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
