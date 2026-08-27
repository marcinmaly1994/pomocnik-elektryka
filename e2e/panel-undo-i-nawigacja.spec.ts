import { test, expect } from "@playwright/test";

/**
 * Dwa niezależne zgłoszenia z jednej wiadomości:
 *  - w Rozdzielnicy jedyną drogą do cofnięcia ręcznego kasowania aparatu było
 *    „Odbuduj z rzutu”, które liczy WSZYSTKO od zera — zbyt duży młotek;
 *  - nawigacja między krokami (Instalacja→Rozdzielnica→Schemat→Kosztorys) nie miała
 *    żadnego oczywistego „co dalej”, tylko małe kafle na samej górze strony.
 */

test("Rozdzielnica: „Cofnij”/„Ponów” działają niezależnie od cofania na planie", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const pomin = page.getByRole("button", { name: "Pomiń — ustawię później" });
  if (await pomin.count()) await pomin.click();

  await page.getByRole("button", { name: "Rozdzielnica", exact: true }).click();
  await page.getByRole("button", { name: "Zbuduj rozdzielnicę bez rzutu" }).click();

  const cofnij = page.getByRole("button", { name: "Cofnij", exact: true });
  const ponow = page.getByRole("button", { name: "Ponów", exact: true });
  // Świeża rozdzielnica (sam rozłącznik główny) — nic jeszcze nie ma do cofnięcia.
  await expect(cofnij).toBeDisabled();
  await expect(ponow).toBeDisabled();

  await page.getByRole("button", { name: "Dodaj", exact: true }).click();
  await page.getByRole("button", { name: "Dodaj", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Aparaty (3)" })).toBeVisible();
  await expect(cofnij).toBeEnabled();

  // Kasowanie aparatu (nie głównego) — pierwszy wiersz na liście, który ma kosz.
  const wiersze = page.locator("div.flex.items-center.gap-2.rounded-md.border");
  await wiersze.nth(1).locator("button").last().click();
  await expect(page.getByRole("heading", { name: "Aparaty (2)" })).toBeVisible();

  // To jest sedno zgłoszenia: cofnięcie POJEDYNCZEGO kasowania, bez utraty reszty
  // pracy (co robiłoby „Odbuduj z rzutu”).
  await cofnij.click();
  await expect(page.getByRole("heading", { name: "Aparaty (3)" })).toBeVisible();
  await expect(ponow).toBeEnabled();

  await ponow.click();
  await expect(page.getByRole("heading", { name: "Aparaty (2)" })).toBeVisible();
});

test("duży przycisk „Dalej” prowadzi po kolei przez wszystkie kroki", async ({ page }) => {
  await page.goto("/");

  const dalej = page.getByRole("button", { name: /^Dalej:/ });
  await expect(dalej).toHaveText("Dalej: Rozdzielnica");
  await dalej.click();
  await expect(page.getByRole("heading", { name: "Rozdzielnica elektryczna" })).toBeVisible();

  await expect(dalej).toHaveText("Dalej: Schemat");
  await dalej.click();
  await expect(dalej).toHaveText("Dalej: Kosztorys");
  await dalej.click();

  // Na ostatnim kroku przepływu nie ma dokąd iść dalej.
  await expect(page.getByRole("button", { name: /^Dalej:/ })).toHaveCount(0);
});

test("przycisk „Dalej” nie pojawia się poza głównym przepływem (Kalkulatory)", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Kalkulatory" }).click();
  await expect(page.getByRole("button", { name: /^Dalej:/ })).toHaveCount(0);
});
