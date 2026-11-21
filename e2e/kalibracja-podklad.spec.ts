import { test, expect } from "@playwright/test";

/**
 * Podkład wgrywa się po to, żeby na nim ustawić skalę — a „Wgraj podkład" był tylko
 * w menu „Plan" na pasku nad płótnem, z dala od „Kalibracji skali" (przegląd
 * Instalacji 21.11.2026, pkt 4). Panel kalibracji ma go teraz u siebie.
 */
test("kalibracja skali: panel narzędzia pozwala wgrać podkład", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Narysuj dom samodzielnie" }).click();
  const rozumiem = page.getByRole("button", { name: "Rozumiem" });
  if (await rozumiem.count()) await rozumiem.click();

  await page.getByRole("button", { name: "Kalibracja skali", exact: true }).click();
  const podklad = page.getByTestId("kalibracja-podklad");
  await expect(podklad).toBeVisible();
  const wybor = page.waitForEvent("filechooser");
  await podklad.getByRole("button", { name: "Wgraj podkład" }).click();
  await wybor;
});
