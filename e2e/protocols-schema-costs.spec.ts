import { test, expect } from "@playwright/test";
import { skipEntryScreen, otworzKatalogElementow } from "./_flow";

/** Umieszcza 3 gniazdka na planie realnymi kliknięciami — wspólny punkt startowy dla
 *  Protokołów/Schematu/Kosztorysu, które (jak Rozdzielnica) wymagają elementów na planie,
 *  żeby wygenerować obwody. Patrz design-panel.spec.ts po wyjaśnienie, czemu przez
 *  Playwright, a nie syntetyczne zdarzenia w podglądzie. */
async function placeThreeSockets(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Instalacja" }).click();
  await skipEntryScreen(page);
  const canvasWrap = page.locator("[data-testid=plan-okno]").first();
  // Box mierzony na nowo PRZED KAŻDYM kliknięciem, ze scrollTo(0,0) tuż przedtem:
  // klik zmieniający narzędzie ORAZ postawienie PIERWSZEGO elementu (odsłania
  // trwały baner ryzyka nad płótnem) potrafią przesunąć płótno w dół, więc box
  // zmierzony wcześniej staje się nieaktualny dla kolejnych kliknięć (ten sam
  // wzorzec co `zoomAndBox` w room-editing.spec.ts).
  await otworzKatalogElementow(page);
  await page.getByRole("button", { name: /Gniazdo 230 V/ }).first().click();
  for (const dx of [100, 250, 400]) {
    await page.evaluate(() => window.scrollTo(0, 0));
    const box = (await canvasWrap.boundingBox())!;
    await page.mouse.click(box.x + dx, box.y + 80);
  }
}

test("Protokoły: lista kontrolna oględzin daje werdykt i pobiera się jako PDF", async ({ page }) => {
  await placeThreeSockets(page);
  await page.getByRole("button", { name: "Protokoły pomiarowe", exact: true }).click();

  await page.getByLabel("Obiekt / nazwa instalacji").fill("Dom testowy");
  await page.getByLabel("Wykonawca pomiarów").fill("Jan Kowalski");
  await page.getByRole("button", { name: "Wczytaj listę kontrolną oględzin" }).click();

  // zaznacz wszystkie pozycje jako "zgodne" -> werdykt pozytywny
  const rows = page.locator("div.space-y-1 > div").filter({ has: page.getByRole("button", { name: "zgodne", exact: true }) });
  const count = await rows.count();
  for (let i = 0; i < count; i++) await rows.nth(i).getByRole("button", { name: "zgodne", exact: true }).click();

  await expect(page.getByText("Wynik pozytywny")).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Pobierz protokół (PDF)" }).click();
  const download = await downloadPromise;
  // nazwa pliku niesie „Obiekt" z nagłówka, żeby protokoły z różnych zleceń
  // nie nadpisywały się nawzajem w folderze pobierania
  expect(download.suggestedFilename()).toBe("protokol-ogledziny-dom-testowy.pdf");
});

test("Protokoły: komplet siedmiu protokołów wymaganych przy kontroli pięcioletniej", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Protokoły pomiarowe", exact: true }).click();

  // Zakres z art. 62 ust. 1 pkt 2 Prawa budowlanego: połączenia, osprzęt,
  // środki ochrony od porażeń, oporność izolacji, uziemienia — ORAZ instalacja
  // piorunochronna, wymieniona w tym samym przepisie.
  for (const tytul of [
    "Oględziny instalacji",
    "Sprawdzenie ciągłości przewodów ochronnych",
    "Pomiar rezystancji izolacji",
    "Pomiar impedancji pętli zwarcia",
    "Badanie wyłączników różnicowoprądowych",
    "Pomiar rezystancji uziemienia",
    "Ochrona odgromowa (LPS)",
  ]) {
    await expect(page.getByText(tytul, { exact: true }).first()).toBeVisible();
  }
});

test("Protokoły: „Dane ogólne” zwijają się, a stan przeżywa odświeżenie", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Protokoły pomiarowe", exact: true }).click();

  const obiekt = page.getByLabel("Obiekt / nazwa instalacji");
  await obiekt.fill("Hala nr 3");
  await expect(obiekt).toBeVisible();

  const naglowek = page.getByRole("button", { name: /Dane ogólne/ });
  await naglowek.click();
  await expect(obiekt).toHaveCount(0);

  // Po zwinięciu nagłówek musi POKAZAĆ, czyje dane są wpisane — inaczej sprawdzenie
  // tego wymagałoby rozwinięcia sekcji z powrotem.
  await expect(naglowek).toContainText("Hala nr 3");

  await page.reload();
  await page.getByRole("button", { name: "Protokoły pomiarowe", exact: true }).click();
  await expect(page.getByLabel("Obiekt / nazwa instalacji")).toHaveCount(0);
});

test("Protokoły: wypełnione wiersze trafiają do zapisu projektu", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Protokoły pomiarowe", exact: true }).click();
  await page.getByText("Pomiar rezystancji izolacji", { exact: true }).click();
  await page.getByRole("button", { name: /Dodaj wiersz/ }).click();
  // Kolumna 0 to „Typ przewodu (kabla) lub urządzenia", kolumna 1 to „Nazwa
  // obwodu" — w tej kolejności jak we wzorze Z.4.4.
  await page.locator("tbody tr").first().locator("input").nth(1).fill("Obwód gniazd kuchnia");

  await page.waitForTimeout(900); // debounce autozapisu
  // Protokoły są częścią projektu, więc idą tą samą drogą co plan — i tym samym
  // trafiają na konto przy zapisie w chmurze. To podstawa dokończenia pomiarów później.
  const zapis = await page.evaluate(() => {
    const raw = localStorage.getItem("pomocnikelektryka_projekt_" + localStorage.getItem("pomocnikelektryka_projekt_biezacy"));
    return raw ? JSON.parse(raw).protocols?.izolacja?.rows?.[0]?.obwod : null;
  });
  expect(zapis).toBe("Obwód gniazd kuchnia");
});

test("Protokoły: ochrona odgromowa ocenia ciągłość i rezystancję, i pobiera się jako PDF", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Protokoły pomiarowe", exact: true }).click();
  await page.getByLabel("Obiekt / nazwa instalacji").fill("Hala LPS");
  await page.getByLabel("Wykonawca pomiarów").fill("Jan Kowalski");

  await page.getByText("Ochrona odgromowa (LPS)", { exact: true }).click();
  await page.getByRole("button", { name: /Dodaj wiersz/ }).click();

  const wiersz = page.locator("tbody tr").first();
  const pola = wiersz.locator("input");
  await pola.nth(0).fill("Złącze kontrolne nr 1");
  await pola.nth(1).fill("0.4"); // ciągłość — poniżej 1 Ω
  await pola.nth(2).fill("8"); // rezystancja — poniżej 10 Ω
  await expect(page.getByText("Wynik pozytywny")).toBeVisible();

  // Przerwana ciągłość przesądza o ocenie nawet przy dobrym uziemieniu — to sedno
  // badania LPS: uziom może być świetny, a zwód urwany.
  await pola.nth(1).fill("6");
  await expect(page.getByText("Wynik negatywny")).toBeVisible();

  await pola.nth(1).fill("0.4");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Pobierz protokół (PDF)" }).click();
  expect((await downloadPromise).suggestedFilename()).toBe("protokol-odgromowa-hala-lps.pdf");
});

test("Schemat: renderuje rozłącznik główny i wygenerowane obwody po dodaniu elementów", async ({ page }) => {
  await placeThreeSockets(page);
  await page.getByRole("button", { name: "Schemat", exact: true }).click();

  const svg = page.locator("svg:has(#incoming-supply)");
  await expect(svg.locator("#main-switch text").filter({ hasText: "Rozłącznik izolacyjny główny" })).toBeVisible();
  // fazy zasilania nad grotem — domyślna konfiguracja rozdzielnicy jest 3-fazowa
  await expect(svg.locator("#incoming-supply text")).toHaveText("L1, L2, L3");
  await expect(svg.locator("#final-circuits-table text").filter({ hasText: /Obwód gniazd/ }).first()).toBeVisible();

  // szyny ochronna i neutralna muszą przecinać wszystkie odejścia obwodowe
  const buses = await svg.evaluate((el: SVGSVGElement) => {
    const lines = [...el.querySelectorAll("#pe-n-buses line")].map((l) => ({
      x1: +l.getAttribute("x1")!,
      x2: +l.getAttribute("x2")!,
      dash: l.getAttribute("stroke-dasharray"),
    }));
    const circuits = [...el.querySelectorAll('[id^="circuit-"]')].map((g) => (g as SVGGraphicsElement).getBBox());
    return {
      labels: [...el.querySelectorAll("#pe-n-buses text")].map((t) => t.textContent),
      lines,
      left: Math.min(...circuits.map((b) => b.x)),
      right: Math.max(...circuits.map((b) => b.x + b.width)),
    };
  });
  expect(buses.labels).toEqual(["N", "PE"]);
  buses.lines.forEach((l) => {
    expect(l.x1).toBeLessThanOrEqual(buses.left);
    expect(l.x2).toBeGreaterThanOrEqual(buses.right);
  });
  // PE kreską przerywaną, N ciągłą — na wydruku czarno-białym to jedyne, co je odróżnia
  expect(buses.lines[0].dash).toBeNull();
  expect(buses.lines[1].dash).toBeTruthy();

  // każdy obwód ma odczep PE: kropkę połączeniową na szynie i kreskę pod 30° do odpływu
  const taps = await svg.evaluate((el: SVGSVGElement) => {
    const peY = +el.querySelectorAll("#pe-n-buses line")[1].getAttribute("y1")!;
    const branchXs = [...el.querySelectorAll('[id^="circuit-"] > line')].map((l) => +l.getAttribute("x1")!);
    return {
      peY,
      branchXs,
      taps: [...el.querySelectorAll("#pe-taps > g")].map((g) => {
        const l = g.querySelector("line")!;
        const c = g.querySelector("circle")!;
        return {
          x1: +l.getAttribute("x1")!, y1: +l.getAttribute("y1")!,
          x2: +l.getAttribute("x2")!, y2: +l.getAttribute("y2")!,
          cy: +c.getAttribute("cy")!,
        };
      }),
    };
  });
  expect(taps.taps).toHaveLength(taps.branchXs.length);
  taps.taps.forEach((t, i) => {
    expect(t.cy).toBe(taps.peY); // kropka na szynie PE
    expect(t.y2).toBeGreaterThan(taps.peY); // kreska schodzi poniżej szyny
    expect(t.x2).toBeCloseTo(taps.branchXs[i], 5); // i kończy się na pionowym odpływie
    const deg = (Math.atan2(t.y2 - t.y1, Math.abs(t.x2 - t.x1)) * 180) / Math.PI;
    expect(deg).toBeCloseTo(30, 6);
  });
});

test("Kosztorys: wylicza pozycje z elementów i eksportuje CSV", async ({ page }) => {
  await placeThreeSockets(page);
  await page.getByRole("button", { name: "Kosztorys", exact: true }).click();

  await expect(page.locator("tfoot").getByText("RAZEM brutto")).toBeVisible();
  await expect(page.getByRole("cell", { name: /Gniazdko/ }).first()).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Eksportuj CSV" }).click();
  const download = await downloadPromise;
  // domyślna nazwa projektu („Mój dom") trafia do nazwy pliku po zamianie na ASCII
  expect(download.suggestedFilename()).toBe("kosztorys-moj-dom.csv");
});

test("Schemat: eksportuje się do SVG z zachowaniem grup aparatów i tekstu", async ({ page }) => {
  await placeThreeSockets(page);
  await page.getByRole("button", { name: "Schemat", exact: true }).click();

  const dl = page.waitForEvent("download");
  await page.getByRole("button", { name: "Eksportuj SVG" }).click();
  const download = await dl;
  expect(download.suggestedFilename()).toBe("schemat-jednokreskowy-moj-dom.svg");

  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(c as Buffer);
  const svg = Buffer.concat(chunks).toString("utf-8");

  expect(svg).toContain("<?xml");
  expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
  // struktura z grupami przetrwała eksport — to warunek późniejszej edycji w CAD-zie
  expect(svg).toContain('id="main-switch"');
  expect(svg).toContain('id="final-circuits-table"');
  expect(svg).toContain("Obwód gniazd"); // tekst zostaje tekstem, nie krzywymi
});

test("Kosztorys: rozbija sumę na netto/VAT/brutto i ostrzega o pozycjach bez ceny", async ({ page }) => {
  await placeThreeSockets(page);
  await page.getByRole("button", { name: "Kosztorys", exact: true }).click();

  await expect(page.getByText("Razem netto")).toBeVisible();
  // Stawka jest do wyboru (patrz kosztorys-vat.spec.ts) — domyślnie podstawowa.
  await expect(page.getByLabel("Stawka VAT")).toHaveValue("23");
  // Trzy gniazdka to trzy punkty instalacyjne, a `robocizna` ma w domyślnym cenniku
  // cenę 0 — więc ostrzeżenie jest tu w MOCNIEJSZYM wariancie („cena materiału, nie
  // cena instalacji"), zarezerwowanym dla braku samej robocizny. Słabszy wariant
  // („Suma nie obejmuje wszystkiego") zostaje dla braków w pozostałych pozycjach.
  await expect(page.getByText(/To jest cena materiału, nie cena instalacji/)).toBeVisible();

  const nums = await page.evaluate(() =>
    [...document.querySelectorAll("tfoot td")]
      .map((c) => c.textContent!.trim())
      .filter((c) => c.endsWith("zł"))
      // Kwoty są po polsku (przecinek dziesiętny) — patrz src/lib/liczby.ts.
      .map((c) => parseFloat(c.replace(" zł", "").replace(",", ".")))
  );
  const [netto, vat, brutto] = nums;
  expect(Math.abs(netto * 0.23 - vat)).toBeLessThan(0.02);
  expect(Math.abs(netto + vat - brutto)).toBeLessThan(0.02);

  // Uzupełnienie brakującej ceny zdejmuje ostrzeżenie. Wiersz ma teraz DWA pola —
  // cenę jednostkową i wartość pozycji (patrz `CostOverrides`) — więc celujemy
  // w konkretne, zamiast brać pierwsze z brzegu.
  const labour = page.getByLabel(/Cena jednostkowa: Robocizna/);
  await labour.fill("50");
  await labour.blur();
  await expect(page.getByText(/Suma nie obejmuje wszystkiego/)).toBeHidden();
});

/**
 * Podgląd PDF przed pobraniem.
 *
 * Strony rysuje `pdfjs-dist` na <canvas>, więc piksele są NASZE i dają się zmierzyć —
 * to jedyny sposób, żeby test złapał usterkę, którą zgłosił użytkownik („wyskakuje
 * czarne okno"). Pierwsza wersja podglądu wstawiała plik do <iframe> i polegała na
 * wtyczce przeglądarki: test sprawdzał wtedy typ zawartości i nagłówek `%PDF`, więc
 * przechodził na zielono, mimo że okno było czarne. Sprawdzanie, czy PLIK jest
 * poprawny, nie mówi nic o tym, czy użytkownik go ZOBACZY.
 */
async function zmierzPodglad(page: import("@playwright/test").Page) {
  const canvas = page.locator("[data-podglad-stron] canvas");
  await expect(canvas.first()).toBeVisible({ timeout: 30000 });
  return page.evaluate(() => {
    const k = document.querySelector("[data-podglad-stron] canvas") as HTMLCanvasElement;
    const d = k.getContext("2d")!.getImageData(0, 0, k.width, k.height).data;
    const n = d.length / 4;
    let bialych = 0;
    let ciemnych = 0;
    let przezroczystych = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 255) przezroczystych++;
      if (d[i] > 245 && d[i + 1] > 245 && d[i + 2] > 245) bialych++;
      else if (d[i] < 90 && d[i + 1] < 90 && d[i + 2] < 90) ciemnych++;
    }
    return {
      stron: document.querySelectorAll("[data-podglad-stron] canvas").length,
      bialychProc: (100 * bialych) / n,
      ciemnychProc: (100 * ciemnych) / n,
      przezroczystych,
    };
  });
}

/** Wspólne progi „to wygląda jak zadrukowana kartka, a nie czarny prostokąt". */
function oczekujKartke(w: { bialychProc: number; ciemnychProc: number; przezroczystych: number }) {
  // Kartka jest w przeważającej części biała...
  expect(w.bialychProc).toBeGreaterThan(70);
  // ...ale COŚ na niej stoi — inaczej podgląd byłby pustą, białą płachtą.
  expect(w.ciemnychProc).toBeGreaterThan(0.2);
  // Zero przezroczystości: to ona po złożeniu na ciemnym tle dawała czarny prostokąt.
  expect(w.przezroczystych).toBe(0);
}

test("Protokoły: podgląd rysuje zadrukowaną kartkę, nie czarny prostokąt", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Protokoły pomiarowe", exact: true }).click();
  await page.getByLabel("Obiekt / nazwa instalacji").fill("Dom testowy");

  // Bez wierszy nie ma czego podglądać — przycisk ma być wtedy nieczynny.
  await expect(page.getByRole("button", { name: "Podgląd" })).toBeDisabled();
  await page.getByRole("button", { name: "Wczytaj listę kontrolną oględzin" }).click();
  await page.getByRole("button", { name: "Podgląd" }).click();

  oczekujKartke(await zmierzPodglad(page));

  await page.getByRole("dialog").getByRole("button", { name: "Zamknij" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("Protokoły: „Pobierz PDF” w podglądzie zapisuje niepusty plik pod właściwą nazwą", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Protokoły pomiarowe", exact: true }).click();
  await page.getByLabel("Obiekt / nazwa instalacji").fill("Dom testowy");
  await page.getByRole("button", { name: "Wczytaj listę kontrolną oględzin" }).click();
  await page.getByRole("button", { name: "Podgląd" }).click();
  await zmierzPodglad(page);

  const pobranie = page.waitForEvent("download");
  await page.getByRole("dialog").getByRole("button", { name: "Pobierz PDF" }).click();
  const plik = await pobranie;
  expect(plik.suggestedFilename()).toBe("protokol-ogledziny-dom-testowy.pdf");

  // Rozmiar > 0 nie jest tu formalnością: pdf.js PRZEJMUJE przekazany bufor i go
  // odpina, więc gdyby podgląd oddał mu oryginał zamiast kopii, przycisk zapisałby
  // pusty plik — a podgląd wyglądałby przy tym zupełnie poprawnie.
  const fs = await import("node:fs");
  expect(fs.statSync(await plik.path()).size).toBeGreaterThan(1000);
});

test("Rozdzielnica: podgląd legendy rysuje zadrukowaną kartkę", async ({ page }) => {
  await placeThreeSockets(page);
  await page.getByRole("button", { name: "Rozdzielnica", exact: true }).click();
  await page.getByRole("button", { name: "Legenda do PDF" }).click();

  oczekujKartke(await zmierzPodglad(page));
});

/**
 * Eksport rysunków do PDF (schemat jednokreskowy i rzut kondygnacji).
 *
 * Rysunek wchodzi do PDF-a jako raster, a wokół niego rysowana jest wektorowo
 * tabliczka rysunkowa i legenda. Sprawdzamy PIKSELE gotowej strony — plik może być
 * formalnie poprawnym PDF-em i mimo to być pustą kartką, jeśli obraz nie zostanie
 * podpięty do zasobów strony albo scena wyeksportuje się przezroczysta.
 */
test("Schemat: eksport do PDF rysuje schemat na kartce", async ({ page }) => {
  await placeThreeSockets(page);
  await page.getByRole("button", { name: "Schemat", exact: true }).click();
  await page.getByRole("button", { name: "Podgląd PDF" }).click();

  const w = await zmierzPodglad(page);
  oczekujKartke(w);

  const pobranie = page.waitForEvent("download");
  await page.getByRole("dialog").getByRole("button", { name: "Pobierz PDF" }).click();
  expect((await pobranie).suggestedFilename()).toMatch(/^schemat-jednokreskowy.*\.pdf$/);
});

test("Rzut: eksport do PDF dokłada legendę użytych symboli", async ({ page }) => {
  await placeThreeSockets(page);
  await page.getByRole("button", { name: "Rzut do PDF" }).click();

  const w = await zmierzPodglad(page);
  oczekujKartke(w);

  // Sama TREŚĆ legendy (napisy, licznik sztuk) sprawdzana jest w teście jednostkowym
  // `drawing.test.ts` — tam da się ją odczytać wprost ze strumienia PDF-a, bez
  // rasteryzacji. Tutaj chodzi o to, że strona w ogóle się rysuje i daje się pobrać.
  const pobranie = page.waitForEvent("download");
  await page.getByRole("dialog").getByRole("button", { name: "Pobierz PDF" }).click();
  expect((await pobranie).suggestedFilename()).toMatch(/^rzut-.*[.]pdf$/);
});

test("Kosztorys: podgląd PDF rysuje zadrukowaną kartkę i pobiera się pod właściwą nazwą", async ({ page }) => {
  await placeThreeSockets(page);
  await page.getByRole("button", { name: "Kosztorys", exact: true }).click();

  await page.getByRole("button", { name: "Kosztorys do PDF" }).click();
  oczekujKartke(await zmierzPodglad(page));

  const pobranie = page.waitForEvent("download");
  await page.getByRole("dialog").getByRole("button", { name: "Pobierz PDF" }).click();
  const plik = await pobranie;
  // Nazwa projektu („Mój dom") trafia do metryki jako „Obiekt", a stamtąd do nazwy pliku.
  expect(plik.suggestedFilename()).toBe("kosztorys-moj-dom.pdf");

  const fs = await import("node:fs");
  expect(fs.statSync(await plik.path()).size).toBeGreaterThan(1000);
});

/**
 * Karta obliczeń obwodów: dobór jako dokument.
 *
 * Aplikacja liczyła Ib, przekrój, Iz, ΔU i Zs max dla każdego obwodu, po czym gubiła
 * to razem z sesją — legenda rozdzielnicy, jedyny dokument o obwodach, niesie sam
 * opis aparatów. Sprawdzamy WPIĘCIE i PIKSELE: sama tabela ma komplet testów
 * jednostkowych w `src/lib/pdf/obliczenia.test.ts`.
 */
test("Rozdzielnica: karta obliczeń zapisuje się jako zadrukowana kartka pod właściwą nazwą", async ({ page }) => {
  await placeThreeSockets(page);
  await page.getByRole("button", { name: "Rozdzielnica", exact: true }).click();
  await page.getByRole("button", { name: "Karta obliczeń do PDF" }).click();

  oczekujKartke(await zmierzPodglad(page));

  const pobranie = page.waitForEvent("download");
  await page.getByRole("dialog").getByRole("button", { name: "Pobierz PDF" }).click();
  const plik = await pobranie;
  expect(plik.suggestedFilename()).toMatch(/^karta-obliczen.*\.pdf$/);

  const fs = await import("node:fs");
  expect(fs.statSync(await plik.path()).size).toBeGreaterThan(1000);
});

/**
 * Rozdzielnica złożona ręcznie (wymiana tablicy, wycena) nie ma obwodów z rzutu, więc
 * nie ma też czego liczyć — a tabela doboru i tak się wtedy renderuje, tyle że pusta.
 * Bez rzutu w ogóle zakładka pokazuje ekran powitalny i przycisków nie ma wcale, więc
 * to jest JEDYNY stan, w którym ta blokada ma co robić.
 */
test("Rozdzielnica: rozdzielnica bez obwodów nie oferuje karty obliczeń", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Rozdzielnica", exact: true }).click();
  await page.getByRole("button", { name: "Zbuduj rozdzielnicę bez rzutu" }).click();

  // Jeden przycisk zamiast dwoch: podglad i pobranie tego samego dokumentu zlaly sie
  // w jedno, a pobranie dzieje sie z poziomu podgladu (patrz PanelTab, krok 88).
  await expect(page.getByRole("button", { name: "Karta obliczeń do PDF" })).toBeDisabled();
});
