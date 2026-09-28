import { test, expect } from "@playwright/test";
import { wczytajPrzyklad } from "./_flow";

/**
 * Nazwa pomieszczenia nie leży na symbolu.
 *
 * Nazwa stała w środku obrysu — a środek pokoju to dokładnie miejsce, w które stawia się
 * lampę sufitową. W przykładowym mieszkaniu „Kuchnię" i „Sypialnię" przecinał krzyżyk
 * oprawy, i to na pierwszym ekranie, jaki widzi nowy użytkownik.
 */
test("w przykładzie żadna nazwa pomieszczenia nie nachodzi na symbol", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await wczytajPrzyklad(page, "mieszkanie");
  await page.waitForTimeout(1500);

  const kolizje = await page.evaluate(() => {
    type Ramka = { x: number; y: number; width: number; height: number };
    type Wezel = { x(): number; y(): number; text?(): string; getClientRect(): Ramka; getChildren(): Wezel[] };
    const stage = (window as unknown as { Konva: { stages: { find(sel: string): Wezel[] }[] } }).Konva.stages[0];
    const raw = localStorage.getItem("pomocnikelektryka_projekt_" + localStorage.getItem("pomocnikelektryka_projekt_biezacy"));
    const draft = JSON.parse(raw!).draft as { roomShapes: { name: string }[]; elements: { x: number; y: number }[] };
    const nazwy = new Set(draft.roomShapes.map((r) => r.name));
    const napisy = stage.find("Text").filter((t) => nazwy.has(t.text!()));
    // Grupa symbolu stoi dokładnie w punkcie elementu — tak samo szuka ich rozstaw-gniazd.spec.ts.
    // Porównujemy z jej KSZTAŁTAMI, a nie z ramką całej grupy: ramka obróconego łącznika
    // razem z numerem obejmuje też puste miejsce między nimi.
    const symbole = draft.elements
      .map((e) => stage.find("Group").find((g) => Math.abs(g.x() - e.x) < 0.01 && Math.abs(g.y() - e.y) < 0.01))
      .filter((g): g is Wezel => !!g)
      .flatMap((g) => g.getChildren().map((c) => c.getClientRect()));
    const nachodza = (p: Ramka, q: Ramka) =>
      p.x < q.x + q.width && q.x < p.x + p.width && p.y < q.y + q.height && q.y < p.y + p.height;
    return {
      liczbaNapisow: napisy.length,
      liczbaSymboli: symbole.length,
      kolizje: napisy.filter((t) => symbole.some((s) => nachodza(t.getClientRect(), s))).map((t) => t.text!()),
    };
  });

  expect(kolizje.liczbaNapisow, "test musi znaleźć nazwy pomieszczeń").toBeGreaterThan(3);
  expect(kolizje.liczbaSymboli, "test musi znaleźć symbole").toBeGreaterThan(10);
  expect(kolizje.kolizje).toEqual([]);
});

/**
 * Przykładowy dom: ciasna klatka schodowa (2 × 3 m, siedem symboli) i korytarz.
 *
 * „Klatka schodowa" stała na środku pokoju, pod lampą: nazwa docięta do szerokości pokoju
 * miała ramkę szerszą od obrysu, więc żadne inne położenie nie „mieściło się" i opis wracał
 * do środka (patrz `zasiegNapisu`). W tej klatce nie ma pasa wolnego na całą szerokość
 * nazwy, więc zamiast „zero styku" sprawdzamy, ile ramki napisu zasłaniają symbole.
 * Przed poprawką: 166% (symbole w klatce zachodzą też na siebie, więc pola się sumują).
 */
test("w przykładowym domu nazwy pomieszczeń są czytelne", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await wczytajPrzyklad(page, "dom");
  await page.waitForTimeout(1500);

  const zasloniecie = await page.evaluate(() => {
    type Ramka = { x: number; y: number; width: number; height: number };
    type Wezel = { x(): number; y(): number; text?(): string; getClientRect(): Ramka; getChildren(): Wezel[] };
    const stage = (window as unknown as { Konva: { stages: { find(sel: string): Wezel[] }[] } }).Konva.stages[0];
    const raw = localStorage.getItem("pomocnikelektryka_projekt_" + localStorage.getItem("pomocnikelektryka_projekt_biezacy"));
    const draft = JSON.parse(raw!).draft as { roomShapes: { name: string }[]; elements: { x: number; y: number }[] };
    const nazwy = new Set(draft.roomShapes.map((r) => r.name));
    const napisy = stage.find("Text").filter((t) => nazwy.has(t.text!()));
    const symbole = draft.elements
      .map((e) => stage.find("Group").find((g) => Math.abs(g.x() - e.x) < 0.01 && Math.abs(g.y() - e.y) < 0.01))
      .filter((g): g is Wezel => !!g)
      .flatMap((g) => g.getChildren().map((c) => c.getClientRect()));
    const wspolne = (p: Ramka, q: Ramka) =>
      Math.max(0, Math.min(p.x + p.width, q.x + q.width) - Math.max(p.x, q.x)) *
      Math.max(0, Math.min(p.y + p.height, q.y + q.height) - Math.max(p.y, q.y));
    return Object.fromEntries(
      napisy.map((t) => {
        const r = t.getClientRect();
        const pole = symbole.reduce((s, q) => s + wspolne(r, q), 0);
        return [t.text!(), Math.round((100 * pole) / (r.width * r.height))];
      })
    );
  });

  expect(Object.keys(zasloniecie).length, "test musi znaleźć nazwy pomieszczeń").toBeGreaterThan(5);
  for (const [nazwa, procent] of Object.entries(zasloniecie)) {
    expect(procent, `${nazwa}: % ramki napisu pod symbolami`).toBeLessThanOrEqual(5);
  }
  // Korytarz ma miejsce — tam ma być czysto.
  expect(zasloniecie["Hol"]).toBe(0);
});
