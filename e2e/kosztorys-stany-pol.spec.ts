import { test, expect } from "@playwright/test";
import { wczytajPrzyklad } from "./_flow";

/**
 * W kosztorysie widać, co policzyła aplikacja, a co wpisał użytkownik.
 *
 * Audyt redesignu: ilość z rzutu wyglądała jak wyłączone pole (szara podpowiedź),
 * a wartość — jak pole do wypełnienia, choć była wyliczona. Teraz: przerywana ramka
 * i czytelny tekst = wartość liczona (można ją nadpisać), pełna miedziana ramka =
 * wpisana ręcznie. Legenda nad tabelą mówi to słowami.
 */
test("pole liczone ma przerywaną ramkę i czytelny tekst, wpisane — pełną", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await wczytajPrzyklad(page, "mieszkanie");
  await page.getByRole("button", { name: "Kosztorys", exact: true }).click();

  await expect(page.getByText(/przerywana ramka/i)).toBeVisible();

  const ilosc = page.getByLabel(/^Ilość: Gniazdko 230V podwójne/);
  await expect(ilosc).toHaveAttribute("data-stan", "liczone");
  const styl = await ilosc.evaluate((e) => {
    const s = getComputedStyle(e);
    const p = getComputedStyle(e, "::placeholder");
    return { ramka: s.borderTopStyle, podpowiedz: p.color };
  });
  expect(styl.ramka).toBe("dashed");
  // Podpowiedź w kolorze tekstu (ink #16202B), nie wyszarzona.
  expect(styl.podpowiedz).toBe("rgb(22, 32, 43)");

  await ilosc.fill("9");
  await expect(ilosc).toHaveAttribute("data-stan", "wpisane");
  expect(await ilosc.evaluate((e) => getComputedStyle(e).borderTopStyle)).toBe("solid");

  const wartosc = page.getByLabel(/^Wartość pozycji: Gniazdko 230V podwójne/);
  await expect(wartosc).toHaveAttribute("data-stan", "liczone");
});
