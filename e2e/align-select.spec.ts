import { test, expect, type Page } from "@playwright/test";

/**
 * Operacje na zaznaczeniu wielokrotnym: wyrównanie, rozłożenie, duplikowanie
 * i przesuwanie strzałkami.
 *
 * Sama arytmetyka ma testy jednostkowe (`lib/align.ts`). Tutaj chodzi o spięcie:
 * czy przyciski są tam, gdzie ich szukać, czy skróty działają na zaznaczeniu z planu
 * i — najważniejsze — czy te ruchy przechodzą TĄ SAMĄ drogą co przeciągnięcie myszą,
 * łącznie z przeliczeniem przypisania do pomieszczenia.
 */

async function planBox(page: Page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  return (await page.locator("div.overflow-auto.rounded-card.border").first().boundingBox())!;
}

async function pustyProjekt(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByText("Zacznij projektować instalację")).toBeVisible();
  await page.getByRole("button", { name: "Narysuj dom samodzielnie" }).click();
  const rozumiem = page.getByRole("button", { name: "Rozumiem" });
  if (await rozumiem.count()) await rozumiem.click();
}

/** Trzy gniazdka na różnych wysokościach — celowo „na oko", jak stawia je użytkownik. */
async function postawTrzyNierowno(page: Page) {
  await page.getByRole("button", { name: "Wstaw Element" }).click();
  await page.getByRole("button", { name: /Gniazdo 230 V/ }).click();
  for (const [x, y] of [
    [150, 200],
    [250, 215],
    [400, 190],
  ]) {
    const box = await planBox(page);
    await page.mouse.click(box.x + x, box.y + y);
  }
  await page.waitForTimeout(900);
}

/** Zaznacza wszystkie trzy ramką. */
async function zaznaczRamka(page: Page) {
  await page.getByRole("button", { name: "Zaznacz", exact: true }).click();
  const box = await planBox(page);
  await page.mouse.move(box.x + 100, box.y + 150);
  await page.mouse.down();
  await page.mouse.move(box.x + 460, box.y + 260, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByText(/Zaznaczono: 3/)).toBeVisible();
}

async function gniazdka(page: Page) {
  await page.waitForTimeout(900);
  return page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem("pomocnikelektryka_projekt_autosave")!).draft;
    return d.elements
      .filter((e: { type: string }) => e.type === "gniazdko")
      .map((e: { x: number; y: number; room: string }) => ({ x: Math.round(e.x), y: Math.round(e.y), room: e.room }));
  });
}

test("wyrównanie do góry sprowadza rząd gniazdek do jednej linii", async ({ page }) => {
  await pustyProjekt(page);
  await postawTrzyNierowno(page);

  const przed = await gniazdka(page);
  expect(new Set(przed.map((e: { y: number }) => e.y)).size).toBeGreaterThan(1);

  await zaznaczRamka(page);
  await page.getByRole("button", { name: "Wyrównaj do góry" }).click();

  const po = await gniazdka(page);
  expect(new Set(po.map((e: { y: number }) => e.y)).size).toBe(1);
  // X-y zostają nietknięte — wyrównanie działa na jednej osi.
  expect(po.map((e: { x: number }) => e.x)).toEqual(przed.map((e: { x: number }) => e.x));
});

test("rozłożenie równomierne daje równe odstępy, skrajne zostają na miejscu", async ({ page }) => {
  await pustyProjekt(page);
  await postawTrzyNierowno(page);
  const przed = await gniazdka(page);

  await zaznaczRamka(page);
  await page.getByRole("button", { name: "Rozłóż równomiernie w poziomie" }).click();

  const po = (await gniazdka(page)).sort((a: { x: number }, b: { x: number }) => a.x - b.x);
  const xs = po.map((e: { x: number }) => e.x);
  const skrajne = przed.map((e: { x: number }) => e.x).sort((a: number, b: number) => a - b);
  expect(xs[0]).toBe(skrajne[0]);
  expect(xs[2]).toBe(skrajne[2]);
  // Odstępy równe z dokładnością do zaokrąglenia do pełnych jednostek.
  expect(Math.abs(xs[1] - xs[0] - (xs[2] - xs[1]))).toBeLessThanOrEqual(1);
});

test("przyciski rozkładania pojawiają się dopiero przy trzech elementach", async ({ page }) => {
  await pustyProjekt(page);
  await postawTrzyNierowno(page);

  // Ramka obejmująca tylko dwa pierwsze gniazdka.
  await page.getByRole("button", { name: "Zaznacz", exact: true }).click();
  const box = await planBox(page);
  await page.mouse.move(box.x + 100, box.y + 150);
  await page.mouse.down();
  await page.mouse.move(box.x + 300, box.y + 260, { steps: 6 });
  await page.mouse.up();

  await expect(page.getByText(/Zaznaczono: 2/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Wyrównaj do góry" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Rozłóż równomiernie w poziomie" })).toHaveCount(0);
});

test("strzałka przesuwa zaznaczenie, a Shift przesuwa o całą kratkę", async ({ page }) => {
  await pustyProjekt(page);
  await postawTrzyNierowno(page);
  await zaznaczRamka(page);

  const przed = await gniazdka(page);
  await page.keyboard.press("ArrowRight");
  const poJednej = await gniazdka(page);
  expect(poJednej[0].x - przed[0].x).toBe(1);

  await page.keyboard.press("Shift+ArrowRight");
  const poKratce = await gniazdka(page);
  expect(poKratce[0].x - poJednej[0].x).toBe(20); // GRID
});

test("Ctrl+D duplikuje zaznaczenie i przenosi zaznaczenie na kopie", async ({ page }) => {
  await pustyProjekt(page);
  await postawTrzyNierowno(page);
  await zaznaczRamka(page);

  await page.keyboard.press("Control+d");
  await expect(page.getByText(/Zaznaczono: 3/)).toBeVisible();
  expect(await gniazdka(page)).toHaveLength(6);

  // Kolejne Ctrl+D robi rząd, bo zaznaczenie poszło na świeże kopie.
  await page.keyboard.press("Control+d");
  expect(await gniazdka(page)).toHaveLength(9);
});

test("wyrównanie przelicza przypisanie do pomieszczenia, tak jak przeciągnięcie myszą", async ({ page }) => {
  await pustyProjekt(page);

  // Pomieszczenie zajmujące GÓRNĄ część planu — gniazdka stoją pod nim.
  await page.getByRole("button", { name: "Narysuj Pomieszczenie", exact: true }).click();
  await page.getByRole("button", { name: "Prostokąt" }).click();
  let box = await planBox(page);
  await page.mouse.move(box.x + 100, box.y + 80);
  await page.mouse.down();
  await page.mouse.move(box.x + 460, box.y + 170, { steps: 8 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Dodaj pomieszczenie" }).click();

  // Jedno gniazdko W pomieszczeniu, dwa wyraźnie pod nim.
  await page.getByRole("button", { name: "Wstaw Element" }).click();
  await page.getByRole("button", { name: /Gniazdo 230 V/ }).click();
  for (const [x, y] of [
    [150, 120],
    [250, 300],
    [350, 320],
  ]) {
    box = await planBox(page);
    await page.mouse.click(box.x + x, box.y + y);
  }

  const przed = await gniazdka(page);
  expect(przed.filter((e: { room: string }) => e.room === "Bez pomieszczenia")).toHaveLength(2);

  await page.getByRole("button", { name: "Zaznacz", exact: true }).click();
  box = await planBox(page);
  // Start ramki WYRAŹNIE poza obrysem pomieszczenia: jego krawędź ma szeroki obszar
  // klikalny (patrz `hitStrokeWidth` w DesignCanvas), więc wciśnięcie przycisku
  // dokładnie na niej zaznacza pomieszczenie zamiast zacząć zaznaczanie obszarem.
  await page.mouse.move(box.x + 60, box.y + 50);
  await page.mouse.down();
  await page.mouse.move(box.x + 480, box.y + 360, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByText(/Zaznaczono: 3/)).toBeVisible();

  // Wyrównanie do góry wciąga dolne gniazdka w obrys pomieszczenia — a wtedy MUSZĄ
  // dostać jego nazwę, inaczej trafią do złego obwodu w rozdzielnicy.
  await page.getByRole("button", { name: "Wyrównaj do góry" }).click();

  const po = await gniazdka(page);
  expect(po.filter((e: { room: string }) => e.room === "Bez pomieszczenia")).toHaveLength(0);
  expect(new Set(po.map((e: { room: string }) => e.room)).size).toBe(1);
});
