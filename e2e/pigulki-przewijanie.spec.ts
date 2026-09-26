import { test, expect, type Page } from "@playwright/test";
import { wczytajPrzyklad } from "./_flow";

/**
 * Pływające pigułki „Cofnij/Dalej" nie leżą na treści, którą ktoś właśnie czyta.
 *
 * Są przypięte w dolnych rogach okna, więc przy przewijaniu długiej tabeli Kosztorysu
 * albo listy aparatów Rozdzielnicy zasłaniały pierwszą kolumnę — nazwy pozycji — także
 * po zatrzymaniu przewijania. Teraz chowają się przy przewijaniu w dół, a wracają przy
 * przewinięciu w górę i na końcu strony (tam „Dalej" jest najbardziej potrzebne).
 */

async function przewin(page: Page, y: number) {
  await page.evaluate((y) => window.scrollTo(0, y), y);
}

test("pigułki chowają się przy czytaniu w dół i wracają w górę oraz na końcu", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await wczytajPrzyklad(page, "mieszkanie");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole("button", { name: /Kosztorys/ }).first().click();
  // Zakładka ładuje się leniwie — bez tabeli strona nie ma jeszcze czego przewijać.
  await expect(page.getByLabel(/^Wartość pozycji: /).first()).toBeVisible();

  const cofnij = page.getByRole("button", { name: /^Cofnij: / });
  await expect(cofnij).toBeInViewport();

  await przewin(page, 300);
  await przewin(page, 700);
  await expect(cofnij).not.toBeInViewport();

  await przewin(page, 600);
  await expect(cofnij).toBeInViewport();

  await przewin(page, 900);
  await expect(cofnij).not.toBeInViewport();
  await przewin(page, 1e6);
  await expect(cofnij).toBeInViewport();
});

test("schowana pigułka wraca, gdy dojdzie do niej fokus z klawiatury", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await wczytajPrzyklad(page, "mieszkanie");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole("button", { name: /Kosztorys/ }).first().click();
  // Zakładka ładuje się leniwie — bez tabeli strona nie ma jeszcze czego przewijać.
  await expect(page.getByLabel(/^Wartość pozycji: /).first()).toBeVisible();

  const cofnij = page.getByRole("button", { name: /^Cofnij: / });
  await przewin(page, 300);
  await przewin(page, 700);
  await expect(cofnij).not.toBeInViewport();

  // Fokus z klawiatury: po naciśnięciu klawisza przeglądarka traktuje fokus jako
  // klawiaturowy (:focus-visible), tak jak przy dojściu Tabem.
  await page.keyboard.press("Shift");
  await cofnij.focus();
  await expect(cofnij).toBeFocused();
  await expect(cofnij).toBeInViewport();
});
