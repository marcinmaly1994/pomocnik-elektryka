import { test, expect, type Page } from "@playwright/test";

/**
 * Gotowe układy rozdzielnic (F17 z audytu 5.11.2026): z pustego ekranu rozdzielnicy
 * jednym kliknięciem typowy układ w trybie ręcznym; „Cofnij" przy ustawieniach
 * przywraca poprzednie aparaty po wczytaniu kolejnego układu z okna wyboru.
 */

const aparaty = (page: Page) =>
  page.evaluate(() => {
    const id = localStorage.getItem("pomocnikelektryka_projekt_biezacy");
    const raw = id ? localStorage.getItem("pomocnikelektryka_projekt_" + id) : null;
    const p = raw ? JSON.parse(raw) : null;
    return p ? { tryb: p.panelTryb as string, glowny: p.panelConfig.mainRating as number, opisy: (p.panelDevices as { caption: string }[]).map((d) => d.caption) } : null;
  });

test("pusta rozdzielnica → „Dom z fotowoltaiką”, potem inny układ z okna i Cofnij", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Rozdzielnica", exact: true }).first().click();
  await expect(page).toHaveURL(/\/rozdzielnica$/);

  const lista = page.getByTestId("gotowe-uklady");
  await expect(lista).toBeVisible();
  await lista.getByRole("button", { name: /Dom z fotowoltaiką/ }).first().click();

  await expect.poll(async () => (await aparaty(page))?.tryb).toBe("reczny");
  await expect.poll(async () => (await aparaty(page))?.opisy ?? []).toContain("Falownik PV");
  await expect(page.getByRole("combobox", { name: "Źródło aparatów" })).toHaveValue("reczny");
  if (process.env.ZRZUT_UKLADU) await page.screenshot({ path: process.env.ZRZUT_UKLADU, fullPage: true });

  // drugi układ z okna wyboru zastępuje pierwszy…
  await page.getByRole("button", { name: /Gotowe układy/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: /^Mieszkanie/ }).click();
  // napis, którego nie ma w układzie domu — dopiero on mówi, że zapis już się odświeżył
  await expect.poll(async () => (await aparaty(page))?.opisy ?? []).toContain("Gniazda — sypialnia, pokój");
  expect((await aparaty(page))!.opisy).not.toContain("Falownik PV");

  // …a „Cofnij” przy ustawieniach przywraca poprzedni
  await page.getByRole("button", { name: "Cofnij", exact: true }).click();
  await expect.poll(async () => (await aparaty(page))?.opisy ?? []).toContain("Falownik PV");
  // razem z aparatami wracają ustawienia układu — rozłącznik 63 A domu, nie 40 A mieszkania
  await expect.poll(async () => (await aparaty(page))?.glowny).toBe(63);
});
