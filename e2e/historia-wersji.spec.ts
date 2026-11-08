import { test, expect, type Page } from "@playwright/test";
import { wczytajPrzyklad } from "./_flow";

/**
 * Historia wersji projektu (F15 z audytu 5.11.2026): zapis migawki pod nazwą,
 * zniszczenie projektu, powrót do migawki — z odłożeniem stanu sprzed powrotu.
 */

const liczbaElementow = (page: Page) =>
  page.evaluate(() => {
    const id = localStorage.getItem("pomocnikelektryka_projekt_biezacy");
    const raw = localStorage.getItem("pomocnikelektryka_projekt_" + id);
    return raw ? (JSON.parse(raw).draft.elements.length as number) : -1;
  });

async function otworzWersje(page: Page) {
  await page.getByRole("button", { name: "Projekty", exact: true }).click();
  await page.getByRole("menuitem", { name: /Wersje projektu/ }).click();
  await expect(page.getByTestId("historia-wersji")).toBeVisible();
}

test("zapis wersji i powrót do niej po usunięciu całego osprzętu", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await wczytajPrzyklad(page, "dom");
  await page.waitForTimeout(1500);
  const r = page.getByRole("button", { name: "Rozumiem" });
  if (await r.count()) await r.click();

  const przed = await liczbaElementow(page);
  expect(przed).toBeGreaterThan(10);

  await otworzWersje(page);
  await page.getByRole("textbox", { name: "Nazwa wersji" }).fill("przed porządkami");
  await page.getByRole("button", { name: "Zapisz wersję" }).click();
  await expect(page.getByTestId("wersja-projektu")).toHaveCount(1);
  await expect(page.getByTestId("wersja-projektu").first()).toContainText("przed porządkami");
  await page.keyboard.press("Escape");

  // „zniszczenie" projektu: zaznacz wszystko i usuń
  await page.getByRole("button", { name: "Zaznacz", exact: true }).click();
  await page.locator("[data-testid=plan-okno]").first().hover();
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Delete");
  await expect.poll(() => liczbaElementow(page)).toBeLessThan(przed);

  await otworzWersje(page);
  const wersja = page.getByTestId("wersja-projektu").filter({ hasText: "przed porządkami" });
  await wersja.getByRole("button", { name: /Przywróć/ }).click();
  await wersja.getByRole("button", { name: "Przywróć", exact: true }).click();
  await expect(page.getByTestId("historia-wersji")).toHaveCount(0);
  await expect.poll(() => liczbaElementow(page)).toBe(przed);

  // stan sprzed przywrócenia odłożony jako kolejna wersja — pomyłkę da się odwrócić
  await otworzWersje(page);
  await expect(page.getByTestId("wersja-projektu")).toHaveCount(2);
  if (process.env.ZRZUT_WERSJI) await page.screenshot({ path: process.env.ZRZUT_WERSJI });
  await expect(page.getByTestId("wersja-projektu").first()).toContainText("Przed przywróceniem: przed porządkami");
});
