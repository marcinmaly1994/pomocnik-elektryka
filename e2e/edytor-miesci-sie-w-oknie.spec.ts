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

test("pigułka Dalej nie leży na płótnie", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await otworzEdytor(page);
  await page.evaluate(() => window.scrollTo(0, 0));

  const plotno = (await oknoRysunku(page).boundingBox())!;
  const pigulka = (await page.getByRole("button", { name: /^Dalej: / }).boundingBox())!;

  const nachodzi =
    pigulka.x < plotno.x + plotno.width &&
    pigulka.x + pigulka.width > plotno.x &&
    pigulka.y < plotno.y + plotno.height &&
    pigulka.y + pigulka.height > plotno.y;
  expect(nachodzi).toBe(false);
});

test("pigułka Dalej nie zasłania wskaźnika zapisu w pasku stanu", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await otworzEdytor(page);
  await page.evaluate(() => window.scrollTo(0, 0));

  // Płótno kończy się tuż nad pasmem pigułki, więc pigułka ląduje nad PRAWYM KOŃCEM
  // paska stanu — a `ml-auto` wypycha tam wskaźnik zapisu. Pasek zostawia jej zapas.
  const pasek = page.getByRole("status", { name: "Stan projektu" });
  const koniecPaska = await pasek.evaluate((el) => el.lastElementChild!.getBoundingClientRect().right);
  const pigulka = (await page.getByRole("button", { name: /^Dalej: / }).boundingBox())!;
  expect(koniecPaska).toBeLessThanOrEqual(pigulka.x);
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
