import { test, expect, type Page } from "@playwright/test";
import { skipEntryScreen } from "./_flow";

/**
 * Kadr, w którym otwiera się rysunek.
 *
 * Arkusz to 50 × 35 m przy rysowaniu od zera. Dom o 140 m² zajmuje z niego jedną
 * ósmą, więc dopasowanie do ARKUSZA otwierało rysunek wielkości znaczka pocztowego
 * w morzu pustej siatki — od tego zaczęła się cała przebudowa płótna. Teraz kadr
 * siada na tym, co narysowane.
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

/** Jak bardzo narysowane pomieszczenia wypełniają okno planu (0–1) i gdzie leży ich środek. */
async function kadr(page: Page) {
  const box = (await page.locator("[data-testid=plan-okno]").first().boundingBox())!;
  const dane = await page.evaluate(() => {
    const raw = localStorage.getItem("pomocnikelektryka_projekt_" + localStorage.getItem("pomocnikelektryka_projekt_biezacy"));
    const obrysy = raw ? (JSON.parse(raw).draft.roomShapes as { points: { x: number; y: number }[] }[]) : [];
    const punkty = obrysy.flatMap((o) => o.points);
    const s = (window as unknown as {
      Konva: { stages: { scaleX(): number; x(): number; y(): number }[] };
    }).Konva.stages[0];
    return { punkty, skala: s.scaleX(), przesX: s.x(), przesY: s.y() };
  });
  expect(dane.punkty.length, "test wymaga narysowanego pomieszczenia").toBeGreaterThan(0);

  const naEkranie = dane.punkty.map((p) => ({
    x: p.x * dane.skala + dane.przesX,
    y: p.y * dane.skala + dane.przesY,
  }));
  const xs = naEkranie.map((p) => p.x);
  const ys = naEkranie.map((p) => p.y);
  const szer = Math.max(...xs) - Math.min(...xs);
  const wys = Math.max(...ys) - Math.min(...ys);
  return {
    wypelnienie: Math.max(szer / box.width, wys / box.height),
    srodek: { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 },
    okno: { w: box.width, h: box.height },
  };
}

test("otwarty projekt pokazuje RYSUNEK, a nie arkusz z rysunkiem w rogu", async ({ page }) => {
  await otworzPlan(page);

  // Pokój w rogu arkusza — najgorszy przypadek dla dopasowania do ARKUSZA: zajmuje
  // z niego ułamek, więc przy starym kadrowaniu otwierał się jako znaczek w rogu.
  await page.getByRole("button", { name: "Narysuj Pomieszczenie", exact: true }).click();
  await page.getByRole("button", { name: "Prostokąt" }).click();
  const box = (await page.locator("[data-testid=plan-okno]").first().boundingBox())!;
  await page.mouse.move(box.x + 40, box.y + 40);
  await page.mouse.down();
  await page.mouse.move(box.x + 340, box.y + 260, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByText("Nazwij pomieszczenie")).toBeVisible();
  await page.getByRole("button", { name: "Dodaj pomieszczenie" }).click();
  await page.waitForTimeout(900); // debounce autozapisu

  // W trakcie rysowania kadr NIE ucieka — rysunek zostaje tam, gdzie go postawiono.
  const wTrakcie = await kadr(page);
  expect(wTrakcie.wypelnienie).toBeLessThan(0.5);

  await page.reload();
  await page.waitForTimeout(500);

  const poOtwarciu = await kadr(page);
  expect(poOtwarciu.wypelnienie, "rysunek ma wypełnić okno, a nie tonąć w arkuszu").toBeGreaterThan(0.6);
  // I leży na środku okna, a nie przy krawędzi. Tolerancja to 10% wymiaru okna, bo
  // wyśrodkowanie liczy się w chwili kadrowania, a układ strony dochodzi do siebie
  // jeszcze chwilę potem (baner nad rysunkiem zmienia wysokość płótna). Zmierzone
  // odchylenie: ~22 px przy oknie 600 px, czyli niewidoczne — ale nie zero.
  expect(Math.abs(poOtwarciu.srodek.x - poOtwarciu.okno.w / 2)).toBeLessThan(poOtwarciu.okno.w * 0.1);
  expect(Math.abs(poOtwarciu.srodek.y - poOtwarciu.okno.h / 2)).toBeLessThan(poOtwarciu.okno.h * 0.1);
});

test("rysowanie nie przestawia kadru pod ręką", async ({ page }) => {
  await otworzPlan(page);
  await page.getByRole("button", { name: "Narysuj Pomieszczenie", exact: true }).click();
  await page.getByRole("button", { name: "Prostokąt" }).click();
  const box = (await page.locator("[data-testid=plan-okno]").first().boundingBox())!;

  const scena = () =>
    page.evaluate(() => {
      const s = (window as unknown as {
        Konva: { stages: { scaleX(): number; x(): number; y(): number }[] };
      }).Konva.stages[0];
      return { skala: s.scaleX(), x: Math.round(s.x()), y: Math.round(s.y()) };
    });

  const przed = await scena();

  // Dorysowanie pomieszczenia zmienia szerokość panelu bocznego (dochodzi lista), co
  // budzi obserwatora rozmiaru. Kadr ma to przeżyć bez drgnięcia — inaczej rysunek
  // uciekałby spod kursora dokładnie w chwili, gdy się go używa.
  await page.mouse.move(box.x + 60, box.y + 60);
  await page.mouse.down();
  await page.mouse.move(box.x + 200, box.y + 160, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByText("Nazwij pomieszczenie")).toBeVisible();
  await page.getByRole("button", { name: "Dodaj pomieszczenie" }).click();
  await page.waitForTimeout(600);

  expect(await scena()).toEqual(przed);
});
