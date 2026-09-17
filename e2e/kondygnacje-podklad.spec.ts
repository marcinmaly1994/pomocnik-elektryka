import { test, expect, type Page } from "@playwright/test";
import { otworzMenuPaska } from "./_flow";

/**
 * Podglad kondygnacji ponizej i duplikowanie kondygnacji.
 *
 * Przemapowanie identyfikatorow przy kopiowaniu ma testy jednostkowe w store. Tutaj
 * chodzi o to, czego stamtad nie widac: czy przycisk podkladu w ogole sie pojawia
 * (i tylko tam, gdzie ma sens) oraz czy kopia trafia na plotno razem z geometria.
 */

async function planBox(page: Page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  return (await page.locator("[data-testid=plan-okno]").first().boundingBox())!;
}

async function pustyProjekt(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByRole("heading", { name: "Zaprojektuj instalację elektryczną w swoim domu" })).toBeVisible();
  await page.getByRole("button", { name: "Narysuj dom samodzielnie" }).click();
  const rozumiem = page.getByRole("button", { name: "Rozumiem" });
  if (await rozumiem.count()) await rozumiem.click();
}

async function postawGniazdko(page: Page, x: number, y: number) {
  await page.getByRole("button", { name: "Wstaw Element" }).click();
  await page.getByRole("button", { name: /Gniazdo 230 V/ }).click();
  const box = await planBox(page);
  await page.mouse.click(box.x + x, box.y + y);
}

async function stan(page: Page) {
  await page.waitForTimeout(900);
  return page.evaluate(() => {
    const a = JSON.parse(localStorage.getItem("pomocnikelektryka_projekt_autosave")!);
    return { floors: a.floors.map((f: { name: string }) => f.name), aktywna: a.activeFloorId, draft: a.draft };
  });
}

test("przycisk podkladu pojawia sie dopiero, gdy jest kondygnacja ponizej", async ({ page }) => {
  await pustyProjekt(page);
  // Na parterze nie ma czego pokazac — przycisk nie istnieje, zamiast byc wyszarzony.
  await expect(page.getByRole("button", { name: "Pokaż kondygnację poniżej" })).toHaveCount(0);

  await otworzMenuPaska(page, "Plan");
  await page.getByRole("button", { name: "+ Dodaj kondygnację" }).click();
  await page.getByRole("button", { name: "Dodaj", exact: true }).click();

  await expect(page.getByRole("button", { name: "Pokaż kondygnację poniżej" })).toBeVisible();
});

test("podklad da sie wlaczyc i wylaczyc", async ({ page }) => {
  await pustyProjekt(page);
  await postawGniazdko(page, 200, 200);
  await otworzMenuPaska(page, "Plan");
  await page.getByRole("button", { name: "+ Dodaj kondygnację" }).click();
  await page.getByRole("button", { name: "Dodaj", exact: true }).click();

  const wlacz = page.getByRole("button", { name: "Pokaż kondygnację poniżej" });
  await wlacz.click();
  await expect(page.getByRole("button", { name: "Ukryj kondygnację poniżej" })).toBeVisible();

  await page.getByRole("button", { name: "Ukryj kondygnację poniżej" }).click();
  await expect(page.getByRole("button", { name: "Pokaż kondygnację poniżej" })).toBeVisible();
});

test("duplikowanie kopiuje geometrie i osprzet na nowa kondygnacje", async ({ page }) => {
  await pustyProjekt(page);
  await postawGniazdko(page, 200, 200);
  await postawGniazdko(page, 300, 200);

  const przed = await stan(page);
  expect(przed.floors).toHaveLength(1);

  await otworzMenuPaska(page, "Plan");
  await page.getByRole("button", { name: /Duplikuj/ }).first().click();
  await page.getByRole("button", { name: "Duplikuj kondygnację" }).click();

  const po = await stan(page);
  expect(po.floors).toHaveLength(2);
  // Nazwa proponowana z nazwy kopiowanej kondygnacji.
  expect(po.floors[1]).toContain("kopia");
  // Dwa gniazdka na parterze plus dwa na kopii.
  expect(po.draft.elements).toHaveLength(4);
  expect(po.draft.elements.filter((e: { floor: string }) => e.floor === po.aktywna)).toHaveLength(2);
  // Aplikacja przelacza sie na kopie — to na niej chce sie teraz pracowac.
  expect(po.aktywna).not.toBe(przed.aktywna);
});
