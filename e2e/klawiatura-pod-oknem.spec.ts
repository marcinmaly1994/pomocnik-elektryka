import { test, expect, type Page } from "@playwright/test";
import { skipEntryScreen, otworzKatalogElementow } from "./_flow";

/**
 * Klawisze naciśnięte w oknie, menu albo liście rozwijanej nie trafiają do planu.
 *
 * Audyt 5.11.2026: skróty edytora słuchają na `window`, więc Delete przy otwartym
 * oknie „Pomoc", menu „Projekty" albo panelu „Rysunek" kasował zaznaczony element
 * schowany pod spodem, a litera „p" w liście typu pomieszczenia przełączała narzędzie
 * zamiast wybrać „Pokój". Patrz `klawiszDlaEdytora`.
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

/** Punkt PLANU kliknięty przez żywą transformację sceny — patrz karta-elementu.spec.ts. */
async function klikPlan(page: Page, x: number, y: number) {
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
  await page.mouse.click(box.x + x * s.skala + s.x, box.y + y * s.skala + s.y);
}

/** Stawia jedno gniazdo i zostawia je ZAZNACZONE w trybie „Zaznacz". */
async function zaznaczoneGniazdo(page: Page) {
  await otworzKatalogElementow(page);
  const cel = page.getByRole("button", { name: /Gniazdo 230 V/ }).first();
  if (!(await cel.isVisible().catch(() => false))) await page.getByRole("button", { name: /Gniazda i zasilanie/ }).click();
  await cel.click();
  await klikPlan(page, 150, 150);
  await page.getByRole("button", { name: "Zaznacz", exact: true }).click();
  await klikPlan(page, 150, 150);
  await expect(page.getByTestId("karta-elementu")).toBeVisible();
}

const liczbaElementow = (page: Page) => page.getByText(/Elementy:\s*\d+/).first();

test("Delete bez żadnego okna nadal kasuje zaznaczony element", async ({ page }) => {
  await otworzPlan(page);
  await zaznaczoneGniazdo(page);
  await expect(liczbaElementow(page)).toContainText("1");
  await page.keyboard.press("Delete");
  await expect(liczbaElementow(page)).toContainText("0");
});

test("Delete przy otwartym oknie Pomoc nie kasuje elementu pod spodem", async ({ page }) => {
  await otworzPlan(page);
  await zaznaczoneGniazdo(page);
  await page.locator("header").getByRole("button", { name: /Pomoc/ }).first().click();
  await expect(page.getByRole("dialog", { name: "Pomoc" })).toBeVisible();
  await page.keyboard.press("Delete");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Escape");
  await expect(liczbaElementow(page)).toContainText("1");
});

test("Delete przy otwartym menu Projekty nie kasuje elementu", async ({ page }) => {
  await otworzPlan(page);
  await zaznaczoneGniazdo(page);
  await page.getByRole("button", { name: "Projekty", exact: true }).click();
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("Delete");
  await page.keyboard.press("Escape");
  await expect(liczbaElementow(page)).toContainText("1");
});

test("Delete przy otwartym panelu Rysunek nie kasuje elementu", async ({ page }) => {
  await otworzPlan(page);
  await zaznaczoneGniazdo(page);
  await page.getByRole("button", { name: "Rysunek", exact: true }).click();
  await page.keyboard.press("Delete");
  await expect(liczbaElementow(page)).toContainText("1");
});

test("litera w liście typu pomieszczenia wybiera typ, a nie narzędzie", async ({ page }) => {
  await otworzPlan(page);
  await page.getByRole("button", { name: "Narysuj Pomieszczenie", exact: true }).click();
  await page.getByRole("button", { name: "Prostokąt" }).click();
  await klikPlan(page, 100, 100);
  await klikPlan(page, 200, 180);
  const typ = page.getByRole("dialog").locator("select").first();
  await typ.focus();
  await page.keyboard.press("p");
  await expect(typ).toHaveValue(/pokoj|pralnia/);
  // Przerwa dłuższa niż okno wyszukiwania w liście (ok. 1 s) — inaczej przeglądarka
  // czyta „ps" jako jedno słowo i nie znajduje niczego.
  await page.waitForTimeout(1200);
  await page.keyboard.press("s");
  await expect(typ).toHaveValue(/salon|sypialnia/);
  // Narzędzie zostało to samo — „s" nie przełączyło na kalibrację skali. `includeHidden`,
  // bo otwarte okno modalne chowa resztę strony przed czytnikiem ekranu (aria-hidden).
  await expect(
    page.getByRole("button", { name: "Narysuj Pomieszczenie", exact: true, includeHidden: true })
  ).toHaveAttribute("aria-pressed", "true");
});

test("Ctrl+Y ponawia cofniętą operację", async ({ page }) => {
  await otworzPlan(page);
  await zaznaczoneGniazdo(page);
  await page.keyboard.press("Delete");
  await expect(liczbaElementow(page)).toContainText("0");
  await page.keyboard.press("Control+z");
  await expect(liczbaElementow(page)).toContainText("1");
  await page.keyboard.press("Control+y");
  await expect(liczbaElementow(page)).toContainText("0");
});
