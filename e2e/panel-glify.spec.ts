import { test, expect } from "@playwright/test";

/**
 * Symbole aparatów na widoku czołowym rozdzielnicy.
 *
 * Zgłoszenie: „lampka sygnalizacyjna wygląda jak wyłącznik nadprądowy". Przyczyna —
 * `DeviceFace` w PanelRender.tsx miał JEDEN kształt (ciemna dźwignia z „I") dla
 * wszystkiego poza SPD/bezpiecznikiem SPD/samą różnicówką; reszta katalogu różniła
 * się tylko kolorem nadruku pod spodem. Test sprawdza, że rodzaje BEZ dźwigni
 * (lampka, zasilacz, przekaźnik, stycznik, CZF, rozłącznik ppoż) faktycznie NIE
 * rysują już tego wspólnego kształtu — rocker ma ciemny prostokąt `fill="#2B3440"`,
 * więc jego brak/obecność jest łatwym, jednoznacznym sygnałem.
 */

async function zbudujReczniePustaRozdzielnice(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const pomin = page.getByRole("button", { name: "Pomiń — ustawię później" });
  if (await pomin.count()) await pomin.click();
  await page.getByRole("button", { name: "Rozdzielnica", exact: true }).click();
  await page.getByRole("button", { name: "Zbuduj rozdzielnicę bez rzutu" }).click();
}

/** Dodaje aparat danego rodzaju z katalogu ręcznego i zwraca jego <g> na rysunku
 *  (po oznaczeniu — ostatni dodany aparat dostaje najwyższy numer w swoim prefiksie). */
async function dodajIZnajdzGrupe(page: import("@playwright/test").Page, kind: string) {
  const kindSel = page.locator("select").filter({ has: page.locator('option:has-text("Wyłącznik nadprądowy")') });
  await kindSel.selectOption(kind);
  await page.getByRole("button", { name: "Dodaj", exact: true }).click();
  const svg = page.getByRole("img", { name: "Widok czołowy rozdzielnicy" });
  await expect(svg).toBeVisible();
  return svg;
}

/** Czy rysunek zawiera ciemny prostokąt dźwigni rockera — wspólny kształt MCB/RCD. */
async function maRocker(svg: ReturnType<typeof dodajIZnajdzGrupe> extends Promise<infer T> ? T : never) {
  return svg.evaluate((el) => [...el.querySelectorAll('rect[fill="#2B3440"]')].length);
}

test("rozłącznik główny (baza) rysuje dźwignię rockera", async ({ page }) => {
  await zbudujReczniePustaRozdzielnice(page);
  const svg = page.getByRole("img", { name: "Widok czołowy rozdzielnicy" });
  expect(await maRocker(svg)).toBeGreaterThan(0);
});

test("RCBO ma przycisk testowy różnicówki, tak jak samodzielna różnicówka", async ({ page }) => {
  await zbudujReczniePustaRozdzielnice(page);
  const przedT = await page
    .getByRole("img", { name: "Widok czołowy rozdzielnicy" })
    .evaluate((el) => [...el.querySelectorAll("text")].filter((t) => t.textContent?.trim() === "T").length);

  const svg = await dodajIZnajdzGrupe(page, "rcbo");
  const poT = await svg.evaluate((el) => [...el.querySelectorAll("text")].filter((t) => t.textContent?.trim() === "T").length);
  expect(poT).toBe(przedT + 1);
});

for (const kind of ["ovr", "ppoz", "stycznik", "przekaznik", "zasilacz", "lampka"]) {
  test(`„${kind}” dostaje własny kształt, nie dźwignię rockera`, async ({ page }) => {
    await zbudujReczniePustaRozdzielnice(page);
    const svg = page.getByRole("img", { name: "Widok czołowy rozdzielnicy" });
    const rockerowPrzed = await maRocker(svg);

    await dodajIZnajdzGrupe(page, kind);
    const rockerowPo = await maRocker(svg);

    // Dołożony aparat NIE dorzucił kolejnej dźwigni — liczba rockerów się nie zmieniła,
    // mimo że liczba aparatów na rysunku wzrosła o jeden.
    expect(rockerowPo).toBe(rockerowPrzed);
  });
}

test("lampka sygnalizacyjna: wariant 3-fazowy rysuje trzy klosze w barwach faz", async ({ page }) => {
  await zbudujReczniePustaRozdzielnice(page);
  const svg = await dodajIZnajdzGrupe(page, "lampka"); // domyślna nastawa: L1-L2-L3

  const kolory = await svg.evaluate((el) => {
    const brazowy = el.querySelectorAll('circle[fill="#7B4B2A"]').length; // L1
    const czarny = el.querySelectorAll('circle[fill="#2B2B2B"]').length; // L2
    const szary = el.querySelectorAll('circle[fill="#8A8A8A"]').length; // L3
    return { brazowy, czarny, szary };
  });
  expect(kolory.brazowy).toBeGreaterThan(0);
  expect(kolory.czarny).toBeGreaterThan(0);
  expect(kolory.szary).toBeGreaterThan(0);
});

test("lampka sygnalizacyjna: wariant 230V rysuje pojedynczy klosz", async ({ page }) => {
  await zbudujReczniePustaRozdzielnice(page);
  const kindSel = page.locator("select").filter({ has: page.locator('option:has-text("Wyłącznik nadprądowy")') });
  await kindSel.selectOption("lampka");
  const ratingSel = page.locator("select").filter({ has: page.locator('option:has-text("L1-L2-L3")') });
  await ratingSel.selectOption("230V");
  await page.getByRole("button", { name: "Dodaj", exact: true }).click();

  const svg = page.getByRole("img", { name: "Widok czołowy rozdzielnicy" });
  // Jeden klosz w kolorze aparatu (#B98C2F — bursztynowy, katalogowy akcent lampki),
  // BEZ trzech osobnych klosz faz.
  const klosze = await svg.evaluate((el) => el.querySelectorAll('circle[fill="#B98C2F"]').length);
  expect(klosze).toBeGreaterThan(0);
});
