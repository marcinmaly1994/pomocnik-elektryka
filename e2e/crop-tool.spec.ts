import { test, expect, type Locator, type Page } from "@playwright/test";
import { skipEntryScreen } from "./_flow";
import { makePlanPng } from "./_png";

/**
 * Przycinanie wgranego rzutu PRZED ręcznym rysowaniem — użytkownik odrzuca
 * niechcianą część dokumentu (np. tabelkę z legendą obok planu), zanim
 * zacznie samodzielnie obrysowywać ściany i pomieszczenia. Automatyczne
 * rozpoznawanie zostało USUNIĘTE z aplikacji (patrz MIGRATION.md) — po
 * wgraniu/przycięciu wraca się wprost do zwykłego edytora, bez ekranu
 * weryfikacji.
 *
 * Zaznaczanie działa kliknięciami (LPM → róg, ruch BEZ trzymania przycisku,
 * LPM → drugi róg), nie przeciąganiem — stąd `locator.click({ position })`
 * zamiast `page.mouse.click(x, y)` na surowych współrzędnych STRONY: obraz w
 * kolumnie edytora renderuje się dużo większy niż okno testu (CSS `width:
 * 100%` rozciąga go do szerokości kolumny), więc dolna część bywa poza
 * widocznym viewportem. `locator.click({ position })` liczy punkt WZGLĘDEM
 * samego elementu i sam doscrolluje, czego surowe współrzędne strony nie robią.
 */

async function wejdz(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Instalacja" }).click();
  await skipEntryScreen(page);
}

/** Rzut z jednym pokojem po prawej — po lewej puste tło, dobre miejsce na
 *  symulowanie „niechcianej tabelki", którą test przycina. */
const RZUT = makePlanPng(400, 300, [[210, 10, 390, 290]]);

async function wgrajRzut(page: Page) {
  await page.setInputFiles('input[type="file"]', { name: "rzut.png", mimeType: "image/png", buffer: RZUT });
  const svg = page.getByRole("img", { name: /zaznaczyć obszar do zachowania/i });
  await expect(svg).toBeVisible({ timeout: 15000 });
  return svg;
}

/** Klik we WZGLĘDNYM (0..1 × 0..1) miejscu obrazu — patrz komentarz u góry pliku. */
async function klikW(svg: Locator, fx: number, fy: number, opts?: { button?: "left" | "right" }) {
  const box = (await svg.boundingBox())!;
  await svg.click({ position: { x: box.width * fx, y: box.height * fy }, button: opts?.button });
}

test("wgranie pliku pokazuje krok przycinania przed edytorem", async ({ page }) => {
  await wejdz(page);
  await page.setInputFiles('input[type="file"]', { name: "rzut.png", mimeType: "image/png", buffer: RZUT });

  await expect(page.getByRole("heading", { name: "Przytnij rzut" })).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole("img", { name: /zaznaczyć obszar do zachowania/i })).toBeVisible();
  // bez zaznaczenia nie da się przyciąć — trzeba jawnie narysować obszar
  await expect(page.getByRole("button", { name: "Przytnij zaznaczenie" })).toBeDisabled();
});

test("„Pomiń — użyj całego rzutu” wraca wprost do edytora, w oryginalnym rozmiarze", async ({ page }) => {
  await wejdz(page);
  await page.setInputFiles('input[type="file"]', { name: "rzut.png", mimeType: "image/png", buffer: RZUT });
  await page.getByRole("button", { name: "Pomiń — użyj całego rzutu" }).click();

  // wraca zwykły edytor — nie ma już ekranu weryfikacji
  await expect(page.getByRole("button", { name: "Kalibracja skali" })).toBeVisible();
  await expect(page.getByText(/Podkład: rzut\.png/)).toBeVisible();
  await page.waitForTimeout(900); // debounce autozapisu

  const planSize = await page.evaluate(() => {
    const raw = localStorage.getItem("pomocnikelektryka_projekt_autosave");
    return JSON.parse(raw!).planSize;
  });
  // proporcja obszaru roboczego dopasowana do PEŁNEGO rzutu (4:3), nie przycięta
  expect(planSize.w / planSize.h).toBeCloseTo(400 / 300, 1);
});

test("zaznaczenie i przycięcie prowadzi do edytora z przyciętym podkładem", async ({ page }) => {
  await wejdz(page);
  const svg = await wgrajRzut(page);

  // klik-klik od (50%,10%) do (95%,90%) rzutu — odrzuca lewą część (tam, gdzie
  // w scenariuszu zgłoszonym przez użytkownika stałaby tabelka)
  await klikW(svg, 0.5, 0.1);
  await klikW(svg, 0.95, 0.9);

  const przytnij = page.getByRole("button", { name: "Przytnij zaznaczenie" });
  await expect(przytnij).toBeEnabled();
  await przytnij.click();

  await expect(page.getByRole("button", { name: "Kalibracja skali" })).toBeVisible();
  await expect(page.getByText(/Podkład: rzut\.png/)).toBeVisible();
});

test("przycięty podkład zastępuje pełny rzut w edytorze", async ({ page }) => {
  await wejdz(page);
  const svg = await wgrajRzut(page);
  await klikW(svg, 0.5, 0.1);
  await klikW(svg, 0.95, 0.9);
  await page.getByRole("button", { name: "Przytnij zaznaczenie" }).click();

  await expect(page.getByRole("button", { name: "Kalibracja skali" })).toBeVisible();
  await page.waitForTimeout(900);

  // `planSizeForImage` (lib/design.ts) świadomie trzyma STAŁE pole powierzchni
  // obszaru roboczego niezależnie od rozmiaru podkładu w pikselach — zmienia się
  // tylko PROPORCJA, żeby dopasować się do kształtu rzutu. Dowodem przycięcia
  // jest więc zmiana proporcji (z krajobrazowej 400×300 na bardziej pionową
  // po zaznaczeniu ~180×240), nie bezwzględny rozmiar `planSize`.
  const planSize = await page.evaluate(() => {
    const raw = localStorage.getItem("pomocnikelektryka_projekt_autosave");
    return JSON.parse(raw!).planSize;
  });
  expect(planSize.w / planSize.h).toBeLessThan(400 / 300);
});

test("PPM w trakcie rysowania anuluje zaznaczanie", async ({ page }) => {
  await wejdz(page);
  const svg = await wgrajRzut(page);

  await klikW(svg, 0.5, 0.1);
  await klikW(svg, 0.8, 0.6, { button: "right" });

  // anulowane — trzeba zacząć od nowa, przycisk zostaje wyłączony
  await expect(page.getByRole("button", { name: "Przytnij zaznaczenie" })).toBeDisabled();
});

test("Escape w trakcie rysowania anuluje zaznaczanie", async ({ page }) => {
  await wejdz(page);
  const svg = await wgrajRzut(page);

  await klikW(svg, 0.5, 0.1);
  await page.keyboard.press("Escape");

  await expect(page.getByRole("button", { name: "Przytnij zaznaczenie" })).toBeDisabled();

  // po anulowaniu da się zacząć zaznaczać od nowa
  await klikW(svg, 0.5, 0.1);
  await klikW(svg, 0.9, 0.9);
  await expect(page.getByRole("button", { name: "Przytnij zaznaczenie" })).toBeEnabled();
});

test("Enter zatwierdza gotowy prostokąt tak samo jak klik w przycisk", async ({ page }) => {
  await wejdz(page);
  const svg = await wgrajRzut(page);

  await klikW(svg, 0.5, 0.1);
  await klikW(svg, 0.95, 0.9);
  await page.keyboard.press("Enter");

  await expect(page.getByRole("button", { name: "Kalibracja skali" })).toBeVisible();
  await expect(page.getByText(/Podkład: rzut\.png/)).toBeVisible();
});

test("kliknięcie na gotowym prostokącie zatwierdza go bez klikania w przycisk", async ({ page }) => {
  await wejdz(page);
  const svg = await wgrajRzut(page);

  await klikW(svg, 0.5, 0.1);
  await klikW(svg, 0.95, 0.9);
  // TRZECI klik (prostokąt jest już gotowy) zatwierdza od razu
  await klikW(svg, 0.7, 0.5);

  await expect(page.getByRole("button", { name: "Kalibracja skali" })).toBeVisible();
  await expect(page.getByText(/Podkład: rzut\.png/)).toBeVisible();
});
