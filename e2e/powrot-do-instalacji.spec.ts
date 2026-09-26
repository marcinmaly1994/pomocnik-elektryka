import { test, expect, type Page } from "@playwright/test";
import { wczytajPrzyklad } from "./_flow";

/**
 * Powrót na „Instalację" z innej zakładki ląduje na edytorze — odświeżenie nie.
 *
 * Wcześniej powrót zostawiał stronę przy nagłówku: z rzutu widać było ok. 240 px,
 * a pasek stanu leżał pod krawędzią ekranu (płótno liczy się na telefonie od
 * początku edytora, więc bez przewinięcia jego dół wypada poza kadr).
 *
 * Emulacja telefonu (`isMobile`) — patrz edytor-telefon-zwarty.spec.ts, dlaczego
 * samo wąskie okno nie wystarcza.
 */

test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

/** Czeka, aż edytor stanie u góry kadru, i mierzy dół paska stanu. */
async function edytorUGory(page: Page) {
  await expect
    .poll(() => page.evaluate(() => Math.round(document.querySelector("[data-plan-okno]")?.getBoundingClientRect().top ?? 9999)), {
      timeout: 4000,
    })
    .toBeLessThan(200);
  await page.waitForTimeout(300);
  return page.evaluate(() => document.querySelector('[aria-label="Stan projektu"]')!.getBoundingClientRect().bottom);
}

test("powrót na „Instalację” z Rozdzielnicy przewija do edytora, odświeżenie nie", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await wczytajPrzyklad(page, "mieszkanie");
  await edytorUGory(page);

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole("button", { name: "Rozdzielnica", exact: true }).click();
  await expect(page.getByRole("img", { name: "Widok czołowy rozdzielnicy" })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole("button", { name: /Instalacja/ }).first().click();

  expect(await edytorUGory(page)).toBeLessThanOrEqual(812);

  // Odświeżenie to nie nawigacja w aplikacji — strona nie ma skakać.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.reload();
  await expect(page.locator("[data-plan-okno]")).toBeVisible();
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => window.scrollY)).toBeLessThan(100);
});
