import { test, expect, type Page } from "@playwright/test";
import { skipEntryScreen } from "./_flow";

/**
 * Menu kontekstowe otwierał wyłącznie prawy przycisk myszy — a w nim mieszka wszystko,
 * co się robi z zaznaczoną rzeczą: usuń, obróć, zatwierdź ścianę, utwórz ścianę z obrysu.
 * Drugą drogą do tych akcji są skróty `Delete`, `R` i `Enter`. Na telefonie nie ma ani
 * jednego, ani drugiego: dawało się narysować cały plan i nie dawało skasować niczego.
 *
 * Samo rysowanie dotykiem działa i działało — przeglądarka dorabia po `touchend`
 * zgodnościowe `mousedown`/`mouseup`/`click`, więc obsługa myszy odpala się normalnie.
 * To te dorobione zdarzenia są tu największym ryzykiem: menu nie może otwierać się
 * i jednocześnie stawiać pod sobą elementu.
 *
 * Stąd DOTYK PRAWDZIWY, przez CDP, a nie zdarzenia składane w `page.evaluate`: tylko
 * wtedy przeglądarka dorabia zgodnościowe zdarzenia i test ma czego pilnować. Playwright
 * sam potrafi jedynie `tap`, czyli dotknięcie bez przytrzymania.
 */

test.use({ hasTouch: true });

/**
 * Płótno mierzone NA NOWO przed każdym gestem.
 *
 * Postawienie elementu zmienia układ (pojawia się pasek kontekstowy nad rysunkiem)
 * i strona jedzie w pionie — współrzędne zmierzone wcześniej trafiały o ~50 px obok,
 * czyli w puste płótno zamiast w element.
 */
async function plan(page: Page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  return (await page.locator("[data-testid=plan-okno]").first().boundingBox())!;
}

/** Dotknięcie trzymane `ms` milisekund w jednym miejscu płótna. */
async function przytrzymaj(page: Page, dx: number, dy: number, ms = 700) {
  const box = await plan(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: box.x + dx, y: box.y + dy }],
  });
  await page.waitForTimeout(ms);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

/** Zwykłe dotknięcie płótna — bez przytrzymania. */
async function dotknij(page: Page, dx: number, dy: number) {
  const box = await plan(page);
  await page.touchscreen.tap(box.x + dx, box.y + dy);
}

async function otworzPlan(page: Page, narzedzie: string) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Instalacja" }).click();
  await skipEntryScreen(page);
  await page.getByRole("button", { name: narzedzie, exact: true }).click();
}

/**
 * Pozycja „Obróć o 90°" — pewny uchwyt na menu POJEDYNCZEGO elementu. Pozycja kasująca
 * nazywa się w nim po prostu „Usuń" i takich przycisków jest w aplikacji więcej.
 */
function menuElementu(page: Page) {
  return page.getByRole("button", { name: "Obróć o 90°" });
}

async function liczbaElementow(page: Page): Promise<number> {
  const pasek = await page.getByText(/Elementy:/).first().textContent();
  return Number(pasek!.match(/Elementy:\s*(\d+)/)![1]);
}

test("przytrzymanie elementu otwiera menu — jedyna droga do „Usuń” bez klawiatury", async ({ page }) => {
  await otworzPlan(page, "Wstaw Element");
  await dotknij(page, 150, 150);
  await expect.poll(() => liczbaElementow(page)).toBe(1);

  await przytrzymaj(page, 150, 150);
  await expect(menuElementu(page)).toBeVisible();

  // i menu naprawdę działa — kasowanie na telefonie było dotąd niemożliwe
  await page.getByRole("button", { name: "Usuń", exact: true }).tap();
  await expect.poll(() => liczbaElementow(page)).toBe(0);
});

/**
 * Sedno: dorobione kliknięcie przychodzi DOKŁADNIE tam, gdzie leżał palec, czyli pod
 * świeżo otwartym menu. Bez straży menu wstawałoby i natychmiast stawiało pod sobą
 * drugi element (patrz `pochlonEchoKliku` w useDlugiePrzytrzymanie.ts).
 */
test("otwarcie menu przytrzymaniem NIE stawia elementu pod spodem", async ({ page }) => {
  await otworzPlan(page, "Wstaw Element");
  await dotknij(page, 150, 150);
  await expect.poll(() => liczbaElementow(page)).toBe(1);

  await przytrzymaj(page, 150, 150);
  await expect(menuElementu(page)).toBeVisible();
  await page.waitForTimeout(400);
  expect(await liczbaElementow(page)).toBe(1);
});

/** Zwykłe dotknięcie ma dalej stawiać element — straż nie może połykać niczego więcej. */
test("zwykłe dotknięcie dalej stawia element, także zaraz po menu", async ({ page }) => {
  await otworzPlan(page, "Wstaw Element");
  await dotknij(page, 150, 150);
  await expect.poll(() => liczbaElementow(page)).toBe(1);

  await przytrzymaj(page, 150, 150);
  await expect(menuElementu(page)).toBeVisible();
  await page.keyboard.press("Escape");

  await dotknij(page, 320, 230);
  await expect.poll(() => liczbaElementow(page)).toBe(2);
});

/**
 * Ściana rysowana dotykiem nie miała jak zostać zatwierdzona bez przycisku „Zakończ":
 * Enter i prawy przycisk odpadają. Przytrzymanie na pustej scenie otwiera to samo menu.
 */
test("przytrzymanie na scenie zatwierdza rysowaną ścianę", async ({ page }) => {
  await otworzPlan(page, "Narysuj Ścianę");
  await dotknij(page, 80, 80);
  await dotknij(page, 250, 80);

  await przytrzymaj(page, 350, 200);
  await expect(page.getByRole("button", { name: /Zatwierdź ścianę/ })).toBeVisible();
  await page.getByRole("button", { name: /Zatwierdź ścianę/ }).tap();
  await page.waitForTimeout(900);

  const sciany = await page.evaluate(() => {
    const raw = localStorage.getItem("pomocnikelektryka_projekt_" + localStorage.getItem("pomocnikelektryka_projekt_biezacy"));
    return JSON.parse(raw!).draft.walls as unknown[];
  });
  expect(sciany).toHaveLength(1);
});
