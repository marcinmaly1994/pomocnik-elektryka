import { test, expect, type Page } from "@playwright/test";
import { wczytajPrzyklad } from "./_flow";

/**
 * Schemat jednokreskowy na telefonie.
 *
 * Rysunek ma ok. 1200 px szerokości, a okienko na telefonie ok. 330 px. W naturalnym
 * rozmiarze widać było pustą górną połowę i ani kawałka rozdzielnicy głównej, a jedynym
 * sposobem zobaczenia całości było przewijanie w bok na ślepo. Teraz schemat otwiera się
 * dopasowany do szerokości i da się go szczypać.
 */

const TELEFON = { width: 375, height: 812 };

async function otworzSchemat(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await wczytajPrzyklad(page, "mieszkanie");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole("button", { name: /Schemat/ }).first().click();
  await expect(page.getByTestId("schemat-okno")).toBeVisible();
}

async function powiekszenie(page: Page): Promise<number> {
  const etykieta = await page.getByRole("button", { name: /Powiększenie schematu \d+ procent/ }).getAttribute("aria-label");
  return Number(etykieta!.match(/(\d+) procent/)![1]);
}

/** Szerokość rysunku na ekranie i miejsce na niego w okienku. */
async function wymiary(page: Page) {
  return page.getByTestId("schemat-okno").evaluate((el) => {
    const svg = el.querySelector("svg")!;
    const s = getComputedStyle(el);
    return {
      rysunek: svg.getBoundingClientRect().width,
      miejsce: el.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight),
      naturalna: svg.viewBox.baseVal.width,
    };
  });
}

test.describe("na telefonie", () => {
  test.use({ viewport: TELEFON, hasTouch: true });

  test("schemat otwiera się dopasowany do szerokości — cały, bez przewijania w bok", async ({ page }) => {
    await otworzSchemat(page);
    const w = await wymiary(page);
    expect(w.naturalna, "test ma sens tylko dla rysunku szerszego niż okienko").toBeGreaterThan(w.miejsce);
    expect(w.rysunek).toBeLessThanOrEqual(w.miejsce + 1);
    expect(w.rysunek).toBeGreaterThan(w.miejsce - 2);
    expect(await powiekszenie(page)).toBeLessThan(100);
  });

  /** Dotyk prawdziwy, przez CDP — `page.touchscreen` potrafi tylko pojedyncze dotknięcie. */
  test("rozsunięcie palców powiększa schemat w miejscu, nad którym się szczypie", async ({ page }) => {
    await otworzSchemat(page);
    const przed = await powiekszenie(page);
    const okno = page.getByTestId("schemat-okno");
    const box = (await okno.boundingBox())!;
    const sx = box.x + box.width / 2;
    const sy = box.y + box.height / 2;

    // Punkt rysunku (w jednostkach viewBox) pod środkiem gestu — ma pod nim zostać.
    const punktRysunku = () =>
      okno.evaluate((el, [x, y]) => {
        const svg = el.querySelector("svg")!;
        const r = svg.getBoundingClientRect();
        const k = r.width / svg.viewBox.baseVal.width;
        return { x: (x - r.left) / k, y: (y - r.top) / k };
      }, [sx, sy]);
    const przedPunkt = await punktRysunku();

    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        { x: sx - 30, y: sy, id: 1 },
        { x: sx + 30, y: sy, id: 2 },
      ],
    });
    for (const d of [20, 40, 60, 80]) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [
          { x: sx - 30 - d, y: sy, id: 1 },
          { x: sx + 30 + d, y: sy, id: 2 },
        ],
      });
      await page.waitForTimeout(40);
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await cdp.detach();

    expect(await powiekszenie(page)).toBeGreaterThan(przed * 2);
    const poPunkt = await punktRysunku();
    // Tolerancja w jednostkach rysunku: kilka pikseli ekranu po powiększeniu.
    expect(Math.abs(poPunkt.x - przedPunkt.x)).toBeLessThan(15);
    expect(Math.abs(poPunkt.y - przedPunkt.y)).toBeLessThan(15);
  });

  test("przyciski powiększają i wracają do dopasowania", async ({ page }) => {
    await otworzSchemat(page);
    const dopasowane = await powiekszenie(page);
    await page.getByRole("button", { name: "Powiększ schemat" }).click();
    expect(await powiekszenie(page)).toBeGreaterThan(dopasowane);
    await page.getByRole("button", { name: "Dopasuj schemat do szerokości" }).click();
    expect(await powiekszenie(page)).toBe(dopasowane);
  });

  /** Plik ma wyglądać tak samo niezależnie od tego, jak schemat oglądano na ekranie. */
  test("eksport SVG ma rozmiar naturalny, nie ten z ekranu", async ({ page }) => {
    await otworzSchemat(page);
    await page.getByRole("button", { name: "Powiększ schemat" }).click();
    const pobieranie = page.waitForEvent("download");
    await page.getByRole("button", { name: /Eksportuj SVG/ }).click();
    const plik = await (await pobieranie).path();
    const tresc = (await import("node:fs")).readFileSync(plik!, "utf8");
    const { naturalna } = await wymiary(page);
    expect(tresc).toMatch(new RegExp(`<svg[^>]* width="${naturalna}"`));
    expect(tresc).not.toMatch(/<svg[^>]* style=/);
  });
});

test("na monitorze schemat zostaje w naturalnym rozmiarze", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await otworzSchemat(page);
  expect(await powiekszenie(page)).toBe(100);
});
