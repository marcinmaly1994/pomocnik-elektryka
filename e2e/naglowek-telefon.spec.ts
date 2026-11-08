import { test, expect } from "@playwright/test";

/**
 * Nagłówek na telefonie.
 *
 * Pasek przewijany w bok ucinał etykiety w pół słowa („Protokoły pomiarow”), a o reszcie
 * mówiło tylko wygaszenie krawędzi. Teraz poniżej 768 px w nagłówku zostają logo, konto
 * i przycisk „Menu” z arkuszem pozycji. Konto musi zostać w kadrze: aplikacja namawia do
 * założenia go, żeby nie stracić pracy, a kiedyś „Zaloguj się” zaczynało się 623 px
 * za prawą krawędzią.
 */

test.use({ viewport: { width: 375, height: 812 } });

test("„Zaloguj się” mieści się na ekranie telefonu bez przewijania nagłówka", async ({ page }) => {
  await page.goto("/");

  const zaloguj = page.getByRole("button", { name: "Zaloguj się" }).first();
  await expect(zaloguj).toBeVisible();

  const ramka = await zaloguj.boundingBox();
  const szerokosc = page.viewportSize()!.width;
  expect(ramka).not.toBeNull();
  expect(ramka!.x).toBeGreaterThanOrEqual(0);
  expect(ramka!.x + ramka!.width).toBeLessThanOrEqual(szerokosc);
});

test("wszystkie narzędzia są w menu, z pełnymi nazwami", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  const arkusz = page.getByRole("dialog", { name: "Menu" });

  for (const nazwa of ["Kalkulatory", "Protokoły pomiarowe", "Dokumentacja", "Pomoc", "Nowy projekt"]) {
    const przycisk = arkusz.getByRole("button", { name: nazwa, exact: true });
    await expect(przycisk).toBeVisible();
    const ramka = (await przycisk.boundingBox())!;
    expect(ramka.width, `„${nazwa}” ma ${Math.round(ramka.width)} px szerokości`).toBeGreaterThanOrEqual(200);
    expect(ramka.height, `„${nazwa}” ma ${Math.round(ramka.height)} px wysokości`).toBeGreaterThanOrEqual(44);
  }
});

test("wybór w menu przenosi i zamyka arkusz", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("dialog", { name: "Menu" }).getByRole("button", { name: "Kalkulatory", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Kalkulatory elektryczne" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Menu" })).toHaveCount(0);
});

/** „Nowy projekt” ma własne potwierdzenie — zamknięcie arkusza nie może go zabrać ze sobą. */
test("„Nowy projekt” z menu pokazuje potwierdzenie i je honoruje", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("dialog", { name: "Menu" }).getByRole("button", { name: "Nowy projekt", exact: true }).click();

  const potwierdzenie = page.getByRole("dialog", { name: "Zacząć nowy projekt?" });
  await expect(potwierdzenie).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Menu" })).toHaveCount(0);
  await potwierdzenie.getByRole("button", { name: "Tak, zacznij od nowa" }).click();
  await expect(potwierdzenie).toHaveCount(0);
});

/** Nagłówek nie ma prawa rozpychać całej strony — to był osobny, naprawiony już błąd. */
test("strona nie dostaje poziomego przewijania", async ({ page }) => {
  await page.goto("/");
  const rozjazd = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(rozjazd).toBeLessThanOrEqual(0);
});

test("nagłówek telefonu to jeden rząd", async ({ page }) => {
  await page.goto("/");
  const ramka = (await page.getByRole("banner").boundingBox())!;
  expect(ramka.height, `nagłówek ma ${Math.round(ramka.height)} px`).toBeLessThanOrEqual(64);
});
