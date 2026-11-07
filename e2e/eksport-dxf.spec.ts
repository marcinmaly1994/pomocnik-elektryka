import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { wczytajPrzyklad } from "./_flow";

/**
 * Eksport rzutu do DXF (F13 z audytu 5.11.2026): przycisk na pasku pobiera plik R12
 * z warstwami, w metrach, z polskimi znakami w Windows-1250.
 */
test("„Rzut do DXF” pobiera plik z warstwami i osprzętem przykładowego domu", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await wczytajPrzyklad(page, "dom");
  await page.waitForTimeout(1500);
  const r = page.getByRole("button", { name: "Rozumiem" });
  if (await r.count()) await r.click();

  const [plik] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Rzut do DXF" }).click()]);
  expect(plik.suggestedFilename()).toMatch(/^rzut-.*\.dxf$/);
  const bajty = readFileSync((await plik.path())!);
  const tekst = bajty.toString("latin1");

  expect(tekst).toContain("AC1009");
  for (const w of ["SCIANY", "POMIESZCZENIA", "OSPRZET", "TRASY"]) expect(tekst).toContain(w);
  expect((tekst.match(/\r\nINSERT\r\n/g) ?? []).length).toBeGreaterThan(20);
  expect(tekst.trimEnd().endsWith("EOF")).toBe(true);
  // „Łazienka” zapisana w Windows-1250: Ł = 0xA3
  expect(bajty.includes(Buffer.from([0xa3, 0x61, 0x7a, 0x69, 0x65, 0x6e, 0x6b, 0x61]))).toBe(true);
});
