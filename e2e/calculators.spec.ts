import { test, expect } from "@playwright/test";
import { skipEntryScreen } from "./_flow";

/**
 * Kalkulatory w zakładce „Kalkulatory".
 *
 * Sens tych testów to WPIĘCIE, nie matematyka — tak samo jak w `panel-sizing.spec.ts`.
 * Sam silnik doboru (`sizeCircuit`, `zsMaxForBreaker`) ma komplet testów jednostkowych
 * w `src/lib/panel/sizing.test.ts`. Tu sprawdzamy, że „Dobór przewodu i zabezpieczenia"
 * faktycznie woła TEN SAM silnik co Rozdzielnica (a nie osobną, prostszą kopię, jak
 * przed migracją krok 77 — patrz MIGRATION.md), że pola formularza realnie wpływają
 * na wynik, i że błędny dobór pokazuje czytelny komunikat zamiast pustego wyniku.
 */

async function openCalculators(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Kalkulatory", exact: true }).click();
}

async function planBox(page: import("@playwright/test").Page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  return (await page.locator("div.overflow-auto.rounded-card.border").first().boundingBox())!;
}

test("dobór przewodu dla domyślnych danych zgadza się z silnikiem Rozdzielnicy (2,5 mm² / B16)", async ({ page }) => {
  await openCalculators(page);

  // domyślnie: gniazda, 2000 W, 1-fazowe, 15 m, pod tynkiem (B2) — te same założenia,
  // z którymi liczy `sizeCircuit` w src/lib/panel/sizing.test.ts
  const result = page.locator(".pe-result").first();
  await expect(result).toContainText("8.70 A");
  await expect(result).toContainText("YDYp 3x2,5 mm²");
  await expect(result).toContainText("B16");
  await expect(result).toContainText("obc. dop. 23 A");
});

test("zmiana rodzaju obwodu na Oświetlenie zmienia dobór (ostrzejszy limit spadku, inny prąd znamionowy)", async ({ page }) => {
  await openCalculators(page);

  await page.getByLabel("Rodzaj obwodu").selectOption("oswietlenie");
  await page.getByLabel("Moc odbiornika").fill("800");

  const result = page.locator(".pe-result").first();
  // 800 W / 230 V = 3,48 A -> mimo tak niskiego prądu obwód oświetleniowy dostaje B10
  // (wymiarowanie pod docelową obsadę, nie pod dzisiejszy pobór — patrz sizing.ts)
  await expect(result).toContainText("YDYp 3x1,5 mm²");
  await expect(result).toContainText("B10");
  await expect(result).toContainText("limit 3%");
});

test("dobór, którego nie da się spełnić, pokazuje czytelny komunikat zamiast pustego wyniku", async ({ page }) => {
  await openCalculators(page);

  await page.getByLabel("Moc odbiornika").fill("99000");

  const result = page.locator(".pe-result").first();
  await expect(result).toContainText("nie udało się dobrać");
  await expect(page.getByText(/przekracza obciążalność największego przekroju/)).toBeVisible();
});

test("Spadek napięcia nie jest już osobnym kalkulatorem — połączony z doborem przewodu", async ({ page }) => {
  await openCalculators(page);

  await expect(page.getByRole("button", { name: "Spadek napięcia", exact: true })).toHaveCount(0);
  await expect(page.getByText("przekrój, wyłącznik, spadek napięcia")).toBeVisible();
});

test("impedancja pętli zwarcia liczy się z tych samych stałych co Rozdzielnica (B16 -> Ia 80 A, Zs max 2,88 Ω)", async ({ page }) => {
  await openCalculators(page);

  await page.getByRole("button", { name: "Impedancja pętli zwarcia" }).click();

  const result = page.locator(".pe-result").first();
  await expect(result).toContainText("80 A");
  await expect(result).toContainText("2.88 Ω");
});

/**
 * Wejścia kalkulatorów mieszkają w `useCalculatorsStore` (localStorage, klucz
 * `pomocnikelektryka_kalkulatory"), osobno od projektu — bez tego ręcznie
 * wpisana lista odbiorników w „Bilansie mocy" znikała przy każdym przejściu
 * na inną zakładkę i przy odświeżeniu strony.
 */
test("wejścia kalkulatora (aktywny kalkulator, lista odbiorników) przetrwają zmianę zakładki i odświeżenie strony", async ({ page }) => {
  await openCalculators(page);

  await page.getByRole("button", { name: "Bilans mocy budynku" }).click();
  const firstDeviceName = page.locator("input.pe-input.text-sm.flex-1").first();
  await firstDeviceName.fill("Test trwałości");

  // zmiana zakładki na Instalację i powrót — bez utraty ani aktywnego
  // kalkulatora, ani wpisanej nazwy odbiornika
  await page.getByRole("button", { name: "Instalacja" }).click();
  await skipEntryScreen(page);
  await page.getByRole("button", { name: "Kalkulatory", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Bilans mocy budynku" })).toBeVisible();
  await expect(page.locator("input.pe-input.text-sm.flex-1").first()).toHaveValue("Test trwałości");

  // odświeżenie strony wraca zawsze na zakładkę Instalacja (to `App`-owy `tab`,
  // nieprzeliczany w tym store — patrz `useState<AppTab>` w App.tsx), ale samo
  // wejście do Kalkulatorów po odświeżeniu ma pokazać dokładnie to, co było —
  // to jest właśnie to, co ma przetrwać w localStorage
  await page.reload();
  await page.getByRole("button", { name: "Kalkulatory", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Bilans mocy budynku" })).toBeVisible();
  await expect(page.locator("input.pe-input.text-sm.flex-1").first()).toHaveValue("Test trwałości");
});

/**
 * „Wczytaj z projektu" w Bilansie mocy — zamiast ręcznego przepisywania mocy
 * odbiorników, obwody liczą się z tego, co faktycznie stoi na planie, przez
 * ten sam model obciążeń (`circuitDemand`) co Rozdzielnica.
 */
test("Wczytaj z projektu wypełnia bilans mocy obwodami wyliczonymi z elementów na planie", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Instalacja" }).click();
  await skipEntryScreen(page);

  // 1 gniazdko (300 W wg ASSUMED_POWER_W) -> obwód gniazdowy
  await page.getByRole("button", { name: /Gniazdo 230 V/ }).first().click();
  let box = await planBox(page);
  await page.mouse.click(box.x + 150, box.y + 100);

  // 1 punkt sufitowy (60 W) -> obwód oświetleniowy — osobna kategoria w bibliotece
  await page.getByRole("button", { name: /Oświetlenie/ }).first().click();
  await page.getByRole("button", { name: /Punkt sufitowy/ }).first().click();
  box = await planBox(page);
  await page.mouse.click(box.x + 300, box.y + 200);

  await page.getByRole("button", { name: "Kalkulatory", exact: true }).click();
  await page.getByRole("button", { name: "Bilans mocy budynku" }).click();

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Wczytaj z projektu" }).click();

  const names = page.locator("input.pe-input.text-sm.flex-1");
  await expect(names).toHaveCount(2);
  await expect(names.nth(0)).toHaveValue(/Obwód gniazd/);
  await expect(names.nth(1)).toHaveValue(/Obwód oświetlenia/);

  const powers = page.locator("input.pe-mono.w-24");
  await expect(powers.nth(0)).toHaveValue("300");
  await expect(powers.nth(1)).toHaveValue("60");
});

test("Wczytaj z projektu jest wyłączone, gdy na planie nie ma jeszcze żadnych elementów", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Kalkulatory", exact: true }).click();
  await page.getByRole("button", { name: "Bilans mocy budynku" }).click();

  await expect(page.getByRole("button", { name: "Wczytaj z projektu" })).toBeDisabled();
});

test("dobór WLZ dla domyślnych danych (20 A, 3F, 20 m, w rurce) -> 10 mm² / B20, ten sam silnik co obwód odbiorczy", async ({ page }) => {
  await openCalculators(page);
  await page.getByRole("button", { name: "Dobór WLZ" }).click();

  const result = page.locator(".pe-result").first();
  await expect(result).toContainText("YDYp 5x10 mm²");
  await expect(result).toContainText("B20");
  await expect(result).toContainText("obc. dop. 50 A");
});

test("Wczytaj z bilansu mocy pobiera prąd zapotrzebowany 3-fazowy z kalkulatora Bilans mocy", async ({ page }) => {
  await openCalculators(page);
  await page.getByRole("button", { name: "Dobór WLZ" }).click();

  // domyślne odbiorniki bilansu (6000+7000+3000 W, ks=0,7) -> Pz=11 200 W ->
  // I3f = 11200/(√3·400) ≈ 16,17 A, zaokrąglone w UI do 16,2
  await page.getByRole("button", { name: "Wczytaj z bilansu mocy" }).click();
  await expect(page.getByLabel("Prąd obliczeniowy")).toHaveValue("16.2");
});

test("rezystancja uziemienia (TT): RCD 30 mA daje RA max 1667 Ω, zmierzona RA ponad limit pokazuje ostrzeżenie", async ({ page }) => {
  await openCalculators(page);
  await page.getByRole("button", { name: "Rezystancja uziemienia" }).click();

  const result = page.locator(".pe-result").first();
  await expect(result).toContainText("1667");
  await expect(page.getByText(/Warunek spełniony/)).toBeVisible();

  await page.getByLabel("Zmierzona rezystancja uziemienia RA").fill("2000");
  await expect(page.getByText(/Warunek niespełniony/)).toBeVisible();
});
