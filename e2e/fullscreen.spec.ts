import { test, expect, type Page } from "@playwright/test";

/**
 * Tryb pełnoekranowy: plan dostaje całe okno, a paski chowają się za krawędzie
 * i wracają po najechaniu myszą.
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

test("pełny ekran chowa paski za krawędzie i oddaje planowi całe okno", async ({ page }) => {
  await page.goto("/");

  const karta = lewaKarta(page);
  expect(await pozycjaX(karta)).toBeGreaterThanOrEqual(0);

  await page.getByRole("button", { name: "Projektowanie na pełnym ekranie" }).click();

  // Panel zjeżdża w całości poza lewą krawędź — ujemny X, nie tylko „mniejszy".
  await expect.poll(() => pozycjaX(karta), { timeout: 3000 }).toBeLessThan(0);

  // Płótno dostaje niemal całą wysokość okna: bez pasków nie ma na co zostawiać zapasu.
  const wysOkna = page.viewportSize()!.height;
  const plotno = (await page.locator("div.overflow-auto.rounded-card.border").first().boundingBox())!;
  expect(plotno.height).toBeGreaterThan(wysOkna * 0.85);
});

test("najechanie na lewą krawędź wysuwa narzędzia, odjechanie chowa je z powrotem", async ({ page }) => {
  await page.goto("/");
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

  const plotno = (await page.locator("div.overflow-auto.rounded-card.border").first().boundingBox())!;
  await page.mouse.click(plotno.x + 500, plotno.y + 150);
  await page.mouse.click(plotno.x + 620, plotno.y + 150);
  await expect(page.getByText(/Rysowanie ściany: 2 pkt\./)).toBeVisible();

  await page.keyboard.press("Escape");
  // rysunek porzucony…
  await expect(page.getByText(/Rysowanie ściany: 2 pkt\./)).toHaveCount(0);
  // …ale tryb pełnoekranowy trwa
  await expect(page.getByRole("button", { name: "Zamknij pełny ekran" })).toBeVisible();

  // Dopiero drugi Escape wychodzi z trybu.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Zamknij pełny ekran" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Projektowanie na pełnym ekranie" })).toBeVisible();
});

test("uchwyt przy lewej krawędzi zapowiada schowane narzędzia i otwiera je kliknięciem", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Projektowanie na pełnym ekranie" }).click();

  // Uchwyt to jedyny sygnał, że coś tam jest — bez niego tryb wygląda jak plan
  // bez narzędzi. Musi być widoczny od razu po wejściu, bez ruszania myszą.
  const uchwyt = page.getByRole("button", { name: "Pokaż narzędzia rysowania" });
  await expect(uchwyt).toBeVisible();
  await expect(uchwyt).toContainText("Narzędzia");

  const karta = lewaKarta(page);
  await expect.poll(() => pozycjaX(karta), { timeout: 3000 }).toBeLessThan(0);

  // Kliknięcie, nie najechanie: na tablecie nie ma najeżdżania myszą, więc sam
  // hover nie wystarczy do otwarcia panelu.
  await uchwyt.click();
  await expect.poll(() => pozycjaX(karta), { timeout: 3000 }).toBeGreaterThanOrEqual(0);

  // Gdy panel jest już wysunięty, uchwyt nie ma czego zapowiadać.
  await expect(uchwyt).toHaveCount(0);
});

test("uchwyt mieści się w pasie wyzwalającym — najechanie na niego wysuwa panel", async ({ page }) => {
  await page.goto("/");
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

  const pasek = (await page.getByLabel("Rozmiar elementów").locator("xpath=ancestor::div[contains(@class,'rounded-card')][1]").boundingBox())!;
  const wiersz = (await page.locator('nav[aria-label="Narzędzia rysowania"]').locator("xpath=ancestor::div[contains(@class,'items-start')][1]").boundingBox())!;

  // Pusty rząd kontrolek kontekstowych ma znikać z układu (`empty:hidden`), a nie
  // zbierać margines z obu stron — inaczej wstawiał 32 px pustki między pasek
  // a płótno, mimo zerowej wysokości.
  const odstep = wiersz.y - (pasek.y + pasek.height);
  expect(odstep).toBeGreaterThanOrEqual(0);
  expect(odstep).toBeLessThan(12);
});

test("kondygnacje mieszkają w jednym pasku razem z podkładem i siatką", async ({ page }) => {
  await page.goto("/");

  // Wszystkie cztery kontrolki dzielą JEDNĄ kartę paska — po scaleniu nie ma już
  // osobnego rzędu na kondygnacje.
  const pasek = page.getByRole("button", { name: "Parter" }).locator("xpath=ancestor::div[contains(@class,'rounded-card')][1]");
  await expect(pasek.getByRole("button", { name: "+ Dodaj kondygnację" })).toBeVisible();
  await expect(pasek.getByRole("button", { name: "Wgraj podkład" })).toBeVisible();
  await expect(pasek.getByLabel("Przyciągaj do siatki")).toBeVisible();
  await expect(pasek.getByLabel("Rozmiar elementów")).toBeVisible();
});
