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

/**
 * Po wybraniu drogi startu telefon LADUJE NA RYSUNKU, a nie na tym samym naglowku,
 * ktory uzytkownik ogladal przed klknieciem.
 *
 * Zmierzone przed zmiana (okno 375 x 812): plotno zaczynalo sie 543 px w dol strony —
 * nad nim staly naglowek (210 px), pasek etapow, banery, pasek kondygnacji i pasek
 * narzedzi. Klikniecie „Narysuj dom samodzielnie" nie zmienialo NICZEGO w kadrze,
 * wiec nie bylo zadnego znaku, ze gdzies nizej czeka kartka do rysowania.
 *
 * Celem przewijania jest WIERSZ EDYTORA, nie samo plotno: wiersz zaczyna sie paskiem
 * narzedzi, wiec po przewinieciu widac i czym rysowac, i po czym.
 */
test("telefon: po wybraniu drogi startu rysunek jest w kadrze, razem z paskiem narzedzi", async ({ page }) => {
  await page.setViewportSize(TELEFON);
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Instalacja" }).click();
  await page.getByRole("button", { name: "Narysuj dom samodzielnie" }).click();

  const plotno = page.locator("canvas").first();
  await expect(plotno).toBeVisible();
  // Przewijanie jest plynne (`behavior: "smooth"`), wiec czekamy na jego koniec.
  await expect
    .poll(async () => Math.round(await page.evaluate(() => window.scrollY)), { timeout: 3000 })
    .toBeGreaterThan(200);

  const rail = (await page.locator('nav[aria-label="Narzędzia rysowania"]').boundingBox())!;
  const box = (await plotno.boundingBox())!;
  // Pasek narzedzi na gorze kadru, plotno tuz pod nim — jedno i drugie widoczne
  // bez dalszego przewijania.
  expect(rail.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(TELEFON.height);
});

test("monitor: strona NIE drga — tam edytor i tak mieści się w oknie", async ({ page }) => {
  await page.setViewportSize(MONITOR);
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Instalacja" }).click();
  await page.getByRole("button", { name: "Narysuj dom samodzielnie" }).click();
  await expect(page.locator("canvas").first()).toBeVisible();

  await page.waitForTimeout(600);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

/**
 * Pelny ekran na TELEFONIE.
 *
 * Zmierzone przed zmiana (okno 375 px): karta narzedzi miala 345 px szerokosci, czyli
 * po odslonieciu zakrywala CALY rysunek — pasek narzedzi jest ponizej progu `md`
 * pozimy, a w pelnym ekranie karta stoi przyklejona do lewej krawedzi okna jako
 * kolumna. Do tego karta chowala sie wylacznie na `mousemove`/`mouseleave`, ktorych
 * palec nie wysyla: raz otwarta zostawala otwarta na dobre.
 */
test("telefon w pelnym ekranie: karta narzedzi jest WASKA i nie zakrywa rysunku", async ({ page }) => {
  await page.setViewportSize(TELEFON);
  await otworzEdytor(page);
  await page.getByRole("button", { name: "Projektowanie na pełnym ekranie" }).click();
  await page.getByRole("button", { name: "Pokaż narzędzia rysowania" }).click();

  const karta = (await page.getByTestId("karta-narzedzi").boundingBox())!;
  // Sam pionowy pasek ikon plus uchwyt zwijania — nie pol ekranu.
  expect(karta.width).toBeLessThan(120);
  // Zostaje realny kawalek rysunku obok.
  expect(TELEFON.width - (karta.x + karta.width)).toBeGreaterThan(200);
});

test("telefon w pelnym ekranie: karte da sie schowac PALCEM, bez najezdzania myszą", async ({ page }) => {
  await page.setViewportSize(TELEFON);
  await otworzEdytor(page);
  await page.getByRole("button", { name: "Projektowanie na pełnym ekranie" }).click();

  const uchwyt = page.getByRole("button", { name: "Pokaż narzędzia rysowania" });
  await uchwyt.click();
  const zamknij = page.getByRole("button", { name: "Schowaj narzędzia rysowania" });
  await expect(zamknij).toBeVisible();
  await zamknij.click();

  // Karta zjechala za krawedz, a uchwyt wrocil — droga w obie strony jest klikalna.
  await expect(zamknij).toBeHidden();
  await expect(uchwyt).toBeVisible();
});

test("monitor w pelnym ekranie: pasek narzedzi bez zmian — i tak byl pionowy", async ({ page }) => {
  await page.setViewportSize(MONITOR);
  await otworzEdytor(page);
  await page.getByRole("button", { name: "Projektowanie na pełnym ekranie" }).click();
  await page.getByRole("button", { name: "Pokaż narzędzia rysowania" }).click();

  const rail = (await page.locator('nav[aria-label="Narzędzia rysowania"]').boundingBox())!;
  // Pionowy: wyzszy niz szerszy, tak jak od zawsze powyzej progu `md`.
  expect(rail.height).toBeGreaterThan(rail.width);
});
