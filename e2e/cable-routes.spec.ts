import { test, expect } from "@playwright/test";
import { skipEntryScreen, otworzKatalogElementow } from "./_flow";

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
  const wrap = page.locator("[data-testid=plan-okno]").first();
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
  await otworzKatalogElementow(page);
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
  await page.mouse.click(box.x + 250, box.y + 80);

  await otworzKatalogElementow(page);
  await page.getByRole("button", { name: /Oświetlenie/ }).first().click();
  await page.getByRole("button", { name: /Punkt sufitowy/ }).first().click();
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

/**
 * Zgloszenie uzytkownika: obwody na rzucie zlewaly sie w jeden kolor. Trasa brala
 * kolor POMIESZCZENIA, wiec obwod gniazd i obwod oswietlenia w tym samym pokoju
 * wychodzily identyczne — dwa rozne kable wygladaly jak jeden. Teraz kolor idzie
 * z OBWODU (patrz `KOLORY_OBWODOW` w panel/circuits.ts).
 */
test("obwod gniazd i obwod oswietlenia W TYM SAMYM pokoju maja ROZNE kolory", async ({ page }) => {
  await openPlan(page);

  await page.getByRole("button", { name: "Narysuj Pomieszczenie", exact: true }).click();
  await page.getByRole("button", { name: "Prostokąt" }).click();
  let box = await planBox(page);
  await page.mouse.move(box.x + 60, box.y + 60);
  await page.mouse.down();
  await page.mouse.move(box.x + 360, box.y + 260, { steps: 6 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Dodaj pomieszczenie" }).click();
  await page.waitForTimeout(300);

  await page.getByRole("button", { name: "Wstaw Element" }).click();
  await otworzKatalogElementow(page);
  await page.getByRole("button", { name: /Rozdział/ }).click();
  await page.getByRole("button", { name: /^Rozdzielnica$/ }).last().click();
  box = await planBox(page);
  await page.mouse.click(box.x + 100, box.y + 240);

  await otworzKatalogElementow(page);
  await page.getByRole("button", { name: /Gniazda i zasilanie/ }).click();
  await otworzKatalogElementow(page);
  await page.getByRole("button", { name: /Gniazdo 230 V/ }).first().click();
  box = await planBox(page);
  await page.mouse.click(box.x + 355, box.y + 160);

  await otworzKatalogElementow(page);
  await page.getByRole("button", { name: /Oświetlenie/ }).first().click();
  await page.getByRole("button", { name: /Punkt sufitowy/ }).first().click();
  box = await planBox(page);
  await page.mouse.click(box.x + 210, box.y + 150);
  await page.waitForTimeout(300);

  await page.getByRole("button", { name: "Zaznacz", exact: true }).click();
  await page.getByRole("button", { name: "Pokaż trasy przewodów" }).click();
  await page.waitForTimeout(300);

  const strokes = await page.evaluate(() => {
    const konva = (window as unknown as { Konva?: { stages: { find(sel: string): { opacity(): number; stroke(): string }[] }[] } }).Konva;
    const stage = konva?.stages?.[0];
    return stage?.find("Line").filter((l) => Math.abs(l.opacity() - 0.9) < 0.01).map((l) => l.stroke()) ?? [];
  });
  expect(strokes).toHaveLength(2);
  // Sedno: DWA rozne kolory. Gdyby kolor szedl z pomieszczenia (jak przedtem),
  // oba byłyby tym samym kolorem obrysu i ten test by nie przeszedl.
  expect(new Set(strokes).size).toBe(2);
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

  await otworzKatalogElementow(page);
  await page.getByRole("button", { name: /Rozdział/ }).click();
  await page.getByRole("button", { name: /^Rozdzielnica$/ }).last().click();
  box = await planBox(page);
  await page.mouse.click(box.x + 60, box.y + 60);

  await otworzKatalogElementow(page);
  await page.getByRole("button", { name: /Gniazda i zasilanie/ }).click();
  await otworzKatalogElementow(page);
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

  await otworzKatalogElementow(page);
  await page.getByRole("button", { name: /Oświetlenie/ }).first().click();
  await page.getByRole("button", { name: /Punkt sufitowy/ }).first().click();
  let box = await planBox(page);
  await page.mouse.click(box.x + 150, box.y + 100);

  await otworzKatalogElementow(page);
  await page.getByRole("button", { name: /Łączniki i sterowanie/ }).click();
  await page.getByRole("button", { name: /Łącznik jednobiegunowy/ }).first().click();
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

  await otworzKatalogElementow(page);
  await page.getByRole("button", { name: /Rozdział/ }).click();
  await page.getByRole("button", { name: /^Rozdzielnica$/ }).last().click();
  let box = await planBox(page);
  await page.mouse.click(box.x + 60, box.y + 60);

  await otworzKatalogElementow(page);
  await page.getByRole("button", { name: /Oświetlenie/ }).first().click();
  await page.getByRole("button", { name: /Punkt sufitowy/ }).first().click();
  box = await planBox(page);
  await page.mouse.click(box.x + 250, box.y + 100);

  await otworzKatalogElementow(page);
  await page.getByRole("button", { name: /Łączniki i sterowanie/ }).click();
  await page.getByRole("button", { name: /Łącznik jednobiegunowy/ }).first().click();
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

  await otworzKatalogElementow(page);
  await page.getByRole("button", { name: /Rozdział/ }).click();
  await page.getByRole("button", { name: /^Rozdzielnica$/ }).last().click();
  let box = await planBox(page);
  await page.mouse.click(box.x + 60, box.y + 60);

  await otworzKatalogElementow(page);
  await page.getByRole("button", { name: /Oświetlenie/ }).first().click();
  await page.getByRole("button", { name: /Punkt sufitowy/ }).first().click();
  box = await planBox(page);
  await page.mouse.click(box.x + 200, box.y + 60);
  await page.getByRole("button", { name: /Punkt sufitowy/ }).first().click();
  await page.mouse.click(box.x + 260, box.y + 90);
  await page.getByRole("button", { name: /Punkt sufitowy/ }).first().click();
  await page.mouse.click(box.x + 220, box.y + 140);

  await otworzKatalogElementow(page);
  await page.getByRole("button", { name: /Łączniki i sterowanie/ }).click();
  await page.getByRole("button", { name: /Łącznik jednobiegunowy/ }).first().click();
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

  await otworzKatalogElementow(page);
  await page.getByRole("button", { name: /Oświetlenie/ }).first().click();
  await page.getByRole("button", { name: /Punkt sufitowy/ }).first().click();
  let box = await planBox(page);
  await page.mouse.click(box.x + 250, box.y + 60);
  await page.getByRole("button", { name: /Punkt sufitowy/ }).first().click();
  await page.mouse.click(box.x + 280, box.y + 150);
  await page.getByRole("button", { name: /Punkt sufitowy/ }).first().click();
  await page.mouse.click(box.x + 250, box.y + 240);

  await otworzKatalogElementow(page);
  await page.getByRole("button", { name: /Łączniki i sterowanie/ }).click();
  await page.getByRole("button", { name: /Łącznik jednobiegunowy/ }).first().click();
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
  // Pozycja łącznika w JEDNOSTKACH PLANU — przez transformację sceny, bo widok nie
  // stoi już w powiększeniu 1 i odjęcie samego rogu okna dawałoby dwa razy za dużo.
  const t = await scena(page);
  const switchPlan = {
    x: (switchScreen.x - box.x - t.x) / t.skala,
    y: (switchScreen.y - box.y - t.y) / t.skala,
  };
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
  await otworzKatalogElementow(page);
  await page.getByRole("button", { name: /Oświetlenie/ }).first().click();
  let box = await planBox(page);
  for (const p of points) {
    await page.getByRole("button", { name: /Punkt sufitowy/ }).first().click();
    await page.mouse.click(box.x + p.x, box.y + p.y);
  }

  await otworzKatalogElementow(page);
  await page.getByRole("button", { name: /Łączniki i sterowanie/ }).click();
  await page.getByRole("button", { name: /Łącznik jednobiegunowy/ }).first().click();
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
/** Transformacja żywej sceny: powiększenie i przesunięcie kadru. */
async function scena(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const s = (window as unknown as { Konva: { stages: { scaleX(): number; x(): number; y(): number }[] } }).Konva
      .stages[0];
    return { skala: s.scaleX(), x: s.x(), y: s.y() };
  });
}

async function setupEditableRoute(page: import("@playwright/test").Page) {
  await openPlan(page);
  await page.getByRole("button", { name: /Powiększenie \d+ procent/ }).click();

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
  await page.mouse.click(box.x + 250, box.y + 80);
  await page.waitForTimeout(300);

  await page.getByRole("button", { name: "Zaznacz", exact: true }).click();
  await page.getByRole("button", { name: "Pokaż trasy przewodów" }).click();
  await page.waitForTimeout(300);

  const route = await soleRoute(page);
  if (!route) throw new Error("trasa nie narysowała się");
  const [panelX, panelY, , , sockX, sockY] = route.points;

  box = await planBox(page);
  // Przelicznik plan → ekran przez TRANSFORMACJĘ SCENY, nie „jeden do jednego".
  // Dawniej wystarczało dodać stały offset, bo widok stał w powiększeniu 1 (czyli
  // jednostka planu = piksel). Rysowanie od zera otwiera się teraz we własnej skali,
  // więc bez mnożenia przez powiększenie trafialibyśmy dwa razy za blisko rogu.
  // Resztkowy offset (obramowanie kontenera, subpiksele) nadal kalibrujemy empirycznie.
  const t = await scena(page);
  const offsetX = 60 - (panelX * t.skala + t.x);
  const offsetY = 60 - (panelY * t.skala + t.y);
  const toScreen = (p: { x: number; y: number }) => ({
    x: box.x + p.x * t.skala + t.x + offsetX,
    y: box.y + p.y * t.skala + t.y + offsetY,
  });
  return { route, panel: { x: panelX, y: panelY }, socket: { x: sockX, y: sockY }, toScreen };
}

test("ręczna edycja trasy: PPM → „Dodaj punkt” dokłada punkt, przeciągnięcie go przesuwa, „Cofnij do trasy automatycznej” wraca do routingu", async ({ page }) => {
  const { route: original, panel, socket, toScreen } = await setupEditableRoute(page);
  // trasa zapasowa (Manhattan): panel -> (gniazdko.x, panel.y) -> gniazdko, przerywana
  const corner = { x: socket.x, y: panel.y };
  expect(original.dashed).toBe(true);

  // klik na środku pierwszego (poziomego) odcinka zaznacza trasę
  const mid = { x: (panel.x + corner.x) / 2, y: panel.y };
  const screenMid = toScreen(mid);
  await page.mouse.click(screenMid.x, screenMid.y);
  await expect(page.getByText(/Trasa: PPM → „Dodaj punkt”/)).toBeVisible();

  // PPM → „Dodaj punkt" dokłada załamanie DOKŁADNIE tam, gdzie otwarto menu
  // Zaraz po lewym kliknięciu — Konva policzyłaby te dwa kliknięcia jako dwuklik
  // i zamiast menu otworzyła okno informacji (patrz `dwuklikAlboDotyk`).
  await page.mouse.click(screenMid.x, screenMid.y, { button: "right" });
  await page.getByRole("button", { name: "Dodaj punkt", exact: true }).click();
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

  await page.mouse.click(screenMid.x, screenMid.y, { button: "right" });
  await page.getByRole("button", { name: "Dodaj punkt", exact: true }).click();
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

  await otworzKatalogElementow(page);
  await page.getByRole("button", { name: /Rozdział/ }).click();
  await page.getByRole("button", { name: /^Rozdzielnica$/ }).last().click();
  box = await planBox(page);
  await page.mouse.click(box.x + 60, box.y + 60);

  // dwa gniazdka, oba bliżej TEJ SAMEJ ściany, więc obie trasy routują się przez nią
  await otworzKatalogElementow(page);
  await page.getByRole("button", { name: /Gniazda i zasilanie/ }).click();
  await otworzKatalogElementow(page);
  await page.getByRole("button", { name: /Gniazdo 230 V/ }).first().click();
  box = await planBox(page);
  await page.mouse.click(box.x + 280, box.y + 100);
  await otworzKatalogElementow(page);
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

  await otworzKatalogElementow(page);
  await page.getByRole("button", { name: /Rozdział/ }).click();
  await page.getByRole("button", { name: /^Rozdzielnica$/ }).last().click();
  let box = await planBox(page);
  await page.mouse.click(box.x + 200, box.y + 330);

  await otworzKatalogElementow(page);
  await page.getByRole("button", { name: /Gniazda i zasilanie/ }).click();
  box = await planBox(page);
  for (const y of [170, 100]) {
    await otworzKatalogElementow(page);
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
  await otworzKatalogElementow(page);
  await page.getByRole("button", { name: /Rozdział/ }).click();
  await page.getByRole("button", { name: /^Rozdzielnica$/ }).last().click();
  box = await planBox(page);
  await page.mouse.click(box.x + 120, box.y + 290); // przy dolnej scianie

  await otworzKatalogElementow(page);
  await page.getByRole("button", { name: /Gniazda i zasilanie/ }).click();
  await otworzKatalogElementow(page);
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

  // Ostatni odcinek wchodzi PROSTOPADLE do sciany, przy ktorej stoi gniazdo.
  //
  // Byl tu kiedys odczep pod 45 stopni i brał sie z proporcji: symbol siegal dalej
  // w glab pokoju niz pas, po ktorym biegnie przewod (`ODSUNIECIE_TRASY`), wiec trasa
  // mijala nozke i musiala do niej zawrocic skosem. Po zmniejszeniu symboli gniazdo
  // miesci sie miedzy pasem a murem i przewod dochodzi do niego wprost — krotszą drogą
  // i pod katem prostym, czyli tak samo jak do rozdzielnicy.
  expect(Math.abs(koniec.x - przed.x)).toBeGreaterThan(1);
  expect(Math.abs(koniec.y - przed.y)).toBeLessThan(0.5);
  // I biegnie W STRONE sciany (w prawo), a nie w glab pomieszczenia.
  expect(koniec.x).toBeGreaterThan(przed.x);
});

/**
 * Zgloszenie uzytkownika: przewod przechodzil NA WYLOT przez pierwsze i ostatnie
 * gniazdo przy scianie. Dwa doskoki lezace na TYM SAMYM odcinku obrysu laczyly sie
 * tylko przez jego konce, wiec trasa z gniazda do sasiedniego schodziła najpierw do
 * naroznika pokoju i wracala ta sama linia — przez symbol, ktory wlasnie minela.
 */
test("trzy gniazda przy jednej scianie: zaden odcinek NIE ZAWRACA do naroznika", async ({ page }) => {
  await openPlan(page);

  await page.getByRole("button", { name: "Narysuj Pomieszczenie", exact: true }).click();
  await page.getByRole("button", { name: "Prostokąt" }).click();
  let box = await planBox(page);
  await page.mouse.move(box.x + 80, box.y + 60);
  await page.mouse.down();
  await page.mouse.move(box.x + 460, box.y + 340, { steps: 8 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Dodaj pomieszczenie" }).click();
  await page.waitForTimeout(300);

  await page.getByRole("button", { name: "Wstaw Element" }).click();
  await otworzKatalogElementow(page);
  await page.getByRole("button", { name: /Rozdział/ }).click();
  await page.getByRole("button", { name: /^Rozdzielnica$/ }).last().click();
  box = await planBox(page);
  await page.mouse.click(box.x + 110, box.y + 330);

  await otworzKatalogElementow(page);
  await page.getByRole("button", { name: /Gniazda i zasilanie/ }).click();
  box = await planBox(page);
  for (const y of [130, 210, 290]) {
    await otworzKatalogElementow(page);
    await page.getByRole("button", { name: /Gniazdo 230 V/ }).first().click();
    await page.mouse.click(box.x + 455, box.y + y);
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
    return (stage?.find("Line").filter((l) => Math.abs(l.opacity() - 0.9) < 0.01) ?? []).map((l) => l.points());
  });
  expect(trasy).toHaveLength(3); // lancuch: rozdzielnica -> 1 -> 2 -> 3

  // Odcinek miedzy dwoma gniazdami przy TEJ SAMEJ scianie ma isc MONOTONICZNIE:
  // najpierw skos od nozki, potem prosto wzdluz sciany, potem skos do nastepnej.
  // Zawrocenie do naroznika objawia sie zmiana ZNAKU przyrostu y — dokladnie to
  // rysowalo kreske przez minięty symbol.
  const miedzyGniazdami = trasy.filter((pts) => {
    const ys = pts.filter((_, i) => i % 2 === 1);
    return Math.abs(ys[0] - ys[ys.length - 1]) > 40; // pomijamy pierwszy odcinek z rozdzielnicy
  });
  for (const pts of miedzyGniazdami) {
    const ys: number[] = pts.filter((_, i) => i % 2 === 1);
    const kierunki = new Set<number>();
    for (let i = 1; i < ys.length; i++) if (Math.abs(ys[i] - ys[i - 1]) > 0.5) kierunki.add(Math.sign(ys[i] - ys[i - 1]));
    expect(kierunki.size).toBe(1);
  }
});

/**
 * Zgloszenie uzytkownika: linia szla SKOSEM przez cala dlugosc sciany i dopiero
 * konczyla we wlasciwym punkcie. Przyczyna byla w grafie: doskok do trasy odsunietej
 * o `ODSUNIECIE_TRASY` miescil sie w calosci w `MERGE_TOLERANCE` (10), wiec punkt wejscia
 * wpadal do wezla samego elementu i zostawala jedna krawedz element → NAROZNIK.
 * Trasa ma isc ROWNOLEGLE do sciany i odbijac dopiero przy elemencie.
 */
test("trasa wzdluz sciany jest PROSTA, skos dopiero przy elemencie", async ({ page }) => {
  await openPlan(page);

  await page.getByRole("button", { name: "Narysuj Pomieszczenie", exact: true }).click();
  await page.getByRole("button", { name: "Prostokąt" }).click();
  let box = await planBox(page);
  await page.mouse.move(box.x + 80, box.y + 60);
  await page.mouse.down();
  await page.mouse.move(box.x + 460, box.y + 340, { steps: 8 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Dodaj pomieszczenie" }).click();
  await page.waitForTimeout(300);

  await page.getByRole("button", { name: "Wstaw Element" }).click();
  await otworzKatalogElementow(page);
  await page.getByRole("button", { name: /Rozdział/ }).click();
  await page.getByRole("button", { name: /^Rozdzielnica$/ }).last().click();
  box = await planBox(page);
  await page.mouse.click(box.x + 110, box.y + 330); // przy dolnej scianie, lewy dol

  await otworzKatalogElementow(page);
  await page.getByRole("button", { name: /Gniazda i zasilanie/ }).click();
  await otworzKatalogElementow(page);
  await page.getByRole("button", { name: /Gniazdo 230 V/ }).first().click();
  box = await planBox(page);
  await page.mouse.click(box.x + 455, box.y + 130); // prawa sciana, wysoko
  await page.waitForTimeout(300);

  await page.getByRole("button", { name: "Zaznacz", exact: true }).click();
  await page.getByRole("button", { name: "Pokaż trasy przewodów" }).click();
  await page.waitForTimeout(300);

  const punkty = await page.evaluate(() => {
    const konva = (
      window as unknown as { Konva?: { stages: { find(sel: string): { opacity(): number; points(): number[] }[] }[] } }
    ).Konva;
    const trasy = (konva?.stages?.[0]?.find("Line") ?? []).filter((l) => Math.abs(l.opacity() - 0.9) < 0.01);
    const pts = trasy[0]?.points() ?? [];
    const out: { x: number; y: number }[] = [];
    for (let i = 0; i < pts.length; i += 2) out.push({ x: pts[i], y: pts[i + 1] });
    return out;
  });

  // Przebieg wzdluz sciany ma byc pionowy albo poziomy — skos rozlozony na dlugosc
  // sciany zlamalby dokladnie ten warunek. Skos zostaje tylko przy GNIEZDZIE: odczep
  // pod 45 stopni do nozki. Przy rozdzielnicy przewod wchodzi PROSTOPADLE do sciany —
  // schodzi sie tam kilkanascie obwodow i wchodza w mur pionem nad obudowa.
  const odcinki: { dx: number; dy: number }[] = [];
  for (let i = 1; i < punkty.length; i++) {
    const dx = Math.abs(punkty[i].x - punkty[i - 1].x);
    const dy = Math.abs(punkty[i].y - punkty[i - 1].y);
    if (dx > 0.5 || dy > 0.5) odcinki.push({ dx, dy });
  }
  expect(odcinki.length).toBeGreaterThanOrEqual(4);
  for (const s of odcinki.slice(1, -1)) expect(Math.min(s.dx, s.dy)).toBeLessThan(0.5);
  // Pierwszy odcinek — od rozdzielnicy — jest prostopadly do jej sciany.
  expect(Math.min(odcinki[0].dx, odcinki[0].dy)).toBeLessThan(0.5);
  // Ostatni — przy gniezdzie — tak samo prostopadly (patrz komentarz przy tescie
  // „gniazdo przy scianie": po zmniejszeniu symboli odczep pod 45 stopni nie ma sie
  // gdzie uformowac, bo gniazdo stoi blizej muru niz pas przewodow).
  const odczep = odcinki[odcinki.length - 1];
  expect(Math.min(odczep.dx, odczep.dy)).toBeLessThan(0.5);
});

/**
 * Zgloszenie uzytkownika: kilka obwodow biegnacych ta sama sciana naklada sie na
 * siebie i nie wiadomo, ile przewodow jest tam prowadzonych. Rozsuwanie lapalo tylko
 * odcinki o IDENTYCZNYCH koncach, a obwody wychodzace z jednej rozdzielnicy rozchodza
 * sie w roznych miejscach — jeden przebieg zawiera sie w drugim. Do tego obwod
 * gniazdowy ma zostac NAJBLIZEJ sciany.
 */
test("obwod gniazdowy i oswietleniowy dziela sciane: rownolegle pasy, gniazda blizej muru", async ({ page }) => {
  await openPlan(page);

  await page.getByRole("button", { name: "Narysuj Pomieszczenie", exact: true }).click();
  await page.getByRole("button", { name: "Prostokąt" }).click();
  let box = await planBox(page);
  await page.mouse.move(box.x + 80, box.y + 60);
  await page.mouse.down();
  await page.mouse.move(box.x + 460, box.y + 340, { steps: 8 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Dodaj pomieszczenie" }).click();
  await page.waitForTimeout(300);

  await page.getByRole("button", { name: "Wstaw Element" }).click();
  await otworzKatalogElementow(page);
  await page.getByRole("button", { name: /Rozdział/ }).click();
  await page.getByRole("button", { name: /^Rozdzielnica$/ }).last().click();
  box = await planBox(page);
  await page.mouse.click(box.x + 200, box.y + 335); // dolna sciana, srodek

  // gniazdo przy PRAWEJ scianie — jego trasa idzie dolem w prawo, przez cala sciane
  await otworzKatalogElementow(page);
  await page.getByRole("button", { name: /Gniazda i zasilanie/ }).click();
  await otworzKatalogElementow(page);
  await page.getByRole("button", { name: /Gniazdo 230 V/ }).first().click();
  box = await planBox(page);
  await page.mouse.click(box.x + 455, box.y + 200);

  // oprawa na srodku — jej trasa idzie dolem w prawo tylko KAWALEK, potem w gore
  await otworzKatalogElementow(page);
  await page.getByRole("button", { name: /Oświetlenie/ }).first().click();
  await page.getByRole("button", { name: /Punkt sufitowy/ }).first().click();
  box = await planBox(page);
  await page.mouse.click(box.x + 300, box.y + 180);
  await page.waitForTimeout(400);

  await page.getByRole("button", { name: "Zaznacz", exact: true }).click();
  await page.getByRole("button", { name: "Pokaż trasy przewodów" }).click();
  await page.waitForTimeout(400);

  const trasy = await page.evaluate(() => {
    const konva = (
      window as unknown as { Konva?: { stages: { find(sel: string): { opacity(): number; points(): number[]; stroke(): string }[] }[] } }
    ).Konva;
    const linie = (konva?.stages?.[0]?.find("Line") ?? []).filter((l) => Math.abs(l.opacity() - 0.9) < 0.01);
    return linie.map((l) => {
      const pts: { x: number; y: number }[] = [];
      const raw = l.points();
      for (let i = 0; i < raw.length; i += 2) pts.push({ x: raw[i], y: raw[i + 1] });
      // najdluzszy odcinek POZIOMY trasy — to jest jej przebieg dolna sciana
      let best: { y: number; dl: number } | null = null;
      for (let i = 1; i < pts.length; i++) {
        if (Math.abs(pts[i].y - pts[i - 1].y) > 0.5) continue;
        const dl = Math.abs(pts[i].x - pts[i - 1].x);
        if (!best || dl > best.dl) best = { y: pts[i].y, dl };
      }
      return { stroke: l.stroke(), poziomy: best, koniec: pts[pts.length - 1] };
    });
  });

  expect(trasy).toHaveLength(2);
  const [gniazda, swiatlo] = [...trasy].sort((a, b) => b.koniec.x - a.koniec.x); // gniazdo stoi przy PRAWEJ scianie
  expect(gniazda.poziomy).not.toBeNull();
  expect(swiatlo.poziomy).not.toBeNull();

  // Rozne pasy: gdyby rozsuwanie nie zadzialalo, oba przebiegi mialyby to samo y.
  expect(Math.abs(gniazda.poziomy!.y - swiatlo.poziomy!.y)).toBeGreaterThan(1);
  // Gniazda BLIZEJ dolnej sciany, czyli WIEKSZE y (os y rosnie w dol).
  expect(gniazda.poziomy!.y).toBeGreaterThan(swiatlo.poziomy!.y);
  // ...i to obwody, nie jeden kabel: kolory tez sie roznia
  expect(gniazda.stroke).not.toBe(swiatlo.stroke);
});

/**
 * Zgloszenie uzytkownika: przewod do oprawy szedl do konca sciany i dopiero tam
 * skrecal, a na koniec wchodzil do niej ukosem. Do opraw ma isc POD KATEM PROSTYM,
 * odbijajac od sciany na wysokosci samej oprawy.
 */
test("trasa do oprawy odbija na jej wysokosci i wchodzi POD KATEM PROSTYM", async ({ page }) => {
  await openPlan(page);

  await page.getByRole("button", { name: "Narysuj Pomieszczenie", exact: true }).click();
  await page.getByRole("button", { name: "Prostokąt" }).click();
  let box = await planBox(page);
  await page.mouse.move(box.x + 80, box.y + 60);
  await page.mouse.down();
  await page.mouse.move(box.x + 460, box.y + 340, { steps: 8 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Dodaj pomieszczenie" }).click();
  await page.waitForTimeout(300);

  await page.getByRole("button", { name: "Wstaw Element" }).click();
  await otworzKatalogElementow(page);
  await page.getByRole("button", { name: /Rozdział/ }).click();
  await page.getByRole("button", { name: /^Rozdzielnica$/ }).last().click();
  box = await planBox(page);
  await page.mouse.click(box.x + 110, box.y + 335); // dolna sciana, lewy dol

  // Oprawa BLIZEJ prawej sciany niz dolnej — ale to dolna daje krotsza cala trase.
  await otworzKatalogElementow(page);
  await page.getByRole("button", { name: /Oświetlenie/ }).first().click();
  await page.getByRole("button", { name: /Punkt sufitowy/ }).first().click();
  box = await planBox(page);
  await page.mouse.click(box.x + 400, box.y + 230);
  await page.waitForTimeout(400);

  await page.getByRole("button", { name: "Zaznacz", exact: true }).click();
  await page.getByRole("button", { name: "Pokaż trasy przewodów" }).click();
  await page.waitForTimeout(400);

  const punkty = await page.evaluate(() => {
    const konva = (
      window as unknown as { Konva?: { stages: { find(sel: string): { opacity(): number; points(): number[] }[] }[] } }
    ).Konva;
    const trasy = (konva?.stages?.[0]?.find("Line") ?? []).filter((l) => Math.abs(l.opacity() - 0.9) < 0.01);
    const raw = trasy[0]?.points() ?? [];
    const out: { x: number; y: number }[] = [];
    for (let i = 0; i < raw.length; i += 2) out.push({ x: raw[i], y: raw[i + 1] });
    return out;
  });

  expect(punkty.length).toBeGreaterThanOrEqual(3);
  // Kazdy odcinek POZA pierwszym jest pionowy albo poziomy — zaden ukos, takze ten
  // koncowy, ktory wczesniej scinal zakret tuz przy symbolu. Pierwszy jest wyjatkiem
  // z innego powodu: to przylaczenie do OBUDOWY rozdzielnicy, ktore ma wlasny skos
  // (patrz `zakonczPrzyNozce`) — regula "pod katem prostym" dotyczy dojscia do oprawy.
  for (let i = 2; i < punkty.length; i++) {
    const dx = Math.abs(punkty[i].x - punkty[i - 1].x);
    const dy = Math.abs(punkty[i].y - punkty[i - 1].y);
    if (dx < 0.5 && dy < 0.5) continue;
    expect(Math.min(dx, dy)).toBeLessThan(0.5);
  }
  // Odbicie nastepuje na wysokosci oprawy, a nie przy koncu sciany: ostatni odcinek
  // jest pionowy i zaczyna sie tam, gdzie trasa opuszcza dolna sciane.
  const ostatni = punkty[punkty.length - 1];
  const przedOstatnim = punkty[punkty.length - 2];
  expect(Math.abs(ostatni.x - przedOstatnim.x)).toBeLessThan(0.5);
  // ...i nie doszla po drodze do prawej sciany pokoju
  expect(Math.max(...punkty.map((p) => p.x))).toBeLessThan(500);
});

/** Rysuje prostokatne pomieszczenie — box mierzony na nowo tuz przed przeciagnieciem,
 *  bo wejscie w tryb „Pomieszczenie" dokłada nad plotnem pasek wyboru ksztaltu. */
async function rysujPokoj(page: import("@playwright/test").Page, x1: number, y1: number, x2: number, y2: number) {
  await page.getByRole("button", { name: "Narysuj Pomieszczenie", exact: true }).click();
  await page.getByRole("button", { name: "Prostokąt" }).click();
  const box = await planBox(page);
  await page.mouse.move(box.x + x1, box.y + y1);
  await page.mouse.down();
  await page.mouse.move(box.x + x2, box.y + y2, { steps: 8 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Dodaj pomieszczenie" }).click();
  await page.waitForTimeout(400);
}

/**
 * Dwa pomieszczenia stykajace sie sciana x = 270 (ekran): rozdzielnica w GLEBI pokoju 1,
 * gniazdo przy wspolnej scianie w pokoju 2. Uklad dobrany tak, zeby przejscie otworem
 * bylo wyraznie krotsze niz obejscie naroznikiem — inaczej test nie odroznialby jednego
 * od drugiego. Parametr decyduje, czy otwor w ogole jest.
 *
 * ROZDZIELNICA CELOWO NIE DOTYKA wspolnej sciany. Przyklejona do niej stalaby W TYM
 * MURZE — jej punkt wyjscia (obudowa, patrz `punktPrzyscienny`) lezy wtedy dokladnie na
 * linii styku, wiec przewod wchodzi do korytarza pokoju 2 od razu, nie majac czego
 * przekraczac. To poprawne zachowanie (kabel jest w tej scianie), ale wtedy ten test nie
 * sprawdzalby juz niczego o otworach.
 */
async function dwaPokoje(page: import("@playwright/test").Page, zDrzwiami: boolean) {
  await openPlan(page);
  await rysujPokoj(page, 80, 60, 270, 340);
  await rysujPokoj(page, 270, 60, 460, 340);

  if (zDrzwiami) {
    await page.getByRole("button", { name: "Drzwi i okna", exact: true }).click();
    const box = await planBox(page);
    // Dwa piksele od linii styku: klik DOKLADNIE w nia trafia w martwa strefe miedzy
    // obszarami klikalnymi obu pomieszczen i nie stawia nic.
    await page.mouse.click(box.x + 268, box.y + 200);
    await page.waitForTimeout(900);
  }

  await page.getByRole("button", { name: "Wstaw Element" }).click();
  await otworzKatalogElementow(page);
  await page.getByRole("button", { name: /Rozdział/ }).click();
  await page.getByRole("button", { name: /^Rozdzielnica$/ }).last().click();
  let box = await planBox(page);
  await page.mouse.click(box.x + 200, box.y + 140); // pokoj 1, z dala od kazdej ze scian

  await otworzKatalogElementow(page);
  await page.getByRole("button", { name: /Gniazda i zasilanie/ }).click();
  await otworzKatalogElementow(page);
  await page.getByRole("button", { name: /Gniazdo 230 V/ }).first().click();
  box = await planBox(page);
  await page.mouse.click(box.x + 282, box.y + 265); // pokoj 2, przy tej samej scianie
  await page.waitForTimeout(400);

  await page.getByRole("button", { name: "Zaznacz", exact: true }).click();
  await page.getByRole("button", { name: "Pokaż trasy przewodów" }).click();
  await page.waitForTimeout(400);

  return page.evaluate(() => {
    const konva = (
      window as unknown as { Konva?: { stages: { find(sel: string): { opacity(): number; points(): number[]; dash(): number[] | undefined }[] }[] } }
    ).Konva;
    const [linia] = (konva?.stages?.[0]?.find("Line") ?? []).filter((l) => Math.abs(l.opacity() - 0.9) < 0.01);
    const pts: { x: number; y: number }[] = [];
    const raw = linia?.points() ?? [];
    for (let i = 0; i < raw.length; i += 2) pts.push({ x: raw[i], y: raw[i + 1] });
    const draft = JSON.parse(localStorage.getItem("pomocnikelektryka_projekt_" + localStorage.getItem("pomocnikelektryka_projekt_biezacy"))!).draft;
    return { pts, dashed: (linia?.dash()?.length ?? 0) > 0, otwory: draft.openings, pokoje: draft.roomShapes };
  });
}

/**
 * Wysokosci, na ktorych trasa przekracza pionowa sciane o podanym x. Liczone na
 * ODCINKACH, nie na punktach: przez mur przechodzi ten odcinek, ktorego konce leza po
 * jego dwoch stronach — samo „byc blisko" to jeszcze nie przejscie.
 *
 * Punkt lezacy DOKLADNIE na murze nie liczy sie do zadnej strony. To nie detal:
 * osprzet przyscienny dotyka sciany obudowa/nozka, wiec trasa zaczyna sie i konczy
 * na samej linii muru — bez tego kazde takie przylaczenie wygladalo jak przejscie
 * na druga strone.
 */
function przejsciaPrzezMur(pts: { x: number; y: number }[], mur: number): number[] {
  const strona = (x: number) => (x < mur - 0.5 ? -1 : x > mur + 0.5 ? 1 : 0);
  const out: number[] = [];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (strona(a.x) * strona(b.x) !== -1) continue;
    out.push(a.y + ((mur - a.x) / (b.x - a.x)) * (b.y - a.y));
  }
  return out;
}

/**
 * Otwor dokłada DODATKOWA droge miedzy pomieszczeniami. Sciana sama w sobie nie jest
 * przeszkoda — elektryk przewierca sie przez nia — ale gdy drzwi leza blizej niz
 * narozniki, przewod idzie przez nie zamiast obchodzic pokoj.
 */
test("z drzwiami we wspolnej scianie trasa przechodzi przez OTWOR", async ({ page }) => {
  const { pts, dashed, otwory } = await dwaPokoje(page, true);
  expect(otwory).toHaveLength(1);
  expect(dashed).toBe(false); // trasa policzona po geometrii, nie szacunek

  const przejscia = przejsciaPrzezMur(pts, otwory[0].x);
  expect(przejscia).toHaveLength(1);
  expect(przejscia[0]).toBeCloseTo(otwory[0].y, 0);
});

/**
 * Bez otworu przewod i tak przechodzi z pokoju do pokoju — przewiercajac sciane, tak
 * jak robi to elektryk. Trasa zostaje CIAGLA (policzona po geometrii), tylko mur
 * przekracza w narozniku, a nie w drzwiach.
 */
test("bez drzwi trasa nadal laczy pokoje — przewod idzie przez mur", async ({ page }) => {
  const { pts, dashed, otwory, pokoje } = await dwaPokoje(page, false);
  expect(otwory).toHaveLength(0);
  expect(dashed).toBe(false);

  // Wspolna sciana to prawa krawedz pierwszego pomieszczenia.
  const mur = Math.max(...pokoje[0].points.map((p: { x: number }) => p.x));
  const przejscia = przejsciaPrzezMur(pts, mur);
  expect(przejscia).toHaveLength(1);
  // Bez drzwi przejscie wypada przy NAROZNIKU — daleko od srodka wspolnej sciany.
  const gora = Math.min(...pokoje[0].points.map((p: { y: number }) => p.y));
  const dol = Math.max(...pokoje[0].points.map((p: { y: number }) => p.y));
  const odNaroznika = Math.min(Math.abs(przejscia[0] - gora), Math.abs(przejscia[0] - dol));
  expect(odNaroznika).toBeLessThan((dol - gora) / 4);
});

/**
 * Trasy w EKSPORCIE nie zależą od przełącznika w pasku edytora.
 *
 * Eksport rasteryzuje scenę taką, jaka jest, więc przewody trafiały na kartkę tylko
 * wtedy, gdy akurat były włączone w edytorze — a przełącznik jest domyślnie WYŁĄCZONY.
 * Łatwo było wysłać komuś rzut bez ani jednego kabla i tego nie zauważyć: w podglądzie
 * nic o tym nie mówiło. Teraz rzut do PDF-a domyślnie je ma, a zdjąć je można świadomie,
 * przełącznikiem NAD podglądem.
 */
test("PDF: rzut ma trasy mimo wyłączonego przełącznika w edytorze, a checkbox je zdejmuje", async ({ page }) => {
  await openPlan(page);

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
  await page.mouse.click(box.x + 250, box.y + 80);
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "Zaznacz", exact: true }).click();

  // Przełącznik edytora zostaje WYŁĄCZONY przez cały test — napis „Pokaż" to jego stan.
  const przelacznik = page.getByRole("button", { name: "Pokaż trasy przewodów" });
  await expect(przelacznik).toBeVisible();
  expect(await routeLineCounts(page)).toEqual({ solid: 0, dashed: 0 });

  const strony = page.locator("[data-podglad-stron] canvas");
  await page.getByRole("button", { name: "Rzut do PDF" }).click();
  await expect(strony.first()).toBeVisible({ timeout: 30000 });

  // Scena rysuje trasy NA CZAS eksportu, choć w edytorze są schowane...
  const wEksporcie = await routeLineCounts(page);
  expect(wEksporcie.solid + wEksporcie.dashed).toBeGreaterThan(0);
  // ...a skoro są trasy, dokument dostaje trzecią stronę: SPIS OBWODÓW.
  await expect(strony).toHaveCount(3);

  const checkbox = page.getByRole("checkbox", { name: /Trasy przewodów na rysunku/ });
  await expect(checkbox).toBeChecked(); // domyślnie WŁĄCZONE
  await checkbox.uncheck();

  // Bez tras nie ma czego spisywać — spis obwodów znika razem z nimi.
  await expect(strony).toHaveCount(2, { timeout: 30000 });
  expect(await routeLineCounts(page)).toEqual({ solid: 0, dashed: 0 });

  // Zamknięcie podglądu nie zostawia tras na scenie — przełącznik edytora dalej mówi „Pokaż".
  await checkbox.check();
  await expect(strony).toHaveCount(3, { timeout: 30000 });
  await page.getByRole("dialog").getByRole("button", { name: "Zamknij" }).last().click(); // ostatni = przycisk w stopce; „X” w rogu też ma teraz nazwę „Zamknij”
  expect(await routeLineCounts(page)).toEqual({ solid: 0, dashed: 0 });
  await expect(przelacznik).toBeVisible();
});
