import { test, expect, type Page } from "@playwright/test";

/**
 * Metraz przewodow niskopradowych liczony z planu.
 *
 * Kosztorys bral 15 mb na kazdy punkt, niezaleznie od tego, gdzie ten punkt stoi.
 * Arytmetyke pilnuja testy jednostkowe; tutaj chodzi o to, czy POLOZENIE gniazda na
 * rzucie naprawde zmienia liczbe w wierszu kosztorysu.
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

/** Ilosc w wierszu „Przewod UTP kat. 6". */
async function metryLan(page: Page): Promise<number> {
  await page.getByRole("button", { name: "Kosztorys", exact: true }).click();
  const pole = page.getByRole("spinbutton", { name: /Ilość: Przewód UTP/ });
  await expect(pole).toBeVisible({ timeout: 15000 });
  // Pole ilosci jest PUSTE, dopoki nikt go nie nadpisal — policzona wartosc siedzi
  // w placeholderze (patrz `qtyOverridden` w CostsTab).
  return parseFloat((await pole.getAttribute("placeholder")) ?? "");
}

async function nowyProjekt(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByRole("heading", { name: "Zaprojektuj instalację elektryczną w swoim domu" })).toBeVisible();
  await page.getByRole("button", { name: "Narysuj dom samodzielnie" }).click();
  const rozumiem = page.getByRole("button", { name: "Rozumiem" });
  if (await rozumiem.count()) await rozumiem.click();
}

test("metraz LAN zalezy od POLOZENIA gniazda, a nie od ich liczby", async ({ page }) => {
  await nowyProjekt(page);
  await postaw(page, "rozdzielnica", /^Rozdzielnica$/, 60, 60, true);
  await postaw(page, "rj45", /Gniazdo RJ45/, 110, 60);
  const blisko = await metryLan(page);

  await nowyProjekt(page);
  await postaw(page, "rozdzielnica", /^Rozdzielnica$/, 60, 60, true);
  await postaw(page, "rj45", /Gniazdo RJ45/, 500, 330);
  const daleko = await metryLan(page);

  // Ryczalt dawal obu 15 mb. Teraz dalsze gniazdo kosztuje wiecej kabla.
  expect(daleko).toBeGreaterThan(blisko);
});

test("bez rozdzielnicy zostaje ryczalt i kosztorys mowi o tym wprost", async ({ page }) => {
  await nowyProjekt(page);
  await postaw(page, "rj45", /Gniazdo RJ45/, 300, 200);

  await page.getByRole("button", { name: "Kosztorys", exact: true }).click();
  await expect(page.getByText(/nadal z ryczałtu 15 mb na punkt/)).toBeVisible({ timeout: 15000 });
  expect(await metryLan(page)).toBe(15);
});
