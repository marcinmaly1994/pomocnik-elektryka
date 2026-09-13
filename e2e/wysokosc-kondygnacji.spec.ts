import { test, expect, type Page } from "@playwright/test";
import { otworzMenuPaska } from "./_flow";

/**
 * Wysokosc kondygnacji a DLUGOSC przewodu.
 *
 * Pion miedzy pietrami liczyl sie dotad ze sztywnych 2,8 m. Przy wysokim parterze albo
 * poddaszu dawalo to przewod krotszy od rzeczywistego — czyli za maly policzony spadek
 * napiecia i dobor przepuszczajacy zbyt cienki kabel. Arytmetyke pilnuja testy
 * jednostkowe w `lib/panel/loads.test.ts`; tutaj chodzi o to, czy liczba wpisana
 * w pasku kondygnacji w ogole DOCIERA do doboru.
 */

async function planBox(page: Page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  // Edytor jest `React.lazy()` — bez czekania na plotno mierzylibysmy element,
  // ktorego jeszcze nie ma (patrz `skipEntryScreen` w _flow.ts).
  const wrap = page.locator("div.overflow-auto.rounded-card.border").first();
  await expect(wrap).toBeVisible({ timeout: 15000 });
  return (await wrap.boundingBox())!;
}

/** `ostatni` dla rozdzielnicy: „Rozdzielnica" to takze nazwa ZAKLADKI u gory, wiec
 *  `.first()` trafia w nia zamiast w element biblioteki i przelacza widok. */
async function postaw(page: Page, szukaj: string, nazwa: RegExp, x: number, y: number, ostatni = false) {
  await page.getByRole("button", { name: "Wstaw Element" }).click();
  await page.getByPlaceholder(/Szukaj elementu/).fill(szukaj);
  const pozycja = page.getByRole("button", { name: nazwa });
  await (ostatni ? pozycja.last() : pozycja.first()).click();
  const box = await planBox(page);
  await page.mouse.click(box.x + x, box.y + y);
  await page.waitForTimeout(250);
}

/** Spadek napiecia [%] pierwszego obwodu w tabeli doboru. */
async function spadek(page: Page): Promise<number> {
  await page.getByRole("button", { name: "Rozdzielnica", exact: true }).click();
  const wiersz = page.locator("tr", { hasText: /Obwód gniazd/ }).first();
  await expect(wiersz).toBeVisible({ timeout: 15000 });
  const tekst = await wiersz.innerText();
  const m = tekst.match(/([\d.,]+)\s*%/);
  if (!m) throw new Error("nie znalazlem spadku napiecia w: " + tekst);
  return parseFloat(m[1].replace(",", "."));
}

test("wysokosc kondygnacji wchodzi w policzony spadek napiecia", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByRole("heading", { name: "Zaprojektuj instalację elektryczną w swoim domu" })).toBeVisible();
  await page.getByRole("button", { name: "Narysuj dom samodzielnie" }).click();
  const rozumiem = page.getByRole("button", { name: "Rozumiem" });
  if (await rozumiem.count()) await rozumiem.click();

  // Rozdzielnica na parterze...
  await postaw(page, "rozdzielnica", /^Rozdzielnica$/, 80, 80, true);

  // ...a gniazdo PIETRO WYZEJ, zeby obwod musial przejsc przez strop.
  await otworzMenuPaska(page, "Plan");
  await page.getByRole("button", { name: "+ Dodaj kondygnację" }).click();
  await page.getByRole("textbox").first().fill("Piętro 1");
  await page.getByRole("button", { name: "Dodaj", exact: true }).click();
  await expect(page.getByRole("button", { name: "Piętro 1", exact: true })).toBeVisible();
  await postaw(page, "gniazdo 230", /Gniazdo 230 V/, 300, 200);

  const przed = await spadek(page);

  // Wysokosc BIEZACEJ kondygnacji — wracamy na parter i podnosimy go do 3,6 m.
  await page.getByRole("button", { name: "Instalacja" }).first().click();
  await page.getByRole("button", { name: "Parter", exact: true }).click();
  await otworzMenuPaska(page, "Plan");
  const wysokosc = page.getByLabel("Wysokość kondygnacji w metrach");
  await expect(wysokosc).toHaveValue("");
  await wysokosc.fill("3.6");
  await page.waitForTimeout(400);

  const po = await spadek(page);
  // Wyzszy parter to dluzszy pion, czyli dluzszy przewod i WIEKSZY spadek napiecia.
  expect(po).toBeGreaterThan(przed);

  // Wyczyszczenie pola wraca do wartosci typowej — inaczej nie dalo by sie odkrecic
  // wpisanej liczby inaczej niz przez cofanie.
  await page.getByRole("button", { name: "Instalacja" }).first().click();
  await otworzMenuPaska(page, "Plan");
  await page.getByLabel("Wysokość kondygnacji w metrach").fill("");
  await page.waitForTimeout(400);
  expect(await spadek(page)).toBeCloseTo(przed, 5);
});
