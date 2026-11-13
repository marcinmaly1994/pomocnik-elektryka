import { test, expect, type Page } from "@playwright/test";
import { wczytajPrzyklad } from "./_flow";

/**
 * Kosztorys wycenia rozdzielnicę, którą użytkownik ma — a nie kopię odtworzoną z rzutu.
 *
 * Kosztorys liczył wyłączniki z obwodów policzonych z rzutu, więc zmiany w Rozdzielnicy
 * do niego nie trafiały: po usunięciu aparatu F7 rozdzielnica miała 13 aparatów, a
 * kosztorys dalej 10 wyłączników 1-faz.; dołożony ogranicznik przepięć nie był wyceniany
 * wcale. Nagłówek schematu też dalej mówił „11 obwodów".
 */

async function ilosc(page: Page, pozycja: string): Promise<string | null> {
  return page.evaluate((p) => {
    const w = [...document.querySelectorAll("tr")].find((t) => t.textContent?.includes(p));
    const i = w?.querySelector("input");
    return i ? i.value || i.placeholder : null;
  }, pozycja);
}

async function zakladka(page: Page, nazwa: RegExp | string) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole("button", { name: nazwa, exact: typeof nazwa === "string" }).first().click();
}

test("zmiany w Rozdzielnicy trafiają do kosztorysu i do nagłówka schematu", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await wczytajPrzyklad(page, "mieszkanie");

  await zakladka(page, /Kosztorys/);
  await expect.poll(() => ilosc(page, "Wyłącznik nadprądowy 1-faz.")).toBe("10");
  // Przykład ma już jeden ogranicznik dołożony ręcznie (przegląd 12.11.2026, pkt 4).
  expect(await ilosc(page, "Ogranicznik przepięć SPD")).toBe("1");

  await zakladka(page, "Rozdzielnica");
  await page.getByRole("button", { name: "Usuń aparat F7", exact: true }).click();
  const potwierdz = page.getByRole("dialog").getByRole("button", { name: /Usuń/ });
  if (await potwierdz.count()) await potwierdz.first().click();
  const wybor = page.locator("select").filter({ has: page.locator('option:has-text("Ogranicznik przepięć (SPD)")') });
  await wybor.selectOption({ label: "Ogranicznik przepięć (SPD)" });
  await page.getByRole("button", { name: "Dodaj", exact: true }).click();

  await zakladka(page, /Kosztorys/);
  await expect.poll(() => ilosc(page, "Wyłącznik nadprądowy 1-faz.")).toBe("9");
  expect(await ilosc(page, "Ogranicznik przepięć SPD")).toBe("2");
  // Bez ceny domyślnej — kosztorys mówi wprost, że trzeba ją uzupełnić.
  await expect(page.getByText(/Ogranicznik przepięć SPD/).last()).toBeVisible();

  await zakladka(page, /Schemat/);
  await expect(page.getByText(/10 obwodów, 2 różnicówki/)).toBeVisible();
});
