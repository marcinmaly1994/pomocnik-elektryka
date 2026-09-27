import { test, expect, type Page } from "@playwright/test";
// Ten plik ma już WŁASNĄ funkcję `wczytajPrzyklad(page)` (z asercjami ekranu startowego
// i paska przykładu) — pomocnik z `_flow.ts` importujemy więc pod inną nazwą, żeby obie
// mogły współistnieć zamiast się przesłaniać.
import { wczytajPrzyklad as otworzPrzykladZRejestru } from "./_flow";

/**
 * Projekt przykładowy („Zobacz gotowy przykład" na ekranie startowym) i pusty
 * kosztorys — dwie strony tej samej sprawy: co widzi ktoś, kto dopiero wszedł.
 *
 * Dane przykładu mają test jednostkowy (`src/lib/demo/przyklady.test.ts`). Tutaj
 * sprawdzamy to, czego nie widać bez przeglądarki: że jedno kliknięcie naprawdę
 * wypełnia WSZYSTKIE zakładki przepływu, że pasek „to jest przykład" jedzie za
 * użytkownikiem między nimi, że wyjście z przykładu czyści projekt — i że pusty
 * kosztorys nie wystawia rachunku za dom, którego nie ma.
 */

async function swiezyProjekt(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Instalacja", exact: true }).click();
}

const ekranStartowy = (page: Page) =>
  page.getByRole("heading", { name: "Zaprojektuj instalację elektryczną w swoim domu" });
const pasekPrzykladu = (page: Page) => page.getByText("To jest projekt przykładowy");

async function wczytajPrzyklad(page: Page) {
  await expect(ekranStartowy(page)).toBeVisible();
  await otworzPrzykladZRejestru(page, "mieszkanie");
  await expect(pasekPrzykladu(page)).toBeVisible();
}

test("ekran startowy obiecuje, co powstanie, ZANIM każe cokolwiek robić", async ({ page }) => {
  await swiezyProjekt(page);
  await expect(ekranStartowy(page)).toBeVisible();
  // Rząd miniatur (`CoPowstanie`) nazywa wszystkie cztery etapy przepływu — to jest
  // jedyne miejsce w aplikacji, w którym laik dowiaduje się, co z rzutu wyniknie,
  // zanim cokolwiek kliknie. Same miniatury są `aria-hidden`, więc szukamy podpisów.
  const karta = page.getByText("Co z tego powstanie").locator("..");
  for (const etap of ["Rzut", "Rozdzielnica", "Schemat", "Kosztorys"]) {
    await expect(karta.getByText(etap, { exact: true })).toBeVisible();
  }
});

test("jedno kliknięcie wypełnia wszystkie cztery zakładki przepływu", async ({ page }) => {
  await swiezyProjekt(page);
  await wczytajPrzyklad(page);

  // 01 Instalacja: rzut zamiast ekranu startowego, z policzoną powierzchnią i skalą.
  await expect(ekranStartowy(page)).toHaveCount(0);
  await expect(page.getByText("Powierzchnia: 70,00 m²")).toBeVisible();

  // 02 Rozdzielnica wypełnia się SAMA z obwodów — to jest cała teza przykładu, więc
  // sprawdzamy, że nie stoi na niej pusty ekran („Zbuduj rozdzielnicę bez rzutu").
  await page.getByRole("button", { name: "Rozdzielnica", exact: true }).click();
  await expect(page.getByRole("button", { name: /Zbuduj rozdzielnicę bez rzutu/ })).toHaveCount(0);
  await expect(page.getByText(/Aparaty \(\d+\)/)).toBeVisible();

  // 04 Kosztorys: pozycje policzone, a metraż kabla wzięty Z PLANU, nie z ryczałtu —
  // to dlatego w przykładzie stoi rozdzielnica (patrz `elementy` w lib/demo/mieszkanie.ts).
  await page.getByRole("button", { name: "Kosztorys", exact: true }).click();
  await expect(page.getByText(/Metry kabla policzone z tras po planie/)).toBeVisible();
  await expect(page.locator("tfoot").getByText("RAZEM brutto")).toBeVisible();
});

test("pasek przykładu jedzie za użytkownikiem po zakładkach", async ({ page }) => {
  await swiezyProjekt(page);
  await wczytajPrzyklad(page);
  // `exact`, bo pigułki nawigacyjne w rogach okna też są przyciskami o tych nazwach
  // („Dalej: Rozdzielnica", „Cofnij: Instalacja") — bez tego selektor trafia w dwa.
  // Przykład ogląda się głównie na DALSZYCH zakładkach — tam najłatwiej zapomnieć,
  // że to cudze mieszkanie, więc pasek musi tam być, a nie tylko na Instalacji.
  for (const zakladka of ["Rozdzielnica", "Schemat", "Kosztorys", "Instalacja"]) {
    await page.getByRole("button", { name: zakladka, exact: true }).click();
    await expect(pasekPrzykladu(page)).toBeVisible();
  }
});

test("przykład nie udaje pracy użytkownika: bez zachęt do zabezpieczenia konta", async ({ page }) => {
  await swiezyProjekt(page);
  await wczytajPrzyklad(page);
  // Oba banery o koncie mówią o ryzyku UTRATY PRACY. W przykładzie nie ma czego
  // stracić, a próg drugiego z nich (>10 elementów) przykład przekracza od razu.
  await expect(page.getByText(/Ten projekt istnieje tylko w tej przeglądarce/)).toHaveCount(0);
  await expect(page.getByText(/Włożyłeś już sporo pracy w ten projekt/)).toHaveCount(0);
});

test("„Zacznij własny projekt” zostawia pusty plan i gasi pasek", async ({ page }) => {
  await swiezyProjekt(page);
  await wczytajPrzyklad(page);

  await page.getByRole("button", { name: "Zacznij własny projekt" }).click();
  await page.getByRole("button", { name: "Tak, zacznij własny" }).click();

  await expect(pasekPrzykladu(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Kosztorys", exact: true })).toBeVisible();
  // Wyjście z przykładu to `resetProject`, więc wracamy do punktu zero — łącznie
  // z ekranem startowym, bo żaden z faktów trzymających go z dala już nie zachodzi.
  await expect(ekranStartowy(page)).toBeVisible();
});

test("pusty kosztorys nie wystawia rachunku za dom, którego nie ma", async ({ page }) => {
  await swiezyProjekt(page);
  await page.getByRole("button", { name: "Kosztorys", exact: true }).click();

  // Przed poprawką w `computeCosts` stała tu tabela z jedną „Puszką rozgałęźną"
  // i sumą 6,15 zł brutto — skutek `|| 1` przy liczeniu pomieszczeń. Razem z nią
  // wstawał cały warsztat: import cennika, eksport CSV i przycisk PDF.
  await expect(page.getByText("RAZEM brutto")).toHaveCount(0);
  await expect(page.getByText("Puszka rozgałęźna (szt.)")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Importuj cennik CSV/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Kosztorys do PDF/ })).toHaveCount(0);

  await expect(page.getByText(/Kosztorys policzy się sam/)).toBeVisible();
  // Pusty ekran ma prowadzić TAM, gdzie powstaje treść — inaczej jest tylko
  // komunikatem o braku.
  await page.getByRole("button", { name: "Wróć do Instalacji" }).click();
  await expect(ekranStartowy(page)).toBeVisible();
});

test("pasek przykładu NIE wchodzi na Kalkulatory i Protokoły", async ({ page }) => {
  await swiezyProjekt(page);
  await wczytajPrzyklad(page);

  // Obie zakładki są z założenia NIEZALEŻNE od projektu, więc pasek nie ma tam czego
  // opisywać — a jego zdanie o zapisie byłoby tam wprost nieprawdziwe: „Zapisz zestaw"
  // w Protokołach zapisuje do chmury normalnie, bo protokoły nie idą przez autozapis
  // projektu (to jego blokuje `projektPrzykladowy`).
  for (const zakladka of ["Kalkulatory", "Protokoły pomiarowe"]) {
    await page.getByRole("button", { name: zakladka, exact: true }).click();
    await expect(pasekPrzykladu(page)).toHaveCount(0);
  }

  // ...a na krokach przepływu stoi dalej.
  await page.getByRole("button", { name: "Kosztorys", exact: true }).click();
  await expect(pasekPrzykladu(page)).toBeVisible();
});

test("kosztorys nie podaje ceny materiału jako ceny instalacji", async ({ page }) => {
  await swiezyProjekt(page);
  await wczytajPrzyklad(page);
  await page.getByRole("button", { name: "Kosztorys", exact: true }).click();

  // Domyślny cennik ma `robocizna: 0`, więc suma jest kwotą za SAM MATERIAŁ — i ma
  // się tak podpisać. Wcześniej stało pod nią „RAZEM brutto", a laik wynosił z całej
  // aplikacji liczbę kilkakrotnie zaniżoną względem tego, co zapłaci.
  const stopka = page.locator("tfoot");
  await expect(stopka).toContainText("RAZEM brutto — sam materiał");
  await expect(stopka).toContainText("To jest cena materiału, nie cena instalacji.");

  // Ostrzeżenie MUSI stać nad liczbą, nie pod nią — o to w tej zmianie chodzi.
  const ostrzezenie = (await stopka.getByText(/To jest cena materiału/).boundingBox())!;
  const suma = (await stopka.getByText(/RAZEM brutto — sam materiał/).boundingBox())!;
  expect(ostrzezenie.y).toBeLessThan(suma.y);
});

test("okno wyboru pokazuje kartę dla każdego przykładu z rejestru", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: /Zobacz gotowy przykład/ }).click();

  // e2e nie importuje `PRZYKLADY` (to plik przeglądarkowy, nie modułowy test), więc
  // "każdy" wymienia się tu jawnie, po nazwie. Poniższa lista musi rosnąć razem
  // z rejestrem w lib/demo/index.ts — inaczej ostatnia asercja to wyłapie: liczba
  // kart w oknie przestanie się zgadzać z liczbą nazw, które faktycznie sprawdziliśmy.
  const znaneKarty = [/Mieszkanie 70 m²/, /Dom 136 m²/];
  for (const nazwa of znaneKarty) {
    await expect(page.getByRole("button", { name: nazwa })).toBeVisible();
  }
  const kart = await page.getByRole("button", { name: /m²/ }).count();
  expect(kart).toBe(znaneKarty.length);
});

test("Escape zamyka okno wyboru bez wczytywania czegokolwiek", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: /Zobacz gotowy przykład/ }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: /Mieszkanie 70 m²/ })).toBeHidden();
  await expect(page.getByText("To jest projekt przykładowy")).toBeHidden();
});
