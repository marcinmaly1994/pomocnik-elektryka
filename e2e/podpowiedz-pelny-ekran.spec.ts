import { test, expect, type Page } from "@playwright/test";
import { skipEntryScreen } from "./_flow";

/**
 * Podpowiedź o trybie pełnoekranowym na telefonie.
 *
 * Liczby, dla których ta podpowiedź istnieje: przy 375 × 812 płótno w trybie zwykłym
 * ma 360 px (44% ekranu), bo nad nim stoi 337 px pasków. Pełny ekran daje temu samemu
 * płótnu 605 px. Mechanizm działał od dawna — brakowało informacji, że istnieje.
 *
 * Testy mierzą FAKTYCZNĄ wysokość płótna, a nie obecność klasy: chodzi o to, czy
 * kliknięcie naprawdę daje więcej miejsca na rysunek.
 */

async function wysokoscPlotna(page: Page): Promise<number> {
  const box = await page.locator("[data-testid=plan-okno]").first().boundingBox();
  return Math.round(box!.height);
}

async function otworzPlan(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Instalacja" }).click();
  await skipEntryScreen(page);
}

test.describe("telefon", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("podpowiedź prowadzi do pełnego ekranu i realnie powiększa płótno", async ({ page }) => {
    await otworzPlan(page);

    const podpowiedz = page.getByTestId("podpowiedz-pelny-ekran");
    await expect(podpowiedz).toBeVisible();

    const przed = await wysokoscPlotna(page);
    await podpowiedz.getByRole("button", { name: /Pełny ekran/ }).click();
    await page.waitForTimeout(600);

    const po = await wysokoscPlotna(page);
    expect(po, `płótno miało ${przed} px, po przełączeniu ${po} px`).toBeGreaterThan(przed * 1.4);
    // W pełnym ekranie podpowiedź byłaby zaprzeczeniem samej siebie.
    await expect(podpowiedz).toBeHidden();
  });

  test("raz użyty pełny ekran gasi podpowiedź na stałe", async ({ page }) => {
    await otworzPlan(page);
    await page.getByTestId("podpowiedz-pelny-ekran").getByRole("button", { name: /Pełny ekran/ }).click();
    await page.waitForTimeout(600);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(600);

    // Po wyjściu z trybu użytkownik już WIE, że istnieje — przypominanie zabierałoby
    // miejsce dokładnie tam, gdzie go brakuje.
    await expect(page.getByTestId("podpowiedz-pelny-ekran")).toBeHidden();
    await page.reload();
    await expect(page.getByTestId("podpowiedz-pelny-ekran")).toBeHidden();
  });

  test("zamknięcie podpowiedzi jest trwałe", async ({ page }) => {
    await otworzPlan(page);
    const podpowiedz = page.getByTestId("podpowiedz-pelny-ekran");
    await podpowiedz.getByRole("button", { name: "Zamknij podpowiedź" }).click();
    await expect(podpowiedz).toBeHidden();

    await page.reload();
    await expect(page.getByTestId("podpowiedz-pelny-ekran")).toBeHidden();
  });
});

test.describe("monitor", () => {
  test.use({ viewport: { width: 1280, height: 1000 } });

  test("na szerokim ekranie podpowiedzi nie ma", async ({ page }) => {
    await otworzPlan(page);
    // Przy tej szerokości płótno ma miejsca pod dostatkiem, a podpowiedź byłaby
    // rozwiązaniem problemu, którego nie ma.
    await expect(page.getByTestId("podpowiedz-pelny-ekran")).toBeHidden();
  });
});
