import { test, expect } from "@playwright/test";
import { wczytajPrzyklad } from "./_flow";

test("dom otwiera się z dwiema kondygnacjami, a piętro ma własną podrozdzielnicę", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await wczytajPrzyklad(page, "dom");

  await expect(page.getByText("To jest projekt przykładowy")).toBeVisible();
  await expect(page.getByRole("button", { name: "Parter", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Piętro", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Piętro", exact: true }).click();
  // Ta asercja liczy tylko rozdzielnice na f2 w zapisie (nie ze sceny: scena bywa
  // jeszcze nieustalona zaraz po przełączeniu) — to, że z tej podrozdzielnicy naprawdę
  // wychodzą trasy ZASILANIA, sprawdza test jednostkowy „piętro dostaje narysowane
  // trasy ZASILANIA, nie tylko sterowania" w `src/lib/demo/dom.test.ts`.
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const klucz = "pomocnikelektryka_projekt_" + localStorage.getItem("pomocnikelektryka_projekt_biezacy");
        const pr = JSON.parse(localStorage.getItem(klucz) ?? "{}") as { draft?: { elements?: { floor: string; type: string }[] } };
        return (pr.draft?.elements ?? []).filter((e) => e.floor === "f2" && e.type === "rozdzielnica").length;
      })
    )
    .toBe(1);

  await page.getByRole("button", { name: "Rozdzielnica", exact: true }).click();
  await expect(page.getByText(/Widok frontu rozdzielnicy/)).toBeVisible();
});
