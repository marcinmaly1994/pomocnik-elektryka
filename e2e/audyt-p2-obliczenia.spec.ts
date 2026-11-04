import { test, expect, type Page } from "@playwright/test";

/**
 * Pakiet „obliczenia" z audytu 2026-11-04 (B5–B9) — na działających kalkulatorach,
 * z tymi samymi danymi, na których błędy zostały znalezione.
 */

async function kalkulator(page: Page, id: string) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.goto(`/kalkulatory/${id}`);
}

test("B5: uziom pionowy 3 m / 16 mm, ρ 100, cel 30 Ω — potrzebna długość ~3,6 m, nie 4,7 m", async ({ page }) => {
  await kalkulator(page, "uziom");
  // dane domyślne kalkulatora są dokładnie przypadkiem z audytu
  await expect(page.getByText("35,12 Ω").first()).toBeVisible();
  await expect(page.getByText(/długość dla 30 Ω: 3,6 m/)).toBeVisible();
});

test("B6: metoda uproszczona liczy z cosφ i nie przeczy minimalnemu przekrojowi", async ({ page }) => {
  await kalkulator(page, "spadek");
  await page.getByLabel("Prąd obciążenia (Ib)").fill("16");
  await page.getByLabel("Współczynnik cos φ").fill("0.8");
  await page.getByLabel("Długość trasy (w jedną stronę)").fill("44");
  await page.getByLabel("Dopuszczalny spadek napięcia").selectOption("5");

  // dawniej: 5,47% „niespełniony" obok „min. przekrój w limicie 2,5 mm²"
  await expect(page.getByText("4,37 %").first()).toBeVisible();
  await expect(page.getByText(/Warunek spełniony/).first()).toBeVisible();
  await expect(page.getByText(/ΔU = 2 · M · cosφ \/ \(γ · S\)/)).toBeVisible();
});

test("B7: własna stacja — ten sam limit 8% w Doborze obwodu i w Spadku napięcia", async ({ page }) => {
  await kalkulator(page, "obwod");
  await page.getByLabel(/Zasilanie z własnej stacji transformatorowej/).check();
  await expect(page.getByText(/\(limit 8%\)/).first()).toBeVisible();

  await page.goto("/kalkulatory/spadek");
  await expect(page.getByLabel("Dopuszczalny spadek napięcia").locator("option")).toHaveText([
    "3% — oświetlenie (sieć publiczna)",
    "5% — pozostałe odbiorniki (sieć publiczna)",
    "6% — oświetlenie (własna stacja trafo)",
    "8% — pozostałe (własna stacja trafo)",
  ]);
});

test("B8 + B9: wkładka gG — Zs max z Cmin 0,95 i warunek I₂ ≤ 1,45·Iz", async ({ page }) => {
  await kalkulator(page, "gGWkladka");
  const wynik = page.locator(".pe-result").first();
  await expect(wynik).toContainText("1,821 Ω"); // 0,95·230/120
  await expect(page.getByText(/I₂ ≤ 1,45·Iz NIE został sprawdzony/)).toBeVisible();

  // wkładka 25 A na przewodzie o Iz 24 A: I₂ = 40 A > 34,8 A
  await page.getByLabel("Prąd obliczeniowy Ib").fill("25");
  await page.getByLabel("Obciążalność przewodu Iz").fill("24");
  await expect(page.getByText(/przewód o większej obciążalności/).first()).toBeVisible();

  await page.getByLabel("Obciążalność przewodu Iz").fill("30");
  await expect(page.getByText(/przewód o większej obciążalności/)).toHaveCount(0);
});
