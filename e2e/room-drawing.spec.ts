import { test, expect } from "@playwright/test";
import { otworzMenuPaska, skipEntryScreen, zamknijMenuPaska } from "./_flow";

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
  const box = (await page.locator("[data-testid=plan-okno]").first().boundingBox())!;
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
/**
 * Cała geometria tego testu w JEDNOSTKACH PLANU, nie w pikselach okna.
 *
 * Kluczowy jest odstęp startu ramki od elementu: ma być „w pustym miejscu, z dala od
 * symbolu". Liczony w pikselach znaczył co innego przy każdym powiększeniu — przy
 * skali rysowania 40 px/m dawne 60 px to 30 jedn., czyli mniej więcej tyle, ile sięga
 * sam symbol gniazdka (~18 jedn. od środka plus trzonek). Przeciągnięcie chwytało
 * wtedy element i przesuwało go, zamiast zacząć zaznaczanie.
 */
const ZAZNACZANIE = {
  pokoj: { lewa: 40, gora: 40, prawa: 400, dol: 260 },
  element: { x: 220, y: 150 },
  /** Odstęp rogu ramki od elementu [jedn. planu] — z zapasem poza symbol. */
  odstep: 70,
};

test("zaznaczanie obszarem działa, gdy start jest wewnątrz narysowanego pomieszczenia", async ({ page }) => {
  await openPlan(page);
  await page.getByRole("button", { name: "Prostokąt" }).click();
  const rogA = await wspolrzedneWPlanie(page, ZAZNACZANIE.pokoj.lewa, ZAZNACZANIE.pokoj.gora);
  const rogB = await wspolrzedneWPlanie(page, ZAZNACZANIE.pokoj.prawa, ZAZNACZANIE.pokoj.dol);
  await page.mouse.move(rogA.x, rogA.y);
  await page.mouse.down();
  await page.mouse.move(rogB.x, rogB.y, { steps: 8 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Dodaj pomieszczenie" }).click();

  // Zakładka panelu podąża za wybranym narzędziem — po „Obrysuj pomieszczenie” panel
  // biblioteki elementów jest schowany, dopóki jawnie nie wrócimy do „Wstaw Element”.
  await page.getByRole("button", { name: "Wstaw Element" }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole("button", { name: /Gniazdo 230 V/ }).first().click();
  const gdzieElement = await wspolrzedneWPlanie(page, ZAZNACZANIE.element.x, ZAZNACZANIE.element.y);
  await page.mouse.click(gdzieElement.x, gdzieElement.y);
  await page.waitForTimeout(900);

  await page.getByRole("button", { name: "Zaznacz", exact: true }).click();

  // Punkt startowy ramki jest w PUSTYM miejscu pomieszczenia, z dala od elementu —
  // to jest dokładnie scenariusz, który wcześniej nie startował.
  const { x, y } = ZAZNACZANIE.element;
  const o = ZAZNACZANIE.odstep;
  const start = await wspolrzedneWPlanie(page, x - o, y - o);
  const koniec = await wspolrzedneWPlanie(page, x + o, y + o);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(koniec.x, koniec.y, { steps: 10 });
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

/**
 * Escape ma porzucać ZACZĘTY prostokąt — także ten, którego jeszcze nie zatwierdzono.
 *
 * Podgląd prostokąta (i ramka zaznaczania) żyją w stanie LOKALNYM `DesignCanvas`,
 * bo zmieniają się przy każdym ruchu myszy, a Escape obsługuje `DesignTab`. Przez to
 * czyszczenie stanu rodzica nie dotykało tego, co widać: obszar zostawał narysowany
 * na ekranie mimo wciśniętego Escape. Płótno dostało na to osobny kanał
 * (`anulujPodgladRef`) i te testy pilnują OBU dróg rysowania prostokąta.
 */

/** Prostokąty podglądu na scenie — półprzezroczyste wypełnienie miedzią, wyłącznie
 *  dla figury RYSOWANEJ (zatwierdzone pomieszczenie ma kolor własny). */
async function previewRects(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const k = (window as unknown as { Konva?: { stages: { find(s: string): { fill(): string }[] }[] } }).Konva;
    return (k?.stages[0]?.find("Rect") ?? []).filter((r) => r.fill() === "#C1793F1A").length;
  });
}

test("Escape porzuca prostokąt zaczęty pierwszym kliknięciem (tryb dwóch kliknięć)", async ({ page }) => {
  const box = await openPlan(page);

  await page.mouse.click(box.x + 120, box.y + 100); // kotwica
  await page.mouse.move(box.x + 320, box.y + 260); // podgląd rozciąga się za kursorem
  expect(await previewRects(page)).toBe(1);

  await page.keyboard.press("Escape");

  expect(await previewRects(page)).toBe(0);
  expect(await roomCount(page)).toBe(0);
});

test("Escape w trakcie przeciągania porzuca prostokąt, a puszczenie myszy NIE tworzy pomieszczenia", async ({ page }) => {
  const box = await openPlan(page);

  await page.mouse.move(box.x + 120, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(box.x + 320, box.y + 260, { steps: 10 });
  expect(await previewRects(page)).toBe(1);

  // Escape z WCIĄŻ wciśniętym przyciskiem myszy — bez wyczyszczenia kotwicy
  // późniejsze `mouseup` i tak zakładało pomieszczenie, mimo anulowania.
  await page.keyboard.press("Escape");
  expect(await previewRects(page)).toBe(0);

  await page.mouse.up();
  await page.waitForTimeout(300);
  expect(await roomCount(page)).toBe(0);
  expect(await previewRects(page)).toBe(0);
});

test("po anulowaniu Escape kolejne kliknięcie normalnie zaczyna nowy prostokąt", async ({ page }) => {
  const box = await openPlan(page);

  await page.mouse.click(box.x + 120, box.y + 100);
  await page.mouse.move(box.x + 320, box.y + 260);
  await page.keyboard.press("Escape");

  // Anulowanie przerwanego PRZECIĄGANIA zjada echo kliknięcia (patrz
  // `roomRectJustDrawnRef`); anulowanie w trybie dwóch kliknięć nie ma prawa zjeść
  // następnego, całkiem już zamierzonego kliknięcia użytkownika.
  await page.mouse.click(box.x + 140, box.y + 120);
  await page.mouse.move(box.x + 300, box.y + 240);
  expect(await previewRects(page)).toBe(1);
});

/**
 * Rysowanie pomieszczenia PRZY już istniejącym.
 *
 * Krawędź narysowanego pokoju ma szeroki `hitStrokeWidth` (14 jedn.) i w trybie
 * „pomieszczenie" łapała kliknięcia: punkty stawiane na wspólnej ścianie znikały,
 * a figury nie dawało się domknąć. Zmierzone przed poprawką: z pięciu kliknięć wzdłuż
 * wspólnej krawędzi rejestrowały się dwa i rysowanie zostawało w zawieszeniu.
 */
async function wspolrzedneWPlanie(page: import("@playwright/test").Page, x: number, y: number) {
  await page.evaluate(() => window.scrollTo(0, 0));
  const box = (await page.locator("[data-testid=plan-okno]").first().boundingBox())!;
  // Kadr planu bywa przesunięty (widok startowy siada na rysunku, a użytkownik może
  // go przesunąć), więc samo powiększenie nie wystarcza: punkt planu ląduje na ekranie
  // tam, gdzie stoi SCENA. Bez składnika `x()`/`y()` ten przelicznik trafiał dobrze
  // tylko przy kadrze w zerze.
  const scena = await page.evaluate(() => {
    const k = (window as unknown as { Konva: { stages: { scaleX(): number; x(): number; y(): number }[] } }).Konva;
    const s = k.stages[0];
    return { skala: s.scaleX(), x: s.x(), y: s.y() };
  });
  return { x: box.x + x * scena.skala + scena.x, y: box.y + y * scena.skala + scena.y };
}

async function zapisanePokoje(page: import("@playwright/test").Page) {
  await page.waitForTimeout(900); // debounce autozapisu
  return page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("pomocnikelektryka_projekt_autosave")!).draft.roomShapes as {
        points: { x: number; y: number }[];
      }[]
  );
}

/**
 * Dwa pokoje obok siebie, w GRANICACH startowego kadru.
 *
 * Rysowanie od zera otwiera się w skali 40 px na metr (patrz `PIKSELI_NA_METR_RYSOWANIA`),
 * więc okno pokazuje około 24 × 15 m. Wcześniejsza para sięgała do 35 m i drugi róg
 * przeciągnięcia wypadał poza płótno — obrys w ogóle nie powstawał.
 *
 * Odsunięcia „obok narożnika" zostają w JEDNOSTKACH PLANU i nieprzeskalowane: to one
 * sprawdzają zasięg przyciągania, który też jest w jednostkach planu.
 */
const PIERWSZY = { lewa: 80, gora: 80, prawa: 200, dol: 160 };
const DRUGI_PRAWA = PIERWSZY.prawa + 120;

test("drugie pomieszczenie da się narysować wzdłuż ściany pierwszego", async ({ page }) => {
  await openPlan(page);
  await page.getByRole("button", { name: "Prostokąt" }).click();
  const a = await wspolrzedneWPlanie(page, PIERWSZY.lewa, PIERWSZY.gora);
  const b = await wspolrzedneWPlanie(page, PIERWSZY.prawa, PIERWSZY.dol);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Dodaj pomieszczenie" }).click();

  // Drugi pokój wielobokiem, wzdłuż PRAWEJ ściany pierwszego.
  await page.getByRole("button", { name: "Wielobok" }).click();
  for (const [x, y] of [
    [PIERWSZY.prawa, PIERWSZY.gora],
    [DRUGI_PRAWA, PIERWSZY.gora],
    [DRUGI_PRAWA, PIERWSZY.dol],
    [PIERWSZY.prawa, PIERWSZY.dol],
    [PIERWSZY.prawa, PIERWSZY.gora], // domknięcie kliknięciem w pierwszy punkt
  ]) {
    const p = await wspolrzedneWPlanie(page, x, y);
    await page.mouse.click(p.x, p.y);
  }
  await expect(page.getByText("Nazwij pomieszczenie")).toBeVisible();
  await page.getByRole("button", { name: "Dodaj pomieszczenie" }).click();

  const pokoje = await zapisanePokoje(page);
  expect(pokoje).toHaveLength(2);
  expect(pokoje[1].points).toHaveLength(4);
});

test("punkty nowego pomieszczenia przyciągają się do narożników sąsiada", async ({ page }) => {
  await openPlan(page);
  await page.getByRole("button", { name: "Prostokąt" }).click();
  const a = await wspolrzedneWPlanie(page, PIERWSZY.lewa, PIERWSZY.gora);
  const b = await wspolrzedneWPlanie(page, PIERWSZY.prawa, PIERWSZY.dol);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Dodaj pomieszczenie" }).click();

  // Celujemy OBOK narożników sąsiada (kilka jednostek za daleko) — przyciąganie ma
  // dociągnąć punkty na wspólną ścianę, żeby między pokojami nie została szczelina.
  await page.getByRole("button", { name: "Wielobok" }).click();
  for (const [x, y] of [
    [PIERWSZY.prawa + 5, PIERWSZY.gora - 4],
    [DRUGI_PRAWA, PIERWSZY.gora],
    [DRUGI_PRAWA, PIERWSZY.dol],
    [PIERWSZY.prawa - 3, PIERWSZY.dol + 4],
    [PIERWSZY.prawa + 5, PIERWSZY.gora - 4],
  ]) {
    const p = await wspolrzedneWPlanie(page, x, y);
    await page.mouse.click(p.x, p.y);
  }
  await page.getByRole("button", { name: "Dodaj pomieszczenie" }).click();

  const [pierwszy, drugi] = await zapisanePokoje(page);
  const prawaPierwszego = Math.max(...pierwszy.points.map((p) => p.x));
  // Oba punkty przy wspólnej ścianie leżą DOKŁADNIE na niej, mimo że klik był obok.
  const przyScianie = drugi.points.filter((p) => Math.abs(p.x - prawaPierwszego) < 0.001);
  expect(przyScianie).toHaveLength(2);
  // I to na wysokości narożników sąsiada, a nie gdziekolwiek na jego krawędzi.
  const naroznikiY = pierwszy.points.filter((p) => p.x === prawaPierwszego).map((p) => p.y).sort((m, n) => m - n);
  expect(przyScianie.map((p) => p.y).sort((m, n) => m - n)).toEqual(naroznikiY);
});

/**
 * Wyrównanie wierzchołka do PIONU/POZIOMU tego, co już jest na rysunku.
 *
 * Rysując drugą albo trzecią ścianę pokoju człowiek chce, żeby wierzchołek stanął
 * w linii z poprzednim — a nie o dwa stopnie od niego. Przyciąganie do geometrii tego
 * nie załatwia: łapie dopiero wtedy, gdy trafi się prawie w sam narożnik sąsiada.
 *
 * Siatka jest tu WYŁĄCZONA celowo. Przy włączonej oczko (0,5 m) samo zaokrągliłoby
 * współrzędną i test przechodziłby nie wiadomo z czego — sprawdzamy oś, nie siatkę.
 */
test("wierzchołek dociąga się do pionu poprzedniego punktu", async ({ page }) => {
  await openPlan(page);
  await otworzMenuPaska(page, "Rysunek");
  await page.getByLabel("Przyciągaj ściany do siatki").uncheck();
  await zamknijMenuPaska(page);

  await page.getByRole("button", { name: "Narysuj Pomieszczenie", exact: true }).click();
  await page.getByRole("button", { name: "Wielobok" }).click();

  // Trzeci punkt celowany 3 jedn. OBOK pionu drugiego — w zasięgu osi (0,2 m = 4 jedn.).
  const rogi = [
    { x: 103, y: 100 },
    { x: 247, y: 100 },
    { x: 250, y: 214 },
    { x: 103, y: 214 },
  ];
  for (const r of rogi) {
    const ekran = await wspolrzedneWPlanie(page, r.x, r.y);
    await page.mouse.click(ekran.x, ekran.y);
  }
  // Domknięcie kliknięciem w pierwszy punkt.
  const pierwszy = await wspolrzedneWPlanie(page, rogi[0].x, rogi[0].y);
  await page.mouse.click(pierwszy.x, pierwszy.y);
  await expect(page.getByText("Nazwij pomieszczenie")).toBeVisible();
  await page.getByRole("button", { name: "Dodaj pomieszczenie" }).click();

  const punkty = (await zapisanePokoje(page))[0].points;
  expect(punkty).toHaveLength(4);

  // Trzeci wierzchołek stoi DOKŁADNIE pod drugim, mimo że klik był 3 jedn. obok.
  expect(punkty[2].x).toBeCloseTo(punkty[1].x, 6);
  // A czwarty w linii z pierwszym — poziom bierze z trzeciego, pion z pierwszego.
  expect(punkty[3].x).toBeCloseTo(punkty[0].x, 6);
  expect(punkty[3].y).toBeCloseTo(punkty[2].y, 6);
});
