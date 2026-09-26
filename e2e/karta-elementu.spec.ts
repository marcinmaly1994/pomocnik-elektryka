import { test, expect, type Page } from "@playwright/test";
import { skipEntryScreen, otworzKatalogElementow } from "./_flow";

/**
 * Karta właściwości zaznaczonego elementu w panelu „Zaznacz".
 *
 * Panel pokazuje opcje tego, czym się pracuje, a dla pojedynczego elementu nie
 * pokazywał nic: jego dane i akcje były tylko w menu pod prawym przyciskiem i w oknie
 * edycji po dwukliku. Teraz stoją w panelu zaraz po kliknięciu — te same akcje, które
 * woła menu.
 */

async function otworzPlan(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Instalacja" }).click();
  await skipEntryScreen(page);
  await page.getByRole("button", { name: "Narysuj dom samodzielnie" }).first().click();
  const rozumiem = page.getByRole("button", { name: "Rozumiem" });
  if (await rozumiem.count()) await rozumiem.click();
  await page.getByRole("button", { name: /Powiększenie \d+ procent/ }).click();
}

/** Punkt PLANU kliknięty przez żywą transformację sceny — patrz numer-obwodu.spec.ts. */
async function klikPlan(page: Page, x: number, y: number, opcje?: { button?: "left" | "right" }) {
  const wrap = page.locator("[data-testid=plan-okno]").first();
  await wrap.evaluate((e) => {
    e.scrollIntoView({ block: "start" });
    e.scrollTo(0, 0);
  });
  const box = (await wrap.boundingBox())!;
  const s = await page.evaluate(() => {
    const k = (window as unknown as { Konva: { stages: { scaleX(): number; x(): number; y(): number }[] } }).Konva;
    const st = k.stages[0];
    return { skala: st.scaleX(), x: st.x(), y: st.y() };
  });
  await page.mouse.click(box.x + x * s.skala + s.x, box.y + y * s.skala + s.y, opcje);
}

async function postawGniazda(page: Page, punkty: { x: number; y: number }[]) {
  await otworzKatalogElementow(page);
  const cel = page.getByRole("button", { name: /Gniazdo 230 V/ }).first();
  if (!(await cel.isVisible().catch(() => false))) await page.getByRole("button", { name: /Gniazda i zasilanie/ }).click();
  for (const p of punkty) {
    await page.getByRole("button", { name: /Gniazdo 230 V/ }).first().click();
    await klikPlan(page, p.x, p.y);
  }
  await page.getByRole("button", { name: "Zaznacz", exact: true }).click();
}

test("klik w element pokazuje w panelu jego dane i akcje", async ({ page }) => {
  await otworzPlan(page);
  await postawGniazda(page, [{ x: 150, y: 150 }]);

  await expect(page.getByTestId("karta-elementu")).toHaveCount(0);
  await klikPlan(page, 150, 150);
  const karta = page.getByTestId("karta-elementu");
  await expect(karta).toBeVisible();
  await expect(karta).toContainText("Gniazdo 230 V");
  await expect(karta).toContainText(/bez pomieszczenia/i);
  await expect(karta.getByText("Numer obwodu")).toBeVisible();

  // Edytuj — to samo okno co dwuklik.
  await karta.getByRole("button", { name: "Edytuj" }).click();
  await expect(page.getByRole("dialog")).toContainText("Edytuj element: Gniazdo 230 V");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // Numer obwodu nadany z karty — ten sam wybór co w menu pod prawym przyciskiem.
  await karta.getByRole("button", { name: "+ 1" }).click();
  // Numer 1 jest już użyty w projekcie, więc stoi na liście, a „nowy" to teraz 2.
  await expect(karta.getByRole("button", { name: "1", exact: true })).toBeVisible();
  await expect(karta.getByRole("button", { name: "+ 2" })).toBeVisible();
});

test("Usuń w karcie kasuje element i panel wraca do podpowiedzi", async ({ page }) => {
  await otworzPlan(page);
  await postawGniazda(page, [{ x: 150, y: 150 }]);
  await klikPlan(page, 150, 150);
  await page.getByTestId("karta-elementu").getByRole("button", { name: "Usuń" }).click();
  await expect(page.getByTestId("karta-elementu")).toHaveCount(0);
  await expect(page.getByTestId("panel-zaznacz")).toBeVisible();
  await expect(page.getByText(/Elementy:\s*0/)).toBeVisible();
});

test("przy kilku zaznaczonych elementach karty nie ma — są operacje na grupie", async ({ page }) => {
  await otworzPlan(page);
  await postawGniazda(page, [
    { x: 150, y: 150 },
    { x: 230, y: 150 },
  ]);
  // „Zaznacz kilka" przed pierwszym kliknięciem — przełącznik dokłada kolejne kliknięcia.
  await page.getByTestId("zaznacz-kilka").click();
  await klikPlan(page, 150, 150);
  await klikPlan(page, 230, 150);
  await expect(page.getByText("Zaznaczono: 2")).toBeVisible();
  await expect(page.getByTestId("karta-elementu")).toHaveCount(0);
});
