import { test, expect, type Page } from "@playwright/test";
import { wczytajPrzyklad } from "./_flow";

/**
 * Projekt zapisany przez STARSZĄ wersję aplikacji musi się wczytać.
 *
 * Zapis sprzed dodania danego pola po prostu go nie ma — dotyczy to także projektów
 * leżących w chmurze, wczytywanych na dowolnym urządzeniu. Brak `docHeader.obiekt`
 * kładł CAŁĄ aplikację: `resolveDocHeader` wołało go sześć komponentów, a jeden
 * (`KompletDialog`) jest zamontowany w `App` na stałe, więc wyjątek leciał przy każdym
 * renderze. Zostawał sam ekran „Coś poszło nie tak", a feralny zapis siedział
 * w localStorage — odświeżenie nic nie dawało i użytkownik tracił dostęp do projektu.
 */

async function przykladZapisany(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await wczytajPrzyklad(page, "mieszkanie");
  await expect(page.getByRole("button", { name: "Rozdzielnica", exact: true })).toBeVisible();
  // autozapis ma zdążyć zapisać projekt, bo to jego treść zaraz okroimy
  await expect
    .poll(() => page.evaluate(() => !!localStorage.getItem("pomocnikelektryka_projekt_" + localStorage.getItem("pomocnikelektryka_projekt_biezacy"))))
    .toBe(true);
}

/** Usuwa jedno pole z zapisanego projektu i wczytuje aplikację od nowa. */
async function bezPola(page: Page, pole: string) {
  await page.evaluate((k) => {
    const K = "pomocnikelektryka_projekt_" + localStorage.getItem("pomocnikelektryka_projekt_biezacy");
    const a = JSON.parse(localStorage.getItem(K)!);
    delete a.docHeader[k];
    localStorage.setItem(K, JSON.stringify(a));
  }, pole);
  await page.reload();
}

test("zapis bez pola „obiekt” w nagłówku wczytuje się normalnie", async ({ page }) => {
  await przykladZapisany(page);
  await bezPola(page, "obiekt");

  await expect(page.getByText("Coś poszło nie tak")).toBeHidden();
  await expect(page.getByRole("button", { name: "Rozdzielnica", exact: true })).toBeVisible();
});

/*
 * Świadomie NIE sprawdzamy tu pola „Obiekt" w formularzu protokołów: ono pokazuje to,
 * co wpisał użytkownik, a nazwa projektu podstawia się dopiero w DOKUMENTACH
 * (`resolveDocHeader`). Sam ten mechanizm ma test jednostkowy.
 */
/** Nie chodzi o jedno pole, tylko o klasę zapisów — cały nagłówek bywa starszy. */
test("zapis bez całego nagłówka dokumentów też się wczytuje", async ({ page }) => {
  await przykladZapisany(page);
  await page.evaluate(() => {
    const K = "pomocnikelektryka_projekt_" + localStorage.getItem("pomocnikelektryka_projekt_biezacy");
    const a = JSON.parse(localStorage.getItem(K)!);
    delete a.docHeader;
    localStorage.setItem(K, JSON.stringify(a));
  });
  await page.reload();

  await expect(page.getByText("Coś poszło nie tak")).toBeHidden();
  await expect(page.getByRole("button", { name: "Rozdzielnica", exact: true })).toBeVisible();
});
