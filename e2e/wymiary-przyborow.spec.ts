import { test, expect, type Page } from "@playwright/test";

/**
 * Wlasne wymiary przyboru sanitarnego.
 *
 * To nie jest kosmetyka rysunku. Obrys wanny JEST strefa 1 wg PN-HD 60364-7-701,
 * a strefa 2 siega 0,6 m poza jego krawedz — wiec dlugosc wanny decyduje o tym, ktore
 * gniazdo sprawdzenie rzutu zglosi, a ktore przemilczy. Wanien 1,50 i 1,80 m sprzedaje
 * sie tyle samo co 1,70, ktora aplikacja przyjmuje jako typowa.
 */

async function planBox(page: Page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  return (await page.locator("div.overflow-auto.rounded-card.border").first().boundingBox())!;
}

/** Punkt PLANU przeliczony na wspolrzedne ekranu — widok sam dopasowuje powiekszenie,
 *  wiec offsety ekranowe liczymy z rzeczywistej skali sceny. */
async function naEkranie(page: Page, x: number, y: number) {
  const box = await planBox(page);
  const skala = await page.evaluate(() => {
    const k = (window as unknown as { Konva: { stages: { scaleX(): number }[] } }).Konva;
    return k.stages[0].scaleX();
  });
  return { x: box.x + x * skala, y: box.y + y * skala };
}

/** Rysowanie od zera daje STANDARDOWA skale (1 jedn. = 5 cm), bez ktorej reguly
 *  metryczne sa celowo pomijane. */
async function pustyProjektZeSkala(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByRole("heading", { name: "Zaprojektuj instalację elektryczną w swoim domu" })).toBeVisible();
  await page.getByRole("button", { name: "Narysuj dom samodzielnie" }).click();
  const rozumiem = page.getByRole("button", { name: "Rozumiem" });
  if (await rozumiem.count()) await rozumiem.click();
}

async function postaw(page: Page, szukaj: string, nazwa: RegExp, x: number, y: number) {
  await page.getByRole("button", { name: "Wstaw Element" }).click();
  await page.getByPlaceholder(/Szukaj elementu/).fill(szukaj);
  await page.getByRole("button", { name: nazwa }).click();
  const p = await naEkranie(page, x, y);
  await page.mouse.click(p.x, p.y);
}

async function otworzEdycje(page: Page, typ: string) {
  await page.waitForTimeout(900); // debounce autozapisu — stad bierzemy pozycje
  const el = await page.evaluate((t) => {
    const d = JSON.parse(localStorage.getItem("pomocnikelektryka_projekt_autosave")!);
    return d.draft.elements.find((e: { type: string }) => e.type === t) ?? null;
  }, typ);
  if (!el) throw new Error(`Nie ma elementu typu ${typ}`);
  await page.getByRole("button", { name: "Zaznacz", exact: true }).click();
  const p = await naEkranie(page, el.x, el.y);
  await page.mouse.dblclick(p.x, p.y);
  await expect(page.getByText("Edytuj element")).toBeVisible();
}

const karta = (page: Page) => page.locator("div.pe-card", { hasText: "Sprawdzenie rzutu" });

/**
 * 31 jedn. planu = 1,55 m od srodka wanny.
 *
 * Typowa wanna 1,70 m: strefa 2 konczy sie 0,85 + 0,60 = 1,45 m od srodka — gniazdo
 * stoi POZA nia. Wanna 2,20 m: 1,10 + 0,60 = 1,70 m — to samo gniazdo jest juz
 * W SRODKU. Jedna liczba w oknie edycji przewraca werdykt.
 */
const ODLEGLOSC = 31;

test("dluzsza wanna wciaga gniazdo w strefe 2, choc gniazdo nie drgnelo", async ({ page }) => {
  await pustyProjektZeSkala(page);
  await postaw(page, "wanna", /Wanna/, 200, 200);
  await postaw(page, "gniazdo 230", /Gniazdo 230 V/, 200 + ODLEGLOSC, 200);

  await expect(karta(page)).not.toContainText("Gniazdo w strefie 2");

  await otworzEdycje(page, "wanna");
  await page.getByLabel("Długość przyboru w centymetrach").fill("220");
  await page.getByRole("button", { name: "Zapisz" }).click();

  await expect(karta(page)).toContainText("Gniazdo w strefie 2");
});

test("wymiar zapisuje sie na elemencie i przezywa odswiezenie", async ({ page }) => {
  await pustyProjektZeSkala(page);
  await postaw(page, "wanna", /Wanna/, 200, 200);

  await otworzEdycje(page, "wanna");
  await page.getByLabel("Długość przyboru w centymetrach").fill("150");
  await page.getByLabel("Szerokość przyboru w centymetrach").fill("70");
  await page.getByRole("button", { name: "Zapisz" }).click();

  await page.waitForTimeout(900);
  await page.reload();
  await otworzEdycje(page, "wanna");
  await expect(page.getByLabel("Długość przyboru w centymetrach")).toHaveValue("150");
  await expect(page.getByLabel("Szerokość przyboru w centymetrach")).toHaveValue("70");
});

test("bzdurny wymiar wraca do typowego, zamiast rozdymac strefe", async ({ page }) => {
  await pustyProjektZeSkala(page);
  await postaw(page, "wanna", /Wanna/, 200, 200);
  await postaw(page, "gniazdo 230", /Gniazdo 230 V/, 200 + ODLEGLOSC, 200);

  await otworzEdycje(page, "wanna");
  // 2000 cm to 20 m — literowka, nie wanna. Bez odsiania takiej wartosci strefa
  // ochronna objelaby pol mieszkania i zglosila kazde gniazdo w projekcie.
  await page.getByLabel("Długość przyboru w centymetrach").fill("2000");
  await page.getByRole("button", { name: "Zapisz" }).click();

  await expect(karta(page)).not.toContainText("Gniazdo w strefie 2");
});
