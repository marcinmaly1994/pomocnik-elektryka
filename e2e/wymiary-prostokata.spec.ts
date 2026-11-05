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

/**
 * Telefon 320 px: pola wymiarów i „Utwórz" muszą zmieścić się w nakładce nad rzutem.
 *
 * Audyt 5.11.2026: cały wiersz był jednym nierozrywalnym kawałkiem i przy 320–390 px
 * drugie pole, jednostka i przycisk wychodziły poza nakładkę (obciętą `overflow`),
 * więc na telefonie z wpisanych wymiarów nie dało się utworzyć pokoju.
 * Emulacja dotyku przez `test.use`, nie `setViewportSize` — patrz uwaga w
 * emulacji dotyku: zmiana rozmiaru po starcie kasuje `pointer: coarse`.
 */
test.describe("na wąskim telefonie", () => {
  test.use({ viewport: { width: 320, height: 568 }, hasTouch: true, isMobile: true });

  test("pola wymiarów i „Utwórz” mieszczą się w nakładce i działają", async ({ page }) => {
    await planZeSkala(page);
    const okno = page.locator("[data-testid=plan-okno]").first();
    await okno.scrollIntoViewIfNeeded();
    const box = (await okno.boundingBox())!;
    await page.touchscreen.tap(box.x + 60, box.y + 40);

    const nakladka = (await page.getByTestId("kontrolki-narzedzia").boundingBox())!;
    const utworz = page.getByRole("button", { name: "Utwórz" });
    const przycisk = (await utworz.boundingBox())!;
    const wysokosc = (await page.getByTestId("room-rect-height-input").boundingBox())!;
    for (const b of [przycisk, wysokosc]) {
      expect(b.x).toBeGreaterThanOrEqual(nakladka.x);
      expect(b.x + b.width).toBeLessThanOrEqual(nakladka.x + nakladka.width);
      expect(b.x + b.width).toBeLessThanOrEqual(320);
    }

    await page.getByTestId("room-rect-width-input").fill("4");
    await page.getByTestId("room-rect-height-input").fill("3");
    await utworz.click();
    await page.getByRole("button", { name: "Dodaj pomieszczenie" }).click();
    await page.waitForTimeout(900);
    expect(await zapisanePomieszczenia(page)).toHaveLength(1);
  });
});
