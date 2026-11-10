import { test, expect, type Page } from "@playwright/test";
import { wczytajPrzyklad } from "./_flow";

/**
 * Pola formularzy na telefonie mają co najmniej 16 px.
 *
 * Safari na iPhonie przybliża stronę przy każdym fokusie na polu z czcionką mniejszą niż
 * 16 px i sam jej nie oddala. Wiele pól `.pe-input` miało `text-sm` / `text-xs`, więc
 * zasada „≥ 16 px poniżej `md`" siedzi w jednym miejscu (`index.css`) i ten test pilnuje,
 * że żadne pole na trzech reprezentatywnych ekranach jej nie omija.
 */

test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

const POLA = "input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]):not([type=hidden]), select, textarea";

async function rozmiaryPol(page: Page) {
  return page.$$eval(POLA, (els) =>
    els
      .filter((e) => {
        const r = e.getBoundingClientRect();
        const s = getComputedStyle(e);
        return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
      })
      .map((e) => ({
        pole: e.getAttribute("aria-label") ?? e.getAttribute("placeholder") ?? e.getAttribute("name") ?? e.tagName,
        px: parseFloat(getComputedStyle(e).fontSize),
      })),
  );
}

async function sprawdz(page: Page) {
  const pola = await rozmiaryPol(page);
  expect(pola.length, "ekran ma mieć jakiekolwiek pola").toBeGreaterThan(0);
  expect(pola.filter((p) => p.px < 16)).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test("lista kalkulatorów: wyszukiwarka ma 16 px", async ({ page }) => {
  await page.getByRole("button", { name: "Kalkulatory", exact: true }).click();
  await expect(page.getByRole("searchbox").or(page.locator("input[type=search], input[placeholder*='Szukaj' i]")).first()).toBeVisible();
  await sprawdz(page);
});

test("okno logowania: pola mają 16 px", async ({ page }) => {
  await page.getByRole("button", { name: "Zaloguj się" }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await sprawdz(page);
});

test("Kosztorys przykładowego projektu: pola mają 16 px", async ({ page }) => {
  await wczytajPrzyklad(page, "mieszkanie");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole("button", { name: "Kosztorys", exact: true }).click();
  await expect(page.getByLabel(/^Wartość pozycji: Gniazdo RJ45/)).toBeVisible();
  await sprawdz(page);
});
