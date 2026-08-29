import { test, expect } from "@playwright/test";
import { skipEntryScreen } from "./_flow";

/**
 * Rysowanie pomieszczeń: prostokąt przeciągnięciem i wielobok klikaniem z zamknięciem
 * przez przyciągnięcie do pierwszego punktu.
 *
 * Testowane e2e, bo cała logika siedzi w zdarzeniach myszy na płótnie Konvy
 * (mousedown→mousemove→mouseup kontra seria kliknięć) — tego nie da się sensownie
 * sprawdzić bez prawdziwego kursora.
 */

async function openPlan(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Instalacja" }).click();
  await skipEntryScreen(page);
  const box = (await page.locator("div.overflow-auto.rounded-card.border").first().boundingBox())!;
  await page.getByRole("button", { name: "Narysuj Pomieszczenie", exact: true }).click();
  return box;
}

/** Liczba pomieszczeń wg zakładki „Pomieszczenia (N)" w bibliotece. */
async function roomCount(page: import("@playwright/test").Page) {
  const label = await page.getByRole("button", { name: /Pomieszczenia \(\d+\)/ }).textContent();
  return Number(label!.match(/\((\d+)\)/)![1]);
}

test("wybór kształtu pojawia się dopiero po wejściu w tryb Pomieszczenie", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Instalacja" }).click();
  await skipEntryScreen(page);

  await expect(page.getByRole("button", { name: "Prostokąt" })).toBeHidden();
  await page.getByRole("button", { name: "Narysuj Pomieszczenie", exact: true }).click();
  await expect(page.getByRole("button", { name: "Prostokąt" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Wielobok" })).toBeVisible();
});

test("prostokąt powstaje przez przytrzymanie LPM i przeciągnięcie", async ({ page }) => {
  const box = await openPlan(page);
  expect(await roomCount(page)).toBe(0);

  await page.getByRole("button", { name: "Prostokąt" }).click();
  await page.mouse.move(box.x + 100, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(box.x + 260, box.y + 220, { steps: 8 });
  await page.mouse.up();

  // po puszczeniu przycisku od razu pytanie o nazwę
  await expect(page.getByText("Nazwij pomieszczenie")).toBeVisible();
  await page.getByRole("button", { name: "Dodaj pomieszczenie" }).click();

  expect(await roomCount(page)).toBe(1);
  await page.waitForTimeout(900); // debounce autozapisu (600 ms) + zapas
  const pts = await page.evaluate(() => {
    const raw = localStorage.getItem("pomocnikelektryka_projekt_autosave");
    return JSON.parse(raw!).draft.roomShapes[0].points as { x: number; y: number }[];
  });
  expect(pts).toHaveLength(4);
  // prostokąt: dwie różne wartości x i dwie różne y, boki równoległe do osi
  expect(new Set(pts.map((p) => p.x)).size).toBe(2);
  expect(new Set(pts.map((p) => p.y)).size).toBe(2);
});

/**
 * Druga, RÓWNOLEŻNA droga do prostokąta obok przytrzymania: klik stawia narożnik,
 * kolejny klik domyka figurę. Powód istnienia obu: przeciąganie przez pół ekranu
 * z wciśniętym przyciskiem jest męczące na touchpadzie, a przy dłuższym geście
 * łatwo puścić przycisk w połowie.
 */
test("prostokąt powstaje też przez dwa kliknięcia: narożnik → przeciwległy narożnik", async ({ page }) => {
  const box = await openPlan(page);
  await page.getByRole("button", { name: "Prostokąt" }).click();

  await page.mouse.click(box.x + 100, box.y + 100);
  // pierwszy klik NIE tworzy jeszcze pomieszczenia — tylko stawia narożnik
  await expect(page.getByText("Nazwij pomieszczenie")).toBeHidden();
  await expect(page.getByText(/Narożnik postawiony/)).toBeVisible();

  // podgląd musi iść za kursorem także bez wciśniętego przycisku
  await page.mouse.move(box.x + 260, box.y + 220, { steps: 6 });
  await page.mouse.click(box.x + 260, box.y + 220);

  await expect(page.getByText("Nazwij pomieszczenie")).toBeVisible();
  await page.getByRole("button", { name: "Dodaj pomieszczenie" }).click();
  expect(await roomCount(page)).toBe(1);

  await page.waitForTimeout(900);
  const pts = await page.evaluate(() => {
    const raw = localStorage.getItem("pomocnikelektryka_projekt_autosave");
    return JSON.parse(raw!).draft.roomShapes[0].points as { x: number; y: number }[];
  });
  expect(pts).toHaveLength(4);
  expect(new Set(pts.map((p) => p.x)).size).toBe(2);
  expect(new Set(pts.map((p) => p.y)).size).toBe(2);
});

test("pojedyncze kliknięcie stawia dopiero narożnik — samo z siebie nie tworzy pomieszczenia", async ({ page }) => {
  const box = await openPlan(page);
  await page.getByRole("button", { name: "Prostokąt" }).click();
  await page.mouse.click(box.x + 150, box.y + 150);
  await expect(page.getByText("Nazwij pomieszczenie")).toBeHidden();
  expect(await roomCount(page)).toBe(0);
});

test("„Anuluj” kasuje postawiony narożnik — kolejny klik zaczyna prostokąt od nowa", async ({ page }) => {
  const box = await openPlan(page);
  await page.getByRole("button", { name: "Prostokąt" }).click();

  await page.mouse.click(box.x + 100, box.y + 100);
  await expect(page.getByText(/Narożnik postawiony/)).toBeVisible();
  await page.getByRole("button", { name: "Anuluj" }).click();
  await expect(page.getByText(/Narożnik postawiony/)).toBeHidden();

  // po anulowaniu klik w INNYM miejscu zaczyna od zera, a nie domyka figurę
  // rozpiętą od skasowanego narożnika
  await page.mouse.click(box.x + 300, box.y + 260);
  await expect(page.getByText("Nazwij pomieszczenie")).toBeHidden();
  await expect(page.getByText(/Narożnik postawiony/)).toBeVisible();
});

/**
 * Regresja: Konva wysyła `click` po każdym `mouseup` na tym samym celu, więc
 * przeciągnięcie kończące prostokąt generuje też kliknięcie. Bez wygaszenia go
 * (`roomRectJustDrawnRef`) ten klik od razu stawiał narożnik NASTĘPNEGO prostokąta
 * w miejscu, w którym skończyło się przeciągnięcie.
 */
test("przeciągnięcie nie zostawia po sobie zawieszonego narożnika następnego prostokąta", async ({ page }) => {
  const box = await openPlan(page);
  await page.getByRole("button", { name: "Prostokąt" }).click();

  await page.mouse.move(box.x + 100, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(box.x + 260, box.y + 220, { steps: 8 });
  await page.mouse.up();

  await page.getByRole("button", { name: "Dodaj pomieszczenie" }).click();
  expect(await roomCount(page)).toBe(1);
  await expect(page.getByText(/Narożnik postawiony/)).toBeHidden();
});

test("wielobok zamyka się po kliknięciu w POBLIŻU pierwszego punktu", async ({ page }) => {
  const box = await openPlan(page);
  await page.getByRole("button", { name: "Wielobok" }).click();

  const start = { x: box.x + 120, y: box.y + 120 };
  await page.mouse.click(start.x, start.y);
  await page.mouse.click(box.x + 300, box.y + 130);
  await page.mouse.click(box.x + 280, box.y + 260);
  await page.mouse.click(box.x + 140, box.y + 250);

  await expect(page.getByText(/kliknij w pierwszy punkt, aby zamknąć/)).toBeVisible();

  // celowo NIE w sam punkt, tylko 6 px obok — ma zadziałać przyciąganie
  await page.mouse.click(start.x + 6, start.y + 5);

  await expect(page.getByText("Nazwij pomieszczenie")).toBeVisible();
  await page.getByRole("button", { name: "Dodaj pomieszczenie" }).click();
  expect(await roomCount(page)).toBe(1);

  await page.waitForTimeout(900); // debounce autozapisu (600 ms) + zapas
  const pts = await page.evaluate(() => {
    const raw = localStorage.getItem("pomocnikelektryka_projekt_autosave");
    return JSON.parse(raw!).draft.roomShapes[0].points as { x: number; y: number }[];
  });
  // 4 kliknięcia = 4 wierzchołki; zamykający klik NIE dokłada piątego punktu
  expect(pts).toHaveLength(4);
});

test("kliknięcie daleko od startu dokłada wierzchołek zamiast zamykać", async ({ page }) => {
  const box = await openPlan(page);
  await page.getByRole("button", { name: "Wielobok" }).click();

  await page.mouse.click(box.x + 120, box.y + 120);
  await page.mouse.click(box.x + 300, box.y + 130);
  await page.mouse.click(box.x + 280, box.y + 260);
  await page.mouse.click(box.x + 160, box.y + 200); // > promień przyciągania od startu

  await expect(page.getByText("Nazwij pomieszczenie")).toBeHidden();
  await expect(page.getByText(/^4 pkt\./)).toBeVisible();
});

test("Enter zatwierdza wielobok pomieszczenia tak samo jak przycisk Zakończ", async ({ page }) => {
  const box = await openPlan(page);
  await page.getByRole("button", { name: "Wielobok" }).click();

  await page.mouse.click(box.x + 120, box.y + 120);
  await page.mouse.click(box.x + 300, box.y + 130);
  await page.mouse.click(box.x + 280, box.y + 260);
  await expect(page.getByText(/^3 pkt\./)).toBeVisible();

  await page.keyboard.press("Enter");
  await expect(page.getByText("Nazwij pomieszczenie")).toBeVisible();
  await page.getByRole("button", { name: "Dodaj pomieszczenie" }).click();

  expect(await roomCount(page)).toBe(1);
});

test("Enter w polu nazwy zatwierdza pomieszczenie tak samo jak przycisk Dodaj pomieszczenie", async ({ page }) => {
  const box = await openPlan(page);
  await page.getByRole("button", { name: "Prostokąt" }).click();
  await page.mouse.move(box.x + 100, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(box.x + 260, box.y + 220, { steps: 8 });
  await page.mouse.up();

  const dialog = page.getByText("Nazwij pomieszczenie");
  await expect(dialog).toBeVisible();
  await page.keyboard.type(" — testowe");
  await page.keyboard.press("Enter");

  await expect(dialog).toBeHidden();
  expect(await roomCount(page)).toBe(1);
});

test("zmiana kształtu w trakcie rysowania porzuca zaczętą figurę", async ({ page }) => {
  const box = await openPlan(page);
  await page.getByRole("button", { name: "Wielobok" }).click();
  await page.mouse.click(box.x + 120, box.y + 120);
  await page.mouse.click(box.x + 300, box.y + 130);
  await expect(page.getByText(/^2 pkt\./)).toBeVisible();

  await page.getByRole("button", { name: "Prostokąt" }).click();
  await expect(page.getByText(/pkt\./)).toBeHidden();
});

/**
 * Regresja: obrys narysowanego pomieszczenia to wypełniony, zamknięty wielokąt.
 * Zanim dostał `listening={false}`, przechwytywał każdy hit-test w swoim wnętrzu
 * (Konva.Stage.getIntersection zwracał ten kształt, nie scenę) — a zaznaczanie
 * obszarem startuje tylko wtedy, gdy zdarzenie trafi w SCENĘ (`e.target === stage`).
 * Efekt: przeciąganie zaczęte w PUSTYM miejscu wewnątrz pomieszczenia w ogóle nie
 * uruchamiało marquee-select, więc nie dało się zaznaczyć elementów w środku.
 */
test("zaznaczanie obszarem działa, gdy start jest wewnątrz narysowanego pomieszczenia", async ({ page }) => {
  const box = await openPlan(page);
  await page.getByRole("button", { name: "Prostokąt" }).click();
  await page.mouse.move(box.x + 60, box.y + 60);
  await page.mouse.down();
  await page.mouse.move(box.x + 320, box.y + 260, { steps: 8 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Dodaj pomieszczenie" }).click();

  // Zakładka panelu podąża za wybranym narzędziem — po „Obrysuj pomieszczenie” panel
  // biblioteki elementów jest schowany, dopóki jawnie nie wrócimy do „Wstaw Element”.
  await page.getByRole("button", { name: "Wstaw Element" }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole("button", { name: /Gniazdo 230 V/ }).first().click();
  await page.evaluate(() => window.scrollTo(0, 0));
  const box2 = (await page.locator("div.overflow-auto.rounded-card.border").first().boundingBox())!;
  await page.mouse.click(box2.x + 150, box2.y + 130);
  await page.waitForTimeout(900);

  await page.getByRole("button", { name: "Zaznacz", exact: true }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  const box3 = (await page.locator("div.overflow-auto.rounded-card.border").first().boundingBox())!;
  const zoom = await page.evaluate(() => {
    const k = (window as unknown as { Konva?: { stages: { scaleX(): number }[] } }).Konva;
    return k?.stages[0]?.scaleX() ?? 1;
  });
  const pos = await page.evaluate(() => {
    const raw = localStorage.getItem("pomocnikelektryka_projekt_autosave");
    return JSON.parse(raw!).draft.elements[0] as { x: number; y: number };
  });
  const elAt = { x: box3.x + pos.x * zoom, y: box3.y + pos.y * zoom };

  // Punkt startowy marquee jest w PUSTYM miejscu pomieszczenia, z dala od elementu —
  // to jest dokładnie scenariusz, który wcześniej nie startował.
  await page.mouse.move(elAt.x - 60, elAt.y - 60);
  await page.mouse.down();
  await page.mouse.move(elAt.x + 60, elAt.y + 60, { steps: 10 });
  await page.mouse.up();

  // dowód zaznaczenia: skrót „R" obraca element bez klikania weń wprost
  await page.keyboard.press("r");
  await page.waitForTimeout(900);
  const rotation = await page.evaluate(() => {
    const raw = localStorage.getItem("pomocnikelektryka_projekt_autosave");
    return JSON.parse(raw!).draft.elements[0].rotation ?? 0;
  });
  expect(rotation).toBe(90);
});
