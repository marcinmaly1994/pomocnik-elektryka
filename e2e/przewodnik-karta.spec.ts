import { test, expect, type Page } from "@playwright/test";

/**
 * Karta przewodnika „Zacznij w 3 krokach": rozmiar wzgledem kolumny narzedzi
 * i powrot do niej po ukonczeniu krokow.
 *
 * Przycisk „Otworz przewodnik" byl martwy na gotowym projekcie: klikalo sie i nie
 * dzialo sie nic widocznego. Skladaly sie na to DWIE niezalezne przyczyny i test
 * sprawdza obie naraz, bo naprawienie tylko jednej niczego nie zmienia (sprawdzone
 * przez cofniecie kazdej z osobna):
 *  1. `shouldShowCard` odmawial pokazania karty, gdy kroki sa ukonczone,
 *  2. efekt pozegnalny w `OnboardingChecklist` zwijal ja 1,4 s po otwarciu.
 */

const lista = (page: Page) => page.locator("div.pe-bez-suwaka.overflow-y-auto.pr-1");
const kolumna = (page: Page) => page.getByTestId("karta-narzedzi").first();
const karta = (page: Page) => page.getByRole("complementary", { name: /Zacznij w 3 krokach/i });

/** Okno 1280 x 900 — typowy laptop, ustawiane jawnie, zeby wysokosc karty i pozycja
 *  przycisku nie zalezaly od domyslnych 720 px. */
async function pustyProjekt(page: Page, wysokosc = 900) {
  await page.setViewportSize({ width: 1280, height: wysokosc });
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByText("Zacznij projektować instalację")).toBeVisible();
  await page.getByRole("button", { name: "Narysuj dom samodzielnie" }).click();
  // Rysowanie od zera odpala dymek przy narzedziu scian; karta czeka, az zniknie.
  const rozumiem = page.getByRole("button", { name: "Rozumiem" });
  if (await rozumiem.count()) await rozumiem.click();
  await expect(karta(page)).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
}

test("kolumna narzedzi konczy sie nad karta, a nie pod nia", async ({ page }) => {
  await pustyProjekt(page);

  const k = (await karta(page).boundingBox())!;
  // Karta pokazuje tylko krok aktywny — bez tego mierzyla ~308 px i zadne skracanie
  // kolumny nie bylo w stanie jej wyminac na typowym laptopie.
  expect(k.height).toBeLessThan(220);

  const kol = (await kolumna(page).boundingBox())!;
  expect(kol.y + kol.height).toBeLessThanOrEqual(k.y + 1);
});

test("zwiniecie karty oddaje liscie odzyskana wysokosc", async ({ page }) => {
  await pustyProjekt(page);
  const skrocona = (await lista(page).boundingBox())!.height;

  await page.getByRole("button", { name: "Zwiń przewodnik" }).click();
  await expect(karta(page)).toHaveCount(0);

  // Zostaje sam dyskretny przycisk „?", wiec lista ma odzyskac miejsce — inaczej
  // karta zabieralaby je takze wtedy, gdy jej nie ma.
  const pelna = (await lista(page).boundingBox())!.height;
  expect(pelna).toBeGreaterThan(skrocona + 80);
});

test("przycisk pomocy otwiera karte z powrotem na ukonczonym projekcie", async ({ page }) => {
  await pustyProjekt(page);

  // Krok 1 (skala) zalatwia samo rysowanie od zera. Zostaja dwa.
  await karta(page).getByRole("button", { name: "Obrysuj pomieszczenie" }).click();
  await page.getByRole("button", { name: "Prostokąt" }).click();
  const plan = (await page.locator("div.overflow-auto.rounded-card.border").first().boundingBox())!;
  await page.mouse.move(plan.x + 320, plan.y + 90);
  await page.mouse.down();
  await page.mouse.move(plan.x + 520, plan.y + 230, { steps: 6 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Dodaj pomieszczenie" }).click();

  await karta(page).getByRole("button", { name: "Wybierz element" }).click();
  await page.getByRole("button", { name: /Gniazdo 230 V/ }).first().click();
  await page.mouse.click(plan.x + 400, plan.y + 150);

  // Komplet krokow chowa karte sam — to zachowanie ma zostac.
  const pomoc = page.getByRole("button", { name: /Otwórz przewodnik/ });
  await expect(pomoc).toBeVisible({ timeout: 4000 });

  // ...ale ponowne otwarcie to decyzja uzytkownika i ma byc silniejsza od pozegnania
  // sprzed chwili. Wczesniej `shouldShowCard` odmawial pokazania karty na ukonczonym
  // projekcie, wiec przycisk byl martwy: klikalo sie i nie dzialo sie nic.
  await pomoc.click();
  await expect(karta(page)).toBeVisible();
  // Stoper pozegnalny trwa 1400 ms — po nim karta ma nadal stac.
  await page.waitForTimeout(2200);
  await expect(karta(page)).toBeVisible();
});
