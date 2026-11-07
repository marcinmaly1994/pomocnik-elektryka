import { test, expect, type Page } from "@playwright/test";
import { otworzKatalogElementow, wczytajPrzyklad } from "./_flow";

/**
 * Filtry widoku osprzętu (F8 z audytu 5.11.2026): ukrycie kategorii („Teletechnika")
 * zdejmuje ją z rzutu — i z wydruku, który rasteryzuje się z rzutu — bez ruszania
 * danych projektu.
 */

async function dom(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await wczytajPrzyklad(page, "dom");
  await page.waitForTimeout(1500);
  const r = page.getByRole("button", { name: "Rozumiem" });
  if (await r.count()) await r.click();
  await page.getByRole("button", { name: "Zaznacz", exact: true }).click();
}

async function zaznaczono(page: Page): Promise<number> {
  await page.mouse.move(5, 5);
  await page.keyboard.press("Control+a");
  const t = await page.getByText(/Zaznaczono: \d+/).first().innerText();
  await page.keyboard.press("Escape");
  return Number(t.match(/\d+/)![0]);
}

async function przelacz(page: Page, kategoria: string) {
  await page.getByRole("button", { name: "Opisy" }).click();
  await page.getByRole("checkbox", { name: kategoria }).click();
  await page.keyboard.press("Escape");
}

const liczbaElementow = (page: Page) =>
  page.evaluate(() => {
    const id = localStorage.getItem("pomocnikelektryka_projekt_biezacy");
    return JSON.parse(localStorage.getItem("pomocnikelektryka_projekt_" + id)!).draft.elements.length as number;
  });

test("ukrycie Teletechniki zdejmuje ją z rzutu, nie z projektu; „Pokaż wszystko” przywraca", async ({ page }) => {
  await dom(page);
  const wszystkie = await zaznaczono(page);
  const wProjekcie = await liczbaElementow(page);

  await przelacz(page, "Teletechnika");
  await expect(page.getByTestId("ukryte-kategorie")).toContainText("Teletechnika");
  const bezTeletechniki = await zaznaczono(page);
  expect(bezTeletechniki).toBeLessThan(wszystkie);
  expect(await liczbaElementow(page)).toBe(wProjekcie);

  await page.getByTestId("ukryte-kategorie").getByRole("button", { name: "Pokaż wszystko" }).click();
  await expect(page.getByTestId("ukryte-kategorie")).toHaveCount(0);
  expect(await zaznaczono(page)).toBe(wszystkie);
});

test("stawianie elementu ukrytej kategorii przywraca ją na rzut", async ({ page }) => {
  await dom(page);
  await przelacz(page, "Gniazda i zasilanie");
  await expect(page.getByTestId("ukryte-kategorie")).toBeVisible();

  await otworzKatalogElementow(page);
  await page.getByRole("button", { name: /Gniazdo 230 V/ }).first().click();
  const plan = (await page.locator("[data-testid=plan-okno]").first().boundingBox())!;
  await page.mouse.click(plan.x + plan.width / 2, plan.y + plan.height / 2);
  await expect(page.getByTestId("ukryte-kategorie")).toHaveCount(0);
});
