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
