import { defineConfig } from "tsup";

// Bundles the backend into a single CommonJS file in dist/server/index.js.
// Native modules (better-sqlite3) stay external and are loaded from node_modules
// at runtime, so the user's own `npm install` provides the right binary for macOS.
export default defineConfig({
  entry: { "server/index": "src/server/index.ts" },
  outDir: "dist",
  format: ["cjs"],
  target: "node20",
  platform: "node",
  sourcemap: true,
  clean: true,
  splitting: false,
  dts: false,
  external: ["better-sqlite3"],
});
