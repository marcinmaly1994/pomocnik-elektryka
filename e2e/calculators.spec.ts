import { test, expect } from "@playwright/test";
import { skipEntryScreen } from "./_flow";

/**
 * Kalkulatory w zakładce „Kalkulatory".
 *
 * Sens tych testów to WPIĘCIE, nie matematyka — tak samo jak w `panel-sizing.spec.ts`.
 * Sam silnik doboru (`sizeCircuit`, `sizeBreakerForSection`, `zsMaxForBreaker`) ma
 * komplet testów jednostkowych w `src/lib/panel/sizing.test.ts`. Tu sprawdzamy, że
 * „Dobór przekroju przewodu" i „Dobór zabezpieczenia" faktycznie wołają TEN SAM
 * silnik co Rozdzielnica (a nie osobną, prostszą kopię, jak przed migracją krok 77 —
 * patrz MIGRATION.md), że pola formularza realnie wpływają na wynik, i że błędny
 * dobór pokazuje czytelny komunikat zamiast pustego wyniku.
 */

async function openCalculators(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Kalkulatory", exact: true }).click();
}

async function planBox(page: import("@playwright/test").Page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  return (await page.locator("div.overflow-auto.rounded-card.border").first().boundingBox())!;
}

test("dobór przekroju dla domyślnych danych zgadza się z silnikiem Rozdzielnicy (2,5 mm²)", async ({ page }) => {
  await openCalculators(page);

  // domyślnie otwiera się „Dobór przekroju przewodu": gniazda, 2000 W, 1-fazowe,
  // 15 m, pod tynkiem (B2) — te same założenia, z którymi liczy `sizeCircuit`
  // w src/lib/panel/sizing.test.ts
  const result = page.locator(".pe-result").first();
  await expect(result).toContainText("2,5 mm²");
  await expect(result).toContainText("YDYp 3x2,5 mm²");
  await expect(result).toContainText("Ib 8.70 A");
  await expect(result).toContainText("obc. dop. 23 A");
});

test("zmiana rodzaju obwodu na Oświetlenie zmienia przekrój i limit spadku", async ({ page }) => {
  await openCalculators(page);

  await page.getByLabel("Rodzaj obwodu").selectOption("oswietlenie");
  await page.getByLabel("Moc odbiornika").fill("800");

  const result = page.locator(".pe-result").first();
  await expect(result).toContainText("YDYp 3x1,5 mm²");
  await expect(result).toContainText("limit 3%");
});

test("dobór, którego nie da się spełnić, pokazuje czytelny komunikat zamiast pustego wyniku", async ({ page }) => {
  await openCalculators(page);

  await page.getByLabel("Moc odbiornika").fill("99000");

  const result = page.locator(".pe-result").first();
  await expect(result).toContainText("nie udało się dobrać");
  await expect(page.getByText(/przekracza obciążalność największego przekroju/)).toBeVisible();
});

/**
 * Sposób ułożenia był polem formularza od dawna, ale jego wpływ pozostawał
 * niewidoczny. Tabelka porównawcza pokazuje wszystkie cztery warianty naraz —
 * i to ona jest tu sprawdzana, bo bez niej „weź pod uwagę sposób ułożenia"
 * sprowadza się do listy, którą użytkownik pomija.
 */
test("dobór przekroju pokazuje, jak sposób ułożenia zmienia obciążalność, i pozwala go zmienić klikiem", async ({ page }) => {
  await openCalculators(page);

  const tabela = page.getByText("Jak sposób ułożenia zmienia wynik").locator("..");
  // 2,5 mm², 2 żyły obciążone: natynkowo (C) = 27 A, pod tynkiem (B2) = 23 A,
  // ściana ocieplona (A1) = 19,5 A — trzy różne liczby z tablicy B.52.4
  await expect(tabela).toContainText("27 A");
  await expect(tabela).toContainText("23 A");
  await expect(tabela).toContainText("19.5 A");

  // klik w wiersz przestawia założenie w formularzu wyżej
  await tabela.getByRole("button", { name: /natynkowo/ }).click();
  await expect(page.getByLabel("Sposób ułożenia")).toHaveValue("natynkowo");
});

/**
 * Rozbicie doboru na dwa kalkulatory ma sens tylko wtedy, gdy oba mówią to samo:
 * przekrój dobrany w pierwszym, wpisany do drugiego, musi dać ten sam aparat co
 * dawał połączony kalkulator (B16 dla domyślnego obwodu gniazd 2000 W).
 */
test("dobór zabezpieczenia do przekroju 2,5 mm² daje B16 i rozpisany warunek Ib ≤ In ≤ Iz", async ({ page }) => {
  await openCalculators(page);
  await page.getByRole("button", { name: /^Dobór zabezpieczenia/ }).click();

  const result = page.locator(".pe-result").first();
  await expect(result).toContainText("B16 1P+N");
  await expect(result).toContainText("Ib 8.70 A");
  await expect(result).toContainText("Iz 23 A");
  await expect(result).toContainText("metoda B2");

  await expect(page.getByText(/Warunek doboru spełniony/)).toBeVisible();
  await expect(page.getByText("8.70 A ≤ 16 A ≤ 23 A")).toBeVisible();
});

test("zbyt cienki przewód do danego prądu to BŁĄD doboru zabezpieczenia, nie cichy większy wyłącznik", async ({ page }) => {
  await openCalculators(page);
  await page.getByRole("button", { name: /^Dobór zabezpieczenia/ }).click();

  // 1,5 mm² pod tynkiem (B2) = 16,5 A; 6000 W / 230 V = 26,1 A > Iz
  await page.getByLabel("Przekrój żyły przewodu").selectOption("1.5");
  await page.getByLabel("Moc odbiornika").fill("6000");

  await expect(page.locator(".pe-result").first()).toContainText("nie udało się dobrać");
  await expect(page.getByText(/Żaden wyłącznik tego nie naprawi/)).toBeVisible();
});

/**
 * Trzy pierwsze kalkulatory to trzy różne pytania o ten sam obwód i łatwo je
 * zlać w jedno przy kolejnej zmianie. Test przybija kolejność i role:
 *  1. Spadek napięcia   — przekrój DANY, liczymy ΔU
 *  2. Dobór przekroju   — przekrój WYNIKIEM (obciążalność + spadek naraz)
 *  3. Dobór zabezpieczenia — przekrój DANY, wynikiem jest aparat
 * Kalkulator spadku wrócił jako osobna pozycja po tym, jak w kroku 77
 * (MIGRATION.md) skasowano jego poprzednika — tamten dublował dobór przewodu
 * z własną, błędną kopią wzoru (ρ dla 20 °C), ten korzysta z `voltageDropPct`.
 */
test("trzy pierwsze kalkulatory stoją w kolejności spadek → przekrój → zabezpieczenie i mają rozdzielone role", async ({ page }) => {
  await openCalculators(page);

  const pozycje = page.locator("button", { hasText: /^(Spadek napięcia|Dobór przekroju przewodu|Dobór zabezpieczenia)/ });
  await expect(pozycje.nth(0)).toContainText("Spadek napięcia");
  await expect(pozycje.nth(1)).toContainText("Dobór przekroju przewodu");
  await expect(pozycje.nth(2)).toContainText("Dobór zabezpieczenia");

  // w doborze PRZEKROJU przekrój jest wynikiem, więc nie ma go wśród pól wejściowych
  await expect(page.getByRole("heading", { name: "Dobór przekroju przewodu" })).toBeVisible();
  await expect(page.getByLabel("Przekrój żyły")).toHaveCount(0);

  // w obu pozostałych jest polem WEJŚCIOWYM — to je odróżnia
  await page.getByRole("button", { name: /^Spadek napięcia/ }).click();
  await expect(page.getByLabel("Przekrój żyły")).toBeVisible();

  await page.getByRole("button", { name: /^Dobór zabezpieczenia/ }).click();
  await expect(page.getByLabel("Przekrój żyły przewodu")).toBeVisible();
});

/**
 * Wynik musi zgadzać się co do drugiego miejsca po przecinku z `voltageDropPct`
 * (`lib/panel/sizing.ts`), czyli z ρ = 0,0225 dla 70 °C. Gdyby ktoś kiedyś wpiął
 * tu z powrotem wzór z ρ = 0,0175 (20 °C), wynik spadłby do ~1,52% i test padnie.
 * Domyślne dane: 10 A, 1-fazowe, 25 m, 2,5 mm² -> (2·25·10·0,0225)/2,5 = 4,5 V
 * -> 4,5/230 = 1,957% -> przy limicie 3% warunek jest spełniony.
 */
test("spadek napięcia liczy się rezystywnością dla 70°C — te same liczby co Rozdzielnica", async ({ page }) => {
  await openCalculators(page);
  await page.getByRole("button", { name: /^Spadek napięcia/ }).click();

  const result = page.locator(".pe-result").first();
  await expect(result).toContainText("1.96 %");
  await expect(result).toContainText("4.5 V");
  await expect(result).toContainText("225.5 V");
  await expect(page.getByText(/Warunek spełniony/)).toBeVisible();
});

test("za mały przekrój na długiej trasie podpowiada konkretny przekrój zamiast samego „nie spełnia”", async ({ page }) => {
  await openCalculators(page);
  await page.getByRole("button", { name: /^Spadek napięcia/ }).click();

  // 16 A na 60 m przy 1,5 mm²: (2·60·16·0,0225)/1,5 = 28,8 V = 12,52% >> 3%
  await page.getByLabel("Prąd obciążenia (Ib)").fill("16");
  await page.getByLabel("Długość trasy (w jedną stronę)").fill("60");
  await page.getByLabel("Przekrój żyły").selectOption("1.5");

  await expect(page.getByText(/Warunek niespełniony/)).toBeVisible();
  // 6 mm² daje jeszcze 3,13% (za dużo), 10 mm² już 1,88% — stąd 10 jako pierwszy,
  // który wchodzi w limit. Test pilnuje, że podpowiedź liczy się z tego samego
  // szeregu przekrojów co dobór (SECTIONS), a nie zaokrągla „na oko".
  await expect(page.getByText(/Najmniejszy przekrój.*10 mm²/)).toBeVisible();
});

/**
 * Regresja: identyfikator aktywnego kalkulatora żyje w localStorage, więc po
 * aktualizacji aplikacji potrafi wskazywać pozycję, która JUŻ NIE ISTNIEJE —
 * tak było z „przewod" po rozbiciu go na „przekroj" i „zabezpieczenie".
 * `CALC_LIST.find(...)!` zwracało wtedy `undefined`, a odczyt `.label` wywalał
 * całą zakładkę białym ekranem — u każdego, kto korzystał z kalkulatorów przed
 * aktualizacją. Świeży localStorage tego nie pokazuje, stąd jawne zasianie
 * starej wartości.
 */
test("zapisany identyfikator kalkulatora sprzed aktualizacji nie wywraca zakładki", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() =>
    localStorage.setItem(
      "pomocnikelektryka_kalkulatory",
      JSON.stringify({ state: { activeCalc: "przewod" }, version: 0 })
    )
  );
  await page.reload();
  await page.getByRole("button", { name: "Kalkulatory", exact: true }).click();

  // zamiast białego ekranu — cofnięcie do pierwszej pozycji z listy
  await expect(page.getByRole("heading", { name: "Spadek napięcia" })).toBeVisible();
  await expect(page.locator(".pe-result").first()).toBeVisible();
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
