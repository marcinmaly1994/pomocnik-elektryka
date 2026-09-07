import { test, expect, type Page } from "@playwright/test";

/**
 * Tryb offline — jedyny plik testowy jadacy po ZBUDOWANEJ paczce (`vite preview`,
 * projekt „offline" w playwright.config.ts).
 *
 * Musi tak byc: service worker nie rejestruje sie w trybie deweloperskim, bo
 * rozjechalby HMR. Bez tego pliku tryb offline byl obietnica bez pokrycia —
 * sprawdzona raz recznie i niepilnowana przez nic, mimo ze siedzi w pliku, ktory
 * przy bledzie potrafi popsuc aplikacje SKUTECZNIEJ niz jej brak.
 */

/** Czeka, az service worker przejmie kontrole nad strona i zdazy zapisac zasoby. */
async function poczekajNaServiceWorker(page: Page) {
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 20_000 });
  // Pierwsze wejscie idzie jeszcze OBOK service workera (przejmuje kontrole dopiero
  // po instalacji), wiec dopiero przeladowanie przepuszcza zasoby przez jego rece.
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 20_000 });
  await expect
    .poll(async () => page.evaluate(async () => (await caches.keys()).length), { timeout: 15_000 })
    .toBeGreaterThan(0);
}

test("aplikacja otwiera sie BEZ SIECI, razem z adresem podrzednym", async ({ page, context }) => {
  await page.goto("/kalkulatory/spadek");
  await expect(page.getByRole("heading", { name: "Kalkulatory elektryczne" })).toBeVisible();
  await poczekajNaServiceWorker(page);
  await expect(page.getByRole("heading", { name: "Spadek napięcia" })).toBeVisible();

  await context.setOffline(true);
  await page.goto("/kalkulatory/spadek");

  // Sedno: bez sieci widac kalkulator, a nie ekran bledu przegladarki.
  await expect(page.getByRole("heading", { name: "Kalkulatory elektryczne" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Spadek napięcia" })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/kalkulatory/spadek");
});

test("bez sieci dziala tez przejscie na inna zakladke (leniwy kawalek kodu z pamieci)", async ({ page, context }) => {
  await page.goto("/");
  await poczekajNaServiceWorker(page);
  // Otwarcie zakladki PRZED odcieciem sieci — chodzi o to, zeby jej kawalek kodu
  // trafil do pamieci podrecznej.
  await page.getByRole("button", { name: "Protokoły pomiarowe" }).click();
  await expect(page.getByRole("heading", { name: "Protokoły pomiarowe" })).toBeVisible();

  await context.setOffline(true);
  await page.goto("/protokoly/izolacja");
  await expect(page.getByRole("heading", { name: "Pomiar rezystancji izolacji" })).toBeVisible();
});

/**
 * REGRESJA: kopia strony NIE MOZE byc odpowiedzia przekierowana.
 *
 * W `_redirects` stoi piec regul 301 (stare adresy kalkulatorow). Gdyby taka
 * odpowiedz trafila do pamieci podrecznej, podanie jej przegladarce przy nawigacji
 * byloby bledem specyfikacji i offline pokazywalby ekran bledu sieci — u kogos, kto
 * kiedys wszedl ze starego linku. Patrz `wolnoZapisacNawigacje` w public/sw.js.
 */
test("zapisana kopia strony nie jest odpowiedzia przekierowana", async ({ page }) => {
  await page.goto("/");
  await poczekajNaServiceWorker(page);

  const kopia = await page.evaluate(async () => {
    const nazwa = (await caches.keys()).find((n) => n.startsWith("pomocnikelektryka-"));
    if (!nazwa) return null;
    const odp = await (await caches.open(nazwa)).match("/");
    return odp ? { redirected: odp.redirected, status: odp.status, typ: odp.type } : null;
  });

  expect(kopia, "brak zapisanej kopii strony — offline nie zadziala").not.toBeNull();
  expect(kopia!.redirected).toBe(false);
  expect(kopia!.status).toBe(200);
});

/** Kazde wdrozenie ma WLASNA pamiec podreczna, zeby stare kawalki kodu nie przezyly. */
test("nazwa pamieci podrecznej niesie wersje wdrozenia", async ({ page }) => {
  await page.goto("/");
  await poczekajNaServiceWorker(page);

  const nazwy = await page.evaluate(() => caches.keys());
  const wersjaZeStopki = (await page.locator("footer").innerText()).match(/wersja (\S+)/)?.[1];

  expect(wersjaZeStopki).toBeTruthy();
  expect(nazwy).toContain(`pomocnikelektryka-${wersjaZeStopki}`);
  // Dokladnie jedna: aktywacja kasuje pamieci poprzednich wdrozen.
  expect(nazwy.filter((n) => n.startsWith("pomocnikelektryka-"))).toHaveLength(1);
});
