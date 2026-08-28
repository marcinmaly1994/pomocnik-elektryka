import { test, expect } from "@playwright/test";

/**
 * Poglądowe trasy przewodów (rozdzielnica → punkt), patrz `buildCableRoutes` w
 * lib/panel/loads.ts. Testowane e2e (nie tylko jednostkowo tę funkcję), bo wartość
 * leży w spięciu trzech rzeczy: obliczenia, przełącznika widoczności w pasku edytora
 * i FAKTYCZNEGO narysowania linii na scenie Konvy.
 */

async function openPlan(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const pomin = page.getByRole("button", { name: "Pomiń — ustawię później" });
  if (await pomin.count()) await pomin.click();
  await page.getByRole("button", { name: "Instalacja" }).click();
  await page.getByRole("button", { name: "Narysuj dom samodzielnie" }).first().click();
  const rozumiem = page.getByRole("button", { name: "Rozumiem" });
  if (await rozumiem.count()) await rozumiem.click();
}

async function planBox(page: import("@playwright/test").Page) {
  const wrap = page.locator("div.overflow-auto.rounded-card.border").first();
  await wrap.evaluate((e) => {
    e.scrollIntoView({ block: "start" });
    e.scrollTo(0, 0);
  });
  return (await wrap.boundingBox())!;
}

/** Trasy przewodów są JEDYNYMI liniami na scenie z `opacity=0.9` w trybie „Zaznacz"
 *  bez aktywnego rysowania ściany (podgląd rysowanej ściany też ma stałe opacity, ale
 *  tylko w trakcie rysowania) — więc to bezpieczniejszy znacznik niż sam kolor obwodu
 *  (`colorForCircuit` reużywa np. `#2D5A8C` gdzie indziej na płótnie). Zwraca liczbę
 *  tras CIĄGŁYCH (routowanych wzdłuż ścian) i PRZERYWANYCH (zapasowy szacunek
 *  Manhattan) osobno — patrz `viaWalls` w `CableRoute`. */
async function routeLineCounts(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const konva = (
      window as unknown as { Konva?: { stages: { find(sel: string): { dash(): number[] | undefined; opacity(): number }[] }[] } }
    ).Konva;
    const stage = konva?.stages?.[0];
    if (!stage) return { solid: -1, dashed: -1 };
    const routeLines = stage.find("Line").filter((l) => Math.abs(l.opacity() - 0.9) < 0.01);
    const dashed = routeLines.filter((l) => (l.dash()?.length ?? 0) > 0).length;
    return { solid: routeLines.length - dashed, dashed };
  });
}

test("bez rozdzielnicy na planie przełącznik nic nie rysuje", async ({ page }) => {
  await openPlan(page);
  await page.getByRole("button", { name: /Gniazdo 230 V/ }).first().click();
  const box = await planBox(page);
  await page.mouse.click(box.x + 150, box.y + 100);
  await page.waitForTimeout(300);

  await page.getByRole("button", { name: "Pokaż trasy przewodów" }).click();
  await page.waitForTimeout(300);
  expect(await routeLineCounts(page)).toEqual({ solid: 0, dashed: 0 });
});

test("rozdzielnica + gniazdo + lampa BEZ ścian: przełącznik rysuje dwie trasy, przerywane (szacunek Manhattan), domyślnie ukryte", async ({ page }) => {
  await openPlan(page);

  await page.getByRole("button", { name: /Rozdział/ }).click();
  await page.getByRole("button", { name: /^Rozdzielnica$/ }).last().click();
  let box = await planBox(page);
  await page.mouse.click(box.x + 60, box.y + 60);

  await page.getByRole("button", { name: /Gniazda i zasilanie/ }).click();
  await page.getByRole("button", { name: /Gniazdo 230 V/ }).first().click();
  box = await planBox(page);
  await page.mouse.click(box.x + 250, box.y + 80);

  await page.getByRole("button", { name: /Oświetlenie/ }).first().click();
  await page.getByRole("button", { name: /Punkt sufitowy/ }).click();
  box = await planBox(page);
  await page.mouse.click(box.x + 150, box.y + 130);
  await page.waitForTimeout(300);

  await page.getByRole("button", { name: "Zaznacz", exact: true }).click();

  // domyślnie WYŁĄCZONE — to warstwa poglądowa, nie ma się narzucać od razu
  expect(await routeLineCounts(page)).toEqual({ solid: 0, dashed: 0 });

  await page.getByRole("button", { name: "Pokaż trasy przewodów" }).click();
  await page.waitForTimeout(300);
  // bez ścian/pomieszczeń na planie nie ma po czym routować — obie trasy
  // spadają na zapasowy szacunek Manhattan (przerywane)
  expect(await routeLineCounts(page)).toEqual({ solid: 0, dashed: 2 });

  // ponowne kliknięcie chowa trasy z powrotem
  await page.getByRole("button", { name: "Ukryj trasy przewodów" }).click();
  await page.waitForTimeout(300);
  expect(await routeLineCounts(page)).toEqual({ solid: 0, dashed: 0 });
});

test("trasa jest w KOLORZE POMIESZCZENIA punktu docelowego, nie w kolorze rodzaju obwodu", async ({ page }) => {
  await openPlan(page);

  // Dwa osobne pomieszczenia — drugie dostaje ROOM_COLORS[1] ("#C1793F"), CELOWO
  // inny niż colorForCircuit("gniazdko") ("#2D5A8C", który akurat pokrywa się z
  // ROOM_COLORS[0]) — inaczej test przechodziłby nawet, gdyby kolorowanie po
  // pomieszczeniu w ogóle nie działało i została stara wersja po rodzaju obwodu.
  await page.getByRole("button", { name: "Narysuj Pomieszczenie", exact: true }).click();
  await page.getByRole("button", { name: "Prostokąt" }).click();
  let box = await planBox(page);
  await page.mouse.move(box.x + 60, box.y + 60);
  await page.mouse.down();
  await page.mouse.move(box.x + 180, box.y + 160, { steps: 6 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Dodaj pomieszczenie" }).click();

  await page.getByRole("button", { name: "Prostokąt" }).click();
  box = await planBox(page);
  await page.mouse.move(box.x + 260, box.y + 60);
  await page.mouse.down();
  await page.mouse.move(box.x + 380, box.y + 160, { steps: 6 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Dodaj pomieszczenie" }).click();
  await page.waitForTimeout(900); // debounce autozapisu (600 ms) + zapas

  const roomColors = await page.evaluate(() => {
    const raw = localStorage.getItem("pomocnikelektryka_projekt_autosave");
    return JSON.parse(raw!).draft.roomShapes.map((r: { color: string }) => r.color);
  });
  expect(roomColors[1]).toBe("#C1793F");

  await page.getByRole("button", { name: "Wstaw Element" }).click();
  await page.getByRole("button", { name: /Rozdział/ }).click();
  await page.getByRole("button", { name: /^Rozdzielnica$/ }).last().click();
  box = await planBox(page);
  await page.mouse.click(box.x + 100, box.y + 100); // wewnątrz pierwszego pomieszczenia

  await page.getByRole("button", { name: /Gniazda i zasilanie/ }).click();
  await page.getByRole("button", { name: /Gniazdo 230 V/ }).first().click();
  box = await planBox(page);
  await page.mouse.click(box.x + 320, box.y + 100); // wewnątrz DRUGIEGO pomieszczenia
  await page.waitForTimeout(300);

  await page.getByRole("button", { name: "Zaznacz", exact: true }).click();
  await page.getByRole("button", { name: "Pokaż trasy przewodów" }).click();
  await page.waitForTimeout(300);

  const strokes = await page.evaluate(() => {
    const konva = (window as unknown as { Konva?: { stages: { find(sel: string): { opacity(): number; stroke(): string }[] }[] } }).Konva;
    const stage = konva?.stages?.[0];
    return stage?.find("Line").filter((l) => Math.abs(l.opacity() - 0.9) < 0.01).map((l) => l.stroke()) ?? [];
  });
  expect(strokes).toEqual(["#C1793F"]);
});

test("rozdzielnica i gniazdo połączone ścianą: trasa jest CIĄGŁA (routowana), nie przerywana", async ({ page }) => {
  await openPlan(page);

  // ściana pozioma — rozdzielnica i gniazdo staną blisko obu jej końców
  await page.getByRole("button", { name: "Narysuj Ścianę", exact: true }).click();
  let box = await planBox(page);
  await page.mouse.click(box.x + 60, box.y + 80);
  box = await planBox(page);
  await page.mouse.click(box.x + 300, box.y + 80);
  await page.getByRole("button", { name: "Zakończ" }).click();

  await page.getByRole("button", { name: /Rozdział/ }).click();
  await page.getByRole("button", { name: /^Rozdzielnica$/ }).last().click();
  box = await planBox(page);
  await page.mouse.click(box.x + 60, box.y + 60);

  await page.getByRole("button", { name: /Gniazda i zasilanie/ }).click();
  await page.getByRole("button", { name: /Gniazdo 230 V/ }).first().click();
  box = await planBox(page);
  await page.mouse.click(box.x + 300, box.y + 110);
  await page.waitForTimeout(300);

  await page.getByRole("button", { name: "Zaznacz", exact: true }).click();
  await page.getByRole("button", { name: "Pokaż trasy przewodów" }).click();
  await page.waitForTimeout(300);
  expect(await routeLineCounts(page)).toEqual({ solid: 1, dashed: 0 });
});
