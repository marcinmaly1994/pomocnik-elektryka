import { test, expect } from "@playwright/test";
import { skipEntryScreen } from "./_flow";

/**
 * Edycja narysowanych pomieszczeń: przeciąganie narożników, zmiana nazwy dwuklikiem
 * i usuwanie przez PPM na krawędzi. Wymaga prawdziwego kursora nad płótnem Konvy,
 * więc e2e — tak jak rysowanie pomieszczeń w room-drawing.spec.ts.
 */

async function openPlan(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Instalacja" }).click();
  await skipEntryScreen(page);
  const box = (await page.locator("[data-testid=plan-okno]").first().boundingBox())!;
  await page.getByRole("button", { name: "Narysuj Pomieszczenie", exact: true }).click();
  return box;
}

async function roomCount(page: import("@playwright/test").Page) {
  const label = await page.getByRole("button", { name: /Pomieszczenia \(\d+\)/ }).textContent();
  return Number(label!.match(/\((\d+)\)/)![1]);
}

async function drawRoom(page: import("@playwright/test").Page, box: { x: number; y: number }) {
  await page.getByRole("button", { name: "Prostokąt" }).click();
  await page.mouse.move(box.x + 100, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(box.x + 260, box.y + 220, { steps: 8 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Dodaj pomieszczenie" }).click();
  await page.waitForTimeout(900);
}

async function zoomAndBox(page: import("@playwright/test").Page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  const box = (await page.locator("[data-testid=plan-okno]").first().boundingBox())!;
  const zoom = await page.evaluate(() => {
    const k = (window as unknown as { Konva?: { stages: { scaleX(): number }[] } }).Konva;
    return k?.stages[0]?.scaleX() ?? 1;
  });
  return { box, zoom };
}

async function roomPoints(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem("pomocnikelektryka_projekt_" + localStorage.getItem("pomocnikelektryka_projekt_biezacy"));
    return JSON.parse(raw!).draft.roomShapes[0].points as { x: number; y: number }[];
  });
}

test("PPM na krawędzi pomieszczenia usuwa je", async ({ page }) => {
  const box0 = await openPlan(page);
  await drawRoom(page, box0);
  expect(await roomCount(page)).toBe(1);

  const pts = await roomPoints(page);
  const { box, zoom } = await zoomAndBox(page);
  // środek górnej krawędzi (dwa pierwsze punkty prostokąta mają tę samą wartość y)
  const midX = (pts[0].x + pts[1].x) / 2;
  const midY = pts[0].y;
  await page.mouse.click(box.x + midX * zoom, box.y + midY * zoom, { button: "right" });

  await expect(page.getByText("Usuń pomieszczenie")).toBeVisible();
  await page.getByText("Usuń pomieszczenie").click();
  expect(await roomCount(page)).toBe(0);
});

test("kliknięcie WEWNĄTRZ pomieszczenia (poza krawędzią) nie otwiera menu kontekstowego", async ({ page }) => {
  const box0 = await openPlan(page);
  await drawRoom(page, box0);

  const pts = await roomPoints(page);
  const { box, zoom } = await zoomAndBox(page);
  // punkt wewnątrz, ale z dala zarówno od krawędzi jak i od etykiety nazwy przy środku
  const ix = Math.min(pts[0].x, pts[2].x) + 25;
  const iy = Math.min(pts[0].y, pts[2].y) + 25;
  await page.mouse.click(box.x + ix * zoom, box.y + iy * zoom, { button: "right" });
  await expect(page.getByText("Usuń pomieszczenie")).toBeHidden();
});

test("dwuklik w nazwę pomieszczenia na planie pozwala ją zmienić", async ({ page }) => {
  const box0 = await openPlan(page);
  await drawRoom(page, box0);

  const pts = await roomPoints(page);
  const { box, zoom } = await zoomAndBox(page);
  const cx = (pts[0].x + pts[2].x) / 2;
  const cy = (pts[0].y + pts[2].y) / 2;
  await page.mouse.dblclick(box.x + cx * zoom, box.y + cy * zoom);

  const input = page.getByTestId("room-name-edit");
  await expect(input).toBeVisible();
  await input.fill("Sypialnia testowa");
  await input.press("Enter");
  await page.waitForTimeout(900);

  const name = await page.evaluate(() => {
    const raw = localStorage.getItem("pomocnikelektryka_projekt_" + localStorage.getItem("pomocnikelektryka_projekt_biezacy"));
    return JSON.parse(raw!).draft.roomShapes[0].name as string;
  });
  expect(name).toBe("Sypialnia testowa");
});

test("przeciągnięcie narożnika po zaznaczeniu zmienia kształt pomieszczenia", async ({ page }) => {
  const box0 = await openPlan(page);
  await drawRoom(page, box0);
  // Edycja uchwytami działa TYLKO w trybie „Zaznacz" (patrz test niżej: w trybie
  // „Narysuj Pomieszczenie" jest celowo zablokowana) — bez tego przełączenia klik
  // w krawędź poniżej i tak zaznaczyłby pomieszczenie, ale uchwyty by się nie pojawiły.
  await page.getByRole("button", { name: "Zaznacz", exact: true }).click();

  const before = await roomPoints(page);
  const { box, zoom } = await zoomAndBox(page);

  // zaznacz pomieszczenie klikając w krawędź, żeby pojawiły się uchwyty narożników
  const midX = (before[0].x + before[1].x) / 2;
  await page.mouse.click(box.x + midX * zoom, box.y + before[0].y * zoom);

  const corner = before[0];
  const start = { x: box.x + corner.x * zoom, y: box.y + corner.y * zoom };
  const target = { x: start.x - 30, y: start.y - 30 };

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(900);

  const after = await roomPoints(page);
  expect(after[0]).not.toEqual(before[0]);
});

/**
 * Zgłoszenie: uchwyty narożników ISTNIEJĄCEGO pomieszczenia były aktywne także w
 * trybie „Narysuj Pomieszczenie" — klik blisko narożnika przy próbie narysowania
 * NOWEGO pomieszczenia chwytał za uchwyt starego zamiast zacząć nową figurę.
 */
test("w trybie „Narysuj Pomieszczenie” przeciąganie narożnika NIE zmienia kształtu (uchwyty wyłączone)", async ({ page }) => {
  const box0 = await openPlan(page);
  await drawRoom(page, box0);
  // toolMode zostaje na „pomieszczenie" (drawRoom go nie zmienia) — to jest właśnie
  // scenariusz ze zgłoszenia, nie trzeba nic dodatkowo przełączać.

  const before = await roomPoints(page);
  const { box, zoom } = await zoomAndBox(page);

  const midX = (before[0].x + before[1].x) / 2;
  await page.mouse.click(box.x + midX * zoom, box.y + before[0].y * zoom);

  const corner = before[0];
  const start = { x: box.x + corner.x * zoom, y: box.y + corner.y * zoom };
  const target = { x: start.x - 30, y: start.y - 30 };

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(900);

  const after = await roomPoints(page);
  expect(after[0]).toEqual(before[0]);
});

test("zaznaczanie obszarem nadal działa po dodaniu krawędzi klikalnej pomieszczenia", async ({ page }) => {
  const box0 = await openPlan(page);
  await drawRoom(page, box0);

  // Zakładka panelu podąża za wybranym narzędziem — po „Obrysuj pomieszczenie” panel
  // biblioteki elementów jest schowany, dopóki jawnie nie wrócimy do „Wstaw Element”.
  await page.getByRole("button", { name: "Wstaw Element" }).click();
  await page.getByRole("button", { name: /Gniazdo 230 V/ }).first().click();
  // scrollTo(0,0) tuż PRZED pomiarem, nie przed kliknięciem: klik zmieniający
  // narzędzie sam potrafi przesunąć stronę, więc dopiero pomiar PO nim (z jawnym
  // powrotem na górę) jest wiarygodny — patrz `zoomAndBox` niżej, ten sam wzorzec.
  await page.evaluate(() => window.scrollTo(0, 0));
  const box2 = (await page.locator("[data-testid=plan-okno]").first().boundingBox())!;
  await page.mouse.click(box2.x + 150, box2.y + 130);
  await page.waitForTimeout(900);

  await page.getByRole("button", { name: "Zaznacz", exact: true }).click();
  const { box, zoom } = await zoomAndBox(page);
  const pos = await page.evaluate(() => {
    const raw = localStorage.getItem("pomocnikelektryka_projekt_" + localStorage.getItem("pomocnikelektryka_projekt_biezacy"));
    return JSON.parse(raw!).draft.elements[0] as { x: number; y: number };
  });
  const elAt = { x: box.x + pos.x * zoom, y: box.y + pos.y * zoom };

  await page.mouse.move(elAt.x - 60, elAt.y - 60);
  await page.mouse.down();
  await page.mouse.move(elAt.x + 60, elAt.y + 60, { steps: 10 });
  await page.mouse.up();

  await page.keyboard.press("r");
  await page.waitForTimeout(900);
  const rotation = await page.evaluate(() => {
    const raw = localStorage.getItem("pomocnikelektryka_projekt_" + localStorage.getItem("pomocnikelektryka_projekt_biezacy"));
    return JSON.parse(raw!).draft.elements[0].rotation ?? 0;
  });
  expect(rotation).toBe(90);
});
