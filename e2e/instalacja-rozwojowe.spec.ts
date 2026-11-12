import { test, expect, type Page } from "@playwright/test";
import { otworzKatalogElementow, wczytajPrzyklad } from "./_flow";

/**
 * Propozycje rozwojowe z audytu Instalacji 11.11.2026: klikalne zestawienie (R12),
 * „Ostatnio używane" w katalogu (R13) i „Zaznacz kilka" bez wyróżnionej ramki (R15).
 */

test.use({ viewport: { width: 1440, height: 900 } });

async function przyklad(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Instalacja" }).click();
  await wczytajPrzyklad(page, "mieszkanie");
  await expect(page.getByText("To jest projekt przykładowy")).toBeVisible();
}

test("R12: klik w nazwę w zestawieniu zaznacza te elementy na planie", async ({ page }) => {
  await przyklad(page);
  await page.getByRole("button", { name: /^Zestawienie elementów/ }).click();
  const wiersz = page.getByRole("button", { name: /^Zaznacz na planie: Gniazdo 230 V podwójne \(\d+\)$/ });
  const ile = Number((await wiersz.getAttribute("aria-label"))!.match(/\((\d+)\)$/)![1]);
  expect(ile).toBeGreaterThan(1);
  await wiersz.click();
  await expect(page.getByText(`Zaznaczono: ${ile}`)).toBeVisible();
  // Od razu działa na nich panel grupy — np. numer obwodu dla całej grupy (R5).
  await expect(page.getByTestId("obwod-grupy")).toBeVisible();
  // ...i rzut wraca na ekran (zestawienie stoi pod nim).
  await expect(page.locator("[data-testid=plan-okno]").first()).toBeInViewport();
});

test("R12: wiersz pomieszczenia zaznacza jego osprzęt", async ({ page }) => {
  await przyklad(page);
  await page.getByRole("button", { name: /^Zestawienie elementów/ }).click();
  const kuchnia = page.getByRole("button", { name: /^Zaznacz na planie: Kuchnia \(\d+\)$/ });
  const ile = Number((await kuchnia.getAttribute("aria-label"))!.match(/\((\d+)\)$/)![1]);
  await kuchnia.click();
  await expect(page.getByText(`Zaznaczono: ${ile}`)).toBeVisible();
});

test("R13: wybrany element trafia do „Ostatnio używane” i zostaje tam po odświeżeniu", async ({ page }) => {
  await przyklad(page);
  await otworzKatalogElementow(page);
  const ostatnie = page.getByTestId("ostatnio-uzywany");
  await expect(ostatnie).toHaveCount(0);

  const szukaj = page.getByPlaceholder("Szukaj elementu…");
  await szukaj.fill("dym");
  await page.getByRole("button", { name: /Czujnik dymu/ }).first().click();
  await szukaj.fill("");
  await expect(ostatnie).toHaveCount(1);
  await expect(ostatnie.first()).toContainText("Czujnik dymu");

  // Autozapis chodzi 600 ms po ostatniej zmianie — odświeżenie przed nim zgubiłoby
  // sam przykład, a nie „Ostatnio używane", które zapisują się od razu.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const id = localStorage.getItem("pomocnikelektryka_projekt_biezacy");
        return (localStorage.getItem("pomocnikelektryka_projekt_" + id) ?? "").includes("projektPrzykladowy\":true");
      })
    )
    .toBe(true);
  await page.reload();
  await expect(page.getByRole("button", { name: "Wstaw Element", exact: true })).toBeVisible();
  await otworzKatalogElementow(page);
  await expect(page.getByTestId("ostatnio-uzywany")).toHaveCount(1);
  // Przy wyszukiwaniu kafli nie ma — lista wyników jest już odpowiedzią.
  await page.getByPlaceholder("Szukaj elementu…").fill("gniazdo");
  await expect(page.getByTestId("ostatnio-uzywany")).toHaveCount(0);
});

test("R15: „Zaznacz kilka” na monitorze stoi poza miedzianą ramką", async ({ page }) => {
  await przyklad(page);
  const przycisk = page.getByTestId("zaznacz-kilka");
  await expect(przycisk).toBeVisible();
  const wRamce = await przycisk.evaluate((el) => el.closest("[class*='border-copper/40']") !== null);
  expect(wRamce).toBe(false);
});
