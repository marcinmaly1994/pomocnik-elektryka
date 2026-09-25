import { test, expect, type Page } from "@playwright/test";
import { wczytajPrzyklad } from "./_flow";

/**
 * Edytor na telefonie: rzut na większość ekranu, pasek stanu z „Dalej" w kadrze.
 *
 * Zmierzone przed zmianą (375 × 812): nad rzutem stały nagłówek (95 px), pasek etapów
 * (90), pasek edytora w dwóch rzędach (78), pasek narzędzi (74) i baner „Mało miejsca
 * na rysunek?" (44). Rzut zaczynał się 487 px od góry i miał 360 px — dolną granicę —
 * a na starcie widać było z niego ok. 325 px.
 *
 * EMULACJA TELEFONU (`isMobile`), nie samo wąskie okno: tylko w niej wychodzi, że
 * `window.innerWidth` skacze w chwili wejścia do edytora do 1024 (płótno przed pomiarem
 * rozpychało stronę), przez co przewinięcie do rysunku nie odpalało na telefonie nigdy.
 * Test w zwykłym wąskim oknie tego nie widział.
 */

test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

async function pomiar(page: Page) {
  // Przewijanie jest płynne i dosuwane po zakończeniu — czekamy, aż edytor stanie u góry.
  await expect
    .poll(() => page.evaluate(() => Math.round(document.querySelector("[data-plan-okno]")?.getBoundingClientRect().top ?? 9999)), {
      timeout: 4000,
    })
    .toBeLessThan(200);
  await page.waitForTimeout(300);
  return page.evaluate(() => {
    const plotno = document.querySelector("[data-plan-okno]")!.getBoundingClientRect();
    const stan = document.querySelector('[aria-label="Stan projektu"]')!.getBoundingClientRect();
    return { plotnoGora: plotno.top, plotnoWys: plotno.height, stanDol: stan.bottom };
  });
}

async function start(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
}

test("„Narysuj dom samodzielnie”: rzut na większość ekranu, pasek stanu w kadrze", async ({ page }) => {
  await start(page);
  await page.getByRole("button", { name: "Narysuj dom samodzielnie" }).first().click();
  const m = await pomiar(page);
  expect(m.plotnoWys).toBeGreaterThan(500);
  expect(m.stanDol).toBeLessThanOrEqual(812);
});

test("przykład: rzut na większość ekranu, pasek stanu w kadrze", async ({ page }) => {
  await start(page);
  await wczytajPrzyklad(page, "mieszkanie");
  const m = await pomiar(page);
  expect(m.plotnoWys).toBeGreaterThan(500);
  expect(m.stanDol).toBeLessThanOrEqual(812);
});

/** Jeden rząd — i to w nim widać cofanie i powiększenie, a nie tylko trzy menu. */
test("pasek edytora to jeden rząd z widocznym powiększeniem", async ({ page }) => {
  await start(page);
  await page.getByRole("button", { name: "Narysuj dom samodzielnie" }).first().click();
  await pomiar(page);
  const powiekszenie = (await page.getByRole("button", { name: /Powiększenie \d+ procent/ }).boundingBox())!;
  const plan = (await page.getByRole("button", { name: "Plan", exact: true }).boundingBox())!;
  expect(Math.abs(powiekszenie.y - plan.y)).toBeLessThan(10);
  expect(powiekszenie.x + powiekszenie.width).toBeLessThanOrEqual(375);
});

/** Pasek przewija się w poziomie, więc przycinałby panel menu zawieszony pod przyciskiem. */
test("menu „Plan” otwiera się w całości, a nie przycięte do paska", async ({ page }) => {
  await start(page);
  await page.getByRole("button", { name: "Narysuj dom samodzielnie" }).first().click();
  await pomiar(page);
  // Dymek wprowadzający ("Klikaj kolejne narożniki…") leży nad wszystkim, także nad
  // menu — to jego zamierzona rola. Zamykamy go jak użytkownik, zanim sięgniemy do menu.
  const rozumiem = page.getByRole("button", { name: "Rozumiem" });
  if (await rozumiem.count()) await rozumiem.click();
  await page.getByRole("button", { name: "Plan", exact: true }).click();
  const dodaj = page.getByRole("button", { name: /Dodaj kondygnację/ });
  await expect(dodaj).toBeVisible();
  // Widoczny naprawdę: element w tym punkcie ekranu to on sam, nie coś, co go przykrywa.
  const box = (await dodaj.boundingBox())!;
  const trafiony = await page.evaluate(
    ([x, y]) => document.elementFromPoint(x, y)?.closest("button")?.textContent ?? "",
    [box.x + box.width / 2, box.y + box.height / 2]
  );
  expect(trafiony).toContain("Dodaj kondygnację");
});

test("baner „Mało miejsca na rysunek?” zniknął — pełny ekran jest w pasku", async ({ page }) => {
  await start(page);
  await page.getByRole("button", { name: "Narysuj dom samodzielnie" }).first().click();
  await pomiar(page);
  await expect(page.getByText("Mało miejsca na rysunek?")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Projektowanie na pełnym ekranie" })).toHaveCount(1);
});
