import { test, expect, type Page } from "@playwright/test";

/**
 * Werdykt protokołu przy niekompletnych danych.
 *
 * Wiersze bez wyników były pomijane, więc jeden wypełniony pomiar izolacji na trzy
 * wiersze albo jedna pozycja oględzin „zgodne" na dwanaście dawały „Wynik pozytywny —
 * instalacja w badanym zakresie spełnia wymagania" — w dokumencie formalnym.
 */

async function otworz(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Protokoły pomiarowe" }).first().click();
  await expect(page.getByTestId("karta-protokolu")).toBeVisible();
}

test("izolacja: 1 z 3 wierszy wypełniony — niekompletny, a nie pozytywny", async ({ page }) => {
  await otworz(page);
  await page.getByRole("button", { name: /^Pomiar rezystancji izolacji/ }).first().click();
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: /Dodaj wiersz/ }).click();
  await page.getByLabel("L1-N, pozycja 1").fill("250");
  await page.getByLabel("L1-PE/PEN, pozycja 1").fill("300");
  await page.getByLabel("N-PE, pozycja 1").fill("280");

  await expect(page.getByTestId("protokol-niekompletny")).toContainText("Niekompletny — 2 wiersze bez wyników");
  await expect(page.getByText("Wynik pozytywny")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Pomiar rezystancji izolacji/ })).toContainText("niekompletny");

  // Usunięcie pustych wierszy domyka protokół.
  await page.getByRole("button", { name: "Usuń wiersz 3" }).click();
  await page.getByRole("button", { name: "Usuń wiersz 2" }).click();
  await expect(page.getByText("Wynik pozytywny")).toBeVisible();
});

test("oględziny: jedna pozycja zgodna na dwanaście — niekompletny", async ({ page }) => {
  await otworz(page);
  await page.getByRole("button", { name: /^Oględziny instalacji/ }).first().click();
  await page.getByRole("button", { name: /Wczytaj listę kontrolną/ }).click();
  await page.getByRole("button", { name: "zgodne", exact: true }).first().click();
  await expect(page.getByTestId("protokol-niekompletny")).toContainText("Niekompletny — 11 pozycji bez oceny");
  await expect(page.getByText("Wynik pozytywny")).toHaveCount(0);
});
