import { test, expect, type Page } from "@playwright/test";

/**
 * Zestawienie ilosciowe w zakladce Instalacja.
 *
 * Arytmetyka ma testy jednostkowe (`summarizeFloor`). Tutaj chodzi o spiecie: czy karta
 * liczy z BIEZACEJ kondygnacji, czy odswieza sie po kazdej zmianie planu i czy podaje
 * te same liczby, co pasek stanu — rozjazd miedzy nimi bylby gorszy niz brak zestawienia.
 */

async function planBox(page: Page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  return (await page.locator("div.overflow-auto.rounded-card.border").first().boundingBox())!;
}

async function pustyProjekt(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByText("Zacznij projektować instalację")).toBeVisible();
  await page.getByRole("button", { name: "Narysuj dom samodzielnie" }).click();
  const rozumiem = page.getByRole("button", { name: "Rozumiem" });
  if (await rozumiem.count()) await rozumiem.click();
}

async function postaw(page: Page, szukaj: string, nazwa: RegExp, x: number, y: number) {
  await page.getByRole("button", { name: "Wstaw Element" }).click();
  await page.getByPlaceholder(/Szukaj elementu/).fill(szukaj);
  await page.getByRole("button", { name: nazwa }).click();
  const box = await planBox(page);
  await page.mouse.click(box.x + x, box.y + y);
}

const karta = (page: Page) => page.locator("div.pe-card", { hasText: "Zestawienie elementów" });

async function rozwin(page: Page) {
  await karta(page).getByRole("button", { name: /Zestawienie elementów/ }).click();
}

test("zestawienie rosnie razem z rysunkiem i zgadza sie z paskiem stanu", async ({ page }) => {
  await pustyProjekt(page);
  await expect(karta(page)).toContainText("nic jeszcze nie postawiono");

  await postaw(page, "gniazdo 230", /Gniazdo 230 V/, 200, 200);
  await postaw(page, "gniazdo 230", /Gniazdo 230 V/, 280, 200);
  await postaw(page, "sufit", /Punkt sufitowy/, 350, 260);

  await expect(karta(page)).toContainText("3 szt.");
  // Ta sama liczba w pasku stanu — dwa miejsca nie moga podawac roznych sum.
  await expect(page.getByText(/Elementy:\s*3/)).toBeVisible();

  await rozwin(page);
  await expect(karta(page)).toContainText("Gniazdo 230 V");
  await expect(karta(page)).toContainText("Punkt sufitowy");
});

test("wyposazenie sanitarne nie jest liczone jako osprzet", async ({ page }) => {
  await pustyProjekt(page);
  await postaw(page, "gniazdo 230", /Gniazdo 230 V/, 200, 200);
  await postaw(page, "wanna", /Wanna/, 350, 260);

  // Pasek stanu liczy WSZYSTKIE elementy na planie, zestawienie tylko osprzet —
  // stad celowa roznica 2 kontra 1.
  await expect(page.getByText(/Elementy:\s*2/)).toBeVisible();
  await expect(karta(page)).toContainText("1 szt.");
  await rozwin(page);
  await expect(karta(page)).not.toContainText("Wanna");
});

test("zestawienie dotyczy BIEZACEJ kondygnacji", async ({ page }) => {
  await pustyProjekt(page);
  await postaw(page, "gniazdo 230", /Gniazdo 230 V/, 200, 200);
  await expect(karta(page)).toContainText("1 szt.");

  await page.getByRole("button", { name: "+ Dodaj kondygnację" }).click();
  await page.getByRole("button", { name: "Dodaj", exact: true }).click();

  await expect(karta(page)).toContainText("nic jeszcze nie postawiono");
});
