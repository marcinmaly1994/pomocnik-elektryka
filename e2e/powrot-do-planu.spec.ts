import { test, expect, type Page } from "@playwright/test";
import type Konva from "konva";
import { skipEntryScreen } from "./_flow";

/**
 * Droga powrotna na płótnie bez granic.
 *
 * Odkąd rysować można wszędzie, da się też odjechać widokiem dowolnie daleko od
 * rysunku — i wtedy „Dopasuj widok do planu" jest jedynym sposobem, żeby wrócić.
 * Przycisk ustawiał wyłącznie powiększenie, bo dopóki kadr wyznaczało przewinięcie
 * kontenera, przewinięcie i tak było przycięte do arkusza i nie dało się zgubić.
 * Teraz kadr to osobny stan, więc dopasowanie musi ruszyć również jego.
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

/** Przesunięcie sceny — zero znaczy „arkusz leży w lewym górnym rogu okna". */
async function przesuniecieSceny(page: Page) {
  return page.evaluate(() => {
    const s = (window as unknown as { Konva: { stages: Konva.Stage[] } }).Konva.stages[0];
    // `+ 0` gasi ujemne zero: Math.round(-0.2) daje -0, a porownanie z 0 by tego nie przeszlo.
    return { x: Math.round(s.x()) + 0, y: Math.round(s.y()) + 0 };
  });
}

test("„Dopasuj widok” sprowadza kadr z powrotem na plan", async ({ page }) => {
  await otworzPlan(page);
  const okno = page.locator("[data-testid=plan-okno]").first();
  const box = (await okno.boundingBox())!;

  // Odjeżdżamy daleko — tak daleko, że arkusza nie widać już wcale.
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  for (let i = 0; i < 3; i++) {
    await page.mouse.move(start.x, start.y);
    await page.mouse.down({ button: "middle" });
    await page.mouse.move(start.x - 300, start.y - 200, { steps: 6 });
    await page.mouse.up({ button: "middle" });
  }
  await page.waitForTimeout(200);
  const zgubiony = await przesuniecieSceny(page);
  expect(Math.abs(zgubiony.x)).toBeGreaterThan(box.width / 2);

  await page.getByRole("button", { name: "Dopasuj widok do planu" }).click();
  await page.waitForTimeout(400);

  expect(await przesuniecieSceny(page)).toEqual({ x: 0, y: 0 });
});
