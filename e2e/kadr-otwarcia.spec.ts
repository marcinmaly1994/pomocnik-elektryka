import { test, expect, type Page } from "@playwright/test";
import { skipEntryScreen, wczytajPrzyklad } from "./_flow";

/**
 * Kadr, w którym otwiera się rysunek.
 *
 * Arkusz to 50 × 35 m przy rysowaniu od zera. Dom o 140 m² zajmuje z niego jedną
 * ósmą, więc dopasowanie do ARKUSZA otwierało rysunek wielkości znaczka pocztowego
 * w morzu pustej siatki — od tego zaczęła się cała przebudowa płótna. Teraz kadr
 * siada na tym, co narysowane.
 */

async function otworzPlan(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const pomin = page.getByRole("button", { name: "Pomiń — ustawię później" });
  if (await pomin.count()) await pomin.click();
  await page.getByRole("button", { name: "Instalacja" }).click();
  await skipEntryScreen(page);
  await page.getByRole("button", { name: "Narysuj dom samodzielnie" }).first().click();
  const rozumiem = page.getByRole("button", { name: "Rozumiem" });
  if (await rozumiem.count()) await rozumiem.click();
}

/** Jak bardzo narysowane pomieszczenia wypełniają okno planu (0–1) i gdzie leży ich środek. */
async function kadr(page: Page) {
  const box = (await page.locator("[data-testid=plan-okno]").first().boundingBox())!;
  const dane = await page.evaluate(() => {
    const raw = localStorage.getItem("pomocnikelektryka_projekt_" + localStorage.getItem("pomocnikelektryka_projekt_biezacy"));
    const obrysy = raw ? (JSON.parse(raw).draft.roomShapes as { points: { x: number; y: number }[] }[]) : [];
    const punkty = obrysy.flatMap((o) => o.points);
    const s = (window as unknown as {
      Konva: { stages: { scaleX(): number; x(): number; y(): number }[] };
    }).Konva.stages[0];
    return { punkty, skala: s.scaleX(), przesX: s.x(), przesY: s.y() };
  });
  expect(dane.punkty.length, "test wymaga narysowanego pomieszczenia").toBeGreaterThan(0);

  const naEkranie = dane.punkty.map((p) => ({
    x: p.x * dane.skala + dane.przesX,
    y: p.y * dane.skala + dane.przesY,
  }));
  const xs = naEkranie.map((p) => p.x);
  const ys = naEkranie.map((p) => p.y);
  const szer = Math.max(...xs) - Math.min(...xs);
  const wys = Math.max(...ys) - Math.min(...ys);
  return {
    wypelnienie: Math.max(szer / box.width, wys / box.height),
    srodek: { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 },
    okno: { w: box.width, h: box.height },
  };
}

test("otwarty projekt pokazuje RYSUNEK, a nie arkusz z rysunkiem w rogu", async ({ page }) => {
  await otworzPlan(page);

  // Pokój w rogu arkusza — najgorszy przypadek dla dopasowania do ARKUSZA: zajmuje
  // z niego ułamek, więc przy starym kadrowaniu otwierał się jako znaczek w rogu.
  await page.getByRole("button", { name: "Narysuj Pomieszczenie", exact: true }).click();
  await page.getByRole("button", { name: "Prostokąt" }).click();
  const box = (await page.locator("[data-testid=plan-okno]").first().boundingBox())!;
  await page.mouse.move(box.x + 40, box.y + 40);
  await page.mouse.down();
  await page.mouse.move(box.x + 340, box.y + 260, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByText("Nazwij pomieszczenie")).toBeVisible();
  await page.getByRole("button", { name: "Dodaj pomieszczenie" }).click();
  await page.waitForTimeout(900); // debounce autozapisu

  // W trakcie rysowania kadr NIE ucieka — rysunek zostaje tam, gdzie go postawiono.
  const wTrakcie = await kadr(page);
  expect(wTrakcie.wypelnienie).toBeLessThan(0.5);

  await page.reload();
  await page.waitForTimeout(500);

  const poOtwarciu = await kadr(page);
  expect(poOtwarciu.wypelnienie, "rysunek ma wypełnić okno, a nie tonąć w arkuszu").toBeGreaterThan(0.6);
  // I leży na środku okna, a nie przy krawędzi. Tolerancja to 10% wymiaru okna, bo
  // wyśrodkowanie liczy się w chwili kadrowania, a układ strony dochodzi do siebie
  // jeszcze chwilę potem (baner nad rysunkiem zmienia wysokość płótna). Zmierzone
  // odchylenie: ~22 px przy oknie 600 px, czyli niewidoczne — ale nie zero.
  expect(Math.abs(poOtwarciu.srodek.x - poOtwarciu.okno.w / 2)).toBeLessThan(poOtwarciu.okno.w * 0.1);
  expect(Math.abs(poOtwarciu.srodek.y - poOtwarciu.okno.h / 2)).toBeLessThan(poOtwarciu.okno.h * 0.1);
});

test("rysowanie nie przestawia kadru pod ręką", async ({ page }) => {
  await otworzPlan(page);
  await page.getByRole("button", { name: "Narysuj Pomieszczenie", exact: true }).click();
  await page.getByRole("button", { name: "Prostokąt" }).click();
  const box = (await page.locator("[data-testid=plan-okno]").first().boundingBox())!;

  const scena = () =>
    page.evaluate(() => {
      const s = (window as unknown as {
        Konva: { stages: { scaleX(): number; x(): number; y(): number }[] };
      }).Konva.stages[0];
      return { skala: s.scaleX(), x: Math.round(s.x()), y: Math.round(s.y()) };
    });

  const przed = await scena();

  // Dorysowanie pomieszczenia zmienia szerokość panelu bocznego (dochodzi lista), co
  // budzi obserwatora rozmiaru. Kadr ma to przeżyć bez drgnięcia — inaczej rysunek
  // uciekałby spod kursora dokładnie w chwili, gdy się go używa.
  await page.mouse.move(box.x + 60, box.y + 60);
  await page.mouse.down();
  await page.mouse.move(box.x + 200, box.y + 160, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByText("Nazwij pomieszczenie")).toBeVisible();
  await page.getByRole("button", { name: "Dodaj pomieszczenie" }).click();
  await page.waitForTimeout(600);

  expect(await scena()).toEqual(przed);
});

/**
 * Otwarty przykład dostaje TEN SAM kadr, co „Dopasuj widok" — na monitorze i na telefonie.
 *
 * Przed poprawką kadr liczył się do wysokości płótna ZGADYWANEJ przed pierwszym
 * pomiarem (640 px), a kondygnacja od razu dostawała znacznik „skadrowana". Zmierzona
 * wysokość (360 px na telefonie, 447 na monitorze) wchodziła chwilę później, gdy kadr
 * był już zablokowany. Zmierzone: na telefonie górne 60% płótna puste, a łazienka
 * i przedpokój za dolną krawędzią; na monitorze powiększenie 1,98 zamiast 2,90 i brak
 * dolnej trzeciej części mieszkania.
 *
 * Porównanie z „Dopasuj widok", a nie z ramką rysunku: dopasowanie liczy się z obrysu
 * ścian, więc symbole i podpisy wystające poza obrys i tak potrafią sięgnąć za krawędź.
 * Tu sprawdzamy jedno — że otwarcie nie daje INNEGO kadru niż dopasowanie na żądanie.
 */
for (const [nazwa, okno] of [
  ["monitorze", { width: 1280, height: 800 }],
  ["telefonie", { width: 375, height: 812 }],
] as const) {
  test(`otwarty przykład ma kadr jak po „Dopasuj widok" na ${nazwa}`, async ({ page }) => {
    await page.setViewportSize(okno);
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await wczytajPrzyklad(page, "mieszkanie");
    await page.waitForTimeout(1500);

    const scena = () =>
      page.evaluate(() => {
        const st = (window as unknown as { Konva: { stages: { scaleX(): number; x(): number; y(): number }[] } })
          .Konva.stages[0];
        return { skala: st.scaleX(), x: st.x(), y: st.y() };
      });
    const poOtwarciu = await scena();
    await page.getByRole("button", { name: "Dopasuj widok do planu" }).first().click();
    await page.waitForTimeout(300);
    const poDopasowaniu = await scena();

    expect(poOtwarciu.skala).toBeCloseTo(poDopasowaniu.skala, 3);
    expect(Math.abs(poOtwarciu.x - poDopasowaniu.x)).toBeLessThan(1);
    expect(Math.abs(poOtwarciu.y - poDopasowaniu.y)).toBeLessThan(1);
  });
}

/**
 * Kadr obejmuje także to, co wystaje poza obrys ścian: symbole, strefy przyborów
 * i łuki drzwi.
 *
 * Liczony z samych środków elementów i otworów ucinał je: w przykładzie łuk drzwi
 * wejściowych i numery obwodów przy dolnej ścianie wystawały ok. 34 px za dolną
 * krawędź płótna (przy 1440 × 900).
 */
test("otwarty przykład mieści się w płótnie razem z symbolami i łukami drzwi", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await wczytajPrzyklad(page, "mieszkanie");
  await page.waitForTimeout(1500);

  const { tresc, plotno } = await page.evaluate(() => {
    const st = (window as unknown as {
      Konva: {
        stages: {
          width(): number;
          height(): number;
          getLayers(): { getClientRect(): { x: number; y: number; width: number; height: number } }[];
        }[];
      };
    }).Konva.stages[0];
    const warstwy = st.getLayers();
    return { tresc: warstwy[warstwy.length - 1].getClientRect(), plotno: { w: st.width(), h: st.height() } };
  });
  expect(tresc.y).toBeGreaterThanOrEqual(-2);
  expect(tresc.y + tresc.height).toBeLessThanOrEqual(plotno.h + 2);
  expect(tresc.x).toBeGreaterThanOrEqual(-2);
  expect(tresc.x + tresc.width).toBeLessThanOrEqual(plotno.w + 2);
});
