import { test, expect, type Page } from "@playwright/test";

/**
 * Wysokość montażu elementu — pole w oknie edycji i jego skutek w projekcie.
 *
 * Sama wartość domyślna i przeliczenie pionu trasy mają testy jednostkowe
 * (`mountingHeightM`, `estimateRoutes`). Tutaj chodzi o to, czego stamtąd nie widać:
 * czy pole zapisuje się na elemencie, czy puste pole naprawdę oznacza „wartość
 * typowa" i czy wpisana wysokość przeżywa odświeżenie strony.
 */

async function planBox(page: Page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  return (await page.locator("[data-testid=plan-okno]").first().boundingBox())!;
}

async function pustyProjekt(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByRole("heading", { name: "Zaprojektuj instalację elektryczną w swoim domu" })).toBeVisible();
  await page.getByRole("button", { name: "Narysuj dom samodzielnie" }).click();
  const rozumiem = page.getByRole("button", { name: "Rozumiem" });
  if (await rozumiem.count()) await rozumiem.click();
}

async function postawGniazdko(page: Page, x: number, y: number) {
  await page.getByRole("button", { name: "Wstaw Element" }).click();
  await page.getByRole("button", { name: /Gniazdo 230 V/ }).click();
  const box = await planBox(page);
  await page.mouse.click(box.x + x, box.y + y);
}

/** Dwuklik w element wskazany po TYPIE — pozycja liczona z danych, nie z offsetu
 *  ekranowego, bo widok sam dopasowuje powiększenie (ten sam wzorzec co w
 *  light-groups.spec.ts). */
async function otworzEdycje(page: Page, typ: string) {
  await page.waitForTimeout(900); // debounce autozapisu — stąd bierzemy pozycję
  const el = await page.evaluate((t) => {
    const d = JSON.parse(localStorage.getItem("pomocnikelektryka_projekt_" + localStorage.getItem("pomocnikelektryka_projekt_biezacy"))!);
    return d.draft.elements.find((e: { type: string }) => e.type === t) ?? null;
  }, typ);
  if (!el) throw new Error(`Nie ma elementu typu ${typ}`);
  await page.getByRole("button", { name: "Zaznacz", exact: true }).click();
  // Punkt liczony od SAMEGO PŁÓTNA i z przesunięciem sceny. `planBox` zwraca kontener
  // z przewijaniem, więc jego róg nie jest rogiem rysunku — dopóki symbole były duże,
  // błąd mieścił się w ich obrysie i dwuklik i tak trafiał. To była tolerancja,
  // nie poprawny wzór, i skończyła się przy pierwszym zmniejszeniu symboli.
  const canvas = (await page.locator(".konvajs-content").first().boundingBox())!;
  const widok = await page.evaluate(() => {
    const k = (window as unknown as { Konva: { stages: { scaleX(): number; x(): number; y(): number }[] } }).Konva;
    const st = k.stages[0];
    return { skala: st.scaleX(), dx: st.x(), dy: st.y() };
  });
  await page.mouse.dblclick(canvas.x + el.x * widok.skala + widok.dx, canvas.y + el.y * widok.skala + widok.dy);
  await expect(page.getByText("Edytuj element")).toBeVisible();
}

async function wysokoscWProjekcie(page: Page) {
  await page.waitForTimeout(900);
  return page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem("pomocnikelektryka_projekt_" + localStorage.getItem("pomocnikelektryka_projekt_biezacy"))!);
    return d.draft.elements.find((e: { type: string }) => e.type === "gniazdko")?.heightM ?? null;
  });
}

test("wysokość montażu zapisuje się na elemencie i przeżywa odświeżenie", async ({ page }) => {
  await pustyProjekt(page);
  await postawGniazdko(page, 200, 200);

  // Świeżo postawione gniazdo nie ma własnej wysokości — obowiązuje typowa.
  expect(await wysokoscWProjekcie(page)).toBeNull();

  await otworzEdycje(page, "gniazdko");
  const pole = page.getByLabel("Wysokość montażu w metrach");
  // Podpowiedź w pustym polu mówi, jaka wartość obowiązuje bez wpisywania czegokolwiek.
  await expect(pole).toHaveAttribute("placeholder", /0\.3/);
  await pole.fill("1.15"); // gniazdo nad blatem w kuchni
  await page.getByRole("button", { name: "Zapisz" }).click();

  expect(await wysokoscWProjekcie(page)).toBe(1.15);

  await page.reload();
  await page.getByRole("button", { name: "Instalacja" }).click();
  expect(await wysokoscWProjekcie(page)).toBe(1.15);
});

test("wyczyszczenie pola wraca do wartości typowej, nie zapisuje zera", async ({ page }) => {
  await pustyProjekt(page);
  await postawGniazdko(page, 200, 200);

  await otworzEdycje(page, "gniazdko");
  await page.getByLabel("Wysokość montażu w metrach").fill("1.15");
  await page.getByRole("button", { name: "Zapisz" }).click();
  expect(await wysokoscWProjekcie(page)).toBe(1.15);

  await otworzEdycje(page, "gniazdko");
  await page.getByLabel("Wysokość montażu w metrach").fill("");
  await page.getByRole("button", { name: "Zapisz" }).click();

  // `null` w zapisie = brak nadpisania, czyli powrót do 0,3 m dla gniazdka.
  expect(await wysokoscWProjekcie(page)).toBeNull();
});

/** Wybor z biblioteki przez szukajke — sekcje poza pierwsza sa zwiniete, wiec sam
 *  `getByRole` ich nie widzi. */
async function postawZBiblioteki(page: Page, szukaj: string, nazwa: RegExp, x: number, y: number) {
  await page.getByRole("button", { name: "Wstaw Element" }).click();
  await page.getByPlaceholder(/Szukaj elementu/).fill(szukaj);
  await page.getByRole("button", { name: nazwa }).click();
  const box = await planBox(page);
  await page.mouse.click(box.x + x, box.y + y);
}

/** Etykiety „+30" / „+110" narysowane na plotnie — czytane wprost z Konvy, bo to
 *  ksztalty na canvasie, a nie wezly DOM. */
async function etykietyNaPlanie(page: Page) {
  return page.evaluate(() => {
    const k = (window as unknown as { Konva: { stages: { find(s: string): { text(): string }[] }[] } }).Konva;
    return k.stages[0]
      .find("Text")
      .map((t) => t.text())
      .filter((t) => /^\+\d+$/.test(t));
  });
}

test("wysokosci montazu pojawiaja sie na rzucie dopiero po wlaczeniu i pomijaja punkt sufitowy", async ({ page }) => {
  await pustyProjekt(page);
  await postawGniazdko(page, 150, 150);
  await postawZBiblioteki(page, "sufit", /Punkt sufitowy/, 300, 150);

  // Domyslnie wylaczone — na rysowanym wlasnie rzucie liczby przeszkadzaja.
  expect(await etykietyNaPlanie(page)).toEqual([]);

  await page.getByRole("button", { name: "Pokaż wysokości montażu" }).click();
  // Gniazdko dostaje „+30". Punkt sufitowy NIE dostaje nic: jego wysokosc to po prostu
  // sufit, a „+280" przy kazdej oprawie to kilkanascie liczb bez tresci.
  expect(await etykietyNaPlanie(page)).toEqual(["+30"]);
});

test("wlasna wysokosc odzywa sie takze tam, gdzie typowa milczy", async ({ page }) => {
  await pustyProjekt(page);
  await postawZBiblioteki(page, "sufit", /Punkt sufitowy/, 200, 150);
  await page.getByRole("button", { name: "Pokaż wysokości montażu" }).click();
  expect(await etykietyNaPlanie(page)).toEqual([]);

  // Sufit podwieszany albo skos to juz informacja, nie powtorzenie oczywistosci —
  // wpisana wartosc ma wiec przebic regule „pod stropem nie wymiarujemy".
  await otworzEdycje(page, "oswietlenie");
  await page.getByLabel(/Wysokość montażu/).fill("2.45");
  await page.getByRole("button", { name: "Zapisz" }).click();

  expect(await etykietyNaPlanie(page)).toEqual(["+245"]);
});
