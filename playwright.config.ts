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
  /**
   * W CI DWA workery zamiast jednego.
   *
   * Playwright domyslnie schodzi w CI do jednego procesu i pierwszy przebieg trwal
   * przez to 17,5 minuty zamiast lokalnych czterech. Runner GitHuba ma cztery rdzenie,
   * wiec dwa workery to nadal polowa maszyny — zapas dla dwoch serwerow (dev i
   * `vite preview`), ktore chodza obok testow.
   *
   * Lokalnie bez zmian — domyslna polowa rdzeni.
   *
   * TESTY CHMURY SA POZA TA ARYTMETYKA. Oba pliki (`konto.spec.ts`,
   * `rooms-reconcile-cloud.spec.ts`, oznaczone `@chmura`) loguja sie na WSPOLNE konto,
   * a `posprzataj` w e2e/_konto.ts kasuje z niego wszystkie zapisy z prefiksem
   * „E2E-TEST" — takze cudze. Rownolegle kasowalyby sobie dane w trakcie.
   * `mode: "serial"` w obu plikach pilnuje kolejnosci tylko WEWNATRZ pliku; miedzy
   * plikami nie znaczy nic. W CI jada wiec osobnym krokiem, poza shardami i na jednym
   * workerze (patrz .github/workflows/sprawdzenia.yml).
   *
   * Lokalne `npm run e2e` puszcza je razem z reszta i teoretycznie moze na to trafic.
   * Zostawione swiadomie: podzial lokalnego przebiegu na dwa przejscia znaczylby drugie
   * budowanie paczki pod serwer `preview`, czyli mniej wiecej minute za kazdym razem,
   * a przy jednej osobie i natychmiast widocznej porazce to zla wymiana.
   */
  workers: process.env.CI ? 2 : undefined,
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
      use: {
        baseURL: "http://localhost:5173",
        /**
         * Okno WYŻSZE niż domyślne 1280×720 Playwrighta.
         *
         * Od kiedy wysokość płótna bierze się z pomiaru (patrz `wysokoscPlotna`
         * w lib/design.ts), rysunek mieści się w oknie — ale na oknie tak niskim jak
         * 720 px zostaje na niego mniej niż 350 px, bo samej chrome nad płótnem jest
         * ponad 300 px. Przy takim płótnie dopasowanie widoku ogranicza WYSOKOŚĆ,
         * powiększenie spada poniżej 0,6, a promienie przyciągania — podawane
         * w jednostkach planu — robią się na ekranie kilkupikselowe. Dziesiątki testów
         * klikają w płótno pod stałym offsetem w pikselach i przestają trafiać.
         *
         * 1000 px wysokości to okno, w którym dopasowanie ogranicza SZEROKOŚĆ kolumny,
         * czyli dokładnie tak jak wcześniej — i przy okazji realistyczniejsze niż 720 px
         * (to wysokość okna na monitorze 1080p, a nie na nieistniejącym laptopie).
         * Testy, które celowo sprawdzają wąskie/niskie okno, i tak ustawiają własny
         * rozmiar (`edytor-waski-ekran.spec.ts`, `fullscreen.spec.ts`).
         */
        viewport: { width: 1280, height: 1000 },
      },
    },
    {
      name: OFFLINE,
      testMatch: /offline\.spec\.ts/,
      use: { baseURL: "http://localhost:5190" },
    },
  ],
});
