import { test, expect, type Page } from "@playwright/test";
import type Konva from "konva";
import { skipEntryScreen, otworzKatalogElementow } from "./_flow";

/**
 * Wydruk rzutu nie zależy od tego, jak użytkownik ustawił sobie kadr na ekranie.
 *
 * Eksport kadruje się do NARYSOWANEJ TREŚCI (`contentBounds`), a nie do widocznego
 * wycinka — przesunięcie widoku jest wygodą przy rysowaniu, nie decyzją o wydruku.
 * Odkąd kadr niesie stan widoku (a nie przewinięcie kontenera), scena Konvy jest
 * przesunięta o ten kadr, więc wycinek do rasteryzacji trzeba liczyć WZGLĘDEM tego
 * przesunięcia. Pominięcie go przesuwa wydruk o tyle, o ile odjechał widok.
 */

async function otworzPlan(page: Page) {
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
}

/**
 * Gdzie na wydruku leży rysunek: obrys pikseli ciemniejszych od tła, w pikselach rastra.
 *
 * Porównanie bajt w bajt jest za ostre, a porównanie „ile procent pikseli się różni" —
 * za tępe, i to nie teoretycznie: sprawdzone przez CELOWE wstawienie regresji (kadr
 * eksportu bez składnika `stage.x()`). Rysunek wyjechał wtedy poza kartkę, a różnica
 * pikseli wyszła PONIŻEJ PROCENTA, bo rzut to cienkie linie na bieli — test przeszedł,
 * choć wydruk był pusty.
 *
 * Obrys treści mierzy dokładnie to, o co chodzi: czy rysunek stoi na kartce w tym samym
 * miejscu. Przesunięty kadr rusza nim o setki pikseli, a wygładzanie — o żaden.
 */
async function obrysTresci(page: Page, url: string) {
  return page.evaluate(async (adres) => {
    const img = await new Promise<HTMLImageElement>((ok, zle) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = zle;
      i.src = adres;
    });
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let minX = c.width;
    let minY = c.height;
    let maxX = -1;
    let maxY = -1;
    for (let i = 0; i < d.length; i += 4) {
      // Ciemniejsze od bieli kartki — czyli rysunek, opisy i ramka legendy.
      if (d[i] < 230 || d[i + 1] < 230 || d[i + 2] < 230) {
        const px = (i / 4) % c.width;
        const py = Math.floor(i / 4 / c.width);
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
      }
    }
    return { minX, minY, maxX, maxY, pusty: maxX < 0, w: c.width, h: c.height };
  }, url);
}

/** Pierwsza strona podglądu (rzut) jako obraz — do porównania dwóch eksportów. */
async function rzutZPodgladu(page: Page) {
  const strony = page.locator("[data-podglad-stron] canvas");
  await page.getByRole("button", { name: "Rzut do PDF" }).click();
  await expect(strony.first()).toBeVisible({ timeout: 30000 });
  const obraz = await strony.first().evaluate((c) => (c as HTMLCanvasElement).toDataURL());
  await page.getByRole("dialog").getByRole("button", { name: "Zamknij" }).click();
  return obraz;
}

test("przesunięcie widoku nie rusza wydruku rzutu", async ({ page }) => {
  await otworzPlan(page);

  await otworzKatalogElementow(page);
  await page.getByRole("button", { name: /Gniazdo 230 V/ }).first().click();
  const okno = page.locator("[data-testid=plan-okno]").first();
  const box = (await okno.boundingBox())!;
  await page.mouse.click(box.x + 200, box.y + 160);
  await page.mouse.click(box.x + 320, box.y + 240);
  await page.getByRole("button", { name: "Zaznacz", exact: true }).click();
  await page.waitForTimeout(300);

  const obrysPrzed = await obrysTresci(page, await rzutZPodgladu(page));
  expect(obrysPrzed.pusty, "bez rysunku na wydruku test nie miałby czego porównywać").toBe(false);

  // Przesuwamy kadr wciśniętą rolką — tak jak przy poprawianiu sobie widoku.
  const srodek = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(srodek.x, srodek.y);
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(srodek.x - 180, srodek.y - 120, { steps: 8 });
  await page.mouse.up({ button: "middle" });
  await page.waitForTimeout(300);

  const przesuniecieSceny = await page.evaluate(
    () => (window as unknown as { Konva: { stages: Konva.Stage[] } }).Konva.stages[0].x(),
  );
  expect(Math.abs(przesuniecieSceny)).toBeGreaterThan(50); // widok naprawdę odjechał

  const obrysPo = await obrysTresci(page, await rzutZPodgladu(page));
  expect(obrysPo.pusty, "po przesunięciu widoku wydruk nie może wyjść pusty").toBe(false);
  // Tolerancja 2 px na wygładzanie krawędzi; przesunięty kadr rusza treścią o setki.
  expect(Math.abs(obrysPo.minX - obrysPrzed.minX)).toBeLessThanOrEqual(2);
  expect(Math.abs(obrysPo.minY - obrysPrzed.minY)).toBeLessThanOrEqual(2);
  expect(Math.abs(obrysPo.maxX - obrysPrzed.maxX)).toBeLessThanOrEqual(2);
  expect(Math.abs(obrysPo.maxY - obrysPrzed.maxY)).toBeLessThanOrEqual(2);
});
