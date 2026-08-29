import { test, expect } from "@playwright/test";
import { skipEntryScreen } from "./_flow";

/**
 * Rysowanie ścian: „gumowy" podgląd odcinka do kursora i etykieta jego bieżącej
 * długości na żywo. Testowane e2e, bo etykieta i podgląd żyją na płótnie Konvy
 * (SVG-jak-DOM by tego nie złapał) — ten sam powód co przy rysowaniu pomieszczeń
 * w room-drawing.spec.ts.
 */

/**
 * Kliknięcie narzędzia w pasku (zmiana `toolMode`) potrafi przesunąć stronę —
 * przeglądarka doscrolluje klikany przycisk, więc bounding box płótna zmierzony
 * PRZED takim kliknięciem staje się nieaktualny. Dlatego box mierzymy PO wybraniu
 * narzędzia i jawnie wracamy na górę strony tuż przed pomiarem — ten sam wzorzec
 * co `zoomAndBox` w room-editing.spec.ts.
 */
async function openPlan(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Instalacja" }).click();
  await skipEntryScreen(page);
  await page.getByRole("button", { name: "Narysuj Ścianę", exact: true }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  const box = (await page.locator("div.overflow-auto.rounded-card.border").first().boundingBox())!;
  return box;
}

/** Wszystkie teksty aktualnie narysowane na scenie Konvy — etykieta wymiaru nie
 *  jest elementem DOM, więc trzeba sięgnąć wprost do węzłów sceny. */
async function konvaTexts(page: import("@playwright/test").Page): Promise<string[]> {
  return page.evaluate(() => {
    const k = (window as unknown as { Konva?: { stages: { find(sel: string): { text(): string }[] }[] } }).Konva;
    const stage = k?.stages[0];
    return stage ? stage.find("Text").map((t) => t.text()) : [];
  });
}

test("po pierwszym kliknięciu ruch myszką rysuje gumowy odcinek z etykietą wymiaru", async ({ page }) => {
  const box = await openPlan(page);
  await page.mouse.click(box.x + 100, box.y + 100);
  await page.mouse.move(box.x + 300, box.y + 100, { steps: 5 });

  // bez kalibracji skali etykieta pokazuje jednostki planu, nie metry
  const teksty = await konvaTexts(page);
  expect(teksty.some((t) => /^\d+ jedn\.$/.test(t))).toBe(true);
});

test("etykieta wymiaru rośnie wraz z odsunięciem kursora od ostatniego punktu", async ({ page }) => {
  const box = await openPlan(page);
  await page.mouse.click(box.x + 100, box.y + 100);

  await page.mouse.move(box.x + 150, box.y + 100, { steps: 3 });
  const teksty1 = await konvaTexts(page);
  const krotszy = Number(teksty1.find((t) => /jedn\.$/.test(t))?.match(/\d+/)?.[0]);

  await page.mouse.move(box.x + 350, box.y + 100, { steps: 3 });
  const teksty2 = await konvaTexts(page);
  const dluzszy = Number(teksty2.find((t) => /jedn\.$/.test(t))?.match(/\d+/)?.[0]);

  expect(dluzszy).toBeGreaterThan(krotszy);
});

test("po kalibracji skali etykieta w trakcie rysowania ściany pokazuje metry", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Instalacja" }).click();
  await skipEntryScreen(page);

  // kalibracja: dwa punkty, potem długość w metrach — box mierzony PO wejściu w
  // narzędzie (patrz komentarz przy `openPlan` wyżej: klik zmieniający narzędzie
  // potrafi przewinąć stronę)
  await page.getByRole("button", { name: "Kalibracja skali" }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  let box = (await page.locator("div.overflow-auto.rounded-card.border").first().boundingBox())!;
  await page.mouse.click(box.x + 100, box.y + 100);
  await page.mouse.click(box.x + 300, box.y + 100);
  await page.getByLabel("Długość odcinka w metrach").fill("4");
  await page.getByRole("button", { name: "Zatwierdź skalę" }).click();

  await page.getByRole("button", { name: "Narysuj Ścianę", exact: true }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  box = (await page.locator("div.overflow-auto.rounded-card.border").first().boundingBox())!;
  await page.mouse.click(box.x + 100, box.y + 200);
  await page.mouse.move(box.x + 300, box.y + 200, { steps: 5 });

  const teksty = await konvaTexts(page);
  expect(teksty.some((t) => /\d+,\d{2} m$/.test(t))).toBe(true);
});

test("ukończona ściana (Zakończ) zapisuje wszystkie postawione punkty", async ({ page }) => {
  const box = await openPlan(page);
  await page.mouse.click(box.x + 80, box.y + 80);
  await page.mouse.click(box.x + 250, box.y + 80);
  await page.mouse.click(box.x + 250, box.y + 220);
  await expect(page.getByText(/Rysowanie ściany: 3 pkt./)).toBeVisible();

  await page.getByRole("button", { name: "Zakończ" }).click();
  await page.waitForTimeout(900);

  const walls = await page.evaluate(() => {
    const raw = localStorage.getItem("pomocnikelektryka_projekt_autosave");
    return JSON.parse(raw!).draft.walls as { points: { x: number; y: number }[] }[];
  });
  expect(walls).toHaveLength(1);
  expect(walls[0].points).toHaveLength(3);
});

test("zmiana narzędzia w trakcie rysowania ściany porzuca zaczęty odcinek", async ({ page }) => {
  const box = await openPlan(page);
  await page.mouse.click(box.x + 80, box.y + 80);
  await page.mouse.click(box.x + 250, box.y + 80);
  await expect(page.getByText(/Rysowanie ściany: 2 pkt./)).toBeVisible();

  await page.getByRole("button", { name: "Zaznacz", exact: true }).click();
  await expect(page.getByText(/Rysowanie ściany/)).toBeHidden();

  await page.getByRole("button", { name: "Narysuj Ścianę", exact: true }).click();
  // punkty sprzed przełączenia NIE wracają — licznik startuje od zera
  await expect(page.getByText(/Rysowanie ściany/)).toBeHidden();
});

test("Enter zatwierdza rysowaną ścianę tak samo jak przycisk Zakończ", async ({ page }) => {
  const box = await openPlan(page);
  await page.mouse.click(box.x + 80, box.y + 80);
  await page.mouse.click(box.x + 250, box.y + 80);
  await page.mouse.click(box.x + 250, box.y + 220);
  await expect(page.getByText(/Rysowanie ściany: 3 pkt\./)).toBeVisible();

  await page.keyboard.press("Enter");
  await page.waitForTimeout(900);

  await expect(page.getByText(/Rysowanie ściany/)).toBeHidden();
  const walls = await page.evaluate(() => {
    const raw = localStorage.getItem("pomocnikelektryka_projekt_autosave");
    return JSON.parse(raw!).draft.walls as { points: { x: number; y: number }[] }[];
  });
  expect(walls).toHaveLength(1);
  expect(walls[0].points).toHaveLength(3);
});

test("PPM na płótnie w trakcie rysowania pokazuje „Zatwierdź ścianę” i zapisuje ją", async ({ page }) => {
  const box = await openPlan(page);
  await page.mouse.click(box.x + 80, box.y + 80);
  await page.mouse.click(box.x + 250, box.y + 80);
  await expect(page.getByText(/Rysowanie ściany: 2 pkt\./)).toBeVisible();

  await page.mouse.click(box.x + 250, box.y + 80, { button: "right" });
  const zatwierdz = page.getByText("Zatwierdź ścianę");
  await expect(zatwierdz).toBeVisible();
  await zatwierdz.click();
  await page.waitForTimeout(900);

  await expect(page.getByText(/Rysowanie ściany/)).toBeHidden();
  const walls = await page.evaluate(() => {
    const raw = localStorage.getItem("pomocnikelektryka_projekt_autosave");
    return JSON.parse(raw!).draft.walls as { points: { x: number; y: number }[] }[];
  });
  expect(walls).toHaveLength(1);
  expect(walls[0].points).toHaveLength(2);
});

test("PPM na płótnie z jednym punktem NIE pokazuje menu zatwierdzenia (nie ma czego zapisać)", async ({ page }) => {
  const box = await openPlan(page);
  await page.mouse.click(box.x + 80, box.y + 80);
  await expect(page.getByText(/Rysowanie ściany: 1 pkt\./)).toBeVisible();

  await page.mouse.click(box.x + 80, box.y + 80, { button: "right" });
  await expect(page.getByText("Zatwierdź ścianę")).toBeHidden();
});

test("grubość ustawiona przed rysowaniem trafia na zapisaną ścianę", async ({ page }) => {
  const box = await openPlan(page);
  await page.getByTestId("wall-thickness-input").fill("20");
  await page.mouse.click(box.x + 80, box.y + 80);
  await page.mouse.click(box.x + 250, box.y + 80);
  await page.getByRole("button", { name: "Zakończ" }).click();
  await page.waitForTimeout(900);

  const walls = await page.evaluate(() => {
    const raw = localStorage.getItem("pomocnikelektryka_projekt_autosave");
    return JSON.parse(raw!).draft.walls as { thickness?: number }[];
  });
  expect(walls[0].thickness).toBe(20);
});

test("rysowanie ortogonalne wymusza kąt prosty względem poprzedniego punktu", async ({ page }) => {
  const box = await openPlan(page);
  await page.getByTestId("wall-ortho-checkbox").check();
  await page.mouse.click(box.x + 100, box.y + 100);
  // drugi klik wyraźnie po skosie — bez ortho trafiłby dokładnie tu
  await page.mouse.click(box.x + 260, box.y + 180);
  await page.getByRole("button", { name: "Zakończ" }).click();
  await page.waitForTimeout(900);

  const walls = await page.evaluate(() => {
    const raw = localStorage.getItem("pomocnikelektryka_projekt_autosave");
    return JSON.parse(raw!).draft.walls as { points: { x: number; y: number }[] }[];
  });
  expect(walls).toHaveLength(1);
  const [p0, p1] = walls[0].points;
  // przesunięcie w poziomie było większe niż w pionie, więc oś Y zostaje
  // zamrożona na wartości pierwszego punktu — odcinek wychodzi idealnie poziomy
  expect(p1.y).toBe(p0.y);
  expect(p1.x).not.toBe(p0.x);
});
