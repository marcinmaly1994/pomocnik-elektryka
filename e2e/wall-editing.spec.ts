import { test, expect } from "@playwright/test";

/**
 * Edycja zapisanej ściany: przeciąganie narożnika po zaznaczeniu. Ten sam wzorzec
 * co przeciąganie narożników pomieszczenia w room-editing.spec.ts — uchwyty żyją
 * na płótnie Konvy, więc e2e.
 *
 * Uwaga: kontener planu PRZESUWA SIĘ w pionie, gdy pojawia się pasek „Rysowanie
 * ściany: N pkt." nad płótnem (rośnie layout nad canvasem) ORAZ gdy klika się
 * przycisk zmieniający narzędzie (przeglądarka doscrolluje klikany przycisk) —
 * dlatego bounding box trzeba pobierać na nowo tuż przed KAŻDYM kliknięciem, po
 * jawnym powrocie na górę strony, a nie raz na cały test (ten sam wzorzec co
 * `zoomAndBox` w room-editing.spec.ts).
 */

async function planBoxAndZoom(page: import("@playwright/test").Page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  const box = (await page.locator("div.overflow-auto.rounded-card.border").first().boundingBox())!;
  const zoom = await page.evaluate(() => {
    const k = (window as unknown as { Konva?: { stages: { scaleX(): number }[] } }).Konva;
    return k?.stages[0]?.scaleX() ?? 1;
  });
  return { box, zoom };
}

async function openPlan(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Instalacja" }).click();
}

async function drawWall(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Narysuj Ścianę", exact: true }).click();
  let { box } = await planBoxAndZoom(page);
  await page.mouse.click(box.x + 100, box.y + 100);
  ({ box } = await planBoxAndZoom(page));
  await page.mouse.click(box.x + 250, box.y + 100);
  await page.getByRole("button", { name: "Zakończ" }).click();
  await page.waitForTimeout(900);
}

async function wallPoints(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem("pomocnikelektryka_projekt_autosave");
    return JSON.parse(raw!).draft.walls[0].points as { x: number; y: number }[];
  });
}

test("przeciągnięcie narożnika zaznaczonej ściany zmienia jej kształt", async ({ page }) => {
  await openPlan(page);
  await drawWall(page);

  const before = await wallPoints(page);

  // `finishWall` NIE przełącza narzędzia z powrotem na "zaznacz" — trzeba
  // zrobić to jawnie, inaczej klik na płótnie dalej dokłada punkt ściany.
  await page.getByRole("button", { name: "Zaznacz", exact: true }).click();

  // zaznacz ścianę klikając na jej odcinek — dopiero to pokazuje uchwyty narożników
  let { box, zoom } = await planBoxAndZoom(page);
  const midX = (before[0].x + before[1].x) / 2;
  await page.mouse.click(box.x + midX * zoom, box.y + before[0].y * zoom);

  // zaznaczenie ściany dokłada nad płótnem pasek do zmiany grubości — kontener
  // znów się przesuwa, więc box trzeba pobrać jeszcze raz PO zaznaczeniu
  ({ box, zoom } = await planBoxAndZoom(page));
  const corner = before[0];
  const start = { x: box.x + corner.x * zoom, y: box.y + corner.y * zoom };
  const target = { x: start.x - 30, y: start.y - 30 };

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(900);

  const after = await wallPoints(page);
  expect(after[0]).not.toEqual(before[0]);
});

test("po Zakończ narzędzie Ściana zostaje aktywne — kolejny klik zaczyna NOWĄ ścianę", async ({ page }) => {
  await openPlan(page);
  await drawWall(page);

  // po "Zakończ" narzędzie "Narysuj Ścianę" jest nadal aktywne — klik gdzie indziej
  // na planie (z dala od już narysowanej ściany, żeby nie trafić w jej odcinek)
  // zaczyna nową ścianę zamiast przeciągać poprzednią
  const { box, zoom } = await planBoxAndZoom(page);
  await page.mouse.click(box.x + 100 * zoom, box.y + 300 * zoom);
  await expect(page.getByText(/Rysowanie ściany: 1 pkt\./)).toBeVisible();

  const walls = await page.evaluate(() => {
    const raw = localStorage.getItem("pomocnikelektryka_projekt_autosave");
    return JSON.parse(raw!).draft.walls as unknown[];
  });
  expect(walls).toHaveLength(1); // ta pierwsza ściana pozostaje nietknięta, druga jeszcze niedokończona
});

test("zmiana grubości zaznaczonej ściany zapisuje się do projektu", async ({ page }) => {
  await openPlan(page);
  await drawWall(page);

  const before = await wallPoints(page);
  await page.getByRole("button", { name: "Zaznacz", exact: true }).click();
  const { box, zoom } = await planBoxAndZoom(page);
  const midX = (before[0].x + before[1].x) / 2;
  await page.mouse.click(box.x + midX * zoom, box.y + before[0].y * zoom);

  const input = page.getByTestId("selected-wall-thickness-input");
  await expect(input).toBeVisible();
  await input.fill("18");
  await input.blur();
  await page.waitForTimeout(900);

  const thickness = await page.evaluate(() => {
    const raw = localStorage.getItem("pomocnikelektryka_projekt_autosave");
    return JSON.parse(raw!).draft.walls[0].thickness as number;
  });
  expect(thickness).toBe(18);
});
