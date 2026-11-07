import { test, expect, type Page } from "@playwright/test";
import { otworzKatalogElementow, otworzMenuPaska, skipEntryScreen } from "./_flow";

/**
 * Ctrl+A, Ctrl+C i Ctrl+V na planie (F2/F4 z audytu 5.11.2026).
 *
 * Był tylko Ctrl+D (duplikat obok oryginału). Kopiuj/wklej dochodzi przede wszystkim po
 * to, żeby przenieść osprzęt NA INNĄ KONDYGNACJĘ — te same gniazda nad sobą na parterze
 * i piętrze to codzienność w domu jednorodzinnym.
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

/** Punkt PLANU kliknięty przez żywą transformację sceny — patrz karta-elementu.spec.ts. */
async function klikPlan(page: Page, x: number, y: number) {
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
  await page.mouse.click(box.x + x * s.skala + s.x, box.y + y * s.skala + s.y);
}

type El = { id: string; x: number; y: number; floor: string; room: string; obwod?: number };
async function elementy(page: Page): Promise<El[]> {
  await page.waitForTimeout(900); // autozapis
  return page.evaluate(() => {
    const id = localStorage.getItem("pomocnikelektryka_projekt_biezacy");
    return JSON.parse(localStorage.getItem("pomocnikelektryka_projekt_" + id)!).draft.elements;
  });
}

async function gniazda(page: Page, punkty: [number, number][]) {
  await otworzKatalogElementow(page);
  const cel = page.getByRole("button", { name: /Gniazdo 230 V/ }).first();
  if (!(await cel.isVisible().catch(() => false))) await page.getByRole("button", { name: /Gniazda i zasilanie/ }).click();
  await cel.click();
  for (const [x, y] of punkty) await klikPlan(page, x, y);
  await page.getByRole("button", { name: "Zaznacz", exact: true }).click();
}

test("Ctrl+A zaznacza wszystkie elementy kondygnacji", async ({ page }) => {
  await otworzPlan(page);
  await gniazda(page, [[100, 100], [200, 100], [150, 200]]);
  await page.keyboard.press("Control+a");
  await expect(page.getByText(/Zaznaczono: 3/)).toBeVisible();
});

test("Ctrl+C i Ctrl+V na tej samej kondygnacji wkleja kopię obok, kolejne wklejenie dalej", async ({ page }) => {
  await otworzPlan(page);
  await gniazda(page, [[100, 100], [200, 100]]);
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Control+c");
  await page.keyboard.press("Control+v");
  await expect(page.getByText(/Zaznaczono: 2/)).toBeVisible();
  await page.keyboard.press("Control+v");
  const el = await elementy(page);
  expect(el).toHaveLength(6);
  const [a, b] = el;
  const kopieA = el.filter((e) => e.id !== a.id && Math.abs(e.y - a.y) === Math.abs(e.x - a.x) && e.x > a.x && Math.abs(e.x - b.x) > 1);
  expect(kopieA.length).toBe(2);
  expect(new Set(kopieA.map((e) => e.x)).size).toBe(2); // drugie wklejenie nie leży na pierwszym
});

test("wklejenie na INNEJ kondygnacji stawia osprzęt w tym samym miejscu, bez numeru obwodu", async ({ page }) => {
  await otworzPlan(page);
  await gniazda(page, [[100, 100]]);
  // Numer obwodu nadany ręcznie na parterze nie może przenieść się na piętro —
  // dołączyłby gniazdo z piętra do obwodu z parteru.
  await klikPlan(page, 100, 100);
  await page.getByTestId("karta-elementu").getByRole("button", { name: "+ 1" }).click();
  expect((await elementy(page))[0].obwod).toBe(1);
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Control+c");

  await otworzMenuPaska(page, "Plan");
  await page.getByRole("button", { name: "+ Dodaj kondygnację" }).click();
  await page.getByRole("textbox").fill("Piętro");
  await page.getByRole("button", { name: "Dodaj", exact: true }).click();
  await page.keyboard.press("Escape");

  await page.keyboard.press("Control+v");
  const el = await elementy(page);
  expect(el).toHaveLength(2);
  const [org, kopia] = el;
  expect(kopia.floor).not.toBe(org.floor);
  expect([kopia.x, kopia.y]).toEqual([org.x, org.y]);
  expect(kopia.obwod).toBeUndefined();
});
