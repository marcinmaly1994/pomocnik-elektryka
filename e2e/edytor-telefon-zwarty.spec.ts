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

/**
 * Zwinięty przewodnik „Zacznij w 3 krokach” nie leży na pasku stanu.
 *
 * Przypięty w lewym dolnym rogu ekranu wypadał na telefonie dokładnie na pasku stanu
 * edytora — ten po przewinięciu do rysunku stoi przy dolnej krawędzi — i zasłaniał
 * „Zapisano” tuż obok „Dalej”. Na telefonie stoi teraz w zwykłym przepływie, pod edytorem.
 */
test("zwinięty przewodnik nie zasłania paska stanu", async ({ page }) => {
  await start(page);
  await wczytajPrzyklad(page, "mieszkanie");
  await pomiar(page);
  const przewodnik = (await page.getByRole("button", { name: /Otwórz przewodnik/ }).boundingBox())!;
  const stan = (await page.getByLabel("Stan projektu").boundingBox())!;
  expect(przewodnik.y, "przewodnik ma stać pod paskiem stanu, nie na nim").toBeGreaterThanOrEqual(stan.y + stan.height);
  // I nadal działa: otwiera kartę.
  await page.getByRole("button", { name: /Otwórz przewodnik/ }).click();
  await expect(page.getByRole("complementary", { name: /Zacznij w 3 krokach/i })).toBeVisible();
});

/**
 * Rysowanie ściany PALCEM: rzut nie ucieka spod palca, a „Zakończ" jest w kadrze.
 *
 * Kontrolki rysowania mieszkały w panelu, który na telefonie stoi NAD rzutem —
 * a przy pierwszym punkcie ściany panel rozwijał się sam. Zmierzone: rzut zjeżdżał
 * o 261 px (ze 142 na 403), więc kolejne narożniki trafiały w panel i z pięciu dotknięć
 * ściana dostawała dwa punkty. Teraz kontrolki pływają nad dolną krawędzią rzutu.
 */
test("ściana rysowana palcem: każdy narożnik trafia, „Zakończ” w kadrze", async ({ page }) => {
  await start(page);
  await page.getByRole("button", { name: "Narysuj dom samodzielnie" }).first().click();
  await pomiar(page);
  const rozumiem = page.getByRole("button", { name: "Rozumiem" });
  if (await rozumiem.count()) await rozumiem.click();

  const okno = page.locator("[data-plan-okno]");
  const start0 = (await okno.boundingBox())!;
  for (const [x, y] of [
    [60, 80],
    [280, 80],
    [280, 300],
    [60, 300],
  ]) {
    await page.touchscreen.tap(start0.x + x, start0.y + y);
    await page.waitForTimeout(250);
    expect((await okno.boundingBox())!.y, "rzut nie może się ruszyć w trakcie rysowania").toBeCloseTo(start0.y, 0);
  }
  await expect(page.getByText("Rysowanie ściany: 4 pkt.")).toBeVisible();

  // „Zakończ" w kadrze i niczym nieprzykryty — na telefonie to jedyne (obok
  // przytrzymania palca) wyjście z rysowania.
  const zakoncz = page.getByRole("button", { name: "Zakończ" });
  const b = (await zakoncz.boundingBox())!;
  expect(b.x + b.width).toBeLessThanOrEqual(375);
  expect(b.y + b.height).toBeLessThanOrEqual(812);
  const trafiony = await page.evaluate(
    ([x, y]) => document.elementFromPoint(x, y)?.closest("button")?.textContent ?? "",
    [b.x + b.width / 2, b.y + b.height / 2]
  );
  expect(trafiony).toBe("Zakończ");
  await zakoncz.tap();
  await expect.poll(() =>
    page.evaluate(() => {
      const raw = localStorage.getItem("pomocnikelektryka_projekt_" + localStorage.getItem("pomocnikelektryka_projekt_biezacy"));
      return raw ? (JSON.parse(raw).draft.walls as unknown[]).length : 0;
    })
  ).toBe(1);
});
