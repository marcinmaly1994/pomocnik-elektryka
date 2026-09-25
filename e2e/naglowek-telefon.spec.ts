import { test, expect } from "@playwright/test";

/**
 * Nagłówek na telefonie.
 *
 * Pasek nawigacji przewija się poziomo w jednym rzędzie — świadomie, bo zawijanie
 * na trzy rzędy zjadało 122 px. Kosztem było jednak to, CO wylądowało na końcu
 * przewijania: przy 375 px „Zaloguj się" zaczynało się 623 px za prawą krawędzią,
 * a suwak jest celowo ukryty, więc nic nie zdradzało, że tam cokolwiek jest.
 * Aplikacja namawia do założenia konta, żeby nie stracić pracy — a samego przycisku
 * praktycznie nie dało się znaleźć.
 */

test.use({ viewport: { width: 375, height: 812 } });

test("„Zaloguj się” mieści się na ekranie telefonu bez przewijania nagłówka", async ({ page }) => {
  await page.goto("/");

  const zaloguj = page.getByRole("button", { name: "Zaloguj się" }).first();
  await expect(zaloguj).toBeVisible();

  const ramka = await zaloguj.boundingBox();
  const szerokosc = page.viewportSize()!.width;
  expect(ramka).not.toBeNull();
  expect(ramka!.x).toBeGreaterThanOrEqual(0);
  expect(ramka!.x + ramka!.width).toBeLessThanOrEqual(szerokosc);
});

/** Zakładki mają się nadal mieścić w jednym rzędzie i przewijać — bez tego
 *  naprawa jednego problemu przywróciłaby drugi, trzyrzędowy nagłówek. */
test("zakładki nadal przewijają się poziomo, zamiast zawijać na kolejne rzędy", async ({ page }) => {
  await page.goto("/");

  const stan = await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Kalkulatory");
    const pasek = btn?.parentElement as HTMLElement | null;
    return pasek ? { przewijalny: pasek.scrollWidth > pasek.clientWidth, wysokosc: pasek.clientHeight } : null;
  });

  expect(stan).not.toBeNull();
  expect(stan!.przewijalny).toBe(true);
  // Jeden rząd przycisków, nie dwa — wysokość rzędu to ok. 34 px.
  expect(stan!.wysokosc).toBeLessThan(60);
});

/** Nagłówek nie ma prawa rozpychać całej strony — to był osobny, naprawiony już błąd. */
test("strona nie dostaje poziomego przewijania", async ({ page }) => {
  await page.goto("/");
  const rozjazd = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(rozjazd).toBeLessThanOrEqual(0);
});

/**
 * Że pasek da się przewinąć, mówi WYGASZONA krawędź, a nie słowo urwane w pół.
 *
 * Przycięty „Protokoły pomiar" czytał się jak błąd układu. Wygaszenie stoi przy tej
 * krawędzi, za którą jest jeszcze treść, i znika, gdy pasek dojedzie do końca.
 * Obliczony styl oddaje kolory jako `rgb(...)`/`rgba(...)`, stąd takie dopasowania.
 */
test("pasek zakładek wygasza prawą krawędź, dopóki jest za nią treść", async ({ page }) => {
  await page.goto("/");
  const pasek = page.getByTestId("pasek-zakladek");
  const maska = () => pasek.evaluate((el) => getComputedStyle(el).webkitMaskImage || getComputedStyle(el).maskImage);

  // Na starcie: pełny kolor po lewej, przezroczystość na prawym końcu.
  await expect.poll(maska).toMatch(/^linear-gradient\(to right, rgb\(0, 0, 0\),.*rgba\(0, 0, 0, 0\)\)$/);

  await pasek.evaluate((el) => el.scrollTo({ left: el.scrollWidth }));
  // Na końcu: wygaszona już tylko LEWA krawędź, za którą schowały się pierwsze zakładki.
  await expect.poll(maska).toMatch(/^linear-gradient\(to right, rgba\(0, 0, 0, 0\),.*rgb\(0, 0, 0\)\)$/);
});
