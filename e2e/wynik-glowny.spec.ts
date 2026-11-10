import { test, expect } from "@playwright/test";

/**
 * Wynik główny jest duży i taki sam w każdym kalkulatorze.
 *
 * Przed PR 4 wartość wyniku miała 16–18 px i bywała mniejsza od komunikatu pod nią.
 * Teraz każdy blok wyniku (`.pe-result`) przy wartościach domyślnych pokazuje listę
 * opisów z wartością co najmniej 20 px — a jeśli wartości są jedna-dwie, co najmniej
 * 24 px. Sprawdzamy KAŻDY blok z `<dd>`, nie tylko pierwszy.
 */
const KALKULATORY = [
  "moc", "obwod", "gGWkladka", "spadek", "dlugosc", "impedancja", "zwarcie", "petla",
  "uziemienieTT", "uziom", "rcd", "peN", "bilansFaz", "kompensacja", "silnik", "spd",
  "pv", "ev", "oswietlenie",
] as const;

for (const szer of [375, 1366]) {
  test(`${szer} px: wynik główny jako lista opisów, wartości ≥ 20 px`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: szer, height: 900 });
    const bezWyniku: string[] = [];
    for (const id of KALKULATORY) {
      await page.goto(`/kalkulatory/${id}`);
      await expect(page.getByRole("heading", { name: "Kalkulatory elektryczne" })).toBeVisible();
      // Wynik bywa liczony chwilę po wejściu — bez czekania późny blok zostałby uznany za „brak wyniku”.
      await expect(page.locator(".pe-result").first()).toBeVisible({ timeout: 3000 }).catch(() => {});
      // Blok oznaczony `data-drugorzedny` to drugi blok pod głównym (18 px celowo, żeby nie
      // konkurował z wynikiem) — reguła ≥ 20/24 px zostaje ścisła dla wyników głównych.
      const bloki = page.locator(".pe-result:not([data-drugorzedny])");
      const ile = await bloki.count();
      if (ile === 0) {
        bezWyniku.push(id);
        continue;
      }
      for (let i = 0; i < ile; i++) {
        const rozmiary = await bloki.nth(i).locator("dd").evaluateAll((dd) =>
          dd.map((e) => parseFloat(getComputedStyle(e).fontSize))
        );
        // Blok bez <dd> to tylko znaczniki pod wynikiem (np. drugi blok w kalkulatorze) — pomijamy;
        // ale co najmniej jeden blok kalkulatora musi mieć wartości (sprawdzane niżej).
        if (rozmiary.length === 0) continue;
        const minimum = rozmiary.length <= 2 ? 24 : 20;
        for (const r of rozmiary) expect(r, `${id} (blok ${i})`).toBeGreaterThanOrEqual(minimum);
      }
      expect(await bloki.locator("dd").count(), `${id}: brak <dd> w blokach wyniku`).toBeGreaterThan(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${id}: poziome przewijanie`).toBe(true);
    }
    // „Lista pouczenia” (rcd) to zestaw zasad doboru, nie kalkulator — przy wartościach domyślnych
    // nie ma tam żadnego wyniku. Każda nowa pozycja na tej liście to sygnał regresji.
    expect(bezWyniku).toEqual(["rcd"]);
  });
}

test("1366 px: WLZ w Doborze obwodu ma wartości główne ≥ 24 px", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto("/kalkulatory/obwod");
  await expect(page.getByRole("heading", { name: "Kalkulatory elektryczne" })).toBeVisible();
  await page.getByRole("tab", { name: "WLZ", exact: true }).click();
  const wynik = page.locator(".pe-result").first();
  await expect(wynik).toBeVisible();
  const rozmiary = await wynik.locator("dd").evaluateAll((dd) => dd.map((e) => parseFloat(getComputedStyle(e).fontSize)));
  expect(rozmiary.length).toBeGreaterThan(0);
  for (const r of rozmiary) expect(r).toBeGreaterThanOrEqual(24);
});
