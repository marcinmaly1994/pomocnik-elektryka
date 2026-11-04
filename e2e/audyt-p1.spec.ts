import { test, expect, type Page } from "@playwright/test";
import { wczytajPrzyklad } from "./_flow";

/**
 * Cztery błędy P1 z audytu 2026-11-04 — każdy sprawdzany tak, jak go zgłoszono:
 * na działającej aplikacji, nie tylko w funkcji.
 */

const BIEZACY = "pomocnikelektryka_projekt_biezacy";

interface ZapisanyAparat {
  kind: string;
  tag: string;
  caption: string;
  phase?: string;
  poles?: string;
  rcdTag?: string;
}

async function aparatyZZapisu(page: Page): Promise<ZapisanyAparat[]> {
  return page.evaluate((klucz) => {
    const k = "pomocnikelektryka_projekt_" + localStorage.getItem(klucz);
    const pr = JSON.parse(localStorage.getItem(k) ?? "{}") as { panelDevices?: ZapisanyAparat[] };
    return pr.panelDevices ?? [];
  }, BIEZACY);
}

async function domWRozdzielnicy(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await wczytajPrzyklad(page, "dom");
  await page.getByRole("button", { name: "Rozdzielnica", exact: true }).click();
  await expect(page.getByText(/Widok frontu rozdzielnicy/)).toBeVisible();
  await expect.poll(async () => (await aparatyZZapisu(page)).length).toBeGreaterThan(0);
}

test("B1: faza w tabeli doboru = faza aparatu na froncie i schemacie", async ({ page }) => {
  await domWRozdzielnicy(page);

  const tabela = await page.locator("tbody tr").evaluateAll((wiersze) =>
    wiersze
      .map((tr) => ({
        nazwa: (tr.querySelector("td")?.textContent ?? "").trim(),
        faza: (tr.querySelector('td[data-label="Faza"]')?.textContent ?? "").trim(),
      }))
      .filter((w) => /^L[123]$/.test(w.faza))
  );
  expect(tabela.length).toBeGreaterThan(5);

  const aparaty = await aparatyZZapisu(page);
  for (const w of tabela) {
    const aparat = aparaty.find((d) => d.kind === "mcb" && d.caption === w.nazwa);
    expect(aparat, `aparat dla „${w.nazwa}"`).toBeTruthy();
    expect(aparat!.phase, `faza „${w.nazwa}"`).toBe(w.faza);
  }
});

test("B2: ładowarka EV ma własną różnicówkę typu B", async ({ page }) => {
  await domWRozdzielnicy(page);
  const aparaty = await aparatyZZapisu(page);
  const ev = aparaty.find((d) => d.kind === "mcb" && d.caption.startsWith("Ładowarka EV"));
  expect(ev?.rcdTag).toBeTruthy();
  const rcd = aparaty.find((d) => d.kind === "rcd" && d.tag === ev!.rcdTag);
  expect(rcd?.caption).toMatch(/typ B/);
  // nic poza ładowarką pod tą różnicówką
  expect(aparaty.filter((d) => d.kind === "mcb" && d.rcdTag === ev!.rcdTag)).toHaveLength(1);
  // pozostałe różnicówki są typu A
  expect(aparaty.filter((d) => d.kind === "rcd" && d.tag !== rcd!.tag).every((d) => /typ A/.test(d.caption))).toBe(true);

  // typ widać na schemacie
  await page.getByRole("button", { name: "Schemat", exact: true }).click();
  await expect(page.locator(`#rcd-${rcd!.tag}`)).toContainText("30 mA · typ B");
});

test("B3: Ik ≥ Ia nie daje fałszywego „nie przejdzie odbioru” z czasu 0,4 s", async ({ page }) => {
  await page.goto("/kalkulatory/obwod");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByLabel("Impedancja pętli Zs").fill("1.5");
  await page.getByLabel("Spodziewany prąd zwarcia Ik").fill("1000");

  const cieplny = page.getByText(/wytrzymałość zwarciowa cieplna/i).last().locator("..");
  await expect(cieplny).toContainText("I²t");
  await expect(page.getByText(/Nie spełniono: wytrzymałość zwarciowa cieplna/)).toHaveCount(0);
  // sprzeczne Ik i Zs są nazwane
  await expect(cieplny).toContainText("nie zgadza się z Zs");

  // z I²t z karty katalogowej kryterium się ocenia
  await page.getByLabel("I²t aparatu").fill("20000");
  await expect(cieplny).toContainText("≥ I²t aparatu");
});

test("B4: uszkodzony zapis nie daje białego ekranu i da się go pobrać", async ({ page }) => {
  await page.goto("/");
  await page.evaluate((klucz) => {
    localStorage.clear();
    localStorage.setItem("pomocnikelektryka_projekty", JSON.stringify([{ id: "zly", nazwa: "Mój dom", zmieniony: 1 }]));
    localStorage.setItem(klucz, "zly");
    // poprawny JSON, zły kształt — dokładnie to, co wywracało start
    localStorage.setItem("pomocnikelektryka_projekt_zly", JSON.stringify({ walls: "x", elements: null }));
  }, BIEZACY);
  await page.reload();

  const pasek = page.getByTestId("zapis-uszkodzony");
  await expect(pasek).toBeVisible();
  await expect(pasek).toContainText("Mój dom");

  // aplikacja działa — także Kalkulatory, które z projektu nie korzystają
  await page.getByRole("button", { name: "Kalkulatory", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Kalkulatory elektryczne" })).toBeVisible();

  // surowa kopia nie przepadła
  const kopia = await page.evaluate(() => localStorage.getItem("pomocnikelektryka_uszkodzony_zly"));
  expect(JSON.parse(kopia!)).toEqual({ walls: "x", elements: null });

  const pobranie = page.waitForEvent("download");
  await pasek.getByRole("button", { name: "Pobierz uszkodzony zapis" }).click();
  expect((await pobranie).suggestedFilename()).toMatch(/^uszkodzony-zapis.*\.json$/);

  // drugi start jest już czysty — zapis został odłożony, a nie wczytywany w kółko
  await page.reload();
  await expect(page.getByTestId("zapis-uszkodzony")).toHaveCount(0);
});
