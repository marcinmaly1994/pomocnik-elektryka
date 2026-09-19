import { test, expect, type Page } from "@playwright/test";
import { skipEntryScreen } from "./_flow";

/**
 * Prostokątne pomieszczenie z wpisanych wymiarów.
 *
 * „Mam pokój 4 × 3" to zdanie, które użytkownik tej aplikacji ma w głowie gotowe —
 * i to jest najkrótsza droga od niego do rysunku. Kotwicę nadal stawia kliknięciem,
 * więc decyduje GDZIE; wpisuje tylko JAK DUŻY.
 *
 * Sprawdzane w ZAPISIE, a nie na płótnie: chodzi o to, czy pomieszczenie naprawdę ma
 * 5 × 4 m w danych projektu — bo to z nich liczy się metraż, obwody i kosztorys.
 */

const METROW_NA_JEDNOSTKE = 0.05;

async function planZeSkala(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Instalacja" }).click();
  await skipEntryScreen(page);

  await page.waitForFunction(() => {
    const id = localStorage.getItem("pomocnikelektryka_projekt_biezacy");
    return !!id && !!localStorage.getItem(`pomocnikelektryka_projekt_${id}`);
  });
  await page.evaluate((mpu) => {
    const id = localStorage.getItem("pomocnikelektryka_projekt_biezacy");
    const klucz = `pomocnikelektryka_projekt_${id}`;
    const a = JSON.parse(localStorage.getItem(klucz)!);
    a.scales = { f1: mpu };
    localStorage.setItem(klucz, JSON.stringify(a));
  }, METROW_NA_JEDNOSTKE);
  await page.reload();

  await page.getByRole("button", { name: "Narysuj Pomieszczenie", exact: true }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  return (await page.locator("[data-testid=plan-okno]").first().boundingBox())!;
}

async function zapisanePomieszczenia(page: Page) {
  return page.evaluate(() => {
    const id = localStorage.getItem("pomocnikelektryka_projekt_biezacy");
    const raw = localStorage.getItem(`pomocnikelektryka_projekt_${id}`);
    return JSON.parse(raw!).draft.roomShapes as { points: { x: number; y: number }[] }[];
  });
}

test("wpisane wymiary tworzą pomieszczenie o dokładnie takim rozmiarze", async ({ page }) => {
  const box = await planZeSkala(page);

  // Kotwica kliknięciem — użytkownik decyduje, GDZIE pokój stoi.
  await page.mouse.click(box.x + 150, box.y + 150);

  await page.getByTestId("room-rect-width-input").fill("5");
  await page.getByTestId("room-rect-height-input").fill("4");
  await page.getByRole("button", { name: "Utwórz" }).click();

  // Dalej idzie ta sama droga co przy rysowaniu myszą: okno nazwy i typu.
  await page.getByRole("button", { name: /Dodaj pomieszczenie|Zapisz|Utwórz/ }).last().click();
  await page.waitForTimeout(900);

  const pokoje = await zapisanePomieszczenia(page);
  expect(pokoje).toHaveLength(1);
  const xs = pokoje[0].points.map((p) => p.x);
  const ys = pokoje[0].points.map((p) => p.y);
  expect((Math.max(...xs) - Math.min(...xs)) * METROW_NA_JEDNOSTKE).toBeCloseTo(5, 2);
  expect((Math.max(...ys) - Math.min(...ys)) * METROW_NA_JEDNOSTKE).toBeCloseTo(4, 2);
});

test("przecinek dziesiętny działa tak samo jak kropka", async ({ page }) => {
  const box = await planZeSkala(page);
  await page.mouse.click(box.x + 150, box.y + 150);

  await page.getByTestId("room-rect-width-input").fill("3,5");
  await page.getByTestId("room-rect-height-input").fill("2,5");
  await page.getByRole("button", { name: "Utwórz" }).click();
  await page.getByRole("button", { name: /Dodaj pomieszczenie|Zapisz|Utwórz/ }).last().click();
  await page.waitForTimeout(900);

  const [pokoj] = await zapisanePomieszczenia(page);
  const xs = pokoj.points.map((p) => p.x);
  expect((Math.max(...xs) - Math.min(...xs)) * METROW_NA_JEDNOSTKE).toBeCloseTo(3.5, 2);
});

test("puste albo bzdurne wymiary nie tworzą pomieszczenia", async ({ page }) => {
  const box = await planZeSkala(page);
  await page.mouse.click(box.x + 150, box.y + 150);

  await page.getByTestId("room-rect-width-input").fill("0");
  await page.getByTestId("room-rect-height-input").fill("4");
  await page.getByRole("button", { name: "Utwórz" }).click();

  // Żadnego okna nazwy — nie ma czego nazywać. Kotwica zostaje, więc da się poprawić
  // liczbę i spróbować jeszcze raz bez klikania od nowa.
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByTestId("room-rect-width-input")).toBeVisible();
});
