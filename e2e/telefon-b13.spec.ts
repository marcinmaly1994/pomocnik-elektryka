import { test, expect } from "@playwright/test";

/**
 * B13 z audytu 4.11.2026 — telefon, część kalkulatorowa.
 *
 * Zmierzone przed zmianą (360 × 740): w „Spadku napięcia” pierwsze pole stało na 582 px,
 * a wynik dopiero na 1314 px. Nad formularzem wisiał pasek projektu z krokami 01–04
 * (102 px), choć kalkulatory nie należą do projektu.
 *
 * (Druga część B13 — płótno edytora na większość ekranu — jest już pilnowana przez
 * e2e/edytor-telefon-zwarty.spec.ts.)
 */

test.describe("telefon", () => {
  test.use({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });

  test("kalkulator: wynik pod formularzem → przyklejony pasek, dotknięcie przewija do wyniku", async ({ page }) => {
    await page.goto("/kalkulatory/spadek");
    const pasek = page.getByTestId("pasek-wyniku");
    await expect(pasek).toBeVisible();
    // Dokładnie jeden — drugorzędne bloki wyniku nie dublują paska.
    await expect(pasek).toHaveCount(1);

    await pasek.click();
    const wynik = page.locator(".pe-result:not([data-drugorzedny])").first();
    await expect(wynik).toBeInViewport();
    await expect(pasek).toBeHidden();

    // Powrót na górę formularza — pasek wraca.
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(pasek).toBeVisible();
  });

  test("kalkulatory i protokoły bez paska projektu; powrót do projektu przez Menu", async ({ page }) => {
    const pasekProjektu = page.getByRole("region", { name: "Projekt i etapy pracy" });

    await page.goto("/kalkulatory");
    await expect(pasekProjektu).toBeHidden();
    await page.goto("/protokoly");
    await expect(pasekProjektu).toBeHidden();

    await page.getByRole("button", { name: "Menu" }).click();
    await page.getByRole("button", { name: "Projekt instalacji" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(pasekProjektu).toBeVisible();
  });
});

test("komputer: bez przyklejonego paska wyniku, pasek projektu nad kalkulatorem zostaje", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/kalkulatory/spadek");
  await expect(page.locator(".pe-result").first()).toBeVisible();
  await expect(page.getByTestId("pasek-wyniku")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Projekt i etapy pracy" })).toBeVisible();
});
