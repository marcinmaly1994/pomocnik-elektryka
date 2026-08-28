import { test, expect } from "@playwright/test";

/**
 * Poglądowe trasy przewodów (rozdzielnica → punkt), patrz `buildCableRoutes` w
 * lib/panel/loads.ts. Testowane e2e (nie tylko jednostkowo tę funkcję), bo wartość
 * leży w spięciu trzech rzeczy: obliczenia, przełącznika widoczności w pasku edytora
 * i FAKTYCZNEGO narysowania linii na scenie Konvy.
 */

async function openPlan(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const pomin = page.getByRole("button", { name: "Pomiń — ustawię później" });
  if (await pomin.count()) await pomin.click();
  await page.getByRole("button", { name: "Instalacja" }).click();
  await page.getByRole("button", { name: "Narysuj dom samodzielnie" }).first().click();
  const rozumiem = page.getByRole("button", { name: "Rozumiem" });
  if (await rozumiem.count()) await rozumiem.click();
}

async function planBox(page: import("@playwright/test").Page) {
  const wrap = page.locator("div.overflow-auto.rounded-card.border").first();
  await wrap.evaluate((e) => {
    e.scrollIntoView({ block: "start" });
    e.scrollTo(0, 0);
  });
  return (await wrap.boundingBox())!;
}

/** Liczba narysowanych na scenie linii przerywanych (`dash` ustawiony) — jedyne
 *  przerywane linie na płótnie to trasy przewodów; siatka i ściany są ciągłe. */
async function dashedLineCount(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const konva = (window as unknown as { Konva?: { stages: { find(sel: string): { dash(): number[] | undefined }[] }[] } }).Konva;
    const stage = konva?.stages?.[0];
    if (!stage) return -1;
    return stage.find("Line").filter((l) => (l.dash()?.length ?? 0) > 0).length;
  });
}

test("bez rozdzielnicy na planie przełącznik nic nie rysuje", async ({ page }) => {
  await openPlan(page);
  await page.getByRole("button", { name: /Gniazdo 230 V/ }).first().click();
  const box = await planBox(page);
  await page.mouse.click(box.x + 150, box.y + 100);
  await page.waitForTimeout(300);

  await page.getByRole("button", { name: "Pokaż trasy przewodów" }).click();
  await page.waitForTimeout(300);
  expect(await dashedLineCount(page)).toBe(0);
});

test("rozdzielnica + gniazdo + lampa: przełącznik rysuje dwie trasy, domyślnie ukryte", async ({ page }) => {
  await openPlan(page);

  await page.getByRole("button", { name: /Rozdział/ }).click();
  await page.getByRole("button", { name: /^Rozdzielnica$/ }).last().click();
  let box = await planBox(page);
  await page.mouse.click(box.x + 60, box.y + 60);

  await page.getByRole("button", { name: /Gniazda i zasilanie/ }).click();
  await page.getByRole("button", { name: /Gniazdo 230 V/ }).first().click();
  box = await planBox(page);
  await page.mouse.click(box.x + 250, box.y + 80);

  await page.getByRole("button", { name: /Oświetlenie/ }).first().click();
  await page.getByRole("button", { name: /Punkt sufitowy/ }).click();
  box = await planBox(page);
  await page.mouse.click(box.x + 150, box.y + 130);
  await page.waitForTimeout(300);

  await page.getByRole("button", { name: "Zaznacz", exact: true }).click();

  // domyślnie WYŁĄCZONE — to warstwa poglądowa, nie ma się narzucać od razu
  expect(await dashedLineCount(page)).toBe(0);

  await page.getByRole("button", { name: "Pokaż trasy przewodów" }).click();
  await page.waitForTimeout(300);
  expect(await dashedLineCount(page)).toBe(2); // po jednej trasie na punkt

  // ponowne kliknięcie chowa trasy z powrotem
  await page.getByRole("button", { name: "Ukryj trasy przewodów" }).click();
  await page.waitForTimeout(300);
  expect(await dashedLineCount(page)).toBe(0);
});
