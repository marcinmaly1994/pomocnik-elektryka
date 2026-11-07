import { test, expect, type Page } from "@playwright/test";
import { skipEntryScreen } from "./_flow";

/**
 * Notatki tekstowe na rzucie (F6 z audytu 5.11.2026) — uwagi dla montera, które trafiają
 * też na wydruk: „puszka pod blatem 105 cm", „kabel do bramy w peszlu".
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

type N = { id: string; x: number; y: number; tekst: string; floor: string };
async function notatki(page: Page): Promise<N[]> {
  await page.waitForTimeout(900); // autozapis
  return page.evaluate(() => {
    const id = localStorage.getItem("pomocnikelektryka_projekt_biezacy");
    return JSON.parse(localStorage.getItem("pomocnikelektryka_projekt_" + id)!).draft.notatki ?? [];
  });
}

async function dodajNotatke(page: Page, x: number, y: number, tekst: string) {
  await page.getByRole("button", { name: "Notatka", exact: true }).click();
  await klikPlan(page, x, y);
  await expect(page.getByRole("dialog", { name: "Nowa notatka" })).toBeVisible();
  await page.getByRole("textbox", { name: "Treść notatki" }).fill(tekst);
  await page.getByRole("button", { name: "Dodaj notatkę" }).click();
}

test("narzędzie Notatka stawia notatkę w klikniętym miejscu i ją zaznacza", async ({ page }) => {
  await otworzPlan(page);
  await dodajNotatke(page, 120, 100, "puszka pod blatem 105 cm");
  const [n] = await notatki(page);
  expect(n.tekst).toBe("puszka pod blatem 105 cm");
  expect(Math.abs(n.x - 120)).toBeLessThan(2);
  expect(Math.abs(n.y - 100)).toBeLessThan(2);
  await expect(page.getByTestId("karta-notatki")).toContainText("puszka pod blatem 105 cm");
});

test("pusta treść nie tworzy notatki", async ({ page }) => {
  await otworzPlan(page);
  await page.getByRole("button", { name: "Notatka", exact: true }).click();
  await klikPlan(page, 120, 100);
  await page.getByRole("button", { name: "Dodaj notatkę" }).click();
  expect(await notatki(page)).toEqual([]);
});

test("edycja z karty, przeciągnięcie w Zaznacz i usunięcie klawiszem Delete", async ({ page }) => {
  await otworzPlan(page);
  await dodajNotatke(page, 120, 100, "peszel");
  await page.getByTestId("karta-notatki").getByRole("button", { name: "Edytuj" }).click();
  await page.getByRole("textbox", { name: "Treść notatki" }).fill("kabel do bramy w peszlu");
  await page.getByRole("button", { name: "Zapisz" }).click();
  expect((await notatki(page))[0].tekst).toBe("kabel do bramy w peszlu");

  await page.getByRole("button", { name: "Zaznacz", exact: true }).click();
  const przed = (await notatki(page))[0];
  const a = await ekran(page, przed.x + 4, przed.y + 4);
  const b = await ekran(page, przed.x + 64, przed.y + 44);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await page.mouse.up();
  const po = (await notatki(page))[0];
  expect(po.x - przed.x).toBeGreaterThan(40);
  expect(po.y - przed.y).toBeGreaterThan(25);

  await expect(page.getByTestId("karta-notatki")).toBeVisible();
  await page.mouse.move(5, 5);
  await page.keyboard.press("Delete");
  expect(await notatki(page)).toEqual([]);
});

test("skrót N wybiera narzędzie Notatka", async ({ page }) => {
  await otworzPlan(page);
  await page.waitForTimeout(300);
  await page.keyboard.press("n");
  await expect(page.getByRole("button", { name: "Notatka", exact: true })).toHaveAttribute("aria-pressed", "true");
});
