import { test, expect } from "@playwright/test";

/** Umieszcza 3 gniazdka na planie realnymi kliknięciami — wspólny punkt startowy dla
 *  Protokołów/Schematu/Kosztorysu, które (jak Rozdzielnica) wymagają elementów na planie,
 *  żeby wygenerować obwody. Patrz design-panel.spec.ts po wyjaśnienie, czemu przez
 *  Playwright, a nie syntetyczne zdarzenia w podglądzie. */
async function placeThreeSockets(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Instalacja" }).click();
  const canvasWrap = page.locator("div.overflow-auto.rounded-card.border").first();
  // Box mierzony na nowo PRZED KAŻDYM kliknięciem, ze scrollTo(0,0) tuż przedtem:
  // klik zmieniający narzędzie ORAZ postawienie PIERWSZEGO elementu (odsłania
  // trwały baner ryzyka nad płótnem) potrafią przesunąć płótno w dół, więc box
  // zmierzony wcześniej staje się nieaktualny dla kolejnych kliknięć (ten sam
  // wzorzec co `zoomAndBox` w room-editing.spec.ts).
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

test("Protokoły: komplet ośmiu protokołów wymaganych przy kontroli pięcioletniej", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Protokoły pomiarowe", exact: true }).click();

  // Zakres z art. 62 ust. 1 pkt 2 Prawa budowlanego: połączenia, osprzęt,
  // zabezpieczenia i środki ochrony od porażeń, oporność izolacji, uziemienia —
  // ORAZ instalacja piorunochronna, wymieniona w tym samym przepisie.
  for (const tytul of [
    "Oględziny instalacji",
    "Rozdzielnice, zabezpieczenia i oznaczenia",
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
  await page.locator("tbody tr").first().locator("input").first().fill("Obwód gniazd kuchnia");

  await page.waitForTimeout(900); // debounce autozapisu
  // Protokoły są częścią projektu, więc idą tą samą drogą co plan — i tym samym
  // trafiają na konto przy zapisie w chmurze. To podstawa dokończenia pomiarów później.
  const zapis = await page.evaluate(() => {
    const raw = localStorage.getItem("pomocnikelektryka_projekt_autosave");
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

  await expect(page.getByText("RAZEM brutto")).toBeVisible();
  await expect(page.getByRole("cell", { name: /Gniazdko/ }).first()).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Eksportuj kosztorys" }).click();
  const download = await downloadPromise;
  // domyślna nazwa projektu („Mój dom") trafia do nazwy pliku po zamianie na ASCII
  expect(download.suggestedFilename()).toBe("kosztorys-moj-dom.csv");
});

test("Schemat: eksportuje się do SVG z zachowaniem grup aparatów i tekstu", async ({ page }) => {
  await placeThreeSockets(page);
  await page.getByRole("button", { name: "Schemat", exact: true }).click();

  const dl = page.waitForEvent("download");
  await page.getByRole("button", { name: "Eksportuj schemat" }).click();
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
  await expect(page.getByText("VAT 23%")).toBeVisible();
  await expect(page.getByText(/Suma nie obejmuje wszystkiego/)).toBeVisible();

  const nums = await page.evaluate(() =>
    [...document.querySelectorAll("tfoot td")]
      .map((c) => c.textContent!.trim())
      .filter((c) => c.endsWith("zł"))
      .map((c) => parseFloat(c.replace(" zł", "")))
  );
  const [netto, vat, brutto] = nums;
  expect(Math.abs(netto * 0.23 - vat)).toBeLessThan(0.02);
  expect(Math.abs(netto + vat - brutto)).toBeLessThan(0.02);

  // uzupełnienie brakującej ceny zdejmuje ostrzeżenie
  const labour = page.getByRole("row", { name: /Robocizna/ }).locator("input");
  await labour.fill("50");
  await labour.blur();
  await expect(page.getByText(/Suma nie obejmuje wszystkiego/)).toBeHidden();
});

/**
 * Podgląd PDF przed pobraniem.
 *
 * Sprawdzamy tu trzy rzeczy, których nie widać po samym pojawieniu się okna:
 *  1. w ramce siedzi PRAWDZIWY PDF (nagłówek `%PDF`, typ `application/pdf`) — a nie
 *     pusty blob albo strona błędu, która wygląda tak samo jak nierozwinięty podgląd;
 *  2. przeglądarka faktycznie GO OTWORZYŁA swoją wtyczką (`contentType` dokumentu
 *     w ramce), bo podgląd, który zostaje białym prostokątem, jest bezużyteczny.
 *     Ta akurat asercja działa TYLKO tam, gdzie wtyczka PDF w ogóle jest: Chromium
 *     Playwrighta jej nie ma (`navigator.pdfViewerEnabled === false`) i zwraca wtedy
 *     `text/html`. To ograniczenie środowiska testowego, nie zachowanie aplikacji,
 *     więc sprawdzamy warunkowo zamiast wywalać test na czymś, czego przeglądarka
 *     testowa nie umie. W zwykłym Chrome zmierzone: dokument w ramce ma
 *     `application/pdf` i wciąga `pdf_embedder.css` wbudowanej przeglądarki PDF;
 *  3. zamknięcie ZWALNIA adres blob — plik z osadzonymi fontami waży ~1,4 MB
 *     i bez zwolnienia każde otwarcie podglądu zostawiałoby tyle w pamięci karty.
 */
async function zbadajPodglad(page: import("@playwright/test").Page) {
  const okno = page.getByRole("dialog");
  await expect(okno.locator("iframe")).toHaveCount(1, { timeout: 15000 });
  return okno.evaluate(async (d) => {
    const f = d.querySelector("iframe") as HTMLIFrameElement;
    const r = await fetch(f.src);
    const bajty = new Uint8Array(await r.arrayBuffer());
    return {
      adres: f.src,
      typ: r.headers.get("content-type"),
      naglowek: String.fromCharCode(...bajty.slice(0, 4)),
      rozmiar: bajty.length,
      typDokumentu: f.contentDocument?.contentType ?? null,
      wtyczkaPdf: navigator.pdfViewerEnabled,
    };
  });
}

/** Asercja renderowania — pomijana tam, gdzie przeglądarka nie ma czym renderować. */
function sprawdzRenderowanie(w: { typDokumentu: string | null; wtyczkaPdf: boolean }) {
  if (w.wtyczkaPdf) expect(w.typDokumentu).toBe("application/pdf");
}

/** Czy adres blob został zwolniony (pobranie po zwolnieniu jest odrzucane). */
async function zwolniony(page: import("@playwright/test").Page, adres: string) {
  return page.evaluate(async (a) => {
    try {
      await fetch(a);
      return false;
    } catch {
      return true;
    }
  }, adres);
}

test("Protokoły: podgląd pokazuje gotowy PDF, a zamknięcie zwalnia go z pamięci", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Protokoły pomiarowe", exact: true }).click();
  await page.getByLabel("Obiekt / nazwa instalacji").fill("Dom testowy");

  // Bez wierszy nie ma czego podglądać — przycisk ma być wtedy nieczynny.
  await expect(page.getByRole("button", { name: "Podgląd" })).toBeDisabled();
  await page.getByRole("button", { name: "Wczytaj listę kontrolną oględzin" }).click();
  await page.getByRole("button", { name: "Podgląd" }).click();

  const w = await zbadajPodglad(page);
  expect(w.naglowek).toBe("%PDF");
  expect(w.typ).toBe("application/pdf");
  expect(w.rozmiar).toBeGreaterThan(1000);
  sprawdzRenderowanie(w);

  await page.getByRole("dialog").getByRole("button", { name: "Zamknij" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await zwolniony(page, w.adres)).toBe(true);
});

test("Protokoły: „Pobierz PDF” w podglądzie zapisuje ten sam dokument, który widać", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Protokoły pomiarowe", exact: true }).click();
  await page.getByLabel("Obiekt / nazwa instalacji").fill("Dom testowy");
  await page.getByRole("button", { name: "Wczytaj listę kontrolną oględzin" }).click();
  await page.getByRole("button", { name: "Podgląd" }).click();

  const w = await zbadajPodglad(page);
  const pobranie = page.waitForEvent("download");
  await page.getByRole("dialog").getByRole("button", { name: "Pobierz PDF" }).click();
  const plik = await pobranie;
  expect(plik.suggestedFilename()).toBe("protokol-ogledziny-dom-testowy.pdf");

  // Ten sam rozmiar co podglądany blob: przycisk zapisuje ZŁOŻONE JUŻ bajty,
  // a nie składa dokumentu po raz drugi. Inaczej podgląd przestałby być dowodem
  // na to, co wyląduje na dysku — czyli straciłby jedyny powód istnienia.
  const fs = await import("node:fs");
  const sciezka = await plik.path();
  expect(fs.statSync(sciezka).size).toBe(w.rozmiar);
});

test("Rozdzielnica: podgląd legendy pokazuje gotowy PDF", async ({ page }) => {
  await placeThreeSockets(page);
  await page.getByRole("button", { name: "Rozdzielnica" }).click();
  await page.getByRole("button", { name: "Podgląd legendy" }).click();

  const w = await zbadajPodglad(page);
  expect(w.naglowek).toBe("%PDF");
  sprawdzRenderowanie(w);

  await page.getByRole("dialog").getByRole("button", { name: "Zamknij" }).click();
  expect(await zwolniony(page, w.adres)).toBe(true);
});
