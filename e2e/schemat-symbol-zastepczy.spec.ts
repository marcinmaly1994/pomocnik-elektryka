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

/**
 * Zgłoszenie użytkownika (ze zrzutu ekranu): między RCD a wyłącznikiem nadprądowym
 * spoza jej zasięgu brakowało kreski — wyłącznik wisiał w powietrzu, odcięty od szyny
 * głównej. Przyczyna: RCD/SPD rysują odcinek od szyny głównej do swojej podszyny jako
 * CZĘŚĆ WŁASNEGO glifu (`RcdBranch`/`SpdBranch`, `top={Y_BUS}`), ale odejście BEZ
 * różnicówki (`col.block.device` puste — np. obwód przeciwpożarowy) nie ma żadnego
 * symbolu w tym miejscu, więc nic tego odcinka nie rysowało. Fix: jawna kreska
 * łącząca szynę główną z podszyną, gdy w kolumnie nie ma aparatu RCD.
 */
test("obwód spoza różnicówki jest połączony z szyną główną, nie wisi w powietrzu", async ({ page }) => {
  await zbudujReczniePustaRozdzielnice(page);
  await dodajReczny(page, "rcd"); // FI1 — dla kontrastu: kolumna, która MA różnicówkę
  await dodajReczny(page, "mcb"); // F1 — ręcznie dodany, bez przypisanej różnicówki -> „poza RCD"

  await page.getByRole("button", { name: "Schemat", exact: true }).click();
  const svg = page.locator("svg:has(#incoming-supply)");

  const rcdGroup = svg.locator('[id^="rcd-FI"]');
  const circuitWrapper = svg.locator('xpath=//*[starts-with(@id,"circuit-F")]/..');
  await expect(rcdGroup).toHaveCount(1);
  await expect(circuitWrapper).toHaveCount(1);

  // RCD rysuje własny odcinek od szyny głównej jako część glifu — jej górna krawędź
  // jest więc punktem odniesienia: „na szynie głównej". Kolumna BEZ różnicówki musi
  // teraz sięgać do tej samej wysokości (kreska dodana w fixie), a nie zaczynać się
  // dopiero przy samym wyłączniku, wyraźnie niżej.
  const rcdBox = await rcdGroup.boundingBox();
  const circuitWrapperBox = await circuitWrapper.boundingBox();
  expect(rcdBox).toBeTruthy();
  expect(circuitWrapperBox).toBeTruthy();
  expect(Math.abs(circuitWrapperBox!.y - rcdBox!.y)).toBeLessThan(3);
});

/**
 * Rozłącznik izolacyjny bezpiecznikowy dostał WŁASNY symbol (z pliku CAD, jak MCB) —
 * pierścień przegubu, belka styku, ramię łącznika i korpus wkładki topikowej z
 * kreskami w środku, po jednej na fazę. Wariant wybiera liczba biegunów aparatu:
 * 3P -> trzy kreski, każdy inny -> jedna.
 */
test("rozłącznik izolacyjny bezpiecznikowy: własny symbol, wariant wg liczby biegunów (3P -> trzy kreski wkładki, 1P -> jedna)", async ({
  page,
}) => {
  await zbudujReczniePustaRozdzielnice(page);
  await dodajReczny(page, "rozBezp"); // Q1, domyślnie 3P

  await page.getByRole("button", { name: "Schemat", exact: true }).click();
  let svg = page.locator("svg:has(#incoming-supply)");
  let galaz = svg.locator('[id^="circuit-Q"]');
  await expect(galaz).toHaveCount(1);
  // Prawdziwy symbol, nie zastępczy placeholder: bez przerywanej ramki, za to z
  // pierścieniem przegubu ostrza.
  await expect(galaz.locator("rect")).toHaveCount(0);
  await expect(galaz.locator("circle")).toHaveCount(1);
  const sciezek3f = await galaz.locator("path").count();
  // Tag NIE jest "Q1" — ten ma już rozłącznik główny, więc ręcznie dodany aparat
  // z tym samym prefiksem dostaje kolejny wolny numer (patrz `addManualDevice`).
  // Odczytany dynamicznie, żeby test nie zakładał konkretnego numeru na sztywno.
  const tag = (await galaz.getAttribute("id"))!.replace("circuit-", "");

  // Zmiana biegunów na 1P (edycja aparatu na widoku czołowym rozdzielnicy)
  // przełącza wariant symbolu na schemacie.
  await page.getByRole("button", { name: "Rozdzielnica", exact: true }).click();
  const tagText = page.getByRole("img", { name: "Widok czołowy rozdzielnicy" }).locator("text", { hasText: tag }).first();
  await tagText.scrollIntoViewIfNeeded();
  const box = await tagText.boundingBox();
  await page.mouse.click(box!.x + box!.width / 2, box!.y + 60);
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("Liczba biegunów").selectOption("1P");
  await page.getByRole("button", { name: "Zapisz zmiany" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.getByRole("button", { name: "Schemat", exact: true }).click();
  svg = page.locator("svg:has(#incoming-supply)");
  galaz = svg.locator('[id^="circuit-Q"]');
  const sciezek1f = await galaz.locator("path").count();
  // Reszta geometrii identyczna w obu wariantach — różnica to dokładnie dwie
  // kreski wkładki (3 -> 1).
  expect(sciezek3f - sciezek1f).toBe(2);
});
