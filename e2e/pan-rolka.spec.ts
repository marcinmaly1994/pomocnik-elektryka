import { test, expect, type Page } from "@playwright/test";

/**
 * Przesuwanie planu wciśniętą rolką myszy — konwencja z programów CAD, działająca
 * niezależnie od wybranego narzędzia.
 *
 * Testy sprawdzają dwie rzeczy naraz: że gest PRZESUWA widok i że przy okazji
 * NICZEGO nie rysuje. Ta druga część jest tu ważniejsza — środkowy przycisk
 * przechodził wcześniej tą samą drogą co lewy, więc bez zabezpieczenia
 * przesuwanie planu stawiałoby elementy albo zaczynało zaznaczanie obszarem.
 */

/** Kontener przewijania planu — to jego `scrollLeft`/`scrollTop` przesuwa gest. */
function plotno(page: Page) {
  return page.locator("div.overflow-auto.rounded-card.border").first();
}

/** Przybliża rzut, aż przestanie się mieścić — bez tego nie ma czego przesuwać. */
async function przyblizIZwrocBox(page: Page) {
  for (let i = 0; i < 12; i++) await page.getByRole("button", { name: "Przybliż widok" }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  return (await plotno(page).boundingBox())!;
}

async function przewiniecie(page: Page) {
  return plotno(page).evaluate((el) => ({ x: Math.round(el.scrollLeft), y: Math.round(el.scrollTop) }));
}

test("przytrzymana rolka przesuwa plan", async ({ page }) => {
  await page.goto("/");
  const box = await przyblizIZwrocBox(page);

  // Ustawiamy widok w środku zakresu, żeby dało się przesunąć w każdą stronę.
  await plotno(page).evaluate((el) => {
    el.scrollLeft = 200;
    el.scrollTop = 200;
  });
  const przed = await przewiniecie(page);

  const srodekX = box.x + box.width / 2;
  const srodekY = box.y + box.height / 2;
  await page.mouse.move(srodekX, srodekY);
  await page.mouse.down({ button: "middle" });
  // Ciągniemy w prawo i w dół — rysunek jedzie za kursorem, więc przewinięcie MALEJE.
  await page.mouse.move(srodekX + 120, srodekY + 80, { steps: 8 });
  await page.mouse.up({ button: "middle" });

  const po = await przewiniecie(page);
  expect(po.x).toBeLessThan(przed.x);
  expect(po.y).toBeLessThan(przed.y);
});

test("przesuwanie rolką nie stawia elementu ani nie rysuje", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Instalacja" }).click();

  // Najgorszy możliwy przypadek: aktywne narzędzie stawiające elementy.
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
  const box = await przyblizIZwrocBox(page);
  await plotno(page).evaluate((el) => {
    el.scrollLeft = 300;
    el.scrollTop = 300;
  });
  const przed = await przewiniecie(page);

  await page.getByRole("button", { name: "Przesuń widok", exact: true }).click();
  await page.evaluate(() => window.scrollTo(0, 0));

  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 100, cy + 70, { steps: 8 });
  await page.mouse.up();

  // Sedno naprawy: narzędzie rusza PRZEWINIĘCIEM kontenera, dokładnie jak rolka.
  // Wcześniej przesuwało scenę Konvy, przez co przewinięcie zostawało nietknięte,
  // a treść wypchnięta poza płótno była przycinana bezpowrotnie.
  const po = await przewiniecie(page);
  expect(po.x).toBe(przed.x - 100);
  expect(po.y).toBe(przed.y - 70);
});

test("Ctrl+kółko przybliża i zostawia punkt spod kursora na miejscu", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => window.scrollTo(0, 0));
  const box = (await plotno(page).boundingBox())!;

  const zoomPrzed = await page.getByRole("button", { name: /^Powiększenie/ }).textContent();

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.down("Control");
  for (let i = 0; i < 6; i++) {
    await page.mouse.wheel(0, -120);
    await page.waitForTimeout(60);
  }
  await page.keyboard.up("Control");
  await page.waitForTimeout(200);

  const zoomPo = await page.getByRole("button", { name: /^Powiększenie/ }).textContent();
  expect(zoomPo).not.toBe(zoomPrzed);

  // Kadr po przybliżeniu utrzymuje się PRZEWINIĘCIEM, a nie przesunięciem sceny —
  // gdyby zoom nadal ruszał sceną, przewinięcie zostałoby na zerze.
  const s = await przewiniecie(page);
  expect(s.x + s.y).toBeGreaterThan(0);
});

test("lewy przycisk nadal stawia element — zabezpieczenie rolki nie zablokowało rysowania", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Instalacja" }).click();
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
