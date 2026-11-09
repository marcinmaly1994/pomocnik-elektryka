import { test, expect } from "@playwright/test";

/**
 * Wynik główny jest duży i taki sam w każdym kalkulatorze.
 *
 * Przed PR 4 wartość wyniku miała 16–18 px i bywała mniejsza od komunikatu pod nią.
 * Teraz każdy kalkulator, który ma blok wyniku (`.pe-result`) przy wartościach
 * domyślnych, pokazuje go jako listę opisów z wartością co najmniej 20 px — a jeśli
 * wartości są jedna-dwie, co najmniej 24 px. Kalkulatory bez wyniku przy wartościach
 * domyślnych (puste pola) są pomijane jawnie, nie po cichu.
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
      const wynik = page.locator(".pe-result").first();
      if ((await wynik.count()) === 0) {
        bezWyniku.push(id);
        continue;
      }
      const rozmiary = await wynik.locator("dd").evaluateAll((dd) =>
        dd.map((e) => parseFloat(getComputedStyle(e).fontSize))
      );
      expect(rozmiary.length, `${id}: brak <dd> w bloku wyniku`).toBeGreaterThan(0);
      const minimum = rozmiary.length <= 2 ? 24 : 20;
      for (const r of rozmiary) expect(r, `${id}`).toBeGreaterThanOrEqual(minimum);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${id}: poziome przewijanie`).toBe(true);
    }
    // Lista „bez wyniku przy domyślnych” ma być krótka i znana — każda nowa pozycja to sygnał.
    expect(bezWyniku.length, `bez wyniku: ${bezWyniku.join(", ")}`).toBeLessThanOrEqual(4);
  });
}
