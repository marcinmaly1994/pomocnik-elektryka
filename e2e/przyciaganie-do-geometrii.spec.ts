import { test, expect, type Page } from "@playwright/test";
import { skipEntryScreen, otworzMenuPaska, zamknijMenuPaska } from "./_flow";

/**
 * Przyciąganie rysowanego punktu do geometrii, która JUŻ jest na rzucie, oraz
 * robienie pomieszczenia z zamkniętej pętli ścian.
 *
 * Dwie strony tej samej luki. Przyciągały się dotąd wyłącznie pomieszczenia do
 * pomieszczeń: dorysowanie ścianki działowej do już postawionej ściany wymagało
 * trafienia co do piksela, a pokój rysowany wewnątrz gotowego obrysu ścian nie łapał
 * go wcale. Drogą w drugą stronę — z obrysu pokoju zrobić ścianę — dało się pójść od
 * dawna („Utwórz ścianę z obrysu"), ale z pętli ścian zrobić pokoju nie dało się
 * wcale, mimo że to WŁAŚNIE ta kolejność wychodzi po „Narysuj dom samodzielnie":
 * narzędzie ściany, obrys domu, a potem przewodnik każący „obrysować pomieszczenia",
 * czyli przejechać po raz drugi tę samą figurę.
 *
 * Testowane e2e, bo liczy się tu styk zdarzeń myszy na płótnie Konvy z tym, co
 * naprawdę wylądowało w zapisie — sam `snapDoGeometrii` ma testy jednostkowe.
 */

const PLOTNO = "[data-testid=plan-okno]";

async function otworzPlan(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Instalacja" }).click();
  await skipEntryScreen(page);
}

/** Box płótna mierzony PO wybraniu narzędzia i po powrocie na górę strony —
 *  kliknięcie narzędzia potrafi przesunąć stronę (patrz `openPlan` w wall-drawing). */
async function boxPlotna(page: Page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  return (await page.locator(PLOTNO).first().boundingBox())!;
}

async function sciany(page: Page) {
  await page.waitForTimeout(900); // debounce autozapisu (600 ms) + zapas
  return page.evaluate(() => {
    const raw = localStorage.getItem("pomocnikelektryka_projekt_" + localStorage.getItem("pomocnikelektryka_projekt_biezacy"));
    return JSON.parse(raw!).draft.walls as { id: string; points: { x: number; y: number }[] }[];
  });
}

async function pomieszczenia(page: Page) {
  await page.waitForTimeout(900);
  return page.evaluate(() => {
    const raw = localStorage.getItem("pomocnikelektryka_projekt_" + localStorage.getItem("pomocnikelektryka_projekt_biezacy"));
    return JSON.parse(raw!).draft.roomShapes as { name: string; points: { x: number; y: number }[] }[];
  });
}

/**
 * Rysuje prostokątną, ZAMKNIĘTĄ ścianę o podanych rogach (w pikselach względem
 * płótna) i zwraca box płótna. Domknięcie przez kliknięcie w pierwszy punkt —
 * tak samo, jak zamyka ją użytkownik.
 */
async function narysujPetleSciany(page: Page, box: { x: number; y: number }, w = 260, h = 200) {
  await page.mouse.click(box.x + 80, box.y + 60);
  await page.mouse.click(box.x + 80 + w, box.y + 60);
  await page.mouse.click(box.x + 80 + w, box.y + 60 + h);
  await page.mouse.click(box.x + 80, box.y + 60 + h);
  await page.mouse.click(box.x + 80, box.y + 60); // domknięcie
}

test.describe("przyciąganie do istniejącej geometrii", () => {
  /**
   * Bez przyciągania do siatki, bo to ONO ma tu nie mieć nic do rzeczy: chodzi
   * o dociągnięcie do konkretnej, już narysowanej ściany, a nie do najbliższego oczka.
   * Siatka domyślnie i tak jest wyłączona na wgranym podkładzie.
   */
  async function bezSiatki(page: Page) {
    await otworzMenuPaska(page, "Rysunek");
    const siatka = page.getByLabel("Przyciągaj do siatki");
    if (await siatka.isChecked()) await siatka.uncheck();
    // Panel menu lezy NAD kolumna narzedzi i nad plotnem, wiec zostawiony otwarty
    // przechwytywalby kliknięcia rysujące ściane.
    await zamknijMenuPaska(page);
  }

  test("punkt nowej ściany dociąga się do narożnika ściany już narysowanej", async ({ page }) => {
    await otworzPlan(page);
    await page.getByRole("button", { name: "Narysuj Ścianę", exact: true }).click();
    await bezSiatki(page);
    const box = await boxPlotna(page);

    await page.mouse.click(box.x + 100, box.y + 100);
    await page.mouse.click(box.x + 300, box.y + 100);
    await page.getByRole("button", { name: "Zakończ" }).click();
    const [pierwsza] = await sciany(page);

    // Nowa ścianka startuje KILKA PIKSELI obok końca tamtej — dotąd zostawała
    // tam, gdzie kliknięto, czyli ze szczeliną.
    await page.mouse.click(box.x + 304, box.y + 96);
    await page.mouse.click(box.x + 304, box.y + 250);
    await page.getByRole("button", { name: "Zakończ" }).click();

    const wszystkie = await sciany(page);
    expect(wszystkie).toHaveLength(2);
    const koniecPierwszej = pierwsza.points[1];
    expect(wszystkie[1].points[0]).toEqual(koniecPierwszej);
  });

  test("punkt nowej ściany dociąga się do KRAWĘDZI ściany, nie tylko do jej rogów", async ({ page }) => {
    await otworzPlan(page);
    await page.getByRole("button", { name: "Narysuj Ścianę", exact: true }).click();
    await bezSiatki(page);
    const box = await boxPlotna(page);

    await page.mouse.click(box.x + 100, box.y + 100);
    await page.mouse.click(box.x + 100, box.y + 300);
    await page.getByRole("button", { name: "Zakończ" }).click();
    const [pionowa] = await sciany(page);

    // Ścianka działowa dochodząca do POŁOWY tamtej ściany, kliknięta obok linii.
    await page.mouse.click(box.x + 104, box.y + 200);
    await page.mouse.click(box.x + 250, box.y + 200);
    await page.getByRole("button", { name: "Zakończ" }).click();

    const wszystkie = await sciany(page);
    // Ta sama współrzędna X co ściana pionowa — czyli punkt siedzi DOKŁADNIE na niej.
    expect(wszystkie[1].points[0].x).toBe(pionowa.points[0].x);
  });

  test("klik wyraźnie dalej od ściany NIE jest do niej dociągany", async ({ page }) => {
    await otworzPlan(page);
    await page.getByRole("button", { name: "Narysuj Ścianę", exact: true }).click();
    await bezSiatki(page);
    const box = await boxPlotna(page);

    await page.mouse.click(box.x + 100, box.y + 100);
    await page.mouse.click(box.x + 100, box.y + 300);
    await page.getByRole("button", { name: "Zakończ" }).click();
    const [pionowa] = await sciany(page);

    // Ponad metr od tamtej ściany — świadomie postawiony punkt obok, nie chybienie.
    await page.mouse.click(box.x + 180, box.y + 200);
    await page.mouse.click(box.x + 300, box.y + 200);
    await page.getByRole("button", { name: "Zakończ" }).click();

    const wszystkie = await sciany(page);
    expect(wszystkie[1].points[0].x).not.toBe(pionowa.points[0].x);
  });

  test("punkt rysowanego POMIESZCZENIA dociąga się do ściany", async ({ page }) => {
    await otworzPlan(page);
    await page.getByRole("button", { name: "Narysuj Ścianę", exact: true }).click();
    await bezSiatki(page);
    const box = await boxPlotna(page);
    await narysujPetleSciany(page, box);
    const [petla] = await sciany(page);

    // Obrys pokoju rysowany „na oko" wewnątrz gotowych ścian — rogi kilka pikseli
    // od rogów muru. Dotąd pokój nie łapał ściany wcale.
    await page.getByRole("button", { name: "Narysuj Pomieszczenie", exact: true }).click();
    await page.getByRole("button", { name: "Prostokąt" }).click();
    await page.mouse.move(box.x + 84, box.y + 64);
    await page.mouse.down();
    await page.mouse.move(box.x + 336, box.y + 256, { steps: 8 });
    await page.mouse.up();
    await page.getByRole("button", { name: "Dodaj pomieszczenie" }).click();

    const [pokoj] = await pomieszczenia(page);
    const rogiSciany = petla.points.slice(0, -1);
    const xSciany = new Set(rogiSciany.map((p) => p.x));
    const ySciany = new Set(rogiSciany.map((p) => p.y));
    // Każdy róg pokoju leży na linii muru — w obu osiach.
    for (const p of pokoj.points) {
      expect(xSciany.has(p.x)).toBe(true);
      expect(ySciany.has(p.y)).toBe(true);
    }
  });
});

test.describe("pomieszczenie z zamkniętej pętli ścian", () => {
  test("domknięcie obrysu proponuje zrobienie z niego pomieszczenia", async ({ page }) => {
    await otworzPlan(page);
    await page.getByRole("button", { name: "Narysuj Ścianę", exact: true }).click();
    const box = await boxPlotna(page);

    await expect(page.getByText("Obrys zamknięty")).toBeHidden();
    await narysujPetleSciany(page, box);
    await expect(page.getByText("Obrys zamknięty")).toBeVisible();
  });

  test("otwarta ściana nie dostaje propozycji — nie ma czego zamknąć", async ({ page }) => {
    await otworzPlan(page);
    await page.getByRole("button", { name: "Narysuj Ścianę", exact: true }).click();
    const box = await boxPlotna(page);

    await page.mouse.click(box.x + 100, box.y + 100);
    await page.mouse.click(box.x + 300, box.y + 100);
    await page.mouse.click(box.x + 300, box.y + 250);
    await page.getByRole("button", { name: "Zakończ" }).click();

    await expect(page.getByText("Obrys zamknięty")).toBeHidden();
  });

  test("pomieszczenie z pętli ma DOKŁADNIE ten sam obrys co ściana", async ({ page }) => {
    await otworzPlan(page);
    await page.getByRole("button", { name: "Narysuj Ścianę", exact: true }).click();
    const box = await boxPlotna(page);
    await narysujPetleSciany(page, box);
    const [petla] = await sciany(page);

    await page.getByRole("button", { name: "Zrób z niego pomieszczenie" }).click();
    // Idzie przez ZWYKŁE okno nazywania — typ pomieszczenia decyduje o regułach
    // doboru, więc pokój nie powstaje po cichu.
    await expect(page.getByText("Nazwij pomieszczenie")).toBeVisible();
    await page.keyboard.type("Kuchnia");
    await page.getByRole("button", { name: "Dodaj pomieszczenie" }).click();

    const pokoje = await pomieszczenia(page);
    expect(pokoje).toHaveLength(1);
    expect(pokoje[0].name).toBe("Kuchnia");
    // Ściana trzyma domknięcie jawnie (ostatni punkt = pierwszy), pomieszczenie ma
    // je dorozumiane — stąd `slice`.
    expect(pokoje[0].points).toEqual(petla.points.slice(0, -1));
  });

  test("propozycja gaśnie sama, gdy pętla dostanie pomieszczenie", async ({ page }) => {
    await otworzPlan(page);
    await page.getByRole("button", { name: "Narysuj Ścianę", exact: true }).click();
    const box = await boxPlotna(page);
    await narysujPetleSciany(page, box);

    await page.getByRole("button", { name: "Zrób z niego pomieszczenie" }).click();
    await page.keyboard.type("Kuchnia");
    await page.getByRole("button", { name: "Dodaj pomieszczenie" }).click();

    await expect(page.getByText("Obrys zamknięty")).toBeHidden();
  });

  test("Nie teraz odrzuca propozycję, ale operacja zostaje w menu kontekstowym", async ({ page }) => {
    await otworzPlan(page);
    await page.getByRole("button", { name: "Narysuj Ścianę", exact: true }).click();
    const box = await boxPlotna(page);
    await narysujPetleSciany(page, box);

    await page.getByRole("button", { name: "Odrzuć propozycję pomieszczenia" }).click();
    await expect(page.getByText("Obrys zamknięty")).toBeHidden();

    // PPM na murze — ta sama operacja, tylko bez pośpiechu.
    await page.getByRole("button", { name: "Zaznacz", exact: true }).click();
    await page.mouse.click(box.x + 210, box.y + 60, { button: "right" });
    await expect(page.getByTestId("menu-kontekstowe").getByRole("button", { name: "Utwórz pomieszczenie z obrysu" })).toBeVisible();
  });

  test("otwarta ściana nie ma w menu kontekstowym tworzenia pomieszczenia", async ({ page }) => {
    await otworzPlan(page);
    await page.getByRole("button", { name: "Narysuj Ścianę", exact: true }).click();
    const box = await boxPlotna(page);

    await page.mouse.click(box.x + 100, box.y + 100);
    await page.mouse.click(box.x + 300, box.y + 100);
    await page.getByRole("button", { name: "Zakończ" }).click();

    await page.getByRole("button", { name: "Zaznacz", exact: true }).click();
    await page.mouse.click(box.x + 200, box.y + 100, { button: "right" });
    await expect(page.getByTestId("menu-kontekstowe").getByRole("button", { name: "Usuń ścianę" })).toBeVisible();
    await expect(page.getByTestId("menu-kontekstowe").getByRole("button", { name: "Utwórz pomieszczenie z obrysu" })).toBeHidden();
  });
});

/**
 * Znacznik zaczepu ma być widoczny TAKŻE przy pierwszym punkcie figury — a to on
 * najczęściej startuje „od narożnika tamtej ściany". Wcześniej podgląd był liczony
 * dopiero po postawieniu pierwszego punktu, więc ten jeden przyciągał się niewidzialnie.
 *
 * Sprawdzane przez węzły sceny Konvy, bo znacznik jest rysunkiem na płótnie, nie DOM-em.
 */
async function znacznikiZaczepu(page: Page): Promise<number> {
  return page.evaluate(() => {
    const k = (window as unknown as { Konva?: { stages: { find(sel: string): { stroke(): string }[] }[] } }).Konva;
    const stage = k?.stages[0];
    if (!stage) return 0;
    // Kolor zaczepu — patrz znacznik w DesignCanvas.tsx.
    return [...stage.find("Rect"), ...stage.find("Circle")].filter((n) => n.stroke() === "#2C6B4A").length;
  });
}

test("zaczep widać już przy PIERWSZYM punkcie ściany, zanim cokolwiek postawiono", async ({ page }) => {
  await otworzPlan(page);
  await page.getByRole("button", { name: "Narysuj Ścianę", exact: true }).click();
  const box = await boxPlotna(page);

  await page.mouse.click(box.x + 100, box.y + 100);
  await page.mouse.click(box.x + 300, box.y + 100);
  await page.getByRole("button", { name: "Zakończ" }).click();

  // Kursor daleko od muru — nie ma czego podświetlać.
  await page.mouse.move(box.x + 200, box.y + 300);
  expect(await znacznikiZaczepu(page)).toBe(0);

  // Kursor tuż przy narożniku gotowej ściany, ANI JEDNEGO punktu nowej jeszcze nie ma.
  await page.mouse.move(box.x + 303, box.y + 103);
  expect(await znacznikiZaczepu(page)).toBeGreaterThan(0);
});

test("to samo w narzędziu pomieszczenia — przed pierwszym narożnikiem prostokąta", async ({ page }) => {
  await otworzPlan(page);
  await page.getByRole("button", { name: "Narysuj Ścianę", exact: true }).click();
  const box = await boxPlotna(page);
  await narysujPetleSciany(page, box);

  await page.getByRole("button", { name: "Narysuj Pomieszczenie", exact: true }).click();
  await page.getByRole("button", { name: "Prostokąt" }).click();
  await page.mouse.move(box.x + 83, box.y + 63);
  expect(await znacznikiZaczepu(page)).toBeGreaterThan(0);
});

/**
 * Propozycja „zrób z tego pomieszczenie" musi gasnąć także dla obrysu WKLĘSŁEGO.
 *
 * Sprawdzenie „czy pętla ma już pomieszczenie" pytało o średnią wierzchołków, a ta dla
 * litery U wypada w samym wcięciu — poza figurą. Pętla wyglądała więc na wolną nawet
 * tuż po zrobieniu z niej pokoju i dawało się utworzyć drugi, nakładający się.
 */
test("obrys w kształcie U przestaje prosić o pomieszczenie, gdy już je dostał", async ({ page }) => {
  await otworzPlan(page);
  await page.getByRole("button", { name: "Narysuj Ścianę", exact: true }).click();
  const box = await boxPlotna(page);

  // Litera U: wcięcie od góry, między lewym a prawym ramieniem.
  await page.mouse.click(box.x + 80, box.y + 60);
  await page.mouse.click(box.x + 340, box.y + 60);
  await page.mouse.click(box.x + 340, box.y + 260);
  await page.mouse.click(box.x + 260, box.y + 260);
  await page.mouse.click(box.x + 260, box.y + 140);
  await page.mouse.click(box.x + 160, box.y + 140);
  await page.mouse.click(box.x + 160, box.y + 260);
  await page.mouse.click(box.x + 80, box.y + 260);
  await page.mouse.click(box.x + 80, box.y + 60); // domknięcie

  await expect(page.getByText("Obrys zamknięty")).toBeVisible();
  await page.getByRole("button", { name: "Zrób z niego pomieszczenie" }).click();
  await page.keyboard.type("Salon");
  await page.getByRole("button", { name: "Dodaj pomieszczenie" }).click();

  // Pętla dostała swój pokój — propozycja gaśnie i menu kontekstowe jej nie wskrzesza.
  await expect(page.getByText("Obrys zamknięty")).toBeHidden();
  await page.getByRole("button", { name: "Zaznacz", exact: true }).click();
  await page.mouse.click(box.x + 210, box.y + 60, { button: "right" });
  await expect(page.getByRole("button", { name: "Utwórz pomieszczenie z obrysu" })).toBeHidden();
});

/**
 * ROZSTRZYGNIECIE PRODUKTOWE, nie przeoczenie.
 *
 * Przyciaganie do cudzej geometrii WYGRYWA z trybem „Ortogonalnie". Skutek uboczny
 * jest realny i zostal zaakceptowany: przy wlaczonym wymuszaniu katow prostych punkt,
 * ktory wypadnie w zasiegu naroznika sasiedniej sciany, odskoczy z osi i odcinek
 * wyjdzie lekko skosny.
 *
 * Wybrano to, bo dociagniecie do konkretnego, WIDOCZNEGO naroznika jest wskazaniem
 * MIEJSCA, a tryb ortogonalny tylko pomoca w trzymaniu osi — dokladnie tak samo
 * traktuje go domkniecie figury („niezaleznie od trybu ortogonalnego" w `zPrzyciaganiem`).
 *
 * Ten test jest tu po to, zeby nikt nie „naprawil" tego priorytetu jako bledu. Jesli
 * padnie, to znaczy, ze ktos go odwrocil — i powinien wrocic do tej decyzji, a nie
 * poprawiac test.
 */
test("przyciąganie do geometrii WYGRYWA z trybem ortogonalnym", async ({ page }) => {
  await otworzPlan(page);
  await page.getByRole("button", { name: "Narysuj Ścianę", exact: true }).click();
  const box = await boxPlotna(page);

  // Sciana odniesienia: pionowa, z wyraznym naroznikiem u dolu.
  await page.mouse.click(box.x + 300, box.y + 100);
  await page.mouse.click(box.x + 300, box.y + 240);
  await page.getByRole("button", { name: "Zakończ" }).click();
  const [odniesienie] = await sciany(page);
  const naroznik = odniesienie.points[1];

  // Nowa scianka z WLACZONYM wymuszaniem katow prostych, prowadzona poziomo —
  // drugi punkt kilka pikseli OBOK naroznika tamtej sciany.
  await page.getByTestId("wall-ortho-checkbox").check();
  await page.mouse.click(box.x + 120, box.y + 236);
  await page.mouse.click(box.x + 304, box.y + 236);
  await page.getByRole("button", { name: "Zakończ" }).click();

  const wszystkie = await sciany(page);
  const [start, koniec] = wszystkie[1].points;
  // Punkt wyladowal DOKLADNIE na narozniku sasiada — to on zadecydowal, nie kat prosty.
  expect(koniec).toEqual(naroznik);
  // I wlasnie dlatego odcinek NIE jest idealnie poziomy. To jest ta zaakceptowana cena.
  expect(koniec.y).not.toBe(start.y);
});

/**
 * Znacznik zaczepu ma STAŁY ROZMIAR NA EKRANIE, niezależny od powiększenia.
 *
 * Rysowany był w jednostkach planu, więc rósł razem z rzutem: przy powiększeniu 2×
 * kwadracik miał 24 px zamiast dziesięciu i zasłaniał narożnik, który miał wskazywać.
 * To ozdoba kursora, a nie element rysunku — w programach CAD takie znaczniki mają
 * rozmiar podany w pikselach ekranu i nie zmieniają się przy przybliżaniu.
 */
async function bokZnacznikaPx(page: Page): Promise<number> {
  return page.evaluate(() => {
    const stage = (
      window as unknown as {
        Konva: {
          stages: {
            find(sel: string): { stroke(): string; width(): number; radius?: () => number }[];
            scaleX(): number;
          }[];
        };
      }
    ).Konva.stages[0];
    const znaczniki = [...stage.find("Rect"), ...stage.find("Circle")].filter((n) => n.stroke() === "#2C6B4A");
    if (!znaczniki.length) return 0;
    const n = znaczniki[0];
    const bok = n.radius ? n.radius() * 2 : n.width();
    return Math.round(bok * stage.scaleX());
  });
}

/** Punkt planu na współrzędne ekranu — przez żywą transformację sceny. */
async function naEkranie(page: Page, x: number, y: number) {
  const box = await boxPlotna(page);
  const s = await page.evaluate(() => {
    const st = (window as unknown as { Konva: { stages: { scaleX(): number; x(): number; y(): number }[] } }).Konva
      .stages[0];
    return { skala: st.scaleX(), x: st.x(), y: st.y() };
  });
  return { x: box.x + x * s.skala + s.x, y: box.y + y * s.skala + s.y };
}

test("znacznik zaczepu nie rośnie razem z powiększeniem", async ({ page }) => {
  await otworzPlan(page);
  await page.getByRole("button", { name: "Narysuj Ścianę", exact: true }).click();
  const box = await boxPlotna(page);
  await page.mouse.click(box.x + 100, box.y + 100);
  await page.mouse.click(box.x + 250, box.y + 100);
  await page.getByRole("button", { name: "Zakończ" }).click();

  const rog = (await sciany(page))[0].points[1];

  /** Najeżdża na narożnik gotowej ściany i mierzy bok znacznika w pikselach ekranu. */
  async function zmierz() {
    await page.getByRole("button", { name: "Narysuj Ścianę", exact: true }).click();
    const p = await naEkranie(page, rog.x, rog.y);
    await page.mouse.move(p.x + 2, p.y + 2);
    await page.waitForTimeout(150);
    return bokZnacznikaPx(page);
  }

  const przyStarcie = await zmierz();
  expect(przyStarcie, "znacznik ma się w ogóle pojawić").toBeGreaterThan(0);
  // Ozdoba kursora, nie element rysunku: kilkanaście pikselów, nie kilkadziesiąt.
  expect(przyStarcie).toBeLessThanOrEqual(14);

  for (let i = 0; i < 6; i++) await page.getByRole("button", { name: "Przybliż widok" }).click();
  await page.waitForTimeout(300);

  expect(Math.abs((await zmierz()) - przyStarcie), "rozmiar na ekranie ma zostać ten sam").toBeLessThanOrEqual(1);
});

/**
 * Sygnał wyrównania: krótka kreska przy stawianym punkcie.
 *
 * Bez niego wyrównanie było niewidzialne — punkt siadał w linii z czymś, a z ekranu nie
 * dało się odczytać, czy to zasługa pomocy, czy celnej ręki. Linie przez cały rysunek
 * były pierwszą wersją i okazały się mylące: pokazywały poziom narożnika pod kursorem,
 * zamiast mówić cokolwiek o punkcie, który się właśnie stawia.
 */
async function znacznikiOsi(page: Page): Promise<number[][]> {
  return page.evaluate(() => {
    const stage = (
      window as unknown as { Konva?: { stages: { find(sel: string): { name(): string; points(): number[] }[] }[] } }
    ).Konva?.stages[0];
    if (!stage) return [];
    return stage
      .find("Line")
      .filter((l) => l.name().includes("znacznik-osi"))
      .map((l) => l.points());
  });
}

test("wyrównanie do osi daje krótką kreskę przy punkcie, nie linię przez rysunek", async ({ page }) => {
  await otworzPlan(page);
  await page.getByRole("button", { name: "Narysuj Ścianę", exact: true }).click();
  const box = await boxPlotna(page);

  // Pierwszy punkt ściany.
  await page.mouse.click(box.x + 120, box.y + 120);

  // Kursor daleko od jego osi — nie ma czego sygnalizować.
  await page.mouse.move(box.x + 260, box.y + 260);
  await page.waitForTimeout(150);
  expect(await znacznikiOsi(page)).toHaveLength(0);

  // Kursor W PIONIE z pierwszym punktem, ale wyraźnie niżej.
  await page.mouse.move(box.x + 122, box.y + 280);
  await page.waitForTimeout(150);
  const znaczniki = await znacznikiOsi(page);
  expect(znaczniki, "pion złapał, więc jedna kreska").toHaveLength(1);

  // Kreska jest KRÓTKA — kilkanaście pikselów, nie przez całe okno.
  const [x1, y1, x2, y2] = znaczniki[0];
  const dlugoscJedn = Math.hypot(x2 - x1, y2 - y1);
  const skala = await page.evaluate(
    () => (window as unknown as { Konva: { stages: { scaleX(): number }[] } }).Konva.stages[0].scaleX(),
  );
  expect(dlugoscJedn * skala).toBeLessThanOrEqual(20);
});

test("kąty proste działają też przy rysowaniu pomieszczenia", async ({ page }) => {
  await otworzPlan(page);
  await page.getByRole("button", { name: "Narysuj Pomieszczenie", exact: true }).click();
  await page.getByRole("button", { name: "Wielobok" }).click();

  const ortho = page.locator("[data-testid=room-ortho-checkbox]");
  await expect(ortho, "pomieszczenie ma mieć ten sam przełącznik co ściana").toBeVisible();
  await ortho.check();

  const box = await boxPlotna(page);
  await page.mouse.click(box.x + 100, box.y + 100);
  // Drugi punkt wyraźnie skośnie — tryb ortogonalny ma zamrozić oś bliższą poprzedniemu.
  await page.mouse.click(box.x + 300, box.y + 160);
  await page.mouse.click(box.x + 300, box.y + 320);
  await page.mouse.click(box.x + 100, box.y + 100);
  await expect(page.getByText("Nazwij pomieszczenie")).toBeVisible();
  await page.getByRole("button", { name: "Dodaj pomieszczenie" }).click();

  const punkty = (await pomieszczenia(page))[0].points;
  // Pierwszy bok wyszedł poziomy, mimo że klik był 60 px niżej.
  expect(punkty[1].y).toBeCloseTo(punkty[0].y, 6);
});
