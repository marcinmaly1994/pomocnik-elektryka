import { test, expect, type Page } from "@playwright/test";

/**
 * Klik OBOK ściany zaznaczał ścianę.
 *
 * Pas trafienia (`hitStrokeWidth`) był stałą w jednostkach rysunku, więc rósł z powiększeniem.
 * Zmierzone: przy 100% ściana 10 px grubości zaznaczała się kliknięciem 15 px poza krawędzią,
 * przy 190% — 27 px poza nią. Teraz trafienie to widoczna grubość plus stały zapas w pikselach
 * ekranu, więc granica jest w tym samym miejscu przy każdym powiększeniu.
 *
 * Położenie ściany bierzemy z PIKSELI płótna (jej kolor), a nie z danych projektu — po
 * przybliżeniu widok się przesuwa, a test ma mierzyć to, co widzi użytkownik.
 */

async function planBox(page: Page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  return (await page.locator("[data-testid=plan-okno]").first().boundingBox())!;
}

async function klik(page: Page, x: number, y: number) {
  const b = await planBox(page);
  await page.mouse.click(b.x + x, b.y + y);
}

/** Środek i widoczna grubość ściany (kolor #16202B) w kolumnie `x` okna planu. */
async function scianaWKolumnie(page: Page, x: number) {
  return page.evaluate((x) => {
    const okno = document.querySelector("[data-testid=plan-okno]")!;
    const r = okno.getBoundingClientRect();
    const ys: number[] = [];
    for (const c of Array.from(okno.querySelectorAll("canvas"))) {
      const cr = c.getBoundingClientRect();
      const k = c.width / cr.width;
      const kol = c.getContext("2d")!.getImageData(Math.round((r.left + x - cr.left) * k), 0, 1, c.height).data;
      for (let i = 0; i < c.height; i++) {
        const [R, G, B, A] = [kol[i * 4], kol[i * 4 + 1], kol[i * 4 + 2], kol[i * 4 + 3]];
        if (A > 200 && Math.abs(R - 0x16) < 12 && Math.abs(G - 0x20) < 12 && Math.abs(B - 0x2b) < 12) ys.push(i / k + cr.top - r.top);
      }
    }
    if (!ys.length) return null;
    return { srodek: (Math.min(...ys) + Math.max(...ys)) / 2, polowa: (Math.max(...ys) - Math.min(...ys) + 1) / 2 };
  }, x);
}

async function zaznaczonaPoKliknieciu(page: Page, x: number, y: number) {
  await page.keyboard.press("Escape");
  await klik(page, x, y);
  return page.getByTestId("selected-wall-thickness-input").isVisible();
}

test("klik 20 px obok krawędzi ściany jej nie zaznacza — przy każdym powiększeniu", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Narysuj dom samodzielnie" }).click();
  const rozumiem = page.getByRole("button", { name: "Rozumiem" });
  if (await rozumiem.count()) await rozumiem.click();
  await page.getByRole("button", { name: "Narysuj Ścianę", exact: true }).click();
  await klik(page, 100, 300);
  await klik(page, 500, 300);
  await page.getByRole("button", { name: "Zakończ" }).click();
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "Zaznacz", exact: true }).click();
  // Najpierw powiększenie startowe, potem MAKSYMALNE — tam stary pas trafienia był najszerszy.
  for (const etap of ["start", "maksimum"]) {
    if (etap === "maksimum") {
      const przybliz = page.getByRole("button", { name: "Przybliż widok" });
      for (let i = 0; i < 40 && (await przybliz.isEnabled()); i++) await przybliz.click();
    }
    await page.waitForTimeout(300);
    let x = 0;
    let s: Awaited<ReturnType<typeof scianaWKolumnie>> = null;
    for (const kx of [300, 200, 400, 600, 700, 100]) {
      s = await scianaWKolumnie(page, kx);
      if (s) { x = kx; break; }
    }
    expect(s, `ściana widoczna (${etap})`).not.toBeNull();
    // W ścianę i tuż przy krawędzi — zaznacza.
    expect(await zaznaczonaPoKliknieciu(page, x, s!.srodek)).toBe(true);
    expect(await zaznaczonaPoKliknieciu(page, x, s!.srodek + s!.polowa + 2)).toBe(true);
    // 20 px poza krawędzią — już nie (dotąd przy 190% zaznaczało do 27 px).
    expect(await zaznaczonaPoKliknieciu(page, x, s!.srodek + s!.polowa + 20)).toBe(false);
    expect(await zaznaczonaPoKliknieciu(page, x, s!.srodek - s!.polowa - 20)).toBe(false);
  }
});

/**
 * Drzwi w ścianie miały pas trafienia „grubość otworu + 12" w jednostkach rysunku — ten sam
 * błąd co sama ściana. Otwór rysuje się o 4 jednostki grubszy niż mur, więc przy powiększeniu
 * startowym (2 px na jednostkę) jego obrys wystaje ~4 px poza mur, a dawny pas — kolejne
 * 12 px. Teraz zapas to ~6 px poza obrysem drzwi: klik 14 px od krawędzi MURU (~10 px poza
 * drzwiami) nie zaznacza już niczego, a na starym kodzie zaznaczał drzwi.
 */
test("klik 14 px obok muru przy drzwiach nie zaznacza ani drzwi, ani ściany", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Narysuj dom samodzielnie" }).click();
  const rozumiem = page.getByRole("button", { name: "Rozumiem" });
  if (await rozumiem.count()) await rozumiem.click();
  await page.getByRole("button", { name: "Narysuj Ścianę", exact: true }).click();
  await klik(page, 100, 300);
  await klik(page, 500, 300);
  await page.getByRole("button", { name: "Zakończ" }).click();
  await page.waitForTimeout(500);

  const s = (await scianaWKolumnie(page, 150))!;
  await page.getByRole("button", { name: "Drzwi i okna", exact: true }).click();
  await klik(page, 300, s.srodek);
  await page.waitForTimeout(700);
  await page.getByRole("button", { name: "Zaznacz", exact: true }).click();

  const drzwi = page.getByTestId("opening-width-input");
  const sciana = page.getByTestId("selected-wall-thickness-input");
  await page.keyboard.press("Escape");
  await klik(page, 300, s.srodek);
  await expect(drzwi).toBeVisible();

  for (const y of [s.srodek + s.polowa + 14, s.srodek - s.polowa - 14]) {
    await page.keyboard.press("Escape");
    await klik(page, 300, y);
    await page.waitForTimeout(200);
    await expect(drzwi).toHaveCount(0);
    await expect(sciana).toHaveCount(0);
  }
});
