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
