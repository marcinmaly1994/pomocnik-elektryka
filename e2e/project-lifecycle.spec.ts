import { test, expect } from "@playwright/test";

/**
 * Cykl życia projektu: autozapis lokalny + „Nowy projekt".
 *
 * Testowane e2e, a nie jednostkowo, bo cała wartość tego mechanizmu leży w tym, co
 * przetrwa PRAWDZIWE przeładowanie karty — a tego `jsdom` nie odtworzy. Dodatkowo
 * „Nowy projekt" to jedyna nieodwracalna operacja w aplikacji: odkąd działa autozapis,
 * skasowanego planu nie da się już odzyskać odświeżeniem strony, więc regresja tutaj
 * kosztowałaby użytkownika realną pracę.
 */
test("Nowy projekt czyści plan, nazwę i autozapis; przetrwa odświeżenie", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Instalacja" }).click();
  // Box trzeba pobierać na nowo PRZED KAŻDYM kliknięciem, ze scrollTo(0,0) tuż
  // przedtem: klik zmieniający narzędzie ORAZ postawienie PIERWSZEGO elementu
  // (odsłania trwały baner ryzyka nad płótnem) potrafią przesunąć płótno w dół,
  // więc box zmierzony wcześniej staje się nieaktualny (patrz `zoomAndBox` w
  // room-editing.spec.ts — ten sam wzorzec).
  await page.getByRole("button", { name: /Gniazdo 230 V/ }).first().click();
  for (let i = 0; i < 4; i++) {
    await page.evaluate(() => window.scrollTo(0, 0));
    const box = (await page.locator("div.overflow-auto.rounded-card.border").first().boundingBox())!;
    await page.mouse.click(box.x + 80 + i * 50, box.y + 80);
  }

  // zmień nazwę projektu, żeby sprawdzić czy też się resetuje
  await page.locator("button[title=\"Zmień nazwę projektu\"]").click();
  await page.getByLabel("Nazwa projektu").fill("Dom Kowalskiego");
  await page.keyboard.press("Enter");

  await expect(page.getByRole("button", { name: /Dom Kowalskiego/ })).toBeVisible();
  await page.waitForTimeout(900); // debounce autozapisu
  const before = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("pomocnikelektryka_projekt_autosave") || "{}")
  );
  expect(before.draft.elements.length).toBe(4);
  expect(before.projectName).toBe("Dom Kowalskiego");

  // --- Nowy projekt
  await page.getByRole("button", { name: "Nowy projekt" }).click();
  await expect(page.getByText(/4 elementy na planie/)).toBeVisible();
  await page.getByRole("button", { name: "Tak, zacznij od nowa" }).click();

  await expect(page.getByRole("button", { name: /Mój dom/ })).toBeVisible();
  await page.waitForTimeout(900);
  const after = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("pomocnikelektryka_projekt_autosave") || "{}")
  );
  expect(after.draft.elements.length).toBe(0);
  expect(after.projectName).toBe("Mój dom");

  // najważniejsze: po odświeżeniu projekt NIE wraca
  await page.reload();
  const afterReload = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("pomocnikelektryka_projekt_autosave") || "{}")
  );
  expect(afterReload.draft.elements.length).toBe(0);
  await expect(page.getByRole("button", { name: /Mój dom/ })).toBeVisible();

  // schemat/rozdzielnica wracają do stanu pustego
  await page.getByRole("button", { name: "Schemat", exact: true }).click();
  await expect(page.getByText(/Schemat wygeneruje się automatycznie/)).toBeVisible();

  // anulowanie NIE kasuje
  await page.getByRole("button", { name: "Instalacja" }).click();
  await page.getByRole("button", { name: /Gniazdo 230 V/ }).first().click();
  await page.evaluate(() => window.scrollTo(0, 0));
  const box2 = (await page.locator("div.overflow-auto.rounded-card.border").first().boundingBox())!;
  await page.mouse.click(box2.x + 120, box2.y + 120);
  await page.getByRole("button", { name: "Nowy projekt" }).click();
  await page.getByRole("button", { name: "Anuluj" }).click();
  await page.waitForTimeout(900);
  const afterCancel = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("pomocnikelektryka_projekt_autosave") || "{}")
  );
  expect(afterCancel.draft.elements.length).toBe(1);
});
