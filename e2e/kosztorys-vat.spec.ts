import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { wczytajPrzyklad } from "./_flow";

/**
 * Stawka VAT w kosztorysie jest do wyboru i zapisuje się z projektem.
 *
 * Kosztorys liczył zawsze 23%, a aplikacja jest adresowana głównie do mieszkań i domów,
 * gdzie roboty rozliczane z wykonawcą idą zwykle na 8% — brutto wychodziło więc
 * zawyżone o kilkanaście procent, także w CSV i PDF-ie dla wykonawcy.
 */

/** Liczba z kwoty w stylu „2 279,50 zł" / „2279,50 zł". */
function kwota(tekst: string | null): number {
  return Number((tekst ?? "").replace(/[^\d,]/g, "").replace(",", "."));
}

async function sumy(page: Page) {
  const komorka = (etykieta: RegExp) =>
    page.locator("tfoot tr").filter({ hasText: etykieta }).locator("td").last().textContent();
  return {
    netto: kwota(await komorka(/Razem netto/)),
    vat: kwota(await komorka(/VAT/)),
    brutto: kwota(await komorka(/RAZEM brutto/)),
  };
}

test("wybór 8% przelicza sumy, trafia do CSV i zostaje po odświeżeniu", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await wczytajPrzyklad(page, "mieszkanie");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole("button", { name: /Kosztorys/ }).first().click();

  const stawka = page.getByLabel("Stawka VAT");
  await expect(stawka).toHaveValue("23");
  const przed = await sumy(page);
  expect(przed.vat).toBeCloseTo(przed.netto * 0.23, 1);

  await stawka.selectOption("8");
  await expect.poll(async () => (await sumy(page)).vat).toBeCloseTo(przed.netto * 0.08, 1);
  const po = await sumy(page);
  expect(po.netto).toBe(przed.netto);
  expect(po.brutto).toBeCloseTo(po.netto + po.vat, 1);

  const [pobranie] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: /Eksportuj CSV/ }).click(),
  ]);
  const csv = await readFile((await pobranie.path())!, "utf8");
  expect(csv).toContain("\nVAT 8%;");
  expect(csv).not.toContain("VAT 23%");

  // Autozapis ma okno 600 ms — czekamy, aż stawka trafi do zapisu, zanim odświeżymy.
  await expect
    .poll(() => page.evaluate(() => Object.values(localStorage).some((v) => v.includes('"stawkaVat":8'))))
    .toBe(true);
  await page.reload();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole("button", { name: /Kosztorys/ }).first().click();
  await expect(page.getByLabel("Stawka VAT")).toHaveValue("8");
});
