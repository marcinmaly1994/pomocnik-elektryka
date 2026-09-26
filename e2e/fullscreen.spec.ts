import type Konva from "konva";
import { test, expect, type Page } from "@playwright/test";
import { skipEntryScreen, otworzMenuPaska, zamknijMenuPaska, odslonNarzedziaRysowania } from "./_flow";

/**
 * Tryb pełnoekranowy: plan dostaje całe okno pomniejszone o dwa niskie paski
 * poziome, a panel narzędzi chowa się za lewą krawędź i wraca po najechaniu myszą
 * albo zostaje przypięty.
 *
 * Chowa się WYŁĄCZNIE panel boczny — on jeden ma szerokość (~370 px), która realnie
 * zmienia ilość miejsca dla rysunku. Paski poziome (~46 i ~54 px) stoją na stałe:
 * odzysk był znikomy, a wysuwały się pod kursorem w trakcie pracy i wchodziły
 * w drogę przypiętym narzędziom.
 *
 * Testy mierzą FAKTYCZNE położenie paneli (`boundingBox`), a nie klasy CSS —
 * to jedyny sposób, żeby złapać przypadek, w którym transformacja jest zapisana
 * w atrybucie `style`, ale przeglądarka jej nie stosuje. Taki właśnie błąd
 * (schowany panel widoczny mimo poprawnego `style`) był realnym ryzykiem przy
 * pisaniu tej funkcji.
 */

/** Karta narzędzi (pionowy pasek + panel) — w pełnym ekranie wysuwana z lewej. */
function lewaKarta(page: Page) {
  return page.locator('nav[aria-label="Narzędzia rysowania"]').locator("..");
}

/** Pozycja X panelu; `expect.poll` czeka, aż animacja wysuwania się skończy. */
async function pozycjaX(locator: ReturnType<typeof lewaKarta>): Promise<number> {
  const box = await locator.boundingBox();
  return box ? Math.round(box.x) : NaN;
}

test("pełny ekran chowa panel narzędzi i oddaje planowi resztę okna", async ({ page }) => {
  await page.goto("/");
  await skipEntryScreen(page);

  const karta = lewaKarta(page);
  expect(await pozycjaX(karta)).toBeGreaterThanOrEqual(0);

  await page.getByRole("button", { name: "Projektowanie na pełnym ekranie" }).click();

  // Panel zjeżdża w całości poza lewą krawędź — ujemny X, nie tylko „mniejszy".
  await expect.poll(() => pozycjaX(karta), { timeout: 3000 }).toBeLessThan(0);

  // Paski poziome zostaja na stale (sa niskie, wiec odzysk bylby znikomy), ale plotno
  // i tak dostaje wiekszosc okna — znika naglowek, pasek etapow i cala reszta powloki.
  const wysOkna = page.viewportSize()!.height;
  const plotno = (await page.locator("[data-testid=plan-okno]").first().boundingBox())!;
  expect(plotno.height).toBeGreaterThan(wysOkna * 0.75);
});

test("najechanie na lewą krawędź wysuwa narzędzia, odjechanie chowa je z powrotem", async ({ page }) => {
  await page.goto("/");
  await skipEntryScreen(page);
  await page.getByRole("button", { name: "Projektowanie na pełnym ekranie" }).click();

  const karta = lewaKarta(page);
  await expect.poll(() => pozycjaX(karta), { timeout: 3000 }).toBeLessThan(0);

  // Kursor na sam brzeg okna — tam leży pas wyzwalający.
  const wys = page.viewportSize()!.height;
  await page.mouse.move(2, Math.round(wys / 2));
  await expect.poll(() => pozycjaX(karta), { timeout: 3000 }).toBeGreaterThanOrEqual(0);

  // Zjazd myszą na środek płótna chowa panel z powrotem.
  await page.mouse.move(Math.round(page.viewportSize()!.width / 2), Math.round(wys / 2));
  await expect.poll(() => pozycjaX(karta), { timeout: 3000 }).toBeLessThan(0);
});

test("Escape wychodzi z pełnego ekranu, ale najpierw porzuca rozpoczęty rysunek", async ({ page }) => {
  await page.goto("/");
  await skipEntryScreen(page);
  await page.getByRole("button", { name: "Projektowanie na pełnym ekranie" }).click();
  const karta = lewaKarta(page);
  await expect.poll(() => pozycjaX(karta), { timeout: 3000 }).toBeLessThan(0);

  // Zaczynamy ścianę: pierwszy Escape ma porzucić JĄ, a nie wyrzucić z trybu.
  await page.mouse.move(2, Math.round(page.viewportSize()!.height / 2));
  await expect.poll(() => pozycjaX(karta), { timeout: 3000 }).toBeGreaterThanOrEqual(0);
  // Nazwa z PODPISU przycisku, nie z `title` — treść wygrywa z tytułem przy
  // wyliczaniu nazwy dostępnościowej (tak samo selekcjonują pozostałe testy).
  await page.getByRole("button", { name: "Narysuj Ścianę", exact: true }).click();

  // Po wyborze narzędzia kursor stoi NAD panelem, więc panel jest nadal wysunięty
  // i zasłania lewą część planu. Odsuwamy mysz i czekamy, aż się schowa — inaczej
  // kliknięcia „w plan" trafiłyby w panel.
  await page.mouse.move(Math.round(page.viewportSize()!.width / 2), Math.round(page.viewportSize()!.height / 2));
  await expect.poll(() => pozycjaX(karta), { timeout: 3000 }).toBeLessThan(0);

  const plotno = (await page.locator("[data-testid=plan-okno]").first().boundingBox())!;
  await page.mouse.click(plotno.x + 500, plotno.y + 150);
  await page.mouse.click(plotno.x + 620, plotno.y + 150);
  await expect(page.getByText(/Rysowanie ściany: 2 pkt\./)).toBeVisible();

  await page.keyboard.press("Escape");
  // rysunek porzucony…
  await expect(page.getByText(/Rysowanie ściany: 2 pkt\./)).toHaveCount(0);
  // …ale tryb pełnoekranowy trwa
  await expect(page.getByRole("button", { name: "Wyjdź z pełnego ekranu" })).toBeVisible();

  // Dopiero drugi Escape wychodzi z trybu.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Wyjdź z pełnego ekranu" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Projektowanie na pełnym ekranie" })).toBeVisible();
});

/**
 * DOTKNIĘCIEM, nie kliknięciem myszy — i to jest jedyny sposób, żeby ten test
 * w ogóle coś znaczył.
 *
 * Powód, dla którego uchwyt jest przyciskiem, a nie samą dekoracją, brzmi: „na
 * tablecie nie ma najeżdżania myszą". Myszą nie da się tego sprawdzić, bo ruch
 * kursora na uchwyt sam wysuwa panel (`PAS_WYZWALAJACY`, patrz
 * `odslonNarzedziaRysowania`) — kliknięcie i najechanie dają ten sam skutek, więc
 * test przechodził niezależnie od tego, czy `onClick` w ogóle istnieje. Gorzej:
 * przegrywał przy tym wyścig z własnym ruchem myszy i wywrócił CI.
 *
 * Palec nie wysyła `mousemove` przed dotknięciem. Dopiero on odróżnia jedną drogę
 * od drugiej — i dopiero on odpowiada temu, co w komentarzu obiecywał tablet.
 */
test.describe("uchwyt otwierany dotykiem", () => {
  test.use({ hasTouch: true });

  test("uchwyt przy lewej krawędzi zapowiada schowane narzędzia i otwiera je dotknięciem", async ({ page }) => {
    await page.goto("/");
    await skipEntryScreen(page);
    await page.getByRole("button", { name: "Projektowanie na pełnym ekranie" }).click();

    // Uchwyt to jedyny sygnał, że coś tam jest — bez niego tryb wygląda jak plan
    // bez narzędzi. Musi być widoczny od razu po wejściu, bez ruszania myszą.
    const uchwyt = page.getByRole("button", { name: "Pokaż narzędzia rysowania" });
    await expect(uchwyt).toBeVisible();
    await expect(uchwyt).toContainText("Narzędzia");

    const karta = lewaKarta(page);
    await expect.poll(() => pozycjaX(karta), { timeout: 3000 }).toBeLessThan(0);

    await uchwyt.tap();
    await expect.poll(() => pozycjaX(karta), { timeout: 3000 }).toBeGreaterThanOrEqual(0);

    // Gdy panel jest już wysunięty, uchwyt nie ma czego zapowiadać.
    await expect(uchwyt).toHaveCount(0);
  });
});

test("uchwyt mieści się w pasie wyzwalającym — najechanie na niego wysuwa panel", async ({ page }) => {
  await page.goto("/");
  await skipEntryScreen(page);
  await page.getByRole("button", { name: "Projektowanie na pełnym ekranie" }).click();

  const uchwyt = page.getByRole("button", { name: "Pokaż narzędzia rysowania" });
  const box = (await uchwyt.boundingBox())!;

  // Sedno: kursor na PRAWEJ krawędzi uchwytu, czyli najdalszym jego punkcie.
  // Gdyby uchwyt był szerszy niż pas wyzwalający, celowanie w widoczny element
  // nie dawałoby efektu — a to najgorszy rodzaj kontrolki.
  await page.mouse.move(box.x + box.width - 1, box.y + box.height / 2);
  await expect.poll(() => pozycjaX(lewaKarta(page)), { timeout: 3000 }).toBeGreaterThanOrEqual(0);
});

test("pasek kontrolek stoi tuż nad płótnem, bez pustego rzędu pod spodem", async ({ page }) => {
  await page.goto("/");
  await skipEntryScreen(page);

  // Kotwica to przycisk „Plan" — stoi wprost w pasku i jest widoczny zawsze. Dawne
  // celowanie w „Rozmiar elementów" przestalo dzialac, odkad ta kontrolka siedzi
  // w PANELU menu, ktory sam jest karta `rounded-card`.
  const pasek = (await page.getByRole("button", { name: "Plan", exact: true }).locator("xpath=ancestor::div[contains(@class,'rounded-card')][1]").boundingBox())!;
  const wiersz = (await page.locator('nav[aria-label="Narzędzia rysowania"]').locator("xpath=ancestor::div[contains(@class,'items-start')][1]").boundingBox())!;

  // Pusty rząd kontrolek kontekstowych ma znikać z układu (`empty:hidden`), a nie
  // zbierać margines z obu stron — inaczej wstawiał 32 px pustki między pasek
  // a płótno, mimo zerowej wysokości.
  const odstep = wiersz.y - (pasek.y + pasek.height);
  expect(odstep).toBeGreaterThanOrEqual(0);
  expect(odstep).toBeLessThan(12);
});

/** Grubość widocznego paska przewijania danego kontenera, w pikselach. Liczona
 *  z różnicy `offset*` i `client*` pomniejszonej o obramowanie — to jedyny sposób,
 *  żeby zmierzyć FAKTYCZNIE wyrenderowany suwak, a nie samą deklarację CSS. */
async function gruboscSuwakow(page: Page, selektor: string) {
  return page.locator(selektor).first().evaluate((el) => {
    const cs = getComputedStyle(el);
    const ramkaX = parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
    const ramkaY = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
    return {
      pion: Math.round(el.offsetWidth - el.clientWidth - ramkaX),
      poziom: Math.round(el.offsetHeight - el.clientHeight - ramkaY),
      maCoPrzewijac: el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1,
    };
  });
}

test("plan po przybliżeniu przewija się, ale bez widocznych suwaków", async ({ page }) => {
  await page.goto("/");
  await skipEntryScreen(page);

  // Przybliżamy, aż rysunek przestanie się mieścić w oknie — dopiero wtedy
  // przeglądarka ma powód, żeby pokazać suwaki.
  for (let i = 0; i < 12; i++) await page.getByRole("button", { name: "Przybliż widok" }).click();

  const plotno = await gruboscSuwakow(page, "[data-testid=plan-okno]");
  expect(plotno.maCoPrzewijac).toBe(true); // test miałby zerową wartość, gdyby nie było co przewijać
  expect(plotno.pion).toBe(0);
  expect(plotno.poziom).toBe(0);
});

test("panel narzędzi w pełnym ekranie ma JEDEN obszar przewijania, bez suwaków", async ({ page }) => {
  await page.goto("/");
  await skipEntryScreen(page);
  await page.getByRole("button", { name: "Projektowanie na pełnym ekranie" }).click();
  await odslonNarzedziaRysowania(page);
  await expect.poll(() => pozycjaX(lewaKarta(page)), { timeout: 3000 }).toBeGreaterThanOrEqual(0);

  // Zagnieżdżone przewijanie (panel + lista w środku) dawało dwa suwaki obok
  // siebie. Przewijać ma się WYŁĄCZNIE lista elementów.
  const przewijalne = await page.evaluate(() => {
    const out: { klasa: string; suwakPion: number; suwakPoziom: number }[] = [];
    for (const el of document.querySelectorAll("div,nav")) {
      const cs = getComputedStyle(el);
      if (!/auto|scroll/.test(cs.overflowY + cs.overflowX)) continue;
      const h = el as HTMLElement;
      if (!(el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1)) continue;
      out.push({
        klasa: typeof el.className === "string" ? el.className : "",
        suwakPion: Math.round(h.offsetWidth - el.clientWidth - (parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth))),
        suwakPoziom: Math.round(h.offsetHeight - el.clientHeight - (parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth))),
      });
    }
    return out;
  });

  // Ani jeden realnie przewijalny kontener nie może rysować paska.
  for (const k of przewijalne) {
    expect(k.suwakPion, `suwak pionowy w: ${k.klasa}`).toBe(0);
    expect(k.suwakPoziom, `suwak poziomy w: ${k.klasa}`).toBe(0);
  }
});

/** Wchodzi w pełny ekran i odsłania lewy panel uchwytem. */
async function odslonNarzedzia(page: Page) {
  await page.getByRole("button", { name: "Projektowanie na pełnym ekranie" }).click();
  await odslonNarzedziaRysowania(page);
  await expect.poll(() => pozycjaX(lewaKarta(page)), { timeout: 3000 }).toBeGreaterThanOrEqual(0);
}

test("przypięty panel zostaje na widoku po zjechaniu myszą", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await skipEntryScreen(page);
  await odslonNarzedzia(page);

  await page.getByRole("button", { name: "Przypnij pasek: lewo" }).click();

  // Zjazd na środek — nieprzypięty panel by się schował.
  await page.mouse.move(page.viewportSize()!.width / 2, page.viewportSize()!.height / 2);
  await page.waitForTimeout(500);
  expect(await pozycjaX(lewaKarta(page))).toBeGreaterThanOrEqual(0);

  // Przypięty panel nie potrzebuje uchwytu — nie ma czego zapowiadać.
  await expect(page.getByRole("button", { name: "Pokaż narzędzia rysowania" })).toHaveCount(0);
});

test("przypięty panel ODSUWA płótno, zamiast je zasłaniać", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await skipEntryScreen(page);
  await odslonNarzedzia(page);
  await page.getByRole("button", { name: "Przypnij pasek: lewo" }).click();
  await page.waitForTimeout(400);

  const karta = (await lewaKarta(page).boundingBox())!;
  const plotno = (await page.locator("[data-testid=plan-okno]").first().boundingBox())!;

  // Sedno: panel przyklejony na stałe do rysunku byłby GORSZY od chowającego się —
  // zabierałby miejsce pracy bez możliwości zajrzenia pod spód.
  expect(plotno.x).toBeGreaterThanOrEqual(karta.x + karta.width - 2);
});

test("odpięcie przywraca chowanie, a przypięcie przeżywa odświeżenie", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await skipEntryScreen(page);
  await odslonNarzedzia(page);
  await page.getByRole("button", { name: "Przypnij pasek: lewo" }).click();
  await page.waitForTimeout(300);

  await page.reload();
  await skipEntryScreen(page);
  await page.getByRole("button", { name: "Projektowanie na pełnym ekranie" }).click();
  await page.waitForTimeout(400);
  // Po odświeżeniu panel jest od razu widoczny, bez dotykania myszą.
  expect(await pozycjaX(lewaKarta(page))).toBeGreaterThanOrEqual(0);

  await page.getByRole("button", { name: "Odepnij pasek: lewo" }).click();
  await page.mouse.move(page.viewportSize()!.width / 2, page.viewportSize()!.height / 2);
  await expect.poll(() => pozycjaX(lewaKarta(page)), { timeout: 3000 }).toBeLessThan(0);
});

test("przypięcie panelu nie przesuwa rysunku — ten sam punkt planu zostaje w tym samym miejscu ekranu", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await skipEntryScreen(page);
  await page.getByRole("button", { name: "Projektowanie na pełnym ekranie" }).click();

  // Przybliżamy, żeby rzut przestał się mieścić — dopiero wtedy jest co przewijać
  // i dopiero wtedy kompensacja ma co robić.
  await page.getByRole("button", { name: "Przybliż widok" }).click();
  for (let i = 0; i < 9; i++) await page.getByRole("button", { name: "Przybliż widok" }).click();
  await page.waitForTimeout(300);

  const plotno = page.locator("[data-testid=plan-okno]").first();

  /**
   * Gdzie punkt planu (0, 0) wypada NA EKRANIE. Scena Konvy stoi w oknie planu
   * przesunięta o stan widoku, więc lewa krawędź okna plus przesunięcie sceny to
   * dokładnie to, co widzi użytkownik.
   *
   * Wcześniej liczyliśmy `scrollLeft - rect.left`, bo kadr wyznaczało przewinięcie
   * kontenera. Okno planu nie przewija się już wcale, a pytanie i tak brzmiało: czy
   * rysunek został w miejscu — więc pytamy o to wprost.
   */
  const pozycjaRysunku = async () => {
    const box = (await plotno.boundingBox())!;
    const przesuniecieSceny = await page.evaluate(
      () => (window as unknown as { Konva: { stages: Konva.Stage[] } }).Konva.stages[0].x(),
    );
    return Math.round(box.x + przesuniecieSceny);
  };

  const przed = await pozycjaRysunku();

  await odslonNarzedziaRysowania(page);
  // Panel wysuwa się z animacją. Klikając „Przypnij" w jej trakcie, test mierzyłby
  // wyścig z animacją, a nie to, co ma w tytule: kompensacja czyta wtedy położenie
  // okna sprzed ustabilizowania układu (zmierzone: 2 px zamiast 8) i wychodzi o tyle
  // za duża. Czekamy, aż panel dojedzie.
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "Przypnij pasek: lewo" }).click();
  await page.waitForTimeout(400);

  // Bez kompensacji plan skakał o szerokość panelu (~370 px) i trzeba go było
  // szukać od nowa. Tolerancja 4 px na zaokrąglenia układu.
  const po = await pozycjaRysunku();
  expect(Math.abs(po - przed)).toBeLessThan(4);
});

test("przypięty panel po lewej NIE zasłania górnego paska", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await skipEntryScreen(page);
  await odslonNarzedzia(page);
  await page.getByRole("button", { name: "Przypnij pasek: lewo" }).click();
  await page.mouse.move(page.viewportSize()!.width / 2, page.viewportSize()!.height / 2);
  await page.waitForTimeout(400);

  const karta = (await lewaKarta(page).boundingBox())!;
  // Kotwica to przycisk „Plan" — stoi wprost w pasku i jest widoczny zawsze. Dawne
  // celowanie w „Rozmiar elementów" przestalo dzialac, odkad ta kontrolka siedzi
  // w PANELU menu, ktory sam jest karta `rounded-card`.
  const pasek = (await page.getByRole("button", { name: "Plan", exact: true }).locator("xpath=ancestor::div[contains(@class,'rounded-card')][1]").boundingBox())!;

  // Wszystkie panele mają ten sam z-index, więc o wierzchu decydowała kolejność
  // w DOM — karta przykrywała lewy koniec paska, czyli kondygnacje i podkład.
  expect(karta.y).toBeGreaterThanOrEqual(pasek.y + pasek.height - 2);

  // Dowód użytkowy: klik w „Parter” ma trafić w „Parter”, a nie w narzędzie pod spodem.
  const parter = page.getByRole("button", { name: "Parter" });
  await expect(parter).toBeVisible();
  const trafiaWParter = await parter.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const pod = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return pod ? pod.closest("button") === el : false;
  });
  expect(trafiaWParter).toBe(true);
});

test("paski poziome stoją na stałe i nie chowają się przed kursorem", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await skipEntryScreen(page);
  await page.getByRole("button", { name: "Projektowanie na pełnym ekranie" }).click();
  await page.waitForTimeout(300);

  // Chowa się WYŁĄCZNIE panel boczny — on jeden ma szerokość, która realnie
  // zmienia ilość miejsca dla planu. Paski poziome są niskie, więc chowanie ich
  // dawało znikomy zysk, a wchodziło w drogę przypiętym narzędziom.
  await otworzMenuPaska(page, "Rysunek");
  const pasek = page.getByLabel("Rozmiar elementów");
  // Pasek stanu pod rysunkiem — wcześniej celowaliśmy w wiersz „Obszar planu: … jedn.",
  // ale on zniknął (mówił jednostkami planu o obszarze, który przestał cokolwiek
  // znaczyć). Chodzi o to samo: rzeczy pod płótnem nie chowają się przed kursorem.
  const dane = page.getByRole("status", { name: "Stan projektu" });
  await expect(pasek).toBeVisible();
  await expect(dane).toBeVisible();

  // Kursor na środku planu — nic nie powinno zniknąć.
  await page.mouse.move(page.viewportSize()!.width / 2, page.viewportSize()!.height / 2);
  await page.waitForTimeout(400);
  await expect(pasek).toBeVisible();
  await expect(dane).toBeVisible();

  // Nie ma już uchwytów do wysuwania pasków poziomych ani awaryjnej pigułki „Esc”:
  // wyjście z trybu siedzi w samym pasku, który jest zawsze pod ręką.
  await expect(page.getByRole("button", { name: "Pokaż pasek edytora" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Pokaż dane planu" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Zamknij pełny ekran" })).toHaveCount(0);

  // Kontrolki paska muszą być klikalne — nic nie może na nich leżeć.
  for (const nazwa of ["Dopasuj widok do planu", "Wyjdź z pełnego ekranu"]) {
    const klikalny = await page.getByRole("button", { name: nazwa }).evaluate((el) => {
      const r = el.getBoundingClientRect();
      const pod = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return pod ? pod.closest("button") === el : false;
    });
    expect(klikalny, `przycisk „${nazwa}” zasłonięty`).toBe(true);
  }
});

test("pasek edytora trzyma wszystkie ustawienia planu w JEDNEJ karcie", async ({ page }) => {
  await page.goto("/");
  await skipEntryScreen(page);

  // Po scaleniu nie ma juz osobnego rzedu na kondygnacje — a od kroku 83 rzeczy
  // ustawiane raz siedza pod „Plan" i „Rysunek", ale nadal w TEJ SAMEJ karcie paska.
  const pasek = page
    .getByRole("button", { name: "Parter", exact: true })
    .locator("xpath=ancestor::div[contains(@class,'rounded-card')][1]");

  // Przyciski menu siedzą w TEJ SAMEJ karcie co zakładki kondygnacji. Samą zawartość
  // menu sprawdzamy już na stronie, nie w karcie: panel otwiera się w portalu (patrz
  // `PasekMenu`), bo na telefonie przewijany pasek przycinał go do swojej wysokości.
  await expect(pasek.getByRole("button", { name: "Plan", exact: true })).toBeVisible();
  await expect(pasek.getByRole("button", { name: "Rysunek", exact: true })).toBeVisible();

  await otworzMenuPaska(page, "Plan");
  await expect(page.getByRole("button", { name: "+ Dodaj kondygnację" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Wgraj podkład" })).toBeVisible();
  await zamknijMenuPaska(page);

  await otworzMenuPaska(page, "Rysunek");
  await expect(page.getByLabel("Przyciągaj do siatki")).toBeVisible();
  await expect(page.getByLabel("Rozmiar elementów")).toBeVisible();
});

/**
 * Pełny ekran: pasek stanu POD rzutem, rzut na całą szerokość i dopasowany.
 *
 * Zmierzone przed poprawką przy 1440 × 900: pasek stanu przypięty do dołu kolumny płótna
 * leżał na rzucie (722–811 px), a zarezerwowany dla niego pas 811–900 był pusty; płótno
 * zostawało w szerokości sprzed wejścia (1031 zamiast ~1422 px), a rzut w powiększeniu
 * sprzed wejścia — mimo komentarza, który obiecywał ponowne dopasowanie.
 */
test("pełny ekran: pasek stanu pod rzutem, rzut na całą szerokość i dopasowany", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: /Zobacz gotowy przykład/ }).click();
  await page.getByRole("button", { name: /Mieszkanie 70 m²/ }).click();
  await expect(page.locator("[data-plan-okno]")).toBeVisible();
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: "Projektowanie na pełnym ekranie" }).click();
  await page.waitForTimeout(1200);

  const plotno = (await page.locator("[data-plan-okno]").boundingBox())!;
  const stan = (await page.getByLabel("Stan projektu").boundingBox())!;
  expect(stan.y, "pasek stanu ma stać pod rzutem, nie na nim").toBeGreaterThanOrEqual(plotno.y + plotno.height);
  expect(plotno.x + plotno.width).toBeLessThanOrEqual(1440);
  expect(plotno.width).toBeGreaterThan(1300);

  const { tresc, wys } = await page.evaluate(() => {
    const st = (window as unknown as {
      Konva: { stages: { height(): number; getLayers(): { getClientRect(): { y: number; height: number } }[] }[] };
    }).Konva.stages[0];
    const w = st.getLayers();
    return { tresc: w[w.length - 1].getClientRect(), wys: st.height() };
  });
  expect(tresc.y).toBeGreaterThanOrEqual(-2);
  expect(tresc.y + tresc.height).toBeLessThanOrEqual(wys + 2);
});

/**
 * Pełny ekran na szerokim oknie: opcje ZAZNACZENIA w panelu, który wysuwa się sam.
 *
 * Dotąd karta elementu siedziała w schowanym panelu (niewidoczna, dopóki ktoś nie
 * najechał na krawędź), a karta ściany pływała nad rzutem u góry i zasłaniała
 * okolicę zaznaczonej ściany — dwa różne miejsca na to samo.
 */
test.describe("zaznaczenie w pełnym ekranie", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  async function pelnyEkranZElementem(page: Page) {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await skipEntryScreen(page);
    await page.getByRole("button", { name: "Narysuj Ścianę", exact: true }).click();
    const box = (await page.locator("[data-testid=plan-okno]").first().boundingBox())!;
    await page.mouse.click(box.x + 300, box.y + 200);
    await page.mouse.click(box.x + 600, box.y + 200);
    await page.getByRole("button", { name: "Zakończ" }).click();
    await page.getByRole("button", { name: "Zaznacz", exact: true }).click();
    await page.getByRole("button", { name: "Projektowanie na pełnym ekranie" }).click();
    await expect.poll(() => pozycjaX(lewaKarta(page)), { timeout: 3000 }).toBeLessThan(0);
  }

  /** Środek pierwszej ściany na ekranie — z żywej transformacji sceny. */
  async function srodekSciany(page: Page) {
    return page.evaluate(() => {
      const raw = localStorage.getItem("pomocnikelektryka_projekt_" + localStorage.getItem("pomocnikelektryka_projekt_biezacy"));
      const w = JSON.parse(raw!).draft.walls[0].points as { x: number; y: number }[];
      const st = (window as unknown as { Konva: { stages: Konva.Stage[] } }).Konva.stages[0];
      const c = st.container().getBoundingClientRect();
      const t = st.getAbsoluteTransform().point({ x: (w[0].x + w[1].x) / 2, y: (w[0].y + w[1].y) / 2 });
      return { x: c.left + t.x, y: c.top + t.y };
    });
  }

  test("zaznaczenie ściany wysuwa panel z kartą, a pigułka nad rzutem jej nie powtarza", async ({ page }) => {
    await pelnyEkranZElementem(page);
    await page.waitForTimeout(900); // autozapis — z niego bierzemy współrzędne ściany
    const p = await srodekSciany(page);
    await page.mouse.click(p.x, p.y);

    const karta = lewaKarta(page);
    await expect.poll(() => pozycjaX(karta), { timeout: 3000 }).toBeGreaterThanOrEqual(0);
    const kartaSciany = page.getByTestId("karta-sciany");
    await expect(kartaSciany).toHaveCount(1);
    await expect(page.getByTestId("karta-narzedzi").getByTestId("karta-sciany")).toBeVisible();

    // Ruch myszy nad rzutem NIE chowa panelu, dopóki coś jest zaznaczone.
    await page.mouse.move(900, 500);
    await page.waitForTimeout(300);
    expect(await pozycjaX(karta)).toBeGreaterThanOrEqual(0);

    // Odznaczenie (klik w pusty rzut) chowa go z powrotem.
    await page.mouse.click(1300, 800);
    await expect.poll(() => pozycjaX(karta), { timeout: 3000 }).toBeLessThan(0);
  });
});

test("na pustej kondygnacji nie ma „Zaznacz kilka” — nie ma czego zaznaczać", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await skipEntryScreen(page);
  await page.getByRole("button", { name: "Zaznacz", exact: true }).click();
  await expect(page.getByTestId("panel-zaznacz")).toBeVisible();
  await expect(page.getByTestId("zaznacz-kilka")).toHaveCount(0);
});
