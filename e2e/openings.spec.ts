import { test, expect } from "@playwright/test";
import { skipEntryScreen } from "./_flow";

/**
 * Drzwi: lekkie narzędzie „przyklejające" otwór do najbliższego miejsca na klikniętej
 * ścianie/krawędzi pomieszczenia (patrz `nearestPointOnPolyline`). Testowane e2e, bo
 * klik w konkretny punkt ściany na płótnie Konvy nie da się odtworzyć syntetycznie —
 * ten sam powód co przy rysowaniu ścian w wall-drawing.spec.ts.
 *
 * Narzędzie stawiało kiedyś też okna — opcja okazała się niepotrzebna i została
 * usunięta (patrz `OpeningKind` w types/index.ts, tam zostaje tylko dla zgodności ze
 * starymi zapisami), więc tu testujemy już wyłącznie drzwi.
 */

async function planBox(page: import("@playwright/test").Page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  return (await page.locator("[data-testid=plan-okno]").first().boundingBox())!;
}

/** Box + powiększenie widoku — do przeliczenia punktu w JEDNOSTKACH PLANU (np.
 *  odczytanego z localStorage) na współrzędne ekranowe. Zoom bywa różny od 1 i
 *  potrafi się zmienić między krokami testu (kolejne wiersze paska narzędzi
 *  zmieniają dostępną wysokość kolumny płótna), więc stałe przesunięcie
 *  ekranowe użyte przy RYSOWANIU ściany nie musi trafiać w nią później —
 *  bezpieczniej przeliczać na nowo z aktualnym zoomem, ten sam wzorzec co
 *  `planBoxAndZoom` w wall-editing.spec.ts.  */
async function planBoxAndZoom(page: import("@playwright/test").Page) {
  const box = await planBox(page);
  const zoom = await page.evaluate(() => {
    const k = (window as unknown as { Konva?: { stages: { scaleX(): number }[] } }).Konva;
    return k?.stages[0]?.scaleX() ?? 1;
  });
  return { box, zoom };
}

async function openPlan(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Instalacja" }).click();
  await skipEntryScreen(page);
}

/** Rysuje poziomą ścianę od (100,100) do (400,100) — offsety względem świeżo
 *  zmierzonego boxa przy każdym kliknięciu (klik zmieniający narzędzie potrafi
 *  przesunąć płótno, patrz komentarze w wall-drawing.spec.ts). */
async function drawHorizontalWall(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Narysuj Ścianę", exact: true }).click();
  let box = await planBox(page);
  await page.mouse.click(box.x + 100, box.y + 100);
  box = await planBox(page);
  await page.mouse.click(box.x + 400, box.y + 100);
  await page.getByRole("button", { name: "Zakończ" }).click();
  await page.waitForTimeout(900);
}

async function projectState(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem("pomocnikelektryka_projekt_" + localStorage.getItem("pomocnikelektryka_projekt_biezacy"));
    return JSON.parse(raw!).draft;
  });
}

/** Rysuje prostokątne pomieszczenie BEZ żadnej osobnej ściany — box mierzony na nowo
 *  tuż przed przeciągnięciem, bo wejście w tryb „Pomieszczenie" dokłada nad płótnem
 *  pasek wyboru kształtu i zsuwa je w dół (ten sam wzorzec co `drawRoom` w
 *  light-groups.spec.ts). */
async function drawRectRoom(page: import("@playwright/test").Page, x1: number, y1: number, x2: number, y2: number) {
  await page.getByRole("button", { name: "Narysuj Pomieszczenie", exact: true }).click();
  await page.getByRole("button", { name: "Prostokąt" }).click();
  const box = await planBox(page);
  await page.mouse.move(box.x + x1, box.y + y1);
  await page.mouse.down();
  await page.mouse.move(box.x + x2, box.y + y2, { steps: 8 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Dodaj pomieszczenie" }).click();
}

test("kliknięcie w ścianę w trybie Drzwi dodaje otwór w najbliższym miejscu", async ({ page }) => {
  await openPlan(page);
  await drawHorizontalWall(page);

  await page.getByRole("button", { name: "Drzwi i okna", exact: true }).click();
  const box = await planBox(page);
  await page.mouse.click(box.x + 200, box.y + 100);
  await page.waitForTimeout(900);

  const draft = await projectState(page);
  expect(draft.openings).toHaveLength(1);
  const [door] = draft.openings;
  expect(door.kind).toBe("drzwi");
  // ściana jest pozioma (oba punkty mają tę samą wartość y w jedn. planu) —
  // otwór "przyklejony" do niej powinien wylądować na TEJ SAMEJ wysokości
  expect(door.angle).toBeCloseTo(0, 6);
  expect(door.wallId).toBe(draft.walls[0].id);
});

test("PPM na otworze pokazuje „Usuń otwór” i go kasuje", async ({ page }) => {
  await openPlan(page);
  await drawHorizontalWall(page);

  await page.getByRole("button", { name: "Drzwi i okna", exact: true }).click();
  const box = await planBox(page);
  await page.mouse.click(box.x + 200, box.y + 100);
  await page.waitForTimeout(900);

  expect((await projectState(page)).openings).toHaveLength(1);

  const box2 = await planBox(page);
  await page.mouse.click(box2.x + 200, box2.y + 100, { button: "right" });
  const usun = page.getByText("Usuń otwór");
  await expect(usun).toBeVisible();
  await usun.click();
  await page.waitForTimeout(900);

  expect((await projectState(page)).openings).toHaveLength(0);
});

test("usunięcie ściany kasuje też jej otwory (nie zostają osierocone)", async ({ page }) => {
  await openPlan(page);
  await drawHorizontalWall(page);

  await page.getByRole("button", { name: "Drzwi i okna", exact: true }).click();
  const box = await planBox(page);
  await page.mouse.click(box.x + 200, box.y + 100);
  await page.waitForTimeout(900);
  expect((await projectState(page)).openings).toHaveLength(1);

  // PPM na ODCINKU ściany (z dala od otworu, żeby trafić w ścianę, nie w otwór)
  await page.getByRole("button", { name: "Zaznacz", exact: true }).click();

  // Punkt na ścianie z dala od otworu (bliżej drugiego końca) — przeliczony z
  // jednostek planu na ekran z AKTUALNYM zoomem, nie ze stałego przesunięcia
  // ekranowego sprzed przełączenia narzędzia (patrz komentarz przy `planBoxAndZoom`).
  const wallPts = (await projectState(page)).walls[0].points as { x: number; y: number }[];
  const farPoint = { x: wallPts[0].x + (wallPts[1].x - wallPts[0].x) * 0.85, y: wallPts[0].y };

  // Zaznaczenie lewym kliknięciem NAJPIERW (osobno od PPM): zaznaczenie ściany
  // odsłania nowy wiersz „Grubość zaznaczonej ściany" nad płótnem, co przesuwa
  // je w dół — wykonane w tym samym geście co PPM, ten sam ruch myszy trafiał
  // już w NOWĄ pozycję i menu nie zdążyło się pokazać / zostało zamknięte.
  // Osobne kliknięcia dają layoutowi czas się ustabilizować między nimi.
  let { box: box2, zoom } = await planBoxAndZoom(page);
  await page.mouse.click(box2.x + farPoint.x * zoom, box2.y + farPoint.y * zoom);
  await page.waitForTimeout(200);

  ({ box: box2, zoom } = await planBoxAndZoom(page));
  await page.mouse.click(box2.x + farPoint.x * zoom, box2.y + farPoint.y * zoom, { button: "right" });
  const usunSciane = page.getByText("Usuń ścianę");
  await expect(usunSciane).toBeVisible();
  await usunSciane.click();
  await page.waitForTimeout(900);

  const draft = await projectState(page);
  expect(draft.walls).toHaveLength(0);
  expect(draft.openings).toHaveLength(0);
});

test("klik w krawędź pomieszczenia w trybie Drzwi dodaje otwór, gdy nie ma osobnej ściany", async ({ page }) => {
  await openPlan(page);
  await drawRectRoom(page, 100, 100, 400, 250);

  await page.getByRole("button", { name: "Drzwi i okna", exact: true }).click();
  // górna krawędź pomieszczenia jest pozioma na y=100 (jedn. planu) — klikamy blisko
  // środka górnego boku, z dala od narożników.
  const box = await planBox(page);
  await page.mouse.click(box.x + 250, box.y + 100);
  await page.waitForTimeout(900);

  const draft = await projectState(page);
  expect(draft.walls).toHaveLength(0); // celowo bez osobnej ściany — to jest sedno zgłoszenia
  expect(draft.openings).toHaveLength(1);
  expect(draft.openings[0].roomId).toBe(draft.roomShapes[0].id);
  expect(draft.openings[0].wallId).toBeUndefined();
  expect(draft.openings[0].angle).toBeCloseTo(0, 6); // krawędź pozioma
});

test("usunięcie pomieszczenia kasuje też otwory na jego krawędzi (nie zostają osierocone)", async ({ page }) => {
  await openPlan(page);
  await drawRectRoom(page, 100, 100, 400, 250);

  await page.getByRole("button", { name: "Drzwi i okna", exact: true }).click();
  let box = await planBox(page);
  await page.mouse.click(box.x + 250, box.y + 100);
  await page.waitForTimeout(900);
  expect((await projectState(page)).openings).toHaveLength(1);

  // PPM na krawędzi pomieszczenia, z DALA od otworu (x=150, nie x=250), żeby trafić
  // w krawędź, nie w otwór, który ma tam własne menu kontekstowe „Usuń otwór".
  await page.getByRole("button", { name: "Zaznacz", exact: true }).click();
  box = await planBox(page);
  await page.mouse.click(box.x + 150, box.y + 100, { button: "right" });
  const usunPomieszczenie = page.getByText("Usuń pomieszczenie");
  await expect(usunPomieszczenie).toBeVisible();
  await usunPomieszczenie.click();
  await page.waitForTimeout(900);

  const draft = await projectState(page);
  expect(draft.roomShapes).toHaveLength(0);
  expect(draft.openings).toHaveLength(0);
});

test("świeżo postawione drzwi są od razu zaznaczone — R działa BEZ dodatkowego kliknięcia", async ({ page }) => {
  await openPlan(page);
  await drawHorizontalWall(page);

  await page.getByRole("button", { name: "Drzwi i okna", exact: true }).click();
  const box = await planBox(page);
  await page.mouse.click(box.x + 200, box.y + 100);
  await page.waitForTimeout(300);

  // BEZ osobnego kliknięcia, które by je zaznaczyło — dokładnie tak, jak
  // najpierw spróbowałby użytkownik. Wcześniej `handleWallClickForOpening`
  // nie zaznaczał nowo postawionego otworu, więc `selected` wskazywał na
  // cokolwiek było zaznaczone wcześniej (często nic) i „R" nic nie robił —
  // wyglądało to, jakby obrót w ogóle nie działał.
  await page.keyboard.press("r");
  await page.waitForTimeout(900);

  expect((await projectState(page)).openings[0].flip).toBe(true);
});

test("Obrót drzwi o 180° przez menu kontekstowe i przez klawisz R", async ({ page }) => {
  await openPlan(page);
  await drawHorizontalWall(page);

  await page.getByRole("button", { name: "Drzwi i okna", exact: true }).click();
  const box = await planBox(page);
  await page.mouse.click(box.x + 200, box.y + 100);
  await page.waitForTimeout(900);
  expect((await projectState(page)).openings[0].flip).toBeFalsy();

  // PPM → „Obróć o 180°"
  const box2 = await planBox(page);
  await page.mouse.click(box2.x + 200, box2.y + 100, { button: "right" });
  const obroc = page.getByText("Obróć o 180°");
  await expect(obroc).toBeVisible();
  await obroc.click();
  await page.waitForTimeout(900);
  expect((await projectState(page)).openings[0].flip).toBe(true);

  // klawisz "R" na już zaznaczonym otworze (PPM wyżej go zaznaczył) obraca ponownie
  await page.keyboard.press("r");
  await page.waitForTimeout(900);
  expect((await projectState(page)).openings[0].flip).toBe(false);
});

/** Plan ZE SKALĄ — bez niej szerokości otworów spadają na wspólny fallback
 *  w jednostkach planu (DEFAULT_OPENING_WIDTH_UNITS) i rodzaj otworu nie ma
 *  jak wpłynąć na wymiar w centymetrach. */
async function openPlanZeSkala(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Instalacja" }).click();
  await page.getByRole("button", { name: "Narysuj dom samodzielnie" }).click();
  const rozumiem = page.getByRole("button", { name: "Rozumiem" });
  if (await rozumiem.count()) await rozumiem.click();
}

test("narzędzie stawia OKNO, gdy wybrany jest ten rodzaj — z własną szerokością domyślną", async ({ page }) => {
  await openPlanZeSkala(page);
  await drawHorizontalWall(page);

  await page.getByRole("button", { name: "Drzwi i okna", exact: true }).click();
  // Domyślnie stawiane są drzwi; okno wymaga świadomego wyboru rodzaju.
  await page.getByRole("button", { name: "Okno", exact: true }).click();
  let box = await planBox(page);
  await page.mouse.click(box.x + 200, box.y + 100);
  await page.waitForTimeout(900);

  const poOknie = await projectState(page);
  expect(poOknie.openings).toHaveLength(1);
  expect(poOknie.openings[0].kind).toBe("okno");
  const szerokoscOkna = poOknie.openings[0].width;

  // Powrót do drzwi stawia drzwi — wybór nie zostaje „na zawsze".
  await page.getByRole("button", { name: "Drzwi", exact: true }).click();
  box = await planBox(page);
  await page.mouse.click(box.x + 320, box.y + 100);
  await page.waitForTimeout(900);

  const poDrzwiach = await projectState(page);
  expect(poDrzwiach.openings).toHaveLength(2);
  const drzwi = poDrzwiach.openings.find((o: { kind: string }) => o.kind === "drzwi");
  expect(drzwi).toBeTruthy();
  // Okno jest szersze od drzwi (120 vs 90 cm) — dowód, że rodzaj wpływa na wymiar.
  expect(szerokoscOkna).toBeGreaterThan(drzwi.width);
});

test("szerokość postawionego otworu da się poprawić", async ({ page }) => {
  await openPlanZeSkala(page);
  await drawHorizontalWall(page);

  await page.getByRole("button", { name: "Drzwi i okna", exact: true }).click();
  const box = await planBox(page);
  await page.mouse.click(box.x + 200, box.y + 100);
  await page.waitForTimeout(900);

  const przed = (await projectState(page)).openings[0].width;

  // Świeżo postawiony otwór jest już zaznaczony, ale pole szerokości mieszka
  // w trybie „Zaznacz" — tak jak grubość zaznaczonej ściany.
  await page.getByRole("button", { name: "Zaznacz", exact: true }).click();
  const pole = page.getByTestId("opening-width-input");
  await expect(pole).toBeVisible();
  await pole.fill("200"); // drzwi balkonowe / brama
  await page.waitForTimeout(900);

  const po = (await projectState(page)).openings[0].width;
  expect(po).toBeGreaterThan(przed);
});

/**
 * Lustro: drzwi prawe zamiast lewych, przy TYM SAMYM kierunku otwierania.
 *
 * Obrót o 180° zamienia obie rzeczy naraz — stronę zawiasu i stronę, w którą skrzydło
 * się otwiera — więc samym obrotem da się ustawić tylko dwa z czterech wariantów drzwi.
 * Stolarz nazywa je prawymi i lewymi, i to jest wybór niezależny od tego, czy drzwi
 * otwierają się do pokoju, czy z pokoju.
 *
 * Sprawdzane na GLIFIE, nie na samym zapisie: pole w projekcie może się zmienić, a
 * rysunek zostać ten sam, i to właśnie rysunek jest tu treścią.
 */
async function skrzydlo(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const stage = (
      window as unknown as { Konva: { stages: { find(sel: string): { strokeWidth(): number; points(): number[] }[] }[] } }
    ).Konva.stages[0];
    // Linia skrzydła: jedyna o grubości 1.5 w glifie drzwi (łuk ma 1, ściany więcej).
    const linia = stage.find("Line").find((l) => Math.abs(l.strokeWidth() - 1.5) < 0.01);
    if (!linia) return null;
    const [x1, y1, x2, y2] = linia.points();
    return { zawias: { x: x1, y: y1 }, kierunek: { x: x2 - x1, y: y2 - y1 } };
  });
}

test("„Lustro” przenosi zawias na drugi koniec, nie zmieniając strony otwierania", async ({ page }) => {
  await openPlan(page);
  await drawHorizontalWall(page);

  await page.getByRole("button", { name: "Drzwi i okna", exact: true }).click();
  const box = await planBox(page);
  await page.mouse.click(box.x + 200, box.y + 100);
  await page.waitForTimeout(900);

  const przed = await skrzydlo(page);
  expect(przed, "drzwi mają się narysować").not.toBeNull();

  const box2 = await planBox(page);
  await page.mouse.click(box2.x + 200, box2.y + 100, { button: "right" });
  const lustro = page.getByText("Lustro (prawe/lewe)");
  await expect(lustro).toBeVisible();
  await lustro.click();
  await page.waitForTimeout(900);

  expect((await projectState(page)).openings[0].lustro).toBe(true);

  const po = await skrzydlo(page);
  expect(po).not.toBeNull();

  // ZAWIAS przeskoczył na drugi koniec otworu.
  const przesuniecieZawiasu = Math.hypot(po!.zawias.x - przed!.zawias.x, po!.zawias.y - przed!.zawias.y);
  const szerokosc = (await projectState(page)).openings[0].width;
  expect(przesuniecieZawiasu, "zawias ma stanąć na drugim końcu otworu").toBeCloseTo(szerokosc, 1);

  // A strona otwierania ZOSTAŁA ta sama — to jest cała różnica wobec obrotu o 180°.
  expect(po!.kierunek.x).toBeCloseTo(przed!.kierunek.x, 6);
  expect(po!.kierunek.y).toBeCloseTo(przed!.kierunek.y, 6);
});

test("okno nie dostaje opcji lustra — nie ma czego odbijać", async ({ page }) => {
  await openPlan(page);
  await drawHorizontalWall(page);

  await page.getByRole("button", { name: "Drzwi i okna", exact: true }).click();
  await page.getByRole("button", { name: "Okno", exact: true }).click();
  const box = await planBox(page);
  await page.mouse.click(box.x + 200, box.y + 100);
  await page.waitForTimeout(900);
  expect((await projectState(page)).openings[0].kind).toBe("okno");

  const box2 = await planBox(page);
  await page.mouse.click(box2.x + 200, box2.y + 100, { button: "right" });
  await expect(page.getByText("Obróć o 180°")).toBeVisible();
  await expect(page.getByText("Lustro (prawe/lewe)")).toHaveCount(0);
});
