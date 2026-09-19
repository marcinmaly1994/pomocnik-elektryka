import { test, expect, type Page } from "@playwright/test";
import { skipEntryScreen } from "./_flow";

/**
 * Poprawianie długości ściany JUŻ NARYSOWANEJ.
 *
 * Wpisywanie wymiaru w trakcie rysowania pomaga temu, kto wie z góry, ile ma mieć.
 * Pomyłkę zauważa się zwykle później — przy kosztorysie albo przy sąsiednim pokoju —
 * i dotąd jedyną drogą było przeciąganie narożnika myszą.
 *
 * Zaznaczanie ściany idzie tą samą drogą co w `wall-editing.spec.ts`: rysujemy ją,
 * przełączamy na „Zaznacz" i klikamy w jej odcinek. Bez żadnych haków w kodzie
 * produkcyjnym — test ma przechodzić tą samą ścieżką co człowiek.
 */

async function planBoxAndZoom(page: Page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  const box = (await page.locator("[data-testid=plan-okno]").first().boundingBox())!;
  const zoom = await page.evaluate(() => {
    const k = (window as unknown as { Konva?: { stages: { scaleX(): number }[] } }).Konva;
    return k?.stages[0]?.scaleX() ?? 1;
  });
  return { box, zoom };
}

async function openPlan(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Instalacja" }).click();
  await skipEntryScreen(page);
}

async function wallPoints(page: Page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem(
      "pomocnikelektryka_projekt_" + localStorage.getItem("pomocnikelektryka_projekt_biezacy"),
    );
    return JSON.parse(raw!).draft.walls[0].points as { x: number; y: number }[];
  });
}

/** Rysuje ścianę po podanych punktach ekranu; `domknij` klika w pierwszy punkt,
 *  co zamyka łamaną tak, jak powstaje obrys domu. */
async function narysujSciane(page: Page, punkty: [number, number][], domknij = false) {
  await page.getByRole("button", { name: "Narysuj Ścianę", exact: true }).click();
  for (const [dx, dy] of punkty) {
    const { box } = await planBoxAndZoom(page);
    await page.mouse.click(box.x + dx, box.y + dy);
  }
  if (domknij) {
    const { box } = await planBoxAndZoom(page);
    await page.mouse.click(box.x + punkty[0][0], box.y + punkty[0][1]);
  } else {
    await page.getByRole("button", { name: "Zakończ" }).click();
  }
  await page.waitForTimeout(900);
}

/** Zaznacza ścianę klikając w środek jej pierwszego odcinka — dopiero to pokazuje
 *  pasek z grubością i długościami. */
async function zaznaczPierwszaSciane(page: Page) {
  await page.getByRole("button", { name: "Zaznacz", exact: true }).click();
  const punkty = await wallPoints(page);
  const { box, zoom } = await planBoxAndZoom(page);
  const sx = ((punkty[0].x + punkty[1].x) / 2) * zoom;
  const sy = ((punkty[0].y + punkty[1].y) / 2) * zoom;
  await page.mouse.click(box.x + sx, box.y + sy);
}

test("zmiana długości odcinka przesuwa TYLKO jego punkt końcowy", async ({ page }) => {
  await openPlan(page);
  await narysujSciane(page, [
    [100, 100],
    [250, 100],
  ]);
  const przed = await wallPoints(page);

  await zaznaczPierwszaSciane(page);
  const pole = page.getByTestId("wall-segment-1-length-input");
  await expect(pole).toBeVisible();

  const dlugoscPrzed = Number((await pole.inputValue()).replace(",", "."));
  await pole.fill(String(dlugoscPrzed / 2));
  await pole.press("Enter");
  await page.waitForTimeout(900);

  const po = await wallPoints(page);
  // Punkt POCZĄTKOWY nietknięty — przesuwa się wyłącznie koniec odcinka.
  expect(po[0]).toEqual(przed[0]);
  // Odcinek faktycznie krótszy, a kierunek ten sam (był poziomy i ma taki zostać).
  const dlugoscPo = Math.hypot(po[1].x - po[0].x, po[1].y - po[0].y);
  const przedDl = Math.hypot(przed[1].x - przed[0].x, przed[1].y - przed[0].y);
  expect(dlugoscPo).toBeLessThan(przedDl);
  expect(po[1].y).toBeCloseTo(po[0].y, 6);
});

test("obrys zamknięty nie pozwala edytować odcinka domykającego", async ({ page }) => {
  await openPlan(page);
  await narysujSciane(
    page,
    [
      [100, 100],
      [300, 100],
      [300, 260],
      [100, 260],
    ],
    true,
  );

  const punkty = await wallPoints(page);
  const a = punkty[0];
  const b = punkty[punkty.length - 1];
  expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeLessThan(0.001);
  const odcinkow = punkty.length - 1;

  await zaznaczPierwszaSciane(page);

  // Pól jest o JEDNO MNIEJ niż odcinków: ostatni domyka figurę, więc jego długość
  // wynika z położenia pozostałych punktów. Pole do wpisania otwierałoby obrys po cichu.
  await expect(page.getByTestId(`wall-segment-${odcinkow - 1}-length-input`)).toBeVisible();
  await expect(page.getByTestId(`wall-segment-${odcinkow}-length-input`)).toBeHidden();
  await expect(page.getByText(/ostatni odcinek domyka obrys/)).toBeVisible();
});
