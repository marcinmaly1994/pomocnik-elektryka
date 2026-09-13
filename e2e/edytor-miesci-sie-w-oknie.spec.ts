import { test, expect, type Page } from "@playwright/test";

/**
 * Okno rysunku ma się MIEŚCIĆ w oknie przeglądarki, a pływająca nawigacja nie ma
 * prawa na nim leżeć.
 *
 * Powód istnienia tego pliku: przez długi czas wysokość płótna brała się ze stałego
 * szacunku („okno minus 260 px"), a tego, co nad płótnem, jest realnie około 480 px.
 * Skutek: przy oknie 1440×900 strona miała 1291 px, przy 1600×1200 — 1480 px, czyli
 * edytor nie mieścił się NIGDY, na żadnym monitorze. Dolną krawędź rysunku dało się
 * zobaczyć tylko przewijając całą stronę, a więc chowając pasek narzędzi, którym się
 * w tej chwili rysuje. Do tego pigułka „Dalej: Rozdzielnica" (position: fixed w rogu
 * okna) leżała NA płótnie i zabierała mu prostokąt 109×36 px w prawym dolnym rogu.
 *
 * Testowane e2e, bo obie rzeczy są stwierdzeniami o FAKTYCZNYM układzie strony —
 * `wysokoscPlotna` ma własne testy jednostkowe, ale nie powie, ile naprawdę stoi nad
 * płótnem ani gdzie wylądowała pigułka.
 */

/** Okno rysunku — ten sam lokator, którego używa `fullscreen.spec.ts`. */
function oknoRysunku(page: Page) {
  return page.locator("div.overflow-auto.rounded-card.border").first();
}

/**
 * Wchodzi w edytor drogą „Narysuj dom samodzielnie", a nie przez „Pomiń".
 *
 * To nie jest obojętny szczegół. Wysokość płótna liczy się ze STAŁEGO chrome'u,
 * z pominięciem banerów — inaczej pierwszy postawiony element gasiłby baner
 * „zacznij od podkładu", płótno zmieniałoby wysokość i cały rzut skakałby pod
 * kursorem (patrz efekt `wysPlotna` w DesignTab.tsx). Konsekwencja: dopóki baner
 * wisi, rysunek jest o jego wysokość niżej i może sięgnąć pod pigułkę nawigacji.
 * Te testy opisują stan USTALONY — czyli rysowanie, a nie pierwsze pół sekundy
 * na ekranie startowym — więc wchodzą tak, jak wchodzi rysujący.
 */
async function otworzEdytor(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Instalacja" }).click();
  await page.getByRole("button", { name: "Narysuj dom samodzielnie" }).click();
  await expect(oknoRysunku(page)).toBeVisible();
}

const OKNA = [
  { nazwa: "laptop 1366×768", width: 1366, height: 768 },
  { nazwa: "monitor 1440×900", width: 1440, height: 900 },
  { nazwa: "duży monitor 1600×1200", width: 1600, height: 1200 },
];

for (const okno of OKNA) {
  test(`cały rysunek widać bez przewijania — ${okno.nazwa}`, async ({ page }) => {
    await page.setViewportSize({ width: okno.width, height: okno.height });
    await otworzEdytor(page);
    await page.evaluate(() => window.scrollTo(0, 0));

    const box = (await oknoRysunku(page).boundingBox())!;
    // Przy przewinięciu na sam początek dolna krawędź rysunku musi być nad dolną
    // krawędzią okna — inaczej rysuje się „w ciemno" po części planu, której nie widać.
    expect(box.y + box.height).toBeLessThanOrEqual(okno.height);
  });
}

/**
 * Płótno zostawia u dołu okna wolne pasmo na pływającą pigułkę „Dalej" — o tyle
 * właśnie jest niższe (patrz `ZAPAS_POD_PLOTNEM` w lib/design.ts).
 *
 * Mierzymy SAM ZAPAS, a nie „pigułka nie nachodzi na płótno", i to jest tu ważne
 * rozróżnienie. Rezerwacja pasma trzyma wyłącznie wtedy, gdy nad płótnem nie wisi
 * żaden baner: wysokość liczy się z chrome'u STAŁEGO, z pominięciem banerów (inaczej
 * pojawienie się banera przeskalowywałoby rzut pod kursorem), więc baner spycha
 * rysunek w dół i ten znów sięga pod pigułkę.
 *
 * A baner „ten projekt istnieje tylko w tej przeglądarce" wisi u KAŻDEGO
 * niezalogowanego użytkownika, u którego jest cokolwiek do stracenia — czyli
 * dokładnie wtedy, gdy pigułka w ogóle się pokazuje (na PUSTYM projekcie jej nie ma,
 * patrz `projektPusty` w App.tsx). Innymi słowy: w dostępnym dziś stanie te dwa
 * warunki wykluczają się nawzajem i testu „nie nachodzi" nie da się uczciwie napisać.
 * Konflikt pigułki z banerem czeka na rozstrzygnięcie projektowe — dopóki trwa,
 * pilnujemy tego, co faktycznie zachodzi: pasmo jest zarezerwowane.
 */
test("płótno zostawia u dołu okna pasmo na nawigację", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await otworzEdytor(page);
  await page.evaluate(() => window.scrollTo(0, 0));

  const plotno = (await oknoRysunku(page).boundingBox())!;
  // 56 px pigułki (odstęp + wysokość) plus oddech — patrz `PASMO_NAWIGACJI_PX`.
  expect(plotno.y + plotno.height).toBeLessThanOrEqual(900 - 56);
});

test("na ekranie startowym stopka siedzi przy dole okna, bez pasa gołego tła pod nią", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Instalacja" }).click();
  await expect(page.getByRole("button", { name: "Narysuj dom samodzielnie" })).toBeVisible();

  const stopka = (await page.locator("footer").boundingBox())!;
  const karta = (await page.locator(".pe-card").filter({ hasText: "Zacznij projektować" }).boundingBox())!;

  // Pod stopką zostaje najwyżej własny margines strony (`p-6`), a nie 281 px
  // gołego tła, jak przed poprawką.
  expect(900 - (stopka.y + stopka.height)).toBeLessThanOrEqual(32);
  // Powitanie wypełnia wolną wysokość, zamiast wisieć wąskim paskiem u góry.
  expect(karta.height).toBeGreaterThan(450);
  // I strona nie zaczyna się przez to przewijać.
  const przewijalna = await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight);
  expect(przewijalna).toBe(false);
});

test("Narysuj dom samodzielnie nie prowadzi z powrotem do namawiania na podkład", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Instalacja" }).click();

  const baner = page.getByText("Zacznij od wgrania rzutu mieszkania");
  await page.getByRole("button", { name: "Narysuj dom samodzielnie" }).click();

  // Sam ten wybór nie tworzy ściany ani pomieszczenia, więc kondygnacja zostaje pusta —
  // baner pytał wtedy o to samo, na co użytkownik przed sekundą odpowiedział.
  await expect(oknoRysunku(page)).toBeVisible();
  await expect(baner).toBeHidden();

  // Wybór przeżywa przeładowanie: mieszka w zapisywanym stanie onboardingu, nie
  // w stanie komponentu, który przełączenie zakładki montuje od nowa.
  await page.waitForTimeout(900); // debounce autozapisu (600 ms) + zapas
  await page.reload();
  await page.getByRole("button", { name: "Instalacja" }).click();
  await expect(oknoRysunku(page)).toBeVisible();
  await expect(baner).toBeHidden();
});

test("nazwa zastępcza pomieszczenia jest zaznaczona — pierwsza litera ją zastępuje", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await otworzEdytor(page);

  const box = (await oknoRysunku(page).boundingBox())!;
  await page.getByRole("button", { name: "Narysuj Pomieszczenie", exact: true }).click();
  await page.getByRole("button", { name: "Prostokąt" }).click();
  await page.mouse.move(box.x + 100, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(box.x + 260, box.y + 220, { steps: 8 });
  await page.mouse.up();

  await expect(page.getByText("Nazwij pomieszczenie")).toBeVisible();
  // Bez zaznaczenia `autoFocus` stawiał kursor na KOŃCU nazwy zastępczej i wpisanie
  // „Kuchnia" dawało „Pomieszczenie 1Kuchnia" — typ rozpoznawał się poprawnie, a na
  // rzucie, w zestawieniu i w kosztorysie lądowała śmieciowa nazwa.
  await page.keyboard.type("Kuchnia");
  const pole = page.locator("[role=dialog] input").first();
  await expect(pole).toHaveValue("Kuchnia");
});
