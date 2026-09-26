import { test, expect, type Page } from "@playwright/test";
import { skipEntryScreen } from "./_flow";

/**
 * Karty zaznaczonej ściany i zaznaczonego pomieszczenia w panelu „Zaznacz".
 *
 * Panel pokazuje opcje tego, czym się pracuje. Ściana miała tam dotąd tylko grubość
 * i długości odcinków, a pomieszczenie — nic: nazwa, typ, powierzchnia i usuwanie były
 * na liście w „Narysuj pomieszczenie" i w menu pod prawym przyciskiem.
 */

async function planBoxAndZoom(page: Page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  const box = (await page.locator("[data-testid=plan-okno]").first().boundingBox())!;
  const zoom = await page.evaluate(() => {
    const k = (window as unknown as { Konva?: { stages: { scaleX(): number }[] } }).Konva;
    return k?.stages[0]?.scaleX() ?? 1;
  });
  return { box, zoom };
}

async function openPlan(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Instalacja" }).click();
  await skipEntryScreen(page);
}

function projekt(page: Page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem("pomocnikelektryka_projekt_" + localStorage.getItem("pomocnikelektryka_projekt_biezacy"));
    return JSON.parse(raw!).draft as {
      walls: { points: { x: number; y: number }[] }[];
      roomShapes: { name: string; type?: string; points: { x: number; y: number }[] }[];
    };
  });
}

test("karta ściany: długość, liczba odcinków i „Usuń ścianę”", async ({ page }) => {
  await openPlan(page);
  await page.getByRole("button", { name: "Narysuj Ścianę", exact: true }).click();
  let { box } = await planBoxAndZoom(page);
  await page.mouse.click(box.x + 100, box.y + 100);
  ({ box } = await planBoxAndZoom(page));
  await page.mouse.click(box.x + 250, box.y + 100);
  await page.getByRole("button", { name: "Zakończ" }).click();
  await page.waitForTimeout(900);

  const [sciana] = (await projekt(page)).walls;
  await page.getByRole("button", { name: "Zaznacz", exact: true }).click();
  const { box: b, zoom } = await planBoxAndZoom(page);
  await page.mouse.click(b.x + ((sciana.points[0].x + sciana.points[1].x) / 2) * zoom, b.y + sciana.points[0].y * zoom);

  const karta = page.getByTestId("karta-sciany");
  await expect(karta).toBeVisible();
  // Bez kalibracji skali — w jednostkach rysunku, z kalibracją — w metrach.
  await expect(karta).toContainText(/(\d+,\d{2} m|\d+ jedn\.) · 1 odcinek/);
  await expect(karta.getByTestId("selected-wall-thickness-input")).toBeVisible();
  // Otwarta łamana (nie pętla) — nie ma z czego zrobić pomieszczenia.
  await expect(karta.getByRole("button", { name: /Utwórz pomieszczenie/ })).toHaveCount(0);

  await karta.getByRole("button", { name: "Usuń ścianę" }).click();
  await expect(karta).toHaveCount(0);
  await expect(page.getByTestId("panel-zaznacz")).toBeVisible();
  await page.waitForTimeout(900);
  expect((await projekt(page)).walls).toHaveLength(0);
});

test("karta pomieszczenia: nazwa, typ i „Usuń pomieszczenie”", async ({ page }) => {
  await openPlan(page);
  await page.getByRole("button", { name: "Narysuj Pomieszczenie", exact: true }).click();
  await page.getByRole("button", { name: "Prostokąt" }).click();
  const { box } = await planBoxAndZoom(page);
  await page.mouse.move(box.x + 100, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(box.x + 260, box.y + 220, { steps: 8 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Dodaj pomieszczenie" }).click();
  await page.waitForTimeout(900);

  const [pokoj] = (await projekt(page)).roomShapes;
  await page.getByRole("button", { name: "Zaznacz", exact: true }).click();
  const { box: b, zoom } = await planBoxAndZoom(page);
  // środek górnej krawędzi — pomieszczenie zaznacza się klikiem w obrys
  await page.mouse.click(b.x + ((pokoj.points[0].x + pokoj.points[1].x) / 2) * zoom, b.y + pokoj.points[0].y * zoom);

  const karta = page.getByTestId("karta-pomieszczenia");
  await expect(karta).toBeVisible();
  const nazwa = karta.getByLabel("Nazwa pomieszczenia");
  await nazwa.fill("Kuchnia");
  await nazwa.blur();
  await karta.getByLabel("Typ pomieszczenia").selectOption("kuchnia");
  await page.waitForTimeout(900);
  const po = (await projekt(page)).roomShapes[0];
  expect(po.name).toBe("Kuchnia");
  expect(po.type).toBe("kuchnia");

  await karta.getByRole("button", { name: "Usuń pomieszczenie" }).click();
  await expect(karta).toHaveCount(0);
  await expect(page.getByTestId("panel-zaznacz")).toBeVisible();
});
