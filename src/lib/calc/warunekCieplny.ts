import { C_NAPIECIOWE } from "@/lib/norms/conductors";
import { U0 } from "@/lib/panel/norms";

/**
 * Wytrzymałość zwarciowa cieplna przewodu (PN-HD 60364-4-43, 434.5.2) — ocena, która
 * NAJPIERW pyta, w jakiej strefie charakterystyki zadziała zabezpieczenie.
 *
 * Wzór adiabatyczny S ≥ Ik·√t/k jest poprawny, ale tylko z RZECZYWISTYM czasem trwania
 * zwarcia. Kalkulator podstawiał tu domyślnie 0,4 s — dopuszczalny czas wyłączenia
 * z tabl. 41.1, a nie czas zadziałania wyłącznika. Przy Ik ≥ Ia wyłącznik nadprądowy
 * działa elektromagnetycznie, w milisekundach, więc taki rachunek zawyżał wymagany
 * przekrój kilkukrotnie: B20 z Ik = 1000 A dostawał „2,5 mm² za mało, potrzeba 5,5 mm²
 * — obwód nie przejdzie odbioru", choć to zwyczajny, poprawny obwód.
 *
 * Dla czasów poniżej 0,1 s norma każe porównać k²S² z energią przenoszoną I²t podaną
 * przez producenta aparatu. Tej wartości nie da się tu wziąć z tablicy bez zgadywania
 * (zależy od aparatu, klasy ograniczenia energii i prądu zwarcia), więc kalkulator jej
 * nie wymyśla: pokazuje k²S² do porównania i ocenia warunek dopiero, gdy użytkownik
 * wpisze I²t z karty katalogowej.
 */

/** Czas, poniżej którego wzór adiabatyczny zastępuje się porównaniem z I²t aparatu. */
export const CZAS_STREFY_ELEKTROMAGNETYCZNEJ_S = 0.1;

export interface WarunekCieplnyWejscie {
  /** Prąd zwarcia [A]. */
  Ik_A: number;
  /** Rzeczywisty czas wyłączenia przy tym prądzie [s] — potrzebny tylko poza strefą elektromagnetyczną. */
  czas_s?: number;
  przekroj_mm2: number;
  /** Współczynnik k żyły (115 dla Cu/PVC). */
  k: number;
  /** Prąd zadziałania wyzwalacza elektromagnetycznego [A] (górna krotność). Brak = nieznany aparat. */
  Ia_A?: number | null;
  /** Energia przenoszona I²t aparatu z karty katalogowej [A²s]. */
  I2t_A2s?: number;
}

export type WarunekCieplnyWynik =
  | { tryb: "adiabatyczny"; minS_mm2: number; ok: boolean }
  | { tryb: "energia"; k2S2_A2s: number; I2t_A2s: number; ok: boolean }
  | { tryb: "brak_I2t"; k2S2_A2s: number }
  | { tryb: "brak_czasu" };

/** Czy zwarcie wypada w strefie wyzwalacza elektromagnetycznego (zadziałanie < 0,1 s). */
export function wStrefieElektromagnetycznej(Ik_A: number, Ia_A: number | null | undefined): boolean {
  return typeof Ia_A === "number" && Ia_A > 0 && Ik_A >= Ia_A;
}

export function ocenWarunekCieplny(w: WarunekCieplnyWejscie): WarunekCieplnyWynik {
  const k2S2 = (w.k * w.przekroj_mm2) ** 2;
  if (wStrefieElektromagnetycznej(w.Ik_A, w.Ia_A)) {
    if (typeof w.I2t_A2s === "number" && w.I2t_A2s > 0) {
      return { tryb: "energia", k2S2_A2s: k2S2, I2t_A2s: w.I2t_A2s, ok: k2S2 >= w.I2t_A2s };
    }
    return { tryb: "brak_I2t", k2S2_A2s: k2S2 };
  }
  if (!(typeof w.czas_s === "number" && w.czas_s > 0)) return { tryb: "brak_czasu" };
  const minS = (w.Ik_A * Math.sqrt(w.czas_s)) / w.k;
  return { tryb: "adiabatyczny", minS_mm2: minS, ok: w.przekroj_mm2 >= minS };
}

/**
 * Najmniejszy spodziewany prąd zwarcia L-PE z impedancji pętli: Ik = Cmin·U₀/Zs.
 * Ten sam współczynnik 0,95, z którym liczone jest Zs max (`zsMaxDlaIa`) — Ik i Zs
 * w jednym kalkulatorze nie mogą wynikać z dwóch różnych założeń o napięciu.
 */
export function ikZImpedancjiPetli(Zs_Ohm: number): number {
  return Zs_Ohm > 0 ? (C_NAPIECIOWE.min * U0) / Zs_Ohm : 0;
}

/** Względna rozbieżność, powyżej której podany Ik i podana Zs przeczą sobie nawzajem. */
export const TOLERANCJA_IK_ZS = 0.2;
