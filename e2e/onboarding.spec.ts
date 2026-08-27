import { test, expect, type Page } from "@playwright/test";

/**
 * Onboarding „Zacznij w 3 krokach".
 *
 * Logika przejść i walidacja mają testy jednostkowe w `src/lib/onboarding.test.ts`.
 * Tutaj sprawdzamy rzeczy, których nie widać bez przeglądarki: że karta faktycznie
 * prowadzi do właściwego narzędzia, że kroki odhaczają się od DZIAŁANIA użytkownika
 * (a nie od kliknięcia w kartę) i że pominięcie naprawdę odblokowuje pracę.
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

test("karta prowadzi od skali do pierwszego elementu i znika po ukończeniu", async ({ page }) => {
  await freshDesign(page);
  await expect(card(page)).toBeVisible();

  // Bez podkładu krok 1 prosi najpierw o rzut — nie ma czego mierzyć (przypadek 1)
  await expect(card(page).getByRole("button", { name: "Wgraj rzut" })).toBeVisible();
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
  await expect(page.getByText(/Podkład: rzut.png/)).toBeVisible();

  // KROK 1 — CTA włącza narzędzie skali i pokazuje coach-mark
  await card(page).getByRole("button", { name: "Ustaw skalę" }).click();
  const coach = page.getByRole("dialog", { name: "Podpowiedź" });
  await expect(coach).toBeVisible();
  await expect(coach).toContainText("dwa punkty o znanej odległości");
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

test("kalibracja odpalona z paska narzędzi odhacza krok 1 bez udziału karty", async ({ page }) => {
  await freshDesign(page);
  // bez podkładu krok 1 proponuje dwie równoległe drogi startu, nie tylko skalę
  await expect(card(page).getByText("Wgraj rzut albo narysuj dom").first()).toBeVisible();

  // user ignoruje kartę i sam sięga po linijkę
  await page.getByRole("button", { name: "Kalibracja skali" }).click();
  const box = await planBox(page);
  await page.mouse.click(box.x + 120, box.y + 100);
  await page.mouse.click(box.x + 320, box.y + 100);
  await page.getByLabel("Długość odcinka w metrach").fill("5");
  await page.getByRole("button", { name: "Zatwierdź skalę" }).click();

  // checklist ma to wykryć samodzielnie
  await expect(card(page).getByText("Zaznacz pomieszczenia")).toBeVisible();
  await expect(card(page).getByRole("button", { name: "Obrysuj pomieszczenie" })).toBeVisible();
});

test("pominięcie odblokowuje pracę i nie wraca po odświeżeniu", async ({ page }) => {
  await freshDesign(page);
  await expect(card(page)).toBeVisible();

  await card(page).getByRole("button", { name: /Pomiń/ }).click();
  await expect(card(page)).toBeHidden();

  // praca bez skali jest możliwa, ale ostrzeżenie jest trwałe
  const box = await planBox(page);
  await page.getByRole("button", { name: /Gniazdo 230 V/ }).first().click();
  await page.mouse.click(box.x + 150, box.y + 120);
  await expect(page.getByText(/Skala nieustawiona/)).toBeVisible();

  await page.waitForTimeout(900); // debounce autozapisu
  await page.reload();
  await page.getByRole("button", { name: "Instalacja" }).click();
  await expect(card(page)).toBeHidden();
  await expect(page.getByRole("button", { name: /Otwórz przewodnik/ })).toBeVisible();
});

test("dyskretny przycisk pomocy przywraca kartę na żądanie", async ({ page }) => {
  await freshDesign(page);
  await card(page).getByRole("button", { name: /Pomiń/ }).click();
  await page.getByRole("button", { name: /Otwórz przewodnik/ }).click();
  await expect(card(page)).toBeVisible();
});

test("podmiana podkładu po kalibracji proponuje rekalibrację zamiast kasować skalę", async ({ page }) => {
  await freshDesign(page);

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
  await page.getByRole("button", { name: "+ Dodaj kondygnację" }).click();
  await page.getByRole("button", { name: "Dodaj", exact: true }).click();

  // skala przyjechała z parteru — bez ponownego mierzenia
  await expect(page.locator("span.pe-chip", { hasText: /m szer\./ })).toHaveText(parterScale!);
  // ...ale pomieszczenia są własne i aplikacja o nie prosi
  await expect(page.getByText(/ma już skalę z parteru, ale nie ma jeszcze pomieszczeń/)).toBeVisible();
  // przewodnik NIE cofa się do kroku 1 — skala jest projektowa, nie per kondygnacja
  await expect(card(page).getByRole("button", { name: "Ustaw skalę" })).toHaveCount(0);
  await expect(card(page).getByRole("button", { name: "Obrysuj pomieszczenie" })).toHaveCount(0);
});

test("szybka ścieżka: rzut w znanej skali ustawia skalę bez mierzenia", async ({ page }) => {
  await freshDesign(page);
  await page.getByRole("button", { name: "Kalibracja skali" }).click();
  await page.getByRole("button", { name: "Rzut jest w skali" }).click();

  await page.getByLabel("Format arkusza").selectOption("A3");
  await page.getByLabel("Skala rzutu").selectOption("100");
  // A3 = 420 mm, 1:100 → 42 m szerokości rzutu
  await expect(page.getByText(/rzut ma wtedy ok\. 42,?\.?0? m/)).toBeVisible();

  await page.getByRole("button", { name: "Zatwierdź skalę" }).click();
  await expect(page.locator("span.pe-chip", { hasText: "42.0 m szer." })).toBeVisible();
});

test("„Narysuj dom samodzielnie” z karty ustawia standardową skalę i odhacza krok 1", async ({ page }) => {
  await freshDesign(page);
  await expect(card(page).getByText("Wgraj rzut albo narysuj dom")).toBeVisible();

  await card(page).getByRole("button", { name: "Narysuj dom samodzielnie" }).click();

  // narzędzie ścian jest od razu aktywne, gotowe do klikania — bez ekranu kalibracji
  await expect(page.getByRole("button", { name: "Narysuj Ścianę", exact: true })).toHaveAttribute("aria-pressed", "true");
  // dom 20×20 m ma się zmieścić w domyślnym obszarze planu przy standardowej skali —
  // sprawdzamy pośrednio: skala jest już ustawiona, więc krok 1 jest ukończony
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

test("„Narysuj dom samodzielnie” z kolumny narzędzi (poza kartą) działa tak samo", async ({ page }) => {
  await freshDesign(page);
  await card(page).getByRole("button", { name: /Pomiń/ }).click();

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
