import { test, expect, type Page } from "@playwright/test";
import { wczytajPrzyklad } from "./_flow";

/**
 * Kazdy przycisk musi miec DOSTEPNA NAZWE.
 *
 * Polowa przyciskow w tej aplikacji to sama ikona — olowek, strzalki, kosz, lupa.
 * Dla oka to czytelne, dla czytnika ekranu przycisk bez `aria-label` ani `title`
 * to po prostu „przycisk". W liscie aparatow stoja takie TRZY obok siebie, w
 * kilkunastu wierszach pod rzad: „przycisk, przycisk, przycisk" czternascie razy,
 * bez cienia informacji, ktory co robi i ktorego aparatu dotyczy.
 *
 * Zmierzone przed poprawka: 41 przyciskow bez nazwy, WSZYSTKIE w Rozdzielnicy
 * (strzalki w gore/w dol i kosz w liscie aparatow). Reszta aplikacji — piec
 * pozostalych zakladek — byla czysta, i ten test jest po to, zeby taka zostala.
 *
 * Projekt PRZYKLADOWY, a nie pusty: wiekszosc list jest pusta, dopoki nie ma
 * czego w nich pokazac, wiec na czystym projekcie ten audyt nie widzi niczego
 * i przechodzi bez wzgledu na stan kodu. Pierwsza wersja tego pomiaru wlasnie
 * tak zrobila — pokazala zero bledow i byla bezwartosciowa.
 */

/** Widoczne przyciski bez nazwy — opisane tak, zeby dalo sie je znalezc w kodzie. */
async function przyciskiBezNazwy(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll("button")]
      .filter((b) => {
        const r = b.getBoundingClientRect();
        // Schowane nie przeszkadzaja nikomu — czytnik ich nie oglasza.
        if (r.width === 0 || r.height === 0) return false;
        const nazwa = (b.getAttribute("aria-label") ?? b.getAttribute("title") ?? b.textContent ?? "").trim();
        return nazwa === "";
      })
      .map((b) => (b.outerHTML.match(/<button[^>]*>/)?.[0] ?? "").replace(/\s+/g, " ").slice(0, 120))
  );
}

const ZAKLADKI = ["Rozdzielnica", "Kalkulatory", "Protokoły pomiarowe", "Schemat", "Kosztorys", "Instalacja"] as const;

test("zaden przycisk nie zostaje bez nazwy dla czytnika ekranu", async ({ page }) => {
  // Szesc zakladek, kazda z leniwie wczytywanym kawalkiem kodu — dluzej niz domyslne 30 s.
  test.setTimeout(180000);

  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await wczytajPrzyklad(page, "mieszkanie");
  await page.locator("canvas").first().waitFor({ state: "visible" });

  for (const zakladka of ZAKLADKI) {
    await page.getByRole("button", { name: zakladka, exact: true }).first().click();
    // Zakladka wchodzi przez `React.lazy`, wiec jej kod dociera siecia.
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    /**
     * STRAZ NA SAM AUDYT.
     *
     * Gdyby zakladka jeszcze sie nie zamontowala, lista przyciskow bylaby pusta
     * i audyt przeszedlby po cichu, niczego nie ogladajac. Pusty wynik ma znaczyc
     * „sprawdzone i czyste", a nie „nie bylo czego sprawdzac" — a te dwie rzeczy
     * wygladaja identycznie. Pierwsza wersja tego pomiaru pokazala zero bledow
     * wlasnie dlatego, ze patrzyla na pusty projekt.
     */
    const wszystkie = await page.locator("button:visible").count();
    expect(wszystkie, `zakladka „${zakladka}” wyglada na niezamontowana`).toBeGreaterThan(5);

    const braki = await przyciskiBezNazwy(page);
    expect(braki, `przyciski bez nazwy w zakladce „${zakladka}”:\n${[...new Set(braki)].join("\n")}`).toEqual([]);
  }
});
