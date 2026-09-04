import { test, expect } from "@playwright/test";

/**
 * Routing po History API.
 *
 * Do niedawna cała aplikacja żyła pod jednym adresem („/"), a zakładka była
 * zwykłym `useState`. Kosztowało to trzy rzeczy naraz: nie dało się nikomu wysłać
 * linku do konkretnego kalkulatora ani protokołu, „wstecz" wyrzucało ze strony
 * zamiast cofnąć o krok, a odświeżenie zawsze lądowało na zakładce startowej.
 *
 * Te testy MUSZĄ być e2e, a nie jednostkowe: samo mapowanie ścieżek pilnuje
 * `lib/routing.test.ts`, ale historia przeglądarki (pushState, popstate, przycisk
 * „wstecz", przeładowanie) istnieje tylko w prawdziwej przeglądarce.
 */

/** Świeży start bez pozostałości po poprzednim teście — zapisany kalkulator siedzi
 *  w localStorage i wpływa na to, dokąd prowadzi samo „/kalkulatory". */
async function czystyStart(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
}

test("link do konkretnego kalkulatora otwiera właśnie ten kalkulator", async ({ page }) => {
  await czystyStart(page);
  await page.goto("/kalkulatory/spadek");

  await expect(page.getByRole("heading", { name: "Spadek napięcia" })).toBeVisible();
  // adres ZOSTAJE — to on niesie widok, więc musi dać się skopiować z paska
  expect(new URL(page.url()).pathname).toBe("/kalkulatory/spadek");
});

test("link do konkretnego protokołu otwiera właśnie ten protokół", async ({ page }) => {
  await czystyStart(page);
  await page.goto("/protokoly/izolacja");

  await expect(page.getByRole("heading", { name: "Pomiar rezystancji izolacji" })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/protokoly/izolacja");
});

test("adres kalkulatora sprowadza się do postaci kanonicznej, ale wpisany małymi literami działa", async ({ page }) => {
  await czystyStart(page);
  // Część id jest camelCase („gGWkladka") i nikt nie przepisze tego z pamięci —
  // adres ma zadziałać, a w pasku ma zostać jedna, przewidywalna postać.
  await page.goto("/kalkulatory/ggwkladka");

  await expect(page.getByRole("heading", { name: "Dobór wkładki gG" })).toBeVisible();
  await expect(page).toHaveURL(/\/kalkulatory\/gGWkladka$/);
});

test("przejście między zakładkami zmienia adres, a „wstecz” cofa o krok zamiast wychodzić ze strony", async ({ page }) => {
  await czystyStart(page);
  await page.goto("/kalkulatory/spadek");

  await page.getByRole("button", { name: "Protokoły pomiarowe" }).click();
  await expect(page).toHaveURL(/\/protokoly\//);

  await page.goBack();

  // sedno: wracamy do POPRZEDNIEJ ZAKŁADKI, wciąż w aplikacji
  await expect(page).toHaveURL(/\/kalkulatory\/spadek$/);
  await expect(page.getByRole("heading", { name: "Spadek napięcia" })).toBeVisible();

  await page.goForward();
  await expect(page).toHaveURL(/\/protokoly\//);
});

test("wybór kalkulatora z listy to osobny wpis w historii", async ({ page }) => {
  await czystyStart(page);
  await page.goto("/kalkulatory/spadek");

  await page.getByRole("button", { name: /^Prądy zwarciowe/ }).click();
  await expect(page).toHaveURL(/\/kalkulatory\/zwarcie$/);

  await page.goBack();
  await expect(page).toHaveURL(/\/kalkulatory\/spadek$/);
  await expect(page.getByRole("heading", { name: "Spadek napięcia" })).toBeVisible();
});

test("odświeżenie zostawia użytkownika tam, gdzie był", async ({ page }) => {
  await czystyStart(page);
  await page.goto("/kosztorys");
  await expect(page.getByRole("heading", { name: /Kosztorys instalacji/ })).toBeVisible();

  await page.reload();

  // wcześniej przeładowanie zawsze wracało na zakładkę startową
  await expect(page).toHaveURL(/\/kosztorys$/);
  await expect(page.getByRole("heading", { name: /Kosztorys instalacji/ })).toBeVisible();
});

test("nieznany adres pokazuje stronę startową I poprawia się w pasku adresu", async ({ page }) => {
  await czystyStart(page);
  await page.goto("/nie-ma-takiej-strony");

  // Pasek adresu nie ma twierdzić, że jesteśmy pod adresem, którego nie ma —
  // inaczej skopiowany stamtąd link roznosiłby literówkę dalej.
  await expect(page).toHaveURL(/\/$/);
});

test("samo „/kalkulatory” uzupełnia się o ostatnio używany kalkulator, bez śmiecenia w historii", async ({ page }) => {
  await czystyStart(page);
  await page.goto("/kalkulatory/zwarcie");
  await expect(page.getByRole("heading", { name: "Prądy zwarciowe" })).toBeVisible();

  // powrót na goły adres zakładki — ma wrócić do ostatniego wyboru
  await page.goto("/kalkulatory");
  await expect(page).toHaveURL(/\/kalkulatory\/zwarcie$/);

  // Uzupełnienie adresu leci przez `replace`, więc NIE zostawia po sobie wpisu:
  // „wstecz" ma wyjść z tego widoku, a nie wrócić na „/kalkulatory", które
  // natychmiast przekierowałoby z powrotem (przycisk wyglądałby na zepsuty).
  await page.goBack();
  await expect(page).not.toHaveURL(/\/kalkulatory$/);
});
