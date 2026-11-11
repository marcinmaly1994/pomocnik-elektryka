import { test, expect, type Page } from "@playwright/test";
import { skipEntryScreen } from "./_flow";

/**
 * Szablony pomieszczeń (F12 z audytu 5.11.2026): karta zaznaczonej kuchni wstawia jej
 * typowy osprzęt jednym kliknięciem, a jedno Ctrl+Z zdejmuje go w całości.
 */

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

const elementyWProjekcie = (page: Page) =>
  page.evaluate(() => {
    const id = localStorage.getItem("pomocnikelektryka_projekt_biezacy");
    const raw = localStorage.getItem("pomocnikelektryka_projekt_" + id);
    return raw ? (JSON.parse(raw).draft.elements as { type: string; room: string; agdLetter?: string }[]) : [];
  });

test("kuchnia: „Wstaw typowy osprzęt” dodaje szablon, Ctrl+Z zdejmuje całość", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Instalacja" }).click();
  await skipEntryScreen(page);
  await page.getByRole("button", { name: "Narysuj dom samodzielnie" }).first().click();
  const rozumiem = page.getByRole("button", { name: "Rozumiem" });
  if (await rozumiem.count()) await rozumiem.click();
  await page.getByRole("button", { name: /Powiększenie \d+ procent/ }).click();

  await page.getByRole("button", { name: "Narysuj Pomieszczenie", exact: true }).click();
  await page.getByRole("button", { name: "Prostokąt" }).click();
  await klikPlan(page, 60, 60);
  await klikPlan(page, 160, 140);
  const dialog = page.getByRole("dialog");
  await dialog.locator("input").first().fill("Kuchnia");
  await page.getByRole("button", { name: "Dodaj pomieszczenie" }).click();

  await page.getByRole("button", { name: "Zaznacz", exact: true }).click();
  await klikPlan(page, 80, 80);
  const szablon = page.getByTestId("szablon-pomieszczenia");
  await expect(szablon).toContainText("Typowy osprzęt: kuchnia");
  await expect(szablon).toContainText("3 × Gniazdo 230 V podwójne");

  await szablon.getByRole("button", { name: "Wstaw typowy osprzęt" }).click();
  await expect(szablon.getByRole("status")).toContainText("Wstawiono 9 elementów");
  await expect.poll(async () => (await elementyWProjekcie(page)).length).toBe(9);
  const el = await elementyWProjekcie(page);
  expect(el.every((e) => e.room === "Kuchnia")).toBe(true);
  expect(el.filter((e) => e.type === "wypustAGD").map((e) => e.agdLetter).sort()).toEqual(["I", "P", "Z"]);
  // R2 z audytu Instalacji 11.11.2026: drugie kliknięcie dokładało kolejny komplet.
  // Teraz w pełnej kuchni nie ma już czego dołożyć, więc i przycisku nie ma.
  await expect(szablon.getByRole("button")).toHaveCount(0);

  // jedno cofnięcie zdejmuje cały szablon
  await page.locator("[data-testid=plan-okno]").first().hover();
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await elementyWProjekcie(page)).length).toBe(0);
});
