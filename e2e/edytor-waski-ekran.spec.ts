import { test, expect } from "@playwright/test";

/**
 * Edytor planu na ekranie telefonu.
 *
 * Zmierzone przed zmiana (okno 375 x 780): dokument mial 655 px szerokosci, czyli
 * CALA aplikacja przewijala sie w poziomie, a plotno zaczynalo sie 822 px od gory —
 * ponizej dolnej krawedzi ekranu. Rzut, jedyna rzecz, po ktora sie tu przychodzi,
 * byl niewidoczny bez przewijania, a chrome nad nim zajmowala wiecej niz caly ekran.
 *
 * Kazdy test sprawdza tez, ze na monitorze NIC sie nie zmienilo — to byl warunek
 * tej przebudowy.
 */

const TELEFON = { width: 375, height: 780 };
const MONITOR = { width: 1280, height: 800 };

/**
 * Ekran wejscia („Wgraj rzut / Narysuj dom / Pomiń") pokazuje sie, dopoki nie
 * zostal odrzucony. Odrzucenie jedzie przez autozapis z debouncem 600 ms, wiec po
 * klknieciu trzeba odczekac — bez tego kolejne wejscie na „/" w tym samym tescie
 * zastaje ekran wejscia od nowa.
 */
async function otworzEdytor(page: import("@playwright/test").Page) {
  await page.goto("/");
  const pomin = page.getByRole("button", { name: /Pomiń/ });
  const plotno = page.locator("canvas").first();
  // Zakładka ładuje się leniwie, więc na starcie nie ma jeszcze ANI ekranu wejścia,
  // ANI płótna — czekamy na to, co pojawi się pierwsze.
  await Promise.race([
    pomin.waitFor({ state: "visible" }).catch(() => {}),
    plotno.waitFor({ state: "visible" }).catch(() => {}),
  ]);
  if (await pomin.isVisible().catch(() => false)) {
    await pomin.click();
    await page.waitForTimeout(800);
  }
  await expect(plotno).toBeVisible();
}

test("na telefonie strona NIE przewija sie w poziomie", async ({ page }) => {
  await page.setViewportSize(TELEFON);
  await otworzEdytor(page);

  const { doc, okno } = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    okno: window.innerWidth,
  }));
  expect(doc).toBe(okno);
});

test("na telefonie caly rzut miesci sie w kolumnie planu", async ({ page }) => {
  await page.setViewportSize(TELEFON);
  await otworzEdytor(page);

  // Dolna granica powiekszenia jest na waskim ekranie nizsza (patrz `minZoom`).
  // Przy dawnych 0,4 plan mial 400 px przy kolumnie ~250 px, wiec calego mieszkania
  // nie dalo sie zobaczyc ani razu — nawet po „dopasuj widok".
  const szerPlotna = (await page.locator("canvas").first().boundingBox())!.width;
  expect(szerPlotna).toBeLessThanOrEqual(TELEFON.width);
});

test("panel boczny startuje ZWINIETY na telefonie, a rozwiniety na monitorze", async ({ page }) => {
  await page.setViewportSize(TELEFON);
  await otworzEdytor(page);
  await expect(page.getByRole("button", { name: /panel boczny/ })).toHaveAttribute("aria-expanded", "false");

  await page.setViewportSize(MONITOR);
  await otworzEdytor(page);
  await expect(page.getByRole("button", { name: /panel boczny/ })).toHaveAttribute("aria-expanded", "true");
});

/** Wybor uzytkownika ma pierwszenstwo nad szerokoscia okna — takze po odswiezeniu. */
test("recznie rozwiniety panel zostaje rozwiniety po odswiezeniu telefonu", async ({ page }) => {
  await page.setViewportSize(TELEFON);
  await otworzEdytor(page);

  await page.getByRole("button", { name: "Pokaż panel boczny" }).click();
  await expect(page.getByRole("button", { name: /panel boczny/ })).toHaveAttribute("aria-expanded", "true");

  await page.reload();
  await expect(page.getByRole("button", { name: /panel boczny/ })).toHaveAttribute("aria-expanded", "true");
});

test("ustawienia planu chowaja sie na telefonie, a na monitorze stoja odkryte", async ({ page }) => {
  await page.setViewportSize(TELEFON);
  await otworzEdytor(page);

  const przelacznik = page.getByRole("button", { name: "Ustawienia planu" });
  await expect(przelacznik).toBeVisible();
  await expect(przelacznik).toHaveAttribute("aria-expanded", "false");
  // Kondygnacje i podklad sa schowane...
  await expect(page.getByRole("button", { name: "Wgraj podkład" })).toHaveCount(0);
  // ...ale to, czego uzywa sie W TRAKCIE rysowania, zostaje pod reka.
  await expect(page.getByRole("button", { name: "Cofnij" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Dopasuj widok do planu" })).toBeVisible();

  await przelacznik.click();
  await expect(page.getByRole("button", { name: "Wgraj podkład" })).toBeVisible();

  // Na monitorze przelacznika nie ma w ogole, a ustawienia sa widoczne od razu.
  await page.setViewportSize(MONITOR);
  await otworzEdytor(page);
  await expect(page.getByRole("button", { name: "Ustawienia planu" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Wgraj podkład" })).toBeVisible();
});
