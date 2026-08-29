/**
 * Tablice normatywne do doboru przewodów i zabezpieczeń — PN-HD 60364-5-52
 * (obciążalność, współczynniki poprawkowe) oraz PN-HD 60364-4-41 (samoczynne
 * wyłączenie zasilania).
 *
 * Dlaczego osobny plik z samymi danymi: liczby z normy mają być JEDNYM źródłem
 * prawdy i muszą dać się sprawdzić z tablicą w ręku, bez czytania logiki doboru.
 * Logika mieszka w `sizing.ts` i tylko z tych tablic korzysta — nigdy nie wpisuje
 * wartości „z głowy".
 *
 * UWAGA: tablice obejmują miedź w izolacji PVC (przewody YDY/YDYp — w praktyce
 * domowej to ~wszystko). Dla XLPE/gumy wartości są WYŻSZE, więc użycie tych
 * tablic jest wtedy bezpieczne (zaniżone), ale nieoptymalne.
 */
import { TEMP_PRACY, rezystywnoscRobocza } from "@/lib/norms/conductors";


/** Metoda odniesienia wg PN-HD 60364-5-52 tabl. B.52.1 — decyduje o odprowadzaniu ciepła. */
export type ReferenceMethod = "A1" | "A2" | "B1" | "B2" | "C";

/** Sposób ułożenia w języku użytkownika — mapowany na metodę odniesienia niżej. */
export type LayingMethod = "w_scianie" | "w_scianie_ocieplonej" | "w_rurce" | "natynkowo";

/**
 * Mapowanie sposobu ułożenia na metodę odniesienia z normy.
 *
 * To jest ZAŁOŻENIE INŻYNIERSKIE, nie cytat z normy, więc stoi tu jawnie zamiast
 * być zaszyte w kodzie doboru:
 * - `w_scianie` → B2: przewód wielożyłowy pod tynkiem w ścianie murowanej. Typowy
 *   polski dom; ciepło odbiera mur.
 * - `w_scianie_ocieplonej` → A1: ściana z izolacją termiczną (styropian/wełna)
 *   praktycznie nie odbiera ciepła — najostrzejszy przypadek, stąd osobna pozycja.
 *   Pomylenie tych dwóch to najczęstszy sposób na przegrzanie przewodu w domu
 *   energooszczędnym, dlatego użytkownik musi wybrać świadomie.
 * - `w_rurce` → B1: żyły w rurce instalacyjnej na/w ścianie.
 * - `natynkowo` → C: przewód mocowany bezpośrednio do ściany, chłodzony powietrzem.
 */
export const REFERENCE_METHOD_FOR: Record<LayingMethod, ReferenceMethod> = {
  w_scianie: "B2",
  w_scianie_ocieplonej: "A1",
  w_rurce: "B1",
  natynkowo: "C",
};

export const LAYING_METHOD_LABELS: Record<LayingMethod, string> = {
  w_scianie: "pod tynkiem (ściana murowana)",
  w_scianie_ocieplonej: "w ścianie izolowanej termicznie",
  w_rurce: "w rurce instalacyjnej",
  natynkowo: "natynkowo",
};

/** Przekroje żył [mm²] w kolejności rosnącej — dozwolone w doborze. */
export const SECTIONS = [1.5, 2.5, 4, 6, 10, 16, 25] as const;
export type Section = (typeof SECTIONS)[number];

/**
 * Obciążalność długotrwała Iz [A] — miedź, izolacja PVC, temperatura otoczenia 30 °C,
 * PN-HD 60364-5-52 tabl. B.52.4.
 *
 * Rozbite na 2 i 3 żyły obciążone, bo to potrafi zmienić wynik o stopień przekroju:
 * obwód 3-fazowy grzeje się mocniej niż 1-fazowy przy tym samym przekroju.
 */
type AmpacityRow = Record<ReferenceMethod, number>;

const AMPACITY_2_LOADED: Record<Section, AmpacityRow> = {
  1.5: { A1: 14.5, A2: 14, B1: 17.5, B2: 16.5, C: 19.5 },
  2.5: { A1: 19.5, A2: 18.5, B1: 24, B2: 23, C: 27 },
  4: { A1: 26, A2: 25, B1: 32, B2: 30, C: 36 },
  6: { A1: 34, A2: 32, B1: 41, B2: 38, C: 46 },
  10: { A1: 46, A2: 43, B1: 57, B2: 52, C: 63 },
  16: { A1: 61, A2: 57, B1: 76, B2: 69, C: 85 },
  25: { A1: 80, A2: 75, B1: 101, B2: 90, C: 112 },
};

const AMPACITY_3_LOADED: Record<Section, AmpacityRow> = {
  1.5: { A1: 13.5, A2: 13, B1: 15.5, B2: 15, C: 17.5 },
  2.5: { A1: 18, A2: 17.5, B1: 21, B2: 20, C: 24 },
  4: { A1: 24, A2: 23, B1: 28, B2: 27, C: 32 },
  6: { A1: 31, A2: 29, B1: 36, B2: 34, C: 41 },
  10: { A1: 42, A2: 39, B1: 50, B2: 46, C: 57 },
  16: { A1: 56, A2: 52, B1: 68, B2: 62, C: 76 },
  25: { A1: 73, A2: 68, B1: 89, B2: 80, C: 96 },
};

/** Obciążalność bazowa (przed współczynnikami) dla danego przekroju i metody. */
export function baseAmpacity(section: Section, method: ReferenceMethod, loadedCores: 2 | 3): number {
  const table = loadedCores === 3 ? AMPACITY_3_LOADED : AMPACITY_2_LOADED;
  return table[section][method];
}

/**
 * Współczynnik temperaturowy k1 — PN-HD 60364-5-52 tabl. B.52.14, izolacja PVC,
 * otoczenie powietrze. Wartości pośrednie interpolowane liniowo, bo użytkownik
 * może podać dowolną temperaturę (np. 28 °C), a zaokrąglanie w górę do 30 °C
 * niepotrzebnie zaniżałoby wynik.
 */
const TEMP_FACTORS: [tempC: number, k: number][] = [
  [10, 1.22],
  [15, 1.17],
  [20, 1.12],
  [25, 1.06],
  [30, 1.0],
  [35, 0.94],
  [40, 0.87],
  [45, 0.79],
  [50, 0.71],
  [55, 0.61],
  [60, 0.5],
];

export function temperatureFactor(ambientC: number): number {
  const first = TEMP_FACTORS[0];
  const last = TEMP_FACTORS[TEMP_FACTORS.length - 1];
  if (ambientC <= first[0]) return first[1];
  if (ambientC >= last[0]) return last[1];
  for (let i = 0; i < TEMP_FACTORS.length - 1; i++) {
    const [t0, k0] = TEMP_FACTORS[i];
    const [t1, k1] = TEMP_FACTORS[i + 1];
    if (ambientC >= t0 && ambientC <= t1) {
      const ratio = (ambientC - t0) / (t1 - t0);
      return k0 + ratio * (k1 - k0);
    }
  }
  return 1;
}

/**
 * Współczynnik grupowania k2 — PN-HD 60364-5-52 tabl. B.52.17, wiązka wielożyłowa
 * lub kilka obwodów w jednej rurce/korycie. Liczy się LICZBA OBWODÓW w wiązce,
 * nie liczba żył.
 */
const GROUPING_FACTORS: [circuits: number, k: number][] = [
  [1, 1.0],
  [2, 0.8],
  [3, 0.7],
  [4, 0.65],
  [5, 0.6],
  [6, 0.57],
  [7, 0.54],
  [8, 0.52],
  [9, 0.5],
  [12, 0.45],
  [16, 0.41],
  [20, 0.38],
];

export function groupingFactor(circuitsInBundle: number): number {
  if (circuitsInBundle <= 1) return 1;
  const last = GROUPING_FACTORS[GROUPING_FACTORS.length - 1];
  if (circuitsInBundle >= last[0]) return last[1];
  // schodkowo w dół: dla 10 obwodów obowiązuje wartość z wiersza 9, nie interpolacja
  let k = 1;
  for (const [n, factor] of GROUPING_FACTORS) {
    if (circuitsInBundle >= n) k = factor;
  }
  return k;
}

/** Znormalizowane prądy znamionowe wyłączników nadprądowych [A] (szereg domowy). */
export const BREAKER_RATINGS = [6, 10, 13, 16, 20, 25, 32, 40, 50, 63] as const;

/** Charakterystyka wyzwalacza magnetycznego i jej krotność (Ia = k × In). */
export type Curve = "B" | "C" | "D";
export const CURVE_MULTIPLIER: Record<Curve, number> = { B: 5, C: 10, D: 20 };

/**
 * Dopuszczalny spadek napięcia — PN-HD 60364-5-52 zał. G (wartości zalecane,
 * liczone od złącza do odbiornika).
 */
export const MAX_VOLTAGE_DROP_PCT = { oswietlenie: 3, inne: 5 } as const;

/**
 * Rezystywność miedzi w warunkach ruchowych [Ω·mm²/m] — do spadku napięcia.
 *
 * NIE 0,0175 (to wartość dla 20 °C): spadek napięcia liczy się przy przewodzie
 * nagrzanym prądem roboczym, inaczej wynik jest zaniżony o ~28% i obwód przechodzi
 * kontrolę, której realnie nie spełnia.
 *
 * WYPROWADZONA, nie wpisana ręcznie: to uproszczenie z PN-HD 60364-5-52 zał. G
 * (1,25 × ρ₂₀ przy γ₂₀ = 56), liczone w `lib/norms/conductors.ts`. Wcześniej
 * stała była tu wpisana jako 0,0225 — zaokrąglenie tej samej wartości — przez co
 * kalkulatory inżynierskie i dobór obwodów liczyły spadek dwiema różnymi
 * liczbami. Różnica sięgała 5% i na styku limitu dawała inny przekrój, więc
 * jedno źródło prawdy jest tu warunkiem, żeby obie części aplikacji nie
 * przeczyły sobie nawzajem.
 */
export const RHO_CU_70C = rezystywnoscRobocza("Cu", "annexG", TEMP_PRACY.PVC);

/**
 * Maksymalna impedancja pętli zwarcia Zs [Ω] wynika z warunku samoczynnego
 * wyłączenia (PN-HD 60364-4-41): Zs ≤ U0 / Ia. W układzie TN czas wyłączenia
 * ≤ 0,4 s dla obwodów końcowych ≤ 32 A i ≤ 5 s dla rozdzielczych — w obu
 * przypadkach o zadziałaniu decyduje wyzwalacz magnetyczny, więc wzór jest ten sam.
 */
export const U0 = 230;
