import { test, expect, type Page } from "@playwright/test";
import { wczytajPrzyklad } from "./_flow";

/**
 * Cele dotyku na tablecie (i telefonie) — cztery miejsca, które zostały po poprawkach
 * telefonowych, bo nie korzystały ze wspólnych komponentów:
 * - Rozdzielnica: ołówek, strzałki i kosz przy każdym aparacie — 13 × 13 px.
 * - Pasek edytora rzutu: „−", „+", procent i „Dopasuj" — 26 × 22 px.
 * - Kosztorys: krzyżyki „Przywróć" — 17 × 17 px.
 * - Kalkulatory (lista boczna od 1024 px): nagłówki grup — 17 px wysokości.
 *
 * `test.use` z rozmiarem okna, nie `setViewportSize` w teście — to drugie potrafi
 * zdjąć emulację dotyku, a z nią `pointer: coarse`.
 */

async function otworzPrzyklad(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await wczytajPrzyklad(page, "mieszkanie");
  await page.evaluate(() => window.scrollTo(0, 0));
}

async function wymiary(page: Page, nazwa: string | RegExp) {
  const b = (await page.getByRole("button", { name: nazwa, exact: typeof nazwa === "string" }).first().boundingBox())!;
  return { w: b.width, h: b.height };
}

test.describe("tablet 768×1024", () => {
  test.use({ viewport: { width: 768, height: 1024 }, hasTouch: true });

  test("rozdzielnica: ikonki przy aparatach pod palec", async ({ page }) => {
    await otworzPrzyklad(page);
    await page.getByRole("button", { name: "Rozdzielnica", exact: true }).first().click();
    for (const nazwa of ["Edytuj aparat F1", "Przesuń aparat F1 wyżej na szynie", "Przesuń aparat F1 niżej na szynie", "Usuń aparat F1"]) {
      const r = await wymiary(page, nazwa);
      expect(r.w, nazwa).toBeGreaterThanOrEqual(40);
      expect(r.h, nazwa).toBeGreaterThanOrEqual(44);
    }
  });

  test("pasek edytora: przyciski powiększenia pod palec", async ({ page }) => {
    await otworzPrzyklad(page);
    for (const nazwa of ["Oddal widok", "Przybliż widok", "Dopasuj widok do planu", /^Powiększenie \d+ procent/]) {
      const r = await wymiary(page, nazwa);
      expect(r.w, String(nazwa)).toBeGreaterThanOrEqual(44);
      expect(r.h, String(nazwa)).toBeGreaterThanOrEqual(44);
    }
  });

  test("kosztorys: krzyżyk „Przywróć” pod palec", async ({ page }) => {
    await otworzPrzyklad(page);
    await page.getByRole("button", { name: /Kosztorys/ }).first().click();
    const ilosc = page.getByLabel("Ilość: Gniazdko 230V podtynkowe (szt.)");
    await ilosc.fill("9");
    const r = await wymiary(page, "Przywróć ilość z rzutu: Gniazdko 230V podtynkowe (szt.)");
    expect(r.h).toBeGreaterThanOrEqual(44);
    expect(r.w).toBeGreaterThanOrEqual(32);
  });
});

test.describe("tablet 1024×768", () => {
  test.use({ viewport: { width: 1024, height: 768 }, hasTouch: true });

  test("kalkulatory: nagłówki grup listy bocznej pod palec", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByRole("button", { name: "Kalkulatory", exact: true }).click();
    await page.getByRole("button", { name: /^Bilans mocy budynku/ }).first().click();
    const r = await wymiary(page, /^Zaawansowane/);
    expect(r.h).toBeGreaterThanOrEqual(44);
  });
});

test.describe("telefon", () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

  test("pasek edytora: przyciski wyższe, ale „+” dalej mieści się w pasku", async ({ page }) => {
    await otworzPrzyklad(page);
    const plus = page.getByRole("button", { name: "Przybliż widok", exact: true });
    const b = (await plus.boundingBox())!;
    expect(b.height).toBeGreaterThanOrEqual(44);
    // Pasek przewija się w poziomie — „+" ma stać w jego widocznej części, nie za nią.
    const prawaPaska = await plus.evaluate((e) => {
      let p = e.parentElement;
      while (p && !/(auto|scroll)/.test(getComputedStyle(p).overflowX)) p = p.parentElement;
      return p ? p.getBoundingClientRect().right : window.innerWidth;
    });
    expect(b.x + b.width).toBeLessThanOrEqual(prawaPaska);
  });

  test("rozdzielnica: większe ikonki nie zjadają opisu aparatu", async ({ page }) => {
    await otworzPrzyklad(page);
    await page.getByRole("button", { name: "Rozdzielnica", exact: true }).first().click();
    const wiersz = page.getByRole("button", { name: "Edytuj aparat F1", exact: true }).locator("..");
    const opis = await wiersz.evaluate((w) => (w.children[1] as HTMLElement).getBoundingClientRect().width);
    expect(opis).toBeGreaterThan(150);
    const kosz = (await page.getByRole("button", { name: "Usuń aparat F1", exact: true }).boundingBox())!;
    expect(kosz.x + kosz.width).toBeLessThanOrEqual(375);
  });
});
