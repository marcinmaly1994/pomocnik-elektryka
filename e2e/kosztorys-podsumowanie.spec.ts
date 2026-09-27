import { test, expect, type Page } from "@playwright/test";
import { wczytajPrzyklad } from "./_flow";

/**
 * Kosztorys na komputerze.
 *
 * Kwota brutto stała wyłącznie pod tabelą, ok. 1700 px pod nagłówkiem — pierwsza
 * rzecz, której się tu szuka, była ostatnią, jaką się widziało. Teraz podsumowanie
 * stoi też na górze, z tym samym podpisem co suma na dole.
 *
 * Kolumna „Wartość" pisała „90.00" z kropką, a cena i sumy — „2279,50" z przecinkiem.
 */

async function otworz(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await wczytajPrzyklad(page, "mieszkanie");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole("button", { name: /Kosztorys/ }).first().click();
  // Zakładka ładuje się leniwie — czekamy na tabelę.
  await expect(page.locator('input[aria-label^="Wartość pozycji:"]').first()).toBeVisible();
}

test("podsumowanie z kwotą brutto stoi na górze, bez przewijania, i zgadza się z sumą na dole", async ({ page }) => {
  await otworz(page);
  const gora = page.getByTestId("podsumowanie-kosztorysu");
  await expect(gora).toBeInViewport();
  await expect(gora).toContainText("RAZEM brutto — sam materiał");

  const kwotaGora = (await gora.locator(".text-copper").textContent())!.trim();
  const kwotaDol = (await page.locator("tfoot tr").last().locator("td").last().textContent())!.trim();
  expect(kwotaGora).toBe(kwotaDol);
  await expect(gora).toContainText(/Bez ceny\s*4 pozycje — poza sumą/);
});

test("wartości w tabeli z polskim przecinkiem dziesiętnym", async ({ page }) => {
  await otworz(page);
  const placeholdery = await page.locator('input[aria-label^="Wartość pozycji:"]').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).placeholder));
  expect(placeholdery.length).toBeGreaterThan(10);
  for (const p of placeholdery) expect(p).toMatch(/^\d+,\d{2}$/);
});
