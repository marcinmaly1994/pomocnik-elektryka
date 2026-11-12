import { test, expect } from "@playwright/test";
import { skipEntryScreen, otworzKatalogElementow } from "./_flow";

/**
 * Grupy sterowania oświetleniem. Testowane e2e, bo wartość tej funkcji leży w spięciu
 * trzech rzeczy naraz: automatycznego przypisania (logika), numeru narysowanego przy
 * obu elementach (Konva) i ręcznej zmiany z okna edycji — samo `computeLightGroups`
 * przechodzi testom jednostkowym nawet gdyby żadna z tych warstw nie była podpięta.
 */

async function planBox(page: import("@playwright/test").Page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  return (await page.locator("[data-testid=plan-okno]").first().boundingBox())!;
}

/** Rysuje prostokątne pomieszczenie, żeby elementy dostały nazwę pokoju — potrzebne
 *  tam, gdzie test celowo sprawdza dwa RÓŻNE pokoje. Samo grupowanie działa też bez
 *  pomieszczenia (patrz test „…bez narysowanego pomieszczenia" niżej i NO_ROOM w
 *  lib/lightGroups.ts). */
async function drawRoom(page: import("@playwright/test").Page, x1: number, y1: number, x2: number, y2: number) {
  // Płótno mierzymy DOPIERO po przełączeniu narzędzia: wejście w tryb „Pomieszczenie"
  // dokłada do paska wybór kształtu, co zsuwa płótno w dół. Pomiar zrobiony wcześniej
  // dawał współrzędne przesunięte względem tych, w które później klikamy — pomieszczenie
  // powstawało obok elementów i te lądowały „Bez pomieszczenia", czyli poza grupowaniem.
  await page.getByRole("button", { name: "Narysuj Pomieszczenie", exact: true }).click();
  await page.getByRole("button", { name: "Prostokąt" }).click();
  const box = await planBox(page);
  // Wejście w tryb rysowania dokłada do paska wybór kształtu, przez co płótno zjeżdża o
  // ~46 px — łatwo wtedy wyjść dragiem poza okno, a wtedy nie powstaje żadne
  // pomieszczenie i test wisi na oknie „Nazwij pomieszczenie" zamiast powiedzieć dlaczego.
  const vh = page.viewportSize()!.height;
  expect(box.y + y2, "przeciągnięcie musi zmieścić się w oknie").toBeLessThan(vh);

  await page.mouse.move(box.x + x1, box.y + y1);
  await page.mouse.down();
  await page.mouse.move(box.x + x2, box.y + y2, { steps: 6 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Dodaj pomieszczenie" }).click();
  // Zakładka panelu podąża za wybranym narzędziem — po „Narysuj Pomieszczenie” panel
  // biblioteki elementów jest schowany. Każde wywołanie tego helpera w tym pliku
  // kończy się od razu stawianiem elementów w narysowanym pomieszczeniu, więc powrót
  // do „Wstaw Element” należy tu, a nie osobno przy każdym wywołaniu.
  await page.getByRole("button", { name: "Wstaw Element" }).click();
}

async function place(page: import("@playwright/test").Page, name: RegExp, x: number, y: number) {
  // Zakładka panelu podąża teraz za wybranym narzędziem (Pomieszczenia po „Obrysuj
  // pomieszczenie”, Elementy po „Wstaw element”) — po narysowaniu pomieszczenia panel
  // biblioteki elementów jest więc SCHOWANY, dopóki jawnie nie wrócimy do „Wstaw
  // Element”. Bez tego kliknięcia przycisk z nazwą elementu w ogóle nie istnieje w DOM.
  await page.getByRole("button", { name: "Wstaw Element" }).click();
  // Wybór elementu przełącza narzędzie na „Elementy", co ZWIJA pasek wyboru kształtu i
  // podnosi płótno z powrotem o ~46 px. Dlatego mierzymy je dopiero po kliknięciu w
  // bibliotekę — pomiar wcześniejszy przesuwał wszystkie elementy w dół względem
  // narysowanego pomieszczenia, przez co wypadały poza nie i traciły grupę.
  await page.getByRole("button", { name }).first().click();
  const box = await planBox(page);
  await page.mouse.click(box.x + x, box.y + y);
}

/**
 * Dwuklik w element wskazany przez TYP, a nie przez zapamiętany offset ekranowy.
 *
 * Odkąd widok dopasowuje powiększenie do okna, ten sam offset nie odpowiada już
 * tej samej współrzędnej planu — a symbol to cienka kreska, więc chybienie o jedną
 * jednostkę wystarczy, żeby dwuklik nie trafił. Liczymy pozycję z rzeczywistych
 * danych elementu i bieżącej skali sceny.
 */
async function dwuklikWElement(page: import("@playwright/test").Page, typ: string) {
  await page.waitForTimeout(900); // debounce autozapisu — stąd bierzemy pozycję
  const el = await page.evaluate((t) => {
    const d = JSON.parse(localStorage.getItem("pomocnikelektryka_projekt_" + localStorage.getItem("pomocnikelektryka_projekt_biezacy"))!);
    return d.draft.elements.find((e: { type: string }) => e.type === t) ?? null;
  }, typ);
  if (!el) throw new Error(`Nie ma elementu typu ${typ} w projekcie`);
  const box = await planBox(page);
  const skala = await page.evaluate(() => {
    const k = (window as unknown as { Konva: { stages: { scaleX(): number }[] } }).Konva;
    return k.stages[0].scaleX();
  });
  await page.mouse.dblclick(box.x + el.x * skala, box.y + el.y * skala);
}

/** Numery grup wprost ze stanu aplikacji, przez ten sam moduł, z którego korzysta UI. */
async function groups(page: import("@playwright/test").Page) {
  await page.waitForTimeout(900); // debounce autozapisu
  return page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem("pomocnikelektryka_projekt_" + localStorage.getItem("pomocnikelektryka_projekt_biezacy"))!);
    return d.draft.elements.map((e: { type: string; lightGroup?: (number | null)[] }) => ({
      type: e.type,
      manual: e.lightGroup ?? null,
    }));
  });
}

test("łącznik i światło w jednym pomieszczeniu dostają ten sam numer na planie", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Instalacja" }).click();
  await skipEntryScreen(page);

  await drawRoom(page, 60, 40, 380, 250);
  await otworzKatalogElementow(page);
  await page.getByRole("button", { name: /Łączniki i sterowanie/ }).click();
  await place(page, /Łącznik jednobiegunowy/, 100, 80);
  await otworzKatalogElementow(page);
  await page.getByRole("button", { name: /Oświetlenie/ }).first().click();
  await place(page, /Punkt sufitowy/, 300, 210);

  // Numery odczytane z FAKTYCZNIE narysowanych węzłów Konvy, nie z samej logiki —
  // inaczej test przechodziłby nawet gdyby etykiety w ogóle nie były renderowane.
  const badges = await page.evaluate(() => {
    const konva = (window as unknown as { Konva?: { stages: { find(sel: string): { text(): string }[] }[] } }).Konva;
    const stage = konva?.stages?.[0];
    if (!stage) return null;
    // etykiety grup to jedyne teksty na planie będące samą liczbą
    return stage
      .find("Text")
      .map((t) => t.text())
      .filter((t) => /^\d+$/.test(t));
  });
  expect(badges).not.toBeNull();
  expect(badges!).toHaveLength(2); // po jednej cyfrze przy łączniku i przy punkcie
  expect(new Set(badges!).size).toBe(1); // i jest to TA SAMA cyfra

  const els = await groups(page);
  expect(els).toHaveLength(2);
  expect(els.every((e: { manual: number | null }) => e.manual === null)).toBe(true);
});

test("łącznik i światło numerują się też bez narysowanego pomieszczenia", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Instalacja" }).click();
  await skipEntryScreen(page);

  // Celowo BEZ drawRoom — elementy lądują z room = NO_ROOM ("Bez pomieszczenia").
  // Wcześniej numeracja w tym wypadku w ogóle się nie uruchamiała.
  await otworzKatalogElementow(page);
  await page.getByRole("button", { name: /Łączniki i sterowanie/ }).click();
  await place(page, /Łącznik jednobiegunowy/, 100, 80);
  await otworzKatalogElementow(page);
  await page.getByRole("button", { name: /Oświetlenie/ }).first().click();
  await place(page, /Punkt sufitowy/, 300, 210);

  const badges = await page.evaluate(() => {
    const konva = (window as unknown as { Konva?: { stages: { find(sel: string): { text(): string }[] }[] } }).Konva;
    const stage = konva?.stages?.[0];
    if (!stage) return null;
    return stage
      .find("Text")
      .map((t) => t.text())
      .filter((t) => /^\d+$/.test(t));
  });
  expect(badges).not.toBeNull();
  expect(badges!).toHaveLength(2); // po jednej cyfrze przy łączniku i przy punkcie
  expect(new Set(badges!).size).toBe(1); // i jest to TA SAMA cyfra
});

test("ręczna zmiana grupy z okna edycji nadpisuje automat", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Instalacja" }).click();
  await skipEntryScreen(page);

  await drawRoom(page, 60, 40, 380, 250);
  await otworzKatalogElementow(page);
  await page.getByRole("button", { name: /Łączniki i sterowanie/ }).click();
  await place(page, /Łącznik jednobiegunowy/, 100, 80);
  await otworzKatalogElementow(page);
  await page.getByRole("button", { name: /Oświetlenie/ }).first().click();
  await place(page, /Punkt sufitowy/, 300, 210);

  // dwuklik w światło otwiera edycję
  await page.getByRole("button", { name: "Zaznacz" }).click();
  await dwuklikWElement(page, "oswietlenie");
  await expect(page.getByText("Edytuj element")).toBeVisible();

  // Okno edycji ma teraz wiecej niz jedno pole liczbowe (doszla wysokosc montazu),
  // wiec pole grupy trzeba wskazac po nazwie, a nie "tym jedynym spinbuttonem".
  const groupField = page.getByRole("spinbutton", { name: "Grupa sterowania oświetleniem" });
  await expect(groupField).toBeVisible();
  // podpowiedź pokazuje numer dobrany automatycznie
  await expect(groupField).toHaveAttribute("placeholder", /auto: \d+/);

  await groupField.fill("9");
  await page.getByRole("button", { name: "Zapisz" }).click();

  const els = await groups(page);
  const light = els.find((e: { type: string }) => e.type === "oswietlenie")!;
  expect(light.manual).toEqual([9]);

  // wyczyszczenie pola przywraca automat
  await dwuklikWElement(page, "oswietlenie");
  await page.getByRole("spinbutton", { name: "Grupa sterowania oświetleniem" }).fill("");
  await page.getByRole("button", { name: "Zapisz" }).click();
  const after = await groups(page);
  expect(after.find((e: { type: string }) => e.type === "oswietlenie")!.manual).toBeNull();
});

test("łącznik grupowy ma DWA pola — po jednym na dźwignię, ustawialne osobno", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Instalacja" }).click();
  await skipEntryScreen(page);

  await drawRoom(page, 60, 40, 560, 250);
  await otworzKatalogElementow(page);
  await page.getByRole("button", { name: /Łączniki i sterowanie/ }).click();
  await place(page, /Łącznik grupowy/, 300, 210);
  await otworzKatalogElementow(page);
  await page.getByRole("button", { name: /Oświetlenie/ }).first().click();
  await place(page, /Punkt sufitowy/, 130, 90);
  await place(page, /Punkt sufitowy/, 470, 90);

  // na planie łącznik nosi dwie różne cyfry, po jednej przy każdej dźwigni
  const badges = await page.evaluate(() => {
    const konva = (window as unknown as { Konva?: { stages: { find(s: string): { text(): string }[] }[] } }).Konva;
    return konva!.stages[0]
      .find("Text")
      .map((t) => t.text())
      .filter((t) => /^\d+$/.test(t));
  });
  expect(badges).toHaveLength(4); // 2 przy łączniku + po 1 przy każdej lampie
  expect(new Set(badges).size).toBe(2); // dwa różne obwody

  await page.getByRole("button", { name: "Zaznacz" }).click();
  const box = await planBox(page);
  await page.mouse.dblclick(box.x + 300, box.y + 210);
  await expect(page.getByText("Edytuj element")).toBeVisible();

  const left = page.getByLabel("Grupa — obwód 1");
  const right = page.getByLabel("Grupa — obwód 2");
  await expect(left).toBeVisible();
  await expect(right).toBeVisible();

  // ustawiamy TYLKO prawą dźwignię — lewa ma zostać automatyczna
  await right.fill("42");
  await page.getByRole("button", { name: "Zapisz" }).click();

  const els = await groups(page);
  const sw = els.find((e: { type: string }) => e.type === "wlacznikGrupowy")!;
  expect(sw.manual).toEqual([null, 42]);
});

test("pole grupy nie pojawia się przy elementach niezwiązanych z oświetleniem", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Instalacja" }).click();
  await skipEntryScreen(page);

  await place(page, /Gniazdo 230 V/, 150, 150);
  await page.getByRole("button", { name: "Zaznacz" }).click();
  const box = await planBox(page);
  await page.mouse.dblclick(box.x + 150, box.y + 150);
  await expect(page.getByText("Edytuj element")).toBeVisible();
  await expect(page.getByText("Grupa sterowania oświetleniem")).toHaveCount(0);
});
