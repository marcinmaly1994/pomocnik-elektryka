import { test, expect, type Page } from "@playwright/test";

/**
 * Skalowanie symboli razem ze skala rzutu.
 *
 * Sama arytmetyka ma komplet testow jednostkowych w `lib/symbolScale.test.ts`.
 * Tutaj chodzi o to, czego one nie widza: czy skala rzutu w ogole DOCIERA do
 * renderu, czy obrys wanny NA PLOTNIE pokrywa sie ze strefa 1 i czy suwak
 * rozmiaru rusza osprzetem, ale nie przyborami.
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

async function pustyProjekt(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByText("Zacznij projektować instalację")).toBeVisible();
  await page.getByRole("button", { name: "Narysuj dom samodzielnie" }).click();
  const rozumiem = page.getByRole("button", { name: "Rozumiem" });
  if (await rozumiem.count()) await rozumiem.click();
}

async function wybierz(page: Page, szukaj: string, nazwa: RegExp) {
  await page.getByRole("button", { name: "Wstaw Element" }).click();
  await page.getByPlaceholder(/Szukaj elementu/).fill(szukaj);
  await page.getByRole("button", { name: nazwa }).click();
}

async function klikNaPlanie(page: Page, x: number, y: number) {
  const p = await naEkranie(page, x, y);
  await page.mouse.click(p.x, p.y);
}

/**
 * Kalibracja skali odcinkiem o ZNANEJ dlugosci w jednostkach planu: klikamy punkty
 * odlegle o `jednostki` i podajemy, ze to `metry`. Wynikowe `mpu` jest wiec z gory
 * wiadome i test moze sprawdzac konkretne liczby, a nie tylko "cos sie zmienilo".
 */
async function skalibruj(page: Page, jednostki: number, metry: number) {
  await page.getByRole("button", { name: "Kalibracja skali" }).click();
  await klikNaPlanie(page, 100, 120);
  await klikNaPlanie(page, 100 + jednostki, 120);
  await page.getByLabel("Długość odcinka w metrach").fill(String(metry));
  await page.getByRole("button", { name: "Zatwierdź skalę" }).click();
}

/** Skala renderu grupy trzymajacej symbol danego typu — to nia steruje cala zmiana. */
async function skalaSymbolu(page: Page, cornerRadius: number) {
  return page.evaluate((cr) => {
    const k = (window as unknown as { Konva: { stages: { find(s: string): unknown[] }[] } }).Konva;
    type R = { fill(): string; cornerRadius(): number; getParent(): { scaleX(): number } };
    const rect = (k.stages[0].find("Rect") as R[]).find((n) => n.fill() === "#fff" && n.cornerRadius() === cr);
    return rect ? rect.getParent().scaleX() : null;
  }, cornerRadius);
}

/** Obrys wanny i prostokat strefy 1 — w pikselach sceny, prosto z Konvy. */
async function obrysy(page: Page) {
  return page.evaluate(() => {
    const k = (window as unknown as { Konva: { stages: { find(s: string): unknown[] }[] } }).Konva;
    type R = { fill(): string; stroke(): string; cornerRadius(): number; getClientRect(): { width: number; height: number } };
    const rects = k.stages[0].find("Rect") as R[];
    const wanna = rects.find((n) => n.fill() === "#fff" && n.cornerRadius() === 9);
    const strefa1 = rects.find((n) => n.stroke() === "#C6433A");
    return {
      wanna: wanna ? wanna.getClientRect() : null,
      strefa1: strefa1 ? strefa1.getClientRect() : null,
    };
  });
}

test("bez kalibracji symbole zostaja przy dotychczasowym rozmiarze", async ({ page }) => {
  await pustyProjekt(page);
  await wybierz(page, "gniazdo 230", /Gniazdo 230 V/);
  await klikNaPlanie(page, 400, 300);

  // Rysowanie od zera idzie na MANUAL_DRAW_SCALE_MPU, czyli dokladnie na skali
  // odniesienia — zaden istniejacy projekt nie ma prawa zmienic wygladu.
  const rect = await page.evaluate(() => {
    const k = (window as unknown as { Konva: { stages: { find(s: string): unknown[] }[] } }).Konva;
    type P = { getParent(): { scaleX(): number } };
    return (k.stages[0].find("Path") as P[])[0].getParent().scaleX();
  });
  expect(rect).toBeCloseTo(0.7, 5);
});

test("gestsza kalibracja powieksza symbol dokladnie tyle, ile trzeba, by zajmowal tyle samo metrow", async ({ page }) => {
  await pustyProjekt(page);
  await wybierz(page, "wanna", /Wanna/);
  await klikNaPlanie(page, 400, 300);
  const przed = await skalaSymbolu(page, 9);

  // 200 jedn. = 2 m, czyli 1 jedn. = 1 cm — piec razy gesciej niz skala odniesienia.
  await skalibruj(page, 200, 2);
  const po = await skalaSymbolu(page, 9);

  expect(przed).toBeCloseTo(0.7, 5);
  expect(po).toBeCloseTo(0.7 * 5, 4);
});

test("obrys wanny pokrywa sie ze strefa 1, ta sama, ktora liczy walidator", async ({ page }) => {
  await pustyProjekt(page);
  await wybierz(page, "wanna", /Wanna/);
  await klikNaPlanie(page, 400, 300);
  await skalibruj(page, 200, 2);

  const { wanna, strefa1 } = await obrysy(page);
  expect(wanna).toBeTruthy();
  expect(strefa1).toBeTruthy();
  // Roznica to wylacznie grubsza kreska obrysu (2 vs 1,2 jedn.) liczona przez
  // `getClientRect` — geometria jest ta sama co do jednostki.
  const luz = wanna!.width * 0.05;
  expect(Math.abs(wanna!.width - strefa1!.width)).toBeLessThan(luz);
  expect(Math.abs(wanna!.height - strefa1!.height)).toBeLessThan(luz);
});

test("suwak rozmiaru rusza osprzetem, ale nie przyborem sanitarnym", async ({ page }) => {
  await pustyProjekt(page);
  await wybierz(page, "wanna", /Wanna/);
  await klikNaPlanie(page, 300, 300);
  await wybierz(page, "gniazdo 230", /Gniazdo 230 V/);
  await klikNaPlanie(page, 550, 400);

  const gniazdoPrzed = await page.evaluate(() => {
    const k = (window as unknown as { Konva: { stages: { find(s: string): unknown[] }[] } }).Konva;
    type P = { getParent(): { scaleX(): number } };
    return (k.stages[0].find("Path") as P[])[0].getParent().scaleX();
  });
  const wannaPrzed = await skalaSymbolu(page, 9);

  const suwak = page.getByLabel("Rozmiar elementów");
  await suwak.fill("2");

  const gniazdoPo = await page.evaluate(() => {
    const k = (window as unknown as { Konva: { stages: { find(s: string): unknown[] }[] } }).Konva;
    type P = { getParent(): { scaleX(): number } };
    return (k.stages[0].find("Path") as P[])[0].getParent().scaleX();
  });
  const wannaPo = await skalaSymbolu(page, 9);

  expect(gniazdoPo).toBeCloseTo(gniazdoPrzed! * 2, 4);
  // Wanna ma pozostac wanna: jej obrys jest strefa ochronna, a nie ozdoba.
  expect(wannaPo).toBeCloseTo(wannaPrzed!, 5);
});
