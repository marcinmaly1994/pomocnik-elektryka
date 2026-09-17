import { test, expect, type Page } from "@playwright/test";
import { skipEntryScreen } from "./_flow";

/**
 * Komplet dokumentacji: jeden plik z wybranych dokumentow.
 *
 * Test jest tu niezbedny, bo sedno tej funkcji jest MIEDZY zakladkami: rzut i schemat
 * rasteryzuja sie z zywego rysunku, wiec komplet po kolei otwiera zakladki, czeka na
 * producenta (lib/pdf/rejestr.ts) i sklada strony. Zadna czesc tego nie widac
 * w testach jednostkowych.
 */

async function planBox(page: Page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  return (await page.locator("[data-testid=plan-okno]").first().boundingBox())!;
}

/** Najmniejszy projekt, z ktorego powstaje komplet: rozdzielnica, gniazda i lampa. */
async function projekt(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Instalacja" }).click();
  await skipEntryScreen(page);

  const postaw = async (szukaj: string, nazwa: RegExp, dx: number, dy: number) => {
    await page.getByRole("button", { name: "Wstaw Element" }).click();
    await page.getByPlaceholder(/Szukaj elementu/).fill(szukaj);
    await page.locator("button.w-full.items-center.gap-2.rounded-md").filter({ hasText: nazwa }).first().click();
    const box = await planBox(page);
    await page.mouse.click(box.x + dx, box.y + dy);
  };
  await postaw("rozdzielnica", /Rozdzielnica/, 60, 90);
  await postaw("gniazdo 230", /Gniazdo 230 V/, 200, 90);
  await postaw("gniazdo 230", /Gniazdo 230 V/, 320, 90);
  await postaw("sufit", /Punkt sufitowy/, 240, 190);
}

/** Liczba stron w podgladzie — podglad rysuje kazda strone na osobnym <canvas>. */
async function stronPodgladu(page: Page) {
  await expect(page.locator("[data-podglad-stron] canvas").first()).toBeVisible({ timeout: 30000 });
  // Strony dorysowuja sie po kolei; czekamy, az licznik przestanie rosnac.
  let poprzednio = -1;
  for (let i = 0; i < 20; i++) {
    const teraz = await page.locator("[data-podglad-stron] canvas").count();
    if (teraz === poprzednio) return teraz;
    poprzednio = teraz;
    await page.waitForTimeout(300);
  }
  return poprzednio;
}

test("komplet sklada wybrane dokumenty w jeden plik", async ({ page }) => {
  await projekt(page);
  await page.getByRole("button", { name: "Dokumentacja" }).click();

  // Lista zawiera to, co ten projekt ma czym wypelnic — i nic ponadto.
  const okno = page.getByRole("dialog");
  await expect(okno.getByText("Rzut — Parter")).toBeVisible();
  await expect(okno.getByText("Schemat jednokreskowy")).toBeVisible();
  await expect(okno.getByText("Legenda rozdzielnicy")).toBeVisible();
  await expect(okno.getByText("Karta obliczeń obwodów")).toBeVisible();
  await expect(okno.getByText("Kosztorys instalacji")).toBeVisible();
  // Protokoly bez ani jednego wiersza nie maja czego pokazac.
  await expect(okno.getByText("Pomiar rezystancji izolacji")).toHaveCount(0);

  await okno.getByRole("button", { name: "Złóż dokumentację" }).click();

  // Podglad pokazuje DOKLADNIE ten plik, ktory powstal — strona tytulowa plus
  // szesc dokumentow domyslnego wyboru (rzut, schemat, legenda, obliczenia, kosztorys).
  const stron = await stronPodgladu(page);
  expect(stron).toBeGreaterThanOrEqual(6);

  const pobranie = page.waitForEvent("download");
  await page.getByRole("dialog").getByRole("button", { name: "Pobierz PDF" }).click();
  const plik = await pobranie;
  expect(plik.suggestedFilename()).toMatch(/^dokumentacja.*\.pdf$/);
  const fs = await import("node:fs");
  expect(fs.statSync(await plik.path()).size).toBeGreaterThan(10000);
});

test("odznaczenie dokumentu zdejmuje go z kompletu", async ({ page }) => {
  await projekt(page);
  await page.getByRole("button", { name: "Dokumentacja" }).click();
  const okno = page.getByRole("dialog");

  // Zostawiamy sam kosztorys: strona tytulowa + jedna strona kosztorysu.
  await okno.getByRole("button", { name: "Odznacz wszystkie" }).click();
  await expect(okno.getByText("wybrano: 0")).toBeVisible();
  await expect(okno.getByRole("button", { name: "Złóż dokumentację" })).toBeDisabled();

  await okno.getByRole("checkbox").last().check(); // ostatnia pozycja to kosztorys
  await okno.getByRole("button", { name: "Złóż dokumentację" }).click();

  expect(await stronPodgladu(page)).toBe(2);
});

/**
 * Przelaczanie zakladek jest SRODKIEM, nie nawigacja — po zlozeniu uzytkownik ma
 * zostac tam, skad zaczal, bez sladu w historii przegladarki.
 */
test("po zlozeniu wracamy do zakladki, z ktorej sie zaczelo", async ({ page }) => {
  await projekt(page);
  await page.getByRole("button", { name: "Kosztorys", exact: true }).click();
  await expect(page).toHaveURL(/\/kosztorys$/);

  await page.getByRole("button", { name: "Dokumentacja" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Złóż dokumentację" }).click();
  await stronPodgladu(page);

  await expect(page).toHaveURL(/\/kosztorys$/);
});
