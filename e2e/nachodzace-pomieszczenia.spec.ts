import { test, expect, type Page } from "@playwright/test";
import { skipEntryScreen } from "./_flow";

/**
 * Nachodzące pomieszczenia w „Sprawdzeniu rzutu" (audyt 5.11.2026, B8).
 *
 * Zachodzące obrysy przechodziły sprawdzenie bez słowa, a osprzęt w części wspólnej
 * trafiał do jednego z pokoi według kolejności rysowania. Sąsiedzi ze wspólną ścianą
 * nie mogą tego ostrzeżenia wywoływać — tak rysuje się każde mieszkanie.
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

async function pokoj(page: Page, a: [number, number], b: [number, number], nazwa: string) {
  await page.getByRole("button", { name: "Narysuj Pomieszczenie", exact: true }).click();
  await page.getByRole("button", { name: "Prostokąt" }).click();
  await klikPlan(page, ...a);
  await klikPlan(page, ...b);
  await page.getByRole("dialog").locator("input").first().fill(nazwa);
  await page.getByRole("button", { name: "Dodaj pomieszczenie" }).click();
}

const ostrzezenie = (page: Page) => page.getByText("Pomieszczenia nachodzą na siebie");

test("zachodzące pokoje dają ostrzeżenie, a „Pokaż na planie” zaznacza pokój", async ({ page }) => {
  await otworzPlan(page);
  await pokoj(page, [60, 60], [200, 200], "Salon");
  await page.getByRole("button", { name: "Oddal widok" }).click();
  await pokoj(page, [140, 100], [300, 240], "Kuchnia");

  await expect(ostrzezenie(page)).toBeVisible();
  await expect(page.getByText(/Salon i Kuchnia — obrysy zachodzą na siebie/)).toBeVisible();
  await page.getByText("Pomieszczenia nachodzą na siebie").locator("..").getByRole("button", { name: "Pokaż na planie" }).click();
  await expect(page.getByRole("textbox", { name: "Nazwa pomieszczenia" })).toHaveValue("Salon");
});

test("sąsiednie pokoje ze wspólną ścianą nie dają ostrzeżenia", async ({ page }) => {
  await otworzPlan(page);
  await pokoj(page, [60, 60], [200, 200], "Salon");
  await page.getByRole("button", { name: "Oddal widok" }).click();
  await pokoj(page, [200, 60], [320, 200], "Kuchnia");

  await expect(page.getByText(/Sprawdzenie rzutu/).first()).toBeVisible();
  await expect(ostrzezenie(page)).toHaveCount(0);
});
