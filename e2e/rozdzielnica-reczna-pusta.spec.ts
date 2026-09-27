import { test, expect } from "@playwright/test";

/**
 * Rozdzielnica składana ręcznie, na razie z samym rozłącznikiem głównym.
 *
 * Trzy rzeczy mówiły tu nieprawdę albo nic:
 * - „Rozrzut między fazami: 1,0 A" przy fazach po 0,0 A (dolny próg 1 A był tylko
 *   dla skali pasków),
 * - kafelek „Schemat" twierdził „gotowy", a schemat pokazywał pusty stan,
 * - tabela doboru pokazywała same nagłówki, bez słowa dlaczego.
 */
test("ręczna rozdzielnica bez odpływów: rozrzut 0 A, schemat czeka, tabela doboru mówi dlaczego jest pusta", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Rozdzielnica", exact: true }).first().click();
  await page.getByRole("button", { name: /Zbuduj rozdzielnicę bez rzutu/ }).first().click();

  await expect(page.getByText(/Rozrzut między fazami: 0,0 A/)).toBeVisible();
  await expect(page.getByTestId("dobor-pusty")).toBeVisible();
  // Kafelek etapu 03: nazwą dostępnościową jest sam tytuł, a stan niesie `title`
  // (opis etapu) — plakietka „czeka/gotowy" jest aria-hidden.
  const schemat = page.getByRole("button", { name: "Schemat", exact: true });
  await expect(schemat).toHaveAttribute("title", /pierwszy wyłącznik/);

  // Pierwszy wyłącznik obwodu — schemat ma już co narysować.
  await page.getByRole("button", { name: "Dodaj", exact: true }).click();
  await expect(schemat).toHaveAttribute("title", /rysuje się z rozdzielnicy/);
});
