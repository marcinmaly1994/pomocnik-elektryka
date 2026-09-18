import { test, expect } from "@playwright/test";
import { skipEntryScreen, otworzMenuPaska, otworzKatalogElementow } from "./_flow";

/**
 * Numer obwodu nadawany RECZNIE z menu pod prawym przyciskiem.
 *
 * Automat dzieli obwody po rodzaju punktu, mokrosci pomieszczenia i kolejnosci —
 * a projektant czesto chce inaczej: kuchnia osobno, dwa pokoje razem, bo blisko
 * pionu. To decyzja projektowa, ktorej z samego rysunku nie da sie odgadnac, wiec
 * musi byc sposob, zeby ja wyrazic.
 */

async function otworzPlan(page: import("@playwright/test").Page) {
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
  await page.getByRole("button", { name: /Powiększenie \d+ procent/ }).click();
}

async function planBox(page: import("@playwright/test").Page) {
  const wrap = page.locator("[data-testid=plan-okno]").first();
  await wrap.evaluate((e) => {
    e.scrollIntoView({ block: "start" });
    e.scrollTo(0, 0);
  });
  return (await wrap.boundingBox())!;
}

/** Punkt planu przeliczony na wspolrzedne ekranu — przez zywa transformacje sceny,
 *  wiec dziala niezaleznie od powiekszenia i przesuniecia kadru. */
async function naEkranie(page: import("@playwright/test").Page, x: number, y: number) {
  const box = await planBox(page);
  const scena = await page.evaluate(() => {
    const k = (window as unknown as { Konva: { stages: { scaleX(): number; x(): number; y(): number }[] } }).Konva;
    const s = k.stages[0];
    return { skala: s.scaleX(), x: s.x(), y: s.y() };
  });
  return { x: box.x + x * scena.skala + scena.x, y: box.y + y * scena.skala + scena.y };
}

/**
 * Klik w punkt PLANU, nie w piksel okna — przez żywą transformację sceny.
 *
 * Ten plik mieszał dotąd dwie konwencje: stawiał elementy w pikselach liczonych od
 * rogu okna, a klikał w nie po współrzędnych planu. Wychodziło na to samo tylko
 * dlatego, że widok stał w powiększeniu 1, czyli jednostka planu = piksel. Odkąd
 * rysowanie od zera ma własną skalę, te dwie rzeczy się rozjeżdżają.
 */
async function klikPlan(
  page: import("@playwright/test").Page,
  x: number,
  y: number,
  opcje?: { button?: "left" | "right" },
) {
  const p = await naEkranie(page, x, y);
  await page.mouse.click(p.x, p.y, opcje);
}

async function dwuklikPlan(page: import("@playwright/test").Page, x: number, y: number) {
  const p = await naEkranie(page, x, y);
  await page.mouse.dblclick(p.x, p.y);
}

/** Stawia element wybranego typu w podanych punktach planu. */
async function postaw(page: import("@playwright/test").Page, przycisk: RegExp, punkty: { x: number; y: number }[]) {
  // Katalog bywa schowany z DWOCH roznych powodow i kazdy ma wlasne lekarstwo: panel
  // stoi na zakladce „Pomieszczenia" (pusta kondygnacja — patrz `zakladkaPanelu`) albo
  // sekcja akordeonu jest zwinieta. Rozwiazujemy je PO KOLEI, ze sprawdzeniem miedzy —
  // klikniecie w sekcje, ktora wlasnie sie odslonila otwarta, zwinieloby ja z powrotem.
  const cel = page.getByRole("button", { name: przycisk }).first();
  if (!(await cel.isVisible().catch(() => false))) await otworzKatalogElementow(page);
  if (!(await cel.isVisible().catch(() => false))) {
    await page.getByRole("button", { name: /Gniazda i zasilanie/ }).click();
  }
  for (const p of punkty) {
    await page.getByRole("button", { name: przycisk }).first().click();
    await klikPlan(page, p.x, p.y);
  }
  await page.getByRole("button", { name: "Zaznacz", exact: true }).click();
}

test("dwa gniazda dostaja ten sam numer obwodu i skladaja sie na JEDEN obwod", async ({ page }) => {
  await otworzPlan(page);
  await postaw(page, /Gniazdo 230 V/, [
    { x: 150, y: 150 },
    { x: 220, y: 150 },
  ]);

  // Pierwsze gniazdo zaklada nowy obwod...
  await klikPlan(page, 150, 150, { button: "right" });
  await expect(page.getByText("Numer obwodu")).toBeVisible();
  await page.getByRole("button", { name: "+ 1" }).click();

  // ...a drugie DOLACZA do istniejacego. Bez listy uzytych numerow trzeba by
  // pamietac, ze obwod 1 w ogole istnieje.
  await klikPlan(page, 220, 150, { button: "right" });
  await page.getByTitle("Dołącz do obwodu 1").click();
  await page.waitForTimeout(900); // autozapis ma 600 ms debounce'u

  // Rozdzielnica pokazuje JEDEN obwod z dwoma punktami, nazwany numerem.
  await page.getByRole("button", { name: "Rozdzielnica", exact: true }).click();
  await expect(page.getByText(/Obwód 1/).first()).toBeVisible();

  // Numer przezywa odswiezenie — to czesc projektu, nie stan widoku.
  await page.reload();
  await expect(page.getByText(/Obwód 1/).first()).toBeVisible();
});

test("odbiornik z wlasnym obwodem z definicji nie da sie przypisac — i menu mowi dlaczego", async ({ page }) => {
  await otworzPlan(page);
  await postaw(page, /Ładowarka EV/, [{ x: 180, y: 150 }]);

  await klikPlan(page, 180, 150, { button: "right" });
  await expect(page.getByText("Numer obwodu")).toBeVisible();
  await expect(page.getByText(/ma własny obwód z definicji/)).toBeVisible();
  // Zadnego przycisku wyboru — ani „auto", ani numeru.
  await expect(page.getByRole("button", { name: "auto" })).toHaveCount(0);
});

/**
 * Ostrzezenie, nie blokada — tak jak wszedzie indziej w tej aplikacji: liczymy,
 * pokazujemy werdykt i mowimy dlaczego, zamiast odmawiac. Mieszanka oswietlenia
 * z gniazdami bywa uzasadniona, ale dobor potraktuje taki obwod jako oswietleniowy
 * (1,5 mm², B10) i o tym trzeba powiedziec.
 */
/**
 * Prawy klik w element wskazany po TYPIE, w jego RZECZYWISTY środek.
 *
 * Nie w punkt, w który się klikało stawiając: stawianie przyciąga element do siatki,
 * więc symbol ląduje obok kursora — nawet o pół oczka. Dopóki symbole były duże,
 * ta różnica mieściła się w obrysie i klik w stary punkt i tak trafiał. To była
 * tolerancja, a nie celowanie, i skończyła się przy pierwszym zmniejszeniu symboli.
 */
async function prawyKlikWElement(page: import("@playwright/test").Page, typ: string) {
  await page.waitForTimeout(900); // debounce autozapisu — stąd bierzemy pozycję
  const el = await page.evaluate((t) => {
    const d = JSON.parse(localStorage.getItem("pomocnikelektryka_projekt_autosave")!);
    return d.draft.elements.find((e: { type: string }) => e.type === t) ?? null;
  }, typ);
  if (!el) throw new Error(`Nie ma elementu typu ${typ}`);
  const canvas = (await page.locator(".konvajs-content").first().boundingBox())!;
  const widok = await page.evaluate(() => {
    const k = (window as unknown as { Konva: { stages: { scaleX(): number; x(): number; y(): number }[] } }).Konva;
    const st = k.stages[0];
    return { skala: st.scaleX(), dx: st.x(), dy: st.y() };
  });
  await page.mouse.click(canvas.x + el.x * widok.skala + widok.dx, canvas.y + el.y * widok.skala + widok.dy, { button: "right" });
}

test("obwod mieszajacy oswietlenie z gniazdami jest zglaszany w rozdzielnicy", async ({ page }) => {
  await otworzPlan(page);
  await postaw(page, /Gniazdo 230 V/, [{ x: 150, y: 150 }]);

  await otworzKatalogElementow(page);
  await page.getByRole("button", { name: /Oświetlenie/ }).first().click();
  await page.getByRole("button", { name: /Punkt sufitowy/ }).first().click();
  await klikPlan(page, 220, 150);
  await page.getByRole("button", { name: "Zaznacz", exact: true }).click();

  await prawyKlikWElement(page, "gniazdko");
  await page.getByRole("button", { name: "+ 1" }).click();
  await prawyKlikWElement(page, "oswietlenie");
  await page.getByTitle("Dołącz do obwodu 1").click();
  await page.waitForTimeout(900);

  await page.getByRole("button", { name: "Rozdzielnica", exact: true }).click();
  await expect(page.getByText(/miesza oświetlenie/)).toBeVisible();
  await expect(page.getByText(/za mało pod gniazda/)).toBeVisible();
});

/**
 * Numer obwodu obowiazuje w CALYM projekcie, nie na kondygnacji: rozdzielnica
 * grupuje po nim wszystkie elementy, niezaleznie od pietra. Lista uzytych numerow
 * liczona z jednej kondygnacji proponowala wiec na pietrze numer zajety na parterze
 * — i klikniecie po cichu scalalo dwa niezwiazane zestawy punktow w jeden obwod.
 */
test("numery z innych kondygnacji sa widoczne, a nowy numer ich nie powtarza", async ({ page }) => {
  await otworzPlan(page);
  await postaw(page, /Gniazdo 230 V/, [{ x: 150, y: 150 }]);
  await klikPlan(page, 150, 150, { button: "right" });
  await page.getByRole("button", { name: "+ 1" }).click();
  await page.waitForTimeout(900);

  await otworzMenuPaska(page, "Plan");
  await page.getByRole("button", { name: "+ Dodaj kondygnację" }).click();
  await page.getByRole("textbox").fill("Piętro 1");
  await page.getByRole("button", { name: "Dodaj" }).click();
  await expect(page.getByRole("button", { name: "Piętro 1", exact: true })).toBeVisible();

  await postaw(page, /Gniazdo 230 V/, [{ x: 200, y: 200 }]);
  await klikPlan(page, 200, 200, { button: "right" });

  // Obwod 1 z parteru JEST na liscie — i mowi, ze jest gdzie indziej.
  await expect(page.getByTitle(/Dołącz do obwodu 1 — ten obwód jest na innej kondygnacji/)).toBeVisible();
  // A „nowy" proponuje 2, nie 1: inaczej klikniecie scalaloby pietro z parterem.
  await expect(page.getByRole("button", { name: "+ 2" })).toBeVisible();
  await expect(page.getByRole("button", { name: "+ 1" })).toHaveCount(0);
});

/**
 * Ta sama decyzja z DWUKLIKU, nie tylko z prawego przycisku.
 *
 * Dwuklik otwiera okno edycji elementu — i numer obwodu byl jedyna jego wlasnoscia,
 * ktorej sie tam nie dalo zmienic: trzeba bylo okno zamknac i siegnac po menu
 * kontekstowe. Obie drogi uzywaja tego samego komponentu wyboru, wiec pokazuja te
 * sama liste numerow uzytych w projekcie.
 */
test("numer obwodu da sie nadac, zmienic i skasowac z okna edycji (dwuklik)", async ({ page }) => {
  await otworzPlan(page);
  await postaw(page, /Gniazdo 230 V/, [
    { x: 150, y: 150 },
    { x: 220, y: 150 },
  ]);

  // Pierwsze gniazdo zaklada obwod 1 BEZ prawego przycisku.
  await dwuklikPlan(page, 150, 150);
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "+ 1" }).click();
  // Wybor od razu widac na chipie — inaczej nie wiadomo, co sie zapisze.
  await expect(page.getByRole("dialog").locator("button.border-copper")).toHaveText("1");
  await page.getByRole("button", { name: "Zapisz" }).click();

  // Drugie DOLACZA do istniejacego — lista numerow jest ta sama, co w menu.
  await dwuklikPlan(page, 220, 150);
  await page.getByTitle("Dołącz do obwodu 1").click();
  await page.getByRole("button", { name: "Zapisz" }).click();
  await page.waitForTimeout(900);

  await page.getByRole("button", { name: "Rozdzielnica", exact: true }).click();
  await expect(page.getByText("Obwód 1 — Bez pomieszczenia").first()).toBeVisible();
  // Oba punkty na JEDNYM obwodzie — zaden nie zostal przy automacie.
  await expect(page.getByText(/Obwód gniazd ogólnych/)).toHaveCount(0);

  // Powrot na „auto" MUSI skasowac numer, a nie zostawic stary: to jedyna droga
  // odwrotu od recznego przypisania inaczej niz przez cofanie.
  await page.getByRole("button", { name: "Instalacja" }).first().click();
  // Zakladka laduje sie dynamicznie — bez czekania na pasek narzedzi mierzylibysmy
  // plotno, ktorego jeszcze nie ma. Powrot na zakladke ustawia tez KADR na nowo:
  // dopasowuje powiekszenie i srodkuje widok na rysunku. Zamiast odkrecac to
  // przyciskami, przeliczamy punkt planu przez transformacje sceny — czyli pytamy
  // plotno, gdzie TERAZ jest ten element, zamiast zakladac, ze kadr stoi w zerze.
  await expect(page.getByRole("button", { name: "Zaznacz", exact: true })).toBeVisible();
  const p = await naEkranie(page, 220, 150);
  await page.mouse.dblclick(p.x, p.y);
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "auto" }).click();
  await page.getByRole("button", { name: "Zapisz" }).click();
  await page.waitForTimeout(900);

  await page.getByRole("button", { name: "Rozdzielnica", exact: true }).click();
  await expect(page.getByText(/Obwód gniazd ogólnych/).first()).toBeVisible();
});

/**
 * Odbiornik z wlasnym obwodem z definicji nie dostaje wyboru numeru — a stan liczy
 * sie z typu USTAWIANEGO W TYM OKNIE, nie z zapisanego. Inaczej dalo by sie zmienic
 * gniazdko na ladowarke EV i w tym samym oknie przypisac jej numer, ktory dobor i
 * tak by zignorowal.
 */
test("okno edycji odbiera wybor obwodu, gdy typ zmienia sie na taki z wlasnym obwodem", async ({ page }) => {
  await otworzPlan(page);
  await postaw(page, /Gniazdo 230 V/, [{ x: 150, y: 150 }]);

  await dwuklikPlan(page, 150, 150);
  await expect(page.getByRole("button", { name: "+ 1" })).toBeVisible();

  // Zaznaczenie „dedykowane" zabiera wybor natychmiast, bez zapisywania i ponownego
  // otwierania okna.
  await page.getByText("Gniazdo dedykowane (AGD, własny obwód)").click();
  await expect(page.getByText(/ma własny obwód z definicji/)).toBeVisible();
  await expect(page.getByRole("button", { name: "+ 1" })).toHaveCount(0);
});
