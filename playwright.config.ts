import { defineConfig } from "@playwright/test";

/**
 * Dwa serwery i dwa projekty, bo część rzeczy istnieje TYLKO w zbudowanej paczce.
 *
 * Zasadniczy zestaw testów jedzie po serwerze deweloperskim (szybkie odświeżanie,
 * czytelne ślady stosu). Ale service worker jest tam celowo wyłączony — Vite serwuje
 * moduły pojedynczo, pod adresami ze znacznikami czasu, więc zapamiętanie ich
 * rozjeżdża HMR. Trybu offline nie da się więc sprawdzić tam, gdzie sprawdza się całą
 * resztę, a niesprawdzony tryb offline to obietnica bez pokrycia: pierwsza zmiana
 * w `public/sw.js` mogłaby go po cichu zabrać.
 *
 * Stąd drugi projekt: buduje paczkę i serwuje ją `vite preview`, dokładnie tak, jak
 * zobaczy ją użytkownik.
 */

const OFFLINE = "offline";

export default defineConfig({
  testDir: "./e2e",
  webServer: [
    {
      command: "npm run dev",
      url: "http://localhost:5173",
      reuseExistingServer: !process.env.CI,
    },
    {
      // Budowanie jest częścią tego serwera, a nie osobnym krokiem: test ma dotyczyć
      // AKTUALNEGO kodu, a nie paczki, która akurat leży w `dist` od wczoraj.
      command: "npm run build && npm run preview -- --port 5190 --strictPort",
      url: "http://localhost:5190",
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  ],
  projects: [
    {
      name: "dev",
      testIgnore: /offline\.spec\.ts/,
      use: { baseURL: "http://localhost:5173" },
    },
    {
      name: OFFLINE,
      testMatch: /offline\.spec\.ts/,
      use: { baseURL: "http://localhost:5190" },
    },
  ],
});
