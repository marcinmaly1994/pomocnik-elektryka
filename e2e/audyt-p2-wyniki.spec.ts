import { test, expect, type Page } from "@playwright/test";

/** Pakiet „prezentacja wyników" z audytu 2026-11-04 (B11, B14). */

async function czysto(page: Page, url: string) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.goto(url);
}

test("B11: karta Doboru obwodu pokazuje przekrój ORAZ wyłącznik z biegunami i typ RCD", async ({ page }) => {
  await czysto(page, "/kalkulatory/obwod?tryb=przekroj");
  await page.getByLabel("Rodzaj obwodu").selectOption("dedykowany");
  await page.getByLabel("Zasilanie").first().selectOption("3");
  await page.getByLabel("Moc odbiornika").fill("11000");
  await page.getByLabel("Współczynnik cos φ").fill("0.9");
  await page.getByLabel("Długość trasy (w jedną stronę)").fill("30");

  const wynik = page.getByTestId("wynik-doboru");
  await expect(wynik).toContainText("Przekrój żyły");
  await expect(wynik).toContainText("2,5 mm²");
  await expect(wynik).toContainText("Wyłącznik nadprądowy");
  await expect(wynik).toContainText("B20 3P"); // Ib 17,64 A → B20 na 2,5 mm² (B2, Iz 20 A)
  await expect(wynik).toContainText("RCD typ A");
  await expect(wynik).toContainText("Zs max 2,19 Ω");
});

test("B11: obwód gniazd dostaje RCD 30 mA w karcie wyniku", async ({ page }) => {
  await czysto(page, "/kalkulatory/obwod?tryb=przekroj");
  await page.getByLabel("Rodzaj obwodu").selectOption("gniazda");
  await expect(page.getByTestId("wynik-doboru")).toContainText("RCD 30 mA typ A");
});

test("B14: porady RCD — lista kontrolna z poprawną treścią", async ({ page }) => {
  await czysto(page, "/kalkulatory/rcd");
  await expect(page.getByText(/Zasady doboru do sprawdzenia przy projekcie — bez obliczeń/)).toBeVisible();
  await expect(page.getByText(/typ AC\/A/)).toHaveCount(0);
  await expect(page.getByText(/wyłącznik przeciwprzepięciowy/)).toHaveCount(0);
  await expect(page.getByText(/ogranicznik przepięć \(SPD\)/)).toBeVisible();
  await expect(page.getByText(/Praktyka projektowa \(nie wymóg normy\)/)).toBeVisible();
});
