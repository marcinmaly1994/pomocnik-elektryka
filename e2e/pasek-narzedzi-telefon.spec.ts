import { test, expect } from "@playwright/test";

/**
 * Na telefonie pasek narzędzi jest poziomym rzędem przewijanym bez suwaka. Ostatnie
 * narzędzia stały za prawą krawędzią bez żadnego sygnału, że w ogóle istnieją
 * (przegląd Instalacji 21.11.2026, pkt 2). Strzałka „Więcej narzędzi” przy krawędzi
 * przewija pasek do końca i znika, gdy nie ma już nic dalej.
 */
test.use({ viewport: { width: 375, height: 812 } });

test("telefon: strzałka „Więcej narzędzi” odsłania schowane narzędzia i znika na końcu", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Narysuj dom samodzielnie" }).click();
  const rozumiem = page.getByRole("button", { name: "Rozumiem" });
  if (await rozumiem.count()) await rozumiem.click();

  const nav = page.getByRole("navigation", { name: "Narzędzia rysowania" });
  const wiecej = nav.getByRole("button", { name: "Więcej narzędzi" });
  const kalibracja = nav.getByRole("button", { name: "Kalibracja skali", exact: true });

  await expect(wiecej).toBeVisible();
  await expect(kalibracja).not.toBeInViewport({ ratio: 1 });

  await wiecej.click();
  await expect(kalibracja).toBeInViewport({ ratio: 1 });
  await expect(wiecej).toHaveCount(0);
});

test("komputer: pasek pionowy mieści wszystko — bez strzałki", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Narysuj dom samodzielnie" }).click();
  await expect(page.getByRole("navigation", { name: "Narzędzia rysowania" }).getByRole("button", { name: "Więcej narzędzi" })).toHaveCount(0);
});
