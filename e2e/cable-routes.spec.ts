import { test, expect } from "@playwright/test";
import { skipEntryScreen } from "./_flow";

/** Prog odrozniajacy trase ZASILANIA od STEROWANIA po grubosci linii — w polowie
 *  miedzy nimi (1,5 kontra 1; patrz `strokeWidth` przy trasach w DesignCanvas).
 *  Same wartosci sa detalem rysunkowym i zmieniaja sie, gdy zmienia sie czytelnosc
 *  rzutu; ROZNICA miedzy nimi jest tym, co te testy odrozniaja. */
const GRUBOSC_PROG = 1.25;

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
  await skipEntryScreen(page);
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

test("łącznik i oprawa w tym samym pomieszczeniu: trasa STEROWANIA rysuje się nawet BEZ rozdzielnicy na planie", async ({ page }) => {
  await openPlan(page);

  await page.getByRole("button", { name: /Oświetlenie/ }).first().click();
  await page.getByRole("button", { name: /Punkt sufitowy/ }).click();
  let box = await planBox(page);
  await page.mouse.click(box.x + 150, box.y + 100);

  await page.getByRole("button", { name: /Łączniki i sterowanie/ }).click();
  await page.getByRole("button", { name: /Łącznik jednobiegunowy/ }).click();
  box = await planBox(page);
  await page.mouse.click(box.x + 60, box.y + 100);
  await page.waitForTimeout(300);

  await page.getByRole("button", { name: "Zaznacz", exact: true }).click();
  // ŻADNEJ rozdzielnicy na planie — sterowanie łącznik→oprawa jest od niej niezależne.
  await page.getByRole("button", { name: "Pokaż trasy przewodów" }).click();
  await page.waitForTimeout(300);

  const dashes = await page.evaluate(() => {
    const konva = (
      window as unknown as { Konva?: { stages: { find(sel: string): { opacity(): number; dash(): number[] | undefined }[] }[] } }
    ).Konva;
    const stage = konva?.stages?.[0];
    return stage?.find("Line").filter((l) => Math.abs(l.opacity() - 0.9) < 0.01).map((l) => l.dash()) ?? [];
  });
  // trasa sterowania ma OSOBNY, odróżnialny styl kreski ([1,3]) od zasilania ([6,4]/ciągła)
  expect(dashes).toEqual([[1, 3]]);
});

test("z rozdzielnicą na planie: zasilanie oprawy STEROWANEJ łącznikiem ląduje na łączniku, nie na oprawie — dopiero sterowanie prowadzi dalej do oprawy", async ({ page }) => {
  await openPlan(page);

  await page.getByRole("button", { name: /Rozdział/ }).click();
  await page.getByRole("button", { name: /^Rozdzielnica$/ }).last().click();
  let box = await planBox(page);
  await page.mouse.click(box.x + 60, box.y + 60);

  await page.getByRole("button", { name: /Oświetlenie/ }).first().click();
  await page.getByRole("button", { name: /Punkt sufitowy/ }).click();
  box = await planBox(page);
  await page.mouse.click(box.x + 250, box.y + 100);

  await page.getByRole("button", { name: /Łączniki i sterowanie/ }).click();
  await page.getByRole("button", { name: /Łącznik jednobiegunowy/ }).click();
  box = await planBox(page);
  await page.mouse.click(box.x + 150, box.y + 150);
  await page.waitForTimeout(300);

  await page.getByRole("button", { name: "Zaznacz", exact: true }).click();
  await page.getByRole("button", { name: "Pokaż trasy przewodów" }).click();
  await page.waitForTimeout(300);

  const lines = await page.evaluate(() => {
    const konva = (
      window as unknown as { Konva?: { stages: { find(sel: string): { opacity(): number; points(): number[]; strokeWidth(): number }[] }[] } }
    ).Konva;
    const stage = konva?.stages?.[0];
    return stage?.find("Line").filter((l) => Math.abs(l.opacity() - 0.9) < 0.01).map((l) => ({ points: l.points(), strokeWidth: l.strokeWidth() })) ?? [];
  });
  expect(lines).toHaveLength(2);

  // zasilanie to GRUBSZA z dwoch linii — patrz GRUBOSC_PROG (same wartosci zeszly
  // przy scienieniu tras, wiec prog jest liczony z nich, zeby nie rozjechal sie znowu)
  const supply = lines.find((l) => l.strokeWidth > GRUBOSC_PROG)!;
  const control = lines.find((l) => l.strokeWidth < GRUBOSC_PROG)!;
  expect(supply).toBeDefined();
  expect(control).toBeDefined();

  const supplyEnd = supply.points.slice(-2);
  const controlStart = control.points.slice(0, 2);
  const controlEnd = control.points.slice(-2);

  // zasilanie KOŃCZY się dokładnie tam, gdzie sterowanie ZACZYNA się (na łączniku) —
  // NIE na oprawie, do której sterowanie dopiero DALEJ prowadzi
  expect(supplyEnd).toEqual(controlStart);
  expect(controlEnd).not.toEqual(supplyEnd);
});

test("z rozdzielnicą: KILKA opraw JEDNEGO obwodu na jednym łączniku — TYLKO JEDNA gruba linia zasilania do łącznika, nie po jednej na oprawę", async ({ page }) => {
  await openPlan(page);

  await page.getByRole("button", { name: /Rozdział/ }).click();
  await page.getByRole("button", { name: /^Rozdzielnica$/ }).last().click();
  let box = await planBox(page);
  await page.mouse.click(box.x + 60, box.y + 60);

  await page.getByRole("button", { name: /Oświetlenie/ }).first().click();
  await page.getByRole("button", { name: /Punkt sufitowy/ }).click();
  box = await planBox(page);
  await page.mouse.click(box.x + 200, box.y + 60);
  await page.getByRole("button", { name: /Punkt sufitowy/ }).click();
  await page.mouse.click(box.x + 260, box.y + 90);
  await page.getByRole("button", { name: /Punkt sufitowy/ }).click();
  await page.mouse.click(box.x + 220, box.y + 140);

  await page.getByRole("button", { name: /Łączniki i sterowanie/ }).click();
  await page.getByRole("button", { name: /Łącznik jednobiegunowy/ }).click();
  box = await planBox(page);
  await page.mouse.click(box.x + 150, box.y + 30);
  await page.waitForTimeout(300);

  await page.getByRole("button", { name: "Zaznacz", exact: true }).click();
  await page.getByRole("button", { name: "Pokaż trasy przewodów" }).click();
  await page.waitForTimeout(300);

  const lines = await page.evaluate(() => {
    const konva = (
      window as unknown as { Konva?: { stages: { find(sel: string): { opacity(): number; strokeWidth(): number }[] }[] } }
    ).Konva;
    const stage = konva?.stages?.[0];
    return stage?.find("Line").filter((l) => Math.abs(l.opacity() - 0.9) < 0.01).map((l) => l.strokeWidth()) ?? [];
  });
  const supplyLines = lines.filter((w) => w > GRUBOSC_PROG); // zasilanie jest grubsze od sterowania
  const controlLines = lines.filter((w) => w < GRUBOSC_PROG);
  // trzy oprawy WSPÓLNEGO obwodu sterowane jednym łącznikiem = JEDNA linia
  // zasilania do łącznika (jeden kabel), a NIE trzy równoległe kreski
  expect(supplyLines).toHaveLength(1);
  expect(controlLines).toHaveLength(3); // sterowanie nadal odwiedza wszystkie trzy oprawy
});

test("jeden łącznik sterujący TRZEMA oprawami: TYLKO JEDNA trasa sterowania dotyka łącznika, nie trzy", async ({ page }) => {
  await openPlan(page);
  // Powiększenie 100%, żeby klik na ekranie odpowiadał jednostce planu — test niżej
  // porównuje POZYCJĘ ekranową kliknięcia z narysowanymi punktami trasy.
  await page.getByRole("button", { name: /Powiększenie \d+ procent/ }).click();

  await page.getByRole("button", { name: /Oświetlenie/ }).first().click();
  await page.getByRole("button", { name: /Punkt sufitowy/ }).click();
  let box = await planBox(page);
  await page.mouse.click(box.x + 250, box.y + 60);
  await page.getByRole("button", { name: /Punkt sufitowy/ }).click();
  await page.mouse.click(box.x + 280, box.y + 150);
  await page.getByRole("button", { name: /Punkt sufitowy/ }).click();
  await page.mouse.click(box.x + 250, box.y + 240);

  await page.getByRole("button", { name: /Łączniki i sterowanie/ }).click();
  await page.getByRole("button", { name: /Łącznik jednobiegunowy/ }).click();
  box = await planBox(page);
  const switchScreen = { x: box.x + 60, y: box.y + 150 };
  await page.mouse.click(switchScreen.x, switchScreen.y);
  await page.waitForTimeout(300);

  await page.getByRole("button", { name: "Zaznacz", exact: true }).click();
  await page.getByRole("button", { name: "Pokaż trasy przewodów" }).click();
  await page.waitForTimeout(300);

  // uchwyt łącznika (patrz ElementGlyphKonva) — trasy sterowania mają charakterystyczny
  // cieńszy, kropkowany styl (strokeWidth 1.5) odróżniający je od zasilania (2.5)
  // Próg przekazany ARGUMENTEM: `page.evaluate` wykonuje się w przeglądarce, gdzie
  // stałe modułu testowego nie istnieją — inaczej leci ReferenceError.
  const controlRoutes = await page.evaluate((prog) => {
    const konva = (
      window as unknown as { Konva?: { stages: { find(sel: string): { opacity(): number; strokeWidth(): number; points(): number[] }[] }[] } }
    ).Konva;
    const stage = konva?.stages?.[0];
    return stage?.find("Line").filter((l) => Math.abs(l.opacity() - 0.9) < 0.01 && l.strokeWidth() < prog).map((l) => l.points()) ?? [];
  }, GRUBOSC_PROG);
  // trzy oprawy sterowane jednym łącznikiem = trzy odcinki ŁAŃCUCHA (łącznik->1,
  // 1->2, 2->3), NIE trzy osobne kable z łącznika do każdej z osobna
  expect(controlRoutes).toHaveLength(3);
  const switchPlan = { x: switchScreen.x - box.x, y: switchScreen.y - box.y };
  const touchingSwitch = controlRoutes.filter((pts) => {
    const start = { x: pts[0], y: pts[1] };
    return Math.hypot(start.x - switchPlan.x, start.y - switchPlan.y) < 5;
  });
  expect(touchingSwitch).toHaveLength(1); // TYLKO JEDNA trasa zaczyna się na łączniku
});

test("cztery oprawy na jednym łączniku: łańcuch, nie drzewo — ŻADNA oprawa nie ma dwóch wychodzących odcinków", async ({ page }) => {
  await openPlan(page);
  await page.getByRole("button", { name: /Powiększenie \d+ procent/ }).click();

  // rozmieszczenie odtwarzające zgłoszony przypadek: „najbliższy już podłączony
  // punkt" (drzewo, odmiana Prima) dokładał tu DWIE oprawy do TEJ SAMEJ, wcześniej
  // dodanej oprawy — łańcuch najbliższego sąsiada musi tego unikać
  const points = [
    { x: 172, y: 148 }, // B — najbliżej łącznika
    { x: 132, y: 218 }, // C — najbliżej B
    { x: 46, y: 104 }, // A — dalej, ale bliżej B niż C
    { x: 196, y: 341 }, // D — dalej, bliżej C niż A
  ];
  await page.getByRole("button", { name: /Oświetlenie/ }).first().click();
  let box = await planBox(page);
  for (const p of points) {
    await page.getByRole("button", { name: /Punkt sufitowy/ }).click();
    await page.mouse.click(box.x + p.x, box.y + p.y);
  }

  await page.getByRole("button", { name: /Łączniki i sterowanie/ }).click();
  await page.getByRole("button", { name: /Łącznik jednobiegunowy/ }).click();
  box = await planBox(page);
  await page.mouse.click(box.x + 230, box.y + 125);
  await page.waitForTimeout(300);

  await page.getByRole("button", { name: "Zaznacz", exact: true }).click();
  await page.getByRole("button", { name: "Pokaż trasy przewodów" }).click();
  await page.waitForTimeout(300);

  // Próg przekazany ARGUMENTEM: `page.evaluate` wykonuje się w przeglądarce, gdzie
  // stałe modułu testowego nie istnieją — inaczej leci ReferenceError.
  const controlRoutes = await page.evaluate((prog) => {
    const konva = (
      window as unknown as { Konva?: { stages: { find(sel: string): { opacity(): number; strokeWidth(): number; points(): number[] }[] }[] } }
    ).Konva;
    const stage = konva?.stages?.[0];
    return stage?.find("Line").filter((l) => Math.abs(l.opacity() - 0.9) < 0.01 && l.strokeWidth() < prog).map((l) => l.points()) ?? [];
  }, GRUBOSC_PROG);
  // cztery oprawy sterowane jednym łącznikiem = cztery odcinki łańcucha
  expect(controlRoutes).toHaveLength(4);

  // ŻADEN punkt startowy (zaokrąglony, bo zaokrąglenia ekran<->plan) nie
  // powtarza się między odcinkami — inaczej ten punkt miałby DWA wychodzące
  // przewody, czyli byłby rozgałęźnikiem
  const starts = controlRoutes.map((pts) => `${Math.round(pts[0])},${Math.round(pts[1])}`);
  expect(new Set(starts).size).toBe(starts.length);
});

/** Punkty i styl (dash) JEDYNEJ trasy na scenie — do asercji w testach ręcznej edycji. */
async function soleRoute(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const konva = (
      window as unknown as { Konva?: { stages: { find(sel: string): { opacity(): number; points(): number[]; dash(): number[] | undefined }[] }[] } }
    ).Konva;
    const stage = konva?.stages?.[0];
    const [line] = stage?.find("Line").filter((l) => Math.abs(l.opacity() - 0.9) < 0.01) ?? [];
    return line ? { points: line.points(), dashed: (line.dash()?.length ?? 0) > 0 } : null;
  });
}

/**
 * Ustawia rozdzielnicę i gniazdko (bez ścian — trasa spada na zapasowy szacunek
 * Manhattan), zaznacza tryb "Zaznacz" i pokazuje trasy. Powiększenie widoku jest
 * ZRESETOWANE do 100% (patrz przycisk „Powiększenie…"), ale i tak NIE zakładamy,
 * że klik na ekranie w (box.x+dx, box.y+dy) trafia dokładnie w jednostkę planu
 * (dx,dy) — obramowanie kontenera i subpikselowe skalowanie w przeglądarce dają w
 * praktyce stały, ale niezerowy offset. Zamiast go zgadywać, kalibrujemy go
 * empirycznie: klikamy zamierzone (60,60)/(250,80), CZYTAMY z powrotem, gdzie
 * faktycznie wylądowały (pierwszy/ostatni punkt jedynej trasy = pozycja
 * rozdzielnicy/gniazdka), i liczymy stały offset ekran→plan do użycia dalej.
 */
async function setupEditableRoute(page: import("@playwright/test").Page) {
  await openPlan(page);
  await page.getByRole("button", { name: /Powiększenie \d+ procent/ }).click();

  await page.getByRole("button", { name: /Rozdział/ }).click();
  await page.getByRole("button", { name: /^Rozdzielnica$/ }).last().click();
  let box = await planBox(page);
  await page.mouse.click(box.x + 60, box.y + 60);

  await page.getByRole("button", { name: /Gniazda i zasilanie/ }).click();
  await page.getByRole("button", { name: /Gniazdo 230 V/ }).first().click();
  box = await planBox(page);
  await page.mouse.click(box.x + 250, box.y + 80);
  await page.waitForTimeout(300);

  await page.getByRole("button", { name: "Zaznacz", exact: true }).click();
  await page.getByRole("button", { name: "Pokaż trasy przewodów" }).click();
  await page.waitForTimeout(300);

  const route = await soleRoute(page);
  if (!route) throw new Error("trasa nie narysowała się");
  const [panelX, panelY, , , sockX, sockY] = route.points;
  const offsetX = 60 - panelX;
  const offsetY = 60 - panelY;

  box = await planBox(page);
  const toScreen = (p: { x: number; y: number }) => ({ x: box.x + p.x + offsetX, y: box.y + p.y + offsetY });
  return { route, panel: { x: panelX, y: panelY }, socket: { x: sockX, y: sockY }, toScreen };
}

test("ręczna edycja trasy: dwuklik dokłada punkt, przeciągnięcie go przesuwa, „Cofnij do trasy automatycznej” wraca do routingu", async ({ page }) => {
  const { route: original, panel, socket, toScreen } = await setupEditableRoute(page);
  // trasa zapasowa (Manhattan): panel -> (gniazdko.x, panel.y) -> gniazdko, przerywana
  const corner = { x: socket.x, y: panel.y };
  expect(original.dashed).toBe(true);

  // klik na środku pierwszego (poziomego) odcinka zaznacza trasę
  const mid = { x: (panel.x + corner.x) / 2, y: panel.y };
  const screenMid = toScreen(mid);
  await page.mouse.click(screenMid.x, screenMid.y);
  await expect(page.getByText(/Trasa: dwuklik dokłada punkt/)).toBeVisible();

  // drugi dwuklik (trasa już zaznaczona) dokłada tam nowe załamanie
  await page.mouse.dblclick(screenMid.x, screenMid.y);
  await page.waitForTimeout(200);
  let route = await soleRoute(page);
  expect(route?.points.length).toBe(8); // 4 punkty zamiast 3 — doszło jedno załamanie
  expect(route?.points[0]).toBeCloseTo(panel.x, 1);
  expect(route?.points[1]).toBeCloseTo(panel.y, 1);
  // klik na środku odcinka nie musi trafić piksel w piksel (zaokrąglenia
  // ekran<->plan) — wystarczy, że nowy punkt wylądował W POBLIŻU zamierzonego miejsca
  const insertedY = route!.points[3];
  expect(Math.abs(route!.points[2] - mid.x)).toBeLessThan(10);
  expect(Math.abs(insertedY - mid.y)).toBeLessThan(10);
  expect(route?.dashed).toBe(false); // ręcznie zmieniona trasa jest już CIĄGŁA — nie szacunek

  // przycisk powrotu do automatu pojawia się TERAZ (jest co cofać)
  const cofnij = page.getByRole("button", { name: "Cofnij do trasy automatycznej" });
  await expect(cofnij).toBeVisible();

  // przeciągnięcie nowego uchwytu w górę wyraźnie przesuwa załamanie (dokładna
  // wartość docelowa nie jest tu istotna — liczy się, że drag rzeczywiście zadziałał)
  const moved = { x: mid.x, y: mid.y - 40 };
  const screenMoved = toScreen(moved);
  await page.mouse.move(screenMid.x, screenMid.y);
  await page.mouse.down();
  await page.mouse.move(screenMoved.x, screenMoved.y, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  route = await soleRoute(page);
  expect(route!.points[3]).toBeLessThan(insertedY - 20);

  // powrót do automatu przywraca oryginalną, przerywaną trasę Manhattan
  await cofnij.click();
  await page.waitForTimeout(300);
  route = await soleRoute(page);
  expect(route?.points).toEqual(original.points);
  expect(route?.dashed).toBe(true);
});

test("ręczna edycja trasy przeżywa odświeżenie strony (autozapis)", async ({ page }) => {
  const { route: original, panel, socket, toScreen } = await setupEditableRoute(page);
  // Nieedytowana trasa idzie przez `spreadOverlappingRoutes`, które dubluje punkt na
  // każdym złączeniu odcinków (do ew. bocznego rozsunięcia) — więc surowa LICZBA
  // punktów z Konvy nie jest tu miarodajnym sygnałem "czy doszła ręczna poprawka".
  // Miarodajny jest `dashed`: ręcznie zmieniona trasa renderuje się ZAWSZE ciągła,
  // niezależnie od `viaWalls` (patrz DesignCanvas.tsx) — więc przejście
  // przerywana→ciągła, PRZETRWANE przez odświeżenie strony, dowodzi, że poprawka
  // faktycznie zapisała się i wczytała z powrotem z autozapisu.
  expect(original.dashed).toBe(true);
  const mid = { x: (panel.x + socket.x) / 2, y: panel.y };
  const screenMid = toScreen(mid);

  await page.mouse.click(screenMid.x, screenMid.y);
  await page.mouse.dblclick(screenMid.x, screenMid.y);
  await page.waitForTimeout(900); // debounce autozapisu

  await page.reload();
  await page.waitForTimeout(300);
  // widoczność tras to lokalny stan UI, nie część projektu — po odświeżeniu wraca
  // do domyślnie WYŁĄCZONEJ, trzeba ją włączyć ponownie, żeby cokolwiek zobaczyć
  await page.getByRole("button", { name: "Zaznacz", exact: true }).click();
  await page.getByRole("button", { name: "Pokaż trasy przewodów" }).click();
  await page.waitForTimeout(300);
  const route = await soleRoute(page);
  expect(route?.dashed).toBe(false);
});

test("dwa obwody gniazdek dzielące ten sam odcinek ściany: trasy się NIE zlewają (rozsunięte równolegle)", async ({ page }) => {
  await openPlan(page);

  // jedna wspólna ściana pozioma, po której routują OBIE trasy
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

  // dwa gniazdka, oba bliżej TEJ SAMEJ ściany, więc obie trasy routują się przez nią
  await page.getByRole("button", { name: /Gniazda i zasilanie/ }).click();
  await page.getByRole("button", { name: /Gniazdo 230 V/ }).first().click();
  box = await planBox(page);
  await page.mouse.click(box.x + 280, box.y + 100);
  await page.getByRole("button", { name: /Gniazdo 230 V/ }).first().click();
  box = await planBox(page);
  await page.mouse.click(box.x + 200, box.y + 100);
  await page.waitForTimeout(300);

  await page.getByRole("button", { name: "Zaznacz", exact: true }).click();
  await page.getByRole("button", { name: "Pokaż trasy przewodów" }).click();
  await page.waitForTimeout(300);

  const pointSets = await page.evaluate(() => {
    const konva = (
      window as unknown as { Konva?: { stages: { find(sel: string): { opacity(): number; points(): number[] }[] }[] } }
    ).Konva;
    const stage = konva?.stages?.[0];
    return stage?.find("Line").filter((l) => Math.abs(l.opacity() - 0.9) < 0.01).map((l) => l.points()) ?? [];
  });
  expect(pointSets).toHaveLength(2);
  // gdyby trasy się nie rozsunęły, ich punkty byłyby identyczne — sprawdzamy, że
  // faktycznie się różnią (rozsunięcie na wspólnym odcinku ściany zadziałało)
  expect(pointSets[0]).not.toEqual(pointSets[1]);
});

/**
 * Zgłoszenie użytkownika: pokój z jednym punktem świetlnym i dwoma gniazdami
 * pokazywał TRZY przewody z rozdzielnicy — po jednym na element. Obwody były
 * policzone dobrze (dwa), kłamał sam rysunek: zasilanie szło gwiazdą, choć obwód
 * to jeden kabel wchodzący po drodze do kolejnych puszek.
 */
test("dwa gniazda jednego obwodu: DRUGI odcinek startuje z pierwszego gniazda, nie z rozdzielnicy", async ({ page }) => {
  await openPlan(page);
  await page.getByRole("button", { name: /Powiększenie \d+ procent/ }).click();

  await page.getByRole("button", { name: /Rozdział/ }).click();
  await page.getByRole("button", { name: /^Rozdzielnica$/ }).last().click();
  let box = await planBox(page);
  await page.mouse.click(box.x + 200, box.y + 330);

  await page.getByRole("button", { name: /Gniazda i zasilanie/ }).click();
  box = await planBox(page);
  for (const y of [170, 100]) {
    await page.getByRole("button", { name: /Gniazdo 230 V/ }).first().click();
    await page.mouse.click(box.x + 300, box.y + y);
  }
  await page.waitForTimeout(300);

  await page.getByRole("button", { name: "Zaznacz", exact: true }).click();
  await page.getByRole("button", { name: "Pokaż trasy przewodów" }).click();
  await page.waitForTimeout(300);

  const trasy = await page.evaluate(() => {
    const konva = (
      window as unknown as { Konva?: { stages: { find(sel: string): { opacity(): number; points(): number[] }[] }[] } }
    ).Konva;
    const stage = konva?.stages?.[0];
    return (stage?.find("Line").filter((l) => Math.abs(l.opacity() - 0.9) < 0.01) ?? []).map((l) => l.points().map(Math.round));
  });

  expect(trasy).toHaveLength(2);
  const start = (pts: number[]) => `${pts[0]},${pts[1]}`;
  const koniec = (pts: number[]) => `${pts[pts.length - 2]},${pts[pts.length - 1]}`;
  const konce = trasy.map(koniec);

  // Dokładnie JEDEN odcinek wychodzi z rozdzielnicy: jego początek nie jest końcem
  // żadnego innego. Drugi zaczyna się tam, gdzie pierwszy się kończy — i to jest
  // cała różnica między łańcuchem a gwiazdą (tam OBA startowałyby z rozdzielnicy).
  const zRozdzielnicy = trasy.filter((t) => !konce.includes(start(t)));
  const kontynuacje = trasy.filter((t) => konce.includes(start(t)));
  expect(zRozdzielnicy).toHaveLength(1);
  expect(kontynuacje).toHaveLength(1);
  expect(start(kontynuacje[0])).toBe(koniec(zRozdzielnicy[0]));
});

/**
 * Zgloszenie uzytkownika (z odreczna poprawka na zrzucie): przewod dochodzil do
 * SRODKA gniazdka, czyli wchodzil mu w luk — od strony pomieszczenia, a nie od
 * strony puszki. Gniazdo stoi trzonkiem w sciane i tam ma trafic przewod, odbijajac
 * od swojego pasa krotkim skosem pod 45 stopni.
 */
test("gniazdo przy scianie: przewod odbija pod 45 stopni i konczy sie na nozce, po stronie sciany", async ({ page }) => {
  await openPlan(page);

  await page.getByRole("button", { name: "Narysuj Pomieszczenie", exact: true }).click();
  await page.getByRole("button", { name: "Prostokąt" }).click();
  let box = await planBox(page);
  await page.mouse.move(box.x + 80, box.y + 60);
  await page.mouse.down();
  await page.mouse.move(box.x + 420, box.y + 300, { steps: 8 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Dodaj pomieszczenie" }).click();

  await page.getByRole("button", { name: "Wstaw Element" }).click();
  await page.getByRole("button", { name: /Rozdział/ }).click();
  await page.getByRole("button", { name: /^Rozdzielnica$/ }).last().click();
  box = await planBox(page);
  await page.mouse.click(box.x + 120, box.y + 290); // przy dolnej scianie

  await page.getByRole("button", { name: /Gniazda i zasilanie/ }).click();
  await page.getByRole("button", { name: /Gniazdo 230 V/ }).first().click();
  box = await planBox(page);
  await page.mouse.click(box.x + 415, box.y + 160); // przyklejone do PRAWEJ sciany
  await page.waitForTimeout(300);

  await page.getByRole("button", { name: "Zaznacz", exact: true }).click();
  await page.getByRole("button", { name: "Pokaż trasy przewodów" }).click();
  await page.waitForTimeout(300);

  const punkty = await page.evaluate(() => {
    const konva = (
      window as unknown as { Konva?: { stages: { find(sel: string): { opacity(): number; points(): number[] }[] }[] } }
    ).Konva;
    const trasy = (konva?.stages?.[0]?.find("Line") ?? []).filter((l) => Math.abs(l.opacity() - 0.9) < 0.01);
    return trasy[0]?.points() ?? [];
  });

  expect(punkty.length).toBeGreaterThanOrEqual(6); // co najmniej dwa zalamania + koniec
  const n = punkty.length;
  const przed = { x: punkty[n - 4], y: punkty[n - 3] };
  const koniec = { x: punkty[n - 2], y: punkty[n - 1] };

  // Ostatni odcinek to SKOS o rownych skladowych — czyli dokladnie 45 stopni.
  expect(Math.abs(koniec.x - przed.x)).toBeGreaterThan(1);
  expect(Math.abs(koniec.x - przed.x)).toBeCloseTo(Math.abs(koniec.y - przed.y), 0);
  // I biegnie W STRONE sciany (w prawo), a nie w glab pomieszczenia.
  expect(koniec.x).toBeGreaterThan(przed.x);
});
