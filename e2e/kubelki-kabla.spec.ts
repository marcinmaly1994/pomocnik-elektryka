import { test, expect, type Page } from "@playwright/test";

/**
 * Pozycja kosztorysu wg PRZEKROJU z doboru.
 *
 * Kubelki byly trzy i dopasowywaly sie po fragmencie tekstu, wiec wszystko powyzej
 * 2,5 mm2 wycenialo sie jako 2,5 mm2 — kosztorys kazal kupic cienszy kabel, niz sam
 * zaprojektowal. Arytmetyke pilnuja testy jednostkowe; tutaj chodzi o to, czy przekroj
 * z Rozdzielnicy naprawde dociera do wiersza w Kosztorysie.
 */

async function planBox(page: Page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  const wrap = page.locator("[data-testid=plan-okno]").first();
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

test("przekroj z doboru trafia do WLASNEJ pozycji kosztorysu", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByRole("heading", { name: "Zaprojektuj instalację elektryczną w swoim domu" })).toBeVisible();
  await page.getByRole("button", { name: "Narysuj dom samodzielnie" }).click();
  const rozumiem = page.getByRole("button", { name: "Rozumiem" });
  if (await rozumiem.count()) await rozumiem.click();

  await postaw(page, "rozdzielnica", /^Rozdzielnica$/, 60, 300, true);
  for (const x of [200, 260, 320]) await postaw(page, "gniazdo 230", /Gniazdo 230 V/, x, 60);

  // Domyslne warunki: obwod wychodzi na 2,5 mm2 i taka jest pozycja w kosztorysie.
  await page.getByRole("button", { name: "Kosztorys", exact: true }).click();
  await expect(page.getByRole("cell", { name: /Przewód YDYp 3×2,5/ })).toBeVisible({ timeout: 15000 });

  // Ostre warunki podnosza przekroj — kosztorys MUSI za tym pojsc.
  await page.getByRole("button", { name: "Rozdzielnica", exact: true }).click();
  await page.getByLabel("Temperatura otoczenia").selectOption("50");
  await page.getByLabel("Obwodów w wiązce").selectOption("6");
  await page.waitForTimeout(500);
  const wiersz = page.locator("tr", { hasText: /Obwód gniazd/ }).first();
  const przekroj = (await wiersz.innerText()).match(/(\d+(?:,\d+)?)\s*mm²/)![1];
  expect(przekroj).not.toBe("2,5");

  await page.getByRole("button", { name: "Kosztorys", exact: true }).click();
  // Ten sam przekroj co na froncie rozdzielnicy — we WLASNYM wierszu...
  await expect(page.getByRole("cell", { name: new RegExp(`Przewód YDYp 3×${przekroj}`) })).toBeVisible({ timeout: 15000 });
  // ...a pozycja 2,5 mm² znika, bo nie ma juz takiego przewodu w instalacji.
  await expect(page.getByRole("cell", { name: /Przewód YDYp 3×2,5/ })).toHaveCount(0);
});
