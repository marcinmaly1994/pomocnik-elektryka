/**
 * Charakterystyki czasowo-prądowe wkładek topikowych gG — „Poradnik Projektanta
 * Elektryka", tabl. Z.10.3 (D0gG) i Z.10.4 (WT00gG/WT1gG), z odwołaniem [58]
 * w bibliografii poradnika do normy źródłowej. To NIE jest strona normy wprost,
 * tylko wtórne opracowanie — stąd odwołanie do poradnika, a nie do PN-EN 60269
 * bezpośrednio.
 *
 * Dwa RÓŻNE systemy wkładek, nie jedna uniwersalna tablica dla „gG": przy tym
 * samym prądzie znamionowym D0gG i WT00gG/WT1gG mają INNE charakterystyki (np.
 * In=16 A: D0gG → Imax@0,2s=132,8 A, WT00gG → 120,0 A) — to realna różnica
 * konstrukcyjna między systemami wkładek, nie zaokrąglenie.
 *
 * Wartości zweryfikowane wewnętrzną spójnością fizyczną: Zkdop = U₀ / Imax dla
 * U₀ = 230 V, sprawdzone w teście dla KAŻDEGO wiersza obu tablic — to złapałoby
 * literówkę przy przepisywaniu.
 *
 * ZAKRES: tablice dają Imax dla t ≤ 0,2 s / 0,4 s / 5 s (plus umowny prąd
 * wyłączający I₂ dla t ≤ n godzin). BRAK punktu 0,1 s i punktu 1 s (obwody
 * rozdzielcze w układzie TT) — to pokrywa cały układ TN (0,4 s odbiorcze, 5 s
 * rozdzielcze) i obwody odbiorcze w układzie TT (0,2 s), ale NIE rozdzielcze TT.
 */

export type TypWkladkiGG = "D0gG" | "WT00gG_WT1gG";

export const TYP_WKLADKI_LABELS: Record<TypWkladkiGG, string> = {
  D0gG: "D0gG (wkładka gwintowa, system D0)",
  WT00gG_WT1gG: "WT00gG / WT1gG (wkładka nożowa)",
};

/** Czas, dla którego tablica podaje Imax/Zkdop — jedyne trzy dostępne punkty. */
export type CzasGG = "0.2" | "0.4" | "5";

export const CZAS_GG_LABELS: Record<CzasGG, string> = {
  "0.2": "0,2 s (TT, obwody odbiorcze)",
  "0.4": "0,4 s (TN, obwody odbiorcze)",
  "5": "5 s (TN, obwody rozdzielcze)",
};

export interface WierszGG {
  In_A: number;
  /** Umowny prąd wyłączający I₂ [A], ważny dla t ≤ n godzin. */
  I2_A: number;
  n_godz: number;
  k2: number;
  /** Imax, k (=Imax/In) i Zkdop [Ω] dla każdego z trzech czasów. */
  t02: { Imax_A: number; k: number; Zkdop_ohm: number };
  t04: { Imax_A: number; k: number; Zkdop_ohm: number };
  t5: { Imax_A: number; k: number; Zkdop_ohm: number };
}

const D0GG: WierszGG[] = [
  { In_A: 2, I2_A: 4.2, n_godz: 1, k2: 2.1, t02: { Imax_A: 20.0, k: 10.0, Zkdop_ohm: 11.5 }, t04: { Imax_A: 16.8, k: 8.4, Zkdop_ohm: 13.69 }, t5: { Imax_A: 9.6, k: 4.8, Zkdop_ohm: 23.95 } },
  { In_A: 4, I2_A: 8.4, n_godz: 1, k2: 2.1, t02: { Imax_A: 40.0, k: 10.0, Zkdop_ohm: 5.75 }, t04: { Imax_A: 32.8, k: 8.2, Zkdop_ohm: 7.01 }, t5: { Imax_A: 18.4, k: 4.6, Zkdop_ohm: 12.50 } },
  { In_A: 6, I2_A: 11.4, n_godz: 1, k2: 1.9, t02: { Imax_A: 60.6, k: 10.1, Zkdop_ohm: 3.79 }, t04: { Imax_A: 54.0, k: 9.0, Zkdop_ohm: 4.25 }, t5: { Imax_A: 28.2, k: 4.7, Zkdop_ohm: 8.15 } },
  { In_A: 10, I2_A: 19.0, n_godz: 1, k2: 1.9, t02: { Imax_A: 100.0, k: 10.0, Zkdop_ohm: 2.30 }, t04: { Imax_A: 86.0, k: 8.6, Zkdop_ohm: 2.67 }, t5: { Imax_A: 48.0, k: 4.8, Zkdop_ohm: 4.79 } },
  { In_A: 16, I2_A: 25.6, n_godz: 1, k2: 1.6, t02: { Imax_A: 132.8, k: 8.3, Zkdop_ohm: 1.73 }, t04: { Imax_A: 120.0, k: 7.5, Zkdop_ohm: 1.92 }, t5: { Imax_A: 70.4, k: 4.4, Zkdop_ohm: 3.26 } },
  { In_A: 20, I2_A: 32.0, n_godz: 1, k2: 1.6, t02: { Imax_A: 172.0, k: 8.6, Zkdop_ohm: 1.33 }, t04: { Imax_A: 158.0, k: 7.9, Zkdop_ohm: 1.45 }, t5: { Imax_A: 88.0, k: 4.4, Zkdop_ohm: 2.61 } },
  { In_A: 25, I2_A: 40.0, n_godz: 1, k2: 1.6, t02: { Imax_A: 227.5, k: 9.1, Zkdop_ohm: 1.01 }, t04: { Imax_A: 210.0, k: 8.4, Zkdop_ohm: 1.09 }, t5: { Imax_A: 115.0, k: 4.6, Zkdop_ohm: 2.00 } },
  { In_A: 35, I2_A: 56.0, n_godz: 1, k2: 1.6, t02: { Imax_A: 392.0, k: 11.2, Zkdop_ohm: 0.58 }, t04: { Imax_A: 346.5, k: 9.9, Zkdop_ohm: 0.66 }, t5: { Imax_A: 178.5, k: 5.1, Zkdop_ohm: 1.28 } },
  { In_A: 50, I2_A: 80.0, n_godz: 1, k2: 1.6, t02: { Imax_A: 530.0, k: 10.6, Zkdop_ohm: 0.43 }, t04: { Imax_A: 505.0, k: 10.1, Zkdop_ohm: 0.45 }, t5: { Imax_A: 260.0, k: 5.2, Zkdop_ohm: 0.88 } },
  { In_A: 63, I2_A: 100.8, n_godz: 1, k2: 1.6, t02: { Imax_A: 743.4, k: 11.8, Zkdop_ohm: 0.30 }, t04: { Imax_A: 655.2, k: 10.4, Zkdop_ohm: 0.35 }, t5: { Imax_A: 333.9, k: 5.3, Zkdop_ohm: 0.68 } },
];

const WT00_WT1_GG: WierszGG[] = [
  { In_A: 16, I2_A: 25.6, n_godz: 1, k2: 1.6, t02: { Imax_A: 120.0, k: 7.5, Zkdop_ohm: 1.91 }, t04: { Imax_A: 99.2, k: 6.2, Zkdop_ohm: 2.31 }, t5: { Imax_A: 62.4, k: 3.9, Zkdop_ohm: 3.68 } },
  { In_A: 20, I2_A: 32.0, n_godz: 1, k2: 1.6, t02: { Imax_A: 160.0, k: 8.0, Zkdop_ohm: 1.43 }, t04: { Imax_A: 140.0, k: 7.0, Zkdop_ohm: 1.64 }, t5: { Imax_A: 84.0, k: 4.2, Zkdop_ohm: 2.73 } },
  { In_A: 25, I2_A: 40.0, n_godz: 1, k2: 1.6, t02: { Imax_A: 200.0, k: 8.0, Zkdop_ohm: 1.15 }, t04: { Imax_A: 170.0, k: 6.8, Zkdop_ohm: 1.35 }, t5: { Imax_A: 97.5, k: 3.9, Zkdop_ohm: 2.35 } },
  { In_A: 32, I2_A: 51.2, n_godz: 1, k2: 1.6, t02: { Imax_A: 288.0, k: 9.0, Zkdop_ohm: 0.79 }, t04: { Imax_A: 249.6, k: 7.8, Zkdop_ohm: 0.92 }, t5: { Imax_A: 147.2, k: 4.6, Zkdop_ohm: 1.56 } },
  { In_A: 40, I2_A: 64.0, n_godz: 1, k2: 1.6, t02: { Imax_A: 368.0, k: 9.2, Zkdop_ohm: 0.62 }, t04: { Imax_A: 300.0, k: 7.5, Zkdop_ohm: 0.76 }, t5: { Imax_A: 180.0, k: 4.5, Zkdop_ohm: 1.27 } },
  { In_A: 50, I2_A: 80.0, n_godz: 1, k2: 1.6, t02: { Imax_A: 525.0, k: 10.5, Zkdop_ohm: 0.43 }, t04: { Imax_A: 435.0, k: 8.7, Zkdop_ohm: 0.52 }, t5: { Imax_A: 245.0, k: 4.9, Zkdop_ohm: 0.93 } },
  { In_A: 63, I2_A: 100.8, n_godz: 1, k2: 1.6, t02: { Imax_A: 636.3, k: 10.1, Zkdop_ohm: 0.36 }, t04: { Imax_A: 529.2, k: 8.4, Zkdop_ohm: 0.43 }, t5: { Imax_A: 302.4, k: 4.8, Zkdop_ohm: 0.76 } },
  { In_A: 80, I2_A: 128.8, n_godz: 2, k2: 1.6, t02: { Imax_A: 936.0, k: 11.7, Zkdop_ohm: 0.24 }, t04: { Imax_A: 776.0, k: 9.7, Zkdop_ohm: 0.29 }, t5: { Imax_A: 424.0, k: 5.3, Zkdop_ohm: 0.54 } },
  { In_A: 100, I2_A: 160.0, n_godz: 2, k2: 1.6, t02: { Imax_A: 1200.0, k: 12.0, Zkdop_ohm: 0.19 }, t04: { Imax_A: 1000.0, k: 10.0, Zkdop_ohm: 0.23 }, t5: { Imax_A: 570.0, k: 5.7, Zkdop_ohm: 0.40 } },
  { In_A: 125, I2_A: 200.0, n_godz: 2, k2: 1.6, t02: { Imax_A: 1725.0, k: 13.8, Zkdop_ohm: 0.13 }, t04: { Imax_A: 1475.0, k: 11.8, Zkdop_ohm: 0.15 }, t5: { Imax_A: 712.5, k: 5.7, Zkdop_ohm: 0.32 } },
  { In_A: 160, I2_A: 256.0, n_godz: 2, k2: 1.6, t02: { Imax_A: 1888.0, k: 11.8, Zkdop_ohm: 0.12 }, t04: { Imax_A: 1616.0, k: 10.1, Zkdop_ohm: 0.14 }, t5: { Imax_A: 912.0, k: 5.7, Zkdop_ohm: 0.25 } },
  { In_A: 200, I2_A: 320.0, n_godz: 3, k2: 1.6, t02: { Imax_A: 2820.0, k: 14.1, Zkdop_ohm: 0.08 }, t04: { Imax_A: 2400.0, k: 12.0, Zkdop_ohm: 0.09 }, t5: { Imax_A: 1220.0, k: 6.1, Zkdop_ohm: 0.18 } },
  { In_A: 250, I2_A: 400.0, n_godz: 3, k2: 1.6, t02: { Imax_A: 3500.0, k: 14.0, Zkdop_ohm: 0.06 }, t04: { Imax_A: 2975.0, k: 11.9, Zkdop_ohm: 0.07 }, t5: { Imax_A: 1575.0, k: 6.3, Zkdop_ohm: 0.14 } },
];

const TABLICE: Record<TypWkladkiGG, WierszGG[]> = { D0gG: D0GG, WT00gG_WT1gG: WT00_WT1_GG };

export function dostepneInGG(typ: TypWkladkiGG): number[] {
  return TABLICE[typ].map((w) => w.In_A);
}

export function wierszGG(typ: TypWkladkiGG, In_A: number): WierszGG | undefined {
  return TABLICE[typ].find((w) => w.In_A === In_A);
}

/** Najmniejsza wkładka danego typu, dla której In ≥ Ib. `undefined`, gdy żadna nie wystarcza. */
export function dobierzWkladkeGG(typ: TypWkladkiGG, Ib_A: number): WierszGG | undefined {
  return TABLICE[typ].find((w) => w.In_A >= Ib_A);
}

export function punktCzasowy(w: WierszGG, czas: CzasGG): { Imax_A: number; k: number; Zkdop_ohm: number } {
  return czas === "0.2" ? w.t02 : czas === "0.4" ? w.t04 : w.t5;
}
