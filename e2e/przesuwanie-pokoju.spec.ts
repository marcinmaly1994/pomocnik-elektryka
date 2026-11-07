import { test, expect, type Page } from "@playwright/test";
import { skipEntryScreen, otworzKatalogElementow } from "./_flow";

/**
 * Przesuwanie CAŁEGO pomieszczenia razem z osprzętem (F5 z audytu 5.11.2026).
 *
 * Wcześniej pokój dało się ruszać tylko narożnikami, po jednym. Teraz zaznaczony pokój
 * jedzie za przeciągniętym wnętrzem (albo strzałkami) razem ze swoimi gniazdami.
 */

async function otworzPlan(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Instalacja" }).click();
  await skipEntryScreen(page);
  await page.getByRole("button", { name: "Narysuj dom samodzielnie" }).first().click();
  const rozumiem = page.getByRole("button", { name: "Rozumiem" });
  if (await rozumiem.count()) await rozumiem.click();
  await page.getByRole("button", { name: /Powiększenie \d+ procent/ }).click();
}

/** Punkt PLANU na ekranie przez żywą transformację sceny — patrz karta-elementu.spec.ts. */
async function ekran(page: Page, x: number, y: number) {
  const wrap = page.locator("[data-testid=plan-okno]").first();
  await wrap.evaluate((e) => {
    e.scrollIntoView({ block: "start" });
    e.scrollTo(0, 0);
  });
  const box = (await wrap.boundingBox())!;
  const s = await page.evaluate(() => {
    const k = (window as unknown as { Konva: { stages: { scaleX(): number; x(): number; y(): number }[] } }).Konva;
    const st = k.stages[0];
    return { skala: st.scaleX(), x: st.x(), y: st.y() };
  });
  return { x: box.x + x * s.skala + s.x, y: box.y + y * s.skala + s.y };
}

async function klikPlan(page: Page, x: number, y: number) {
  const p = await ekran(page, x, y);
  await page.mouse.click(p.x, p.y);
}

async function pokojZGniazdem(page: Page) {
  await page.getByRole("button", { name: "Narysuj Pomieszczenie", exact: true }).click();
  await page.getByRole("button", { name: "Prostokąt" }).click();
  await klikPlan(page, 60, 60);
  await klikPlan(page, 260, 200);
  await page.getByRole("dialog").locator("input").first().fill("Salon");
  await page.getByRole("button", { name: "Dodaj pomieszczenie" }).click();

  await otworzKatalogElementow(page);
  const cel = page.getByRole("button", { name: /Gniazdo 230 V/ }).first();
  if (!(await cel.isVisible().catch(() => false))) await page.getByRole("button", { name: /Gniazda i zasilanie/ }).click();
  await cel.click();
  await klikPlan(page, 200, 160);
  await page.getByRole("button", { name: "Zaznacz", exact: true }).click();
}

type Plan = { roomShapes: { points: { x: number; y: number }[] }[]; elements: { x: number; y: number; room: string }[] };
async function plan(page: Page): Promise<Plan> {
  await page.waitForTimeout(900); // autozapis
  return page.evaluate(() => {
    const id = localStorage.getItem("pomocnikelektryka_projekt_biezacy");
    return JSON.parse(localStorage.getItem("pomocnikelektryka_projekt_" + id)!).draft;
  });
}

test("przeciągnięcie wnętrza zaznaczonego pokoju przesuwa go z osprzętem — jednym krokiem cofania", async ({ page }) => {
  await otworzPlan(page);
  await pokojZGniazdem(page);
  const przed = await plan(page);

  await klikPlan(page, 110, 110); // zaznacza pokój (B9)
  await expect(page.getByRole("textbox", { name: "Nazwa pomieszczenia" })).toHaveValue("Salon");
  const a = await ekran(page, 110, 110);
  const b = await ekran(page, 150, 130);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();

  const po = await plan(page);
  const dx = po.roomShapes[0].points[0].x - przed.roomShapes[0].points[0].x;
  const dy = po.roomShapes[0].points[0].y - przed.roomShapes[0].points[0].y;
  expect(dx).toBeGreaterThan(20);
  expect(dy).toBeGreaterThan(5);
  expect(po.elements[0].x - przed.elements[0].x).toBeCloseTo(dx, 5);
  expect(po.elements[0].y - przed.elements[0].y).toBeCloseTo(dy, 5);
  expect(po.elements[0].room).toBe("Salon");

  await page.keyboard.press("Control+z");
  const cofniete = await plan(page);
  expect(cofniete.roomShapes[0].points[0]).toEqual(przed.roomShapes[0].points[0]);
  expect(cofniete.elements[0]).toMatchObject({ x: przed.elements[0].x, y: przed.elements[0].y });
});

test("strzałki przesuwają zaznaczony pokój razem z osprzętem", async ({ page }) => {
  await otworzPlan(page);
  await pokojZGniazdem(page);
  const przed = await plan(page);
  await klikPlan(page, 110, 110);
  await expect(page.getByRole("textbox", { name: "Nazwa pomieszczenia" })).toHaveValue("Salon");
  await page.locator("[data-testid=plan-okno]").first().focus().catch(() => {});
  await page.mouse.move(5, 5); // fokus nie w polu nazwy — strzałki są dla planu
  await page.keyboard.press("Shift+ArrowRight");
  const po = await plan(page);
  const dx = po.roomShapes[0].points[0].x - przed.roomShapes[0].points[0].x;
  expect(dx).toBeGreaterThan(0);
  expect(po.elements[0].x - przed.elements[0].x).toBeCloseTo(dx, 5);
});

test("niezaznaczony pokój: przeciągnięcie wnętrza dalej rysuje ramkę zaznaczania", async ({ page }) => {
  await otworzPlan(page);
  await pokojZGniazdem(page);
  const przed = await plan(page);
  const a = await ekran(page, 150, 120);
  const b = await ekran(page, 240, 190);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByText(/Zaznaczono: 1/)).toBeVisible();
  expect((await plan(page)).roomShapes[0].points).toEqual(przed.roomShapes[0].points);
});
