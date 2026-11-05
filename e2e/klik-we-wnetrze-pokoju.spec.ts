import { test, expect, type Page } from "@playwright/test";
import { skipEntryScreen, otworzKatalogElementow } from "./_flow";

/**
 * Klik we WNĘTRZE pomieszczenia zaznacza je (audyt 5.11.2026, B9).
 *
 * Podpowiedź narzędzia „Zaznacz" mówi „kliknij element, ścianę, pomieszczenie…", a
 * pomieszczenie zaznaczał tylko klik w obrys albo w nazwę — klik w środek pokoju
 * nic nie robił. Wnętrze nadal nie łapie zdarzeń na płótnie (ramka zaznaczania musi
 * móc zacząć się w pokoju), więc obok sprawdzamy, że ramka dalej działa.
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

/** Punkt PLANU na ekranie przez żywą transformację sceny — patrz karta-elementu.spec.ts. */
async function ekran(page: Page, x: number, y: number) {
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
  return { x: box.x + x * s.skala + s.x, y: box.y + y * s.skala + s.y };
}

async function klikPlan(page: Page, x: number, y: number) {
  const p = await ekran(page, x, y);
  await page.mouse.click(p.x, p.y);
}

async function pokojZGniazdem(page: Page) {
  await page.getByRole("button", { name: "Narysuj Pomieszczenie", exact: true }).click();
  await page.getByRole("button", { name: "Prostokąt" }).click();
  await klikPlan(page, 60, 60);
  await klikPlan(page, 260, 200);
  await page.getByRole("dialog").locator("input").first().fill("Salon");
  await page.getByRole("button", { name: "Dodaj pomieszczenie" }).click();

  await otworzKatalogElementow(page);
  const cel = page.getByRole("button", { name: /Gniazdo 230 V/ }).first();
  if (!(await cel.isVisible().catch(() => false))) await page.getByRole("button", { name: /Gniazda i zasilanie/ }).click();
  await cel.click();
  await klikPlan(page, 200, 160);
  await page.getByRole("button", { name: "Zaznacz", exact: true }).click();
}

const nazwaPokoju = (page: Page) => page.getByRole("textbox", { name: "Nazwa pomieszczenia" });

test("klik w puste miejsce wewnątrz pokoju zaznacza pomieszczenie", async ({ page }) => {
  await otworzPlan(page);
  await pokojZGniazdem(page);
  await expect(nazwaPokoju(page)).toHaveCount(0);

  await klikPlan(page, 110, 110);
  await expect(nazwaPokoju(page)).toHaveValue("Salon");

  // Klik obok pokoju czyści zaznaczenie, jak wcześniej. Najpierw oddalenie: po dodaniu
  // pokoju widok przybliża się do niego i „obok” bywa poza kadrem.
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Oddal widok" }).click();
  // Róg płótna — po oddaleniu na pewno poza pokojem, a współrzędne planu w rogu
  // zależą od tego, jak widok wyśrodkował rzut.
  const okno = (await page.locator("[data-testid=plan-okno]").first().boundingBox())!;
  await page.mouse.click(okno.x + 12, okno.y + 12);
  await expect(nazwaPokoju(page)).toHaveCount(0);
});

test("ramka zaczęta wewnątrz pokoju nadal zaznacza elementy", async ({ page }) => {
  await otworzPlan(page);
  await pokojZGniazdem(page);

  const a = await ekran(page, 150, 120);
  const b = await ekran(page, 240, 190);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await page.mouse.up();

  await expect(page.getByText(/Zaznaczono: 1/)).toBeVisible();
  await expect(nazwaPokoju(page)).toHaveCount(0);
});
