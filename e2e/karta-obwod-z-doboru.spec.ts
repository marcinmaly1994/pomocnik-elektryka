import { test, expect } from "@playwright/test";
import { wczytajPrzyklad } from "./_flow";

/**
 * Karta elementu podaje TEN SAM obwód co Rozdzielnica — z doboru, nie z wartości
 * wstępnych `computeCircuits`. Po #278 karta ładowarki EV mówiła „C25 3-faz. ·
 * YDYp 5x4 mm²", a Rozdzielnica i Schemat „B16 · 5x2,5 mm²" (przegląd 12.11.2026, pkt 1).
 */
test.use({ viewport: { width: 1440, height: 900 } });

test("karta ładowarki EV podaje zabezpieczenie i przewód z doboru, jak Rozdzielnica", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Instalacja" }).click();
  await wczytajPrzyklad(page, "dom");
  await expect(page.getByText("To jest projekt przykładowy")).toBeVisible();

  // Środek napisu „EV" na symbolu ładowarki — w przeliczeniu na współrzędne strony.
  const punkt = await page.evaluate(() => {
    const k = (window as unknown as { Konva: { stages: { find(s: string): { text(): string; getClientRect(): { x: number; y: number; width: number; height: number } }[]; container(): HTMLElement }[] } }).Konva;
    const st = k.stages[0];
    const t = st.find("Text").find((x) => x.text() === "EV")!;
    const r = t.getClientRect();
    const box = st.container().getBoundingClientRect();
    return { x: box.left + r.x + r.width / 2, y: box.top + r.y + r.height / 2 };
  });
  await page.mouse.click(punkt.x, punkt.y);
  const obwod = page.getByTestId("karta-elementu").getByTestId("obwod-elementu");
  await expect(obwod).toContainText("Ładowarka EV");
  const zKarty = (await obwod.textContent())!;

  await page.getByRole("button", { name: /Rozdzielnica/ }).first().click();
  const wiersz = page.getByRole("row", { name: /Ładowarka EV — Garaż/ });
  await expect(wiersz).toBeVisible();
  const przekroj = (await wiersz.getByRole("cell").nth(3).textContent())!.trim(); // np. „2,5 mm²"
  const aparat = (await wiersz.getByRole("cell").nth(4).textContent())!.trim(); // np. „B16 3P"

  expect(zKarty).toContain(aparat.split(" ")[0]);
  expect(zKarty).toContain(przekroj.replace(" mm²", ""));
  expect(zKarty).not.toContain("C25");
});
