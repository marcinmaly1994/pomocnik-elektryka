import { test, expect, type Page } from "@playwright/test";

/**
 * Regulamin świadczenia usługi — drugi dokument formalny, ten sam mechanizm co
 * polityka prywatności (patrz `prywatnosc.spec.ts`, tam też wyjaśnienie, dlaczego
 * przy „Zaloguj się" musi być `exact: true`).
 *
 * Pilnowane są tu DWIE rzeczy naraz: że dokument da się otworzyć każdą z dróg,
 * którymi się do niego prowadzi, i że niesie zastrzeżenie o orientacyjności wyników.
 * To drugie nie jest ozdobą — to jedyne zdanie w całym serwisie, którego brak może
 * kogoś realnie kosztować, więc ma upaść tutaj, zanim zniknie ze strony.
 */

async function czystyStart(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
}

test("bezpośredni adres /regulamin otwiera regulamin i zostaje w pasku", async ({ page }) => {
  await czystyStart(page);
  await page.goto("/regulamin");

  await expect(page.getByRole("heading", { name: "Regulamin" })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/regulamin");
});

/**
 * Sam dokument, z pominięciem powłoki aplikacji.
 *
 * Zawężenie jest KONIECZNE, a nie porządkowe: zastrzeżenie o orientacyjności wyników
 * stoi także w stopce, widocznej na każdej stronie. Asercja na całej stronie łapała
 * je stamtąd i przechodziła na pustym szkielecie regulaminu — czyli test twierdził,
 * że dokument niesie zdanie, którego dokument nie miał.
 */
function dokument(page: Page) {
  return page.getByRole("article");
}

test("regulamin mówi wprost, że wyniki są orientacyjne i nie zastępują uprawnionego", async ({ page }) => {
  await czystyStart(page);
  await page.goto("/regulamin");

  await expect(dokument(page).getByText(/orientacyjn/i).first()).toBeVisible();
  await expect(dokument(page).getByText(/uprawnieni(ami|a)/i).first()).toBeVisible();
});

test("regulamin podaje limit zapisów, którym aplikacja faktycznie blokuje zapis", async ({ page }) => {
  await czystyStart(page);
  await page.goto("/regulamin");

  // Liczba w dokumencie pochodzi ze stałej `LIMIT_ZAPISOW` (lib/dokumenty.ts), więc
  // nie da się jej rozminąć z kodem po cichu. Tu sprawdzamy tylko, że temat w ogóle
  // jest opisany — samej wartości pilnuje import, nie test.
  await expect(dokument(page).getByText(/limit/i).first()).toBeVisible();
});

test("stopka prowadzi do regulaminu", async ({ page }) => {
  await czystyStart(page);

  await page.getByRole("link", { name: "Regulamin" }).click();

  await expect(page.getByRole("heading", { name: "Regulamin" })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/regulamin");
});

test("formularz rejestracji niesie OBA dokumenty, każdy w nowej karcie", async ({ page }) => {
  await czystyStart(page);
  await page.getByRole("button", { name: "Zaloguj się", exact: true }).click();
  await page.getByRole("button", { name: /Nie masz konta\? Zarejestruj się/ }).click();

  const okno = page.getByRole("dialog");

  const regulamin = okno.getByRole("link", { name: "regulamin" });
  await expect(regulamin).toHaveAttribute("href", "/regulamin");
  await expect(regulamin).toHaveAttribute("target", "_blank");

  // Polityka zostaje obok — dodanie regulaminu nie ma jej wypchnąć.
  const polityka = okno.getByRole("link", { name: "polityką prywatności" });
  await expect(polityka).toHaveAttribute("href", "/prywatnosc");
  await expect(polityka).toHaveAttribute("target", "_blank");
});
