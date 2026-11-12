import { test, expect, type Page } from "@playwright/test";
import { wczytajPrzyklad } from "./_flow";

/**
 * Instalacja na monitorze — uwagi ze sprawdzenia rzutu w pasku stanu.
 *
 * Karta „Sprawdzenie rzutu" stoi pod edytorem, a edytor zajmuje całą wysokość okna:
 * przy 1440×900 zaczynała się na ok. 945 px. Przykładowy dom ma w niej ostrzeżenie
 * o braku czujnika czadu w kotłowni i garażu — widoczne dopiero po przewinięciu pod
 * rysunek, a w pełnym ekranie wcale. (Dziś przykład ma czujniki — `przykladowyDom` je zdejmuje.)
 */

test.use({ viewport: { width: 1440, height: 900 } });

async function przykladowyDom(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Instalacja" }).click();
  await wczytajPrzyklad(page, "dom");
  // Od R10 z audytu Instalacji 11.11.2026 przykład przechodzi własne sprawdzenie bez
  // uwag (ma czujniki czadu). Te testy potrzebują JEDNEJ uwagi, więc zdejmujemy oba
  // czujniki z zapisanego projektu i wczytujemy go ponownie — ta sama uwaga co dawniej.
  // Slot czytany W TRAKCIE czekania: przykład dostaje własny slot dopiero po dociągnięciu
  // danych (R1), więc odczytany od razu wskazywałby jeszcze poprzedni projekt.
  const slot = () =>
    page.evaluate(() => `pomocnikelektryka_projekt_${localStorage.getItem("pomocnikelektryka_projekt_biezacy")}`);
  await expect
    .poll(async () => page.evaluate((k) => (localStorage.getItem(k) ?? "").includes("czujnikCzadu"), await slot()))
    .toBe(true);
  const klucz = await slot();
  await page.evaluate((k) => {
    const p = JSON.parse(localStorage.getItem(k)!);
    p.draft.elements = p.draft.elements.filter((e: { type: string }) => e.type !== "czujnikCzadu");
    localStorage.setItem(k, JSON.stringify(p));
  }, klucz);
  await page.reload();
  await expect(page.getByText("To jest projekt przykładowy")).toBeVisible();
}

test("uwaga ze sprawdzenia widać w pasku stanu, bez przewijania", async ({ page }) => {
  await przykladowyDom(page);
  const wPasku = page.getByTestId("sprawdzenie-w-pasku");
  await expect(wPasku).toContainText("1 uwaga");
  await expect(wPasku).toHaveAttribute("data-poziom", "warn");
  await expect(wPasku).toBeInViewport();
});

test("klik w pasku rozwija zwiniętą kartę i przewija do niej", async ({ page }) => {
  await przykladowyDom(page);
  const naglowek = page.getByRole("button", { name: /^Sprawdzenie rzutu/ });
  // Użytkownik zwinął kartę wcześniej — klik w pasku ma ją i tak pokazać.
  await naglowek.click();
  await expect(naglowek).toHaveAttribute("aria-expanded", "false");
  await page.evaluate(() => window.scrollTo(0, 0));

  await page.getByTestId("sprawdzenie-w-pasku").click();
  await expect(naglowek).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("Kotłownia lub garaż bez czujnika czadu")).toBeInViewport();
});

test("z pełnego ekranu klik w uwagę wychodzi do karty", async ({ page }) => {
  await przykladowyDom(page);
  await page.getByRole("button", { name: "Projektowanie na pełnym ekranie" }).click();
  await expect(page.getByRole("button", { name: /^Sprawdzenie rzutu/ })).toHaveCount(0);

  await page.getByTestId("sprawdzenie-w-pasku").click();
  await expect(page.getByText("Kotłownia lub garaż bez czujnika czadu")).toBeInViewport();
});

test.describe("szeroki monitor", () => {
  test.use({ viewport: { width: 1600, height: 900 } });

  test("szerokość rzutu stoi w pasku stanu, nie pod nim", async ({ page }) => {
  await przykladowyDom(page);
  const szer = page.getByRole("status", { name: "Stan projektu" }).getByTestId("szerokosc-rzutu");
  await expect(szer).toContainText("m");
  await expect(szer).toBeInViewport();
  });
});

/**
 * Pasek stanu ma być JEDNYM wierszem, także gdy kursor jest nad planem (rośnie wtedy
 * odczyt X/Y). Zawinięcie odbiera płótnu wysokość i przesuwa rzut spod kursora —
 * pierwsza wersja tej zmiany robiła to przy 1280 zawsze, a przy 1366/1440 po najechaniu.
 */
for (const szer of [1280, 1366, 1440, 1536, 1920]) {
  test.describe(`${szer} px`, () => {
    test.use({ viewport: { width: szer, height: 900 } });

    test("pasek stanu nie zawija się, także z kursorem nad planem", async ({ page }) => {
      await przykladowyDom(page);
      const pasek = page.getByRole("status", { name: "Stan projektu" });
      const przed = (await pasek.boundingBox())!.height;
      const plan = (await page.getByTestId("plan-okno").boundingBox())!;
      await page.mouse.move(plan.x + plan.width - 20, plan.y + plan.height - 20);
      await expect(page.getByTestId("sprawdzenie-w-pasku")).toBeVisible();
      const po = (await pasek.boundingBox())!.height;
      expect(przed).toBeLessThan(50);
      expect(po).toBe(przed);
    });
  });
}

test("nazwy grup katalogu zwykłą pisownią", async ({ page }) => {
  await przykladowyDom(page);
  await page.getByRole("button", { name: "Wstaw Element", exact: true }).click();
  await expect(page.getByText("Gniazda i zasilanie", { exact: true })).toHaveCSS("text-transform", "none");
});
