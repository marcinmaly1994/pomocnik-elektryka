import { test, expect } from "@playwright/test";

test("dodanie nowej kondygnacji przez dialog", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Parter" })).toBeVisible();

  await page.getByRole("button", { name: "+ Dodaj kondygnację" }).click();
  const input = page.getByRole("textbox");
  await input.fill("Piętro 1");
  await page.getByRole("button", { name: "Dodaj" }).click();

  // `exact`, bo obok zakładki kondygnacji stoi przycisk „Usuń kondygnację Piętro 1",
  // który bez tego też pasowałby do wyszukiwania po nazwie
  await expect(page.getByRole("button", { name: "Piętro 1", exact: true })).toBeVisible();
});

test("usuwanie kondygnacji: przycisk dopiero przy drugiej, kasuje jej elementy", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Instalacja" }).click();
  // Box mierzony PO kliknięciu, które zmienia narzędzie — takie kliknięcie potrafi
  // doscrollować stronę, więc box zmierzony wcześniej byłby nieaktualny (patrz
  // `zoomAndBox` w room-editing.spec.ts, ten sam wzorzec).
  await page.getByRole("button", { name: /Gniazdo 230 V/ }).first().click();
  // Box trzeba pobierać na nowo PRZED KAŻDYM kliknięciem, nie raz na całą pętlę:
  // pojawienie się PIERWSZEGO elementu odsłania trwały baner ryzyka („Ten projekt
  // istnieje tylko w tej przeglądarce...", gated na `elements.length > 0`) NAD
  // płótnem, co przesuwa je w dół o dziesiątki pikseli — box zmierzony przed tym
  // momentem staje się nieaktualny dla kolejnych kliknięć w tej samej pętli.
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.scrollTo(0, 0));
    const box = (await page.locator("div.overflow-auto.rounded-card.border").first().boundingBox())!;
    await page.mouse.click(box.x + 80 + i * 50, box.y + 80);
  }

  // ostatniej kondygnacji nie da się usunąć — plan musi mieć gdzie istnieć
  await expect(page.getByRole("button", { name: /^Usuń kondygnację/ })).toHaveCount(0);

  await page.getByRole("button", { name: "+ Dodaj kondygnację" }).click();
  await page.getByRole("button", { name: "Dodaj", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Usuń kondygnację/ })).toHaveCount(2);

  await page.getByRole("button", { name: /Gniazdo 230 V/ }).first().click();
  for (const dx of [120, 180]) {
    await page.evaluate(() => window.scrollTo(0, 0));
    const box2 = (await page.locator("div.overflow-auto.rounded-card.border").first().boundingBox())!;
    await page.mouse.click(box2.x + dx, box2.y + 200);
  }

  await page.getByRole("button", { name: "Usuń kondygnację Piętro 1" }).click();
  await expect(page.getByText(/zniknie 2 elementy/)).toBeVisible();
  await page.getByRole("button", { name: "Usuń kondygnację", exact: true }).click();

  await expect(page.getByRole("button", { name: /^Usuń kondygnację/ })).toHaveCount(0);
  await page.waitForTimeout(900); // debounce autozapisu
  const left = await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem("pomocnikelektryka_projekt_autosave")!);
    return { floors: d.floors.length, elements: d.draft.elements.length };
  });
  // elementy skasowanego piętra znikają razem z nim, parter zostaje nietknięty
  expect(left).toEqual({ floors: 1, elements: 3 });
});
