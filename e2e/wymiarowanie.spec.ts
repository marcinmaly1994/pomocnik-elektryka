import { test, expect, type Page } from "@playwright/test";

/**
 * Tryb wymiarowania: długości WSZYSTKICH ścian i wymiary prostokątnych pomieszczeń.
 *
 * Do tej pory wymiary widać było tylko w trakcie rysowania i przy zaznaczonej ścianie,
 * więc rzut wydrukowany z aplikacji nie miał na sobie ani jednego wymiaru. Detekcja
 * prostokąta ma testy jednostkowe (`rectangleSizeM`) — tutaj chodzi o to, czy
 * przełącznik faktycznie odsłania i chowa etykiety na płótnie.
 */

/** Etykiety wymiarowe wprost ze sceny Konvy — na canvasie nie ma DOM-u do sprawdzenia. */
async function etykietyWymiarow(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const k = (window as unknown as { Konva: { stages: { find(sel: string): { text(): string }[] }[] } }).Konva;
    return k.stages[0]
      .find("Text")
      .map((t) => t.text())
      .filter((t) => /\d+,\d{2}( ×|) ?.*m$/.test(t));
  });
}

/** Etykiety POWIERZCHNI („88,0 m²") — osobno od wymiarów, bo mają jedno miejsce
 *  po przecinku i nie łapie ich tamten wzorzec. */
async function etykietyPowierzchni(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const k = (window as unknown as { Konva: { stages: { find(sel: string): { text(): string }[] }[] } }).Konva;
    return k.stages[0].find("Text").map((t) => t.text()).filter((t) => /m²$/.test(t));
  });
}

/** Zaznacza albo odznacza pozycję w menu „Opisy" i zamyka je, żeby panel nie
 *  przykrywał płótna przy odczycie sceny. */
async function przelaczOpis(page: Page, nazwa: string, wlacz: boolean) {
  await page.getByRole("button", { name: "Opisy" }).click();
  const pole = page.getByLabel(nazwa);
  if (wlacz) await pole.check();
  else await pole.uncheck();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
}

const WYMIARY = "Wymiary ścian i pomieszczeń";
const POWIERZCHNIA = "Powierzchnia pomieszczeń";

/** Prostokątny dom 25 × 17 m z dwoma prostokątnymi pokojami — wstrzyknięty wprost
 *  do zapisu, bo test dotyczy WYŚWIETLANIA wymiarów, nie rysowania geometrii
 *  (to ma własne specy w wall-drawing i room-drawing). */
async function planZGeometria(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByRole("heading", { name: "Zaprojektuj instalację elektryczną w swoim domu" })).toBeVisible();
  await page.getByRole("button", { name: "Narysuj dom samodzielnie" }).click();
  const rozumiem = page.getByRole("button", { name: "Rozumiem" });
  if (await rozumiem.count()) await rozumiem.click();
  await page.waitForTimeout(900);

  await page.evaluate(() => {
    const K = "pomocnikelektryka_projekt_autosave";
    const a = JSON.parse(localStorage.getItem(K)!);
    a.scales = { f1: 0.05 };
    a.draft.walls = [
      { id: "w1", floor: "f1", thickness: 5, points: [
        { x: 120, y: 120 }, { x: 620, y: 120 }, { x: 620, y: 460 }, { x: 120, y: 460 }, { x: 120, y: 120 },
      ] },
    ];
    a.draft.roomShapes = [
      { id: "r1", floor: "f1", name: "Kuchnia", color: "#C1793F", type: "kuchnia",
        points: [{ x: 140, y: 140 }, { x: 360, y: 140 }, { x: 360, y: 300 }, { x: 140, y: 300 }] },
      // Litera L — nie dostanie podpisu „a × b", bo taki prostokąt nie istnieje.
      { id: "r2", floor: "f1", name: "Salon", color: "#3B8C63", type: "salon",
        points: [{ x: 380, y: 140 }, { x: 600, y: 140 }, { x: 600, y: 300 }, { x: 500, y: 300 }, { x: 500, y: 440 }, { x: 380, y: 440 }] },
    ];
    localStorage.setItem(K, JSON.stringify(a));
  });
  await page.reload();
  await page.getByRole("button", { name: "Instalacja" }).click();
  await page.waitForTimeout(500);
}

test("przełącznik odsłania wymiary wszystkich ścian i chowa je z powrotem", async ({ page }) => {
  await planZGeometria(page);

  // Bez trybu wymiarowania rzut jest czysty — to domyślny stan przy rysowaniu.
  expect(await etykietyWymiarow(page)).toEqual([]);

  await przelaczOpis(page, WYMIARY, true);
  const wymiary = await etykietyWymiarow(page);
  // Cztery boki obrysu domu 25 × 17 m.
  expect(wymiary.filter((t) => t === "25,00 m")).toHaveLength(2);
  expect(wymiary.filter((t) => t === "17,00 m")).toHaveLength(2);

  await przelaczOpis(page, WYMIARY, false);
  expect(await etykietyWymiarow(page)).toEqual([]);
});

test("prostokątne pomieszczenie dostaje podpis „a × b”, a wielobok nie", async ({ page }) => {
  await planZGeometria(page);
  await przelaczOpis(page, WYMIARY, true);

  const wymiary = await etykietyWymiarow(page);
  // Kuchnia: 220 × 160 jedn. przy 0,05 m/jedn.
  expect(wymiary).toContain("11,00 × 8,00 m");
  // Salon jest literą L — żaden podpis „a × b" go nie opisuje, więc go nie ma.
  expect(wymiary.filter((t) => t.includes("×"))).toHaveLength(1);
});

/**
 * Powierzchnia jest OSOBNYM przełącznikiem, bo odpowiada tam, gdzie wymiary milczą:
 * „a × b" da się podać tylko dla prostokąta, a pole liczy się z obrysu, więc jest
 * prawdziwe także dla litery L — czyli dla Salonu z tego planu.
 */
test("powierzchnia pokazuje się także dla pomieszczenia, które NIE jest prostokątem", async ({ page }) => {
  await planZGeometria(page);
  expect(await etykietyPowierzchni(page)).toEqual([]);

  await przelaczOpis(page, POWIERZCHNIA, true);
  const pola = await etykietyPowierzchni(page);
  // Kuchnia: 220 × 160 jedn. przy 0,05 m/jedn. = 88 m².
  expect(pola).toContain("88,0 m²");
  // Salon (litera L): 220×160 + 120×140 = 52 000 jedn.² = 130 m². Prostokąt opisany
  // dałby 220×300 jedn. = 165 m², czyli o jedną czwartą za dużo.
  expect(pola).toContain("130,0 m²");
  expect(pola).toHaveLength(2);

  await przelaczOpis(page, POWIERZCHNIA, false);
  expect(await etykietyPowierzchni(page)).toEqual([]);
});

test("wymiary i powierzchnia są niezależne — można mieć samą powierzchnię", async ({ page }) => {
  await planZGeometria(page);
  await przelaczOpis(page, POWIERZCHNIA, true);
  // Żadnego „a × b" ani długości ścian — włączony jest tylko drugi opis.
  expect(await etykietyWymiarow(page)).toEqual([]);
  expect(await etykietyPowierzchni(page)).toHaveLength(2);

  await przelaczOpis(page, WYMIARY, true);
  expect(await etykietyWymiarow(page)).not.toEqual([]);
  expect(await etykietyPowierzchni(page)).toHaveLength(2);
});

/**
 * Hierarchia napisów na rzucie: nazwa pomieszczenia to jego TYTUŁ, a wymiary,
 * powierzchnia i wysokości montażu to ADNOTACJE — mają się czytać jako drugi plan.
 *
 * Przy równej wielkości (11 dla wszystkiego) wymiar ściany ważył tyle samo co nazwa
 * pokoju i rzut czytał się jako gąszcz liczb zamiast jako plan. Regresji tego rodzaju
 * nie widać w teście funkcjonalnym: napisy SĄ i mają poprawną treść.
 */
test("wymiary i powierzchnia są mniejsze i lżejsze od nazw pomieszczeń", async ({ page }) => {
  await planZGeometria(page);
  await przelaczOpis(page, WYMIARY, true);
  await przelaczOpis(page, POWIERZCHNIA, true);

  const rozmiary = await page.evaluate(() => {
    const k = (window as unknown as { Konva: { stages: { find(s: string): { text(): string; fontSize(): number; fontStyle(): string }[] }[] } }).Konva;
    const teksty = k.stages[0].find("Text");
    const wg = (wzor: RegExp) =>
      teksty.filter((t) => wzor.test(t.text())).map((t) => ({ rozmiar: t.fontSize(), styl: t.fontStyle() }));
    return {
      nazwy: wg(/^(Kuchnia|Salon)$/),
      // Wymiary ścian („25,00 m") i pomieszczeń („11,00 × 8,00 m") oraz powierzchnie.
      adnotacje: [...wg(/\d,\d{2}( ×|) ?.*m$/), ...wg(/m²$/)],
    };
  });

  expect(rozmiary.nazwy.length).toBeGreaterThan(0);
  expect(rozmiary.adnotacje.length).toBeGreaterThan(0);
  const najmniejszaNazwa = Math.min(...rozmiary.nazwy.map((n) => n.rozmiar));
  for (const a of rozmiary.adnotacje) {
    expect(a.rozmiar).toBeLessThan(najmniejszaNazwa);
    // Sama mniejsza wielkosc nie wystarcza: pogrubiona osemka wazy na rysunku tyle
    // samo co zwykla jedenastka, wiec hierarchia i tak by sie nie pojawila.
    expect(a.styl).not.toMatch(/bold|[6-9]00/);
  }
});
