import { test, expect } from "@playwright/test";
import { skipEntryScreen, otworzMenuPaska, otworzKatalogElementow } from "./_flow";
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

/** Obszar roboczy planu odczytany ze SCENY — z obrysu arkusza (`.arkusz`), bo to
 *  jedyny węzeł niosący ten wymiar. Sama scena ma rozmiar OKNA widoku, więc jej
 *  `width()` mówi już tylko o tym, ile miejsca płótno dostało na stronie.
 *
 *  Czeka, aż scena w ogóle powstanie: `DesignTab` (razem z Konvą) jest ładowany
 *  leniwie, więc zaraz po wejściu w zakładkę `window.Konva` bywa jeszcze
 *  niezdefiniowane i odczyt wywala się na `undefined`. */
async function planSize(page: import("@playwright/test").Page) {
  await page.waitForFunction(() => {
    const konva = (window as unknown as { Konva?: { stages: { findOne(s: string): unknown }[] } }).Konva;
    return !!konva?.stages?.length && !!konva.stages[0].findOne(".arkusz");
  });
  return page.evaluate(() => {
    const konva = (window as unknown as {
      Konva: { stages: { findOne(s: string): { width(): number; height(): number } }[] };
    }).Konva;
    // Obrys arkusza jest rysowany we WSPÓŁRZĘDNYCH PLANU, więc jego wymiary to wprost
    // obszar planu — bez odkręcania powiększenia, którym skalowana jest cała scena.
    const arkusz = konva.stages[0].findOne(".arkusz");
    return { w: Math.round(arkusz.width()), h: Math.round(arkusz.height()) };
  });
}

test("wgrany rzut nie jest rozciągany — plan przyjmuje jego proporcje", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Instalacja" }).click();
  await skipEntryScreen(page);

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
  await otworzMenuPaska(page, "Plan");
  await expect(page.getByText(/Podkład: rzut.png/)).toBeVisible();

  const after = await planSize(page);
  // obraz 16:9 -> plan o tych samych proporcjach, więc podkład rysuje się bez ściskania
  expect(after.w / after.h).toBeCloseTo(16 / 9, 1);
  // pole powierzchni zostaje zbliżone, żeby siatka i symbole nie zmieniły nagle gęstości
  expect(after.w * after.h).toBeGreaterThan(before.w * before.h * 0.9);
  expect(after.w * after.h).toBeLessThan(before.w * before.h * 1.1);

  await expect(page.getByText(new RegExp(`Obszar planu: ${after.w} × ${after.h}`))).toBeVisible();
});

/**
 * Płótno nie ma granic — arkusz przestał być ogrodzeniem.
 *
 * Wcześniej kliknięcie poza obszarem planu nic nie stawiało i pokazywało podpowiedź
 * dlaczego. To była poprawna odpowiedź na ówczesny układ (rysunek MUSIAŁ mieścić się
 * w arkuszu), ale sam układ okazał się problemem: dom o powierzchni 140 m² rysowało
 * się w prostokącie, z którego nie dało się wyjść. Teraz arkusz jest tylko podkładem,
 * a rysować można wszędzie.
 */
test("element da się postawić POZA arkuszem — płótno nie ma granic", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Instalacja" }).click();
  await skipEntryScreen(page);

  const arkusz = await planSize(page);

  // Oddalamy widok, żeby obok arkusza zrobiło się miejsce na kliknięcie. Przyciskiem
  // paska, a nie grzebaniem w scenie: powiększenie jest stanem aplikacji i ustawione
  // z boku rozjechałoby się z tym, czym płótno przelicza współrzędne.
  const oddal = page.getByRole("button", { name: "Oddal widok" });
  for (let i = 0; i < 4 && !(await oddal.isDisabled()); i++) await oddal.click();
  await page.waitForTimeout(300);

  await otworzKatalogElementow(page);
  await page.getByRole("button", { name: /Gniazdo 230 V/ }).first().click();
  await page.evaluate(() => window.scrollTo(0, 0));
  const box = (await page.locator("[data-testid=plan-okno]").first().boundingBox())!;

  // Punkt na prawo od arkusza, przeliczony przez to samo powiększenie, którym liczy
  // płótno — żeby test nie zgadywał, gdzie kończy się arkusz.
  const zoom = await page.evaluate(
    () => (window as unknown as { Konva: { stages: { scaleX(): number }[] } }).Konva.stages[0].scaleX(),
  );
  const zaKrawedzia = (arkusz.w + 200) * zoom;
  expect(zaKrawedzia, "test ma sens tylko wtedy, gdy obok arkusza jest miejsce").toBeLessThan(box.width);
  await page.mouse.click(box.x + zaKrawedzia, box.y + 100);

  await page.waitForTimeout(900); // debounce autozapisu
  const postawione = await page.evaluate(() => {
    const raw = localStorage.getItem("pomocnikelektryka_projekt_autosave");
    return raw ? (JSON.parse(raw).draft.elements as { x: number }[]) : [];
  });
  expect(postawione).toHaveLength(1);
  expect(postawione[0].x).toBeGreaterThan(arkusz.w);
});

