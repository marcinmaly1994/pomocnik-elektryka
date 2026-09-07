import { test, expect } from "@playwright/test";

/**
 * Pobieranie kodu zakladki Z WYPRZEDZENIEM — przy najechaniu, nie przy kliknieciu.
 *
 * Podzial na kawalki zdjal z wejscia 283 kB, ale przeniosl je na pierwsze kliknicie:
 * same Kalkulatory to 206 kB. Kursor jest nad przyciskiem grubo wczesniej, niz go
 * nacisnie, i te zwloke wykorzystujemy na pobranie kodu.
 *
 * Test MUSI byc e2e: liczy sie tu prawdziwe zapytanie sieciowe wywolane zdarzeniem
 * wskaznika, czego w jsdom nie da sie sprawdzic. Adres modulu jest tu adresem
 * SERWERA DEWELOPERSKIEGO (Vite serwuje kazdy plik osobno); w wersji zbudowanej
 * bedzie to nazwa kawalka, ale mechanizm — `import()` na `pointerenter` — ten sam.
 */

const MODUL_KALKULATOROW = /CalculatorsTab/;

test("najechanie na „Kalkulatory” pobiera kod zakladki jeszcze przed klknieciem", async ({ page }) => {
  const pobrane: string[] = [];
  page.on("request", (r) => pobrane.push(r.url()));

  await page.goto("/");
  await expect(page.getByRole("button", { name: "Kalkulatory", exact: true })).toBeVisible();

  // Wejscie na strone NIE ma ciagnac kalkulatorow — to caly sens podzialu.
  expect(pobrane.filter((u) => MODUL_KALKULATOROW.test(u))).toHaveLength(0);

  await page.getByRole("button", { name: "Kalkulatory", exact: true }).hover();

  await expect
    .poll(() => pobrane.filter((u) => MODUL_KALKULATOROW.test(u)).length, {
      message: "najechanie nie wywolalo pobrania kodu zakladki",
    })
    .toBeGreaterThan(0);

  // Nadal jestesmy na zakladce startowej: pobranie z wyprzedzeniem NIE nawiguje.
  expect(new URL(page.url()).pathname).toBe("/");
});

test("powtorne najechania nie pobieraja kodu drugi raz", async ({ page }) => {
  const pobrane: string[] = [];
  page.on("request", (r) => pobrane.push(r.url()));

  await page.goto("/");
  const przycisk = page.getByRole("button", { name: "Kalkulatory", exact: true });
  await expect(przycisk).toBeVisible();

  await przycisk.hover();
  await expect.poll(() => pobrane.filter((u) => MODUL_KALKULATOROW.test(u)).length).toBeGreaterThan(0);
  const poPierwszym = pobrane.filter((u) => MODUL_KALKULATOROW.test(u)).length;

  // `import()` oddaje modul z pamieci podrecznej modulow, wiec kolejne najechania
  // sa darmowe — inaczej przesuwanie myszy po pasku bilo w siec raz za razem.
  for (let i = 0; i < 3; i++) {
    await page.getByRole("button", { name: "Protokoły pomiarowe" }).hover();
    await przycisk.hover();
  }
  await page.waitForTimeout(200);

  expect(pobrane.filter((u) => MODUL_KALKULATOROW.test(u)).length).toBe(poPierwszym);
});

test("po najechaniu samo klikniecie nie siega juz do sieci", async ({ page }) => {
  const pobrane: string[] = [];
  page.on("request", (r) => pobrane.push(r.url()));

  await page.goto("/");
  const przycisk = page.getByRole("button", { name: "Kalkulatory", exact: true });

  await przycisk.hover();
  await expect.poll(() => pobrane.filter((u) => MODUL_KALKULATOROW.test(u)).length).toBeGreaterThan(0);

  // Od tego momentu liczymy od nowa: klikniecie ma zastac kod juz pobrany.
  pobrane.length = 0;
  await przycisk.click();
  await expect(page.getByRole("heading", { name: "Kalkulatory elektryczne" })).toBeVisible();

  // To jest miara zysku: bez pobrania z wyprzedzeniem 206 kB ladowaloby sie
  // DOPIERO tutaj, z „Wczytywaniem…" na ekranie przez caly ten czas.
  expect(pobrane.filter((u) => MODUL_KALKULATOROW.test(u))).toHaveLength(0);
});
