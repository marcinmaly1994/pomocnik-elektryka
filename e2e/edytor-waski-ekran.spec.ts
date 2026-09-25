import { test, expect } from "@playwright/test";
import { otworzKatalogElementow, otworzMenuPaska, zamknijMenuPaska, odslonNarzedziaRysowania } from "./_flow";

/**
 * Edytor planu na ekranie telefonu.
 *
 * Zmierzone przed zmiana (okno 375 x 780): dokument mial 655 px szerokosci, czyli
 * CALA aplikacja przewijala sie w poziomie, a plotno zaczynalo sie 822 px od gory —
 * ponizej dolnej krawedzi ekranu. Rzut, jedyna rzecz, po ktora sie tu przychodzi,
 * byl niewidoczny bez przewijania, a chrome nad nim zajmowala wiecej niz caly ekran.
 *
 * Kazdy test sprawdza tez, ze na monitorze NIC sie nie zmienilo — to byl warunek
 * tej przebudowy.
 */

const TELEFON = { width: 375, height: 780 };
const MONITOR = { width: 1280, height: 800 };

/**
 * Ekran wejscia („Wgraj rzut / Narysuj dom / Pomiń") pokazuje sie, dopoki nie
 * zostal odrzucony. Odrzucenie jedzie przez autozapis z debouncem 600 ms, wiec po
 * klknieciu trzeba odczekac — bez tego kolejne wejscie na „/" w tym samym tescie
 * zastaje ekran wejscia od nowa.
 */
async function otworzEdytor(page: import("@playwright/test").Page) {
  await page.goto("/");
  const pomin = page.getByRole("button", { name: /Pomiń/ });
  const plotno = page.locator("canvas").first();
  // Zakładka ładuje się leniwie, więc na starcie nie ma jeszcze ANI ekranu wejścia,
  // ANI płótna — czekamy na to, co pojawi się pierwsze.
  await Promise.race([
    pomin.waitFor({ state: "visible" }).catch(() => {}),
    plotno.waitFor({ state: "visible" }).catch(() => {}),
  ]);
  if (await pomin.isVisible().catch(() => false)) {
    await pomin.click();
    await page.waitForTimeout(800);
  }
  await expect(plotno).toBeVisible();
}

test("na telefonie strona NIE przewija sie w poziomie", async ({ page }) => {
  await page.setViewportSize(TELEFON);
  await otworzEdytor(page);

  const { doc, okno } = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    okno: window.innerWidth,
  }));
  expect(doc).toBe(okno);
});

test("na telefonie caly rzut miesci sie w kolumnie planu", async ({ page }) => {
  await page.setViewportSize(TELEFON);
  await otworzEdytor(page);

  // Dolna granica powiekszenia jest na waskim ekranie nizsza (patrz `minZoom`).
  // Przy dawnych 0,4 plan mial 400 px przy kolumnie ~250 px, wiec calego mieszkania
  // nie dalo sie zobaczyc ani razu — nawet po „dopasuj widok".
  const szerPlotna = (await page.locator("canvas").first().boundingBox())!.width;
  expect(szerPlotna).toBeLessThanOrEqual(TELEFON.width);
});

test("panel boczny startuje ZWINIETY na telefonie, a rozwiniety na monitorze", async ({ page }) => {
  await page.setViewportSize(TELEFON);
  await otworzEdytor(page);
  await expect(page.getByRole("button", { name: /panel boczny/ })).toHaveAttribute("aria-expanded", "false");

  await page.setViewportSize(MONITOR);
  await otworzEdytor(page);
  await expect(page.getByRole("button", { name: /panel boczny/ })).toHaveAttribute("aria-expanded", "true");
});

/** Wybor uzytkownika ma pierwszenstwo nad szerokoscia okna — takze po odswiezeniu. */
test("recznie rozwiniety panel zostaje rozwiniety po odswiezeniu telefonu", async ({ page }) => {
  await page.setViewportSize(TELEFON);
  await otworzEdytor(page);

  await page.getByRole("button", { name: "Pokaż panel boczny" }).click();
  await expect(page.getByRole("button", { name: /panel boczny/ })).toHaveAttribute("aria-expanded", "true");

  await page.reload();
  await expect(page.getByRole("button", { name: /panel boczny/ })).toHaveAttribute("aria-expanded", "true");
});

test("pasek edytora jest nizszy niz przed zwinieciem — na monitorze jeden rzad", async ({ page }) => {
  // Przed krokiem 83 pasek mial DWA rzedy i na telefonie, i na monitorze. Zwijanie
  // („Ustawienia planu") wlaczalo sie wtedy WYLACZNIE ponizej 768 px, wiec na
  // monitorze — czyli tam, gdzie te dwa rzedy realnie zjadaly rysunek — nie robilo nic.
  //
  // Liczymy RZEDY, nie piksele. Wczesniej staly tu progi 84 i 70 px, zmierzone na
  // Windowsie, i one wlasnie wywrocily pierwszy przebieg CI: na runnerze Ubuntu pasek
  // mial 116 px zamiast 78. Winna byla czcionka — `Inter Tight` bylo tylko NAZWANE,
  // nigdy nie wczytywane, wiec kazdy system podstawial wlasny zamiennik o innej
  // szerokosci znakow (naprawione w `main.tsx`). Prog w pikselach mierzyl jednak nie
  // to, o co chodzi: tresc tego testu brzmi „jeden rzad, nie dwa", a liczba rzedow
  // nie zalezy od kroju pisma. Zapas przy 84 px wynosil zreszta 6 px.
  const RZEDY = { telefon: 2, monitor: 1 } as const;

  for (const [nazwa, rozmiar] of [["telefon", TELEFON], ["monitor", MONITOR]] as const) {
    await page.setViewportSize(rozmiar);
    await otworzEdytor(page);

    const pasek = page
      .getByRole("button", { name: "Plan", exact: true })
      .locator("xpath=ancestor::div[contains(@class,'rounded-card')][1]");
    /**
     * Kontrolki grupowane po srodku w pionie: dwie leza w tym samym rzedzie, gdy
     * dzieli je mniej niz POLOWA wysokosci najwyzszej z nich. Tolerancja z samych
     * kontrolek, a nie stala — pasek miesza przyciski z polami wyboru, ktore roznia
     * sie o kilka pikseli i przy sztywnym progu rozjezdzaly sie na osobne rzedy.
     */
    const rzedy = await pasek.evaluate((el) => {
      const pudelka = [...el.querySelectorAll("button, select, input")]
        .map((c) => c.getBoundingClientRect())
        .filter((b) => b.height > 0);
      if (!pudelka.length) return 0;
      const tolerancja = Math.max(...pudelka.map((b) => b.height)) / 2;
      const srodki = pudelka.map((b) => b.top + b.height / 2).sort((a, z) => a - z);
      return srodki.reduce((n, s, i) => (i > 0 && s - srodki[i - 1] > tolerancja ? n + 1 : n), 1);
    });
    expect(rzedy, `rzedy paska na szerokosci: ${nazwa}`).toBeLessThanOrEqual(RZEDY[nazwa]);

    // Schowane jest to, co ustawia sie RAZ...
    await expect(page.getByRole("button", { name: "Wgraj podkład" })).toHaveCount(0);
    await otworzMenuPaska(page, "Plan");
    await expect(page.getByRole("button", { name: "Wgraj podkład" })).toBeVisible();
    await zamknijMenuPaska(page);

    // ...a pod reka zostaje to, czego uzywa sie W TRAKCIE rysowania.
    await expect(page.getByRole("button", { name: "Cofnij" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Dopasuj widok do planu" })).toBeVisible();
  }
});

test("zakladki kondygnacji sa w pasku na monitorze, a na telefonie w menu „Plan”", async ({ page }) => {
  // Roznica jest czysto arytmetyczna: przy 375 px zakladki obok trzech przyciskow menu
  // robia z paska trzeci rzad, czyli WIECEJ niz przed zwinieciem. Na monitorze miejsca
  // jest az nadto, a przelaczanie pieter to nawigacja i nie ma kosztowac klikniecia.
  await page.setViewportSize(MONITOR);
  await otworzEdytor(page);
  await expect(page.getByRole("button", { name: "Parter", exact: true })).toBeVisible();

  await page.setViewportSize(TELEFON);
  await otworzEdytor(page);
  await expect(page.getByRole("button", { name: "Parter", exact: true })).toHaveCount(0);
  await otworzMenuPaska(page, "Plan");
  await expect(page.getByRole("button", { name: "Parter", exact: true })).toBeVisible();
});

/**
 * Po wybraniu drogi startu telefon LADUJE NA RYSUNKU, a nie na tym samym naglowku,
 * ktory uzytkownik ogladal przed klknieciem.
 *
 * Zmierzone przed zmiana (okno 375 x 812): plotno zaczynalo sie 543 px w dol strony —
 * nad nim staly naglowek (210 px), pasek etapow, banery, pasek kondygnacji i pasek
 * narzedzi. Klikniecie „Narysuj dom samodzielnie" nie zmienialo NICZEGO w kadrze,
 * wiec nie bylo zadnego znaku, ze gdzies nizej czeka kartka do rysowania.
 *
 * Celem przewijania jest KORZEN EDYTORA, nie samo plotno: zaczyna sie paskiem edytora
 * i paskiem narzedzi, wiec po przewinieciu widac i czym rysowac, i po czym.
 */
test("telefon: po wybraniu drogi startu rysunek jest w kadrze, razem z paskiem narzedzi", async ({ page }) => {
  await page.setViewportSize(TELEFON);
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Instalacja" }).click();
  await page.getByRole("button", { name: "Narysuj dom samodzielnie" }).click();

  const plotno = page.locator("canvas").first();
  await expect(plotno).toBeVisible();
  // Przewijanie jest plynne (`behavior: "smooth"`), wiec czekamy na jego koniec.
  await expect
    .poll(async () => Math.round(await page.evaluate(() => window.scrollY)), { timeout: 3000 })
    .toBeGreaterThan(200);

  const rail = (await page.locator('nav[aria-label="Narzędzia rysowania"]').boundingBox())!;
  const box = (await plotno.boundingBox())!;
  // Pasek narzedzi na gorze kadru, plotno tuz pod nim — jedno i drugie widoczne
  // bez dalszego przewijania.
  expect(rail.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(TELEFON.height);
});

test("monitor: strona NIE drga — tam edytor i tak mieści się w oknie", async ({ page }) => {
  await page.setViewportSize(MONITOR);
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Instalacja" }).click();
  await page.getByRole("button", { name: "Narysuj dom samodzielnie" }).click();
  await expect(page.locator("canvas").first()).toBeVisible();

  await page.waitForTimeout(600);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

/**
 * Pelny ekran na TELEFONIE.
 *
 * Zmierzone przed zmiana (okno 375 px): karta narzedzi miala 345 px szerokosci, czyli
 * po odslonieciu zakrywala CALY rysunek — pasek narzedzi jest ponizej progu `md`
 * pozimy, a w pelnym ekranie karta stoi przyklejona do lewej krawedzi okna jako
 * kolumna. Do tego karta chowala sie wylacznie na `mousemove`/`mouseleave`, ktorych
 * palec nie wysyla: raz otwarta zostawala otwarta na dobre.
 */
test("telefon w pelnym ekranie: karta narzedzi jest WASKA i nie zakrywa rysunku", async ({ page }) => {
  await page.setViewportSize(TELEFON);
  await otworzEdytor(page);
  await page.getByRole("button", { name: "Projektowanie na pełnym ekranie" }).click();
  await odslonNarzedziaRysowania(page);

  const karta = (await page.getByTestId("karta-narzedzi").boundingBox())!;
  // Sam pionowy pasek ikon plus uchwyt zwijania — nie pol ekranu.
  expect(karta.width).toBeLessThan(120);
  // Zostaje realny kawalek rysunku obok.
  expect(TELEFON.width - (karta.x + karta.width)).toBeGreaterThan(200);
});

/**
 * Test nazywa sie „PALCEM", a robil to mysza — i to nie byla drobna niescislosc.
 *
 * Mysza tej drogi nie da sie sprawdzic: sam ruch kursora na uchwyt wysuwa karte
 * (`PAS_WYZWALAJACY`, patrz `odslonNarzedziaRysowania`), wiec klikniecie i najechanie
 * daja ten sam skutek i test przechodzil niezaleznie od tego, czy dotyk dziala.
 * Przy okazji przegrywal wyscig z wlasnym ruchem myszy — ten sam, ktory wywrocil
 * dwa przebiegi CI w innych plikach. Palec nie wysyla `mousemove`, wiec dopiero on
 * odroznia jedno od drugiego.
 */
test.describe("telefon w pelnym ekranie, dotykiem", () => {
  test.use({ hasTouch: true });

  test("telefon w pelnym ekranie: karte da sie schowac PALCEM, bez najezdzania myszą", async ({ page }) => {
    await page.setViewportSize(TELEFON);
    await otworzEdytor(page);
    await page.getByRole("button", { name: "Projektowanie na pełnym ekranie" }).click();

    const uchwyt = page.getByRole("button", { name: "Pokaż narzędzia rysowania" });
    await uchwyt.tap();
    const zamknij = page.getByRole("button", { name: "Schowaj narzędzia rysowania" });
    await expect(zamknij).toBeVisible();
    await zamknij.tap();

    // Karta zjechala za krawedz, a uchwyt wrocil — droga w obie strony dziala palcem.
    await expect(zamknij).toBeHidden();
    await expect(uchwyt).toBeVisible();
  });
});

test("monitor w pelnym ekranie: pasek narzedzi bez zmian — i tak byl pionowy", async ({ page }) => {
  await page.setViewportSize(MONITOR);
  await otworzEdytor(page);
  await page.getByRole("button", { name: "Projektowanie na pełnym ekranie" }).click();

  // Najechaniem, nie kliknieciem uchwytu — powod w `odslonNarzedziaRysowania`.
  await odslonNarzedziaRysowania(page);

  const rail = (await page.locator('nav[aria-label="Narzędzia rysowania"]').boundingBox())!;
  // Pionowy: wyzszy niz szerszy, tak jak od zawsze powyzej progu `md`.
  expect(rail.height).toBeGreaterThan(rail.width);
});

test("na telefonie panel elementow dostaje CALA szerokosc karty, a nie polowe", async ({ page }) => {
  await page.setViewportSize(TELEFON);
  await otworzEdytor(page);

  // Panel na waskim ekranie startuje ZWINIETY (patrz `odczytajPanelZwiniety`) —
  // rozwijamy go, bo o jego szerokosc tu chodzi.
  const pokaz = page.getByRole("button", { name: "Pokaż panel boczny" });
  if (await pokaz.isVisible().catch(() => false)) await pokaz.click();
  await otworzKatalogElementow(page);
  await expect(page.getByPlaceholder("Szukaj elementu…")).toBeVisible();

  // Zmierzone PRZED zmiana: pasek narzedzi (poziomy ponizej `md`) stal w tym samym
  // rzedzie co panel i bral 172 px, a panelowi zostawalo 137 px z 268 px, ktorych
  // potrzebuje — nazwy elementow byly uciete w polowie, a wybor liczby gniazd
  // i „Dedykowane (AGD)" wychodzily poza kadr. Teraz pasek stoi NAD panelem.
  const karta = (await page.getByTestId("karta-narzedzi").first().boundingBox())!;
  const panel = (await page.getByPlaceholder("Szukaj elementu…").boundingBox())!;
  expect(panel.width).toBeGreaterThan(karta.width * 0.85);

  // Dowod uzytkowy: pelna nazwa elementu miesci sie w kadrze, a nie jest ucieta.
  const pozycja = (await page.getByRole("button", { name: /Gniazdo 230 V/ }).first().boundingBox())!;
  expect(pozycja.x + pozycja.width).toBeLessThanOrEqual(karta.x + karta.width + 1);

  // Na monitorze panel zostaje WASKA kolumna obok paska — tam nic sie nie zmienia.
  await page.setViewportSize(MONITOR);
  await otworzEdytor(page);
  await otworzKatalogElementow(page);
  const panelDuzy = (await page.getByPlaceholder("Szukaj elementu…").boundingBox())!;
  const kartaDuza = (await page.getByTestId("karta-narzedzi").first().boundingBox())!;
  expect(panelDuzy.width).toBeLessThan(kartaDuza.width * 0.85);
});

test("na telefonie rysunek jest widoczny bez przewijania", async ({ page }) => {
  await page.setViewportSize(TELEFON);
  await otworzEdytor(page);

  // Zmierzone PRZED zmiana: sam naglowek bral 210 px z 812 px ekranu (haslo zawijalo
  // sie na dwie linie, a linki narzedzi na trzy rzedy), pasek etapow kolejne 94 px
  // przez podtytuly kafli — i plotno zaczynalo sie 684 px od gory. Po zmianie naglowek
  // ma 95 px, a rysunek miesci sie w pierwszym ekranie.
  const plotno = (await page.locator("canvas").first().boundingBox())!;
  expect(plotno.y).toBeLessThan(TELEFON.height);
  // I nadal NIC nie przewija sie w poziomie — to byl warunek tej przebudowy.
  const poziomo = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(poziomo).toBe(false);
});
