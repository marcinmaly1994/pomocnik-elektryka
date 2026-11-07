import { test, expect, type Page } from "@playwright/test";
import { otworzKatalogElementow, skipEntryScreen } from "./_flow";

/**
 * Ręczny przewód między dwoma elementami (F11 z audytu 5.11.2026): narzędzie
 * „Przewód", dwa kliknięcia, karta z rodzajem i opisem kabla; usunięcie elementu
 * zabiera przewód ze sobą.
 */

async function openPlan(page: Page) {
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

async function planBox(page: Page) {
  const wrap = page.locator("[data-testid=plan-okno]").first();
  await wrap.evaluate((e) => {
    e.scrollIntoView({ block: "start" });
    e.scrollTo(0, 0);
  });
  return (await wrap.boundingBox())!;
}

const przewody = (page: Page) =>
  page.evaluate(() => {
    const id = localStorage.getItem("pomocnikelektryka_projekt_biezacy");
    const raw = localStorage.getItem("pomocnikelektryka_projekt_" + id);
    return raw ? ((JSON.parse(raw).draft.przewody ?? []) as { rodzaj: string; kabel: string }[]) : [];
  });

test("przewód łącznik → oprawa: dwa kliknięcia, opis kabla, znika z usuniętym łącznikiem", async ({ page }) => {
  await openPlan(page);

  await otworzKatalogElementow(page);
  await page.getByRole("button", { name: /Oświetlenie/ }).first().click();
  await page.getByRole("button", { name: /Punkt sufitowy/ }).click();
  let box = await planBox(page);
  await page.mouse.click(box.x + 250, box.y + 120);

  await otworzKatalogElementow(page);
  await page.getByRole("button", { name: /Łączniki i sterowanie/ }).click();
  await page.getByRole("button", { name: /Łącznik jednobiegunowy/ }).click();
  box = await planBox(page);
  await page.mouse.click(box.x + 80, box.y + 120);
  await page.waitForTimeout(300);

  await page.getByRole("button", { name: "Przewód", exact: true }).click();
  await expect(page.getByTestId("podpowiedz-przewodu").first()).toContainText("Kliknij pierwszy element");
  box = await planBox(page);
  await page.mouse.click(box.x + 80, box.y + 120);
  await expect(page.getByTestId("podpowiedz-przewodu").first()).toContainText("Kliknij drugi element");
  await page.mouse.click(box.x + 250, box.y + 120);

  const karta = page.getByTestId("karta-przewodu").first();
  await expect(karta).toBeVisible();
  const kabel = karta.getByRole("textbox", { name: "Typ i przekrój kabla" });
  await expect(kabel).toHaveValue("YDYp 3×1,5");
  await expect.poll(async () => (await przewody(page)).map((p) => p.rodzaj)).toEqual(["sterowanie"]);

  await kabel.fill("YDYp 4×1,5");
  await expect.poll(async () => (await przewody(page))[0]?.kabel).toBe("YDYp 4×1,5");
  if (process.env.ZRZUT_PRZEWODU) await page.screenshot({ path: process.env.ZRZUT_PRZEWODU });

  // usunięcie łącznika zabiera przewód
  await page.getByRole("button", { name: "Zaznacz", exact: true }).click();
  await page.mouse.click(box.x + 80, box.y + 120);
  await page.keyboard.press("Delete");
  await expect.poll(async () => (await przewody(page)).length).toBe(0);
});
