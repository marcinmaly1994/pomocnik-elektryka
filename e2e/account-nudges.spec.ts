import { test, expect } from "@playwright/test";
import { skipEntryScreen, otworzKatalogElementow } from "./_flow";

/**
 * Zachęty do założenia konta — projekt bez konta żyje WYŁĄCZNIE w localStorage
 * tej przeglądarki, a apka wcześniej milczała na ten temat.
 *
 * JEDEN komunikat: trwały baner ryzyka, widoczny cały czas, gdy jest coś do
 * stracenia i nikt nie jest zalogowany — nie da się go wyciszyć, bo ryzyko nie
 * znika. Obok stał kiedyś drugi („Włożyłeś już sporo pracy…") z tą samą prośbą;
 * od 7.11.2026 baner ryzyka sam podaje liczbę elementów, a drugiego paska nie ma.
 */

async function wejdz(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Instalacja" }).click();
  await skipEntryScreen(page);
}

const BANER_RYZYKA = /Ten projekt istnieje tylko w tej przeglądarce/;
const PROMPT_KONTO = /Włożyłeś już sporo pracy/;

test("baner ryzyka nie pojawia się na pustym projekcie", async ({ page }) => {
  await wejdz(page);
  await expect(page.getByText(BANER_RYZYKA)).toBeHidden();
});

test("baner ryzyka pojawia się po dodaniu pierwszego elementu i otwiera logowanie", async ({ page }) => {
  await wejdz(page);
  // Box mierzony PO kliknięciu, które zmienia narzędzie, ze scrollTo(0,0) tuż
  // przedtem: takie kliknięcie potrafi przesunąć stronę, więc box zmierzony
  // wcześniej byłby nieaktualny (patrz `zoomAndBox` w room-editing.spec.ts).
  await otworzKatalogElementow(page);
  await page.getByRole("button", { name: /Gniazdo 230 V/ }).first().click();
  await page.evaluate(() => window.scrollTo(0, 0));
  const box = (await page.locator("[data-testid=plan-okno]").first().boundingBox())!;
  await page.mouse.click(box.x + 150, box.y + 130);

  await expect(page.getByText(BANER_RYZYKA)).toBeVisible();

  await page.getByRole("button", { name: "Zabezpiecz kontem" }).click();
  await expect(page.getByRole("heading", { name: "Zaloguj się" })).toBeVisible();
});

test("przy wielu elementach jest JEDEN pasek o koncie — z ich liczbą, bez drugiego", async ({ page }) => {
  await wejdz(page);
  await otworzKatalogElementow(page);
  await page.getByRole("button", { name: /Gniazdo 230 V/ }).first().click();
  // Box mierzony na nowo PRZED KAŻDYM kliknięciem, ze scrollTo(0,0) tuż przedtem:
  // postawienie PIERWSZEGO elementu odsłania baner ryzyka nad płótnem, co przesuwa
  // je w dół (ten sam wzorzec co `zoomAndBox` w room-editing.spec.ts).
  for (let i = 0; i < 11; i++) {
    await page.evaluate(() => window.scrollTo(0, 0));
    const box = (await page.locator("[data-testid=plan-okno]").first().boundingBox())!;
    await page.mouse.click(box.x + 40 + (i % 6) * 50, box.y + 40 + Math.floor(i / 6) * 50);
  }
  await page.waitForTimeout(900);

  await expect(page.getByText(BANER_RYZYKA)).toContainText("(11 elementów)");
  await expect(page.getByText(PROMPT_KONTO)).toHaveCount(0);
});
