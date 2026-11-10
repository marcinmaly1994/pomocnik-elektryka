import { test, expect } from "@playwright/test";
import { wczytajPrzyklad } from "./_flow";

/**
 * Cztery etapy widać na telefonie NARAZ, bez przewijania paska w bok.
 *
 * Do PR 3 pasek etapów przewijał się poziomo: przy 375 px widać było 01 i kawałek
 * 02, a etapy 03–04 tylko po przesunięciu palcem. Teraz cztery równe kolumny.
 */
for (const szer of [360, 375, 430]) {
  test(`${szer} px: wszystkie cztery etapy w kadrze, aktywny wyróżniony`, async ({ page }) => {
    await page.setViewportSize({ width: szer, height: 812 });
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await wczytajPrzyklad(page, "mieszkanie");
    for (const nazwa of ["Instalacja", "Rozdzielnica", "Schemat", "Kosztorys"]) {
      const k = (await page.getByRole("button", { name: nazwa, exact: true }).boundingBox())!;
      expect(k.x, nazwa).toBeGreaterThanOrEqual(0);
      expect(k.x + k.width, nazwa).toBeLessThanOrEqual(szer);
      expect(k.height, nazwa).toBeGreaterThanOrEqual(44);
    }
    const pasek = page.getByTestId("pasek-etapow");
    expect(await pasek.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await expect(page.getByRole("button", { name: "Instalacja", exact: true })).toHaveAttribute("aria-current", "step");
  });
}
