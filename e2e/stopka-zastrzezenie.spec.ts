import { test, expect, type Page } from "@playwright/test";

/**
 * Zastrzeżenie prawne w stopce nie może być zasłonięte przez nawigację.
 *
 * Pigułki „Cofnij/Dalej" to `position: fixed` w rogach OKNA, więc leżą na tym, co
 * akurat jest pod spodem. Po przewinięciu na sam dół tym czymś jest stopka — a tam
 * stoi zdanie o tym, że wyniki nie zastępują odbioru przez osobę z uprawnieniami
 * SEP/budowlanymi. Akurat to zdanie znikało pod przyciskiem.
 *
 * Mierzymy RENDER, a nie wpisane wartości: test złapie też przyszłą zmianę rozmiaru
 * pigułki albo jej odstępu od krawędzi.
 */

test.use({ viewport: { width: 1440, height: 900 } });

const ZASTRZEZENIE = /wykonywać wyłącznie uprawniony elektryk/;

async function wejdzNaPrzyklad(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: /Zobacz gotowy przykład/ }).click();
  await expect(page.getByRole("button", { name: "Rozdzielnica", exact: true })).toBeVisible();
}

async function nachodzenie(page: Page) {
  return page.evaluate((wzor) => {
    const re = new RegExp(wzor);
    const akapit = [...document.querySelectorAll("p")].find((p) => re.test(p.textContent ?? ""));
    const pigulki = [...document.querySelectorAll("button")].filter((b) => /^(Cofnij|Dalej):/.test(b.textContent?.trim() ?? ""));
    if (!akapit || pigulki.length === 0) return null;
    const a = akapit.getBoundingClientRect();
    return pigulki.map((b) => {
      const r = b.getBoundingClientRect();
      return {
        przycisk: b.textContent!.trim(),
        nachodzi: a.left < r.right && a.right > r.left && a.top < r.bottom && a.bottom > r.top,
      };
    });
  }, ZASTRZEZENIE.source);
}

/** Nagłówek treści zakładki — czekamy na NIEGO, a nie na samo kliknięcie: zakładki
 *  wczytują się leniwie, a przy krótkim, jeszcze niedomontowanym dokumencie stopka
 *  ląduje przy dolnej krawędzi okna i test zgłaszał nachodzenie, którego w gotowej
 *  stronie nie ma. */
const NAGLOWEK: Record<string, RegExp> = {
  Schemat: /Schemat instalacji/,
  Kosztorys: /Kosztorys instalacji elektrycznej/,
};

for (const zakladka of ["Schemat", "Kosztorys"]) {
  test(`zastrzeżenie w stopce nie chowa się pod nawigacją — zakładka ${zakladka}`, async ({ page }) => {
    await wejdzNaPrzyklad(page);
    await page.getByRole("button", { name: zakladka, exact: true }).click();
    await expect(page.getByRole("heading", { name: NAGLOWEK[zakladka] })).toBeVisible();
    await expect(page.getByText(ZASTRZEZENIE)).toBeVisible();

    // Przewijamy na sam dół i czekamy, aż wysokość dokumentu PRZESTANIE się zmieniać —
    // inaczej mierzymy układ, który za chwilę urośnie i przesunie stopkę.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForFunction(() => {
      const w = window as unknown as { __hPoprzednia?: number };
      const h = document.documentElement.scrollHeight;
      const stabilna = w.__hPoprzednia === h;
      w.__hPoprzednia = h;
      return stabilna && Math.abs(window.scrollY + window.innerHeight - h) < 2;
    }, null, { timeout: 10000 });

    const wynik = await nachodzenie(page);
    expect(wynik).not.toBeNull();
    expect(wynik!.length).toBeGreaterThan(0);
    for (const p of wynik!) {
      expect(p.nachodzi, `„${p.przycisk}" leży na zastrzeżeniu`).toBe(false);
    }
  });
}
