import { test, expect, type Page } from "@playwright/test";
import { wczytajPrzyklad, otworzMenuPaska, przejdzDoNarzedzia, poczekajNaKoniecPrzewijania } from "./_flow";

/**
 * Pola formularzy na telefonie mają co najmniej 16 px.
 *
 * Safari na iPhonie przybliża stronę przy każdym fokusie na polu z czcionką mniejszą niż
 * 16 px i sam jej nie oddala. Wiele pól `.pe-input` miało `text-sm` / `text-xs`, więc
 * zasada „≥ 16 px poniżej `md`" siedzi w jednym miejscu (`index.css`) i ten test pilnuje,
 * że żadne pole na trzech reprezentatywnych ekranach jej nie omija.
 */

test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

const POLA = "input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]):not([type=hidden]), select, textarea";

async function rozmiaryPol(page: Page) {
  return page.$$eval(POLA, (els) =>
    els
      .filter((e) => {
        const r = e.getBoundingClientRect();
        const s = getComputedStyle(e);
        return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
      })
      .map((e) => ({
        pole: e.getAttribute("aria-label") ?? e.getAttribute("placeholder") ?? e.getAttribute("name") ?? e.tagName,
        px: parseFloat(getComputedStyle(e).fontSize),
      })),
  );
}

async function sprawdz(page: Page) {
  const pola = await rozmiaryPol(page);
  expect(pola.length, "ekran ma mieć jakiekolwiek pola").toBeGreaterThan(0);
  expect(pola.filter((p) => p.px < 16)).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test("lista kalkulatorów: wyszukiwarka ma 16 px", async ({ page }) => {
  await przejdzDoNarzedzia(page, "Kalkulatory");
  await expect(page.getByRole("searchbox").or(page.locator("input[type=search], input[placeholder*='Szukaj' i]")).first()).toBeVisible();
  await sprawdz(page);
});

test("okno logowania: pola mają 16 px", async ({ page }) => {
  await page.getByRole("button", { name: "Zaloguj się" }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await sprawdz(page);
});

test("Kosztorys przykładowego projektu: pola mają 16 px", async ({ page }) => {
  await wczytajPrzyklad(page, "mieszkanie");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole("button", { name: "Kosztorys", exact: true }).click();
  await expect(page.getByLabel(/^Wartość pozycji: Gniazdo RJ45/)).toBeVisible();
  await sprawdz(page);
});

test("edytor przykładu: pole grubości ściany i pasek kondygnacji mają 16 px", async ({ page }) => {
  await wczytajPrzyklad(page, "mieszkanie");
  await page.getByRole("button", { name: "Narysuj Ścianę", exact: true }).click();
  await expect(page.getByTestId("wall-thickness-input")).toBeVisible();
  await sprawdz(page);
  // Wysokość kondygnacji siedzi w rozwijanym „Plan”, więc sprawdzana osobno, po jego otwarciu.
  await otworzMenuPaska(page, "Plan");
  await expect(page.getByLabel("Wysokość kondygnacji w metrach")).toBeVisible();
  await sprawdz(page);
  const px = (etykieta: string) => page.getByLabel(etykieta).evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
  expect(await px("Wysokość kondygnacji w metrach")).toBeGreaterThanOrEqual(16);
  expect(await page.getByTestId("wall-thickness-input").evaluate((e) => parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(16);
});

test("okno kondygnacji: pole nazwy ma 16 px", async ({ page }) => {
  await wczytajPrzyklad(page, "mieszkanie");
  await otworzMenuPaska(page, "Plan");
  await page.getByRole("button", { name: "+ Dodaj kondygnację" }).click();
  await expect(page.getByLabel("Nazwa kondygnacji")).toBeVisible();
  await sprawdz(page);
});

test("okno historii wersji: pole nazwy wersji ma 16 px", async ({ page }) => {
  await wczytajPrzyklad(page, "mieszkanie");
  // Po wczytaniu przykładu strona bywa przewinięta, a menu wyskakuje względem przycisku —
  // bez powrotu na górę pozycja menu raz na jakiś czas ląduje poza ekranem telefonu.
  // Ale dopiero po KOŃCU przewijania do edytora: `scrollTo` w trakcie ruchu `dosun`
  // (DesignTab.tsx) cofał chwilę później — akurat wtedy, gdy otwierało się menu.
  await poczekajNaKoniecPrzewijania(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole("button", { name: "Projekty", exact: true }).click();
  const pozycja = page.getByRole("menuitem", { name: /Wersje projektu/ });
  // Menu ustawia się dopiero po pomiarze; pod obciążeniem (równoległe testy) kliknięcie
  // w pierwszej chwili trafiało w pozycję jeszcze poza ekranem telefonu.
  await expect(pozycja).toBeInViewport();
  await pozycja.click();
  await expect(page.getByTestId("historia-wersji")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Nazwa wersji" })).toBeVisible();
  await sprawdz(page);
});
