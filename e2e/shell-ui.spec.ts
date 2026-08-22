import { test, expect } from "@playwright/test";

/**
 * Powłoka aplikacji: nagłówek, suwak rozmiaru symboli i stopka.
 *
 * Stopka niesie zastrzeżenie, że wyniki są orientacyjne i nie zastępują projektu ani
 * odbioru przez uprawnioną osobę — przy aplikacji adresowanej do laików to nie jest
 * ozdoba, więc test pilnuje, żeby nie zniknęła przy porządkach w układzie strony.
 */

async function planBox(page: import("@playwright/test").Page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  return (await page.locator("div.overflow-auto.rounded-card.border").first().boundingBox())!;
}

test("suwak zmienia rozmiar symboli, nie ich położenie", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Instalacja" }).click();

  await page.getByRole("button", { name: /Gniazdo 230 V/ }).first().click();
  const box = await planBox(page);
  await page.mouse.click(box.x + 150, box.y + 120);

  /** Rozmiar i położenie symbolu wprost z węzła Konvy. */
  const glyph = () =>
    page.evaluate(() => {
      const konva = (window as unknown as {
        Konva?: { stages: { find(s: string): { scaleX(): number; x(): number; y(): number }[] }[] };
      }).Konva;
      const groups = konva!.stages[0].find("Group");
      // grupa elementu to jedyna ze skalą ustawianą suwakiem i pozycją na planie
      const g = groups.find((n) => n.x() > 0 && n.y() > 0)!;
      return { scale: g.scaleX(), x: g.x(), y: g.y() };
    });

  // suwak domyślnie pokazuje 1.0× (punkt odniesienia „bez zmian"), ale render mnoży to
  // przez bazowy współczynnik geometrii glifów — stąd realna skala w Konvie to 0.7, nie 1
  const DISPLAY_DEFAULT = 1;
  const BASE_ELEMENT_SCALE = 0.7;
  const before = await glyph();
  expect(before.scale).toBeCloseTo(DISPLAY_DEFAULT * BASE_ELEMENT_SCALE, 5);

  await page.getByLabel("Rozmiar elementów").fill("2");
  await expect(page.getByText("2.0×")).toBeVisible();

  const after = await glyph();
  expect(after.scale).toBeCloseTo(2 * BASE_ELEMENT_SCALE, 5);
  // suwak skaluje SYMBOL, a nie przesuwa elementu — współrzędne muszą zostać te same
  expect(after.x).toBeCloseTo(before.x, 5);
  expect(after.y).toBeCloseTo(before.y, 5);

  // „reset" wraca do wartości DOMYŚLNEJ suwaka (1.0×), czyli tej samej realnej skali co start
  await page.getByRole("button", { name: "reset" }).click();
  expect((await glyph()).scale).toBeCloseTo(DISPLAY_DEFAULT * BASE_ELEMENT_SCALE, 5);
});

/**
 * Przyciski akcji głównej muszą mieć widoczne tło.
 *
 * Klasa `.pe-btn-copper` zniknęła kiedyś z arkusza przy migracji na komponent
 * `Button`, ale osiem surowych <button> nadal jej używało — renderowały się jako
 * goły tekst i nie wyglądały na klikalne. Tego typu regresji nie widać w żadnym
 * teście funkcjonalnym: przycisk DZIAŁA, tylko wygląda jak etykieta.
 */
test("przyciski akcji głównej mają widoczne tło, a nie sam tekst", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Instalacja" }).click();

  await page.getByRole("button", { name: "Kalibracja skali" }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  const box = (await page.locator("div.overflow-auto.rounded-card.border").first().boundingBox())!;
  await page.mouse.click(box.x + 120, box.y + 100);
  await page.mouse.click(box.x + 320, box.y + 100);

  const cta = page.getByRole("button", { name: "Zatwierdź skalę" });
  await expect(cta).toBeVisible();
  const bg = await cta.evaluate((el) => getComputedStyle(el).backgroundColor);
  // dowolny kolor poza przezroczystym — chodzi o to, że tło W OGÓLE jest
  expect(bg).not.toBe("rgba(0, 0, 0, 0)");
  expect(bg).not.toBe("transparent");
});

test("kliknięcie w logo wraca do etapu Instalacja z dowolnej zakładki", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  // wychodzimy poza główny przepływ — stąd użytkownik najczęściej szuka drogi powrotnej
  await page.getByRole("button", { name: "Kalkulatory" }).click();
  await expect(page.getByRole("button", { name: "Kalibracja skali" })).toHaveCount(0);

  await page.getByRole("button", { name: /wróć do projektowania instalacji/i }).click();
  await expect(page.getByRole("button", { name: "Kalibracja skali" })).toBeVisible();
});

test("stopka zawiera zastrzeżenie o orientacyjnym charakterze wyników", async ({ page }) => {
  await page.goto("/");
  const footer = page.locator("footer");
  await expect(footer).toBeVisible();
  await expect(footer.getByText(/orientacyjne/)).toBeVisible();
  await expect(footer.getByText(/nie zastępują projektu/i)).toBeVisible();
  await expect(footer.getByText(/uprawniony elektryk/i)).toBeVisible();
});

test("nagłówek eksponuje nazwę i hasło strony", async ({ page }) => {
  await page.goto("/");
  const h1 = page.getByRole("heading", { level: 1 });
  await expect(h1).toContainText("pomocnikelektryka");

  // hasło nie może zginąć: sprawdzamy, że jest widoczne i większe od drobnego tekstu
  const size = await h1.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(size).toBeGreaterThanOrEqual(22);
  await expect(page.getByText(/Zaprojektuj instalację elektryczną w swoim domu/)).toBeVisible();
});

/**
 * Przycisk „Pomoc" kiedyś przewijał do sekcji `#pomoc`, która nigdy nie istniała —
 * klik nie robił nic. Teraz otwiera okno z opisem aplikacji i krokami dla laika.
 */
test("przycisk Pomoc otwiera okno z opisem aplikacji i krokami startowymi", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.getByRole("button", { name: "Pomoc", exact: true }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Pomoc" })).toBeVisible();
  await expect(dialog.getByText(/pomaga zaprojektować instalację elektryczną/)).toBeVisible();
  await expect(dialog.getByText("Jak zacząć — krok po kroku")).toBeVisible();
  // krok 1 wymienia narzędzie DOKŁADNIE tak, jak nazywa się w pasku narzędzi rysowania —
  // laik szuka w treści pomocy tego, co widzi na ekranie, nie parafrazy
  await expect(dialog.getByText(/Narysuj Ścianę/)).toBeVisible();
  await expect(dialog.getByText(/skonsultuj projekt z elektrykiem/)).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
