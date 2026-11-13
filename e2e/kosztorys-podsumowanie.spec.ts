import { test, expect, type Page } from "@playwright/test";
import { wczytajPrzyklad } from "./_flow";

/**
 * Kosztorys na komputerze.
 *
 * Kwota brutto stała wyłącznie pod tabelą, ok. 1700 px pod nagłówkiem — pierwsza
 * rzecz, której się tu szuka, była ostatnią, jaką się widziało. Teraz podsumowanie
 * stoi też na górze, z tym samym podpisem co suma na dole.
 *
 * Kolumna „Wartość" pisała „90.00" z kropką, a cena i sumy — „2279,50" z przecinkiem.
 */

async function otworz(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await wczytajPrzyklad(page, "mieszkanie");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole("button", { name: /Kosztorys/ }).first().click();
  // Zakładka ładuje się leniwie — czekamy na tabelę.
  await expect(page.locator('input[aria-label^="Wartość pozycji:"]').first()).toBeVisible();
}

test("podsumowanie z kwotą brutto stoi na górze, bez przewijania, i zgadza się z sumą na dole", async ({ page }) => {
  await otworz(page);
  const gora = page.getByTestId("podsumowanie-kosztorysu");
  await expect(gora).toBeInViewport();
  await expect(gora).toContainText("RAZEM brutto — sam materiał");

  const kwotaGora = (await gora.locator(".text-copper").textContent())!.trim();
  const kwotaDol = (await page.locator("tfoot tr").last().locator("td").last().textContent())!.trim();
  expect(kwotaGora).toBe(kwotaDol);
  // 5, nie 4: przykład ma ogranicznik przepięć dołożony ręcznie, a aparaty ręczne
  // celowo nie mają ceny domyślnej (przegląd 12.11.2026, pkt 4).
  await expect(gora).toContainText(/Bez ceny\s*5 pozycji — poza sumą/);
});

test("wartości w tabeli z polskim przecinkiem dziesiętnym", async ({ page }) => {
  await otworz(page);
  const placeholdery = await page.locator('input[aria-label^="Wartość pozycji:"]').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).placeholder));
  expect(placeholdery.length).toBeGreaterThan(10);
  for (const p of placeholdery) expect(p).toMatch(/^\d+,\d{2}$/);
});

/**
 * Tabela kosztorysu: grupy z sumą częściową, pozycje bez ceny widoczne w wierszu
 * i rozsądna szerokość na monitorze.
 */
test("pozycje w grupach z sumą częściową; suma grup = netto", async ({ page }) => {
  await otworz(page);
  const grupy = page.getByTestId("grupa-kosztorysu");
  await expect(grupy.filter({ hasText: "Przewody" })).toBeVisible();
  expect(await grupy.count()).toBeGreaterThanOrEqual(6);
  const sumy = await grupy.evaluateAll((gs) =>
    gs.map((g) => Number((g.querySelector(".pe-mono")?.textContent || "").replace(/[^\d,]/g, "").replace(",", ".")))
  );
  const netto = await page.getByTestId("podsumowanie-kosztorysu").evaluate((e) => {
    const dd = [...e.querySelectorAll("dt")].find((d) => d.textContent === "Netto")!.nextElementSibling!;
    return Number(dd.textContent!.replace(/[^\d,]/g, "").replace(",", "."));
  });
  expect(sumy.reduce((a, b) => a + b, 0)).toBeCloseTo(netto, 2);
});

test("pozycje bez ceny są oznaczone w samym wierszu", async ({ page }) => {
  await otworz(page);
  const bez = page.locator("tr[data-bez-ceny]");
  await expect(bez).toHaveCount(5); // z ogranicznikiem przepięć przykładu
  await expect(bez.filter({ hasText: "Robocizna" })).toContainText("Bez ceny — nie wchodzi do sumy");
});

test("na szerokim ekranie nazwa pozycji nie odjeżdża od liczb", async ({ page }) => {
  await otworz(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  const szer = await page.locator("thead th").first().evaluate((e) => e.getBoundingClientRect().width);
  expect(szer).toBeLessThan(700);
});
