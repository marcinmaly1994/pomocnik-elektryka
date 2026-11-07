import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { wczytajPrzyklad } from "./_flow";

/**
 * Rzut w PDF w normowej skali liczbowej i na wybranym arkuszu (F10 z audytu 5.11.2026).
 * Przykładowy dom ma skalibrowaną skalę, więc tabliczka musi podać „1:N", a wybór A3
 * zmienia rozmiar kartki w pobranym pliku.
 */

async function pobierzPdf(page: Page): Promise<string> {
  const [plik] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("dialog").getByRole("button", { name: /Pobierz PDF/ }).click(),
  ]);
  const bajty = readFileSync((await plik.path())!);
  return Buffer.from(bajty).toString("latin1");
}

test("rzut domu: skala liczbowa w tabliczce, A3 zmienia arkusz", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await wczytajPrzyklad(page, "dom");
  await page.waitForTimeout(1500);
  const r = page.getByRole("button", { name: "Rozumiem" });
  if (await r.count()) await r.click();

  await page.getByRole("button", { name: "Rzut do PDF" }).click();
  await expect(page.locator("[data-podglad-stron] canvas").first()).toBeVisible({ timeout: 30000 });

  const a4 = await pobierzPdf(page);
  expect(a4).toContain("/MediaBox [0 0 841.89 595.28]");
  const skalaA4 = Number(a4.match(/\(1:(\d+)\) Tj/)![1]);
  expect([50, 75, 100, 150, 200]).toContain(skalaA4);

  await page.getByRole("combobox", { name: "Arkusz" }).selectOption("A3");
  // podgląd przebudowuje się po zmianie wariantu — czekamy, aż przycisk znów działa
  await page.waitForTimeout(500);
  await expect(page.locator("[data-podglad-stron] canvas").first()).toBeVisible({ timeout: 30000 });
  const a3 = await pobierzPdf(page);
  expect(a3).toContain("/MediaBox [0 0 1190.55 841.89]");
  const skalaA3 = Number(a3.match(/\(1:(\d+)\) Tj/)![1]);
  // większy arkusz — skala co najmniej tak samo dokładna, zwykle o stopień lepsza
  expect(skalaA3).toBeLessThanOrEqual(skalaA4);
});
