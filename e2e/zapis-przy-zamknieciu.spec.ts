import { test, expect } from "@playwright/test";
import { wczytajPrzyklad } from "./_flow";

/**
 * Zmiana zrobiona tuż przed zamknięciem albo odświeżeniem karty nie może przepaść.
 *
 * Autozapis chodzi 600 ms po ostatniej zmianie — odświeżenie w tym oknie gubiło ją
 * bez śladu (przegląd 12.11.2026, pkt 2; widoczne przy testach „Ostatnio używanych",
 * gdzie odświeżenie zaraz po wczytaniu przykładu wracało do pustego projektu).
 */
test("odświeżenie zaraz po zmianie nie gubi jej — zapis przy chowaniu strony", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Instalacja" }).click();
  await wczytajPrzyklad(page, "mieszkanie");
  await expect(page.getByText("To jest projekt przykładowy")).toBeVisible();
  // Bez czekania na autozapis.
  await page.reload();
  await expect(page.getByText("To jest projekt przykładowy")).toBeVisible();
  await expect(page.getByText("Powierzchnia: 70,00 m²")).toBeVisible();
});
