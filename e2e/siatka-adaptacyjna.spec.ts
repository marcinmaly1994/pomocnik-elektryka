import { test, expect, type Page } from "@playwright/test";
import { skipEntryScreen } from "./_flow";

/**
 * Skok siatki idzie za powiększeniem — konwencja z programów CAD.
 *
 * Stałe oczko było bezużyteczne w obie strony: przy rysowaniu gniazdka kratka co metr
 * nie pomaga w niczym, a przy oddalonym rzucie ta sama kratka zlewa się w szarość.
 * Sam dobór ma testy jednostkowe (`krokSiatki`); tutaj sprawdzamy to, co widzi
 * użytkownik — że odczyt paska stanu i PRZYCIĄGANIE mówią to samo co kratka na
 * ekranie. Rozjazd między nimi byłby najgorszym z możliwych wariantów: celujesz
 * w linię, którą widzisz, a punkt siada gdzie indziej.
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

/** Oczko siatki [m] tak, jak podaje je pasek stanu — z przecinkiem dziesiętnym. */
async function oczkoZPaska(page: Page) {
  const tekst = await page.getByRole("status", { name: "Stan projektu" }).textContent();
  const m = tekst?.match(/oczko\s+([\d,]+)\s*m/);
  expect(m, `pasek stanu nie podaje oczka: ${tekst}`).not.toBeNull();
  return Number(m![1].replace(",", "."));
}

const METRY_NA_JEDNOSTKE = 0.05; // rysowanie od zera, patrz MANUAL_DRAW_SCALE_MPU

test("przybliżanie zagęszcza siatkę, a przyciąganie idzie dokładnie za nią", async ({ page }) => {
  await otworzPlan(page);

  // Wartość startowa BEZ wpisywania jej na sztywno: zależy od skali rysowania, a ten
  // test jest o tym, co robi z nią przybliżanie, nie o niej samej.
  const oczkoStart = await oczkoZPaska(page);
  expect(oczkoStart).toBeGreaterThan(0);

  // Przybliżamy, aż pasek stanu zgłosi gęstszą kratkę.
  // Limit z zapasem: krok powiększenia jest maly, a start zalezy od skali rysowania,
  // wiec liczba klikniec potrzebnych do zejscia o szczebel drabinki nie jest stala.
  const przybliz = page.getByRole("button", { name: "Przybliż widok" });
  for (let i = 0; i < 40 && (await oczkoZPaska(page)) >= oczkoStart; i++) {
    if (await przybliz.isDisabled()) break;
    await przybliz.click();
  }
  await page.waitForTimeout(300);

  const oczko = await oczkoZPaska(page);
  expect(oczko, "przybliżenie ma dać DROBNIEJSZĄ kratkę").toBeLessThan(oczkoStart);

  const krokJedn = Math.round(oczko / METRY_NA_JEDNOSTKE);
  expect(krokJedn).toBeGreaterThan(0);

  /**
   * Rysujemy POMIESZCZENIE, a nie stawiamy element: siatka przyciąga geometrię
   * budynku, elementy instalacji celowo lądują dokładnie tam, gdzie kliknięto
   * (gniazdko przy framudze nie ma odskakiwać na oczko siatki).
   */
  await page.getByRole("button", { name: "Narysuj Pomieszczenie", exact: true }).click();
  await page.getByRole("button", { name: "Prostokąt" }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  const box = (await page.locator("[data-testid=plan-okno]").first().boundingBox())!;
  const zoom = await page.evaluate(
    () => (window as unknown as { Konva: { stages: { scaleX(): number }[] } }).Konva.stages[0].scaleX(),
  );

  // Rogi celowane MIĘDZY linie starej, metrowej siatki — na punkty, których siatka
  // sprzed przybliżenia w ogóle nie zna.
  const rogA = krokJedn * 3;
  const rogB = krokJedn * 9;
  await page.mouse.move(box.x + rogA * zoom, box.y + rogA * zoom);
  await page.mouse.down();
  await page.mouse.move(box.x + rogB * zoom, box.y + rogB * zoom, { steps: 8 });
  await page.mouse.up();

  // Po puszczeniu przycisku aplikacja pyta o nazwe — bez zatwierdzenia obrys nie powstaje.
  await expect(page.getByText("Nazwij pomieszczenie")).toBeVisible();
  await page.getByRole("button", { name: "Dodaj pomieszczenie" }).click();
  await page.waitForTimeout(900); // debounce autozapisu

  const punkty = await page.evaluate(() => {
    const raw = localStorage.getItem("pomocnikelektryka_projekt_autosave");
    if (!raw) return [] as { x: number; y: number }[];
    const obrysy = JSON.parse(raw).draft.roomShapes as { points: { x: number; y: number }[] }[];
    return obrysy.flatMap((o) => o.points);
  });
  expect(punkty.length).toBeGreaterThan(0);

  // Przyciąganie siadło na kratce, którą pasek stanu właśnie zapowiedział.
  for (const { x, y } of punkty) {
    expect(x % krokJedn, `x = ${x}`).toBe(0);
    expect(y % krokJedn, `y = ${y}`).toBe(0);
  }
  // I jest to NAPRAWDĘ gęstsza kratka: co najmniej jeden róg leży w miejscu, którego
  // metrowa siatka nie zna. Bez tego test przeszedłby też przy starym, stałym oczku.
  const STARE_OCZKO_JEDN = 20;
  expect(punkty.some((q) => q.x % STARE_OCZKO_JEDN !== 0 || q.y % STARE_OCZKO_JEDN !== 0)).toBe(true);
});

test("oddalanie rozrzedza siatkę, zamiast zlewać ją w szarą płachtę", async ({ page }) => {
  await otworzPlan(page);
  const oczkoStart = await oczkoZPaska(page);

  const oddal = page.getByRole("button", { name: "Oddal widok" });
  for (let i = 0; i < 12 && !(await oddal.isDisabled()); i++) await oddal.click();
  await page.waitForTimeout(300);

  expect(await oczkoZPaska(page), "oddalenie ma dać RZADSZĄ kratkę").toBeGreaterThan(oczkoStart);

  // I kratka wciąż jest kratką: linie zostają na scenie, zamiast zniknąć albo
  // zagęścić się w jednolitą szarość.
  const odstepPx = await page.evaluate(() => {
    const konva = (window as unknown as {
      Konva: { stages: { find(s: string): { name(): string; points(): number[] }[]; scaleX(): number }[] };
    }).Konva;
    const scena = konva.stages[0];
    const pionowe = scena
      .find("Line")
      .filter((l) => l.name().includes("tylko-ekran"))
      .map((l) => l.points())
      .filter((p) => p[0] === p[2])
      .map((p) => p[0])
      .sort((a, b) => a - b);
    return pionowe.length < 2 ? 0 : (pionowe[1] - pionowe[0]) * scena.scaleX();
  });
  expect(odstepPx).toBeGreaterThanOrEqual(14);
});
