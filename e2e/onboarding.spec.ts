import { test, expect, type Page } from "@playwright/test";
import { otworzMenuPaska } from "./_flow";

/**
 * Onboarding: EKRAN STARTOWY (pierwszy wybór na zupełnie świeżym projekcie —
 * patrz `showEntryScreen` w DesignTab.tsx) i karta „Zacznij w 3 krokach" (dalsze
 * kroki, po tym pierwszym wyborze).
 *
 * Logika przejść i walidacja mają testy jednostkowe w `src/lib/onboarding.test.ts`.
 * Tutaj sprawdzamy rzeczy, których nie widać bez przeglądarki: że ekran startowy
 * i karta faktycznie prowadzą do właściwego narzędzia, że kroki odhaczają się od
 * DZIAŁANIA użytkownika (a nie od kliknięcia w kartę) i że pominięcie naprawdę
 * odblokowuje pracę.
 */

async function freshDesign(page: Page) {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.removeItem("pomocnikelektryka_onboarding_seen");
  });
  await page.reload();
  await page.getByRole("button", { name: "Instalacja" }).click();
}

async function planBox(page: Page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  return (await page.locator("div.overflow-auto.rounded-card.border").first().boundingBox())!;
}

const card = (page: Page) => page.getByRole("complementary", { name: /Zacznij w 3 krokach/i });

/** Ekran startowy nie jest osobnym landmarkiem — identyfikujemy go po nagłówku,
 *  unikalnym dla tego jednego, pierwszego ekranu. */
async function skipEntryScreen(page: Page) {
  await expect(page.getByRole("heading", { name: "Zaprojektuj instalację elektryczną w swoim domu" })).toBeVisible();
  await page.getByRole("button", { name: "Pomiń — zacznę na pustym planie" }).click();
}

test("ekran startowy prowadzi od wgrania rzutu przez skalę do pierwszego elementu i znika po ukończeniu", async ({ page }) => {
  await freshDesign(page);
  await expect(page.getByRole("heading", { name: "Zaprojektuj instalację elektryczną w swoim domu" })).toBeVisible();
  // dopóki nie padł żaden wybór, karta „3 kroki" jeszcze nie istnieje — to ekran
  // startowy zadaje to samo pytanie, dublowanie byłoby dokładnie zgłoszoną bolączką
  await expect(card(page)).toHaveCount(0);

  const { makePng } = await import("./_png");
  await page.setInputFiles('input[type="file"]', {
    name: "rzut.png",
    mimeType: "image/png",
    buffer: makePng(16, 9),
  });
  // Po wgraniu pliku wchodzimy najpierw w krok przycinania — ten test sprawdza
  // przewodnik onboardingu, nie przycinanie, więc pomijamy je. Pominięcie MUSI
  // zostawić wgrany podkład: to sedno wyjścia awaryjnego.
  await page.getByRole("button", { name: "Pomiń — użyj całego rzutu" }).click();
  await otworzMenuPaska(page, "Plan");
  await expect(page.getByText(/Podkład: rzut.png/)).toBeVisible();

  // Podkład wgrany — aplikacja sama wchodzi w krok 1 (skala) i tłumaczy go dymkiem
  // przy linijce, bez czekania, aż użytkownik znajdzie CTA w karcie.
  const coach = page.getByRole("dialog", { name: "Podpowiedź" });
  await expect(coach).toBeVisible();
  await expect(coach).toContainText("dwa punkty o znanej odległości");
  // Karta „3 kroki" jest na ten czas ZWINIĘTA do samego przycisku: oba elementy
  // stoją w lewym dolnym rogu i przy pełnej karcie nakładały się na siebie (patrz
  // `open={onboarding.showCard && !coachMark}` w DesignTab.tsx). Prowadzi teraz
  // dymek, nie karta — dublowanie tej samej podpowiedzi byłoby szumem.
  await expect(card(page)).toHaveCount(0);

  // Zamknięcie dymka oddaje scenę karcie — z krokiem 1 (skala) jako aktywnym.
  await coach.getByRole("button", { name: "Rozumiem" }).click();
  await expect(coach).toBeHidden();
  await expect(card(page)).toBeVisible();
  await expect(card(page).getByRole("button", { name: "Ustaw skalę" })).toBeVisible();

  // CTA kroku 1 w karcie prowadzi do TEGO SAMEGO miejsca — kto zamknął dymek za
  // wcześnie, ma jak wrócić do wyjaśnienia. Dymek pojawia się wtedy ponownie,
  // a karta znowu ustępuje mu miejsca.
  await card(page).getByRole("button", { name: "Ustaw skalę" }).click();
  await expect(coach).toBeVisible();
  await expect(card(page)).toHaveCount(0);
  await coach.getByRole("button", { name: "Rozumiem" }).click();
  await expect(coach).toBeHidden();

  // dwa punkty na rzucie → pojawia się pole długości
  const box = await planBox(page);
  await page.mouse.click(box.x + 120, box.y + 100);
  await page.mouse.click(box.x + 320, box.y + 100);
  const lenInput = page.getByLabel("Długość odcinka w metrach");
  await expect(lenInput).toBeVisible();

  // walidacja: bzdura nie zapisuje skali
  await lenInput.fill("abc");
  await page.getByRole("button", { name: "Zatwierdź skalę" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.locator("span.pe-chip", { hasText: /m szer\./ })).toHaveCount(0);

  // poprawna wartość zapisuje skalę i odhacza krok 1
  await lenInput.fill("4");
  await page.getByRole("button", { name: "Zatwierdź skalę" }).click();
  await expect(page.locator("span.pe-chip", { hasText: /m szer\./ })).toBeVisible();
  // ukończony krok zachowuje tytuł (z checkmarkiem) — znika tylko jego przycisk CTA,
  // a aktywny staje się krok następny
  await expect(card(page).getByRole("button", { name: "Ustaw skalę" })).toHaveCount(0);
  await expect(card(page).getByRole("button", { name: "Obrysuj pomieszczenie" })).toBeVisible();

  // KROK 2 — obrysowanie i nazwanie pomieszczenia
  await card(page).getByRole("button", { name: "Obrysuj pomieszczenie" }).click();
  const box2 = await planBox(page);
  await page.mouse.move(box2.x + 100, box2.y + 80);
  await page.mouse.down();
  await page.mouse.move(box2.x + 260, box2.y + 200, { steps: 8 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Dodaj pomieszczenie" }).click();

  // KROK 3 — postawienie elementu kończy przewodnik
  await card(page).getByRole("button", { name: "Wybierz element" }).click();
  await page.getByRole("button", { name: /Gniazdo 230 V/ }).first().click();
  const box3 = await planBox(page);
  await page.mouse.click(box3.x + 150, box3.y + 120);

  // karta znika sama, zostaje dyskretny przycisk pomocy
  await expect(card(page)).toBeHidden({ timeout: 4000 });
  await expect(page.getByRole("button", { name: /Otwórz przewodnik/ })).toBeVisible();
});

test("kalibracja odpalona z paska narzędzi (po pominięciu ekranu startowego) odhacza krok 1 bez udziału karty", async ({ page }) => {
  await freshDesign(page);
  // user ignoruje przewodnik od samego początku i sam sięga po linijkę
  await skipEntryScreen(page);

  await page.getByRole("button", { name: "Kalibracja skali" }).click();
  const box = await planBox(page);
  await page.mouse.click(box.x + 120, box.y + 100);
  await page.mouse.click(box.x + 320, box.y + 100);
  await page.getByLabel("Długość odcinka w metrach").fill("5");
  await page.getByRole("button", { name: "Zatwierdź skalę" }).click();

  // przewodnik pozostaje pominięty — sam skorzystał z paska, nie z karty (i tak
  // by tego nie zobaczył, sam ją odrzucił), więc karta się NIE pokazuje
  await expect(card(page)).toHaveCount(0);
});

test("pominięcie ekranu startowego odblokowuje pracę i nie wraca po odświeżeniu", async ({ page }) => {
  await freshDesign(page);
  await skipEntryScreen(page);
  await expect(page.getByRole("heading", { name: "Zaprojektuj instalację elektryczną w swoim domu" })).toHaveCount(0);

  // praca bez skali jest możliwa, ale ostrzeżenie jest trwałe
  const box = await planBox(page);
  await page.getByRole("button", { name: /Gniazdo 230 V/ }).first().click();
  await page.mouse.click(box.x + 150, box.y + 120);
  await expect(page.getByText(/Skala nieustawiona/)).toBeVisible();

  await page.waitForTimeout(900); // debounce autozapisu
  await page.reload();
  await page.getByRole("button", { name: "Instalacja" }).click();
  await expect(page.getByRole("heading", { name: "Zaprojektuj instalację elektryczną w swoim domu" })).toHaveCount(0);
  await expect(card(page)).toBeHidden();
  await expect(page.getByRole("button", { name: /Otwórz przewodnik/ })).toBeVisible();
});

test("dyskretny przycisk pomocy przywraca KARTĘ (nie ekran startowy) na żądanie", async ({ page }) => {
  await freshDesign(page);
  await skipEntryScreen(page);

  await page.getByRole("button", { name: /Otwórz przewodnik/ }).click();
  // wraca skromna karta — pominięty ekran startowy się NIE wskrzesza, inaczej
  // „Pomiń" na nim nic by nie znaczyło
  await expect(card(page)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Zaprojektuj instalację elektryczną w swoim domu" })).toHaveCount(0);
});

test("podmiana podkładu po kalibracji proponuje rekalibrację zamiast kasować skalę", async ({ page }) => {
  await freshDesign(page);
  await skipEntryScreen(page);

  await page.getByRole("button", { name: "Kalibracja skali" }).click();
  const box = await planBox(page);
  await page.mouse.click(box.x + 120, box.y + 100);
  await page.mouse.click(box.x + 320, box.y + 100);
  await page.getByLabel("Długość odcinka w metrach").fill("4");
  await page.getByRole("button", { name: "Zatwierdź skalę" }).click();
  await expect(page.locator("span.pe-chip", { hasText: /m szer\./ })).toBeVisible();

  const { makePng } = await import("./_png");
  await page.setInputFiles('input[type="file"]', {
    name: "rzut.png",
    mimeType: "image/png",
    buffer: makePng(16, 9),
  });

  // Po wgraniu pliku otwiera się najpierw przycinanie — ten test go nie
  // dotyczy, więc pomijamy. Pominięcie ma zostawić wgrany podkład nietknięty.
  await page.getByRole("button", { name: "Pomiń — użyj całego rzutu" }).click();

  await expect(page.getByText(/Podkład się zmienił/)).toBeVisible();
  // skala NIE została skasowana — nadal jest pokazana
  await expect(page.locator("span.pe-chip", { hasText: /m szer\./ })).toBeVisible();
  await page.getByRole("button", { name: "Skala jest OK" }).click();
  await expect(page.getByText(/Podkład się zmienił/)).toHaveCount(0);
});

test("kolejna kondygnacja dziedziczy skalę, ale prosi o własne pomieszczenia", async ({ page }) => {
  await freshDesign(page);
  await skipEntryScreen(page);

  // parter: skala + jedno pomieszczenie, czyli przewodnik ma krok 2 za sobą
  await page.getByRole("button", { name: "Kalibracja skali" }).click();
  const box = await planBox(page);
  await page.mouse.click(box.x + 120, box.y + 100);
  await page.mouse.click(box.x + 320, box.y + 100);
  await page.getByLabel("Długość odcinka w metrach").fill("4");
  await page.getByRole("button", { name: "Zatwierdź skalę" }).click();
  const parterScale = await page.locator("span.pe-chip", { hasText: /m szer\./ }).textContent();

  await page.getByRole("button", { name: "Narysuj Pomieszczenie", exact: true }).click();
  const box2 = await planBox(page);
  await page.mouse.move(box2.x + 100, box2.y + 80);
  await page.mouse.down();
  await page.mouse.move(box2.x + 260, box2.y + 200, { steps: 8 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Dodaj pomieszczenie" }).click();

  // nowa kondygnacja
  await otworzMenuPaska(page, "Plan");
  await page.getByRole("button", { name: "+ Dodaj kondygnację" }).click();
  await page.getByRole("button", { name: "Dodaj", exact: true }).click();

  // skala przyjechała z parteru — bez ponownego mierzenia
  await expect(page.locator("span.pe-chip", { hasText: /m szer\./ })).toHaveText(parterScale!);
  // ...ale pomieszczenia są własne i aplikacja o nie prosi
  await expect(page.getByText(/ma już skalę z parteru, ale nie ma jeszcze pomieszczeń/)).toBeVisible();
  // ekran startowy pozostaje pominięty (skala jest projektowa, nie per kondygnacja)
  await expect(page.getByRole("heading", { name: "Zaprojektuj instalację elektryczną w swoim domu" })).toHaveCount(0);
  // przewodnik NIE cofa się do kroku 1 — ale i tak jest pominięty, więc karty nie ma
  await expect(card(page)).toHaveCount(0);
});

test("szybka ścieżka: rzut w znanej skali ustawia skalę bez mierzenia", async ({ page }) => {
  await freshDesign(page);
  await skipEntryScreen(page);

  await page.getByRole("button", { name: "Kalibracja skali" }).click();
  await page.getByRole("button", { name: "Rzut jest w skali" }).click();

  await page.getByLabel("Format arkusza").selectOption("A3");
  await page.getByLabel("Skala rzutu").selectOption("100");
  // A3 = 420 mm, 1:100 → 42 m szerokości rzutu
  await expect(page.getByText(/rzut ma wtedy ok\. 42,?\.?0? m/)).toBeVisible();

  await page.getByRole("button", { name: "Zatwierdź skalę" }).click();
  await expect(page.locator("span.pe-chip", { hasText: "42.0 m szer." })).toBeVisible();
});

test("„Narysuj dom samodzielnie” z EKRANU STARTOWEGO ustawia standardową skalę i odhacza krok 1", async ({ page }) => {
  await freshDesign(page);
  await expect(page.getByRole("heading", { name: "Zaprojektuj instalację elektryczną w swoim domu" })).toBeVisible();

  await page.getByRole("button", { name: "Narysuj dom samodzielnie" }).click();

  // narzędzie ścian jest od razu aktywne, gotowe do klikania — bez ekranu kalibracji
  await expect(page.getByRole("button", { name: "Narysuj Ścianę", exact: true })).toHaveAttribute("aria-pressed", "true");

  // Rysowanie ścian tłumaczy dymek przy narzędziu, a karta „3 kroki" jest na ten
  // czas zwinięta, żeby oba nie nakładały się w lewym dolnym rogu (patrz
  // `open={onboarding.showCard && !coachMark}` w DesignTab.tsx). Zamykamy dymek —
  // karta wraca sama i dopiero wtedy widać w niej stan kroków.
  const coach = page.getByRole("dialog", { name: "Podpowiedź" });
  await expect(coach).toBeVisible();
  await coach.getByRole("button", { name: "Rozumiem" }).click();
  await expect(coach).toBeHidden();

  // dom 20×20 m ma się zmieścić w domyślnym obszarze planu przy standardowej skali —
  // sprawdzamy pośrednio: skala jest już ustawiona, więc krok 1 karty jest ukończony
  await expect(card(page)).toBeVisible();
  await expect(card(page).getByRole("button", { name: "Narysuj dom samodzielnie" })).toHaveCount(0);
  await expect(card(page).getByRole("button", { name: "Obrysuj pomieszczenie" })).toBeVisible();

  // narysowanie odcinka ściany od razu pokazuje wymiar w METRACH, nie jednostkach
  // planu — dowód, że skala naprawdę trafiła do projektu, nie tylko odhaczyła krok
  const box = await planBox(page);
  await page.mouse.click(box.x + 100, box.y + 100);
  await page.mouse.move(box.x + 300, box.y + 100, { steps: 5 });
  const teksty = await page.evaluate(() => {
    const k = (window as unknown as { Konva?: { stages: { find(sel: string): { text(): string }[] }[] } }).Konva;
    const stage = k?.stages[0];
    return stage ? stage.find("Text").map((t) => t.text()) : [];
  });
  expect(teksty.some((t) => /\d+,\d{2} m$/.test(t))).toBe(true);
});

test("„Narysuj dom samodzielnie” z trwałego banera (po pominięciu ekranu startowego) działa tak samo", async ({ page }) => {
  await freshDesign(page);
  await skipEntryScreen(page);

  // po pominięciu ekranu startowego wraca trwały baner „Zacznij od wgrania rzutu"
  // z tym samym drugim przyciskiem — ten test sprawdza WŁAŚNIE jego, nie kartę
  // (którą i tak pominęliśmy) ani ekran startowy (już zamknięty)
  await page.getByRole("button", { name: "Narysuj dom samodzielnie" }).click();
  await expect(page.getByRole("button", { name: "Narysuj Ścianę", exact: true })).toHaveAttribute("aria-pressed", "true");

  const box = await planBox(page);
  await page.mouse.click(box.x + 100, box.y + 100);
  await page.mouse.click(box.x + 300, box.y + 100);
  await page.getByRole("button", { name: "Zakończ" }).click();
  await page.waitForTimeout(900);

  const raw = await page.evaluate(() => {
    const draft = JSON.parse(localStorage.getItem("pomocnikelektryka_projekt_autosave")!).draft;
    return { walls: draft.walls.length };
  });
  expect(raw.walls).toBe(1);
});
