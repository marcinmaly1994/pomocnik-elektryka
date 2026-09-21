import { test, expect, type Page } from "@playwright/test";
import { skipEntryScreen } from "./_flow";

/**
 * Dwuklik (albo podwójne dotknięcie) w puste miejsce planu dopasowuje widok.
 *
 * Droga powrotna po przybliżeniu jest tym, czego szuka się najpierw — a jedyną, jaką
 * miała, była ikona w pasku: na telefonie daleko od kciuka, w pełnym ekranie schowana
 * razem z paskiem. Gest robi to samo co ona.
 *
 * Tylko w narzędziach, które niczego nie rysują. W rysujących każde kliknięcie coś
 * stawia, więc dwa pod rząd to dwa punkty ściany, a nie prośba o przeramowanie —
 * i tego pilnuje ostatni test.
 */

test.use({ hasTouch: true });

async function planBox(page: Page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  return (await page.locator("[data-testid=plan-okno]").first().boundingBox())!;
}

async function pustyProjekt(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Instalacja" }).click();
  await skipEntryScreen(page);
}

async function powiekszenie(page: Page): Promise<number> {
  const etykieta = await page.getByRole("button", { name: /Powiększenie \d+ procent/ }).getAttribute("aria-label");
  return Number(etykieta!.match(/(\d+) procent/)![1]);
}

/** Przybliża paskiem, żeby było z czego wracać. */
async function przybliz(page: Page): Promise<number> {
  const plus = page.getByRole("button", { name: "Przybliż widok" });
  const start = await powiekszenie(page);
  for (let i = 0; i < 3; i++) await plus.click();
  const po = await powiekszenie(page);
  expect(po).toBeGreaterThan(start);
  return start;
}

async function dwaRazyWPuste(page: Page, dotykiem: boolean) {
  const b = await planBox(page);
  // róg z dala od czegokolwiek narysowanego
  const x = b.x + b.width - 60;
  const y = b.y + b.height - 60;
  if (!dotykiem) {
    await page.mouse.dblclick(x, y);
    return;
  }
  await page.touchscreen.tap(x, y);
  await page.waitForTimeout(60);
  await page.touchscreen.tap(x, y);
}

for (const dotykiem of [false, true]) {
  const jak = dotykiem ? "podwójne dotknięcie" : "dwuklik";

  test(`${jak} w puste miejsce wraca do dopasowanego widoku`, async ({ page }) => {
    await pustyProjekt(page);
    await page.getByRole("button", { name: "Zaznacz", exact: true }).click();
    const dopasowane = await przybliz(page);

    await dwaRazyWPuste(page, dotykiem);
    await expect.poll(() => powiekszenie(page)).toBe(dopasowane);
  });

  test(`${jak} NIE przeramowuje widoku przy narzędziu rysującym`, async ({ page }) => {
    await pustyProjekt(page);
    await page.getByRole("button", { name: "Zaznacz", exact: true }).click();
    await przybliz(page);
    const przybliżone = await powiekszenie(page);

    await page.getByRole("button", { name: "Narysuj Ścianę", exact: true }).click();
    await dwaRazyWPuste(page, dotykiem);
    await page.waitForTimeout(500);
    expect(await powiekszenie(page)).toBe(przybliżone);
  });
}
