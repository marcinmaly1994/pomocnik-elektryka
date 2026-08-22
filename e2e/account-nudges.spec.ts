import { test, expect } from "@playwright/test";

/**
 * Zachęty do założenia konta — projekt bez konta żyje WYŁĄCZNIE w localStorage
 * tej przeglądarki, a apka wcześniej milczała na ten temat.
 *
 * Dwa oddzielne komunikaty, każdy z innym powodem:
 * - trwały baner ryzyka: widoczny cały czas, gdy jest coś do stracenia i nikt
 *   nie jest zalogowany — nie da się go wyciszyć, bo ryzyko nie znika.
 * - jednorazowy prompt po >10 elementach: da się odrzucić na stałe, żeby nie
 *   nagabywać w kółko o to samo.
 */

async function wejdz(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Instalacja" }).click();
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
  await page.getByRole("button", { name: /Gniazdo 230 V/ }).first().click();
  await page.evaluate(() => window.scrollTo(0, 0));
  const box = (await page.locator("div.overflow-auto.rounded-card.border").first().boundingBox())!;
  await page.mouse.click(box.x + 150, box.y + 130);

  await expect(page.getByText(BANER_RYZYKA)).toBeVisible();

  await page.getByRole("button", { name: "Zabezpiecz kontem" }).click();
  await expect(page.getByRole("heading", { name: "Zaloguj się" })).toBeVisible();
});

test("prompt „sporo pracy” nie pojawia się poniżej progu elementów", async ({ page }) => {
  await wejdz(page);
  await page.getByRole("button", { name: /Gniazdo 230 V/ }).first().click();
  await page.evaluate(() => window.scrollTo(0, 0));
  const box = (await page.locator("div.overflow-auto.rounded-card.border").first().boundingBox())!;
  await page.mouse.click(box.x + 150, box.y + 130);
  await page.waitForTimeout(900);

  await expect(page.getByText(PROMPT_KONTO)).toBeHidden();
});

test("prompt „sporo pracy” pojawia się po przekroczeniu progu i da się odrzucić na stałe", async ({ page }) => {
  await wejdz(page);
  await page.getByRole("button", { name: /Gniazdo 230 V/ }).first().click();
  // Box mierzony na nowo PRZED KAŻDYM kliknięciem, ze scrollTo(0,0) tuż przedtem:
  // postawienie PIERWSZEGO elementu odsłania trwały baner ryzyka nad płótnem, co
  // przesuwa je w dół — box zmierzony wcześniej staje się nieaktualny dla
  // kolejnych kliknięć w tej samej pętli (ten sam wzorzec co `zoomAndBox` w
  // room-editing.spec.ts).
  // próg to >10 — 11 kliknięć w różne miejsca płótna
  for (let i = 0; i < 11; i++) {
    await page.evaluate(() => window.scrollTo(0, 0));
    const box = (await page.locator("div.overflow-auto.rounded-card.border").first().boundingBox())!;
    await page.mouse.click(box.x + 40 + (i % 6) * 50, box.y + 40 + Math.floor(i / 6) * 50);
  }
  await page.waitForTimeout(900);

  await expect(page.getByText(PROMPT_KONTO)).toBeVisible();

  await page.getByRole("button", { name: "Zamknij przypomnienie o koncie" }).click();
  await expect(page.getByText(PROMPT_KONTO)).toBeHidden();

  // odrzucenie jest trwałe — przetrwa odświeżenie, w przeciwieństwie do banera ryzyka
  await page.reload();
  await page.getByRole("button", { name: "Instalacja" }).click();
  await expect(page.getByText(BANER_RYZYKA)).toBeVisible();
  await expect(page.getByText(PROMPT_KONTO)).toBeHidden();
});
