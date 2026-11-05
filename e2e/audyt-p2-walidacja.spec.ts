import { test, expect, type Page } from "@playwright/test";

/** Pakiet „walidacja danych" z audytu 2026-11-04 (B10, B12, B15–B17). */

async function czysto(page: Page, url: string) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.goto(url);
}

test("B10: bilans mocy odrzuca moc ujemną i ks > 1, a cos φ podnosi prąd", async ({ page }) => {
  await czysto(page, "/kalkulatory/moc");
  await expect(page.getByText("48,7 A")).toBeVisible(); // 11 200 W / 230 V przy cos φ = 1

  await page.getByLabel("Współczynnik mocy cos φ").fill("0.8");
  await expect(page.getByText("60,9 A")).toBeVisible(); // 11 200 / (230 · 0,8)

  await page.getByLabel("Moc: Kuchenka elektryczna").fill("-5000");
  await page.getByLabel("Współczynnik jednoczesności (ks)").fill("3");
  const bledy = page.getByTestId("bledy-bilansu");
  await expect(bledy).toContainText("„Kuchenka elektryczna” nie może być ujemna");
  await expect(bledy).toContainText("ks musi mieścić się");
  // wynik nie udaje, że jest poprawny
  await expect(page.getByText("Moc zapotrzebowana", { exact: true })).toHaveCount(0);
});

test("B12: ujemny pomiar izolacji blokuje PDF i mówi, gdzie jest błąd", async ({ page }) => {
  await czysto(page, "/protokoly/izolacja");
  await page.getByRole("button", { name: "Dodaj wiersz" }).click();
  await page.getByLabel("L1-N, pozycja 1").fill("0.8");
  await page.getByLabel("N-PE, pozycja 1").fill("-3");

  await expect(page.getByTestId("ujemne-wartosci")).toContainText("pozycja 1 (N-PE)");
  await expect(page.getByText("wartość ujemna", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Pobierz protokół (PDF)" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Podgląd" })).toBeDisabled();

  await page.getByLabel("N-PE, pozycja 1").fill("300");
  await expect(page.getByTestId("ujemne-wartosci")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Pobierz protokół (PDF)" })).toBeEnabled();
});

test("B15 + B17: spadek napięcia — ujemny prąd i absurdalna długość mają własne komunikaty", async ({ page }) => {
  await czysto(page, "/kalkulatory/spadek");
  await page.getByLabel("Prąd obciążenia (Ib)").fill("-5");
  await expect(page.getByText("Prąd obciążenia nie może być ujemny.")).toBeVisible();

  await page.getByLabel("Prąd obciążenia (Ib)").fill("16");
  await page.getByLabel("Długość trasy (w jedną stronę)").fill("1000000");
  await expect(page.getByText(/nie mniejszy niż napięcie zasilania/)).toBeVisible();
  await expect(page.getByText(/napięcie u odbiornika -/)).toHaveCount(0);
});

test("B16: pętla zwarcia — In z szeregu, ujemna Zs ma komunikat", async ({ page }) => {
  await czysto(page, "/kalkulatory/petla");
  const opcje = page.getByLabel("Prąd znamionowy In").locator("option");
  await expect(opcje.first()).toHaveText("6 A");
  await expect(opcje).toHaveCount(10);

  await page.getByLabel("Zmierzona Zs").fill("-1");
  await expect(page.getByText(/Impedancja pętli zwarcia nie może być ujemna/)).toBeVisible();
});
