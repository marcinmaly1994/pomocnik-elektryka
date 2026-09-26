import { test, expect, type Page } from "@playwright/test";
import { skipEntryScreen } from "./_flow";

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
  // Po etykiecie, nie po klasach wiersza — te zmieniają się razem z układem.
  await page.getByRole("button", { name: /^Usuń aparat / }).first().click();
  await expect(page.getByRole("heading", { name: "Aparaty (2)" })).toBeVisible();

  // To jest sedno zgłoszenia: cofnięcie POJEDYNCZEGO kasowania, bez utraty reszty
  // pracy (co robiłoby „Odbuduj z rzutu”).
  await cofnij.click();
  await expect(page.getByRole("heading", { name: "Aparaty (3)" })).toBeVisible();
  await expect(ponow).toBeEnabled();

  await ponow.click();
  await expect(page.getByRole("heading", { name: "Aparaty (2)" })).toBeVisible();
});


/**
 * Sadza w projekcie JEDNĄ ścianę, żeby przestał być pusty.
 *
 * Pigułka „Dalej" nie pokazuje się na projekcie, w którym nie ma jeszcze niczego
 * (patrz `projektPusty` w App.tsx) — rozdzielnica bez ani jednego odbiornika nie ma
 * czego dobrać, więc zachęta do przejścia dalej wysyłałaby nowego użytkownika w puste
 * ekrany. Testy nawigacji dotyczą PRZEPŁYWU, nie tego progu, więc zaczynają od
 * projektu, w którym coś jest.
 */
async function zacznijProjekt(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Instalacja" }).click();
  await skipEntryScreen(page);
  await page.getByRole("button", { name: "Narysuj Ścianę", exact: true }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  const box = (await page.locator("[data-testid=plan-okno]").first().boundingBox())!;
  await page.mouse.click(box.x + 100, box.y + 100);
  await page.mouse.click(box.x + 250, box.y + 100);
  await page.getByRole("button", { name: "Zakończ" }).click();
}

test("na PUSTYM projekcie nie ma dokąd iść dalej — pigułka się nie pokazuje", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByRole("button", { name: /^Dalej:/ })).toHaveCount(0);

  // Pierwsza narysowana ściana to już projekt — skrót wraca.
  await zacznijProjekt(page);
  await expect(page.getByRole("button", { name: /^Dalej:/ })).toHaveText("Dalej: Rozdzielnica");
});

/**
 * Próg pustego projektu dotyczy WYŁĄCZNIE Instalacji.
 *
 * Rozdzielnicę da się złożyć ręcznie, bez rysowania czegokolwiek — aparaty żyją wtedy
 * w `panelDevices`, nie w `draft`, więc rzut zostaje pusty. Gdyby próg liczony
 * z zawartości RZUTU obowiązywał też tutaj, zabierałby „Dalej: Schemat" komuś, kto ma
 * pełną rozdzielnicę i schemat MA z czego powstać.
 */
test("ręcznie złożona rozdzielnica ma dokąd iść dalej, choć rzut jest pusty", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Rozdzielnica", exact: true }).click();
  await page.getByRole("button", { name: "Zbuduj rozdzielnicę bez rzutu" }).click();
  await expect(page.getByRole("heading", { name: /Aparaty \(\d+\)/ })).toBeVisible();

  await expect(page.getByRole("button", { name: /^Dalej:/ })).toHaveText("Dalej: Schemat");
});

test("przycisk „Dalej” prowadzi po kolei przez wszystkie kroki", async ({ page }) => {
  await zacznijProjekt(page);

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

test("przycisk „Cofnij” wraca po kolei przez wszystkie kroki i znika na pierwszym", async ({ page }) => {
  await zacznijProjekt(page);

  // Na pierwszym kroku ("Instalacja") nie ma dokąd się cofnąć.
  await expect(page.getByRole("button", { name: /^Cofnij:/ })).toHaveCount(0);

  await page.getByRole("button", { name: /^Dalej:/ }).click();
  const cofnij = page.getByRole("button", { name: /^Cofnij:/ });
  await expect(cofnij).toHaveText("Cofnij: Instalacja");

  await page.getByRole("button", { name: /^Dalej:/ }).click();
  await expect(cofnij).toHaveText("Cofnij: Rozdzielnica");

  await cofnij.click();
  await expect(page.getByRole("heading", { name: "Rozdzielnica elektryczna" })).toBeVisible();
});

test("przycisk „Cofnij” nie pojawia się poza głównym przepływem (Kalkulatory)", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Kalkulatory" }).click();
  await expect(page.getByRole("button", { name: /^Cofnij:/ })).toHaveCount(0);
});
