import { test, expect } from "@playwright/test";

/**
 * Co widzi uzytkownik, gdy kodu zakladki NIE DA SIE pobrac.
 *
 * Odkad kazda zakladka jest osobnym kawalkiem kodu, ten scenariusz jest rutynowy:
 * hosting serwuje pliki z hashem w nazwie, wiec kazde wdrozenie uniewaznia stare
 * nazwy, a karta zostawiona otwarta przez noc prosi rano o plik, ktorego juz nie ma.
 * Bez granicy bledu React gasil wtedy CALE drzewo — uzytkownik dostawal pusta strone
 * bez slowa wyjasnienia (zmierzone: `document.body.innerText.length === 0`).
 *
 * Test blokuje zadanie o kawalek kodu i pilnuje dwoch rzeczy: ze cos widac i ze to
 * cos prowadzi z powrotem do pracy.
 */

test("nieudane pobranie kodu zakladki NIE gasi calej strony", async ({ page }) => {
  await page.goto("/");
  // Jedno awaryjne przeladowanie jest tu z zalozenia — i wypadnie od razu, bo strona
  // wraca pod ten sam adres i probuje pobrac ten sam, wciaz zablokowany plik. Test
  // sprawdza wiec stan PO tej probie: komunikat zamiast pustki i zamiast petli.
  await page.route(/CalculatorsTab/, (r) => r.abort());
  await page.getByRole("button", { name: "Kalkulatory", exact: true }).click();

  const panel = page.getByText("Nie udało się wczytać tej części aplikacji");
  await expect(panel).toBeVisible({ timeout: 15000 });

  // Zdanie, na ktorym najbardziej zalezy: pierwsza mysl przy takim ekranie brzmi
  // „stracilem prace", a to nieprawda.
  await expect(page.getByText(/Twój projekt jest zapisany w tej przeglądarce/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Odśwież stronę/ })).toBeVisible();

  // Powloka ZOSTAJE na miejscu — granica obejmuje sama tresc zakladki, wiec da sie
  // po prostu przejsc gdzie indziej zamiast ratowac sie odswiezaniem.
  await expect(page.getByRole("button", { name: "Protokoły pomiarowe" })).toBeVisible();
});

test("po awarii jednej zakladki reszta dziala, a powrot ja czysci", async ({ page }) => {
  await page.goto("/");
  await page.route(/CalculatorsTab/, (r) => r.abort());
  await page.getByRole("button", { name: "Kalkulatory", exact: true }).click();
  await expect(page.getByText("Nie udało się wczytać tej części aplikacji")).toBeVisible({ timeout: 15000 });

  // Sedno `key={tab}` przy granicy bledu: bez zerowania raz zlapany blad zostawalby
  // na ekranie takze po przejsciu na sprawna zakladke.
  await page.getByRole("button", { name: "Protokoły pomiarowe" }).click();
  await expect(page.getByRole("heading", { name: "Protokoły pomiarowe" })).toBeVisible();
  await expect(page.getByText("Nie udało się wczytać tej części aplikacji")).toHaveCount(0);
});

test("gdy kod znow sie pobiera, zakladka otwiera sie normalnie", async ({ page }) => {
  await page.goto("/");
  let blokuj = true;
  await page.route(/CalculatorsTab/, (r) => (blokuj ? r.abort() : r.continue()));
  await page.getByRole("button", { name: "Kalkulatory", exact: true }).click();
  await expect(page.getByText("Nie udało się wczytać tej części aplikacji")).toBeVisible({ timeout: 15000 });

  // Odpowiednik „wdrozenie sie skonczylo / siec wrocila".
  blokuj = false;
  await page.getByRole("button", { name: /Odśwież stronę/ }).click();

  await expect(page.getByRole("heading", { name: "Kalkulatory elektryczne" })).toBeVisible();
});
