import { test, expect } from "@playwright/test";

/**
 * Kalkulatory na monitorze.
 *
 * Co tu było nie tak:
 * - Lista boczna z kafelkami po dwa wiersze opisu miała ok. 1200 px, a była przyklejona
 *   (`sticky`) — przy 1440×900 „Dobór oświetlenia" i grupa „Zaawansowane" siedziały pod
 *   krawędzią ekranu, dopóki nie przewinęło się strony do samego końca.
 * - Przy 1920 px kalkulator rozciągał się na ok. 1600 px: pole mocy na „2000" miało
 *   700 px, a jednostka stała daleko za nim.
 * - Nazwy grup na liście pisane wersalikami, na ekranie startowym — zwykłą pisownią.
 */

test.describe("1440×900", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("lista boczna mieści się w oknie także po przewinięciu długiego kalkulatora", async ({ page }) => {
    await page.goto("/kalkulatory/zwarcie");
    const lista = page.getByTestId("lista-kalkulatorow");
    await expect(lista).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 900));

    const ostatnia = lista.getByRole("button", { name: /^Dobór oświetlenia/ });
    const box = (await ostatnia.boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(900);
  });

  test("po rozwinięciu wszystkich grup lista przewija się sama, nie wychodzi za okno", async ({ page }) => {
    await page.goto("/kalkulatory/zwarcie");
    const lista = page.getByTestId("lista-kalkulatorow");
    await lista.getByRole("button", { name: /^Zaawansowane/ }).click();
    await page.evaluate(() => window.scrollTo(0, 900));

    const box = (await lista.boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(900);
    // Ostatnia pozycja jest osiągalna — klik w nią otwiera kalkulator.
    await lista.getByRole("button", { name: /^Bilans faz/ }).click();
    await expect(page).toHaveURL(/\/kalkulatory\/bilansFaz/i);
  });

  test("nazwy grup na liście zwykłą pisownią, jak na ekranie startowym", async ({ page }) => {
    await page.goto("/kalkulatory/spadek");
    const grupa = page.getByTestId("lista-kalkulatorow").getByRole("button", { name: /^Ochrona/ });
    await expect(grupa).toHaveCSS("text-transform", "none");
  });
});

test.describe("1920", () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  test("kalkulator nie rozciąga się na całą szerokość monitora", async ({ page }) => {
    await page.goto("/kalkulatory/obwod");
    const box = (await page.getByTestId("kalkulator").boundingBox())!;
    expect(box.width).toBeLessThanOrEqual(960);
  });

  test("ekran startowy bez listy bocznej zostaje szeroki", async ({ page }) => {
    await page.goto("/kalkulatory");
    const box = (await page.getByTestId("kalkulator").boundingBox())!;
    expect(box.width).toBeGreaterThan(1500);
  });
});
