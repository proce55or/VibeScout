import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Testy działają bez internetu i poświadczeń (transport i DNS wstrzykiwane).
    testTimeout: 20000,
  },
});
