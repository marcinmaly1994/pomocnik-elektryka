/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // `import.meta.dirname`, nie `__dirname`: Vite 8 ostrzega, że przy natywnym
      // ładowaniu konfiguracji (planowanej jako domyślne w kolejnej wersji głównej)
      // zmienne CommonJS przestaną być dostępne.
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts",
    exclude: ["node_modules/**", "e2e/**"],
  },
});
