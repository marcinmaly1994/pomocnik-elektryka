import { test, expect, type Page } from "@playwright/test";

/**
 * Protokoły pomiarowe na telefonie.
 *
 * Co tu było nie tak:
 * - Tabele pomiarów miały 620–673 px w okienku 285 px: nagłówki łamały się na sześć
 *   linii, pola wyników miały po 25 px, a „Ocena" i kosz stały za prawą krawędzią.
 * - Oględziny: treść pozycji w jednym rzędzie z trzema ocenami i koszem — zostawało na
 *   nią 62 px („Izolacja pr…"), więc nie było wiadomo, co się ocenia.
 * - Pola 12–14 px — Safari na iPhonie przybliżał stronę przy każdym z nich.
 * - Kosze 13 × 13 px.
 * - Wybrany protokół otwierał się POD siedmioma kafelkami, poza ekranem.
 */

const TABELE = [
  "Pomiar rezystancji izolacji",
  "Pomiar impedancji pętli zwarcia",
  "Badanie wyłączników różnicowoprądowych",
  "Pomiar rezystancji uziemienia",
  "Sprawdzenie ciągłości przewodów ochronnych",
  "Ochrona odgromowa (LPS)",
];

async function otworzProtokoly(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Protokoły pomiarowe" }).first().click();
  await expect(page.getByTestId("karta-protokolu")).toBeVisible();
}

/** Kafelek protokołu — nazwa kafelka zaczyna się od tytułu, dalej stoi „brak danych". */
function kafelek(page: Page, tytul: string) {
  return page.getByRole("button", { name: new RegExp("^" + tytul.replace(/[()]/g, (c) => "\\" + c)) }).first();
}

test.describe("na telefonie", () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

  test("tabele pomiarów są kartami: bez przewijania w bok, pola czytelne, kosz pod palcem", async ({ page }) => {
    await otworzProtokoly(page);
    for (const tytul of TABELE) {
      await kafelek(page, tytul).click();
      await page.getByRole("button", { name: /Dodaj wiersz/ }).click();
      const wiersz = page.getByTestId("wiersz-pomiaru").last();
      await wiersz.scrollIntoViewIfNeeded();

      const m = await wiersz.evaluate((tr) => {
        const karta = tr.closest("[data-testid=karta-protokolu]")!;
        const przewijane = [...karta.querySelectorAll("*")].some(
          (e) => /(auto|scroll)/.test(getComputedStyle(e).overflowX) && e.scrollWidth > e.clientWidth + 1
        );
        const pola = [...tr.querySelectorAll("input, select")].map((e) => ({
          szer: e.getBoundingClientRect().width,
          prawa: e.getBoundingClientRect().right,
          font: parseFloat(getComputedStyle(e).fontSize),
        }));
        return { przewijane, pola, szerStrony: document.documentElement.scrollWidth };
      });
      expect(m.przewijane, tytul).toBe(false);
      expect(m.szerStrony, tytul).toBeLessThanOrEqual(375);
      expect(m.pola.length, tytul).toBeGreaterThan(0);
      for (const p of m.pola) {
        expect(p.szer, tytul).toBeGreaterThanOrEqual(70);
        expect(p.prawa, tytul).toBeLessThanOrEqual(375);
        expect(p.font, tytul).toBeGreaterThanOrEqual(16);
      }
      const kosz = (await wiersz.getByRole("button", { name: /^Usuń wiersz/ }).boundingBox())!;
      expect(kosz.x + kosz.width, tytul).toBeLessThanOrEqual(375);
      expect(kosz.width, tytul).toBeGreaterThanOrEqual(44);
      await page.evaluate(() => window.scrollTo(0, 0));
    }
  });

  test("oględziny: treść pozycji czytelna, oceny i kosz w ekranie", async ({ page }) => {
    await otworzProtokoly(page);
    await kafelek(page, "Oględziny instalacji").click();
    await page.getByRole("button", { name: /Wczytaj listę kontrolną/ }).click();
    const tresc = page.getByLabel("Pozycja oględzin 1", { exact: true });
    expect((await tresc.boundingBox())!.width).toBeGreaterThan(250);
    // Cała treść widoczna — pole rośnie w pionie, zamiast ucinać tekst w bok.
    expect(await tresc.evaluate((e) => e.scrollHeight <= e.clientHeight + 1 && e.scrollWidth <= e.clientWidth + 1)).toBe(true);
    expect((await tresc.boundingBox())!.height).toBeGreaterThan(30);
    const niezgodne = page.getByRole("button", { name: "niezgodne" }).first();
    const b = (await niezgodne.boundingBox())!;
    expect(b.x + b.width).toBeLessThanOrEqual(375);
    const kosz = (await page.getByRole("button", { name: "Usuń pozycję 1", exact: true }).boundingBox())!;
    expect(kosz.x + kosz.width).toBeLessThanOrEqual(375);
    expect(kosz.width).toBeGreaterThanOrEqual(44);
  });

  test("wybór kafelka przewija do karty protokołu", async ({ page }) => {
    await otworzProtokoly(page);
    await kafelek(page, "Ochrona odgromowa (LPS)").click();
    await expect(page.getByTestId("karta-protokolu").getByRole("heading", { name: "Ochrona odgromowa (LPS)" })).toBeInViewport();
  });
});

test("na komputerze pomiary zostają tabelą z nagłówkiem", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await otworzProtokoly(page);
  await kafelek(page, "Pomiar rezystancji izolacji").click();
  await page.getByRole("button", { name: /Dodaj wiersz/ }).click();
  await expect(page.getByRole("columnheader", { name: "L1-L2" })).toBeVisible();
  expect(await page.getByTestId("wiersz-pomiaru").first().evaluate((e) => getComputedStyle(e).display)).toBe("table-row");
});
