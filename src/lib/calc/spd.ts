/**
 * Ograniczniki przepięć (SPD) — koordynacja poziomu ochrony, spec pkt 5.12.
 *
 * Sedno: skuteczny poziom ochrony NIE jest równy `Up` z tabliczki ogranicznika.
 * Do napięcia na zaciskach chronionego urządzenia dochodzi spadek INDUKCYJNY na
 * przewodach przyłączeniowych, a przy udarze 8/20 µs stromość prądu jest tak
 * duża, że na każdym metrze przewodu odkłada się rząd 1 kV. Dlatego reguła
 * „przewody przyłączeniowe ≤ 0,5 m" nie jest zaleceniem montażowym, tylko
 * wynikiem rachunku — i ten kalkulator ten rachunek pokazuje, zamiast powtarzać
 * samą regułę.
 *
 * `U_w` (wytrzymałość udarowa urządzenia) jest tu WEJŚCIEM z presetami wg
 * kategorii przepięciowych dla sieci 230/400 V — użytkownik może wpisać wartość
 * z karty katalogowej urządzenia, jeśli ją zna.
 */

import { bladWyniku, formatLiczba, ocenPodLimitem, type CalcError, type CalcResult, type Krok } from "./result";

export type TypSPD = "T1" | "T2" | "T3";

export const TYP_SPD_LABELS: Record<TypSPD, string> = {
  T1: "Typ 1 — na granicy stref LPZ 0/1 (ryzyko prądu piorunowego, Iimp 10/350 µs)",
  T2: "Typ 2 — na granicy LPZ 1/2, rozdzielnica główna/podrozdzielnica (In 8/20 µs)",
  T3: "Typ 3 — przy chronionym urządzeniu, uzupełniająco po T1/T2",
};

/**
 * Wytrzymałość udarowa urządzeń U_w wg KATEGORII PRZEPIĘCIOWEJ dla instalacji
 * 230/400 V (PN-HD 60364-4-44). Presety — do wpisania wartości z karty
 * katalogowej, gdy producent podaje własną.
 */
export const KATEGORIE_PRZEPIECIOWE: { kategoria: string; Uw_V: number; opis: string }[] = [
  { kategoria: "I", Uw_V: 1500, opis: "urządzenia elektroniczne wymagające ograniczenia przepięć" },
  { kategoria: "II", Uw_V: 2500, opis: "odbiorniki zasilane z instalacji stałej (AGD, elektronika)" },
  { kategoria: "III", Uw_V: 4000, opis: "elementy instalacji stałej (rozdzielnice, gniazda, osprzęt)" },
  { kategoria: "IV", Uw_V: 6000, opis: "urządzenia na początku instalacji (licznik, zabezpieczenia główne)" },
];

/**
 * Przyrost napięcia na przewodach przyłączeniowych SPD [V/m] przy udarze
 * 8/20 µs. Wartość praktyki projektowej rzędu 1 kV/m, wynikająca z indukcyjności
 * przewodu (ok. 1 µH/m) i stromości prądu udarowego — parametr edytowalny, bo
 * zależy od prowadzenia przewodów (pętla) i kształtu udaru.
 */
export const PRZYROST_NA_PRZEWODACH_V_NA_M = 1000;

export interface SPDWejscie {
  typ: TypSPD;
  /** Napięciowy poziom ochrony ogranicznika Up [V] — z tabliczki. */
  Up_V: number;
  /** Wytrzymałość udarowa chronionego urządzenia U_w [V]. */
  Uw_V: number;
  /** SUMARYCZNA długość przewodów przyłączeniowych (faza + PE) [m]. */
  dlugoscPrzewodow_m: number;
  /** Przyrost na przewodach [V/m] — domyślnie 1000. */
  przyrost_V_na_m?: number;
}

export interface SPDWynik {
  /** Spadek indukcyjny na przewodach przyłączeniowych [V]. */
  przyrostNaPrzewodach_V: number;
  /** Skuteczny poziom ochrony na zaciskach urządzenia [V]. */
  UpSkuteczne_V: number;
  /** Maksymalna dopuszczalna długość przewodów przy tym Up i Uw [m]. */
  maksDlugosc_m: number;
}

export function obliczKoordynacjeSPD(w: SPDWejscie): CalcResult<SPDWynik> {
  const bledy: CalcError[] = [];
  if (!(w.Up_V > 0)) bledy.push({ code: "UP", pole: "Up_V", message: "Poziom ochrony Up musi być większy od zera." });
  if (!(w.Uw_V > 0)) bledy.push({ code: "UW", pole: "Uw_V", message: "Wytrzymałość udarowa urządzenia U_w musi być większa od zera." });
  if (w.dlugoscPrzewodow_m < 0)
    bledy.push({ code: "DLUGOSC", pole: "dlugoscPrzewodow_m", message: "Długość przewodów nie może być ujemna." });
  // Sam Up powyżej Uw oznacza, że ogranicznik jest źle dobrany do urządzenia —
  // żadna długość przewodów tego nie naprawi, więc mówimy o tym osobno.
  if (w.Up_V > 0 && w.Uw_V > 0 && w.Up_V >= w.Uw_V)
    bledy.push({
      code: "UP_PONAD_UW",
      pole: "Up_V",
      message: `Sam poziom ochrony ogranicznika (${formatLiczba(w.Up_V, 0)} V) osiąga lub przekracza wytrzymałość udarową urządzenia (${formatLiczba(w.Uw_V, 0)} V). Skrócenie przewodów tego nie naprawi — potrzebny ogranicznik o niższym Up albo dodatkowy stopień ochrony (Typ 3 przy urządzeniu).`,
    });
  if (bledy.length > 0) return bladWyniku(bledy);

  const przyrostNaMetr = w.przyrost_V_na_m ?? PRZYROST_NA_PRZEWODACH_V_NA_M;
  const przyrost = przyrostNaMetr * w.dlugoscPrzewodow_m;
  const UpSkuteczne = w.Up_V + przyrost;
  const maksDlugosc = (w.Uw_V - w.Up_V) / przyrostNaMetr;

  const kroki: Krok[] = [
    {
      opis: "Przyrost napięcia na przewodach przyłączeniowych (udar 8/20 µs)",
      wzor: "ΔU = (dU/dl) · l",
      podstawienie: `${formatLiczba(przyrostNaMetr, 0)} V/m · ${formatLiczba(w.dlugoscPrzewodow_m, 2)} m`,
      wynik: `${formatLiczba(przyrost, 0)} V`,
    },
    {
      opis: "Skuteczny poziom ochrony na zaciskach urządzenia",
      wzor: "Up_sk = Up + ΔU",
      podstawienie: `${formatLiczba(w.Up_V, 0)} + ${formatLiczba(przyrost, 0)}`,
      wynik: `${formatLiczba(UpSkuteczne, 0)} V`,
    },
    {
      opis: "Maksymalna dopuszczalna długość przewodów przyłączeniowych",
      wzor: "l_max = (U_w − Up) / (dU/dl)",
      podstawienie: `(${formatLiczba(w.Uw_V, 0)} − ${formatLiczba(w.Up_V, 0)}) / ${formatLiczba(przyrostNaMetr, 0)}`,
      wynik: `${formatLiczba(maksDlugosc, 2)} m`,
    },
  ];

  const ocena = ocenPodLimitem(UpSkuteczne, w.Uw_V, { co: "Skuteczny poziom ochrony", jednostka: "V" });

  const zalozenia = [
    `Ogranicznik ${TYP_SPD_LABELS[w.typ]}.`,
    `Przyrost ${formatLiczba(przyrostNaMetr, 0)} V/m na przewodach przyłączeniowych — wartość praktyki projektowej dla udaru 8/20 µs, wynikająca z indukcyjności przewodu ok. 1 µH/m. Zależy od prowadzenia przewodów: pętla między przewodem fazowym a PE ten przyrost zwiększa.`,
    "Długość liczona SUMARYCZNIE dla przewodów doprowadzającego i odprowadzającego (faza + PE) — stąd praktyczna reguła „≤ 0,5 m łącznie”, a nie 0,5 m na każdy.",
    "Ogranicznik wymaga zabezpieczenia nadprądowego przed nim (wkładka gG albo wyłącznik wg zaleceń producenta), chyba że wystarcza zabezpieczenie już zainstalowane w obwodzie zasilającym.",
  ];

  if (w.typ === "T1") {
    zalozenia.push(
      "Typ 1 dobiera się na prąd udarowy Iimp (kształt 10/350 µs), a nie na In (8/20 µs) — te dwa parametry NIE są wymienne i ogranicznik Typu 2 nie zastąpi Typu 1 tam, gdzie liczy się z bezpośrednim wyładowaniem."
    );
  }

  return {
    wartosci: { przyrostNaPrzewodach_V: przyrost, UpSkuteczne_V: UpSkuteczne, maksDlugosc_m: maksDlugosc },
    kroki,
    ocena,
    zalozenia,
    zrodla: [
      { norma: "PN-HD 60364-5-53", czego: "dobór i montaż ograniczników przepięć" },
      { norma: "PN-HD 60364-4-44", czego: "kategorie przepięciowe, wytrzymałość udarowa U_w" },
      { norma: "PN-EN 62305-4", czego: "strefy ochrony odgromowej LPZ" },
    ],
    bledy: [],
  };
}
