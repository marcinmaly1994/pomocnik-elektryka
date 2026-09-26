import type Konva from "konva";
import { test, expect, type Page } from "@playwright/test";
import { skipEntryScreen, otworzKatalogElementow } from "./_flow";

/**
 * Zwijanie panelu bocznego.
 *
 * Panel pokazuje opcje WYBRANEGO narzędzia (patrz `NaglowekNarzedzia`), a katalog
 * elementów należy do „Wstaw Element". Wcześniej panel miał stałe zakładki
 * „Elementy / Pomieszczenia", a wariant „panel idzie za narzędziem" był odrzucony
 * z obawy, że nowy użytkownik w domyślnym „Zaznacz" nie zobaczy śladu po katalogu.
 * Tę obawę pokrywa podpowiedź „Zaznacz" na pustej kondygnacji — z przyciskiem
 * „Postaw pierwszy element". Zostaje: zwijanie ręczne z zapamiętaniem, rozwijanie przy
 * sięgnięciu po narzędzie z własną treścią, i NIGDY automatyczne zamykanie.
 */

function biblioteka(page: Page) {
  return page.getByPlaceholder("Szukaj elementu…");
}

test("panel jest domyślnie widoczny — katalog nie jest schowany przed nowym użytkownikiem", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await skipEntryScreen(page);

  // Panel JEST rozwinięty od razu — i to jest treść tej decyzji (patrz nagłówek pliku).
  // Na pustej kondygnacji „Zaznacz" pokazuje drogę startu, a katalog jest jedno
  // kliknięcie stąd.
  await expect(page.getByTestId("panel-zaznacz")).toBeVisible();
  await page.getByRole("button", { name: "Postaw pierwszy element" }).click();
  await expect(biblioteka(page)).toBeVisible();
});

test("zwijanie i rozwijanie panelu uchwytem", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await skipEntryScreen(page);
  await otworzKatalogElementow(page);

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
  await skipEntryScreen(page);
  await otworzKatalogElementow(page);

  await page.getByRole("button", { name: "Zwiń panel boczny" }).click();
  await expect(biblioteka(page)).toHaveCount(0);

  await page.reload();
  await skipEntryScreen(page);
  // Bez sięgania po „Wstaw Element" — to narzędzie samo rozwija panel (patrz test niżej).
  await expect(page.getByTestId("naglowek-narzedzia")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Pokaż panel boczny" })).toBeVisible();
});

test("„Wstaw Element” rozwija zwinięty panel, ale inne narzędzia go nie zamykają", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await skipEntryScreen(page);
  await otworzKatalogElementow(page);

  await page.getByRole("button", { name: "Zwiń panel boczny" }).click();
  await expect(biblioteka(page)).toHaveCount(0);

  await page.getByRole("button", { name: "Wstaw Element", exact: true }).click();
  await expect(biblioteka(page)).toBeVisible();

  // Inne narzędzie zmienia TREŚĆ panelu, ale go nie zwija — panel zostaje na miejscu,
  // z opcjami tego narzędzia.
  await page.getByRole("button", { name: "Narysuj Ścianę", exact: true }).click();
  await expect(page.getByRole("button", { name: "Zwiń panel boczny" })).toBeVisible();
  await expect(page.getByTestId("naglowek-narzedzia")).toContainText("Narysuj Ścianę");

  await page.getByRole("button", { name: "Przesuń widok", exact: true }).click();
  await expect(page.getByTestId("panel-przesun")).toBeVisible();
});

test("„Narysuj Pomieszczenie” też rozwija zwinięty panel", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await skipEntryScreen(page);
  await otworzKatalogElementow(page);

  await page.getByRole("button", { name: "Zwiń panel boczny" }).click();
  await expect(biblioteka(page)).toHaveCount(0);

  await page.getByRole("button", { name: "Narysuj Pomieszczenie", exact: true }).click();
  await expect(page.getByTestId("liczba-pomieszczen")).toBeVisible();
});

test("zwijanie panelu nie przesuwa rysunku w widoku standardowym", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await skipEntryScreen(page);
  await otworzKatalogElementow(page);

  // Ręczne przybliżenie wyłącza automatyczne dopasowanie i sprawia, że rzut
  // przestaje się mieścić — dopiero wtedy jest co przewijać i dopiero wtedy
  // przesunięcie kolumny realnie przesuwa rysunek pod okiem użytkownika.
  for (let i = 0; i < 10; i++) await page.getByRole("button", { name: "Przybliż widok" }).click();
  await page.waitForTimeout(300);
  await page.evaluate(() => window.scrollTo(0, 0));

  const plotno = page.locator("[data-testid=plan-okno]").first();

  /**
   * Gdzie punkt planu (0, 0) wypada NA EKRANIE. Scena Konvy stoi w oknie planu
   * przesunięta o stan widoku, więc lewa krawędź okna plus przesunięcie sceny to
   * dokładnie to, co widzi użytkownik.
   *
   * Wcześniej liczyliśmy `scrollLeft - rect.left`, bo kadr wyznaczało przewinięcie
   * kontenera. Okno planu nie przewija się już wcale, a pytanie i tak brzmiało: czy
   * rysunek został w miejscu — więc pytamy o to wprost.
   */
  const pozycjaRysunku = async () => {
    const box = (await plotno.boundingBox())!;
    const przesuniecieSceny = await page.evaluate(
      () => (window as unknown as { Konva: { stages: Konva.Stage[] } }).Konva.stages[0].x(),
    );
    return Math.round(box.x + przesuniecieSceny);
  };

  const przed = await pozycjaRysunku();

  await page.getByRole("button", { name: "Zwiń panel boczny" }).click();
  await page.waitForTimeout(300);
  await page.evaluate(() => window.scrollTo(0, 0));
  expect(Math.abs((await pozycjaRysunku()) - przed)).toBeLessThan(4);

  // I z powrotem — rozwinięcie też nie może przestawiać kadru.
  await page.getByRole("button", { name: "Pokaż panel boczny" }).click();
  await page.waitForTimeout(300);
  await page.evaluate(() => window.scrollTo(0, 0));
  expect(Math.abs((await pozycjaRysunku()) - przed)).toBeLessThan(4);
});

test("zwinięty panel oddaje miejsce planowi", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await skipEntryScreen(page);
  await otworzKatalogElementow(page);

  const szerokoscKarty = async () =>
    (await page.locator('nav[aria-label="Narzędzia rysowania"]').locator("..").boundingBox())!.width;

  const przed = await szerokoscKarty();
  await page.getByRole("button", { name: "Zwiń panel boczny" }).click();
  const po = await szerokoscKarty();

  // Panel ma 268 px — po zwinięciu karta musi się skurczyć mniej więcej o tyle.
  expect(przed - po).toBeGreaterThan(200);
});
