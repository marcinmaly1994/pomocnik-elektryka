import { test, expect } from "@playwright/test";
import { skipEntryScreen, otworzKatalogElementow } from "./_flow";

/**
 * Symbole łączników wg zestawu symboli instalacyjnych przesłanego przez użytkownika.
 * Testowane e2e, bo istotne jest tu spięcie trzech warstw naraz: nazw w katalogu
 * elementów, rysunku (Konva na planie) i pozycji w kosztorysie — rozjazd którejkolwiek
 * z nich przechodzi testom jednostkowym samej geometrii bez śladu.
 */
test("symbole łączników: biblioteka i plan", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Instalacja" }).click();
  await skipEntryScreen(page);

  await otworzKatalogElementow(page);
  await page.getByRole("button", { name: /Łączniki i sterowanie/ }).click();
  const names = [
    "Łącznik jednobiegunowy",
    "Łącznik dwubiegunowy",
    "Łącznik grupowy",
    "Łącznik schodowy",
    "Łącznik krzyżowy",
  ];
  for (const n of names) await expect(page.getByRole("button", { name: new RegExp(n.replace(/[()]/g, "\\$&")) })).toBeVisible();

  // wariantów 1/2 już nie ma — liczbę biegunów niesie typ
  await page.getByRole("button", { name: /Łącznik jednobiegunowy/ }).click();
  await expect(page.getByRole("button", { name: "2", exact: true })).toHaveCount(0);


  // Powrót na górę strony PRZED pomiarem płótna: rozwinięcie sekcji wydłuża lewą kolumnę,
  // a Playwright przewija stronę, żeby dosięgnąć klikanych przycisków — przy przewinięciu
  // `boundingBox()` zwraca ujemny `y` i kliknięcia myszą lądują poza widokiem, po cichu
  // nic nie stawiając.
  await page.evaluate(() => window.scrollTo(0, 0));

  for (let i = 0; i < names.length; i++) {
    await page.getByRole("button", { name: new RegExp(names[i].replace(/[()]/g, "\\$&")) }).click();
    await page.evaluate(() => window.scrollTo(0, 0));
    // Mierzone PRZY KAŻDYM kliknięciu, nie raz przed pętlą: baner „projekt tylko
    // w tej przeglądarce" pojawia się dopiero po postawieniu PIERWSZEGO elementu,
    // co przesuwa płótno w dół — kliknięcia 2-5 ze starym `box.y` lądowały wtedy
    // ponad płótnem, w banerze, i po cichu nic nie stawiały.
    const box = (await page.locator("div.overflow-auto.rounded-card.border").first().boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(0);
    await page.mouse.click(box.x + 80 + i * 70, box.y + 90);
  }

  // wprost, zanim sprawdzimy kosztorys — inaczej pusty plan dałby tylko mylące
  // „nie znaleziono komórki" zamiast jasnej informacji, że kliknięcia nie trafiły
  await page.waitForTimeout(900); // debounce autozapisu
  const placed = await page.evaluate(() => {
    const raw = localStorage.getItem("pomocnikelektryka_projekt_autosave");
    return raw ? JSON.parse(raw).draft.elements.map((e: { type: string }) => e.type) : [];
  });
  expect(placed).toEqual([
    "wlacznik",
    "wlacznikDwubiegunowy",
    "wlacznikGrupowy",
    "wlacznikSchodowy",
    "wlacznikKrzyzowy",
  ]);

  // trafiają do kosztorysu jako osobne pozycje
  await page.getByRole("button", { name: "Kosztorys", exact: true }).click();
  for (const label of ["Łącznik jednobiegunowy", "Łącznik dwubiegunowy", "Łącznik grupowy", "Łącznik krzyżowy"]) {
    await expect(page.getByRole("cell", { name: new RegExp(label) })).toBeVisible();
  }
});
