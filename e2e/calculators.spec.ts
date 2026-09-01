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
  await expect(result).toContainText("B16 1P");
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
 * Domyślnym modelem rezystywności jest UPROSZCZENIE PN-HD 60364-5-52 zał. G
 * (ρ = 1,25 · ρ₂₀), czyli dokładnie to, czym dobiera obwody zakładka Rozdzielnica.
 * Dzięki temu oba miejsca podają identyczny wynik — wymóg spójności krzyżowej
 * ze specyfikacji (pkt 6.5), pilnowany też jednostkowo w `calc/spojnosc.test.ts`.
 *
 * Domyślne dane: 10 A, 1-fazowe, 25 m, 2,5 mm², Cu
 * -> ρ = 1,25/56 = 0,0223214 -> ΔU = 2·(10·25)·0,0223214/2,5 = 4,46 V = 1,94%.
 */
test("spadek napięcia liczy domyślnie uproszczeniem zał. G — tak samo jak dobór obwodów", async ({ page }) => {
  await openCalculators(page);
  await page.getByRole("button", { name: /^Spadek napięcia/ }).click();

  const result = page.locator(".pe-result").first();
  await expect(result).toContainText("1,94 %");
  await expect(result).toContainText("4,46 V");
  await expect(result).toContainText("225,5 V");
  await expect(page.getByText(/Warunek spełniony/)).toBeVisible();
  // rachunek pokazuje WPROST, skąd wzięła się rezystywność
  await expect(page.getByText("ρ = 1,25 · ρ₂₀")).toBeVisible();
});

/**
 * Model temperaturowy jest dostępny (spec pkt 4 go wymaga), ale jako WYBÓR —
 * jest ok. 5% mniej konserwatywny, więc przełączenie musi być świadome i musi
 * być widoczne w założeniach.
 */
test("model temperaturowy da się wybrać i jest opisany jako mniej konserwatywny", async ({ page }) => {
  await openCalculators(page);
  await page.getByRole("button", { name: /^Spadek napięcia/ }).click();

  await page.getByLabel("Model rezystywności").selectOption("temperaturowy");
  const result = page.locator(".pe-result").first();
  await expect(result).toContainText("1,86 %");
  await expect(result).toContainText("4,27 V");
  await expect(page.getByText(/mniej konserwatywne/)).toBeVisible();
});

test("za mały przekrój na długiej trasie podpowiada konkretny przekrój zamiast samego „nie spełnia”", async ({ page }) => {
  await openCalculators(page);
  await page.getByRole("button", { name: /^Spadek napięcia/ }).click();

  // 16 A na 60 m przy 1,5 mm²: 2·(16·60)·0,0223214/1,5 = 28,6 V = 12,42% >> 3%
  await page.getByLabel("Prąd obciążenia (Ib)").fill("16");
  await page.getByLabel("Długość trasy (w jedną stronę)").fill("60");
  await page.getByLabel("Przekrój żyły").selectOption("1.5");

  await expect(page.getByText(/Warunek niespełniony/)).toBeVisible();
  // 6 mm² daje 3,11% (za dużo), 10 mm² już 1,86% — ten sam przekrój, który wybrałby
  // dobór obwodów. To jest dokładnie ten przypadek, w którym stary rozjazd między
  // silnikami dawał 6 mm² w kalkulatorze i 10 mm² w Rozdzielnicy.
  await expect(page.locator(".pe-result").first()).toContainText("min. przekrój w limicie 10 mm²");
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

/**
 * Kalkulatory inżynierskie (`src/lib/calc/*`) mają komplet testów jednostkowych
 * z wartościami policzonymi ręcznie. Tu sprawdzamy WPIĘCIE: że zakładka woła ten
 * silnik i pokazuje pełną kopertę wyniku wymaganą przez specyfikację — rachunek
 * krok po kroku z podstawionymi wartościami, ocenę warunku, założenia i źródła.
 */
test("prądy zwarciowe: domyślny transformator 630 kVA / uk 4% daje Ik3 ≈ 23,9 kA i wymaganą Icn", async ({ page }) => {
  await openCalculators(page);
  await page.getByRole("button", { name: /^Prądy zwarciowe/ }).click();

  const result = page.locator(".pe-result").first();
  await expect(result).toContainText("23,87 kA");
  await expect(result).toContainText("Zt 10,16 mΩ");
  await expect(result).toContainText("c = 1,05");
  await expect(page.getByText(/Icn ≥/)).toBeVisible();
});

test("współczynnik napięciowy c wynika z CELU obliczenia i nie da się go pomylić", async ({ page }) => {
  await openCalculators(page);
  await page.getByRole("button", { name: /^Prądy zwarciowe/ }).click();

  await expect(page.locator(".pe-result").first()).toContainText("c = 1,05");
  await page.getByLabel("Cel obliczenia").selectOption("ochrona_przeciwporazeniowa");
  await expect(page.locator(".pe-result").first()).toContainText("c = 0,95");
  // do ochrony liczymy przypadek NAJMNIEJSZEGO prądu — musi wyjść mniej niż 23,87 kA
  await expect(page.locator(".pe-result").first()).toContainText("21,60 kA");
});

test("kompensacja mocy biernej: 100 kW, cosφ 0,80 → 0,95 daje 42,13 kvar", async ({ page }) => {
  await openCalculators(page);
  await page.getByRole("button", { name: /^Kompensacja mocy biernej/ }).click();

  const result = page.locator(".pe-result").first();
  await expect(result).toContainText("42,13 kvar");
  await expect(result).toContainText("tgφ₁ = 0,750");
  await expect(result).toContainText("tgφ₂ = 0,329");
  // bez podanej mocy zwarciowej kalkulator MÓWI WPROST, że rezonansu nie sprawdzono
  await expect(page.getByText(/NIE sprawdzono ryzyka rezonansu/)).toBeVisible();
});

test("wynik pokazuje rachunek krok po kroku z podstawionymi wartościami, założenia i źródła", async ({ page }) => {
  await openCalculators(page);
  await page.getByRole("button", { name: /^Spadek napięcia/ }).click();

  await expect(page.getByText("Rachunek krok po kroku")).toBeVisible();
  // wzór ogólny ORAZ ten sam wzór z liczbami — to jest sedno wymagania
  await expect(page.getByText("ρ = 1,25 · ρ₂₀")).toBeVisible();
  await expect(page.getByText("ΔU% = ΔU / U · 100%")).toBeVisible();
  await expect(page.getByText("Przyjęte założenia")).toBeVisible();
  await expect(page.getByText(/PN-HD 60364-5-52/).first()).toBeVisible();
  await expect(page.getByText(/Nie zastępuje projektu ani sprawdzenia/).first()).toBeVisible();
});

/**
 * Spec pkt 7 zabrania metody uproszczonej dla przekrojów ≥ 35 mm² — i ma to być
 * TWARDY BŁĄD, nie ostrzeżenie obok policzonej mimo wszystko liczby.
 */
test("metoda uproszczona dla 50 mm² blokuje wynik zamiast go zaniżyć", async ({ page }) => {
  await openCalculators(page);
  await page.getByRole("button", { name: /^Spadek napięcia/ }).click();

  await page.getByLabel("Przekrój żyły").selectOption("50");
  await expect(page.getByText(/metoda uproszczona jest niedopuszczalna/i)).toBeVisible();
  await expect(page.locator(".pe-result")).toHaveCount(0);

  // włączenie reaktancji odblokowuje rachunek
  await page.getByLabel(/Uwzględnij reaktancję/).check();
  await expect(page.locator(".pe-result").first()).toBeVisible();
});

test("uziom pionowy: R = ρ/(2πL)·ln(4L/d) i potrzebna długość dla wymagania", async ({ page }) => {
  await openCalculators(page);
  await page.getByRole("button", { name: /^Uziom — dobór geometrii/ }).click();

  // 100 Ω·m, pręt 3 m ⌀16 mm: 100/(2π·3)·ln(750) = 35,12 Ω
  const result = page.locator(".pe-result").first();
  await expect(result).toContainText("35,12 Ω");
  await expect(result).toContainText("długość dla 30 Ω");
  // tablica rezystywności jest ORIENTACYJNA i kalkulator musi to mówić wprost
  await expect(page.getByText(/POMIAR rezystywności gruntu/)).toBeVisible();
});

/**
 * Sedno kalkulatora bilansu: przy odbiorach nieliniowych 3. harmoniczna sumuje
 * się w przewodzie N arytmetycznie i potrafi przekroczyć prąd fazowy. W przewodzie
 * neutralnym nie ma wyłącznika, więc to przeciążenie nie ma czym się ujawnić —
 * dlatego musi być WERDYKTEM, nie notatką.
 */
test("bilans faz: 3. harmoniczna podnosi prąd w N ponad prąd fazowy i daje werdykt niespełniony", async ({ page }) => {
  await openCalculators(page);
  await page.getByRole("button", { name: /^Bilans faz i prąd w N/ }).click();

  const result = page.locator(".pe-result").first();
  await expect(result).toContainText("6,45 A");
  await expect(result).toContainText("asymetria 72,5%");

  await page.getByLabel("Udział 3. harmonicznej w prądzie fazowym").fill("50");
  await expect(result).toContainText("12,14 A");
  await expect(page.getByText(/PRZEKRACZA największy prąd fazowy/)).toBeVisible();
});

test("silnik: In = P/(√3·U·cosφ·η), a Y/Δ obniża prąd rozruchowy I moment do 1/3", async ({ page }) => {
  await openCalculators(page);
  await page.getByRole("button", { name: /^Silnik indukcyjny/ }).click();

  const result = page.locator(".pe-result").first();
  await expect(result).toContainText("10,61 A");
  await expect(result).toContainText("prąd rozruchowy 63,7 A");
  await expect(result).toContainText("moment 100% momentu przy DOL");

  await page.getByLabel("Sposób rozruchu").selectOption("gwiazda_trojkat");
  await expect(result).toContainText("prąd rozruchowy 21,2 A");
  await expect(result).toContainText("moment 33% momentu przy DOL");
  // cena za mniejszy prąd musi być powiedziana wprost
  await expect(page.getByText(/obniża MOMENT rozruchowy/)).toBeVisible();
});

test("silnik: spadek napięcia przy rozruchu ponad 15% to warunek niespełniony", async ({ page }) => {
  await openCalculators(page);
  await page.getByRole("button", { name: /^Silnik indukcyjny/ }).click();

  // bez impedancji kalkulator MÓWI, że tego nie sprawdził
  await expect(page.getByText(/NIE sprawdzono spadku napięcia przy rozruchu/)).toBeVisible();

  await page.getByLabel("Impedancja obwodu zasilającego (0 = pomiń)").fill("1");
  await expect(page.getByText(/Warunek niespełniony/)).toBeVisible();
  // pokazujemy skutek dla momentu, nie sam procent
  await expect(page.getByText(/moment ∝ U²/)).toBeVisible();
});

test("impedancja przewodu: R, X, Z oraz nierówny podział prądu między żyły równoległe", async ({ page }) => {
  await openCalculators(page);
  await page.getByRole("button", { name: /^Impedancja przewodu/ }).click();

  // 100 m, 16 mm² Cu przy 70 °C: R = 0,021366·100/16 = 0,1335 Ω
  const wyniki = page.locator(".pe-result");
  await expect(wyniki.first()).toContainText("R 0,1335 Ω");
  await expect(wyniki.first()).toContainText("γ 46,8 przy 70 °C");

  // żyły 40 i 60 m: prąd dzieli się 120/80 A, nie po równo 100/100
  await expect(wyniki.nth(1)).toContainText("podział 120,0 / 80,0 A");
  await expect(wyniki.nth(1)).toContainText("odchylenie 20,0%");
  // domyślnie Iz = 120 A, czyli DOKŁADNIE tyle, ile bierze krótsza żyła —
  // zerowy zapas to wynik graniczny, nie „spełniony"
  await expect(page.getByText(/Wynik graniczny/)).toBeVisible();

  // obniżenie obciążalności ujawnia przeciążenie, którego zabezpieczenie
  // nadprądowe nie wykryje, bo mierzy prąd całkowity (200 A dzielone na dwie żyły)
  await page.getByLabel("Obciążalność jednej żyły (0 = bez oceny)").fill("110");
  await expect(page.getByText(/NIE wykryje/)).toBeVisible();
});

/**
 * PE ma dwa niezależne kryteria i obowiązuje ostrzejsze. Sama reguła
 * „PE = połowa fazowego" NIE gwarantuje wytrzymałości zwarciowej przy dużym
 * prądzie zwarcia — ten test pilnuje, że kalkulator liczy oba i mówi, które
 * zadecydowało.
 */
test("dobór PE: przy dużym prądzie zwarciowym decyduje warunek cieplny, nie reguła tabelaryczna", async ({ page }) => {
  await openCalculators(page);
  await page.getByRole("button", { name: /^Dobór przewodu PE i N/ }).click();

  const wynik = page.locator(".pe-result").first();
  await expect(wynik).toContainText("z reguły 10,0 mm²");
  await expect(wynik).toContainText("decyduje: reguła tabelaryczna");

  // 6 kA przez 0,4 s, Cu/PVC (k=115) → 33 mm², czyli więcej niż reguła
  await page.getByLabel("Prąd zwarcia doziemnego (0 = pomiń warunek cieplny)").fill("6000");
  await expect(wynik).toContainText("z warunku cieplnego 33,00 mm²");
  await expect(wynik).toContainText("decyduje: wytrzymałość zwarciowa cieplna");
  await expect(wynik).toContainText("35,0 mm²");
});

test("dobór N: udział 3. harmonicznej ponad 33% daje prąd w N większy od fazowego", async ({ page }) => {
  await openCalculators(page);
  await page.getByRole("button", { name: /^Dobór przewodu PE i N/ }).click();

  await page.getByLabel("Udział 3. harmonicznej").fill("40");
  // 3 · 0,4 · 32 A = 38,4 A > 32 A
  await expect(page.locator(".pe-result").nth(1)).toContainText("38,4 A");
  await expect(page.getByText(/przekracza prąd fazowy/)).toBeVisible();
  // nie proponuje przekroju mniejszego od fazowego i mówi dlaczego
  await expect(page.getByText(/NIE ma wbudowanych/)).toBeVisible();
});

test("SPD: skuteczny poziom ochrony to Up powiększone o spadek na przewodach", async ({ page }) => {
  await openCalculators(page);
  await page.getByRole("button", { name: /^Ochronniki przepięć/ }).click();

  const wynik = page.locator(".pe-result").first();
  await expect(wynik).toContainText("2000 V");
  await expect(wynik).toContainText("przyrost na przewodach 500 V");
  await expect(wynik).toContainText("maks. długość przewodów 1,00 m");
  await expect(page.getByText(/Warunek spełniony/)).toBeVisible();

  // za długie przewody wywracają ochronę mimo poprawnego Up
  await page.getByLabel("Długość przewodów przyłączeniowych (łącznie)").fill("1.5");
  await expect(wynik).toContainText("3000 V");
  await expect(page.getByText(/Warunek niespełniony/)).toBeVisible();
});

test("SPD: Up ≥ Uw to zły dobór ogranicznika, którego skracanie przewodów nie naprawi", async ({ page }) => {
  await openCalculators(page);
  await page.getByRole("button", { name: /^Ochronniki przepięć/ }).click();

  await page.getByLabel("Poziom ochrony Up (z tabliczki)").fill("2500");
  await expect(page.getByText(/Skrócenie przewodów tego nie naprawi/)).toBeVisible();
  await expect(page.locator(".pe-result")).toHaveCount(0);
});

/**
 * Moduł domyślny: Isc 10,5 A, Voc 41,5 V, 12 modułi w szeregu, β = −0,27%/°C.
 * Sprawdzone ręcznie w `pv.test.ts`: Voc(−15°C) ≈ 551,8 V, prąd projektowy = 1,25×10,5 = 13,13 A.
 */
test("PV: prąd projektowy stringu (1,25×Isc) i napięcie w zimnie liczą się poprawnie", async ({ page }) => {
  await openCalculators(page);
  await page.getByRole("button", { name: /^Instalacja fotowoltaiczna/ }).click();

  const result = page.locator(".pe-result").first();
  await expect(result).toContainText("551,8 V");
  await expect(result).toContainText("I projektowy (1,25×Isc) 13,13 A");
  // domyślny falownik (Voc max 600 V) daje zapas ~8% — to wynik GRANICZNY
  await expect(page.getByText(/Wynik graniczny/)).toBeVisible();
});

test("PV: za dużo modułów w szeregu przekracza Voc max falownika — błąd krytyczny, nie ostrzeżenie", async ({ page }) => {
  await openCalculators(page);
  await page.getByRole("button", { name: /^Instalacja fotowoltaiczna/ }).click();

  await page.getByLabel("Liczba modułów w szeregu").fill("16");
  await expect(page.getByText(/ryzyko zniszczenia falownika/)).toBeVisible();
  await expect(page.getByText(/Warunek niespełniony/)).toBeVisible();
});

test("PV: dolna granica MPPT w upale jest sprawdzana tylko po włączeniu opcji", async ({ page }) => {
  await openCalculators(page);
  await page.getByRole("button", { name: /^Instalacja fotowoltaiczna/ }).click();

  await expect(page.getByText(/Nie sprawdzono dolnej granicy/)).toBeVisible();
  await page.getByLabel(/Sprawdź też dolną granicę/).check();
  // 12 modułi × Vmpp(70°C) ≈ 363,7 V
  await expect(page.locator(".pe-result").first()).toContainText("Vmpp w upale 363,7 V");
});

test("PV: wyjście AC falownika korzysta z tego samego doboru co reszta aplikacji", async ({ page }) => {
  await openCalculators(page);
  await page.getByRole("button", { name: /^Instalacja fotowoltaiczna/ }).click();

  const wyniki = page.locator(".pe-result");
  await expect(wyniki.nth(1)).toContainText("YDYp 3x4 mm²");
  await expect(wyniki.nth(1)).toContainText("B25");
});

/**
 * Ładowarka domyślna: 7360 W, 1-fazowa, cosφ 1 → Ib = 32 A (typowy tryb 1 EVSE).
 */
test("EV: prąd ładowania i dobór przewodu przez ten sam silnik co inne obwody", async ({ page }) => {
  await openCalculators(page);
  await page.getByRole("button", { name: /^Ładowarka pojazdu/ }).click();

  const result = page.locator(".pe-result").first();
  await expect(result).toContainText("32,00 A");
  await expect(result).toContainText("YDYp 3x6 mm²");
  await expect(result).toContainText("B32");
});

test("EV: bez wbudowanej ochrony DC wymagany jest RCD typu B albo A+RDC-DD", async ({ page }) => {
  await openCalculators(page);
  await page.getByRole("button", { name: /^Ładowarka pojazdu/ }).click();

  await expect(page.locator(".pe-result").first()).toContainText("wymagany RCD typu B / A+RDC-DD");
  await expect(page.getByText(/NIE WYSTARCZA/)).toBeVisible();

  await page.getByLabel(/wbudowaną ochronę/).check();
  await expect(page.locator(".pe-result").first()).toContainText("RCD typu A wystarczy");
});

/**
 * Silnik `pelnyDoborPrzekroju` ma komplet testów jednostkowych z wartościami
 * potwierdzonymi ręcznie (w tym z użytkownikiem — dane tablic B.52.4/B.52.5
 * były weryfikowane komórka po komórce). Tu sprawdzamy WPIĘCIE: że zakładka
 * pokazuje wszystkie cztery kryteria i poprawnie wskazuje, które zadecydowało.
 */
test("pełny dobór: domyślne dane — o przekroju decyduje obciążalność, pozostałe kryteria nieocenione bez danych", async ({ page }) => {
  await openCalculators(page);
  await page.getByRole("button", { name: /^Pełny dobór/ }).click();

  const result = page.locator(".pe-result").first();
  await expect(result).toContainText("10,0 mm²");
  await expect(result).toContainText("decyduje: obciążalność długotrwała");
  await expect(result).toContainText("ochrona przeciwporażeniowa: nieocenione");
  await expect(result).toContainText("wytrzymałość zwarciowa cieplna: nieocenione");
});

test("pełny dobór: włączenie ochrony i wytrzymałości zwarciowej podnosi przekrój i zmienia decydujące kryterium", async ({ page }) => {
  await openCalculators(page);
  await page.getByRole("button", { name: /^Pełny dobór/ }).click();

  await page.getByLabel(/Sprawdź też ochronę przeciwporażeniową/).check();
  await page.getByLabel(/Sprawdź też wytrzymałość zwarciową/).check();

  const result = page.locator(".pe-result").first();
  await expect(result).toContainText("25,0 mm²");
  await expect(result).toContainText("decyduje: wytrzymałość zwarciowa cieplna");
  await expect(result).toContainText("ochrona przeciwporażeniowa: 2,5 mm²");
});

test("pełny dobór: obwody 1-fazowe są jawnie odrzucone — brak tablicy dla dwóch żył obciążonych", async ({ page }) => {
  await openCalculators(page);
  await page.getByRole("button", { name: /^Pełny dobór/ }).click();

  await expect(page.getByText(/Tylko obwody 3-fazowe/)).toBeVisible();
  await expect(page.getByText(/tablica dla dwóch żył obciążonych.*nie została jeszcze dostarczona/)).toBeVisible();
});

test("pełny dobór: metoda gruntowa (D2) pomija korektę temperatury/grupowania i mówi o tym wprost", async ({ page }) => {
  await openCalculators(page);
  await page.getByRole("button", { name: /^Pełny dobór/ }).click();

  await page.getByLabel("Metoda odniesienia").selectOption("D2");
  await expect(page.getByText(/Metoda gruntowa — bez korekty/)).toBeVisible();
  await expect(page.getByLabel("Temperatura otoczenia")).toHaveCount(0);
});

test("dobór wkładki gG: domyślne dane (D0gG, 16A, TN odbiorczy) — Imax i Zs max z tablicy Z.10.3", async ({ page }) => {
  await openCalculators(page);
  await page.getByRole("button", { name: /^Dobór wkładki gG/ }).click();

  const result = page.locator(".pe-result").first();
  await expect(result).toContainText("D0gG (wkładka gwintowa, system D0), In 16 A");
  await expect(result).toContainText("120,0 A");
  await expect(result).toContainText("1,920 Ω");
});

test("dobór wkładki gG: zmiana układu na TT-rozdzielczy zwraca błąd zamiast interpolacji (brak punktu 1s w tablicy)", async ({ page }) => {
  await openCalculators(page);
  await page.getByRole("button", { name: /^Dobór wkładki gG/ }).click();

  await page.getByLabel("Układ sieci").selectOption("TT");
  await page.getByLabel(/Obwód odbiorczy/).uncheck();

  await expect(page.getByText(/nie zawiera tego czasu/)).toBeVisible();
});

test("dobór wkładki gG: ocena warunku ochronnego wg zmierzonej Zs", async ({ page }) => {
  await openCalculators(page);
  await page.getByRole("button", { name: /^Dobór wkładki gG/ }).click();

  await page.getByLabel(/Oceń warunek ochronny/).check();
  await page.getByLabel(/Zmierzona impedancja pętli zwarcia/).fill("3");

  await expect(page.getByText(/przekracza dopuszczalne/)).toBeVisible();
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
  await page.getByRole("button", { name: "Instalacja", exact: true }).click();
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
  await page.getByRole("button", { name: "Instalacja", exact: true }).click();
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
