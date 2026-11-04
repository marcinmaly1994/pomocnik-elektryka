import { K_ZYLA, type Izolacja, type Material } from "@/lib/norms/conductors";
import { formatLiczba } from "@/lib/liczby";
import { KRYTERIUM_LABELS, type Kryterium } from "./fullSizing";
import { OCENA_GRANICZNA_PCT, type Ocena } from "./result";
import { ikZImpedancjiPetli, ocenWarunekCieplny, TOLERANCJA_IK_ZS } from "./warunekCieplny";

/**
 * Cztery kryteria doboru obwodu, oceniane na gotowym wyniku doboru.
 *
 * Norma nie pyta „jaki przekrój wystarczy pod obciążalność", tylko czy obwód spełnia
 * WSZYSTKIE cztery warunki naraz. Dobór (`lib/panel/sizing.ts`) pilnuje dwóch
 * pierwszych z definicji — szuka przekroju, który je spełnia — ale użytkownik i tak
 * nie widział, KTÓRE kryterium było wiążące ani jak blisko granicy wypadł. Dwa
 * pozostałe wymagają danych spoza doboru (impedancja pętli, prąd zwarcia), więc
 * dotąd nie było ich w kalkulatorze przekroju w ogóle.
 *
 * Kryterium bez danych jest NIEOCENIONE, nigdy „spełnione". Zielony ptaszek przy
 * warunku, którego nikt nie sprawdził, jest gorszy niż jego brak.
 */

export type StanKryterium = "ok" | "blad" | "nieoceniono";

export interface OcenaKryterium {
  kryterium: Kryterium;
  etykieta: string;
  stan: StanKryterium;
  /** Jedno zdanie: co porównano i z czym. */
  opis: string;
  /** Zapas do granicy [%] — tylko dla kryteriów, które dało się ocenić. */
  margines_pct?: number;
}

export interface WejscieKryteriow {
  Ib_A: number | null;
  In_A: number | null;
  Iz_A: number | null;
  spadek_pct: number | null;
  spadek_limit_pct: number;
  /** Maksymalna dopuszczalna impedancja pętli [Ω] — z doboru aparatu. */
  Zs_max_Ohm: number | null;
  /** Impedancja pętli w tym punkcie [Ω] — zmierzona albo policzona osobno. */
  Zs_Ohm?: number;
  przekroj_mm2: number | null;
  material: Material;
  izolacja: Izolacja;
  /** Spodziewany prąd zwarcia [A] i czas wyłączenia [s] — do warunku cieplnego.
   *  Bez Ik, a z podaną Zs, prąd zwarcia liczy się z pętli (`ikZImpedancjiPetli`). */
  Ik_A?: number;
  czas_s?: number;
  /** Prąd zadziałania wyzwalacza elektromagnetycznego dobranego aparatu [A]. */
  Ia_A?: number | null;
  /** Energia przenoszona I²t aparatu z karty katalogowej [A²s] — dla Ik ≥ Ia. */
  I2t_A2s?: number;
}

/** Zapas do granicy w procentach: ile jeszcze zostało do wartości granicznej. */
function margines(wartosc: number, granica: number): number {
  return granica > 0 ? (1 - wartosc / granica) * 100 : 0;
}

function liczba(v: number, miejsca = 2): string {
  return v.toFixed(miejsca).replace(".", ",");
}

/**
 * Minimalny przekrój z warunku cieplnego: S ≥ Ik·√t / k (PN-HD 60364-4-43).
 * `k` zależy od materiału żyły i izolacji — 115 dla Cu/PVC, 143 dla Cu/XLPE.
 */
export function minPrzekrojZwarciowy(Ik_A: number, czas_s: number, material: Material, izolacja: Izolacja): number {
  const k = K_ZYLA[material][izolacja];
  return (Ik_A * Math.sqrt(czas_s)) / k;
}

export function ocenKryteria(w: WejscieKryteriow): OcenaKryterium[] {
  const oceny: OcenaKryterium[] = [];

  // 1. Obciążalność długotrwała: Ib ≤ In ≤ Iz.
  if (w.Ib_A !== null && w.In_A !== null && w.Iz_A !== null) {
    const ok = w.Ib_A <= w.In_A && w.In_A <= w.Iz_A;
    oceny.push({
      kryterium: "obciazalnosc",
      etykieta: KRYTERIUM_LABELS.obciazalnosc,
      stan: ok ? "ok" : "blad",
      opis: `Ib ${liczba(w.Ib_A, 1)} A ≤ In ${liczba(w.In_A, 0)} A ≤ Iz ${liczba(w.Iz_A, 1)} A`,
      margines_pct: margines(w.In_A, w.Iz_A),
    });
  } else {
    oceny.push({
      kryterium: "obciazalnosc",
      etykieta: KRYTERIUM_LABELS.obciazalnosc,
      stan: "nieoceniono",
      opis: "Brak prądu obliczeniowego albo dobranego aparatu.",
    });
  }

  // 2. Spadek napięcia — limit dotyczy CAŁEJ drogi od złącza (patrz `spadek_wlz_pct`).
  if (w.spadek_pct !== null) {
    const ok = w.spadek_pct <= w.spadek_limit_pct;
    oceny.push({
      kryterium: "spadek_napiecia",
      etykieta: KRYTERIUM_LABELS.spadek_napiecia,
      stan: ok ? "ok" : "blad",
      opis: `ΔU ${liczba(w.spadek_pct)}% przy limicie ${liczba(w.spadek_limit_pct, 1)}%`,
      margines_pct: margines(w.spadek_pct, w.spadek_limit_pct),
    });
  } else {
    oceny.push({
      kryterium: "spadek_napiecia",
      etykieta: KRYTERIUM_LABELS.spadek_napiecia,
      stan: "nieoceniono",
      opis: "Bez długości trasy nie ma czego liczyć.",
    });
  }

  // 3. Ochrona przeciwporażeniowa: Zs ≤ Zs_max. Bez podanej Zs zostaje sama
  //    WYMAGANA wartość — dobór nie zna impedancji sieci przed rozdzielnicą.
  if (w.Zs_max_Ohm !== null && typeof w.Zs_Ohm === "number" && w.Zs_Ohm > 0) {
    const ok = w.Zs_Ohm <= w.Zs_max_Ohm;
    oceny.push({
      kryterium: "ochrona_przeciwporazeniowa",
      etykieta: KRYTERIUM_LABELS.ochrona_przeciwporazeniowa,
      stan: ok ? "ok" : "blad",
      opis: `Zs ${liczba(w.Zs_Ohm)} Ω ≤ Zs max ${liczba(w.Zs_max_Ohm)} Ω`,
      margines_pct: margines(w.Zs_Ohm, w.Zs_max_Ohm),
    });
  } else {
    oceny.push({
      kryterium: "ochrona_przeciwporazeniowa",
      etykieta: KRYTERIUM_LABELS.ochrona_przeciwporazeniowa,
      stan: "nieoceniono",
      opis:
        w.Zs_max_Ohm !== null
          ? `Podaj impedancję pętli w tym punkcie — wymagane Zs ≤ ${liczba(w.Zs_max_Ohm)} Ω.`
          : "Brak dobranego aparatu, więc nie ma z czym porównywać.",
    });
  }

  // 4. Wytrzymałość zwarciowa cieplna — patrz `ocenWarunekCieplny`.
  oceny.push(ocenKryteriumCieplne(w));

  return oceny;
}

function ocenKryteriumCieplne(w: WejscieKryteriow): OcenaKryterium {
  const baza = { kryterium: "wytrzymalosc_zwarciowa" as const, etykieta: KRYTERIUM_LABELS.wytrzymalosc_zwarciowa };
  const zsPodana = typeof w.Zs_Ohm === "number" && w.Zs_Ohm > 0;
  const ikPodany = typeof w.Ik_A === "number" && w.Ik_A > 0;
  // Ik i Zs to dwa opisy tej samej pętli. Bez Ik liczymy go z Zs, zamiast żądać
  // drugiej, niezależnej liczby, którą łatwo wpisać sprzeczną z pierwszą.
  const ikZZs = zsPodana ? ikZImpedancjiPetli(w.Zs_Ohm!) : null;
  const Ik = ikPodany ? w.Ik_A! : ikZZs;

  if (w.przekroj_mm2 === null || Ik === null || !(Ik > 0)) {
    return {
      ...baza,
      stan: "nieoceniono",
      opis: "Podaj impedancję pętli albo spodziewany prąd zwarcia — bez nich warunku cieplnego nie da się sprawdzić.",
    };
  }

  const zrodloIk = ikPodany ? "" : ` (z Zs: 0,95·230/${liczba(w.Zs_Ohm!)} Ω)`;
  const sprzecznosc =
    ikPodany && ikZZs !== null && Math.abs(Ik - ikZZs) / ikZZs > TOLERANCJA_IK_ZS
      ? ` Uwaga: podany Ik ${liczba(Ik, 0)} A nie zgadza się z Zs ${liczba(w.Zs_Ohm!)} Ω (z niej wychodzi ${liczba(ikZZs, 0)} A) — sprawdź, czy obie wartości dotyczą tego samego punktu.`
      : "";

  const wynik = ocenWarunekCieplny({
    Ik_A: Ik,
    czas_s: w.czas_s,
    przekroj_mm2: w.przekroj_mm2,
    k: K_ZYLA[w.material][w.izolacja],
    Ia_A: w.Ia_A,
    I2t_A2s: w.I2t_A2s,
  });

  switch (wynik.tryb) {
    case "brak_czasu":
      return { ...baza, stan: "nieoceniono", opis: `Ik ${liczba(Ik, 0)} A${zrodloIk} — podaj czas wyłączenia z charakterystyki aparatu.${sprzecznosc}` };
    case "brak_I2t":
      return {
        ...baza,
        stan: "nieoceniono",
        opis:
          `Ik ${liczba(Ik, 0)} A${zrodloIk} ≥ Ia ${liczba(w.Ia_A!, 0)} A — wyłącznik zadziała elektromagnetycznie w czasie poniżej 0,1 s, ` +
          `więc wzór Ik·√t/k z czasem dopuszczalnym nie ma tu zastosowania. Porównaj k²S² = ${liczba(wynik.k2S2_A2s, 0)} A²s ` +
          `z energią przenoszoną I²t z karty katalogowej aparatu (pole „I²t aparatu").${sprzecznosc}`,
      };
    case "energia":
      return {
        ...baza,
        stan: wynik.ok ? "ok" : "blad",
        opis: `k²S² ${liczba(wynik.k2S2_A2s, 0)} A²s ${wynik.ok ? "≥" : "<"} I²t aparatu ${liczba(wynik.I2t_A2s, 0)} A²s (Ik ${liczba(Ik, 0)} A${zrodloIk} ≥ Ia — wyłączenie elektromagnetyczne).${sprzecznosc}`,
        margines_pct: margines(wynik.I2t_A2s, wynik.k2S2_A2s),
      };
    case "adiabatyczny":
      return {
        ...baza,
        stan: wynik.ok ? "ok" : "blad",
        opis: `S ${liczba(w.przekroj_mm2, 1)} mm² ${wynik.ok ? "≥" : "<"} Ik·√t/k ${liczba(wynik.minS_mm2)} mm² (Ik ${liczba(Ik, 0)} A${zrodloIk}, t ${liczba(w.czas_s!)} s).${sprzecznosc}`,
        margines_pct: wynik.minS_mm2 > 0 ? margines(wynik.minS_mm2, w.przekroj_mm2) : 0,
      };
  }
}

/**
 * Cztery kryteria sprowadzone do JEDNEJ oceny — tej samej koperty, której używają
 * pozostałe kalkulatory (`Ocena` z `result.ts`).
 *
 * Dzięki temu pasek werdyktu nad wynikiem wygląda i mówi tak samo niezależnie od
 * tego, czy patrzymy na spadek napięcia, czy na komplet kryteriów obwodu — a nie
 * jak dotąd: tam kolorowy pasek, tutaj szary akapit na dole karty.
 *
 * Margines to zawsze NAJGORSZE z kryteriów, bo o bezpieczeństwie obwodu decyduje
 * warunek najciaśniejszy, a nie średnia z czterech.
 */
export function podsumowanieObwodu(oceny: OcenaKryterium[]): Ocena {
  const marginesy = (lista: OcenaKryterium[]) =>
    lista.map((o) => o.margines_pct).filter((m): m is number => typeof m === "number");
  const najgorszy = (lista: OcenaKryterium[]) => {
    const m = marginesy(lista);
    return m.length > 0 ? Math.min(...m) : null;
  };

  const bledne = oceny.filter((o) => o.stan === "blad");
  if (bledne.length > 0) {
    return {
      verdict: "niespelniony",
      margines_pct: najgorszy(bledne),
      komunikat: `Nie spełniono: ${bledne.map((o) => o.etykieta.toLowerCase()).join(", ")}. Obwód w tej postaci nie przejdzie odbioru.`,
    };
  }

  const brakujace = oceny.filter((o) => o.stan === "nieoceniono");
  if (brakujace.length > 0) {
    return {
      verdict: "nieoceniany",
      // BEZ marginesu: liczba obok „bez oceny" sugerowałaby, że jednak coś oceniono.
      // Zapasy sprawdzonych kryteriów są widoczne przy nich samych, na liście niżej.
      margines_pct: null,
      komunikat: `Sprawdzono ${oceny.length - brakujace.length} z ${oceny.length} kryteriów — bez oceny: ${brakujace
        .map((o) => o.etykieta.toLowerCase())
        .join(", ")}. Uzupełnij brakujące dane, żeby sprawdzić komplet.`,
    };
  }

  const margines = najgorszy(oceny);
  if (margines !== null && margines < OCENA_GRANICZNA_PCT) {
    return {
      verdict: "graniczny",
      margines_pct: margines,
      komunikat: `Wszystkie cztery kryteria spełnione, ale najciaśniejsze ma zapas tylko ${formatLiczba(margines, 0)}%. Przy niepewności danych wejściowych to wynik graniczny.`,
    };
  }
  return {
    verdict: "spelniony",
    margines_pct: margines,
    komunikat: "Wszystkie cztery kryteria sprawdzone i spełnione.",
  };
}
