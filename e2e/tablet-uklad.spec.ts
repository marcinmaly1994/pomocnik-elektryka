import { test, expect } from "@playwright/test";
import { wczytajPrzyklad } from "./_flow";

/**
 * Tablet w pionie: rzut stoi OBOK karty narzędzi, a nie pod nią.
 *
 * Kolumna płótna miała podstawę 480 px, a karta narzędzi ma 343 px — przy 768–850 px
 * (np. iPad w pionie) suma nie mieściła się w rzędzie i płótno zawijało się POD kartę.
 * Zmierzone przy 820 × 1180: rzut od 861 px, wysokość 360 px (dolna granica), pasek
 * stanu pod krawędzią ekranu, a obok karty pustka.
 */
for (const okno of [
  { width: 820, height: 1180 },
  { width: 768, height: 1024 },
]) {
  test(`tablet ${okno.width}×${okno.height}: rzut obok karty narzędzi, pasek stanu w kadrze`, async ({ page }) => {
    await page.setViewportSize(okno);
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await wczytajPrzyklad(page, "mieszkanie");

    const plotno = page.locator("[data-plan-okno]");
    await expect(plotno).toBeVisible();
    const karta = (await page.getByTestId("karta-narzedzi").boundingBox())!;
    const rzut = (await plotno.boundingBox())!;
    expect(rzut.x, "rzut ma stać na prawo od karty").toBeGreaterThanOrEqual(karta.x + karta.width);
    expect(Math.abs(rzut.y - karta.y), "…w tym samym rzędzie").toBeLessThan(10);
    expect(rzut.height).toBeGreaterThan(400);
    const stan = (await page.getByLabel("Stan projektu").boundingBox())!;
    expect(stan.y + stan.height).toBeLessThanOrEqual(okno.height);
  });
}
