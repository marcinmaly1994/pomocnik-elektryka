import { test, expect, type Page } from "@playwright/test";
import { wczytajPrzyklad } from "./_flow";

/**
 * Pasek „Cofnij / Dalej” na krokach 02–04 — na telefonie i na monitorze.
 *
 * Zastąpił pływające pigułki: te nie istniały poniżej 768 px, a na monitorze leżały
 * na treści. Pasek ma być w kadrze przy każdym przewinięciu, na końcu strony stać
 * NAD stopką, a jego przyciski — na telefonie co najmniej 44 px wysokości.
 */
/** Nagłówek treści kroku: zakładki wczytują się leniwie, a pomiar paska na jeszcze
 *  niedomontowanej (krótkiej) stronie dawał położenie, którego w gotowej nie ma. */
const NAGLOWEK: Record<string, RegExp> = {
  Rozdzielnica: /Rozdzielnica elektryczna/,
  Schemat: /Schemat instalacji/,
  Kosztorys: /Kosztorys instalacji elektrycznej/,
};

async function naKroku(page: Page, kafel: string) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await wczytajPrzyklad(page, "mieszkanie");
  await page.getByRole("button", { name: kafel, exact: true }).click();
  await expect(page.getByRole("heading", { name: NAGLOWEK[kafel] }).first()).toBeVisible();
}

for (const okno of [
  { width: 360, height: 780 },
  { width: 1440, height: 900 },
]) {
  test.describe(`${okno.width} px`, () => {
    test.use({ viewport: okno });

    test("Rozdzielnica: oba kierunki, pasek w kadrze po przewinięciu do połowy", async ({ page }) => {
      await naKroku(page, "Rozdzielnica");
      const pasek = page.getByRole("navigation", { name: "Kroki projektu" });
      await expect(pasek.getByRole("button", { name: "Cofnij: Instalacja" })).toBeVisible();
      await expect(pasek.getByRole("button", { name: "Dalej: Schemat" })).toBeVisible();
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight / 2));
      // Sondowanie: treść kroku dociąga się jeszcze chwilę po nagłówku (obciążony
      // runner), a pasek ma tylko docelowo stać przy dolnej krawędzi okna.
      await expect
        .poll(async () => {
          const r = (await pasek.boundingBox())!;
          return r.y + r.height <= okno.height + 1 && r.y > okno.height / 2;
        })
        .toBe(true);
    });

    test("Kosztorys: tylko „Cofnij”, na końcu strony pasek stoi nad stopką", async ({ page }) => {
      await naKroku(page, "Kosztorys");
      const pasek = page.getByRole("navigation", { name: "Kroki projektu" });
      await expect(pasek.getByRole("button", { name: "Cofnij: Schemat" })).toBeVisible();
      await expect(pasek.getByRole("button", { name: /^Dalej:/ })).toHaveCount(0);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      const p = (await pasek.boundingBox())!;
      const stopka = (await page.locator("footer").boundingBox())!;
      expect(p.y + p.height).toBeLessThanOrEqual(stopka.y + 1);
    });

    test("klik prowadzi do sąsiedniego kroku", async ({ page }) => {
      await naKroku(page, "Schemat");
      await page.getByRole("navigation", { name: "Kroki projektu" }).getByRole("button", { name: "Dalej: Kosztorys" }).click();
      await expect(page.getByRole("heading", { name: /Kosztorys instalacji elektrycznej/ })).toBeVisible();
    });
  });
}

test.describe("telefon 360 px", () => {
  test.use({ viewport: { width: 360, height: 780 } });
  test("pasek to jeden rząd (≤ 72 px), a dokument nie jest szerszy od okna", async ({ page }) => {
    await naKroku(page, "Schemat");
    const pasek = page.getByRole("navigation", { name: "Kroki projektu" });
    await expect(pasek.getByRole("button", { name: "Dalej: Kosztorys" })).toBeVisible();
    const r = (await pasek.boundingBox())!;
    expect(r.height).toBeLessThanOrEqual(72);
    const szer = await page.evaluate(() => ({ dok: document.documentElement.scrollWidth, okno: window.innerWidth }));
    expect(szer.dok).toBeLessThanOrEqual(szer.okno);
  });
});

test.describe("telefon", () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
  test("przyciski paska mają co najmniej 44 px wysokości", async ({ page }) => {
    await naKroku(page, "Rozdzielnica");
    for (const nazwa of ["Cofnij: Instalacja", "Dalej: Schemat"]) {
      const b = (await page.getByRole("button", { name: nazwa }).boundingBox())!;
      expect(b.height, nazwa).toBeGreaterThanOrEqual(44);
    }
  });
});
