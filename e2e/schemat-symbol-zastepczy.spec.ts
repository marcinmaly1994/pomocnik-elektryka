import { test, expect } from "@playwright/test";

/**
 * `SchemaTab` rysował gałąź obwodu wyłącznie dla `kind === "mcb"` — reszta katalogu
 * aparatów dołożonego w poprzedniej turze (stycznik, przekaźnik, zasilacz, lampka,
 * CZF, rozłącznik ppoż, RCBO…) po prostu znikała ze schematu bez śladu i bez
 * ostrzeżenia. Fix: te aparaty dostają symbol zastępczy (przerywana ramka,
 * `GLYPHS.generic` w deviceGlyphs.tsx) zamiast być pomijane — do czasu, aż użytkownik
 * dośle pliki CAD z ich właściwymi symbolami.
 */

async function zbudujReczniePustaRozdzielnice(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const pomin = page.getByRole("button", { name: "Pomiń — ustawię później" });
  if (await pomin.count()) await pomin.click();
  await page.getByRole("button", { name: "Rozdzielnica", exact: true }).click();
  await page.getByRole("button", { name: "Zbuduj rozdzielnicę bez rzutu" }).click();
}

async function dodajReczny(page: import("@playwright/test").Page, kind: string) {
  const kindSel = page.locator("select").filter({ has: page.locator('option:has-text("Wyłącznik nadprądowy")') });
  await kindSel.selectOption(kind);
  await page.getByRole("button", { name: "Dodaj", exact: true }).click();
}

test("stycznik dodany ręcznie NIE znika ze schematu — dostaje symbol zastępczy", async ({ page }) => {
  await zbudujReczniePustaRozdzielnice(page);
  await dodajReczny(page, "stycznik"); // prefiks K -> tag K1, bez przypisanej różnicówki

  await page.getByRole("button", { name: "Schemat", exact: true }).click();
  const svg = page.locator("svg:has(#incoming-supply)");

  // Sedno regresji: gałąź obwodu dla aparatu spoza „mcb" w ogóle istniała na rysunku.
  const galaz = svg.locator('[id^="circuit-K"]');
  await expect(galaz).toHaveCount(1);
  await expect(galaz).toBeVisible();
  await expect(galaz.locator("text").first()).toHaveText("K1");

  // Symbol zastępczy jest wizualnie ODRÓŻNIALNY od prawdziwego glifu MCB — przerywana
  // ramka, żeby użytkownik widział, że to placeholder, a nie kalka z dokumentacji.
  const dash = await galaz.locator("rect").first().getAttribute("stroke-dasharray");
  expect(dash).toBeTruthy();
});

test("wyłącznik nadprądowy nadal rysuje pełny glif MCB, bez przerywanej ramki", async ({ page }) => {
  await zbudujReczniePustaRozdzielnice(page);
  await dodajReczny(page, "mcb"); // prefiks F -> tag F1

  await page.getByRole("button", { name: "Schemat", exact: true }).click();
  const svg = page.locator("svg:has(#incoming-supply)");

  const galaz = svg.locator('[id^="circuit-F"]');
  await expect(galaz).toHaveCount(1);
  const rects = await galaz.locator("rect").count();
  expect(rects).toBe(0); // glif MCB nie ma prostokątów — same ścieżki i okręgi
});

for (const [kind, prefix] of [
  ["rcbo", "F"],
  ["ovr", "F"],
  ["ppoz", "Q"],
  ["przekaznik", "K"],
  ["zasilacz", "T"],
]) {
  test(`„${kind}" dodany ręcznie trafia na schemat (prefiks ${prefix})`, async ({ page }) => {
    await zbudujReczniePustaRozdzielnice(page);
    await dodajReczny(page, kind);

    await page.getByRole("button", { name: "Schemat", exact: true }).click();
    const svg = page.locator("svg:has(#incoming-supply)");
    await expect(svg.locator(`[id^="circuit-${prefix}"]`)).toHaveCount(1);
  });
}

test("rezerwa (zaślepka) NIE dostaje gałęzi na schemacie — nie ma czego rysować", async ({ page }) => {
  await zbudujReczniePustaRozdzielnice(page);
  await dodajReczny(page, "blank");

  await page.getByRole("button", { name: "Schemat", exact: true }).click();
  const svg = page.locator("svg:has(#incoming-supply)");
  await expect(svg.locator('[id^="circuit-"]')).toHaveCount(0);
});

/**
 * Lampka sygnalizacyjna dostała WŁASNY symbol (okrąg z krzyżykiem, IEC 60617-06) i
 * własne miejsce na schemacie — odejście wprost z szyny głównej, w tym samym rzędzie
 * co RCD/SPD, a nie w rzędzie wyłączników obwodowych (`circuit-…`). Zgłoszenie
 * użytkownika: lampka miała się znaleźć „na tej samej wysokości co RCD lub ogranicznik
 * przepięć".
 */
test("lampka sygnalizacyjna: własny symbol, na wysokości RCD — nie w rzędzie wyłączników obwodowych", async ({ page }) => {
  await zbudujReczniePustaRozdzielnice(page);
  await dodajReczny(page, "mcb"); // F1 — punkt odniesienia: rząd wyłączników obwodowych
  await dodajReczny(page, "lampka"); // P1

  await page.getByRole("button", { name: "Schemat", exact: true }).click();
  const svg = page.locator("svg:has(#incoming-supply)");

  // Lampka NIE idzie już przez symbol zastępczy w rzędzie MCB.
  await expect(svg.locator('[id^="circuit-P"]')).toHaveCount(0);
  const lampkaGroup = svg.locator('[id^="lampka-P"]');
  await expect(lampkaGroup).toHaveCount(1);
  await expect(lampkaGroup).toBeVisible();
  await expect(lampkaGroup.locator("text").first()).toHaveText("P1");

  // Symbol: okrąg z wpisanym krzyżykiem — odróżnialny zarówno od pełnego glifu MCB
  // (same ścieżki/okręgi, bez krzyżyka), jak i od przerywanej ramki placeholdera.
  await expect(lampkaGroup.locator("circle")).toHaveCount(1);
  await expect(lampkaGroup.locator("rect")).toHaveCount(0);

  // Sedno zgłoszenia: lampka stoi WYŻEJ (mniejsze y) niż wyłącznik obwodowy F1 —
  // w rzędzie RCD/SPD pod szyną główną, nie w rzędzie wyłączników.
  const circuitGroup = svg.locator('[id^="circuit-F"]');
  const lampkaBox = await lampkaGroup.boundingBox();
  const circuitBox = await circuitGroup.boundingBox();
  expect(lampkaBox).toBeTruthy();
  expect(circuitBox).toBeTruthy();
  expect(lampkaBox!.y).toBeLessThan(circuitBox!.y);
});
