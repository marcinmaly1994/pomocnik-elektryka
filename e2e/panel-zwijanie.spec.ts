import { test, expect, type Page } from "@playwright/test";

/**
 * Zwijanie panelu bocznego (Elementy / Pomieszczenia).
 *
 * Rozważaliśmy wariant, w którym panel pojawia się WYŁĄCZNIE przy narzędziach
 * „Wstaw Element" i „Narysuj Pomieszczenie". Odrzucony, bo biblioteka elementów
 * jest punktem STARTU (kliknięcie elementu samo włącza narzędzie), a domyślnym
 * trybem jest „Zaznacz" — nowy użytkownik zobaczyłby pusty plan bez śladu po
 * katalogu. Stąd: zwijanie ręczne z zapamiętaniem, automatyczne rozwijanie przy
 * sięgnięciu po narzędzie, i NIGDY automatyczne zamykanie.
 */

function biblioteka(page: Page) {
  return page.getByPlaceholder("Szukaj elementu…");
}

test("panel jest domyślnie widoczny — katalog nie jest schowany przed nowym użytkownikiem", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(biblioteka(page)).toBeVisible();
});

test("zwijanie i rozwijanie panelu uchwytem", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await page.getByRole("button", { name: "Zwiń panel boczny" }).click();
  await expect(biblioteka(page)).toHaveCount(0);

  // Zwinięty panel MUSI mieć widoczną drogę powrotu — inaczej jest pułapką.
  const pokaz = page.getByRole("button", { name: "Pokaż panel boczny" });
  await expect(pokaz).toBeVisible();
  await pokaz.click();
  await expect(biblioteka(page)).toBeVisible();
});

test("zwinięcie panelu przeżywa odświeżenie strony", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await page.getByRole("button", { name: "Zwiń panel boczny" }).click();
  await expect(biblioteka(page)).toHaveCount(0);

  await page.reload();
  await expect(biblioteka(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Pokaż panel boczny" })).toBeVisible();
});

test("„Wstaw Element” rozwija zwinięty panel, ale inne narzędzia go nie zamykają", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await page.getByRole("button", { name: "Zwiń panel boczny" }).click();
  await expect(biblioteka(page)).toHaveCount(0);

  await page.getByRole("button", { name: "Wstaw Element", exact: true }).click();
  await expect(biblioteka(page)).toBeVisible();

  // Sedno decyzji projektowej: narzędzie rysujące ściany NIE chowa biblioteki.
  // Automatyczne zamykanie zabierałoby ją dokładnie wtedy, gdy jest potrzebna —
  // zaraz po narysowaniu pomieszczenia stawia się w nim gniazdka.
  await page.getByRole("button", { name: "Narysuj Ścianę", exact: true }).click();
  await expect(biblioteka(page)).toBeVisible();

  await page.getByRole("button", { name: "Przesuń widok", exact: true }).click();
  await expect(biblioteka(page)).toBeVisible();
});

test("„Narysuj Pomieszczenie” też rozwija zwinięty panel", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await page.getByRole("button", { name: "Zwiń panel boczny" }).click();
  await expect(biblioteka(page)).toHaveCount(0);

  await page.getByRole("button", { name: "Narysuj Pomieszczenie", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Pomieszczenia \(/ })).toBeVisible();
});

test("zwinięty panel oddaje miejsce planowi", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  const szerokoscKarty = async () =>
    (await page.locator('nav[aria-label="Narzędzia rysowania"]').locator("..").boundingBox())!.width;

  const przed = await szerokoscKarty();
  await page.getByRole("button", { name: "Zwiń panel boczny" }).click();
  const po = await szerokoscKarty();

  // Panel ma 268 px — po zwinięciu karta musi się skurczyć mniej więcej o tyle.
  expect(przed - po).toBeGreaterThan(200);
});
