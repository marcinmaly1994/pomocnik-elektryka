import { test, expect } from "@playwright/test";
import { skipEntryScreen, otworzKatalogElementow } from "./_flow";

/**
 * Dobór normatywny widoczny w Rozdzielnicy.
 *
 * Sens tego testu to WPIĘCIE, nie matematyka: same tablice i wzory mają komplet
 * testów jednostkowych w `src/lib/panel/sizing.test.ts`. Tu sprawdzamy, że liczby
 * z silnika faktycznie docierają na ekran — bo wcześniej zakładka pokazywała
 * stałe „B16 / 2,5 mm²" wpisane przy generowaniu obwodów, niezależnie od tego,
 * co na planie stało.
 */

async function planBox(page: import("@playwright/test").Page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  return (await page.locator("div.overflow-auto.rounded-card.border").first().boundingBox())!;
}

test("rozdzielnica pokazuje przekrój i zabezpieczenie policzone, a nie wpisane na sztywno", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Instalacja" }).click();
  await skipEntryScreen(page);

  // Box mierzony PO każdym kliknięciu (własna funkcja `planBox` wraca na górę
  // strony przed pomiarem) i osobno przed KAŻDYM kliknięciem na płótnie: klik
  // zmieniający narzędzie oraz postawienie PIERWSZEGO elementu (odsłania trwały
  // baner ryzyka nad płótnem) potrafią przesunąć płótno, więc stary box staje
  // się nieaktualny w trakcie tej samej serii kliknięć.

  // 3 gniazda → obwód gniazdowy, oczekiwany 2,5 mm² / B16
  await otworzKatalogElementow(page);
  await page.getByRole("button", { name: /Gniazdo 230 V/ }).first().click();
  for (const dx of [120, 220, 320]) {
    const box = await planBox(page);
    await page.mouse.click(box.x + dx, box.y + 90);
  }

  // 2 punkty sufitowe → obwód oświetleniowy, oczekiwany 1,5 mm² / B10.
  // Kategoria „Oświetlenie" w bibliotece jest zwinięta — najpierw trzeba ją rozwinąć.
  await otworzKatalogElementow(page);
  await page.getByRole("button", { name: /Oświetlenie/ }).first().click();
  await page.getByRole("button", { name: /Punkt sufitowy/ }).first().click();
  for (const dx of [150, 280]) {
    const box2 = await planBox(page);
    await page.mouse.click(box2.x + dx, box2.y + 200);
  }

  await page.getByRole("button", { name: "Rozdzielnica", exact: true }).click();

  const card = page.locator("div.pe-card", { hasText: "Dobór obwodów wg PN-HD 60364" });
  await expect(card).toBeVisible();

  // obwód gniazdowy i oświetleniowy MUSZĄ dostać różne wartości — gdyby dobór nie
  // działał, oba miałyby tę samą stałą z `computeCircuits`
  const socketRow = card.locator("tr", { hasText: "Obwód gniazd" }).first();
  await expect(socketRow).toContainText("2,5 mm²");
  await expect(socketRow).toContainText("B16 1P");

  const lightRow = card.locator("tr", { hasText: "Obwód oświetlenia" }).first();
  await expect(lightRow).toContainText("1,5 mm²");
  await expect(lightRow).toContainText("B10 1P");

  // Zs max wynika z charakterystyki: B10 → 230/(5·10) = 4,6 Ω, B16 → 230/(5·16) = 2,875 Ω
  await expect(lightRow).toContainText("4.37 Ω");
  await expect(socketRow).toContainText("2.731 Ω");
});

test("bez kalibracji skali spadek napięcia jest zgłoszony jako niesprawdzony, a nie zmyślony", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Instalacja" }).click();
  await skipEntryScreen(page);

  await otworzKatalogElementow(page);
  await page.getByRole("button", { name: /Gniazdo 230 V/ }).first().click();
  const box = await planBox(page);
  await page.mouse.click(box.x + 120, box.y + 90);

  await page.getByRole("button", { name: "Rozdzielnica", exact: true }).click();
  const card = page.locator("div.pe-card", { hasText: "Dobór obwodów wg PN-HD 60364" });

  // Komunikat NAZYWA kondygnację, zamiast mówić „plan nie ma skali": skala jest
  // właściwością kondygnacji, więc przy kilku piętrach trzeba wiedzieć, które otworzyć.
  await expect(card.getByText(/Bez skali: Parter/)).toBeVisible();
  // fraza z ostrzeżenia przy konkretnym obwodzie, nie z nagłówka karty
  await expect(card.getByText(/Dobór pokrywa wyłącznie obciążalność/)).toBeVisible();
  // kolumna ΔU pokazuje kreskę, a nie liczbę wziętą z długości „na oko"
  await expect(card.locator("tbody tr").first()).toContainText("—");
});

test("bilans faz podaje udział procentowy, nie tylko ampery", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Instalacja" }).click();
  await skipEntryScreen(page);

  await otworzKatalogElementow(page);
  await page.getByRole("button", { name: /Gniazdo 230 V/ }).first().click();
  for (let i = 0; i < 3; i++) {
    const box = await planBox(page);
    await page.mouse.click(box.x + 120 + i * 90, box.y + 90);
  }

  await page.getByRole("button", { name: "Rozdzielnica", exact: true }).click();
  await expect(page.getByText(/Bilans obciążenia faz/)).toBeVisible();
  // opis musi mówić, że liczymy prąd obliczeniowy, a nie znamionowy zabezpieczeń
  await expect(page.getByText(/prąd obliczeniowy odbiorników/)).toBeVisible();
  await expect(page.locator("span", { hasText: /^\d+(\.\d+)? A · \d+(\.\d+)?%$/ }).first()).toBeVisible();
});
