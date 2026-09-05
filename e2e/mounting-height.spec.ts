import { test, expect, type Page } from "@playwright/test";

/**
 * Wysokość montażu elementu — pole w oknie edycji i jego skutek w projekcie.
 *
 * Sama wartość domyślna i przeliczenie pionu trasy mają testy jednostkowe
 * (`mountingHeightM`, `estimateRoutes`). Tutaj chodzi o to, czego stamtąd nie widać:
 * czy pole zapisuje się na elemencie, czy puste pole naprawdę oznacza „wartość
 * typowa" i czy wpisana wysokość przeżywa odświeżenie strony.
 */

async function planBox(page: Page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  return (await page.locator("div.overflow-auto.rounded-card.border").first().boundingBox())!;
}

async function pustyProjekt(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByText("Zacznij projektować instalację")).toBeVisible();
  await page.getByRole("button", { name: "Narysuj dom samodzielnie" }).click();
  const rozumiem = page.getByRole("button", { name: "Rozumiem" });
  if (await rozumiem.count()) await rozumiem.click();
}

async function postawGniazdko(page: Page, x: number, y: number) {
  await page.getByRole("button", { name: "Wstaw Element" }).click();
  await page.getByRole("button", { name: /Gniazdo 230 V/ }).click();
  const box = await planBox(page);
  await page.mouse.click(box.x + x, box.y + y);
}

/** Dwuklik w element wskazany po TYPIE — pozycja liczona z danych, nie z offsetu
 *  ekranowego, bo widok sam dopasowuje powiększenie (ten sam wzorzec co w
 *  light-groups.spec.ts). */
async function otworzEdycje(page: Page, typ: string) {
  await page.waitForTimeout(900); // debounce autozapisu — stąd bierzemy pozycję
  const el = await page.evaluate((t) => {
    const d = JSON.parse(localStorage.getItem("pomocnikelektryka_projekt_autosave")!);
    return d.draft.elements.find((e: { type: string }) => e.type === t) ?? null;
  }, typ);
  if (!el) throw new Error(`Nie ma elementu typu ${typ}`);
  await page.getByRole("button", { name: "Zaznacz", exact: true }).click();
  const box = await planBox(page);
  const skala = await page.evaluate(() => {
    const k = (window as unknown as { Konva: { stages: { scaleX(): number }[] } }).Konva;
    return k.stages[0].scaleX();
  });
  await page.mouse.dblclick(box.x + el.x * skala, box.y + el.y * skala);
  await expect(page.getByText("Edytuj element")).toBeVisible();
}

async function wysokoscWProjekcie(page: Page) {
  await page.waitForTimeout(900);
  return page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem("pomocnikelektryka_projekt_autosave")!);
    return d.draft.elements.find((e: { type: string }) => e.type === "gniazdko")?.heightM ?? null;
  });
}

test("wysokość montażu zapisuje się na elemencie i przeżywa odświeżenie", async ({ page }) => {
  await pustyProjekt(page);
  await postawGniazdko(page, 200, 200);

  // Świeżo postawione gniazdo nie ma własnej wysokości — obowiązuje typowa.
  expect(await wysokoscWProjekcie(page)).toBeNull();

  await otworzEdycje(page, "gniazdko");
  const pole = page.getByLabel("Wysokość montażu w metrach");
  // Podpowiedź w pustym polu mówi, jaka wartość obowiązuje bez wpisywania czegokolwiek.
  await expect(pole).toHaveAttribute("placeholder", /0\.3/);
  await pole.fill("1.15"); // gniazdo nad blatem w kuchni
  await page.getByRole("button", { name: "Zapisz" }).click();

  expect(await wysokoscWProjekcie(page)).toBe(1.15);

  await page.reload();
  await page.getByRole("button", { name: "Instalacja" }).click();
  expect(await wysokoscWProjekcie(page)).toBe(1.15);
});

test("wyczyszczenie pola wraca do wartości typowej, nie zapisuje zera", async ({ page }) => {
  await pustyProjekt(page);
  await postawGniazdko(page, 200, 200);

  await otworzEdycje(page, "gniazdko");
  await page.getByLabel("Wysokość montażu w metrach").fill("1.15");
  await page.getByRole("button", { name: "Zapisz" }).click();
  expect(await wysokoscWProjekcie(page)).toBe(1.15);

  await otworzEdycje(page, "gniazdko");
  await page.getByLabel("Wysokość montażu w metrach").fill("");
  await page.getByRole("button", { name: "Zapisz" }).click();

  // `null` w zapisie = brak nadpisania, czyli powrót do 0,3 m dla gniazdka.
  expect(await wysokoscWProjekcie(page)).toBeNull();
});
