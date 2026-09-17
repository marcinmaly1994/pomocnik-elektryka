import { test, expect, type Page } from "@playwright/test";
import type Konva from "konva";
import { skipEntryScreen, otworzKatalogElementow } from "./_flow";

/**
 * Wydruk rzutu nie zależy od tego, jak użytkownik ustawił sobie kadr na ekranie.
 *
 * Eksport kadruje się do NARYSOWANEJ TREŚCI (`contentBounds`), a nie do widocznego
 * wycinka — przesunięcie widoku jest wygodą przy rysowaniu, nie decyzją o wydruku.
 * Odkąd kadr niesie stan widoku (a nie przewinięcie kontenera), scena Konvy jest
 * przesunięta o ten kadr, więc wycinek do rasteryzacji trzeba liczyć WZGLĘDEM tego
 * przesunięcia. Pominięcie go przesuwa wydruk o tyle, o ile odjechał widok.
 */

async function otworzPlan(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const pomin = page.getByRole("button", { name: "Pomiń — ustawię później" });
  if (await pomin.count()) await pomin.click();
  await page.getByRole("button", { name: "Instalacja" }).click();
  await skipEntryScreen(page);
  await page.getByRole("button", { name: "Narysuj dom samodzielnie" }).first().click();
  const rozumiem = page.getByRole("button", { name: "Rozumiem" });
  if (await rozumiem.count()) await rozumiem.click();
}

/** Pierwsza strona podglądu (rzut) jako obraz — do porównania dwóch eksportów. */
async function rzutZPodgladu(page: Page) {
  const strony = page.locator("[data-podglad-stron] canvas");
  await page.getByRole("button", { name: "Rzut do PDF" }).click();
  await expect(strony.first()).toBeVisible({ timeout: 30000 });
  const obraz = await strony.first().evaluate((c) => (c as HTMLCanvasElement).toDataURL());
  await page.getByRole("dialog").getByRole("button", { name: "Zamknij" }).click();
  return obraz;
}

test("przesunięcie widoku nie rusza wydruku rzutu", async ({ page }) => {
  await otworzPlan(page);

  await otworzKatalogElementow(page);
  await page.getByRole("button", { name: /Gniazdo 230 V/ }).first().click();
  const okno = page.locator("[data-testid=plan-okno]").first();
  const box = (await okno.boundingBox())!;
  await page.mouse.click(box.x + 200, box.y + 160);
  await page.mouse.click(box.x + 320, box.y + 240);
  await page.getByRole("button", { name: "Zaznacz", exact: true }).click();
  await page.waitForTimeout(300);

  const przedPrzesunieciem = await rzutZPodgladu(page);

  // Przesuwamy kadr wciśniętą rolką — tak jak przy poprawianiu sobie widoku.
  const srodek = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(srodek.x, srodek.y);
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(srodek.x - 180, srodek.y - 120, { steps: 8 });
  await page.mouse.up({ button: "middle" });
  await page.waitForTimeout(300);

  const przesuniecieSceny = await page.evaluate(
    () => (window as unknown as { Konva: { stages: Konva.Stage[] } }).Konva.stages[0].x(),
  );
  expect(Math.abs(przesuniecieSceny)).toBeGreaterThan(50); // widok naprawdę odjechał

  expect(await rzutZPodgladu(page)).toBe(przedPrzesunieciem);
});
