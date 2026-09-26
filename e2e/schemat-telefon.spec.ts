import { test, expect, type Page } from "@playwright/test";
import { wczytajPrzyklad } from "./_flow";

/**
 * Schemat jednokreskowy na telefonie.
 *
 * Rysunek ma ok. 1200 px szerokości, a okienko na telefonie ok. 330 px. W naturalnym
 * rozmiarze od lewej krawędzi widać było pustą górną połowę i ani kawałka rozdzielnicy
 * głównej; dopasowany do szerokości był z kolei miniaturą z napisami po 2,5 px. Teraz
 * otwiera się w czytelnym rozmiarze, wycentrowany na wyłączniku głównym, całość jest pod
 * „Dopasuj", a powiększanie przyciskami trzyma środek widoku.
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

/**
 * O ile [px ekranu] oś wyłącznika głównego odstaje od środka okienka w poziomie.
 * Oś bierzemy z wyśrodkowanego napisu faz nad wyłącznikiem — grupa samego wyłącznika
 * ma podpis z prawej, więc jej środek nie leży na osi.
 */
async function odSrodka(page: Page): Promise<number> {
  return page.getByTestId("schemat-okno").evaluate((el) => {
    const q = el.querySelector("#incoming-supply text")!.getBoundingClientRect();
    const o = el.getBoundingClientRect();
    return q.left + q.width / 2 - (o.left + o.width / 2);
  });
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

  test("schemat otwiera się czytelny, z wyłącznikiem głównym na środku okienka", async ({ page }) => {
    await otworzSchemat(page);
    const w = await wymiary(page);
    expect(w.naturalna, "test ma sens tylko dla rysunku szerszego niż okienko").toBeGreaterThan(w.miejsce);
    expect(await powiekszenie(page)).toBe(100);
    expect(Math.abs(await odSrodka(page))).toBeLessThan(20);
  });

  test("„Dopasuj” pokazuje cały schemat w szerokości okienka", async ({ page }) => {
    await otworzSchemat(page);
    await page.getByRole("button", { name: "Dopasuj schemat do szerokości" }).click();
    const w = await wymiary(page);
    expect(w.rysunek).toBeLessThanOrEqual(w.miejsce + 1);
    expect(w.rysunek).toBeGreaterThan(w.miejsce - 2);
  });

  test("„+” i „−” trzymają środek widoku, a nie lewą krawędź", async ({ page }) => {
    await otworzSchemat(page);
    await page.getByRole("button", { name: "Dopasuj schemat do szerokości" }).click();
    for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Powiększ schemat" }).click();
    expect(await powiekszenie(page)).toBeGreaterThan(40);
    // Wyłącznik główny stoi na środku rysunku, więc przy dopasowaniu był na środku okienka.
    expect(Math.abs(await odSrodka(page))).toBeLessThan(20);
    await page.getByRole("button", { name: "Pomniejsz schemat" }).click();
    expect(Math.abs(await odSrodka(page))).toBeLessThan(20);
  });

  test("przyciski powiększenia mają rozmiar pod palec", async ({ page }) => {
    await otworzSchemat(page);
    for (const nazwa of ["Pomniejsz schemat", "Powiększ schemat", "Dopasuj schemat do szerokości", /Powiększenie schematu \d+ procent/]) {
      const box = (await page.getByRole("button", { name: nazwa }).boundingBox())!;
      expect(box.width, String(nazwa)).toBeGreaterThanOrEqual(44);
      expect(box.height, String(nazwa)).toBeGreaterThanOrEqual(44);
    }
  });

  /** Dotyk prawdziwy, przez CDP — `page.touchscreen` potrafi tylko pojedyncze dotknięcie. */
  test("rozsunięcie palców powiększa schemat w miejscu, nad którym się szczypie", async ({ page }) => {
    await otworzSchemat(page);
    const przed = await powiekszenie(page);
    const okno = page.getByTestId("schemat-okno");
    // W czytelnym rozmiarze okienko jest wysokie i zaczyna się pod nagłówkiem — gest
    // musi paść na nie, a nie pod dolną krawędzią ekranu.
    await okno.evaluate((el) => el.scrollIntoView({ block: "center" }));
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
    await page.getByRole("button", { name: "Dopasuj schemat do szerokości" }).click();
    const dopasowane = await powiekszenie(page);
    expect(dopasowane).toBeLessThan(100);
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

/**
 * Tablet w pionie: rysunek (ok. 1240 px) nie mieści się w okienku (720–770 px), a
 * wyśrodkowanie działało tylko na telefonie — schemat startował od lewej krawędzi
 * i wyłącznik główny był przecięty prawą krawędzią okienka.
 */
for (const okno of [
  { width: 768, height: 1024 },
  { width: 820, height: 1180 },
]) {
  test.describe(`tablet ${okno.width}×${okno.height}`, () => {
    test.use({ viewport: okno, hasTouch: true });
    test("schemat otwiera się z wyłącznikiem głównym na środku okienka", async ({ page }) => {
      await otworzSchemat(page);
      const w = await wymiary(page);
      expect(w.naturalna, "test ma sens tylko dla rysunku szerszego niż okienko").toBeGreaterThan(w.miejsce);
      expect(Math.abs(await odSrodka(page))).toBeLessThan(20);
    });
  });
}

test("na monitorze schemat zostaje w naturalnym rozmiarze", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await otworzSchemat(page);
  expect(await powiekszenie(page)).toBe(100);
});
