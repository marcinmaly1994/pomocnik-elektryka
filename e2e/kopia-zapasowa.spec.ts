import { test, expect, type Page } from "@playwright/test";
import { wczytajPrzyklad } from "./_flow";

/**
 * Kopia zapasowa projektu: zapis do pliku i powrót z pliku.
 *
 * Test MUSI być e2e i MUSI przechodzić przez prawdziwy plik. Samą walidację treści
 * pilnuje `src/lib/kopiaProjektu.test.ts`, ale to, czy pobrany plik da się potem
 * wczytać z powrotem, istnieje wyłącznie w przeglądarce — a właśnie ta pętla jest
 * całym sensem funkcji. Kopia, której nie da się przywrócić, to nie kopia.
 *
 * Sprawdzane bez logowania, bo to jest sedno zmiany: dotąd eksport siedział
 * w ustawieniach konta, więc osoba bez konta nie mogła zabezpieczyć pracy, mimo że
 * to jej aplikacja pokazuje baner „projekt żyje tylko w tej przeglądarce".
 */

const ekranStartowy = (page: Page) =>
  page.getByRole("heading", { name: "Zaprojektuj instalację elektryczną w swoim domu" });
const pasekPrzykladu = (page: Page) => page.getByText("To jest projekt przykładowy");
const wejscieNaPlik = 'input[accept=".json,application/json"]';

async function swiezyProjekt(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Instalacja", exact: true }).click();
}

async function otworzMenuKopii(page: Page) {
  await page.getByRole("button", { name: "Projekty" }).click();
}

test("kopię można zapisać i przywrócić bez zakładania konta", async ({ page }) => {
  await swiezyProjekt(page);
  await expect(ekranStartowy(page)).toBeVisible();
  await wczytajPrzyklad(page, "mieszkanie");
  await expect(pasekPrzykladu(page)).toBeVisible();

  // 1. zapis do pliku
  const pobranie = page.waitForEvent("download");
  await otworzMenuKopii(page);
  await page.getByRole("menuitem", { name: /Zapisz kopię do pliku/ }).click();
  const plik = await pobranie;
  expect(plik.suggestedFilename()).toMatch(/\.json$/);
  const sciezka = await plik.path();

  // 2. kasujemy projekt — dokładnie ta sytuacja, w której kopia ma uratować pracę
  await page.getByRole("button", { name: "Nowy projekt" }).click();
  await page.getByRole("button", { name: /Tak, zacznij od nowa/ }).click();
  await expect(ekranStartowy(page)).toBeVisible();

  // 3. powrót z pliku
  await otworzMenuKopii(page);
  await page.getByRole("menuitem", { name: /Wczytaj kopię z pliku/ }).click();
  await page.setInputFiles(wejscieNaPlik, sciezka);
  await page.getByRole("button", { name: /Tak, wczytaj kopię/ }).click();

  // Plan wrócił: ekran startowy ustępuje, a pasek przykładu — który jest CZĘŚCIĄ
  // zapisanych danych, nie stanem interfejsu — pojawia się z powrotem.
  await expect(ekranStartowy(page)).toBeHidden();
  await expect(pasekPrzykladu(page)).toBeVisible();
});

test("wskazanie niewłaściwego pliku mówi o tym wprost i nie rusza projektu", async ({ page }) => {
  await swiezyProjekt(page);
  await wczytajPrzyklad(page, "mieszkanie");
  await expect(pasekPrzykladu(page)).toBeVisible();

  await otworzMenuKopii(page);
  await page.getByRole("menuitem", { name: /Wczytaj kopię z pliku/ }).click();
  // CSV z cennikiem — najbardziej prawdopodobna pomyłka, bo Kosztorys naprawdę
  // każe wskazywać taki plik.
  await page.setInputFiles(wejscieNaPlik, {
    name: "cennik.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("nazwa,cena\nGniazdo,12.50\n"),
  });

  await expect(page.getByText(/nie jest plikiem kopii projektu/i)).toBeVisible();
  // Żadnego pytania o nadpisanie — nie ma czym nadpisywać.
  await expect(page.getByRole("button", { name: /Tak, wczytaj kopię/ })).toBeHidden();

  await page.getByRole("button", { name: /Zamknij|OK/ }).first().click();
  // Projekt stoi nietknięty.
  await expect(pasekPrzykladu(page)).toBeVisible();
});

/**
 * Na telefonie menu projektów nie może zawijać się na dwie linie.
 *
 * Warunkiem NIE jest sama szerokość ekranu, tylko DŁUGA NAZWA PROJEKTU obok. Przy
 * świeżym projekcie („Mój dom") przycisk mieści się w jednej linii nawet przy 375 px
 * i pomiar niczego nie pokazuje — dopiero nazwa w rodzaju „Przykład: mieszkanie 70 m²"
 * zabiera wiersz na tyle, że etykieta łamie się na dwie linie. Kosztowało to wtedy
 * 48 px wysokości płótna, na ekranie, gdzie rysunku widać i tak tylko ~180 px bez
 * przewijania.
 *
 * Stąd przykład, a nie pusty projekt: test ma odtwarzać sytuację, w której usterka
 * naprawdę występuje. Mierzona jest WYSOKOŚĆ RENDERU, nie obecność klasy CSS — żeby
 * złapać także powrót tego zachowania inną drogą.
 */
test.describe("wąski ekran", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("menu projektów mieści się w jednej linii mimo długiej nazwy projektu", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await wczytajPrzyklad(page, "mieszkanie");
    await expect(page.getByText("To jest projekt przykładowy")).toBeVisible();

    const kopia = page.getByRole("button", { name: "Projekty" });
    await expect(kopia).toBeVisible();

    const box = (await kopia.boundingBox())!;
    // Jedna linia tekstu z odstępami to ok. 22–30 px; dwie to 44 px i więcej.
    expect(box.height, `przycisk ma ${Math.round(box.height)} px wysokości — zawinął się`).toBeLessThan(34);
  });
});
