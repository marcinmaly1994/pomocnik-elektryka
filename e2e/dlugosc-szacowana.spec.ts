import { test, expect, type Page } from "@playwright/test";

/**
 * Dlugosc trasy ze SZACUNKU, nie z drogi po scianach.
 *
 * Brak skali aplikacja zglaszala wprost, brak geometrii — niczego. Tymczasem szacunek
 * Manhattan jest KROTSZY od drogi, ktora przewod naprawde pokona, wiec zaniza spadek
 * napiecia. Arytmetyke pilnuja testy jednostkowe; tutaj chodzi o to, czy uzytkownik
 * w ogole sie o tym dowiaduje — i czy komunikat znika, gdy przestaje byc prawdziwy.
 */

async function planBox(page: Page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  const wrap = page.locator("div.overflow-auto.rounded-card.border").first();
  await expect(wrap).toBeVisible({ timeout: 15000 });
  return (await wrap.boundingBox())!;
}

async function postaw(page: Page, szukaj: string, nazwa: RegExp, x: number, y: number, ostatni = false) {
  await page.getByRole("button", { name: "Wstaw Element" }).click();
  await page.getByPlaceholder(/Szukaj elementu/).fill(szukaj);
  const poz = page.getByRole("button", { name: nazwa });
  await (ostatni ? poz.last() : poz.first()).click();
  const box = await planBox(page);
  await page.mouse.click(box.x + x, box.y + y);
  await page.waitForTimeout(250);
}

test("rzut bez scian: dobor mowi, ze dlugosc jest szacunkiem — i milknie po narysowaniu pokoju", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByText("Zacznij projektować instalację")).toBeVisible();
  await page.getByRole("button", { name: "Narysuj dom samodzielnie" }).click();
  const rozumiem = page.getByRole("button", { name: "Rozumiem" });
  if (await rozumiem.count()) await rozumiem.click();

  // Rozdzielnica i gniazda, ale ANI JEDNEJ sciany i ani jednego pomieszczenia.
  await postaw(page, "rozdzielnica", /^Rozdzielnica$/, 60, 300, true);
  for (const x of [250, 310, 370]) await postaw(page, "gniazdo 230", /Gniazdo 230 V/, x, 60);

  await page.getByRole("button", { name: "Rozdzielnica", exact: true }).click();
  const ostrzezenie = page.getByText(/to szacunek \(odległość prostokątna\)/);
  await expect(ostrzezenie).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/spadek napięcia .* jest zaniżony/)).toBeVisible();

  // Obrys pomieszczenia daje routingowi po czym prowadzic trase — komunikat przestaje
  // byc prawdziwy, wiec ma zniknac.
  await page.getByRole("button", { name: "Instalacja" }).first().click();
  await page.getByRole("button", { name: "Narysuj Pomieszczenie", exact: true }).click();
  await page.getByRole("button", { name: "Prostokąt" }).click();
  const box = await planBox(page);
  await page.mouse.move(box.x + 40, box.y + 40);
  await page.mouse.down();
  await page.mouse.move(box.x + 420, box.y + 330, { steps: 8 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Dodaj pomieszczenie" }).click();
  await page.waitForTimeout(600);

  await page.getByRole("button", { name: "Rozdzielnica", exact: true }).click();
  await expect(ostrzezenie).toHaveCount(0);
});
