import { test, expect, type Page } from "@playwright/test";

/**
 * Szczypanie ma PRZYBLIŻAĆ, a nie poprawiać rysunek.
 *
 * Konva prowadzi własne przeciąganie na PIERWSZYM wskaźniku, niezależnie od tego, ile
 * palców leży na ekranie. Szczypanie zaczyna się więc tak samo jak przeciągnięcie —
 * jednym palcem postawionym na czymś narysowanym — a kiedy palce się rozjeżdżają,
 * Konva czyta ruch tego pierwszego jako przeciągnięcie i przesuwa element pod nim.
 * `preventDefault` w naszym nasłuchu `touchmove` (patrz `DesignCanvas`) tego nie
 * zatrzymuje: gasi domyślne zachowanie PRZEGLĄDARKI, a przeciąganie Konvy to zwykły
 * JavaScript.
 *
 * Zmierzone przed poprawką: gniazdko stojące w (100, 99) jedn. po jednym szczypnięciu
 * lądowało w (90, 100) — bez śladu na ekranie poza samym przesunięciem, za to z
 * wpisem do projektu i do historii cofania. Zmiana, o którą nikt nie prosił, w geście,
 * który na telefonie robi się dziesiątki razy na minutę.
 *
 * DOTYK PRAWDZIWY, przez CDP: `page.touchscreen` potrafi tylko pojedyncze dotknięcie,
 * a cała rzecz dzieje się dopiero przy dwóch palcach naraz.
 */

test.use({ hasTouch: true });

async function planBox(page: Page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  return (await page.locator("[data-testid=plan-okno]").first().boundingBox())!;
}

/** Pozycje osprzętu prosto z zapisanego projektu — bez zgadywania z pikseli. */
async function pozycjeOsprzetu(page: Page): Promise<{ x: number; y: number }[]> {
  await page.waitForTimeout(900);
  return page.evaluate(() => {
    const raw = localStorage.getItem("pomocnikelektryka_projekt_" + localStorage.getItem("pomocnikelektryka_projekt_biezacy"));
    const elementy = (JSON.parse(raw!).draft.elements ?? []) as { x: number; y: number }[];
    return elementy.map((e) => ({ x: Math.round(e.x), y: Math.round(e.y) }));
  });
}

/** Powiększenie odczytane z paska — ta sama liczba, którą widzi użytkownik. */
async function powiekszenie(page: Page): Promise<number> {
  const etykieta = await page.getByRole("button", { name: /Powiększenie \d+ procent/ }).getAttribute("aria-label");
  return Number(etykieta!.match(/(\d+) procent/)![1]);
}

/**
 * Rozsunięcie dwóch palców. `x`, `y` to ŚRODEK gestu względem płótna, a pierwszy palec
 * startuje dokładnie w nim — bo to on decyduje, co Konva uzna za przeciągane.
 */
async function rozsunPalce(page: Page, x: number, y: number) {
  const box = await planBox(page);
  const sx = box.x + x;
  const sy = box.y + y;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      { x: sx, y: sy, id: 1 },
      { x: sx + 80, y: sy, id: 2 },
    ],
  });
  for (const d of [20, 40, 60, 80]) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        { x: sx - d, y: sy, id: 1 },
        { x: sx + 80 + d, y: sy, id: 2 },
      ],
    });
    await page.waitForTimeout(40);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

async function projektZGniazdkiem(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Narysuj dom samodzielnie" }).click();
  const rozumiem = page.getByRole("button", { name: "Rozumiem" });
  if (await rozumiem.count()) await rozumiem.click();
  await page.getByRole("button", { name: "Wstaw Element" }).click();
  await page.getByRole("button", { name: /Gniazdo 230 V/ }).click();
  const box = await planBox(page);
  await page.mouse.click(box.x + 200, box.y + 200);
  await expect.poll(async () => (await pozycjeOsprzetu(page)).length).toBe(1);
}

/**
 * „Zaznacz" to narzędzie DOMYŚLNE, w którym osprzęt jest przeciągalny — czyli stan,
 * w którym aplikacja się otwiera i w którym ogląda się rzut.
 */
test("szczypanie nad elementem przybliża rzut, nie przesuwa elementu", async ({ page }) => {
  await projektZGniazdkiem(page);
  await page.getByRole("button", { name: "Zaznacz", exact: true }).click();
  const przed = (await pozycjeOsprzetu(page))[0];
  const zoomPrzed = await powiekszenie(page);

  await rozsunPalce(page, 200, 200);

  expect(await powiekszenie(page)).toBeGreaterThan(zoomPrzed);
  expect((await pozycjeOsprzetu(page))[0]).toEqual(przed);
});

/** To samo w „Wstaw Element" — tam osprzęt też jest przeciągalny (patrz `draggable`). */
test("szczypanie nad elementem nie przesuwa go także w trybie wstawiania", async ({ page }) => {
  await projektZGniazdkiem(page);
  const przed = (await pozycjeOsprzetu(page))[0];

  await rozsunPalce(page, 200, 200);

  expect((await pozycjeOsprzetu(page))[0]).toEqual(przed);
});

/** Kontrola: przeciąganie JEDNYM palcem ma dalej działać — poprawka nie może go zabrać. */
test("jeden palec dalej przesuwa element", async ({ page }) => {
  await projektZGniazdkiem(page);
  await page.getByRole("button", { name: "Zaznacz", exact: true }).click();
  const przed = (await pozycjeOsprzetu(page))[0];

  const box = await planBox(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: box.x + 200, y: box.y + 200, id: 1 }] });
  for (const d of [15, 30, 45, 60]) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: box.x + 200 + d, y: box.y + 200, id: 1 }] });
    await page.waitForTimeout(40);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();

  expect((await pozycjeOsprzetu(page))[0].x).toBeGreaterThan(przed.x);
});
