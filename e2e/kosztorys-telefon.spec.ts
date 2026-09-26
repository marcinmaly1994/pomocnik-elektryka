import { test, expect } from "@playwright/test";
import { wczytajPrzyklad } from "./_flow";

/**
 * Kosztorys na telefonie mieści się w ekranie — łącznie z kolumną wartości.
 *
 * Tabela miała pięć kolumn o stałych szerokościach pól (ilość, cena, wartość) i na
 * 375 px wychodziła poza kartę: kolumna „Wartość" leżała za prawą krawędzią, dostępna
 * tylko przez przewinięcie tabeli w bok, o którym nic nie mówiło. Na wąskim ekranie
 * wiersz jest teraz kartą: nazwa u góry, trzy podpisane pola pod spodem.
 *
 * Emulacja telefonu (`isMobile`) — patrz edytor-telefon-zwarty.spec.ts.
 */

test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

test("wartość pozycji widać na telefonie bez przewijania tabeli w bok", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await wczytajPrzyklad(page, "mieszkanie");

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole("button", { name: /Kosztorys/ }).first().click();

  const wartosc = page.getByLabel(/^Wartość pozycji: Gniazdo RJ45/);
  await expect(wartosc).toBeVisible();

  const pomiar = await page.evaluate(() => {
    const tabela = document.querySelector("table")!;
    const okno = tabela.parentElement!;
    const pole = document.querySelector<HTMLInputElement>('input[aria-label^="Wartość pozycji: Gniazdo RJ45"]')!;
    return {
      przewijanaWBok: okno.scrollWidth > okno.clientWidth + 1,
      stronaWBok: document.documentElement.scrollWidth > window.innerWidth + 1,
      prawaPola: pole.getBoundingClientRect().right,
      szerokoscOkna: window.innerWidth,
    };
  });
  expect(pomiar.przewijanaWBok).toBe(false);
  expect(pomiar.stronaWBok).toBe(false);
  expect(pomiar.prawaPola).toBeLessThanOrEqual(pomiar.szerokoscOkna);

  // Podpisy pól zastępują nagłówek tabeli, który na telefonie jest schowany.
  await expect(page.locator("tbody").getByText("Wartość", { exact: true }).first()).toBeVisible();
});

test("na komputerze kosztorys zostaje tabelą z nagłówkiem", async ({ browser }) => {
  const kontekst = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await kontekst.newPage();
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await wczytajPrzyklad(page, "mieszkanie");
  await page.getByRole("button", { name: /Kosztorys/ }).first().click();
  await expect(page.getByRole("columnheader", { name: /Wartość/ })).toBeVisible();
  const wyswietlanie = await page.evaluate(() => getComputedStyle(document.querySelector("table")!).display);
  expect(wyswietlanie).toBe("table");
  await kontekst.close();
});
