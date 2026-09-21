import { test, expect, type Page } from "@playwright/test";

/**
 * Zaznaczenie wielokrotne bez klawiatury.
 *
 * Miało dotąd dwie drogi i obie wymagały czegoś, czego telefon nie ma: Shift z
 * kliknięciem albo ramkę przeciągniętą myszą. Przeciągnięcie palcem dochodzi do płótna
 * jako JEDNO kliknięcie po oderwaniu palca (przeglądarka dorabia zgodnościowe zdarzenia
 * myszy dopiero wtedy), więc ramka nie ma z czego rosnąć — zmierzone: ten sam gest daje
 * myszą „Zaznaczono: 3", a palcem nic.
 *
 * Bez zaznaczenia wielokrotnego nie ma wyrównywania, rozkładania, duplikowania ani
 * „Usuń zaznaczone" — czyli na telefonie nie dało się skasować dwóch gniazdek naraz.
 */

test.use({ hasTouch: true });

async function planBox(page: Page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  return (await page.locator("[data-testid=plan-okno]").first().boundingBox())!;
}

async function pustyProjekt(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByRole("heading", { name: "Zaprojektuj instalację elektryczną w swoim domu" })).toBeVisible();
  await page.getByRole("button", { name: "Narysuj dom samodzielnie" }).click();
  const rozumiem = page.getByRole("button", { name: "Rozumiem" });
  if (await rozumiem.count()) await rozumiem.click();
}

/** Trzy gniazdka, stawiane tak jak stawia je użytkownik. */
async function postawTrzy(page: Page) {
  await page.getByRole("button", { name: "Wstaw Element" }).click();
  await page.getByRole("button", { name: /Gniazdo 230 V/ }).click();
  for (const [x, y] of [[150, 200], [250, 215], [400, 190]]) {
    const box = await planBox(page);
    await page.mouse.click(box.x + x, box.y + y);
  }
  await page.waitForTimeout(900);
}

const przelacznik = (page: Page) => page.getByTestId("zaznacz-kilka");

test("przełącznik zamienia kolejne kliknięcia w dokładanie do zaznaczenia", async ({ page }) => {
  await pustyProjekt(page);
  await postawTrzy(page);
  await page.getByRole("button", { name: "Zaznacz", exact: true }).click();

  // bez przełącznika każde kliknięcie zaczyna zaznaczenie od nowa
  let box = await planBox(page);
  await page.mouse.click(box.x + 150, box.y + 200);
  await page.mouse.click(box.x + 250, box.y + 215);
  await expect(page.getByText(/Zaznaczono:/)).toHaveCount(0);

  await przelacznik(page).click();
  await expect(przelacznik(page)).toHaveAttribute("aria-pressed", "true");

  box = await planBox(page);
  await page.mouse.click(box.x + 150, box.y + 200);
  await page.mouse.click(box.x + 250, box.y + 215);
  await page.mouse.click(box.x + 400, box.y + 190);
  await expect(page.getByText(/Zaznaczono: 3/)).toBeVisible();

  // ponowne kliknięcie WYJMUJE z zaznaczenia — tak samo jak Shift z kliknięciem
  box = await planBox(page);
  await page.mouse.click(box.x + 400, box.y + 190);
  await expect(page.getByText(/Zaznaczono: 2/)).toBeVisible();
});

test("zaznaczone DOTYKIEM da się skasować — bez klawiatury i bez myszy", async ({ page }) => {
  await pustyProjekt(page);
  await postawTrzy(page);
  await page.getByRole("button", { name: "Zaznacz", exact: true }).click();
  await przelacznik(page).tap();

  for (const [x, y] of [[150, 200], [250, 215]]) {
    const box = await planBox(page);
    await page.touchscreen.tap(box.x + x, box.y + y);
  }
  await expect(page.getByText(/Zaznaczono: 2/)).toBeVisible();

  await page.getByRole("button", { name: /Usuń zaznaczone \(2\)/ }).tap();
  await page.waitForTimeout(900);
  const ile = await page.evaluate(() => {
    const raw = localStorage.getItem("pomocnikelektryka_projekt_" + localStorage.getItem("pomocnikelektryka_projekt_biezacy"));
    return JSON.parse(raw!).draft.elements.length as number;
  });
  expect(ile).toBe(1);
});

/**
 * Zostawiony włączony byłby pułapką: po powrocie do „Zaznacz" kliknięcie dokładałoby
 * element do zaznaczenia sprzed kwadransa, bez żadnego widocznego powodu.
 */
test("zmiana narzędzia gasi przełącznik", async ({ page }) => {
  await pustyProjekt(page);
  await postawTrzy(page);
  await page.getByRole("button", { name: "Zaznacz", exact: true }).click();
  await przelacznik(page).click();
  await expect(przelacznik(page)).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Narysuj Ścianę", exact: true }).click();
  await page.getByRole("button", { name: "Zaznacz", exact: true }).click();
  await expect(przelacznik(page)).toHaveAttribute("aria-pressed", "false");
});

/**
 * Odkryte przy okazji i groźniejsze niż samo zaznaczenie wielokrotne: dotknięcie
 * stojącego gniazdka NIE ZAZNACZAŁO GO WCALE.
 *
 * Element jest przeciągalny, a obsługa przeciągania w Konvie gasi domyślne zachowanie
 * dotknięcia — dorobiony `click`, na którym stoi cała reszta obsługi dotyku, na
 * elemencie nigdy nie przychodził. Docierał wyłącznie `tap`, którego nikt nie słuchał.
 *
 * Zaznaczenie sprawdzamy przez SKUTEK: zaznaczony element daje się usunąć klawiszem
 * Delete, a niezaznaczony nie daje się wcale.
 */
test("dotknięcie elementu w ogóle go zaznacza", async ({ page }) => {
  await pustyProjekt(page);
  await postawTrzy(page);
  await page.getByRole("button", { name: "Zaznacz", exact: true }).click();

  const box = await planBox(page);
  await page.touchscreen.tap(box.x + 150, box.y + 200);
  await page.waitForTimeout(300);
  await page.keyboard.press("Delete");
  await page.waitForTimeout(900);

  const ile = await page.evaluate(() => {
    const raw = localStorage.getItem("pomocnikelektryka_projekt_" + localStorage.getItem("pomocnikelektryka_projekt_biezacy"));
    return JSON.parse(raw!).draft.elements.length as number;
  });
  expect(ile).toBe(2);
});
