import { test, expect, type Page } from "@playwright/test";
import { skipEntryScreen, otworzKatalogElementow } from "./_flow";

/**
 * Trasy przewodów pod dotykiem — ostatnia rzecz z płótna, która nie miała własnego
 * testu po przejściu wszystkich kliknięć na `klikAlboDotyk`/`dwuklikAlboDotyk`
 * (patrz e2e/dotyk-plotna.spec.ts i komentarz przy tych pomocnikach w DesignCanvas).
 *
 * Trasa jest tu przypadkiem najtrudniejszym i dlatego wartym osobnego testu: nie da
 * się jej wskazać „na oko" (biegnie tam, gdzie policzy ją routing), a czynności na
 * niej TWORZĄ ALBO KASUJĄ punkty — czyli wykonane dwa razy zniekształcają rysunek.
 *
 * Punkt dokłada się z menu (PPM, na dotyku przytrzymanie palcem → „Dodaj punkt"),
 * a dwuklik / podwójne dotknięcie trasy pokazuje informacje o przewodzie i niczego
 * na rysunku nie zmienia.
 */

test.use({ hasTouch: true });

async function planBox(page: Page) {
  const wrap = page.locator("[data-testid=plan-okno]").first();
  await wrap.evaluate((e) => {
    e.scrollIntoView({ block: "start" });
    e.scrollTo(0, 0);
  });
  return (await wrap.boundingBox())!;
}

async function otworzPlan(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Instalacja" }).click();
  await skipEntryScreen(page);
  await page.getByRole("button", { name: "Narysuj dom samodzielnie" }).first().click();
  const rozumiem = page.getByRole("button", { name: "Rozumiem" });
  if (await rozumiem.count()) await rozumiem.click();
}

/** Rozdzielnica i gniazdo — tyle wystarczy, żeby powstała jedna trasa. */
async function jednaTrasa(page: Page) {
  await otworzKatalogElementow(page);
  await page.getByRole("button", { name: /Rozdział/ }).click();
  await page.getByRole("button", { name: /^Rozdzielnica$/ }).last().click();
  let box = await planBox(page);
  await page.mouse.click(box.x + 60, box.y + 60);

  await otworzKatalogElementow(page);
  await page.getByRole("button", { name: /Gniazda i zasilanie/ }).click();
  await otworzKatalogElementow(page);
  await page.getByRole("button", { name: /Gniazdo 230 V/ }).first().click();
  box = await planBox(page);
  await page.mouse.click(box.x + 280, box.y + 200);
  await page.waitForTimeout(400);

  await page.getByRole("button", { name: "Zaznacz", exact: true }).click();
  await page.getByRole("button", { name: "Pokaż trasy przewodów" }).click();
  await page.waitForTimeout(400);
}

/**
 * Punkt EKRANU leżący na trasie.
 *
 * Trasy biegną tam, gdzie policzy je routing, więc nie da się w nie trafić stałą
 * współrzędną — bierzemy środek pierwszego odcinka wprost ze sceny. `opacity 0.9`
 * to ten sam znacznik trasy, co w cable-routes.spec.ts.
 */
async function punktNaTrasie(page: Page): Promise<{ x: number; y: number }> {
  const box = await planBox(page);
  const p = await page.evaluate(() => {
    type Linia = {
      opacity(): number;
      points(): number[];
      getAbsoluteTransform(): { point(p: { x: number; y: number }): { x: number; y: number } };
    };
    const stage = (window as unknown as { Konva: { stages: { find(s: string): Linia[] }[] } }).Konva.stages[0];
    const trasa = stage.find("Line").filter((l) => Math.abs(l.opacity() - 0.9) < 0.01)[0];
    if (!trasa) return null;
    const pk = trasa.points();
    const srodek = { x: (pk[0] + pk[2]) / 2, y: (pk[1] + pk[3]) / 2 };
    return trasa.getAbsoluteTransform().point(srodek);
  });
  if (!p) throw new Error("na scenie nie ma ani jednej trasy");
  return { x: box.x + p.x, y: box.y + p.y };
}

/**
 * Ile załamań ma pierwsza trasa na scenie.
 *
 * Liczone NA SCENIE, bo to ona jest tu prawdą: trasa powstaje z routingu, a ręczna
 * poprawka (`draft.routeOverrides`) tylko ją nadpisuje. Scena pokazuje wynik obu naraz.
 */
async function zalamaniaTrasy(page: Page): Promise<number> {
  await page.waitForTimeout(400);
  return page.evaluate(() => {
    type Linia = { opacity(): number; points(): number[] };
    const stage = (window as unknown as { Konva: { stages: { find(s: string): Linia[] }[] } }).Konva.stages[0];
    const trasa = stage.find("Line").filter((l) => Math.abs(l.opacity() - 0.9) < 0.01)[0];
    return trasa ? trasa.points().length / 2 : -1;
  });
}

async function wskaz(page: Page, x: number, y: number, dotykiem: boolean) {
  if (dotykiem) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

/** PPM myszą albo przytrzymanie palcem — to samo menu. */
async function otworzMenu(page: Page, x: number, y: number, dotykiem: boolean) {
  if (!dotykiem) {
    await page.mouse.click(x, y, { button: "right" });
    return;
  }
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  await page.waitForTimeout(700);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

async function wskazDwaRazy(page: Page, x: number, y: number, dotykiem: boolean) {
  if (!dotykiem) {
    await page.mouse.dblclick(x, y);
    return;
  }
  await page.touchscreen.tap(x, y);
  await page.waitForTimeout(60);
  await page.touchscreen.tap(x, y);
}

for (const dotykiem of [false, true]) {
  const jak = dotykiem ? "dotknięciem" : "myszą";

  test(`trasa zaznacza się ${jak}`, async ({ page }) => {
    await otworzPlan(page);
    await jednaTrasa(page);

    const p = await punktNaTrasie(page);
    await wskaz(page, p.x, p.y, dotykiem);
    await expect(page.getByText(/^Trasa: /)).toBeVisible();
  });

  /**
   * DOKŁADNIE jeden punkt, nie dwa. To jest tu sedno: obie czynności na trasie
   * zmieniają rysunek, więc gdyby obok dotknięcia przyszedł jeszcze dorobiony klik
   * (patrz `echoTapuRef` w DesignCanvas i echo przytrzymania w
   * `useDlugiePrzytrzymanie`), trasa dostałaby dwa załamania zamiast jednego.
   */
  test(`menu ${jak} dokłada trasie jeden punkt, a dwukrotne wskazanie uchwytu go kasuje`, async ({ page }) => {
    await otworzPlan(page);
    await jednaTrasa(page);

    const przed = await zalamaniaTrasy(page);
    const p = await punktNaTrasie(page);

    await otworzMenu(page, p.x, p.y, dotykiem);
    await page.getByRole("button", { name: "Dodaj punkt", exact: true }).click();
    await expect(page.getByText(/^Trasa: /)).toBeVisible();
    expect(await zalamaniaTrasy(page)).toBe(przed + 1);

    // dwukrotne wskazanie UCHWYTU kasuje dołożony punkt — trasa wraca do liczonej
    await wskazDwaRazy(page, p.x, p.y, dotykiem);
    expect(await zalamaniaTrasy(page)).toBe(przed);
  });

  test(`dwukrotne wskazanie trasy ${jak} pokazuje informacje o przewodzie i niczego nie dokłada`, async ({ page }) => {
    await otworzPlan(page);
    await jednaTrasa(page);

    const przed = await zalamaniaTrasy(page);
    const p = await punktNaTrasie(page);

    await wskazDwaRazy(page, p.x, p.y, dotykiem);
    const info = page.getByTestId("info-trasy");
    await expect(info).toBeVisible();
    await expect(info).toContainText("Obwód");
    await expect(info).toContainText(/Przewód\s*YDY/);
    await expect(info).toContainText(/Ten odcinek\s*\d+,\d{2} m/);
    await expect(info).toContainText(/Cała trasa\s*\d+,\d{2} m/);
    await expect(info).toContainText("Gniazdo 230 V");
    expect(await zalamaniaTrasy(page)).toBe(przed);
  });
}
