import { test, expect, type Page } from "@playwright/test";

/**
 * Strona „Prywatność i dane" i trzy drogi, którymi się na nią wchodzi.
 *
 * Powód istnienia strony jest prawny (obowiązek informacyjny RODO, art. 13), ale
 * powód istnienia TYCH testów jest zwyczajny: dokument, do którego nie prowadzi
 * żaden działający link, jest tym samym co dokument, którego nie ma. Każde z trzech
 * wejść — stopka, Pomoc, formularz rejestracji — sprawdzane jest osobno, bo każde
 * działa inaczej (nawigacja, zamknięcie okna, nowa karta).
 */

/**
 * `exact: true` przy „Pomoc" i „Zaloguj się" nie jest ozdobą.
 *
 * Playwright dopasowuje nazwę roli FRAGMENTEM, więc „Pomoc" łapie także przycisk
 * marki („pomocnikelektryka.pl — wróć do projektowania instalacji"), a `.first()`
 * wybiera w kolejności DOM właśnie jego. Klik trafiał wtedy w logo, okno się nie
 * otwierało, a test pokazywał palcem na aplikację zamiast na własny lokator.
 */
async function czystyStart(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
}

test("bezpośredni adres /prywatnosc otwiera politykę i zostaje w pasku", async ({ page }) => {
  await czystyStart(page);
  await page.goto("/prywatnosc");

  await expect(page.getByRole("heading", { name: "Prywatność i dane" })).toBeVisible();
  // Adres ma ZOSTAĆ — to na niego prowadzi link z rejestracji otwierany w nowej karcie
  // i to jego kopiuje się z paska, żeby komuś wysłać.
  expect(new URL(page.url()).pathname).toBe("/prywatnosc");
});

test("polityka mówi wprost, że aplikacja nie używa ciasteczek ani śledzenia", async ({ page }) => {
  await czystyStart(page);
  await page.goto("/prywatnosc");

  // Zdanie, po które ktoś tu w ogóle przychodzi. Gdyby kiedyś doszło narzędzie
  // analityczne, ten test ma upaść ZANIM zdanie stanie się nieprawdą.
  await expect(page.getByText(/nie używa (plików )?cookies|nie używamy plików cookies/i)).toBeVisible();
});

test("stopka prowadzi do polityki z każdej zakładki", async ({ page }) => {
  await czystyStart(page);

  await page.getByRole("link", { name: /Prywatność i dane/ }).click();

  await expect(page.getByRole("heading", { name: "Prywatność i dane" })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/prywatnosc");
});

test("Pomoc ma sekcję „Twoje dane”, a link z niej zamyka okno i otwiera politykę", async ({ page }) => {
  await czystyStart(page);
  await page.getByRole("button", { name: "Pomoc", exact: true }).click();

  const okno = page.getByRole("dialog");
  await expect(okno).toBeVisible();
  await expect(okno.getByRole("heading", { name: "Twoje dane" })).toBeVisible();

  await okno.getByRole("button", { name: /polityk/i }).click();

  // Okno musi ZNIKNĄĆ: zostawione nad stroną zasłania dokument, po który się kliknęło.
  await expect(okno).toBeHidden();
  await expect(page.getByRole("heading", { name: "Prywatność i dane" })).toBeVisible();
});

test("formularz rejestracji niesie link do polityki, otwierany w NOWEJ karcie", async ({ page }) => {
  await czystyStart(page);
  await page.getByRole("button", { name: "Zaloguj się", exact: true }).click();
  await page.getByRole("button", { name: /Nie masz konta\? Zarejestruj się/ }).click();

  const okno = page.getByRole("dialog");
  const link = okno.getByRole("link", { name: "polityką prywatności" });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", "/prywatnosc");
  // Nowa karta, bo nawigacja w tej samej zamknęłaby okno razem z wpisanym już
  // adresem e-mail i hasłem — czyli kara za przeczytanie tego, co się podpisuje.
  await expect(link).toHaveAttribute("target", "_blank");
});

test("informacja o zgodzie pokazuje się przy zakładaniu konta, a nie przy logowaniu", async ({ page }) => {
  await czystyStart(page);
  await page.getByRole("button", { name: "Zaloguj się", exact: true }).click();

  const okno = page.getByRole("dialog");
  // Logowanie to nie moment zawierania umowy — zdanie o zgodzie byłoby tu szumem.
  await expect(okno.getByRole("link", { name: "polityką prywatności" })).toBeHidden();
});
