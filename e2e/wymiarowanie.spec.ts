import { test, expect, type Page } from "@playwright/test";

/**
 * Tryb wymiarowania: długości WSZYSTKICH ścian i wymiary prostokątnych pomieszczeń.
 *
 * Do tej pory wymiary widać było tylko w trakcie rysowania i przy zaznaczonej ścianie,
 * więc rzut wydrukowany z aplikacji nie miał na sobie ani jednego wymiaru. Detekcja
 * prostokąta ma testy jednostkowe (`rectangleSizeM`) — tutaj chodzi o to, czy
 * przełącznik faktycznie odsłania i chowa etykiety na płótnie.
 */

/** Etykiety wymiarowe wprost ze sceny Konvy — na canvasie nie ma DOM-u do sprawdzenia. */
async function etykietyWymiarow(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const k = (window as unknown as { Konva: { stages: { find(sel: string): { text(): string }[] }[] } }).Konva;
    return k.stages[0]
      .find("Text")
      .map((t) => t.text())
      .filter((t) => /\d+,\d{2}( ×|) ?.*m$/.test(t));
  });
}

/** Prostokątny dom 25 × 17 m z dwoma prostokątnymi pokojami — wstrzyknięty wprost
 *  do zapisu, bo test dotyczy WYŚWIETLANIA wymiarów, nie rysowania geometrii
 *  (to ma własne specy w wall-drawing i room-drawing). */
async function planZGeometria(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByText("Zacznij projektować instalację")).toBeVisible();
  await page.getByRole("button", { name: "Narysuj dom samodzielnie" }).click();
  const rozumiem = page.getByRole("button", { name: "Rozumiem" });
  if (await rozumiem.count()) await rozumiem.click();
  await page.waitForTimeout(900);

  await page.evaluate(() => {
    const K = "pomocnikelektryka_projekt_autosave";
    const a = JSON.parse(localStorage.getItem(K)!);
    a.scales = { f1: 0.05 };
    a.draft.walls = [
      { id: "w1", floor: "f1", thickness: 5, points: [
        { x: 120, y: 120 }, { x: 620, y: 120 }, { x: 620, y: 460 }, { x: 120, y: 460 }, { x: 120, y: 120 },
      ] },
    ];
    a.draft.roomShapes = [
      { id: "r1", floor: "f1", name: "Kuchnia", color: "#C1793F", type: "kuchnia",
        points: [{ x: 140, y: 140 }, { x: 360, y: 140 }, { x: 360, y: 300 }, { x: 140, y: 300 }] },
      // Litera L — nie dostanie podpisu „a × b", bo taki prostokąt nie istnieje.
      { id: "r2", floor: "f1", name: "Salon", color: "#3B8C63", type: "salon",
        points: [{ x: 380, y: 140 }, { x: 600, y: 140 }, { x: 600, y: 300 }, { x: 500, y: 300 }, { x: 500, y: 440 }, { x: 380, y: 440 }] },
    ];
    localStorage.setItem(K, JSON.stringify(a));
  });
  await page.reload();
  await page.getByRole("button", { name: "Instalacja" }).click();
  await page.waitForTimeout(500);
}

test("przełącznik odsłania wymiary wszystkich ścian i chowa je z powrotem", async ({ page }) => {
  await planZGeometria(page);

  // Bez trybu wymiarowania rzut jest czysty — to domyślny stan przy rysowaniu.
  expect(await etykietyWymiarow(page)).toEqual([]);

  await page.getByRole("button", { name: "Pokaż wymiary" }).click();
  const wymiary = await etykietyWymiarow(page);
  // Cztery boki obrysu domu 25 × 17 m.
  expect(wymiary.filter((t) => t === "25,00 m")).toHaveLength(2);
  expect(wymiary.filter((t) => t === "17,00 m")).toHaveLength(2);

  await page.getByRole("button", { name: "Ukryj wymiary" }).click();
  expect(await etykietyWymiarow(page)).toEqual([]);
});

test("prostokątne pomieszczenie dostaje podpis „a × b”, a wielobok nie", async ({ page }) => {
  await planZGeometria(page);
  await page.getByRole("button", { name: "Pokaż wymiary" }).click();

  const wymiary = await etykietyWymiarow(page);
  // Kuchnia: 220 × 160 jedn. przy 0,05 m/jedn.
  expect(wymiary).toContain("11,00 × 8,00 m");
  // Salon jest literą L — żaden podpis „a × b" go nie opisuje, więc go nie ma.
  expect(wymiary.filter((t) => t.includes("×"))).toHaveLength(1);
});
