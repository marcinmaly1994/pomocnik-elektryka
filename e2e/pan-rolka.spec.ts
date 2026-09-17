import { test, expect, type Page } from "@playwright/test";
import type Konva from "konva";
import { skipEntryScreen, otworzKatalogElementow } from "./_flow";

/**
 * Przesuwanie planu wciśniętą rolką myszy — konwencja z programów CAD, działająca
 * niezależnie od wybranego narzędzia.
 *
 * Testy sprawdzają dwie rzeczy naraz: że gest PRZESUWA widok i że przy okazji
 * NICZEGO nie rysuje. Ta druga część jest tu ważniejsza — środkowy przycisk
 * przechodził wcześniej tą samą drogą co lewy, więc bez zabezpieczenia
 * przesuwanie planu stawiałoby elementy albo zaczynało zaznaczanie obszarem.
 */

/** Okno planu — stały wycinek ekranu, w którym widać rysunek. */
function plotno(page: Page) {
  return page.locator("[data-testid=plan-okno]").first();
}

/**
 * Gdzie rysunek stoi na ekranie i jak jest powiększony.
 *
 * Czytamy transformację ŻYWEJ sceny Konvy, bo to ona ostatecznie decyduje, co widzi
 * użytkownik. Wcześniej te testy pytały o `scrollLeft` kontenera, ale okno planu nie
 * przewija się już wcale: ma stały rozmiar, a przesuwanie zmienia stan widoku.
 * Pytanie „gdzie wylądował rysunek" jest zresztą trwalsze od pytania „którym
 * mechanizmem go tam przesunięto" — przeżyje następną przebudowę.
 */
async function polozenieRysunku(page: Page) {
  return page.evaluate(() => {
    const scena = (window as unknown as { Konva: { stages: Konva.Stage[] } }).Konva.stages[0];
    return { x: scena.x(), y: scena.y(), skala: scena.scaleX() };
  });
}

/** Przybliża rzut, żeby przesuwanie miało widoczny skutek. */
async function przyblizIZwrocBox(page: Page) {
  for (let i = 0; i < 12; i++) await page.getByRole("button", { name: "Przybliż widok" }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  return (await plotno(page).boundingBox())!;
}

/** Przeciąga z punktu o zadany wektor i zwraca, o ile przesunął się rysunek. */
async function przeciagnij(
  page: Page,
  od: { x: number; y: number },
  o: { dx: number; dy: number },
  opcje: { przycisk?: "left" | "middle" } = {},
) {
  const przycisk = opcje.przycisk ?? "left";
  const przed = await polozenieRysunku(page);
  await page.mouse.move(od.x, od.y);
  await page.mouse.down({ button: przycisk });
  await page.mouse.move(od.x + o.dx, od.y + o.dy, { steps: 8 });
  await page.mouse.up({ button: przycisk });
  // Scena nie przerysowuje się w tym samym takcie co gest: stan widoku → render
  // Reacta → redraw Konvy. Odczyt bez tej chwili łapał czasem przedostatni krok
  // przeciągania i wychodziło 7/8 zadanego wektora.
  await page.waitForTimeout(150);
  const po = await polozenieRysunku(page);
  return { dx: Math.round(po.x - przed.x), dy: Math.round(po.y - przed.y) };
}

test("przytrzymana rolka przesuwa plan", async ({ page }) => {
  await page.goto("/");
  await skipEntryScreen(page);
  const box = await przyblizIZwrocBox(page);

  // Ciągniemy w prawo i w dół — rysunek jedzie ZA kursorem, co do piksela.
  const ruch = await przeciagnij(
    page,
    { x: box.x + box.width / 2, y: box.y + box.height / 2 },
    { dx: 120, dy: 80 },
    { przycisk: "middle" },
  );
  expect(ruch).toEqual({ dx: 120, dy: 80 });
});

test("przesuwanie rolką nie stawia elementu ani nie rysuje", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await skipEntryScreen(page);
  await page.getByRole("button", { name: "Instalacja" }).click();
  await skipEntryScreen(page);

  // Najgorszy możliwy przypadek: aktywne narzędzie stawiające elementy.
  await otworzKatalogElementow(page);
  await page.getByRole("button", { name: /Gniazdo 230 V/ }).first().click();
  const box = await przyblizIZwrocBox(page);

  await page.mouse.move(box.x + 250, box.y + 200);
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(box.x + 150, box.y + 120, { steps: 6 });
  await page.mouse.up({ button: "middle" });

  await page.waitForTimeout(900); // debounce autozapisu
  const zapisane = await page.evaluate(() => {
    const raw = localStorage.getItem("pomocnikelektryka_projekt_autosave");
    if (!raw) return { elementy: 0, sciany: 0, pomieszczenia: 0 };
    const d = JSON.parse(raw);
    return { elementy: d.draft.elements.length, sciany: d.draft.walls.length, pomieszczenia: d.draft.roomShapes.length };
  });
  expect(zapisane).toEqual({ elementy: 0, sciany: 0, pomieszczenia: 0 });
});

test("narzędzie „Przesuń widok” przesuwa TAK SAMO jak rolka — jeden układ współrzędnych", async ({ page }) => {
  await page.goto("/");
  await skipEntryScreen(page);
  const box = await przyblizIZwrocBox(page);
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

  const rolka = await przeciagnij(page, start, { dx: 100, dy: 70 }, { przycisk: "middle" });

  await page.getByRole("button", { name: "Przesuń widok", exact: true }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  const narzedzie = await przeciagnij(page, start, { dx: 100, dy: 70 });

  // Sedno naprawy: oba gesty ruszają TYM SAMYM stanem widoku. Wcześniej narzędzie
  // przesuwało scenę Konvy, a rolka przewijała kontener — dwa różne układy, więc
  // treść wypchnięta poza płótno bywała przycinana bezpowrotnie.
  expect(narzedzie).toEqual(rolka);
  expect(narzedzie).toEqual({ dx: 100, dy: 70 });
});

test("Ctrl+kółko przybliża i zostawia punkt spod kursora na miejscu", async ({ page }) => {
  await page.goto("/");
  await skipEntryScreen(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  const box = (await plotno(page).boundingBox())!;

  const kursor = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const lokalnyX = kursor.x - box.x;
  const lokalnyY = kursor.y - box.y;

  const przed = await polozenieRysunku(page);
  // Punkt planu, który w tej chwili leży dokładnie pod kursorem.
  const punktX = (lokalnyX - przed.x) / przed.skala;
  const punktY = (lokalnyY - przed.y) / przed.skala;

  await page.mouse.move(kursor.x, kursor.y);
  await page.keyboard.down("Control");
  for (let i = 0; i < 6; i++) {
    await page.mouse.wheel(0, -120);
    await page.waitForTimeout(60);
  }
  await page.keyboard.up("Control");
  await page.waitForTimeout(200);

  const po = await polozenieRysunku(page);
  expect(po.skala).toBeGreaterThan(przed.skala);

  // Właściwość z tytułu, sprawdzana wprost: ten sam punkt planu po przybliżeniu
  // nadal wypada pod kursorem. Poprzednia wersja testu pytała tylko, czy kontener
  // się przewinął — to był objaw kotwiczenia, a nie samo kotwiczenie.
  expect(punktX * po.skala + po.x).toBeCloseTo(lokalnyX, 0);
  expect(punktY * po.skala + po.y).toBeCloseTo(lokalnyY, 0);
});

test("lewy przycisk nadal stawia element — zabezpieczenie rolki nie zablokowało rysowania", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await skipEntryScreen(page);
  await page.getByRole("button", { name: "Instalacja" }).click();
  await skipEntryScreen(page);
  await otworzKatalogElementow(page);
  await page.getByRole("button", { name: /Gniazdo 230 V/ }).first().click();

  await page.evaluate(() => window.scrollTo(0, 0));
  const box = (await plotno(page).boundingBox())!;
  await page.mouse.click(box.x + 120, box.y + 120);

  await page.waitForTimeout(900);
  const ile = await page.evaluate(() => {
    const raw = localStorage.getItem("pomocnikelektryka_projekt_autosave");
    return raw ? JSON.parse(raw).draft.elements.length : 0;
  });
  expect(ile).toBe(1);
});
