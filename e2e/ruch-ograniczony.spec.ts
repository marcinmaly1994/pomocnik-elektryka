import { test, expect } from "@playwright/test";

/**
 * Przy `prefers-reduced-motion: reduce` żadna z animacji redesignu nie rusza:
 * wejście okna, przenikanie karty kalkulatora, szkielet wczytywania. Bez ruchu, ale
 * z tą samą treścią — kto prosi o spokój, ma dostać ten sam interfejs, nie uboższy.
 */
test.describe("ograniczony ruch", () => {
  test.use({ colorScheme: "light", reducedMotion: "reduce" });

  test("okno dialogowe i karta kalkulatora bez animacji", async ({ page }) => {
    await page.goto("/kalkulatory/spadek");
    await expect(page.getByRole("heading", { name: "Kalkulatory elektryczne" })).toBeVisible();
    const karta = page.locator("[data-karta-kalkulatora]").first();
    expect(await karta.evaluate((e) => getComputedStyle(e).animationName)).toBe("none");

    await page.locator("header").getByRole("button", { name: /Pomoc/ }).first().click();
    const okno = page.getByRole("dialog").first();
    await expect(okno).toBeVisible();
    expect(await okno.evaluate((e) => getComputedStyle(e).animationName)).toBe("none");
  });
});

test("bez ograniczenia: okno wchodzi animacją pe-okno-wejscie", async ({ page }) => {
  await page.goto("/kalkulatory/spadek");
  await page.locator("header").getByRole("button", { name: /Pomoc/ }).first().click();
  const okno = page.getByRole("dialog").first();
  await expect(okno).toBeVisible();
  expect(await okno.evaluate((e) => getComputedStyle(e).animationName)).toContain("pe-okno-wejscie");
});
