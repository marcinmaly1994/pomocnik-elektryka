import { test, expect, type Page } from "@playwright/test";
import { wczytajPrzyklad } from "./_flow";

/**
 * Telefon: karta zaznaczenia w dolnej szufladzie nad rzutem (F7 z audytu 5.11.2026).
 *
 * Panel narzędzia stoi na telefonie NAD rzutem i po wyborze elementu z biblioteki
 * zwija się sam — karta zaznaczonego elementu w panelu była więc niewidoczna albo
 * przewinięta poza ekran. Teraz stoi w szufladzie przy dolnej krawędzi rzutu.
 */

test.use({ viewport: { width: 390, height: 664 }, isMobile: true, hasTouch: true });

/** Środek elementu danego typu na ekranie — przez żywą transformację warstwy Konvy. */
async function ekranElementu(page: Page, typ: string, ktory = 0): Promise<[number, number]> {
  return page.evaluate(
    ([typ, ktory]) => {
      const k = (window as unknown as { Konva: { stages: { container(): HTMLElement; getLayers(): { getAbsoluteTransform(): { point(p: { x: number; y: number }): { x: number; y: number } } }[] }[] } }).Konva;
      const st = k.stages.find((s) => s.container().offsetParent)!;
      const id = localStorage.getItem("pomocnikelektryka_projekt_biezacy");
      const p = JSON.parse(localStorage.getItem("pomocnikelektryka_projekt_" + id)!);
      const e = p.draft.elements.filter((x: { type: string }) => x.type === typ)[ktory as number];
      const pt = st.getLayers()[0].getAbsoluteTransform().point({ x: e.x, y: e.y });
      const r = st.container().getBoundingClientRect();
      return [r.left + pt.x, r.top + pt.y] as [number, number];
    },
    [typ, ktory] as const
  );
}

test("dotknięcie gniazdka pokazuje jego kartę w szufladzie na ekranie; uchwyt ją zwija", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await wczytajPrzyklad(page, "mieszkanie");
  await page.waitForTimeout(1500);
  const r = page.getByRole("button", { name: "Rozumiem" });
  if (await r.count()) await r.tap();

  await page.getByRole("button", { name: "Zaznacz", exact: true }).first().tap();
  await page.locator("[data-testid=plan-okno]").first().scrollIntoViewIfNeeded();
  const [x, y] = await ekranElementu(page, "gniazdko");
  await page.touchscreen.tap(x, y);

  const szuflada = page.getByTestId("szuflada-karty");
  await expect(szuflada).toBeVisible();
  const karta = szuflada.getByTestId("karta-elementu");
  await expect(karta).toBeVisible();
  await expect(karta).toContainText("Gniazdo 230 V");
  // karta jest na EKRANIE, nie przewinięta poza niego
  const box = (await szuflada.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeLessThan(664);
  // i tylko w jednym miejscu — nie ma jej równocześnie w panelu
  await expect(page.getByTestId("karta-elementu")).toHaveCount(1);

  // uchwyt zwija kartę do paska z nazwą
  await szuflada.getByRole("button", { expanded: true }).tap();
  await expect(karta).toHaveCount(0);
  await expect(szuflada).toContainText("Gniazdo 230 V");

  // nowe zaznaczenie rozwija szufladę z powrotem
  const [x2, y2] = await ekranElementu(page, "oswietlenie");
  await page.touchscreen.tap(x2, y2);
  await expect(szuflada.getByTestId("karta-elementu")).toContainText("Punkt sufitowy");
});
