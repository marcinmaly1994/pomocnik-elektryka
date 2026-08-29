/**
 * Wspólne dane materiałowe przewodów — konduktywność, poprawka temperaturowa,
 * reaktancja jednostkowa, współczynnik `k` wytrzymałości zwarciowej cieplnej.
 *
 * Osobny moduł od `lib/panel/norms.ts` z konkretnego powodu, a nie dla porządku:
 * tamten trzyma TABLICE OBCIĄŻALNOŚCI zweryfikowane dla wąskiego zakresu
 * używanego przez dobór obwodów domowych (miedź, PVC, 1,5–25 mm², metody
 * A1/A2/B1/B2/C). Ten trzyma wielkości MATERIAŁOWE, które są wspólne dla
 * wszystkich kalkulatorów inżynierskich i obejmują też aluminium i XLPE.
 * Zlanie obu skusiłoby do „dopisania brakujących wierszy z pamięci" do tablic
 * normatywnych — czego robić nie wolno (patrz `OSTRZEZENIE_ZAKRES` niżej).
 *
 * UWAGA co do spójności z istniejącym doborem: `lib/panel/norms.ts` liczy spadek
 * napięcia stałą `RHO_CU_70C = 0,0225 Ω·mm²/m` (γ ≈ 44,4). Model temperaturowy
 * poniżej daje dla miedzi przy 70 °C γ ≈ 46,8 (ρ ≈ 0,02137). Różnica ~5% bierze
 * się stąd, że 0,0225 to wartość praktyczna „z zapasem", a nie wynik przeliczenia
 * γ₂₀ = 56 wzorem temperaturowym. Oba podejścia są spotykane; NIE scalam ich
 * po cichu, bo zmiana stałej w `norms.ts` przeliczyłaby dobory w całej zakładce
 * Rozdzielnica. Wymaga świadomej decyzji — patrz raport dla użytkownika.
 */

export type Material = "Cu" | "Al";
export type Izolacja = "PVC" | "XLPE";

/**
 * Konduktywność w 20 °C [m/(Ω·mm²)] — wartości ze specyfikacji zadania,
 * standardowe dla przewodów instalacyjnych.
 */
export const GAMMA_20: Record<Material, number> = { Cu: 56, Al: 35 };

/** Temperaturowy współczynnik rezystancji [1/K]. */
export const ALFA: Record<Material, number> = { Cu: 0.00393, Al: 0.00403 };

/** Dopuszczalna temperatura pracy żyły wg rodzaju izolacji [°C]. */
export const TEMP_PRACY: Record<Izolacja, number> = { PVC: 70, XLPE: 90 };

/**
 * Rezystywność w temperaturze θ: ρ(θ) = ρ₂₀·[1 + α·(θ − 20)].
 * Zwraca [Ω·mm²/m].
 */
export function rezystywnosc(material: Material, tempC: number): number {
  const rho20 = 1 / GAMMA_20[material];
  return rho20 * (1 + ALFA[material] * (tempC - 20));
}

/** Konduktywność w temperaturze θ [m/(Ω·mm²)] — odwrotność `rezystywnosc`. */
export function konduktywnosc(material: Material, tempC: number): number {
  return 1 / rezystywnosc(material, tempC);
}

/**
 * Rezystancja żyły [Ω] dla długości L [m] i przekroju S [mm²].
 * `rownolegle` — liczba przewodów równoległych (dzieli rezystancję).
 */
export function rezystancjaZyly(args: {
  dlugosc_m: number;
  przekroj_mm2: number;
  material: Material;
  tempC: number;
  rownolegle?: number;
}): number {
  const n = args.rownolegle && args.rownolegle > 0 ? args.rownolegle : 1;
  return (rezystywnosc(args.material, args.tempC) * args.dlugosc_m) / (args.przekroj_mm2 * n);
}

/**
 * Domyślna reaktancja jednostkowa X' [Ω/km] wg rodzaju linii (spec pkt 4).
 * Parametr edytowalny — dla kabli jednożyłowych i linii gołych realna wartość
 * zależy od rozstawu żył, więc podana jest środkiem widełek z zakresu.
 */
export type RodzajLinii = "kabel_wielozylowy" | "kabel_jednozylowy" | "napowietrzna_izolowana" | "napowietrzna_gola";

export const X_JEDNOSTKOWA_OHM_KM: Record<RodzajLinii, number> = {
  kabel_wielozylowy: 0.08,
  kabel_jednozylowy: 0.125, // widełki 0,10–0,15
  napowietrzna_izolowana: 0.1,
  napowietrzna_gola: 0.35, // widełki 0,30–0,40
};

export const RODZAJ_LINII_LABELS: Record<RodzajLinii, string> = {
  kabel_wielozylowy: "kabel wielożyłowy",
  kabel_jednozylowy: "kable jednożyłowe",
  napowietrzna_izolowana: "linia napowietrzna izolowana",
  napowietrzna_gola: "linia napowietrzna goła",
};

/**
 * Przekrój, powyżej którego metoda uproszczona (sama rezystancja) jest
 * NIEDOPUSZCZALNA — spec pkt 7: reaktancja przestaje być pomijalna.
 */
export const MIN_PRZEKROJ_Z_REAKTANCJA_MM2 = 35;

/**
 * Współczynnik `k` do sprawdzenia wytrzymałości zwarciowej cieplnej
 * (PN-HD 60364-4-43): S ≥ I·√t / k. Wartości ze specyfikacji zadania.
 */
export const K_ZYLA: Record<Material, Record<Izolacja, number>> = {
  Cu: { PVC: 115, XLPE: 143 },
  Al: { PVC: 76, XLPE: 94 },
};

/**
 * Współczynnik napięciowy c wg PN-EN 60909-0 dla nn 230/400 V.
 *
 * Rozdzielone jawnie, bo mieszanie ich między kalkulatorami jest wprost
 * zakazane (spec pkt 7): `max` do doboru zdolności zwarciowej aparatów
 * (najgorszy przypadek = największy prąd), `min` do sprawdzania skuteczności
 * ochrony przeciwporażeniowej (najgorszy przypadek = najmniejszy prąd zwarcia).
 */
export const C_NAPIECIOWE = { max: 1.05, min: 0.95 } as const;

/**
 * Minimalny przekrój przewodu ochronnego PE wg PN-HD 60364-5-54
 * (dobór wg przekroju przewodu fazowego, gdy PE jest z tego samego materiału).
 */
export function minPrzekrojPE(przekrojFazowy_mm2: number): number {
  if (przekrojFazowy_mm2 <= 16) return przekrojFazowy_mm2;
  if (przekrojFazowy_mm2 <= 35) return 16;
  return przekrojFazowy_mm2 / 2;
}

/**
 * Maksymalne czasy wyłączenia wg PN-HD 60364-4-41 tabl. 41.1 dla U₀ = 230 V.
 * `obwodOdbiorczy` = obwód końcowy o prądzie znamionowym ≤ 63 A.
 */
export type UkladSieci = "TN" | "TT" | "IT";

export function maksCzasWylaczenia_s(uklad: UkladSieci, obwodOdbiorczy: boolean): number {
  if (uklad === "TT") return obwodOdbiorczy ? 0.2 : 1;
  return obwodOdbiorczy ? 0.4 : 5; // TN oraz IT (drugie zwarcie) — tak samo
}

/**
 * Krotności prądu wyzwalacza magnetycznego wyłączników wg PN-EN 60898-1.
 *
 * Do sprawdzeń OCHRONNYCH wolno przyjmować wyłącznie `gora` (spec pkt 7:
 * „nie przyjmować dolnej krotności"). `dol` jest tu wyłącznie po to, żeby dało
 * się pokazać użytkownikowi całe pasmo wyzwalania i wyjaśnić, skąd bierze się
 * wybór wartości górnej.
 */
export const KROTNOSC_MAGNETYCZNA: Record<"B" | "C" | "D", { dol: number; gora: number }> = {
  B: { dol: 3, gora: 5 },
  C: { dol: 5, gora: 10 },
  D: { dol: 10, gora: 20 },
};

/**
 * Komunikat używany wszędzie tam, gdzie dane wejściowe wychodzą poza zakres
 * WBUDOWANYCH tablic. Powód istnienia: specyfikacja zabrania ekstrapolacji i
 * zgadywania wartości tablicowych — brak danych ma kończyć się twardym błędem,
 * bo cicho zgadnięta obciążalność albo prąd zadziałania jest gorsza niż brak
 * wyniku: wygląda tak samo wiarygodnie jak wartość z normy.
 */
export const OSTRZEZENIE_ZAKRES =
  "Dane wykraczają poza zakres wbudowanych tablic normatywnych. Kalkulator nie ekstrapoluje — uzupełnij tablicę o wartości z normy albo skorzystaj z pełnego oprogramowania projektowego.";
