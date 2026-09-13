import { test, expect } from "@playwright/test";
import { skipEntryScreen, otworzMenuPaska } from "./_flow";

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
  const wrap = page.locator("div.overflow-auto.rounded-card.border").first();
  await wrap.evaluate((e) => {
    e.scrollIntoView({ block: "start" });
    e.scrollTo(0, 0);
  });
  return (await wrap.boundingBox())!;
}

/** Stawia element wybranego typu w podanych punktach planu. */
async function postaw(page: import("@playwright/test").Page, przycisk: RegExp, punkty: { x: number; y: number }[]) {
  const cel = page.getByRole("button", { name: przycisk }).first();
  if (!(await cel.isVisible().catch(() => false))) {
    await page.getByRole("button", { name: /Gniazda i zasilanie/ }).click();
  }
  const box = await planBox(page);
  for (const p of punkty) {
    await page.getByRole("button", { name: przycisk }).first().click();
    await page.mouse.click(box.x + p.x, box.y + p.y);
  }
  await page.getByRole("button", { name: "Zaznacz", exact: true }).click();
  return box;
}

test("dwa gniazda dostaja ten sam numer obwodu i skladaja sie na JEDEN obwod", async ({ page }) => {
  await otworzPlan(page);
  const box = await postaw(page, /Gniazdo 230 V/, [
    { x: 150, y: 150 },
    { x: 220, y: 150 },
  ]);

  // Pierwsze gniazdo zaklada nowy obwod...
  await page.mouse.click(box.x + 150, box.y + 150, { button: "right" });
  await expect(page.getByText("Numer obwodu")).toBeVisible();
  await page.getByRole("button", { name: "+ 1" }).click();

  // ...a drugie DOLACZA do istniejacego. Bez listy uzytych numerow trzeba by
  // pamietac, ze obwod 1 w ogole istnieje.
  await page.mouse.click(box.x + 220, box.y + 150, { button: "right" });
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
  const box = await postaw(page, /Ładowarka EV/, [{ x: 180, y: 150 }]);

  await page.mouse.click(box.x + 180, box.y + 150, { button: "right" });
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
test("obwod mieszajacy oswietlenie z gniazdami jest zglaszany w rozdzielnicy", async ({ page }) => {
  await otworzPlan(page);
  const box = await postaw(page, /Gniazdo 230 V/, [{ x: 150, y: 150 }]);

  await page.getByRole("button", { name: /Oświetlenie/ }).first().click();
  await page.getByRole("button", { name: /Punkt sufitowy/ }).first().click();
  await page.mouse.click(box.x + 220, box.y + 150);
  await page.getByRole("button", { name: "Zaznacz", exact: true }).click();

  await page.mouse.click(box.x + 150, box.y + 150, { button: "right" });
  await page.getByRole("button", { name: "+ 1" }).click();
  await page.mouse.click(box.x + 220, box.y + 150, { button: "right" });
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
  const box = await postaw(page, /Gniazdo 230 V/, [{ x: 150, y: 150 }]);
  await page.mouse.click(box.x + 150, box.y + 150, { button: "right" });
  await page.getByRole("button", { name: "+ 1" }).click();
  await page.waitForTimeout(900);

  await otworzMenuPaska(page, "Plan");
  await page.getByRole("button", { name: "+ Dodaj kondygnację" }).click();
  await page.getByRole("textbox").fill("Piętro 1");
  await page.getByRole("button", { name: "Dodaj" }).click();
  await expect(page.getByRole("button", { name: "Piętro 1", exact: true })).toBeVisible();

  const box2 = await postaw(page, /Gniazdo 230 V/, [{ x: 200, y: 200 }]);
  await page.mouse.click(box2.x + 200, box2.y + 200, { button: "right" });

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
  const box = await postaw(page, /Gniazdo 230 V/, [
    { x: 150, y: 150 },
    { x: 220, y: 150 },
  ]);

  // Pierwsze gniazdo zaklada obwod 1 BEZ prawego przycisku.
  await page.mouse.dblclick(box.x + 150, box.y + 150);
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "+ 1" }).click();
  // Wybor od razu widac na chipie — inaczej nie wiadomo, co sie zapisze.
  await expect(page.getByRole("dialog").locator("button.border-copper")).toHaveText("1");
  await page.getByRole("button", { name: "Zapisz" }).click();

  // Drugie DOLACZA do istniejacego — lista numerow jest ta sama, co w menu.
  await page.mouse.dblclick(box.x + 220, box.y + 150);
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
  // plotno, ktorego jeszcze nie ma. Powrot na zakladke wpasowuje tez rzut na nowo
  // (tu: 87%), wiec powiekszenie trzeba przywrocic do 100% — inaczej klikniecie w te
  // sama wspolrzedna ekranu trafia obok elementu.
  await expect(page.getByRole("button", { name: "Zaznacz", exact: true })).toBeVisible();
  const zoom = page.getByRole("button", { name: /Powiększenie \d+ procent/ });
  if (!/100/.test((await zoom.innerText()) ?? "")) await zoom.click();
  const box2 = await planBox(page);
  await page.mouse.dblclick(box2.x + 220, box2.y + 150);
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
  const box = await postaw(page, /Gniazdo 230 V/, [{ x: 150, y: 150 }]);

  await page.mouse.dblclick(box.x + 150, box.y + 150);
  await expect(page.getByRole("button", { name: "+ 1" })).toBeVisible();

  // Zaznaczenie „dedykowane" zabiera wybor natychmiast, bez zapisywania i ponownego
  // otwierania okna.
  await page.getByText("Gniazdo dedykowane (AGD, własny obwód)").click();
  await expect(page.getByText(/ma własny obwód z definicji/)).toBeVisible();
  await expect(page.getByRole("button", { name: "+ 1" })).toHaveCount(0);
});
