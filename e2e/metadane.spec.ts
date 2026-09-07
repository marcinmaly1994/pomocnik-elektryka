import { test, expect } from "@playwright/test";

/**
 * Metadane strony: favicona, opis i karta podgladu linku.
 *
 * Testy sa tu po to, zeby te znaczniki nie wyparowaly przy nastepnej przebudowie
 * `index.html` — sa niewidoczne w aplikacji, wiec nikt by tego nie zauwazyl. Do
 * niedawna `index.html` mial `<title>` i NIC poza tym: przegladarka pokazywala
 * domyslna kartke zamiast ikony, a wklejony gdziekolwiek adres — pusta karte.
 */

test("strona ma opis, ikone i kolor paska", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle(/pomocnikelektryka\.pl/);

  const meta = (selektor: string) => page.locator(selektor).getAttribute("content");
  expect(await meta('meta[name="description"]')).toMatch(/PN-HD 60364/);
  expect(await meta('meta[name="theme-color"]')).toBe("#EEF1F4");
  // Interfejs jest wylacznie jasny — bez tego przegladarka w trybie ciemnym
  // renderuje pola formularzy po swojemu.
  expect(await meta('meta[name="color-scheme"]')).toBe("light");

  expect(await page.locator('link[rel="icon"]').getAttribute("href")).toBe("/favicon.svg");
  expect(await page.locator('link[rel="apple-touch-icon"]').getAttribute("href")).toBe("/apple-touch-icon.png");
});

test("karta podgladu linku ma komplet danych i BEZWZGLEDNE adresy", async ({ page }) => {
  await page.goto("/");
  const meta = (selektor: string) => page.locator(selektor).getAttribute("content");

  expect(await meta('meta[property="og:type"]')).toBe("website");
  expect(await meta('meta[property="og:locale"]')).toBe("pl_PL");
  expect(await meta('meta[property="og:title"]')).toMatch(/pomocnikelektryka\.pl/);
  expect(await meta('meta[property="og:description"]')).toBeTruthy();
  expect(await meta('meta[name="twitter:card"]')).toBe("summary_large_image");

  // Sciezka wzgledna nie zadziala: scrapery nie rozwiazuja jej wzgledem strony.
  for (const s of ['meta[property="og:image"]', 'meta[name="twitter:image"]', 'meta[property="og:url"]']) {
    expect(await meta(s)).toMatch(/^https:\/\//);
  }
  // Wymiary deklarowane w znacznikach musza zgadzac sie z plikiem, inaczej
  // Facebook rysuje karte w zlych proporcjach.
  expect(await meta('meta[property="og:image:width"]')).toBe("1200");
  expect(await meta('meta[property="og:image:height"]')).toBe("630");
});

test("pliki statyczne sa serwowane, a nie lapane przez przekierowanie SPA", async ({ page, request }) => {
  for (const [sciezka, typ] of [
    ["/favicon.svg", /svg/],
    ["/apple-touch-icon.png", /png/],
    ["/og.png", /png/],
    ["/robots.txt", /text\/plain/],
  ] as const) {
    const odp = await request.get(sciezka);
    expect(odp.status(), sciezka).toBe(200);
    expect(odp.headers()["content-type"], sciezka).toMatch(typ);
  }

  // Obrazek karty musi miec dokladnie te wymiary, ktore obiecuja znaczniki.
  // `goto` jest tu konieczne: bez niego karta stoi na `about:blank` i sciezka
  // wzgledna nie ma sie wzgledem czego rozwiazac.
  await page.goto("/");
  const wymiary = await page.evaluate(
    () =>
      new Promise<{ w: number; h: number }>((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
        img.src = "/og.png";
      })
  );
  expect(wymiary).toEqual({ w: 1200, h: 630 });
});

test("robots blokuje wyszukiwarki, ale przepuszcza podglad linku", async ({ request }) => {
  const tekst = await (await request.get("/robots.txt")).text();

  // Adres tymczasowy (*.pages.dev) nie ma byc indeksowany, zeby nie konkurowal
  // pozniej z docelowa domena.
  expect(tekst).toMatch(/User-agent: \*\s*\nDisallow: \//);

  // ...ale karta podgladu ma dzialac, bo aplikacja rozchodzi sie dzis linkiem.
  for (const bot of ["facebookexternalhit", "Twitterbot", "LinkedInBot", "Slackbot", "WhatsApp"]) {
    expect(tekst, bot).toContain(`User-agent: ${bot}`);
  }
});

/**
 * Manifest aplikacji — bez niego przegladarka nie zaproponuje dodania do ekranu
 * glownego, a wtedy caly tryb offline jest dla uzytkownika niewidoczny.
 */
test("manifest ma komplet danych do zainstalowania aplikacji", async ({ page, request }) => {
  await page.goto("/");
  expect(await page.locator('link[rel="manifest"]').getAttribute("href")).toBe("/manifest.webmanifest");

  const m = await (await request.get("/manifest.webmanifest")).json();
  expect(m.start_url).toBe("/");
  expect(m.display).toBe("standalone");
  expect(m.lang).toBe("pl");
  // 192 i 512 to rozmiary wymagane przez przegladarki do instalacji; wariant
  // „maskable" pilnuje, zeby Android nie przycial domku wlasna maska.
  const rozmiary = (m.icons as { sizes: string }[]).map((i) => i.sizes);
  expect(rozmiary).toContain("192x192");
  expect(rozmiary).toContain("512x512");
  expect((m.icons as { purpose?: string }[]).some((i) => i.purpose === "maskable")).toBe(true);
});

test("stopka podaje wersje wdrozenia", async ({ page }) => {
  await page.goto("/");
  // Bez tego przy zgloszeniu „u mnie nie dziala" nie ma jak ustalic, co ktos ma
  // zaladowane: aplikacja jest jednostronicowa, wiec adres tego nie mowi.
  await expect(page.locator("footer")).toContainText(/wersja \S+/);
});

/**
 * W trybie deweloperskim service worker NIE moze sie rejestrowac: Vite serwuje wtedy
 * kazdy modul osobno, pod adresami ze znacznikami czasu, wiec zapamietanie ich
 * rozjezdza HMR i podaje kod sprzed ostatniej zmiany. Testy e2e biegna wlasnie po
 * serwerze deweloperskim, wiec to jedyne miejsce, gdzie da sie tego dopilnowac.
 */
test("service worker nie wtraca sie do trybu deweloperskiego", async ({ page }) => {
  await page.goto("/");
  await page.waitForTimeout(1000);
  const zarejestrowany = await page.evaluate(async () => !!(await navigator.serviceWorker?.getRegistration()));
  expect(zarejestrowany).toBe(false);
});
