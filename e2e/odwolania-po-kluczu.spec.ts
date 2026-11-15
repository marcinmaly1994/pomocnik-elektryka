import { test, expect } from "@playwright/test";
import { skipEntryScreen, otworzKatalogElementow } from "./_flow";

/**
 * Przegląd 15.11.2026, pkt 1: aparat dołożony ręcznie wskazuje wyłącznik z automatu
 * OZNACZENIEM („Zasilany z: F1"), a automat numeruje obwody od nowa przy każdej zmianie
 * rzutu. Obwód dedykowany (gniazdo trójfazowe) staje PRZED obwodem gniazd, więc ten
 * przechodzi z F1 na F2 — a lampka ma pójść za nim, nie zostać przy numerze F1.
 */
async function postaw(page: import("@playwright/test").Page, nazwa: RegExp, xs: number[]) {
  const okno = page.locator("[data-testid=plan-okno]").first();
  await otworzKatalogElementow(page);
  await page.getByRole("button", { name: nazwa }).first().click();
  for (const dx of xs) {
    await page.evaluate(() => window.scrollTo(0, 0));
    const box = (await okno.boundingBox())!;
    await page.mouse.click(box.x + dx, box.y + 80);
  }
}

test("lampka zasilana z wyłącznika z automatu idzie za nim, gdy rzut przenumeruje obwody", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Instalacja" }).click();
  await skipEntryScreen(page);
  await postaw(page, /Gniazdo 230 V/, [100, 250, 400]);

  await page.getByRole("button", { name: "Rozdzielnica", exact: true }).click();
  const lista = page.getByTestId("lista-aparatow");
  await expect(lista).toContainText("F1");

  // Lampka zasilana z wyłącznika obwodu gniazd (F1).
  await page.getByLabel("Rodzaj aparatu do dodania").selectOption({ label: "Lampka sygnalizacyjna" });
  await page.getByRole("button", { name: "Dodaj", exact: true }).click();
  await page.getByRole("button", { name: "Edytuj aparat P1", exact: true }).click();
  await page.getByLabel("Zasilany z").selectOption("F1");
  await page.getByRole("button", { name: "Zapisz zmiany" }).click();

  // Gniazdo trójfazowe na rzucie — jego obwód dedykowany zajmuje F1, gniazda idą na F2.
  await page.getByRole("button", { name: "Instalacja" }).first().click();
  await postaw(page, /Gniazdo trójfazowe/, [550]);
  await page.getByRole("button", { name: "Rozdzielnica", exact: true }).click();

  const wiersz = (tag: string) => lista.locator("div").filter({ has: page.locator(`span.pe-mono:text-is("${tag}")`) }).first();
  await expect(wiersz("F2")).toContainText(/Gniazd/);
  await page.getByRole("button", { name: "Edytuj aparat P1", exact: true }).click();
  await expect(page.getByLabel("Zasilany z")).toHaveValue("F2");
});

/**
 * Projekty zapisane przed tą zmianą mają klucze pozycyjne (`mcb-obw1`) w liście
 * aparatów i nadpisaniach. Po przejściu na id od elementu nadpisanie nie może przepaść —
 * `mapaKluczyStarych` tłumaczy je po pozycji przy pierwszej odbudowie.
 */
test("stary zapis z kluczem mcb-obw1 zachowuje nadpisaną nastawę i dostaje nowy klucz", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Instalacja" }).click();
  await skipEntryScreen(page);
  await postaw(page, /Gniazdo 230 V/, [100, 250]);
  await page.getByRole("button", { name: "Rozdzielnica", exact: true }).click();
  await expect(page.getByTestId("lista-aparatow")).toContainText("F1");

  // Autozapis w nowym formacie przerabiamy na stary: klucz pozycyjny i nadpisanie pod nim.
  await expect
    .poll(() => page.evaluate(() => Object.values(localStorage).some((v) => /"key":"mcb-obw-/.test(v ?? ""))))
    .toBe(true);
  const klucz = await page.evaluate(() => {
    for (const k of Object.keys(localStorage)) {
      const v = localStorage.getItem(k) ?? "";
      const m = v.match(/"key":"(mcb-obw-[^"]+)"/);
      if (!m) continue;
      localStorage.setItem(k, v.split(m[1]).join("mcb-obw1").replace('"panelOverrides":{}', '"panelOverrides":{"mcb-obw1":{"label":"B13"}}'));
      return k;
    }
    return null;
  });
  expect(klucz).not.toBeNull();

  await page.reload();
  await page.getByRole("button", { name: "Rozdzielnica", exact: true }).click();
  await expect(page.getByTestId("lista-aparatow")).toContainText("B13");
  await expect
    .poll(() => page.evaluate((k) => localStorage.getItem(k!) ?? "", klucz))
    .toMatch(/"mcb-obw-[^"]+":\{"label":"B13"\}/);
});
