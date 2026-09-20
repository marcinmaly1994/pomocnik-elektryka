import { test, expect } from "@playwright/test";
import { wczytajPrzyklad } from "./_flow";

test("dom otwiera się z dwiema kondygnacjami, a piętro ma trasy zasilania", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await wczytajPrzyklad(page, "dom");

  await expect(page.getByText("To jest projekt przykładowy")).toBeVisible();
  await expect(page.getByRole("button", { name: "Parter", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Piętro", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Piętro", exact: true }).click();
  // Podrozdzielnica jest na piętrze, więc trasy ZASILANIA mają tam powstać. Czytamy
  // je z zapisu, a nie ze sceny: scena bywa jeszcze nieustalona zaraz po przełączeniu.
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
