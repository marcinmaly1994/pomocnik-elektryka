import { test, expect, type Page } from "@playwright/test";
import { wczytajPrzyklad } from "./_flow";

/**
 * Tabela doboru obwodów na telefonie.
 *
 * Miała dziewięć kolumn i 442 px szerokości w okienku 285 px, więc przewijała się w bok:
 * kolumny ΔU, Zs max i RCD — te, od których zależy bezpieczeństwo — leżały poza ekranem
 * bez żadnego znaku, że tam są, a po przesunięciu nazwa obwodu znikała z widoku. Na
 * wąskim ekranie każdy obwód jest teraz kartą z ośmioma podpisanymi wartościami; od
 * 768 px zostaje zwykła tabela.
 *
 * Emulacja telefonu (`isMobile`) — patrz edytor-telefon-zwarty.spec.ts.
 */

test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

const KOLUMNY = ["Faza", "Ib", "Przekrój", "Aparat", "Iz", "ΔU", "Zs max", "RCD"];

async function otworzDobor(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await wczytajPrzyklad(page, "dom");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole("button", { name: /Rozdzielnica/ }).first().click();
  await expect(page.getByRole("heading", { name: "Dobór obwodów wg PN-HD 60364" })).toBeVisible();
}

test("na telefonie wszystkie osiem wartości obwodu mieści się w ekranie — przy każdej szerokości", async ({ page }) => {
  await otworzDobor(page);

  for (const szerokosc of [320, 375, 430]) {
    await page.setViewportSize({ width: szerokosc, height: 812 });
    await page.waitForTimeout(150);
    const pomiar = await page.evaluate((kolumny) => {
      const tabela = [...document.querySelectorAll("table")].find((t) => t.querySelector("td[data-label]"))!;
      const okno = tabela.parentElement!;
      const wiersz = tabela.querySelector("tbody tr")!;
      const komorki = [...wiersz.querySelectorAll<HTMLElement>("td[data-label]")];
      return {
        przewijanaWBok: okno.scrollWidth > okno.clientWidth + 1,
        stronaWBok: document.documentElement.scrollWidth > window.innerWidth + 1,
        podpisy: komorki.map((k) => k.dataset.label),
        // Prawa krawędź TEKSTU komórki, nie samej komórki: komórka może być szersza od treści.
        poZaEkranem: komorki
          .map((k) => {
            const zakres = document.createRange();
            zakres.selectNodeContents(k);
            return { podpis: k.dataset.label!, prawa: zakres.getBoundingClientRect().right };
          })
          .filter((k) => k.prawa > window.innerWidth + 0.5)
          .map((k) => k.podpis),
        // Wartość z jednostką stoi w jednej linii („8,70 A"), nie rozpada się na dwie.
        // Mierzone na WĘZŁACH TEKSTOWYCH: zakres obejmujący element (np. kolorowy <span> fazy)
        // zwraca osobny prostokąt dla elementu i dla tekstu w nim, choć linia jest jedna.
        rozbite: komorki
          .filter((k) => {
            const chodzik = document.createTreeWalker(k, NodeFilter.SHOW_TEXT);
            for (let w = chodzik.nextNode(); w; w = chodzik.nextNode()) {
              if (!w.textContent?.trim()) continue;
              const zakres = document.createRange();
              zakres.selectNodeContents(w);
              if (zakres.getClientRects().length > 1) return true;
            }
            return false;
          })
          .map((k) => k.dataset.label!),
        naglowekTabeliWidoczny: getComputedStyle(tabela.querySelector("thead")!).display !== "none",
        kolumny,
      };
    }, KOLUMNY);

    expect(pomiar.podpisy, `szerokość ${szerokosc} px`).toEqual(KOLUMNY);
    expect(pomiar.przewijanaWBok, `szerokość ${szerokosc} px: tabela przewija się w bok`).toBe(false);
    expect(pomiar.stronaWBok, `szerokość ${szerokosc} px: strona przewija się w bok`).toBe(false);
    expect(pomiar.poZaEkranem, `szerokość ${szerokosc} px: wartości poza ekranem`).toEqual([]);
    expect(pomiar.rozbite, `szerokość ${szerokosc} px: wartości rozbite na dwie linie`).toEqual([]);
    expect(pomiar.naglowekTabeliWidoczny, `szerokość ${szerokosc} px`).toBe(false);
  }
});

test("na telefonie objaśnienia skrótów stoją w rozwijanym spisie — to jedyne miejsce, które tłumaczy Ib, Iz i Zs max", async ({ page }) => {
  await otworzDobor(page);
  const spis = page.locator("details", { hasText: "Co oznaczają skróty?" });
  await expect(spis).toBeVisible();
  // Zwinięty: sama treść objaśnień jest schowana.
  await expect(spis.getByText("Maksymalna impedancja pętli zwarcia")).toBeHidden();
  await spis.getByText("Co oznaczają skróty?").click();
  await expect(spis.getByText(/Prąd obliczeniowy/)).toBeVisible();
  await expect(spis.getByText(/Maksymalna impedancja pętli zwarcia/)).toBeVisible();
  await expect(spis.getByText(/Spadek napięcia na trasie/)).toBeVisible();
});

test("na komputerze dobór zostaje tabelą z nagłówkiem i dymkami, bez spisu skrótów", async ({ browser }) => {
  const kontekst = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await kontekst.newPage();
  await otworzDobor(page);
  await expect(page.getByRole("button", { name: "Zs max", exact: true })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Obwód" })).toBeVisible();
  await expect(page.locator("details", { hasText: "Co oznaczają skróty?" })).toBeHidden();
  // Podpisy kart (data-label) nie pokazują się nad wartościami w tabeli.
  const podpisWidoczny = await page.evaluate(() => {
    const kom = document.querySelector("td[data-label]")!;
    return getComputedStyle(kom, "::before").display !== "none";
  });
  expect(podpisWidoczny).toBe(false);
  await kontekst.close();
});
