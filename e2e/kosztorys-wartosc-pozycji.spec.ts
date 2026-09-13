import { test, expect, type Page } from "@playwright/test";
import { skipEntryScreen, otworzKatalogElementow } from "./_flow";

/**
 * Recznie wpisana WARTOSC pozycji kosztorysu.
 *
 * Cena jednostkowa mnozy sie przez policzona ilosc, a realne oferty podaja czesc
 * pozycji ryczaltem — robocizna za mieszkanie, rozdzielnica "pod klucz" — i takiej
 * kwoty nie da sie sensownie rozbic na sztuki. Sama arytmetyka ma testy jednostkowe
 * (`kosztorysRows`); tutaj chodzi o spiecie: czy suma sie zgadza, czy da sie wrocic
 * do liczenia i czy wpis przezywa odswiezenie.
 */

const POZYCJA = "Robocizna za punkt instalacyjny (szt., opcjonalnie)";
const wartosc = (page: Page) => page.getByLabel(`Wartość pozycji: ${POZYCJA}`);
const cena = (page: Page) => page.getByLabel(`Cena jednostkowa: ${POZYCJA}`);
const ostrzezenie = (page: Page) => page.getByText(/Pozycje o zerowej wartości nie wchodzą/);

/** Suma netto jako liczba. Stopka pokazuje CALY kosztorys, wiec pojedynczej pozycji
 *  nie da sie w niej znalezc po tekscie — sprawdzamy roznice. */
async function nettoKwota(page: Page): Promise<number> {
  const t = await page.locator("tfoot tr").first().innerText();
  return Number(t.replace(/[^0-9.,]/g, "").replace(",", "."));
}

async function kosztorysZTrzemaGniazdkami(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Instalacja" }).click();
  await skipEntryScreen(page);
  const plotno = page.locator("div.overflow-auto.rounded-card.border").first();
  await otworzKatalogElementow(page);
  await page.getByRole("button", { name: /Gniazdo 230 V/ }).first().click();
  for (const dx of [100, 250, 400]) {
    await page.evaluate(() => window.scrollTo(0, 0));
    const box = (await plotno.boundingBox())!;
    await page.mouse.click(box.x + dx, box.y + 80);
  }
  await page.getByRole("button", { name: "Kosztorys", exact: true }).click();
  await expect(page.getByText("RAZEM brutto")).toBeVisible();
}

test("wpisana wartosc wchodzi do sumy zamiast rachunku ilosc x cena", async ({ page }) => {
  await kosztorysZTrzemaGniazdkami(page);

  // Robocizna ma domyslnie cene 0, wiec bez wpisu nie wnosi do sumy nic — i wlasnie
  // dlatego jest najlepszym przykladem pozycji, ktora zna sie tylko ryczaltem.
  const przed = await nettoKwota(page);
  await expect(wartosc(page)).toHaveValue("");

  await wartosc(page).fill("4500");
  await expect.poll(() => nettoKwota(page)).toBeCloseTo(przed + 4500, 2);
  // Cena jednostkowa zostaje nietknieta — liczba punktow to nadal informacja.
  await expect(cena(page)).toHaveValue("0");
});

test("ryczalt zdejmuje ostrzezenie o pozycji poza suma", async ({ page }) => {
  await kosztorysZTrzemaGniazdkami(page);
  await expect(ostrzezenie(page)).toContainText("Robocizna za punkt instalacyjny");

  await wartosc(page).fill("4500");
  // Pozycja wyceniona ryczaltem ma prawo miec zerowa cene za sztuke — dopominanie sie
  // o nia byloby proszeniem o cene czegos, co uzytkownik wlasnie wycenil. Przy trzech
  // gniazdkach robocizna jest jedyna pozycja bez wartosci, wiec ostrzezenie znika calkiem.
  await expect(ostrzezenie(page)).toHaveCount(0);
});

test("zmiana ceny jednostkowej wraca do liczenia, zamiast zostawiac martwa kontrolke", async ({ page }) => {
  await kosztorysZTrzemaGniazdkami(page);
  const przed = await nettoKwota(page);
  await wartosc(page).fill("4500");
  await expect.poll(() => nettoKwota(page)).toBeCloseTo(przed + 4500, 2);

  await cena(page).fill("120");
  // 3 punkty x 120 zl = 360 zl; ryczalt znika, bo uzytkownik wlasnie podal cene za punkt.
  await expect(wartosc(page)).toHaveValue("");
  await expect(wartosc(page)).toHaveAttribute("placeholder", "360.00");
});

test("krzyzyk przywraca liczona wartosc i sam znika", async ({ page }) => {
  await kosztorysZTrzemaGniazdkami(page);
  const przywroc = page.getByLabel(`Przywróć liczoną wartość: ${POZYCJA}`);
  await expect(przywroc).toBeHidden();

  await wartosc(page).fill("4500");
  await expect(przywroc).toBeVisible();
  await przywroc.click();

  await expect(wartosc(page)).toHaveValue("");
  await expect(przywroc).toBeHidden();
});

test("wpisana wartosc przezywa odswiezenie strony", async ({ page }) => {
  await kosztorysZTrzemaGniazdkami(page);
  await wartosc(page).fill("4500");
  const przed = await nettoKwota(page);
  await page.waitForTimeout(900); // debounce autozapisu

  await page.reload();
  await page.getByRole("button", { name: "Kosztorys", exact: true }).click();
  await expect(wartosc(page)).toHaveValue("4500");
  await expect.poll(() => nettoKwota(page)).toBeCloseTo(przed, 2);
});

const ilosc = (page: Page) => page.getByLabel(`Ilość: ${POZYCJA}`);

test("poprawiona ilosc przelicza wartosc i sume", async ({ page }) => {
  await kosztorysZTrzemaGniazdkami(page);
  await cena(page).fill("100");
  const przed = await nettoKwota(page);
  // Robocizna to 3 punkty z rzutu, po 100 zl.
  await expect(ilosc(page)).toHaveAttribute("placeholder", "3");
  await expect(ilosc(page)).toHaveValue("");

  await ilosc(page).fill("8");
  // 8 zamiast 3 punktow to +500 zl przy cenie 100 zl.
  await expect.poll(() => nettoKwota(page)).toBeCloseTo(przed + 500, 2);
});

test("wyzerowana ilosc zostawia wiersz i nie prosi o uzupelnienie ceny", async ({ page }) => {
  await kosztorysZTrzemaGniazdkami(page);
  await expect(ostrzezenie(page)).toContainText("Robocizna za punkt instalacyjny");

  await ilosc(page).fill("0");
  // Pozycja wykreslona z zakresu to nie luka do uzupelnienia — rada „uzupelnij cene"
  // byla by wtedy nie na temat.
  await expect(ostrzezenie(page)).toHaveCount(0);
  // ...ale wiersz zostaje, bo inaczej nie byloby jak cofnac zera.
  await expect(ilosc(page)).toHaveValue("0");
});

test("krzyzyk przy ilosci wraca do oszacowania z rzutu", async ({ page }) => {
  await kosztorysZTrzemaGniazdkami(page);
  const przywroc = page.getByLabel(`Przywróć ilość z rzutu: ${POZYCJA}`);
  await expect(przywroc).toBeHidden();

  await ilosc(page).fill("8");
  await expect(przywroc).toBeVisible();
  await przywroc.click();

  await expect(ilosc(page)).toHaveValue("");
  await expect(ilosc(page)).toHaveAttribute("placeholder", "3");
});

test("ryczalt na wartosci nie blokuje poprawiania ilosci", async ({ page }) => {
  await kosztorysZTrzemaGniazdkami(page);
  await wartosc(page).fill("4500");
  const przed = await nettoKwota(page);

  // „90 punktow robocizny, 14 500 zl ryczaltem" to zdanie sensowne: liczba punktow to
  // informacja o zakresie, a nie skladnik ceny, wiec suma ma zostac nietknieta.
  await ilosc(page).fill("8");
  await expect(ilosc(page)).toHaveValue("8");
  await expect(wartosc(page)).toHaveValue("4500");
  await expect.poll(() => nettoKwota(page)).toBeCloseTo(przed, 2);
});

test("poprawiona ilosc przezywa odswiezenie strony", async ({ page }) => {
  await kosztorysZTrzemaGniazdkami(page);
  await ilosc(page).fill("8");
  await page.waitForTimeout(900); // debounce autozapisu

  await page.reload();
  await page.getByRole("button", { name: "Kosztorys", exact: true }).click();
  await expect(ilosc(page)).toHaveValue("8");
});
