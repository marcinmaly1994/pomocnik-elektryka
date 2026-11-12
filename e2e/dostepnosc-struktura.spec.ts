import { test, expect, type Page } from "@playwright/test";

/**
 * Struktura dostępności: landmark treści i nazwy pól wyboru.
 *
 * Audyt axe-core wykazał brak elementu `<main>` (ponad 600 węzłów „poza landmarkami")
 * i dwa pola wyboru bez nazwy w formularzu dodawania aparatu — czytnik ekranu czytał je
 * jako „lista rozwijana" bez żadnej wskazówki, co wybiera.
 */

async function otworzPrzyklad(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Zobacz gotowy przykład" }).click();
  await page.getByRole("button", { name: /Mieszkanie 70/ }).click();
}

test("każda zakładka ma dokładnie jeden landmark main", async ({ page }) => {
  await otworzPrzyklad(page);
  await expect(page.getByRole("main")).toHaveCount(1);
  for (const zakladka of ["Rozdzielnica", "Schemat", "Kosztorys"]) {
    await page.getByRole("button", { name: new RegExp(zakladka) }).first().click();
    await expect(page.getByRole("main")).toHaveCount(1);
  }
  await page.getByRole("button", { name: "Kalkulatory" }).first().click();
  await expect(page.getByRole("main")).toHaveCount(1);
  await page.getByRole("button", { name: "Protokoły pomiarowe" }).first().click();
  await expect(page.getByRole("main")).toHaveCount(1);
});

test("formularz dodawania aparatu: pola wyboru mają nazwy", async ({ page }) => {
  await otworzPrzyklad(page);
  await page.getByRole("button", { name: /Rozdzielnica/ }).first().click();
  await expect(page.getByRole("combobox", { name: "Rodzaj aparatu do dodania" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Prąd znamionowy dodawanego aparatu" })).toBeVisible();
});

test("przycisk logo ma w nazwie cały widoczny tekst (hasło też)", async ({ page }) => {
  // Kto steruje głosem, mówi to, co widzi. Nazwa bez hasła pod nazwą marki go nie rozpoznawała.
  await page.setViewportSize({ width: 1440, height: 900 });
  await otworzPrzyklad(page);
  await expect(
    page.getByRole("button", { name: /Zaprojektuj instalację elektryczną w swoim domu!.*wróć do projektowania instalacji/ })
  ).toBeVisible();
});

test("nagłówek narzędzia w edytorze to h2, a przycisk sprawdzenia zawiera swój widoczny tekst", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await otworzPrzyklad(page);
  await expect(page.getByTestId("naglowek-narzedzia").getByRole("heading", { level: 2 })).toBeVisible();
  const przycisk = page.getByTestId("sprawdzenie-w-pasku");
  const widoczny = (await przycisk.innerText()).trim();
  expect(widoczny.length).toBeGreaterThan(0);
  expect(await przycisk.getAttribute("aria-label")).toContain(widoczny);
});

test("przewijany schemat na telefonie da się obsłużyć z klawiatury", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await otworzPrzyklad(page);
  await page.getByRole("button", { name: /Schemat/ }).first().click();
  const okno = page.getByRole("region", { name: /Schemat jednokreskowy/ });
  await expect(okno).toHaveAttribute("tabindex", "0");
  await okno.focus();
  await expect(okno).toBeFocused();
});

test("przełącznik stref ochronnych mówi, czy jest włączony — jak siatka i trasy obok", async ({ page }) => {
  // R4 z audytu Instalacji 11.11.2026: miał stały opis „Pokaż strefy…" także przy
  // widocznych strefach i nie miał `aria-pressed`, w przeciwieństwie do sąsiadów.
  await otworzPrzyklad(page);
  const wlaczone = page.getByRole("button", { name: "Ukryj strefy ochronne w łazience" });
  await expect(wlaczone).toHaveAttribute("aria-pressed", "true");
  await wlaczone.click();
  const wylaczone = page.getByRole("button", { name: "Pokaż strefy ochronne w łazience" });
  await expect(wylaczone).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("button", { name: "Ukryj strefy ochronne w łazience" })).toHaveCount(0);
});
