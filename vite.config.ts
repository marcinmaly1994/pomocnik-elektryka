/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { execSync } from "node:child_process";
import path from "node:path";

/**
 * Znacznik wersji wdrożenia — skrót commita i data budowania.
 *
 * Bez niego przy zgłoszeniu „u mnie nie działa" nie było jak ustalić, co ktoś ma
 * właściwie załadowane: aplikacja jest jednostronicowa, więc pasek adresu tego nie
 * mówi, a przeglądarka potrafi trzymać starą wersję z pamięci podręcznej.
 *
 * Ten sam ciąg nazywa pamięć podręczną service workera (patrz `public/sw.js`), więc
 * każde wdrożenie dostaje własną i stare pliki nie mogą przeżyć aktualizacji.
 */
function wersjaBuildu(): string {
  const data = new Date().toISOString().slice(0, 10);
  try {
    const commit = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
    return `${data}-${commit}`;
  } catch {
    // Budowanie z paczki bez repozytorium (np. z archiwum) — data wystarczy.
    return data;
  }
}

/**
 * Wersja podawana jako MODUŁ WIRTUALNY, a nie przez `define`.
 *
 * Powód jest empiryczny: `define` w tym projekcie nie podmieniało identyfikatora —
 * przechodził do zbudowanej paczki dosłownie i wywracał aplikację przy pierwszym
 * użyciu (`__WERSJA_BUILDU__ is not defined`). Moduł wirtualny jest zwykłym importem,
 * więc podlega normalnemu rozwiązywaniu zależności i widać go w wyniku budowania —
 * a to, czy zadziałał, da się sprawdzić testem zamiast wiary.
 */
const ID_WERSJI = "virtual:wersja-buildu";

function wtyczkaWersji() {
  const wersja = wersjaBuildu();
  return {
    name: "wersja-buildu",
    // `pre`, bo bez tego wbudowany resolver Vite dostaje ten import pierwszy,
    // nie znajduje takiego pliku na dysku i budowanie konczy sie bledem.
    enforce: "pre" as const,
    resolveId(id: string) {
      // Wiodące „\0" to konwencja: mówi pozostałym wtyczkom, że to moduł
      // wirtualny, więc nikt nie próbuje szukać takiego pliku na dysku.
      return id === ID_WERSJI ? `\0${ID_WERSJI}` : null;
    },
    load(id: string) {
      return id === `\0${ID_WERSJI}` ? `export const WERSJA_BUILDU = ${JSON.stringify(wersja)};` : null;
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), wtyczkaWersji()],
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
