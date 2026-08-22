import { test, expect } from "@playwright/test";
import { makePng } from "./_png";

/**
 * Obszar roboczy planu: dopasowanie do proporcji wgranego rzutu i brak cichego
 * przycinania kliknięć.
 *
 * Testowane e2e, bo obie rzeczy widać dopiero na styku store'a, Konvy i zdarzeń myszy —
 * `planSizeForImage` samo w sobie ma testy jednostkowe, ale nie powie, czy scena
 * faktycznie przyjęła nowy rozmiar ani czy kliknięcie poza planem coś stawia.
 */

const PNG_16x9 = makePng(16, 9);

/** Rozmiar sceny Konvy. Czeka, aż scena w ogóle powstanie: `DesignTab` (razem z Konvą)
 *  jest ładowany leniwie, więc zaraz po wejściu w zakładkę `window.Konva` bywa jeszcze
 *  niezdefiniowane i odczyt wywala się na `undefined`. */
async function planSize(page: import("@playwright/test").Page) {
  await page.waitForFunction(() => {
    const konva = (window as unknown as { Konva?: { stages: unknown[] } }).Konva;
    return !!konva?.stages?.length;
  });
  return page.evaluate(() => {
    const konva = (window as unknown as {
      Konva: { stages: { width(): number; height(): number; scaleX(): number; scaleY(): number }[] };
    }).Konva;
    const s = konva.stages[0];
    // Scena jest skalowana powiększeniem widoku, więc jej wymiary w pikselach to
    // jednostki planu RAZY zoom. Dzielimy z powrotem, bo test dotyczy obszaru
    // planu, a nie tego, jak bardzo jest w danej chwili przybliżony.
    return { w: Math.round(s.width() / s.scaleX()), h: Math.round(s.height() / s.scaleY()) };
  });
}

test("wgrany rzut nie jest rozciągany — plan przyjmuje jego proporcje", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Instalacja" }).click();

  const before = await planSize(page);
  expect(before).toEqual({ w: 1000, h: 700 }); // domyślny obszar

  await page.setInputFiles('input[type="file"]', {
    name: "rzut.png",
    mimeType: "image/png",
    buffer: PNG_16x9,
  });

  // Po wgraniu pliku otwiera się najpierw przycinanie — ten test go nie
  // dotyczy, więc pomijamy. Pominięcie ma zostawić wgrany podkład nietknięty.
  await page.getByRole("button", { name: "Pomiń — użyj całego rzutu" }).click();
  await expect(page.getByText(/Podkład: rzut.png/)).toBeVisible();

  const after = await planSize(page);
  // obraz 16:9 -> plan o tych samych proporcjach, więc podkład rysuje się bez ściskania
  expect(after.w / after.h).toBeCloseTo(16 / 9, 1);
  // pole powierzchni zostaje zbliżone, żeby siatka i symbole nie zmieniły nagle gęstości
  expect(after.w * after.h).toBeGreaterThan(before.w * before.h * 0.9);
  expect(after.w * after.h).toBeLessThan(before.w * before.h * 1.1);

  await expect(page.getByText(new RegExp(`Obszar planu: ${after.w} × ${after.h}`))).toBeVisible();
});

test("kliknięcie poza obszarem planu nic nie stawia i mówi dlaczego", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Instalacja" }).click();

  // oddalamy widok, żeby wokół planu pojawiło się puste tło do kliknięcia
  await planSize(page); // czeka na leniwie doładowaną scenę Konvy
  await page.evaluate(() => {
    const konva = (window as unknown as { Konva?: { stages: { scale(v: { x: number; y: number }): void; draw(): void }[] } }).Konva;
    konva!.stages[0].scale({ x: 0.5, y: 0.5 });
    konva!.stages[0].draw();
  });

  await page.getByRole("button", { name: /Gniazdo 230 V/ }).first().click();
  await page.evaluate(() => window.scrollTo(0, 0));
  const box = (await page.locator("div.overflow-auto.rounded-card.border").first().boundingBox())!;

  // Przy skali 0,5 plan zajmuje lewą górną ćwiartkę sceny. Wychodzimy poza niego w POZIOMIE
  // (700 px ekranu → 1400 jedn. planu, czyli za prawą krawędzią), ale pionowo zostajemy
  // nisko — inaczej klik wypadłby poza okno przeglądarki i po prostu by nie doszedł.
  const outside = { x: box.x + 700, y: box.y + 100 };
  expect(outside.y, "klik musi zmieścić się w oknie").toBeLessThan(page.viewportSize()!.height);
  await page.mouse.click(outside.x, outside.y);
  await expect(page.getByText(/Kliknięcie poza obszarem planu/)).toBeVisible();

  await page.waitForTimeout(900); // debounce autozapisu
  const placed = await page.evaluate(() => {
    const raw = localStorage.getItem("pomocnikelektryka_projekt_autosave");
    return raw ? JSON.parse(raw).draft.elements.length : 0;
  });
  expect(placed).toBe(0); // wcześniej element lądował po cichu przy krawędzi planu

  // a kliknięcie W planie nadal działa
  await page.mouse.click(box.x + 120, box.y + 80);
  await page.waitForTimeout(900);
  const after = await page.evaluate(() => {
    const raw = localStorage.getItem("pomocnikelektryka_projekt_autosave");
    return raw ? JSON.parse(raw).draft.elements.length : 0;
  });
  expect(after).toBe(1);
});
