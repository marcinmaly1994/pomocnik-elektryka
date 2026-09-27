import { test, expect, type Page } from "@playwright/test";

/**
 * Protokoły na monitorze.
 *
 * Dane ogólne miały po jednej trzeciej szerokości na pole — temperatura „20" i rewizja
 * „A" w polach po 600 px — a karta na ok. 500 px wysokości spychała protokół pod
 * krawędź ekranu (przy 1440×900 zaczynał się na ok. 910 px). Lista oględzin przy
 * 1920 px miała oceny ok. 1600 px od treści pozycji.
 */

async function otworz(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Protokoły pomiarowe" }).first().click();
  await expect(page.getByTestId("karta-protokolu")).toBeVisible();
}

test("1440×900: karta protokołu zaczyna się na pierwszym ekranie", async ({ page }) => {
  await otworz(page, 1440, 900);
  const top = await page.getByTestId("karta-protokolu").evaluate((e) => e.getBoundingClientRect().top + window.scrollY);
  expect(top).toBeLessThan(900);
});

test("1280 px: żadna etykieta danych ogólnych nie jest ucięta", async ({ page }) => {
  await otworz(page, 1280, 800);
  const uciete = await page.evaluate(() =>
    [...document.querySelectorAll("label > div.truncate")].filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent)
  );
  expect(uciete).toEqual([]);
});

test("1920 px: oceny oględzin stoją blisko treści pozycji", async ({ page }) => {
  await otworz(page, 1920, 1080);
  await page.getByRole("button", { name: /^Oględziny instalacji/ }).first().click();
  await page.getByRole("button", { name: /Wczytaj listę kontrolną/ }).click();
  const szer = await page.getByTestId("lista-ogledzin").evaluate((e) => e.getBoundingClientRect().width);
  expect(szer).toBeLessThanOrEqual(900);
});
