import { test, expect, type Page } from "@playwright/test";

/**
 * Dotknięcie CZEGOKOLWIEK NARYSOWANEGO było ślepe.
 *
 * Konva gasi domyślne zachowanie dotknięcia, gdy palec trafi w kształt — dosłownie
 * `if (shape.preventDefault() && evt.cancelable && isTouch) evt.preventDefault()`
 * w jej `Stage`. Przeglądarka nie dorabia wtedy zgodnościowych `mousedown`/`click`,
 * a na nich stoi cała obsługa myszy w `DesignCanvas`. Dotknięcie PUSTEGO płótna
 * dorabia klik normalnie — i właśnie dlatego rysowanie dotykiem działało, przez co
 * dziura wyglądała na działającą aplikację.
 *
 * Zmierzone wprost: dotknięcie ściany dawało wyłącznie `touchstart`/`touchend`, a mysz
 * w tym samym punkcie `mousedown`/`mouseup`/`click` z trafieniem w `Line`.
 *
 * Każdy przypadek sprawdzamy DOTYKIEM I MYSZĄ, bo poprawka dokłada drugą drogę do tej
 * samej czynności — a wtedy najłatwiej zepsuć tę pierwszą albo wykonać czynność dwa razy.
 */

test.use({ hasTouch: true });

async function planBox(page: Page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  return (await page.locator("[data-testid=plan-okno]").first().boundingBox())!;
}

async function pustyProjekt(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByRole("heading", { name: "Zaprojektuj instalację elektryczną w swoim domu" })).toBeVisible();
  await page.getByRole("button", { name: "Narysuj dom samodzielnie" }).click();
  const r = page.getByRole("button", { name: "Rozumiem" });
  if (await r.count()) await r.click();
}

async function klik(page: Page, x: number, y: number) {
  const b = await planBox(page);
  await page.mouse.click(b.x + x, b.y + y);
}

/** Jedno wskazanie punktu na planie — myszą albo palcem, zależnie od przebiegu testu. */
async function wskaz(page: Page, x: number, y: number, dotykiem: boolean) {
  const b = await planBox(page);
  if (dotykiem) await page.touchscreen.tap(b.x + x, b.y + y);
  else await page.mouse.click(b.x + x, b.y + y);
}

/** Dwukrotne wskazanie tego samego punktu. */
async function wskazDwaRazy(page: Page, x: number, y: number, dotykiem: boolean) {
  const b = await planBox(page);
  if (!dotykiem) {
    await page.mouse.dblclick(b.x + x, b.y + y);
    return;
  }
  await page.touchscreen.tap(b.x + x, b.y + y);
  await page.waitForTimeout(60);
  await page.touchscreen.tap(b.x + x, b.y + y);
}

async function narysujSciane(page: Page) {
  await page.getByRole("button", { name: "Narysuj Ścianę", exact: true }).click();
  await klik(page, 100, 300);
  await klik(page, 400, 300);
  await page.getByRole("button", { name: "Zakończ" }).click();
  await page.waitForTimeout(700);
}

async function otworyWProjekcie(page: Page): Promise<number> {
  await page.waitForTimeout(900);
  return page.evaluate(() => {
    const raw = localStorage.getItem("pomocnikelektryka_projekt_" + localStorage.getItem("pomocnikelektryka_projekt_biezacy"));
    return (JSON.parse(raw!).draft.openings ?? []).length as number;
  });
}

for (const dotykiem of [false, true]) {
  const jak = dotykiem ? "dotknięciem" : "myszą";

  test(`ściana zaznacza się ${jak}`, async ({ page }) => {
    await pustyProjekt(page);
    await narysujSciane(page);
    await page.getByRole("button", { name: "Zaznacz", exact: true }).click();

    await wskaz(page, 250, 300, dotykiem);
    await expect(page.getByTestId("selected-wall-thickness-input")).toBeVisible();
  });

  /**
   * Wstawianie otworu to jedyna z tych czynności, która COŚ TWORZY — gdyby dorobiony
   * klik jednak przyszedł obok dotknięcia, w ścianie stanęłyby dwoje drzwi naraz.
   */
  test(`otwór wstawia się ${jak} — dokładnie jeden`, async ({ page }) => {
    await pustyProjekt(page);
    await narysujSciane(page);
    await page.getByRole("button", { name: "Drzwi i okna", exact: true }).click();

    await wskaz(page, 200, 300, dotykiem);
    expect(await otworyWProjekcie(page)).toBe(1);
  });

  test(`otwór zaznacza się ${jak}`, async ({ page }) => {
    await pustyProjekt(page);
    await narysujSciane(page);
    await page.getByRole("button", { name: "Drzwi i okna", exact: true }).click();
    await klik(page, 200, 300);
    await page.waitForTimeout(700);

    // wychodzimy z zaznaczenia świeżo wstawionego otworu, żeby sprawdzić samo wskazanie
    await page.getByRole("button", { name: "Zaznacz", exact: true }).click();
    await klik(page, 600, 500);
    await expect(page.getByTestId("opening-width-input")).toHaveCount(0);

    await wskaz(page, 200, 300, dotykiem);
    await expect(page.getByTestId("opening-width-input")).toBeVisible();
  });

  test(`dwukrotne wskazanie elementu ${jak} otwiera jego edycję`, async ({ page }) => {
    await pustyProjekt(page);
    await page.getByRole("button", { name: "Wstaw Element" }).click();
    await page.getByRole("button", { name: /Gniazdo 230 V/ }).click();
    await klik(page, 200, 200);
    await page.waitForTimeout(700);
    await page.getByRole("button", { name: "Zaznacz", exact: true }).click();

    await wskazDwaRazy(page, 200, 200, dotykiem);
    await expect(page.getByRole("dialog").filter({ hasText: /Wysokość montażu/ })).toBeVisible();
  });
}
