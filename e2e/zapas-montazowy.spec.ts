import { test, expect, type Page } from "@playwright/test";

/**
 * Zapas montazowy na punkt: nastawa + rozbicie w kosztorysie.
 *
 * Doliczany do KAZDEGO punktu, wiec przy stu punktach robi sie z niego kilkaset metrow
 * kabla — a dotad siedzial w sumie nierozroznialny od zmierzonej trasy i nie dalo sie
 * go ani sprawdzic, ani zmienic.
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

/** Liczba metrow zapasu wypisana w kosztorysie. */
async function zapasZKosztorysu(page: Page): Promise<number> {
  await page.getByRole("button", { name: "Kosztorys", exact: true }).click();
  const zdanie = page.getByText(/to zapasy montażowe/);
  await expect(zdanie).toBeVisible({ timeout: 15000 });
  const m = (await zdanie.innerText()).match(/Z tego\s+([\d\s]+)\s*m\s+to zapasy/);
  if (!m) throw new Error("nie znalazlem liczby: " + (await zdanie.innerText()));
  return parseInt(m[1].replace(/\s/g, ""), 10);
}

test("zapas montazowy: widoczny w kosztorysie i do ustawienia w rozdzielnicy", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByRole("heading", { name: "Zaprojektuj instalację elektryczną w swoim domu" })).toBeVisible();
  await page.getByRole("button", { name: "Narysuj dom samodzielnie" }).click();
  const rozumiem = page.getByRole("button", { name: "Rozumiem" });
  if (await rozumiem.count()) await rozumiem.click();

  await postaw(page, "rozdzielnica", /^Rozdzielnica$/, 60, 300, true);
  for (const x of [200, 260, 320, 380]) await postaw(page, "gniazdo 230", /Gniazdo 230 V/, x, 60);

  // Cztery gniazda po 0,5 m (wartosc domyslna) = 2 m zapasu.
  expect(await zapasZKosztorysu(page)).toBe(2);

  // Nastawa w Rozdzielnicy zmienia liczbe w Kosztorysie — jedno pokretlo, nie dwa.
  await page.getByRole("button", { name: "Rozdzielnica", exact: true }).click();
  await page.getByLabel("Zapas montażowy na punkt w metrach").fill("1.5");
  await page.waitForTimeout(500);
  expect(await zapasZKosztorysu(page)).toBe(6);
});
