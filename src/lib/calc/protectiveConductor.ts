/**
 * Dobór przewodu ochronnego PE i przewodu neutralnego N — spec pkt 5.12.
 *
 * PE ma DWA niezależne kryteria i obowiązuje ostrzejsze z nich:
 *  1. dobór wg przekroju fazowego (PN-HD 60364-5-54) — tabelaryczna reguła,
 *  2. wytrzymałość zwarciowa cieplna S ≥ I·√t / k — bo przez PE płynie cały prąd
 *     zwarcia doziemnego aż do zadziałania zabezpieczenia.
 * Reguła tabelaryczna sama w sobie NIE gwarantuje spełnienia (2) przy dużych
 * prądach zwarciowych i wolnych zabezpieczeniach — dlatego liczymy oba i bierzemy
 * maksimum, zamiast poprzestawać na „PE = połowa fazowego".
 *
 * Przewód N jest osobnym problemem: przy odbiorach nieliniowych 3. harmoniczna
 * sumuje się w nim arytmetycznie (patrz `loadBalance.ts`), więc prąd w N potrafi
 * przekroczyć fazowy. Redukcja przekroju N poniżej fazowego wymaga wtedy tablicy
 * współczynników z PN-HD 60364-5-52 — której NIE mamy wbudowanej, więc kalkulator
 * mówi o tym wprost, zamiast zgadywać współczynnik.
 */

import { K_ZYLA, minPrzekrojPE, type Izolacja, type Material } from "@/lib/norms/conductors";
import { bladWyniku, formatLiczba, type CalcError, type CalcResult, type Krok } from "./result";

const SZEREG = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300, 400, 500, 630];

export interface PEWejscie {
  /** Przekrój przewodu fazowego [mm²]. */
  przekrojFazowy_mm2: number;
  material: Material;
  izolacja: Izolacja;
  /** Prąd zwarcia doziemnego [A] — do kryterium cieplnego. Opcjonalny. */
  pradZwarciowy_A?: number;
  /** Czas wyłączenia [s] — do kryterium cieplnego. */
  czasWylaczenia_s?: number;
}

export interface PEWynik {
  /** Przekrój z reguły tabelarycznej [mm²]. */
  zReguly_mm2: number;
  /** Przekrój z warunku cieplnego [mm²]. `null` bez danych zwarciowych. */
  zWarunkuCieplnego_mm2: number | null;
  /** Wymagany przekrój — większy z obu kryteriów, zaokrąglony w górę do szeregu. */
  wymagany_mm2: number;
  /** Które kryterium zadecydowało. */
  decyduje: "reguła tabelaryczna" | "wytrzymałość zwarciowa cieplna";
  k: number;
}

export function dobierzPE(w: PEWejscie): CalcResult<PEWynik> {
  const bledy: CalcError[] = [];
  if (!(w.przekrojFazowy_mm2 > 0))
    bledy.push({ code: "PRZEKROJ", pole: "przekrojFazowy_mm2", message: "Przekrój przewodu fazowego musi być większy od zera." });
  if (w.czasWylaczenia_s !== undefined && w.czasWylaczenia_s > 5)
    bledy.push({
      code: "CZAS_POZA_ZAKRESEM",
      pole: "czasWylaczenia_s",
      message: "Wzór adiabatyczny obowiązuje do 5 s. Dłuższe czasy wymagają metody uwzględniającej oddawanie ciepła.",
    });
  if (bledy.length > 0) return bladWyniku(bledy);

  const k = K_ZYLA[w.material][w.izolacja];
  const zReguly = minPrzekrojPE(w.przekrojFazowy_mm2);
  const kroki: Krok[] = [
    {
      opis: "Przekrój PE wg przekroju fazowego",
      wzor: "S ≤ 16 → S_PE = S;  16 < S ≤ 35 → S_PE = 16;  S > 35 → S_PE = S/2",
      podstawienie: `S = ${formatLiczba(w.przekrojFazowy_mm2, 1)} mm²`,
      wynik: `${formatLiczba(zReguly, 1)} mm²`,
    },
  ];

  let zCiepla: number | null = null;
  if (w.pradZwarciowy_A && w.pradZwarciowy_A > 0 && w.czasWylaczenia_s && w.czasWylaczenia_s > 0) {
    zCiepla = (w.pradZwarciowy_A * Math.sqrt(w.czasWylaczenia_s)) / k;
    kroki.push({
      opis: "Przekrój PE z warunku wytrzymałości zwarciowej cieplnej",
      wzor: "S ≥ I · √t / k",
      podstawienie: `${formatLiczba(w.pradZwarciowy_A, 0)} · √${formatLiczba(w.czasWylaczenia_s, 2)} / ${k}`,
      wynik: `${formatLiczba(zCiepla, 2)} mm²`,
    });
  }

  const wymaganyRaw = Math.max(zReguly, zCiepla ?? 0);
  const wymagany = SZEREG.find((s) => s >= wymaganyRaw) ?? wymaganyRaw;
  const decyduje = zCiepla !== null && zCiepla > zReguly ? "wytrzymałość zwarciowa cieplna" : "reguła tabelaryczna";

  kroki.push({
    opis: "Przekrój wymagany — ostrzejsze z kryteriów, zaokrąglone w górę do szeregu",
    wzor: "S_PE = max(reguła, warunek cieplny)",
    podstawienie: `max(${formatLiczba(zReguly, 1)}; ${zCiepla !== null ? formatLiczba(zCiepla, 2) : "—"})`,
    wynik: `${formatLiczba(wymagany, 1)} mm² (decyduje: ${decyduje})`,
  });

  const zalozenia = [
    "Reguła tabelaryczna zakłada PE z TEGO SAMEGO materiału co przewód fazowy. Dla PE z innego materiału przekrój przelicza się przez stosunek współczynników k.",
    "PE prowadzi pełny prąd zwarcia doziemnego aż do zadziałania zabezpieczenia, więc sama reguła tabelaryczna nie wystarcza — przy dużym prądzie zwarciowym decyduje warunek cieplny.",
  ];
  if (zCiepla === null)
    zalozenia.push(
      "Nie podano prądu zwarciowego i czasu wyłączenia — warunek cieplny NIE został sprawdzony. Wynik pokrywa wyłącznie regułę doboru wg przekroju fazowego."
    );

  return {
    wartosci: { zReguly_mm2: zReguly, zWarunkuCieplnego_mm2: zCiepla, wymagany_mm2: wymagany, decyduje, k },
    kroki,
    ocena: null,
    zalozenia,
    zrodla: [
      { norma: "PN-HD 60364-5-54", czego: "dobór przewodów ochronnych" },
      { norma: "PN-HD 60364-4-43", czego: "wytrzymałość zwarciowa cieplna" },
    ],
    bledy: [],
  };
}

// --- przewód neutralny --------------------------------------------------------

export interface NWejscie {
  przekrojFazowy_mm2: number;
  /** Prąd fazowy [A]. */
  pradFazowy_A: number;
  /** Udział 3. harmonicznej w prądzie fazowym [%]. */
  udzialH3_pct: number;
}

export interface NWynik {
  /** Prąd w przewodzie N przy symetrycznym obciążeniu [A]. */
  IN_A: number;
  /** Czy N jest obciążony bardziej niż faza. */
  Nprzeciazony: boolean;
  /** Minimalny zalecany przekrój N [mm²]. */
  zalecany_mm2: number;
}

/**
 * Progi udziału 3. harmonicznej, przy których zmienia się traktowanie przewodu N.
 * Wynikają wprost z arytmetyki (3·udział vs 1), a nie z tablicy: przy udziale
 * 1/3 prąd w N zrównuje się z fazowym.
 */
export const PROG_H3_N_ROWNY_FAZIE_PCT = 33.3;

export function dobierzN(w: NWejscie): CalcResult<NWynik> {
  const bledy: CalcError[] = [];
  if (!(w.przekrojFazowy_mm2 > 0))
    bledy.push({ code: "PRZEKROJ", pole: "przekrojFazowy_mm2", message: "Przekrój fazowy musi być większy od zera." });
  if (!(w.pradFazowy_A > 0)) bledy.push({ code: "PRAD", pole: "pradFazowy_A", message: "Prąd fazowy musi być większy od zera." });
  if (w.udzialH3_pct < 0 || w.udzialH3_pct > 100)
    bledy.push({ code: "H3", pole: "udzialH3_pct", message: "Udział 3. harmonicznej musi mieścić się w przedziale 0–100%." });
  if (bledy.length > 0) return bladWyniku(bledy);

  // Obciążenie symetryczne: składowa podstawowa znosi się w N, zostaje 3× h3.
  const IN = 3 * (w.udzialH3_pct / 100) * w.pradFazowy_A;
  const przeciazony = IN > w.pradFazowy_A;
  const zalecany = przeciazony ? Math.max(w.przekrojFazowy_mm2, (SZEREG.find((s) => s >= w.przekrojFazowy_mm2 * (IN / w.pradFazowy_A)) ?? w.przekrojFazowy_mm2)) : w.przekrojFazowy_mm2;

  const kroki: Krok[] = [
    {
      opis: "Prąd w przewodzie N przy obciążeniu symetrycznym",
      wzor: "I_N = 3 · udział_h3 · I_faz",
      podstawienie: `3 · ${formatLiczba(w.udzialH3_pct / 100, 3)} · ${formatLiczba(w.pradFazowy_A, 1)}`,
      wynik: `${formatLiczba(IN, 1)} A`,
    },
  ];

  const ocena = przeciazony
    ? {
        verdict: "niespelniony" as const,
        margines_pct: ((w.pradFazowy_A - IN) / w.pradFazowy_A) * 100,
        komunikat: `Przy udziale 3. harmonicznej ${formatLiczba(w.udzialH3_pct, 0)}% prąd w przewodzie N (${formatLiczba(IN, 1)} A) przekracza prąd fazowy (${formatLiczba(w.pradFazowy_A, 1)} A). Przewód N musi być wtedy dobrany na prąd w N, nie na prąd fazowy — zalecany przekrój ${formatLiczba(zalecany, 1)} mm². Obwodu nie wolno też zabezpieczać w sposób pozostawiający N bez ochrony.`,
      }
    : {
        verdict: "spelniony" as const,
        margines_pct: ((w.pradFazowy_A - IN) / w.pradFazowy_A) * 100,
        komunikat: `Prąd w N (${formatLiczba(IN, 1)} A) nie przekracza prądu fazowego (${formatLiczba(w.pradFazowy_A, 1)} A) — przekrój N równy fazowemu jest wystarczający.`,
      };

  const zalozenia = [
    "Obciążenie trójfazowe SYMETRYCZNE — składowa podstawowa znosi się w przewodzie N, zostaje suma 3. harmonicznych. Przy asymetrii doliczą się jeszcze prądy z niezrównoważenia (patrz kalkulator „Bilans faz i prąd w N”).",
    `Przy udziale 3. harmonicznej powyżej ${formatLiczba(PROG_H3_N_ROWNY_FAZIE_PCT, 0)}% prąd w N przekracza fazowy — to wynika wprost z arytmetyki (3 × udział), nie z tablicy.`,
    "REDUKCJA przekroju N poniżej fazowego (dopuszczalna w niektórych przypadkach dla obwodów 3-fazowych o małym udziale harmonicznych) wymaga współczynników z tablicy PN-HD 60364-5-52, których ten kalkulator NIE ma wbudowanych — dlatego nie proponuje przekroju mniejszego od fazowego.",
  ];

  return {
    wartosci: { IN_A: IN, Nprzeciazony: przeciazony, zalecany_mm2: zalecany },
    kroki,
    ocena,
    zalozenia,
    zrodla: [{ norma: "PN-HD 60364-5-52", czego: "przewód neutralny, wpływ harmonicznych" }],
    bledy: [],
  };
}
