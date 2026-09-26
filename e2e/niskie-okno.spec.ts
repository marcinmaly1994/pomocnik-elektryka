import { test, expect } from "@playwright/test";
import { wczytajPrzyklad } from "./_flow";

/**
 * Niskie okno laptopa: rzut i pasek stanu mieszczą się na ekranie.
 *
 * Płótno liczyło się od góry strony, a nad nim stoją nagłówek, etapy i banery. Przy
 * 1024 × 768 zostawało mu 360 px (dolna granica), a pasek stanu z „Dalej" kończył się
 * na 841 px — pod krawędzią ekranu. W takim oknie płótno liczy się teraz od początku
 * edytora, a strona przewija się do niego przy wejściu — jak na telefonie.
 */
test("1024×768: rzut na większość ekranu, pasek stanu w kadrze", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await wczytajPrzyklad(page, "mieszkanie");

  await expect
    .poll(() => page.evaluate(() => Math.round(document.querySelector("[data-plan-okno]")?.getBoundingClientRect().top ?? 9999)), {
      timeout: 4000,
    })
    .toBeLessThan(150);
  await page.waitForTimeout(300);
  const rzut = (await page.locator("[data-plan-okno]").boundingBox())!;
  expect(rzut.height).toBeGreaterThan(500);
  const stan = (await page.getByLabel("Stan projektu").boundingBox())!;
  expect(stan.y + stan.height).toBeLessThanOrEqual(768);
});

/** Na zwykłym monitorze nic się nie zmienia: edytor mieści się bez przewijania. */
test("1440×900: strona nie przewija się, edytor mieści się jak dotąd", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await wczytajPrzyklad(page, "mieszkanie");
  await expect(page.locator("[data-plan-okno]")).toBeVisible();
  await page.waitForTimeout(1200);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  const stan = (await page.getByLabel("Stan projektu").boundingBox())!;
  expect(stan.y + stan.height).toBeLessThanOrEqual(900);
});
