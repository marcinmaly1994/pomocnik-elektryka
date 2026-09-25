import { test, expect, type CDPSession, type Page } from "@playwright/test";

/**
 * Rzut przesuwa się PALCEM — jednym w bok, dwoma w każdą stronę.
 *
 * Przedtem jeden palec w bok nie robił nic (płótno oddawało cały ruch przeglądarce,
 * a strona w poziomie się nie przewija), a dwa palce przesunięte bez zmiany rozstawu
 * też nic: kotwica szczypania liczona co klatkę z BIEŻĄCEGO położenia palców trzymała
 * pod nimi to, co akurat pod nimi było. Zostawało przełączanie na „Przesuń widok",
 * które palcem też nie działało, bo przeglądarka zabierała gest jako przewijanie.
 *
 * DOTYK PRAWDZIWY, przez CDP — patrz szczypanie-a-rysunek.spec.ts.
 */

test.use({ hasTouch: true });

async function planBox(page: Page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  return (await page.locator("[data-testid=plan-okno]").first().boundingBox())!;
}

/** Położenie sceny w pikselach — przesunięcie kadru widać tu wprost. */
async function scena(page: Page) {
  return page.evaluate(() => {
    const st = (window as unknown as { Konva: { stages: { x(): number; y(): number; scaleX(): number }[] } }).Konva
      .stages[0];
    return { x: st.x(), y: st.y(), skala: st.scaleX() };
  });
}

async function liczbaElementow(page: Page): Promise<number> {
  await page.waitForTimeout(900);
  return page.evaluate(() => {
    const raw = localStorage.getItem("pomocnikelektryka_projekt_" + localStorage.getItem("pomocnikelektryka_projekt_biezacy"));
    return raw ? ((JSON.parse(raw).draft.elements ?? []) as unknown[]).length : 0;
  });
}

async function pustyProjekt(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Narysuj dom samodzielnie" }).click();
  const rozumiem = page.getByRole("button", { name: "Rozumiem" });
  if (await rozumiem.count()) await rozumiem.click();
}

/** Palce jadą od `start` o (`dx`, `dy`) w kilku krokach; punkty względem płótna. */
async function przeciagnijPalcami(page: Page, start: { x: number; y: number }[], dx: number, dy: number) {
  const box = await planBox(page);
  const cdp: CDPSession = await page.context().newCDPSession(page);
  const punkty = (k: number) =>
    start.map((p, i) => ({ x: box.x + p.x + dx * k, y: box.y + p.y + dy * k, id: i + 1 }));
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: punkty(0) });
  for (const k of [0.25, 0.5, 0.75, 1]) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: punkty(k) });
    await page.waitForTimeout(40);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
  await page.waitForTimeout(100);
}

test("jeden palec w bok przesuwa rzut", async ({ page }) => {
  await pustyProjekt(page);
  await page.getByRole("button", { name: "Zaznacz", exact: true }).click();
  const przed = await scena(page);

  await przeciagnijPalcami(page, [{ x: 300, y: 200 }], -120, 0);

  const po = await scena(page);
  // Rzut jedzie POD palcem: ta sama odległość, ten sam kierunek.
  expect(po.x - przed.x).toBeCloseTo(-120, 0);
  expect(po.y).toBeCloseTo(przed.y, 0);
});

/**
 * „Wstaw Element" to tryb, w którym dotknięcie STAWIA — a Konva odpala `tap` przy
 * puszczeniu palca bez względu na to, ile palec przejechał. Przesunięcie rzutu nie
 * może zostawić po sobie gniazdka w miejscu, gdzie palec zszedł z ekranu.
 */
test("przesunięcie palcem w trybie wstawiania nie stawia elementu", async ({ page }) => {
  await pustyProjekt(page);
  await page.getByRole("button", { name: "Wstaw Element" }).click();
  await page.getByRole("button", { name: /Gniazdo 230 V/ }).click();
  const przed = await scena(page);

  await przeciagnijPalcami(page, [{ x: 300, y: 200 }], 150, 0);

  expect((await scena(page)).x - przed.x).toBeCloseTo(150, 0);
  expect(await liczbaElementow(page)).toBe(0);
});

test("ruch jednego palca w pionie nie rusza rzutu", async ({ page }) => {
  await pustyProjekt(page);
  await page.getByRole("button", { name: "Zaznacz", exact: true }).click();
  const przed = await scena(page);

  await przeciagnijPalcami(page, [{ x: 300, y: 200 }], 0, -100);

  expect(await scena(page)).toEqual(przed);
});

test("dwa palce przesunięte razem przesuwają rzut, nie zmieniając powiększenia", async ({ page }) => {
  await pustyProjekt(page);
  await page.getByRole("button", { name: "Zaznacz", exact: true }).click();
  const przed = await scena(page);

  await przeciagnijPalcami(
    page,
    [
      { x: 250, y: 200 },
      { x: 350, y: 200 },
    ],
    80,
    60,
  );

  const po = await scena(page);
  expect(po.skala).toBeCloseTo(przed.skala, 6);
  expect(po.x - przed.x).toBeCloseTo(80, 0);
  expect(po.y - przed.y).toBeCloseTo(60, 0);
});

test("„Przesuń widok” przesuwa rzut palcem także w pionie", async ({ page }) => {
  await pustyProjekt(page);
  await page.getByRole("button", { name: "Przesuń widok", exact: true }).click();
  const przed = await scena(page);

  await przeciagnijPalcami(page, [{ x: 300, y: 200 }], 0, 90);

  const po = await scena(page);
  expect(po.y - przed.y).toBeCloseTo(90, 0);
  expect(po.x).toBeCloseTo(przed.x, 0);
});

/**
 * Klik w stojący element na TELEFONIE: to tu problem był najbardziej dotkliwy — palec,
 * którym chciało się wskazać gniazdko, dokładał drugie.
 */
test("dotknięcie stojącego gniazda w trybie wstawiania zaznacza je", async ({ page }) => {
  await pustyProjekt(page);
  await page.getByRole("button", { name: "Wstaw Element" }).click();
  await page.getByRole("button", { name: /Gniazdo 230 V/ }).click();
  const box = await planBox(page);
  await page.touchscreen.tap(box.x + 200, box.y + 200);
  await expect.poll(() => liczbaElementow(page)).toBe(1);
  await page.waitForTimeout(500); // inaczej drugie dotknięcie to podwójne

  // Ramka NA NOWO: po postawieniu pierwszego elementu nad płótnem pojawia się pasek
  // i płótno zjeżdża niżej — stara ramka celowałaby kilkadziesiąt pikseli nad gniazdo.
  const teraz = await planBox(page);
  await page.touchscreen.tap(teraz.x + 200, teraz.y + 200);
  expect(await liczbaElementow(page)).toBe(1);
  await page.keyboard.press("Delete");
  expect(await liczbaElementow(page)).toBe(0);
});
