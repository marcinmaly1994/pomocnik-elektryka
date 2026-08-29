/**
 * Instalacje fotowoltaiczne — spec pkt 5.12 (pozycja opcjonalna).
 *
 * Trzy sprawdzenia stringu DC, każde innym mechanizmem fizycznym — dlatego są
 * rozdzielone, a nie zwinięte w jeden „wynik ogólny":
 *
 *  1. Bezpiecznik/przewód stringowy: prąd projektowy = 1,25 × Isc.
 *     Mnożnik z PN-HD 60364-7-712 — realne nasłonecznienie bywa CHWILOWO wyższe
 *     niż warunki STC (1000 W/m²), np. przy odbiciu od chmury na krawędzi
 *     tarczy słonecznej, więc prąd zwarciowy z karty katalogowej modułu to nie
 *     jest bezpieczny sufit projektowy.
 *  2. Napięcie stringu w ZIMNIE nie może przekroczyć granicy wejścia falownika.
 *     Voc modułu ROŚNIE przy niskiej temperaturze (ujemny współczynnik
 *     temperaturowy) — sprawdzenie robi się więc dla najzimniejszego
 *     spodziewanego dnia, nie dla 25°C z karty katalogowej. Przekroczenie tu
 *     to nie jest „gorsza sprawność", tylko realne ryzyko zniszczenia falownika.
 *  3. Przekrój kabla DC pod spadek napięcia ≤ 1%. DC nie ma reaktancji, więc
 *     liczy się czystym wzorem rezystancyjnym — tym samym modelem rezystywności
 *     co reszta aplikacji (spójność krzyżowa, patrz `conductors.ts`).
 *
 * Napięcie w UPALE (dolna granica zakresu MPPT) jest sprawdzeniem OPCJONALNYM —
 * wymaga drugiej temperatury i tego samego współczynnika, potrzebnego głównie
 * tam, gdzie string jest krótki, a zakres MPPT falownika wąski.
 *
 * Strona AC (wyjście falownika) NIE dubluje osobnego silnika — korzysta wprost
 * z `sizeCircuit`, bo falownik podłączony do rozdzielnicy to zwyczajny obwód
 * dedykowany (tyle że zasilający W STRONĘ sieci) z punktu widzenia doboru
 * przewodu i zabezpieczenia.
 */

import { rezystywnoscRobocza, TEMP_PRACY, type Material } from "@/lib/norms/conductors";
import type { LayingMethod } from "@/lib/panel/norms";
import { sizeCircuit, type PhaseCount } from "@/lib/panel/sizing";
import { bladWyniku, formatLiczba, type CalcError, type CalcResult, type Krok, type Ocena } from "./result";

/** Mnożnik bezpieczeństwa na prąd zwarciowy stringu — PN-HD 60364-7-712. */
export const WSP_ISC_STRING = 1.25;

export interface StringPVWejscie {
  Isc_A: number;
  Voc_V: number;
  /** Napięcie w punkcie mocy maksymalnej [V] — do odniesienia spadku DC i sprawdzenia MPPT. */
  Vmpp_V?: number;
  /** Prąd w punkcie mocy maksymalnej [A] — do doboru przekroju DC. Bez niego użyty Isc (zawyża wynik). */
  Impp_A?: number;
  liczbaModulowSzeregowo: number;
  /** Współczynnik temperaturowy napięcia [%/°C] — z karty katalogowej modułu, typowo ok. −0,3.
   *  Ten sam współczynnik stosowany do Voc (sprawdzenie na zimno) i Vmpp (na gorąco) —
   *  uproszczenie: w rzeczywistości mogą się nieznacznie różnić, ale karty katalogowe
   *  rzadko podają obie wartości osobno. */
  betaNapiecia_pct_na_C: number;
  tempMin_C: number;
  /** Temperatura modułu w upale [°C] — do OPCJONALNEGO sprawdzenia dolnej granicy MPPT. */
  tempMax_C?: number;
  falownikVocMax_V: number;
  falownikMpptMin_V?: number;

  dlugoscDC_m: number;
  przekrojDC_mm2: number;
  materialDC: Material;
  limitSpadkuDC_pct: number;
}

export interface StringPVWynik {
  /** Prąd projektowy stringu (1,25×Isc) — do doboru bezpiecznika/przewodu [A]. */
  IprojektowyA: number;
  VocZimny_V: number;
  VmppGoracy_V: number | null;
  spadekDC_pct: number;
  spadekDC_V: number;
}

function walidacjaPV(w: StringPVWejscie): CalcError[] {
  const b: CalcError[] = [];
  if (!(w.Isc_A > 0)) b.push({ code: "ISC", pole: "Isc_A", message: "Prąd zwarciowy modułu musi być większy od zera." });
  if (!(w.Voc_V > 0)) b.push({ code: "VOC", pole: "Voc_V", message: "Napięcie jałowe modułu musi być większe od zera." });
  if (!(w.liczbaModulowSzeregowo >= 1))
    b.push({ code: "LICZBA_MODULOW", pole: "liczbaModulowSzeregowo", message: "String musi mieć co najmniej jeden moduł." });
  if (!(w.falownikVocMax_V > 0))
    b.push({ code: "VOC_MAX", pole: "falownikVocMax_V", message: "Maksymalne napięcie wejściowe falownika musi być większe od zera." });
  if (!(w.dlugoscDC_m > 0)) b.push({ code: "DLUGOSC", pole: "dlugoscDC_m", message: "Długość kabla DC musi być większa od zera." });
  if (!(w.przekrojDC_mm2 > 0)) b.push({ code: "PRZEKROJ", pole: "przekrojDC_mm2", message: "Przekrój kabla DC musi być większy od zera." });
  if (!(w.limitSpadkuDC_pct > 0))
    b.push({ code: "LIMIT", pole: "limitSpadkuDC_pct", message: "Dopuszczalny spadek napięcia DC musi być większy od zera." });
  // Współczynnik temperaturowy napięcia modułu jest UJEMNY (napięcie rośnie na
  // zimnie) — dodatnia wartość odwróciłaby sens sprawdzenia bez ostrzeżenia.
  if (w.betaNapiecia_pct_na_C > 0)
    b.push({
      code: "BETA_DODATNIE",
      pole: "betaNapiecia_pct_na_C",
      message: "Współczynnik temperaturowy napięcia modułu jest zwykle UJEMNY (napięcie rośnie przy niskiej temperaturze) — sprawdź znak w karcie katalogowej.",
    });
  return b;
}

export function obliczStringPV(w: StringPVWejscie): CalcResult<StringPVWynik> {
  const bledy = walidacjaPV(w);
  if (bledy.length > 0) return bladWyniku(bledy);

  const Iprojektowy = WSP_ISC_STRING * w.Isc_A;
  const kroki: Krok[] = [
    {
      opis: "Prąd projektowy stringu (dobór przewodu i zabezpieczenia DC)",
      wzor: "I_proj = 1,25 · Isc",
      podstawienie: `1,25 · ${formatLiczba(w.Isc_A, 2)}`,
      wynik: `${formatLiczba(Iprojektowy, 2)} A`,
    },
  ];

  const VocZimny = w.liczbaModulowSzeregowo * w.Voc_V * (1 + (w.betaNapiecia_pct_na_C / 100) * (w.tempMin_C - 25));
  kroki.push({
    opis: "Napięcie stringu w najzimniejszym spodziewanym dniu",
    wzor: "Voc(T) = n · Voc,STC · [1 + (β/100) · (T − 25)]",
    podstawienie: `${w.liczbaModulowSzeregowo} · ${formatLiczba(w.Voc_V, 1)} · [1 + (${formatLiczba(w.betaNapiecia_pct_na_C, 3)}/100) · (${formatLiczba(w.tempMin_C, 0)} − 25)]`,
    wynik: `${formatLiczba(VocZimny, 1)} V`,
  });

  let VmppGoracy: number | null = null;
  if (w.tempMax_C !== undefined && w.Vmpp_V) {
    VmppGoracy = w.liczbaModulowSzeregowo * w.Vmpp_V * (1 + (w.betaNapiecia_pct_na_C / 100) * (w.tempMax_C - 25));
    kroki.push({
      opis: "Napięcie stringu w upale (dolna granica zakresu MPPT)",
      wzor: "Vmpp(T) = n · Vmpp,STC · [1 + (β/100) · (T − 25)]",
      podstawienie: `${w.liczbaModulowSzeregowo} · ${formatLiczba(w.Vmpp_V, 1)} · [1 + (${formatLiczba(w.betaNapiecia_pct_na_C, 3)}/100) · (${formatLiczba(w.tempMax_C, 0)} − 25)]`,
      wynik: `${formatLiczba(VmppGoracy, 1)} V`,
    });
  }

  // --- spadek napięcia DC -----------------------------------------------------
  const gamma = 1 / rezystywnoscRobocza(w.materialDC, "annexG", TEMP_PRACY.PVC);
  const IdlaSpadku = w.Impp_A ?? w.Isc_A;
  const spadekV = (2 * IdlaSpadku * w.dlugoscDC_m) / (gamma * w.przekrojDC_mm2);
  const Vref = w.liczbaModulowSzeregowo * (w.Vmpp_V ?? w.Voc_V);
  const spadekPct = (spadekV / Vref) * 100;
  kroki.push({
    opis: "Spadek napięcia na kablu DC (bez reaktancji — obwód prądu stałego)",
    wzor: "ΔU = 2 · I · L / (γ · S)",
    podstawienie: `2 · ${formatLiczba(IdlaSpadku, 2)} · ${formatLiczba(w.dlugoscDC_m, 1)} / (${formatLiczba(gamma, 1)} · ${formatLiczba(w.przekrojDC_mm2, 1)})`,
    wynik: `${formatLiczba(spadekV, 2)} V  (${formatLiczba(spadekPct, 2)} %)`,
  });

  const zalozenia: string[] = [
    "Współczynnik temperaturowy napięcia zastosowany JEDNAKOWO do Voc i do Vmpp — uproszczenie, karty katalogowe rzadko podają je osobno.",
    `Rezystywność kabla DC liczona jak dla warunków ruchowych wg PN-HD 60364-5-52 zał. G (ta sama wartość co reszta aplikacji) — γ = ${formatLiczba(gamma, 1)} m/(Ω·mm²).`,
  ];
  if (w.Impp_A === undefined)
    zalozenia.push("Nie podano prądu Impp — spadek napięcia policzony prądem Isc, co go ZAWYŻA (bezpieczna strona, ale mniej dokładna).");
  if (w.Vmpp_V === undefined)
    zalozenia.push("Nie podano napięcia Vmpp — spadek % odniesiony do Voc stringu zamiast do realnego napięcia pracy.");
  if (VmppGoracy === null)
    zalozenia.push("Nie sprawdzono dolnej granicy zakresu MPPT w upale — podaj Vmpp, temperaturę maksymalną i Vmppt_min falownika, żeby to sprawdzić.");

  // --- ocena łączona: priorytet wg dotkliwości skutku -------------------------
  // Przekroczenie Voc grozi ZNISZCZENIEM falownika — to jest zawsze najcięższe
  // z trzech sprawdzeń, więc decyduje o werdykcie, nawet gdy pozostałe dwa są OK.
  let ocena: Ocena;
  if (VocZimny > w.falownikVocMax_V) {
    const margines = ((w.falownikVocMax_V - VocZimny) / w.falownikVocMax_V) * 100;
    ocena = {
      verdict: "niespelniony",
      margines_pct: margines,
      komunikat: `Napięcie stringu w zimnie (${formatLiczba(VocZimny, 1)} V) PRZEKRACZA maksymalne napięcie wejściowe falownika (${formatLiczba(w.falownikVocMax_V, 1)} V) — ryzyko zniszczenia falownika. Zmniejsz liczbę modułów w szeregu.`,
    };
  } else if (VmppGoracy !== null && w.falownikMpptMin_V !== undefined && VmppGoracy < w.falownikMpptMin_V) {
    const margines = ((VmppGoracy - w.falownikMpptMin_V) / w.falownikMpptMin_V) * 100;
    ocena = {
      verdict: "niespelniony",
      margines_pct: margines,
      komunikat: `Napięcie stringu w upale (${formatLiczba(VmppGoracy, 1)} V) SPADA poniżej dolnej granicy zakresu MPPT (${formatLiczba(w.falownikMpptMin_V, 1)} V) — falownik może ograniczać moc albo się wyłączać. Zwiększ liczbę modułów w szeregu.`,
    };
  } else if (spadekPct > w.limitSpadkuDC_pct) {
    const margines = ((w.limitSpadkuDC_pct - spadekPct) / w.limitSpadkuDC_pct) * 100;
    ocena = {
      verdict: "niespelniony",
      margines_pct: margines,
      komunikat: `Spadek napięcia DC ${formatLiczba(spadekPct, 2)}% przekracza limit ${formatLiczba(w.limitSpadkuDC_pct, 2)}% — strata mocy na kablu. Zwiększ przekrój albo skróć trasę.`,
    };
  } else {
    const marginesVoc = ((w.falownikVocMax_V - VocZimny) / w.falownikVocMax_V) * 100;
    const marginesSpadek = ((w.limitSpadkuDC_pct - spadekPct) / w.limitSpadkuDC_pct) * 100;
    const najcRasniejszy = Math.min(marginesVoc, marginesSpadek);
    ocena = {
      verdict: najcRasniejszy < 10 ? "graniczny" : "spelniony",
      margines_pct: najcRasniejszy,
      komunikat: `Napięcie w zimnie ${formatLiczba(VocZimny, 1)} V (limit ${formatLiczba(w.falownikVocMax_V, 1)} V), spadek DC ${formatLiczba(spadekPct, 2)}% (limit ${formatLiczba(w.limitSpadkuDC_pct, 2)}%) — oba warunki spełnione.`,
    };
  }

  return {
    wartosci: { IprojektowyA: Iprojektowy, VocZimny_V: VocZimny, VmppGoracy_V: VmppGoracy, spadekDC_pct: spadekPct, spadekDC_V: spadekV },
    kroki,
    ocena,
    zalozenia,
    zrodla: [
      { norma: "PN-HD 60364-7-712", czego: "instalacje fotowoltaiczne — dobór przewodów i zabezpieczeń DC" },
      { norma: "PN-HD 60364-5-52", czego: "rezystywność kabla w warunkach ruchowych" },
    ],
    bledy: [],
  };
}

// --- strona AC (wyjście falownika) -------------------------------------------

export interface FalownikACWejscie {
  mocAC_W: number;
  liczba_faz: PhaseCount;
  cos_phi: number;
  dlugosc_m: number;
  sposob_ulozenia: LayingMethod;
  temperatura_otoczenia_C?: number;
  obwodow_w_wiazce?: number;
}

/** Dobiera przewód i zabezpieczenie strony AC — wprost przez `sizeCircuit`,
 *  tak samo jak każdy inny obwód dedykowany w aplikacji. */
export function dobierzPrzewodACFalownika(w: FalownikACWejscie) {
  return sizeCircuit({
    id: "falownik-ac",
    nazwa: "Wyjście AC falownika",
    typ: "dedykowany",
    moc_W: w.mocAC_W,
    liczba_faz: w.liczba_faz,
    cos_phi: w.cos_phi,
    dlugosc_m: w.dlugosc_m > 0 ? w.dlugosc_m : undefined,
    sposob_ulozenia: w.sposob_ulozenia,
    temperatura_otoczenia_C: w.temperatura_otoczenia_C,
    obwodow_w_wiazce: w.obwodow_w_wiazce,
  });
}
