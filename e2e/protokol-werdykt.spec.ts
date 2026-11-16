import { test, expect, type Page } from "@playwright/test";

/**
 * Werdykt protokołu przy niekompletnych danych.
 *
 * Wiersze bez wyników były pomijane, więc jeden wypełniony pomiar izolacji na trzy
 * wiersze albo jedna pozycja oględzin „zgodne" na dwanaście dawały „Wynik pozytywny —
 * instalacja w badanym zakresie spełnia wymagania" — w dokumencie formalnym.
 */

async function otworz(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Protokoły pomiarowe" }).first().click();
  await expect(page.getByTestId("karta-protokolu")).toBeVisible();
}

test("izolacja: 1 z 3 wierszy wypełniony — niekompletny, a nie pozytywny", async ({ page }) => {
  await otworz(page);
  await page.getByRole("button", { name: /^Pomiar rezystancji izolacji/ }).first().click();
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: /Dodaj wiersz/ }).click();
  await page.getByLabel("L1-N, pozycja 1").fill("250");
  await page.getByLabel("L1-PE/PEN, pozycja 1").fill("300");
  await page.getByLabel("N-PE, pozycja 1").fill("280");

  await expect(page.getByTestId("protokol-niekompletny")).toContainText("Niekompletny — 2 wiersze bez wyników");
  await expect(page.getByText("Wynik pozytywny")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Pomiar rezystancji izolacji/ })).toContainText("niekompletny");

  // Usunięcie pustych wierszy domyka protokół.
  await page.getByRole("button", { name: "Usuń wiersz 3" }).click();
  await page.getByRole("button", { name: "Usuń wiersz 2" }).click();
  await expect(page.getByText("Wynik pozytywny")).toBeVisible();
});

test("oględziny: jedna pozycja zgodna na dwanaście — niekompletny", async ({ page }) => {
  await otworz(page);
  await page.getByRole("button", { name: /^Oględziny instalacji/ }).first().click();
  await page.getByRole("button", { name: /Wczytaj listę kontrolną/ }).click();
  await page.getByRole("button", { name: "zgodne", exact: true }).first().click();
  await expect(page.getByTestId("protokol-niekompletny")).toContainText("Niekompletny — 11 pozycji bez oceny");
  await expect(page.getByText("Wynik pozytywny")).toHaveCount(0);
});

test("pętla zwarcia: zapas powyżej 1,0 nie rozluźnia oceny — pomiar niezgodny zostaje negatywny", async ({ page }) => {
  // Próg to Zs max × wpisana liczba, więc dawny „współczynnik bezpieczeństwa" równy 2
  // przepuszczał pętlę dwa razy za długą jako wynik POZYTYWNY w dokumencie dla klienta.
  await otworz(page);
  await page.getByRole("button", { name: /^Pomiar impedancji pętli zwarcia/ }).first().click();
  await page.getByRole("button", { name: /Dodaj wiersz/ }).click();
  await page.getByLabel("Zs L1 [Ω], pozycja 1").fill("4");
  await expect(page.getByText("Wynik negatywny")).toBeVisible();

  const pole = page.locator('input[type="number"][max="1"]');
  await expect(pole).toHaveAttribute("min", "0.1");
  await pole.fill("2");

  await expect(page.getByRole("status").filter({ hasText: "spoza dopuszczalnego zakresu" })).toContainText("użyto 1");
  await expect(page.getByText("Wynik negatywny")).toBeVisible();
  await expect(page.getByText("Wynik pozytywny")).toHaveCount(0);
});

test("pętla zwarcia: pomiar zgodny z normą, ale bez zapasu 0,8 — pozytywna z uwagą, która znika przy zapasie", async ({ page }) => {
  // Przegląd 15.11.2026 (b), pkt 1: kalkulator zalecał przy odbiorze Zs ≤ 0,8·Zs max, a protokół
  // odbioru dawał czyste „pozytywna” obwodowi zmierzonemu tuż pod granicą normy.
  // B16: Zs max ≈ 2,73 Ω, zalecane ≤ 2,18 Ω.
  await otworz(page);
  await page.getByRole("button", { name: /^Pomiar impedancji pętli zwarcia/ }).first().click();
  await page.getByRole("button", { name: /Dodaj wiersz/ }).click();
  const zs = page.getByLabel("Zs L1 [Ω], pozycja 1");
  await zs.fill("2.5");

  await expect(page.getByText("Wynik pozytywny")).toBeVisible();
  await expect(page.getByTestId("uwaga-wiersza")).toHaveText("bez zapasu (zalecane ≤\u00a02,18\u00a0Ω)");

  await zs.fill("1.8");
  await expect(page.getByTestId("uwaga-wiersza")).toHaveCount(0);
  await expect(page.getByText("Wynik pozytywny")).toBeVisible();
});

test("pętla zwarcia: wkładka gG — Ia i Zs max z charakterystyki wkładki, ocena ostrzejsza niż dla B16", async ({ page }) => {
  // Przegląd 15.11.2026 (b), pkt 2: obwodów zabezpieczonych wkładkami gG nie dało się ocenić.
  await otworz(page);
  await page.getByRole("button", { name: /^Pomiar impedancji pętli zwarcia/ }).first().click();
  await page.getByRole("button", { name: /Dodaj wiersz/ }).click();
  await page.getByLabel("Zs L1 [Ω], pozycja 1").fill("2");
  await expect(page.getByText("Wynik pozytywny")).toBeVisible(); // B16: Zs max ≈ 2,73 Ω

  await page.getByLabel("Char., pozycja 1").selectOption("gG D0");
  const wiersz = page.getByTestId("wiersz-pomiaru").first();
  await expect(wiersz).toContainText("120"); // Ia = Imax(0,4 s) dla D0gG 16 A
  await expect(wiersz).toContainText("1,82");
  await expect(page.getByText("Wynik negatywny")).toBeVisible();

  // D0 nie ma 32 A — brak oceny zamiast zgadniętej wartości
  await page.getByLabel("In [A], pozycja 1").fill("32");
  await expect(page.getByTestId("protokol-niekompletny")).toBeVisible();
});
