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
