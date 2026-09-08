import { test, expect } from "@playwright/test";
import { skipEntryScreen } from "./_flow";

/**
 * Numer obwodu nadawany RECZNIE z menu pod prawym przyciskiem.
 *
 * Automat dzieli obwody po rodzaju punktu, mokrosci pomieszczenia i kolejnosci —
 * a projektant czesto chce inaczej: kuchnia osobno, dwa pokoje razem, bo blisko
 * pionu. To decyzja projektowa, ktorej z samego rysunku nie da sie odgadnac, wiec
 * musi byc sposob, zeby ja wyrazic.
 */

async function otworzPlan(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const pomin = page.getByRole("button", { name: "Pomiń — ustawię później" });
  if (await pomin.count()) await pomin.click();
  await page.getByRole("button", { name: "Instalacja" }).click();
  await skipEntryScreen(page);
  await page.getByRole("button", { name: "Narysuj dom samodzielnie" }).first().click();
  const rozumiem = page.getByRole("button", { name: "Rozumiem" });
  if (await rozumiem.count()) await rozumiem.click();
  await page.getByRole("button", { name: /Powiększenie \d+ procent/ }).click();
}

async function planBox(page: import("@playwright/test").Page) {
  const wrap = page.locator("div.overflow-auto.rounded-card.border").first();
  await wrap.evaluate((e) => {
    e.scrollIntoView({ block: "start" });
    e.scrollTo(0, 0);
  });
  return (await wrap.boundingBox())!;
}

/** Stawia element wybranego typu w podanych punktach planu. */
async function postaw(page: import("@playwright/test").Page, przycisk: RegExp, punkty: { x: number; y: number }[]) {
  const cel = page.getByRole("button", { name: przycisk }).first();
  if (!(await cel.isVisible().catch(() => false))) {
    await page.getByRole("button", { name: /Gniazda i zasilanie/ }).click();
  }
  const box = await planBox(page);
  for (const p of punkty) {
    await page.getByRole("button", { name: przycisk }).first().click();
    await page.mouse.click(box.x + p.x, box.y + p.y);
  }
  await page.getByRole("button", { name: "Zaznacz", exact: true }).click();
  return box;
}

test("dwa gniazda dostaja ten sam numer obwodu i skladaja sie na JEDEN obwod", async ({ page }) => {
  await otworzPlan(page);
  const box = await postaw(page, /Gniazdo 230 V/, [
    { x: 150, y: 150 },
    { x: 220, y: 150 },
  ]);

  // Pierwsze gniazdo zaklada nowy obwod...
  await page.mouse.click(box.x + 150, box.y + 150, { button: "right" });
  await expect(page.getByText("Numer obwodu")).toBeVisible();
  await page.getByRole("button", { name: "+ 1" }).click();

  // ...a drugie DOLACZA do istniejacego. Bez listy uzytych numerow trzeba by
  // pamietac, ze obwod 1 w ogole istnieje.
  await page.mouse.click(box.x + 220, box.y + 150, { button: "right" });
  await page.getByTitle("Dołącz do obwodu 1").click();
  await page.waitForTimeout(900); // autozapis ma 600 ms debounce'u

  // Rozdzielnica pokazuje JEDEN obwod z dwoma punktami, nazwany numerem.
  await page.getByRole("button", { name: "Rozdzielnica", exact: true }).click();
  await expect(page.getByText(/Obwód 1/).first()).toBeVisible();

  // Numer przezywa odswiezenie — to czesc projektu, nie stan widoku.
  await page.reload();
  await expect(page.getByText(/Obwód 1/).first()).toBeVisible();
});

test("odbiornik z wlasnym obwodem z definicji nie da sie przypisac — i menu mowi dlaczego", async ({ page }) => {
  await otworzPlan(page);
  const box = await postaw(page, /Ładowarka EV/, [{ x: 180, y: 150 }]);

  await page.mouse.click(box.x + 180, box.y + 150, { button: "right" });
  await expect(page.getByText("Numer obwodu")).toBeVisible();
  await expect(page.getByText(/ma własny obwód z definicji/)).toBeVisible();
  // Zadnego przycisku wyboru — ani „auto", ani numeru.
  await expect(page.getByRole("button", { name: "auto" })).toHaveCount(0);
});

/**
 * Ostrzezenie, nie blokada — tak jak wszedzie indziej w tej aplikacji: liczymy,
 * pokazujemy werdykt i mowimy dlaczego, zamiast odmawiac. Mieszanka oswietlenia
 * z gniazdami bywa uzasadniona, ale dobor potraktuje taki obwod jako oswietleniowy
 * (1,5 mm², B10) i o tym trzeba powiedziec.
 */
test("obwod mieszajacy oswietlenie z gniazdami jest zglaszany w rozdzielnicy", async ({ page }) => {
  await otworzPlan(page);
  const box = await postaw(page, /Gniazdo 230 V/, [{ x: 150, y: 150 }]);

  await page.getByRole("button", { name: /Oświetlenie/ }).first().click();
  await page.getByRole("button", { name: /Punkt sufitowy/ }).first().click();
  await page.mouse.click(box.x + 220, box.y + 150);
  await page.getByRole("button", { name: "Zaznacz", exact: true }).click();

  await page.mouse.click(box.x + 150, box.y + 150, { button: "right" });
  await page.getByRole("button", { name: "+ 1" }).click();
  await page.mouse.click(box.x + 220, box.y + 150, { button: "right" });
  await page.getByTitle("Dołącz do obwodu 1").click();
  await page.waitForTimeout(900);

  await page.getByRole("button", { name: "Rozdzielnica", exact: true }).click();
  await expect(page.getByText(/miesza oświetlenie/)).toBeVisible();
  await expect(page.getByText(/za mało pod gniazda/)).toBeVisible();
});

/**
 * Numer obwodu obowiazuje w CALYM projekcie, nie na kondygnacji: rozdzielnica
 * grupuje po nim wszystkie elementy, niezaleznie od pietra. Lista uzytych numerow
 * liczona z jednej kondygnacji proponowala wiec na pietrze numer zajety na parterze
 * — i klikniecie po cichu scalalo dwa niezwiazane zestawy punktow w jeden obwod.
 */
test("numery z innych kondygnacji sa widoczne, a nowy numer ich nie powtarza", async ({ page }) => {
  await otworzPlan(page);
  const box = await postaw(page, /Gniazdo 230 V/, [{ x: 150, y: 150 }]);
  await page.mouse.click(box.x + 150, box.y + 150, { button: "right" });
  await page.getByRole("button", { name: "+ 1" }).click();
  await page.waitForTimeout(900);

  await page.getByRole("button", { name: "+ Dodaj kondygnację" }).click();
  await page.getByRole("textbox").fill("Piętro 1");
  await page.getByRole("button", { name: "Dodaj" }).click();
  await expect(page.getByRole("button", { name: "Piętro 1", exact: true })).toBeVisible();

  const box2 = await postaw(page, /Gniazdo 230 V/, [{ x: 200, y: 200 }]);
  await page.mouse.click(box2.x + 200, box2.y + 200, { button: "right" });

  // Obwod 1 z parteru JEST na liscie — i mowi, ze jest gdzie indziej.
  await expect(page.getByTitle(/Dołącz do obwodu 1 — ten obwód jest na innej kondygnacji/)).toBeVisible();
  // A „nowy" proponuje 2, nie 1: inaczej klikniecie scalaloby pietro z parterem.
  await expect(page.getByRole("button", { name: "+ 2" })).toBeVisible();
  await expect(page.getByRole("button", { name: "+ 1" })).toHaveCount(0);
});
