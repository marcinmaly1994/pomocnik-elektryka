import { test, expect, type Page } from "@playwright/test";

/**
 * Struktura dostępności: landmark treści i nazwy pól wyboru.
 *
 * Audyt axe-core wykazał brak elementu `<main>` (ponad 600 węzłów „poza landmarkami")
 * i dwa pola wyboru bez nazwy w formularzu dodawania aparatu — czytnik ekranu czytał je
 * jako „lista rozwijana" bez żadnej wskazówki, co wybiera.
 */

async function otworzPrzyklad(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Zobacz gotowy przykład" }).click();
  await page.getByRole("button", { name: /Mieszkanie 70/ }).click();
}

test("każda zakładka ma dokładnie jeden landmark main", async ({ page }) => {
  await otworzPrzyklad(page);
  await expect(page.getByRole("main")).toHaveCount(1);
  for (const zakladka of ["Rozdzielnica", "Schemat", "Kosztorys"]) {
    await page.getByRole("button", { name: new RegExp(zakladka) }).first().click();
    await expect(page.getByRole("main")).toHaveCount(1);
  }
  await page.getByRole("button", { name: "Kalkulatory" }).first().click();
  await expect(page.getByRole("main")).toHaveCount(1);
  await page.getByRole("button", { name: "Protokoły pomiarowe" }).first().click();
  await expect(page.getByRole("main")).toHaveCount(1);
});

test("formularz dodawania aparatu: pola wyboru mają nazwy", async ({ page }) => {
  await otworzPrzyklad(page);
  await page.getByRole("button", { name: /Rozdzielnica/ }).first().click();
  await expect(page.getByRole("combobox", { name: "Rodzaj aparatu do dodania" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Prąd znamionowy dodawanego aparatu" })).toBeVisible();
});
