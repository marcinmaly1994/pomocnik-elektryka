/**
 * Obciążalność prądowa długotrwała TRZECH ŻYŁ OBCIĄŻONYCH — PN-HD 60364-5-52,
 * tabl. B.52.4 (izolacja PVC, żyła 70°C) i tabl. B.52.5 (izolacja XLPE/EPR,
 * żyła 90°C), temperatura otoczenia 30°C w powietrzu / 20°C w gruncie.
 *
 * Metody odniesienia A1, A2, B1, B2, C, D1, D2 — materiał Cu i Al — przekroje
 * do 300 mm². Dane przepisane z normy i zweryfikowane z użytkownikiem KOMÓRKA
 * PO KOMÓRCE (dwie rundy poprawek: literówka w PVC/Cu/2,5mm²/D2, pomyłka w
 * PVC/Cu/300mm²/C, i systematyczny brak D2 dla aluminium poniżej 16 mm² —
 * potwierdzone jako CELOWA luka w normie, nie przeoczenie).
 *
 * UWAGA — TYLKO TRZY ŻYŁY OBCIĄŻONE: norma ma osobną tablicę dla DWÓCH żył
 * obciążonych (obwody 1-fazowe: L+N), z INNYMI liczbami — nie tymi tabelami
 * podzielonymi przez jakiś współczynnik. Dopóki tamta tablica nie zostanie
 * dostarczona, ten moduł NIE MOŻE być użyty do doboru obwodów 1-fazowych.
 * `pobierzObciazalnosc3Zyly` zwraca dane wyłącznie do obwodów 3-fazowych —
 * kalkulator wywołujący musi to sam wymusić, nie tylko ten moduł.
 *
 * Aluminium w metodzie D2 (bezpośrednio w gruncie) NIE MA wartości dla
 * przekrojów 2,5/4/6/10 mm² — to nie brak danych z naszej strony, tylko luka
 * w samej normie (potwierdzone przez użytkownika ze skanu). `undefined` w
 * tabeli poniżej odzwierciedla tę lukę i musi kończyć się czytelnym błędem,
 * a nie cichym pominięciem czy ekstrapolacją.
 */

import type { Izolacja, Material } from "./conductors";

export type MetodaOdniesienia3 = "A1" | "A2" | "B1" | "B2" | "C" | "D1" | "D2";

export const METODA_LABELS: Record<MetodaOdniesienia3, string> = {
  A1: "A1 — żyły w rurze w ścianie izolowanej termicznie",
  A2: "A2 — kabel w rurze w ścianie izolowanej termicznie",
  B1: "B1 — żyły w rurze na/w ścianie",
  B2: "B2 — kabel w rurze na/w ścianie",
  C: "C — kabel bezpośrednio na/w ścianie",
  D1: "D1 — kabel w rurze w gruncie",
  D2: "D2 — kabel bezpośrednio w gruncie",
};

type WierszObciazalnosci = Partial<Record<MetodaOdniesienia3, number>>;

// --- PVC (70°C), miedź — tabl. B.52.4 -----------------------------------------
const PVC_CU: Record<number, WierszObciazalnosci> = {
  1.5: { A1: 13.5, A2: 13, B1: 15.5, B2: 15, C: 17.5, D1: 18, D2: 19 },
  2.5: { A1: 18, A2: 17.5, B1: 21, B2: 20, C: 24, D1: 24, D2: 24 },
  4: { A1: 24, A2: 23, B1: 28, B2: 27, C: 32, D1: 30, D2: 33 },
  6: { A1: 31, A2: 29, B1: 36, B2: 34, C: 41, D1: 38, D2: 41 },
  10: { A1: 42, A2: 39, B1: 50, B2: 46, C: 57, D1: 50, D2: 54 },
  16: { A1: 56, A2: 52, B1: 68, B2: 62, C: 76, D1: 64, D2: 70 },
  25: { A1: 73, A2: 68, B1: 89, B2: 80, C: 96, D1: 82, D2: 92 },
  35: { A1: 89, A2: 83, B1: 110, B2: 99, C: 119, D1: 98, D2: 110 },
  50: { A1: 108, A2: 99, B1: 134, B2: 118, C: 144, D1: 116, D2: 130 },
  70: { A1: 136, A2: 125, B1: 171, B2: 149, C: 184, D1: 143, D2: 162 },
  95: { A1: 164, A2: 150, B1: 207, B2: 179, C: 223, D1: 169, D2: 193 },
  120: { A1: 188, A2: 172, B1: 239, B2: 206, C: 259, D1: 192, D2: 220 },
  150: { A1: 216, A2: 196, B1: 262, B2: 225, C: 299, D1: 217, D2: 246 },
  185: { A1: 245, A2: 223, B1: 296, B2: 255, C: 341, D1: 243, D2: 278 },
  240: { A1: 286, A2: 261, B1: 346, B2: 297, C: 403, D1: 280, D2: 320 },
  300: { A1: 328, A2: 298, B1: 394, B2: 339, C: 464, D1: 316, D2: 359 },
};

// --- PVC (70°C), aluminium — tabl. B.52.4 -------------------------------------
// Brak D2 dla 2,5/4/6/10 mm² — POTWIERDZONA luka w normie, nie literówka.
const PVC_AL: Record<number, WierszObciazalnosci> = {
  2.5: { A1: 14, A2: 13.5, B1: 16.5, B2: 15.5, C: 18.5, D1: 18.5 },
  4: { A1: 18.5, A2: 17.5, B1: 22, B2: 21, C: 25, D1: 24 },
  6: { A1: 24, A2: 23, B1: 28, B2: 27, C: 32, D1: 30 },
  10: { A1: 32, A2: 30, B1: 36, B2: 34, C: 44, D1: 39 },
  16: { A1: 43, A2: 41, B1: 53, B2: 48, C: 59, D1: 50, D2: 53 },
  25: { A1: 57, A2: 53, B1: 70, B2: 62, C: 73, D1: 64, D2: 69 },
  35: { A1: 70, A2: 65, B1: 86, B2: 77, C: 90, D1: 77, D2: 83 },
  50: { A1: 84, A2: 78, B1: 104, B2: 92, C: 110, D1: 91, D2: 99 },
  70: { A1: 107, A2: 98, B1: 133, B2: 116, C: 140, D1: 112, D2: 122 },
  95: { A1: 129, A2: 118, B1: 161, B2: 139, C: 170, D1: 132, D2: 148 },
  120: { A1: 149, A2: 135, B1: 186, B2: 160, C: 197, D1: 150, D2: 169 },
  150: { A1: 170, A2: 155, B1: 204, B2: 176, C: 227, D1: 169, D2: 189 },
  185: { A1: 194, A2: 176, B1: 230, B2: 199, C: 259, D1: 189, D2: 214 },
  240: { A1: 227, A2: 207, B1: 269, B2: 232, C: 305, D1: 218, D2: 250 },
  300: { A1: 261, A2: 237, B1: 306, B2: 265, C: 351, D1: 247, D2: 282 },
};

// --- XLPE/EPR (90°C), miedź — tabl. B.52.5 ------------------------------------
const XLPE_CU: Record<number, WierszObciazalnosci> = {
  1.5: { A1: 17, A2: 16.5, B1: 20, B2: 19.5, C: 22, D1: 21, D2: 23 },
  2.5: { A1: 23, A2: 22, B1: 28, B2: 26, C: 30, D1: 28, D2: 31 },
  4: { A1: 31, A2: 30, B1: 38, B2: 35, C: 40, D1: 36, D2: 39 },
  6: { A1: 40, A2: 38, B1: 48, B2: 44, C: 52, D1: 44, D2: 49 },
  10: { A1: 54, A2: 51, B1: 66, B2: 60, C: 71, D1: 58, D2: 65 },
  16: { A1: 73, A2: 68, B1: 89, B2: 80, C: 96, D1: 75, D2: 84 },
  25: { A1: 95, A2: 89, B1: 117, B2: 105, C: 119, D1: 96, D2: 107 },
  35: { A1: 117, A2: 109, B1: 144, B2: 128, C: 147, D1: 115, D2: 129 },
  50: { A1: 141, A2: 130, B1: 175, B2: 154, C: 179, D1: 135, D2: 153 },
  70: { A1: 179, A2: 164, B1: 222, B2: 194, C: 229, D1: 167, D2: 188 },
  95: { A1: 216, A2: 197, B1: 269, B2: 233, C: 278, D1: 197, D2: 226 },
  120: { A1: 249, A2: 227, B1: 312, B2: 268, C: 322, D1: 223, D2: 257 },
  150: { A1: 285, A2: 259, B1: 342, B2: 300, C: 371, D1: 251, D2: 287 },
  185: { A1: 324, A2: 295, B1: 384, B2: 340, C: 424, D1: 287, D2: 324 },
  240: { A1: 380, A2: 346, B1: 450, B2: 398, C: 500, D1: 324, D2: 375 },
  300: { A1: 435, A2: 396, B1: 514, B2: 455, C: 576, D1: 365, D2: 419 },
};

// --- XLPE/EPR (90°C), aluminium — tabl. B.52.5 --------------------------------
// Brak D2 dla 2,5/4/6/10 mm² — ta sama, POTWIERDZONA luka co w tabeli PVC.
const XLPE_AL: Record<number, WierszObciazalnosci> = {
  2.5: { A1: 19, A2: 18, B1: 22, B2: 21, C: 24, D1: 22 },
  4: { A1: 25, A2: 24, B1: 29, B2: 28, C: 32, D1: 28 },
  6: { A1: 32, A2: 31, B1: 38, B2: 35, C: 41, D1: 35 },
  10: { A1: 44, A2: 41, B1: 52, B2: 48, C: 57, D1: 46 },
  16: { A1: 58, A2: 55, B1: 71, B2: 64, C: 76, D1: 59, D2: 64 },
  25: { A1: 76, A2: 71, B1: 93, B2: 84, C: 90, D1: 75, D2: 82 },
  35: { A1: 94, A2: 87, B1: 116, B2: 103, C: 112, D1: 90, D2: 98 },
  50: { A1: 113, A2: 104, B1: 140, B2: 124, C: 136, D1: 106, D2: 117 },
  70: { A1: 142, A2: 131, B1: 179, B2: 156, C: 174, D1: 130, D2: 144 },
  95: { A1: 171, A2: 157, B1: 217, B2: 188, C: 211, D1: 154, D2: 172 },
  120: { A1: 197, A2: 180, B1: 251, B2: 216, C: 245, D1: 174, D2: 197 },
  150: { A1: 226, A2: 206, B1: 267, B2: 240, C: 283, D1: 197, D2: 220 },
  185: { A1: 256, A2: 233, B1: 300, B2: 272, C: 323, D1: 220, D2: 250 },
  240: { A1: 300, A2: 273, B1: 351, B2: 318, C: 382, D1: 253, D2: 290 },
  300: { A1: 344, A2: 313, B1: 402, B2: 364, C: 440, D1: 286, D2: 326 },
};

const TABLICE: Record<Izolacja, Record<Material, Record<number, WierszObciazalnosci>>> = {
  PVC: { Cu: PVC_CU, Al: PVC_AL },
  XLPE: { Cu: XLPE_CU, Al: XLPE_AL },
};

/** Przekroje dostępne w tych tablicach — Cu od 1,5, Al od 2,5, oba do 300 mm². */
export const PRZEKROJE_3ZYLY_CU = Object.keys(PVC_CU).map(Number).sort((a, b) => a - b);
export const PRZEKROJE_3ZYLY_AL = Object.keys(PVC_AL).map(Number).sort((a, b) => a - b);

/**
 * Obciążalność długotrwała [A] dla TRZECH żył obciążonych.
 * `undefined`, gdy norma nie podaje wartości dla tej kombinacji (np. Al/D2 w
 * małych przekrojach) — wywołujący MUSI to potraktować jako brak danych, nie
 * jako zero czy do pominięcia.
 */
export function obciazalnosc3Zyly(
  material: Material,
  izolacja: Izolacja,
  metoda: MetodaOdniesienia3,
  przekroj_mm2: number
): number | undefined {
  return TABLICE[izolacja][material][przekroj_mm2]?.[metoda];
}
