import { test, expect, type Page } from "@playwright/test";

/**
 * Warunki doboru w zakladce Rozdzielnica.
 *
 * Dobor projektu przyjmowal je milczaco — 30 stopni, jeden obwod w wiazce, zero
 * spadku na WLZ — mimo ze ten sam silnik liczy kalkulator, ktory je ma od dawna.
 * Dwa pierwsze domysly myla sie w strone NIEBEZPIECZNA: obniżają obciazalnosc,
 * wiec przyjmowanie warunkow najlagodniejszych przepuszcza zbyt cienki przewod.
 * Arytmetyke pilnuja testy jednostkowe; tutaj chodzi o to, czy nastawa z UI
 * DOCIERA do doboru i czy przezywa odswiezenie strony.
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

/** Obciazalnosc Iz pierwszego obwodu gniazd w tabeli doboru. */
async function obciazalnosc(page: Page): Promise<number> {
  const wiersz = page.locator("tr", { hasText: /Obwód gniazd/ }).first();
  await expect(wiersz).toBeVisible({ timeout: 15000 });
  const tekst = await wiersz.innerText();
  const m = tekst.match(/([\d.,]+)\s*A\s/g);
  if (!m) throw new Error("nie znalazlem Iz w: " + tekst);
  // Kolumny: Ib, ..., Iz — bierzemy OSTATNIA wartosc w amperach z wiersza.
  const ostatnia = m[m.length - 1];
  return parseFloat(ostatnia.replace(",", ".").replace(/[^\d.]/g, ""));
}

test("warunki doboru z rozdzielnicy docieraja do doboru i przezywaja odswiezenie", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByText("Zacznij projektować instalację")).toBeVisible();
  await page.getByRole("button", { name: "Narysuj dom samodzielnie" }).click();
  const rozumiem = page.getByRole("button", { name: "Rozumiem" });
  if (await rozumiem.count()) await rozumiem.click();

  await postaw(page, "rozdzielnica", /^Rozdzielnica$/, 80, 80, true);
  for (const x of [200, 260, 320]) await postaw(page, "gniazdo 230", /Gniazdo 230 V/, x, 220);

  await page.getByRole("button", { name: "Rozdzielnica", exact: true }).click();
  const przed = await obciazalnosc(page);

  // 50 stopni — trasa przez nieocieplone poddasze albo kotlownie.
  await page.getByLabel("Temperatura otoczenia").selectOption("50");
  await page.waitForTimeout(400);
  const po = await obciazalnosc(page);
  expect(po).toBeLessThan(przed);
  // Aplikacja mowi WPROST, ze zaostrzyla warunki — przy domyslnych 30 stopniach to
  // ostrzezenie nie moglo sie nigdy pojawic.
  await expect(page.getByText(/Temperatura otoczenia 50 °C obniża obciążalność/)).toBeVisible();

  // Nastawa jest wlasnoscia PROJEKTU, nie widoku — musi przezyc odswiezenie.
  await page.waitForTimeout(900);
  await page.reload();
  await page.getByRole("button", { name: "Rozdzielnica", exact: true }).click();
  expect(await obciazalnosc(page)).toBeCloseTo(po, 5);
});
