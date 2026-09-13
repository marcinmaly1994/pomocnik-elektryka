import { test, expect, type Page } from "@playwright/test";
import { otworzMenuPaska } from "./_flow";

/**
 * Skala jest wlasnoscia KONDYGNACJI, nie projektu.
 *
 * Rozdzielnica, Schemat i Kosztorys licza obwody z calego budynku, ale skale bralay
 * z kondygnacji AKURAT OTWARTEJ w edytorze. Metry na pozostalych pietrach wychodzily
 * przez to przemnozone przez przypadkowy wspolczynnik, a wynik zmienial sie przy samym
 * przelaczeniu zakladki kondygnacji — czyli po cichu i nie do powtorzenia.
 *
 * Arytmetyke ma `loads.test.ts` / `project.test.ts`. Tutaj chodzi o objaw widoczny
 * w aplikacji: ta sama instalacja ma dawac ten sam metraz niezaleznie od tego, na ktora
 * kondygnacje sie patrzy.
 */

async function planBox(page: Page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  return (await page.locator("div.overflow-auto.rounded-card.border").first().boundingBox())!;
}

async function naEkranie(page: Page, x: number, y: number) {
  const box = await planBox(page);
  const skala = await page.evaluate(() => {
    const k = (window as unknown as { Konva: { stages: { scaleX(): number }[] } }).Konva;
    return k.stages[0].scaleX();
  });
  return { x: box.x + x * skala, y: box.y + y * skala };
}

/** Wybor z biblioteki po SZUKAJCE i po klasie pozycji, nie po samej nazwie: „Rozdzielnica"
 *  jest jednoczesnie nazwa kroku w nawigacji u gory, wiec goly `getByRole` trafia w dwa
 *  rozne przyciski. */
async function postaw(page: Page, szukaj: string, nazwa: RegExp, x: number, y: number) {
  await page.getByRole("button", { name: "Wstaw Element" }).click();
  await page.getByPlaceholder(/Szukaj elementu/).fill(szukaj);
  await page.locator("button.w-full.items-center.gap-2.rounded-md").filter({ hasText: nazwa }).first().click();
  const p = await naEkranie(page, x, y);
  await page.mouse.click(p.x, p.y);
}

/** Kalibruje BIEZACA kondygnacje odcinkiem o znanej dlugosci w jednostkach planu. */
async function skalibruj(page: Page, jednostki: number, metry: number) {
  await page.getByRole("button", { name: "Kalibracja skali" }).click();
  const a = await naEkranie(page, 100, 120);
  const b = await naEkranie(page, 100 + jednostki, 120);
  await page.mouse.click(a.x, a.y);
  await page.mouse.click(b.x, b.y);
  await page.getByLabel("Długość odcinka w metrach").fill(String(metry));
  await page.getByRole("button", { name: "Zatwierdź skalę" }).click();
}

/** Metry przewodu 3x2,5 z kosztorysu — kolumna „Ilosc" tej pozycji. */
async function metryKabla(page: Page): Promise<number> {
  await page.getByRole("button", { name: "Kosztorys", exact: true }).click();
  const wiersz = page.getByRole("row", { name: /YDYp 3×2,5/ });
  await expect(wiersz).toBeVisible();
  const komorki = wiersz.locator("td");
  return Number((await komorki.nth(1).innerText()).trim());
}

test("metraz kabla nie zalezy od tego, ktora kondygnacja jest otwarta", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByRole("heading", { name: "Zaprojektuj instalację elektryczną w swoim domu" })).toBeVisible();
  await page.getByRole("button", { name: "Narysuj dom samodzielnie" }).click();
  const rozumiem = page.getByRole("button", { name: "Rozumiem" });
  if (await rozumiem.count()) await rozumiem.click();

  // PARTER: rozdzielnica i gniazdko, skala z rysowania od zera (1 jedn. = 5 cm).
  await postaw(page, "rozdzielnica", /Rozdzielnica/, 100, 300);
  await postaw(page, "gniazdo 230", /Gniazdo 230 V/, 400, 300);

  // PIETRO: wlasna, wyraznie inna skala i wlasne gniazdko. Nowa kondygnacja dziedziczy
  // skale poprzedniej, wiec zeby zobaczyc blad, trzeba ja swiadomie przekalibrowac —
  // dokladnie tak, jak robi to ktos wgrywajacy osobny skan na kazde pietro.
  await otworzMenuPaska(page, "Plan");
  await page.getByRole("button", { name: "+ Dodaj kondygnację" }).click();
  await page.getByRole("button", { name: "Dodaj", exact: true }).click();
  await skalibruj(page, 200, 1); // 1 jedn. = 0,5 cm, dziesieciokrotnie gesciej niz parter
  await postaw(page, "gniazdo 230", /Gniazdo 230 V/, 400, 300);
  await page.waitForTimeout(900); // debounce autozapisu

  const zPietra = await metryKabla(page);

  // Powrot na parter — te same dane, ta sama instalacja, inna otwarta kondygnacja.
  await page.getByRole("button", { name: "Instalacja" }).click();
  await page.getByRole("button", { name: "Parter", exact: true }).click();
  const zParteru = await metryKabla(page);

  expect(zParteru).toBe(zPietra);
});
