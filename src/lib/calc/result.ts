/**
 * Wspólna koperta wyniku kalkulatorów inżynierskich.
 *
 * Wymaganie ze specyfikacji (pkt 3.3): każdy kalkulator zwraca nie samą liczbę,
 * ale też wzór z PODSTAWIONYMI wartościami krok po kroku, ocenę warunku, listę
 * przyjętych założeń i odwołania do źródeł normatywnych. Powód jest praktyczny,
 * nie kosmetyczny: wynik doboru instalacji musi dać się odtworzyć z normą w ręku
 * przez osobę, która tego kalkulatora nie pisała — inaczej nie ma jak go
 * sprawdzić ani podpisać.
 *
 * Dlatego `kroki` są częścią WYNIKU, a nie tekstem sklejanym w UI: gdyby żyły
 * w komponencie, rozjechałyby się z obliczeniem przy pierwszej zmianie wzoru,
 * a testy jednostkowe nie miałyby czego pilnować.
 */

/** Ocena warunku normatywnego. `graniczny` to osobny stan, nie odmiana „ok" —
 *  patrz `OCENA_GRANICZNA_PCT`. */
export type Verdict = "spelniony" | "graniczny" | "niespelniony" | "nieoceniany";

/**
 * Poniżej tego marginesu wynik jest GRANICZNY, a nie „OK" (spec pkt 3.4).
 * Uzasadnienie: dane wejściowe instalacji (długość trasy, temperatura, cosφ)
 * same są przybliżeniem, więc kilka procent zapasu nie znaczy „spełnia".
 */
export const OCENA_GRANICZNA_PCT = 10;

/** Jeden krok rachunku — wzór ogólny, to samo z podstawionymi liczbami, wynik. */
export interface Krok {
  /** Co liczymy, po ludzku. */
  opis: string;
  /** Wzór ogólny, np. „ΔU = 2·L·P / (γ·S·U)". */
  wzor: string;
  /** Ten sam wzór z wstawionymi wartościami, np. „2·30·2000 / (55·2,5·230)". */
  podstawienie: string;
  /** Wynik kroku z jednostką, np. „3,79 V". */
  wynik: string;
}

/** Odwołanie do źródła liczby albo warunku. */
export interface Zrodlo {
  norma: string;
  /** Tablica/punkt, np. „tabl. B.52.4" — jeśli znany. */
  miejsce?: string;
  /** Czego dotyczy, np. „obciążalność długotrwała". */
  czego?: string;
}

export interface Ocena {
  verdict: Verdict;
  /**
   * Margines w procentach względem WARTOŚCI WYMAGANEJ, ze znakiem:
   * dodatni = zapas, ujemny = przekroczenie. `null`, gdy warunku nie oceniano.
   * Definicja per kalkulator (jest opisana przy każdym), bo dla warunku
   * „X ≤ limit" i „X ≥ minimum" liczy się ją inaczej.
   */
  margines_pct: number | null;
  komunikat: string;
}

/** Twardy błąd walidacji — wynik NIE powstaje (spec pkt 3.5: żadnej ekstrapolacji). */
export interface CalcError {
  /** Kod maszynowy, stabilny dla testów. */
  code: string;
  /** Pole wejściowe, którego dotyczy — do podświetlenia w formularzu. */
  pole?: string;
  message: string;
}

export interface CalcResult<T> {
  /** Wielkości wynikowe w jednostkach SI (konwersja dopiero na prezentacji). */
  wartosci: T | null;
  kroki: Krok[];
  ocena: Ocena | null;
  zalozenia: string[];
  zrodla: Zrodlo[];
  /** Niepusta lista oznacza, że `wartosci` są `null`. */
  bledy: CalcError[];
}

/** Wynik nie do policzenia — same błędy walidacji. */
export function bladWyniku<T>(bledy: CalcError[], zalozenia: string[] = []): CalcResult<T> {
  return { wartosci: null, kroki: [], ocena: null, zalozenia, zrodla: [], bledy };
}

/**
 * Dane, których nie da się porównać, dają BRAK OCENY — nigdy werdyktu.
 *
 * Dwa przypadki i oba kończyły się wcześniej źle. Wartość nieskończona albo `NaN`
 * (dzielenie przez zero gdzieś wyżej) przechodziła przez oba porównania — `NaN > x`
 * i `NaN < x` są fałszywe — i wypadała z funkcji jako „warunek SPEŁNIONY" z
 * marginesem `NaN`. Limit zerowy albo ujemny dawał z kolei `margines = 0`, czyli
 * pewny siebie werdykt oparty na niczym.
 *
 * Zielony ptaszek przy warunku, którego nikt nie sprawdził, jest gorszy niż jego
 * brak — ta sama zasada, co przy czterech kryteriach doboru obwodu.
 */
function bezOceny(co: string, czegoBrak: string): Ocena {
  return {
    verdict: "nieoceniany",
    margines_pct: null,
    komunikat: `Nie ma jak ocenić warunku „${co}": ${czegoBrak}`,
  };
}

/**
 * Ocena warunku „wartość ≤ limit" (spadek napięcia, impedancja pętli, prąd
 * względem obciążalności). Margines liczony względem LIMITU.
 */
export function ocenPodLimitem(wartosc: number, limit: number, opis: { co: string; jednostka: string }): Ocena {
  if (!Number.isFinite(wartosc) || !Number.isFinite(limit) || limit <= 0) {
    return bezOceny(opis.co, "wartość musi być liczbą skończoną, a limit liczbą większą od zera.");
  }
  const margines = ((limit - wartosc) / limit) * 100;
  const fmt = (v: number) => formatLiczba(v, 2);
  if (wartosc > limit) {
    return {
      verdict: "niespelniony",
      margines_pct: margines,
      komunikat: `${opis.co} ${fmt(wartosc)} ${opis.jednostka} przekracza dopuszczalne ${fmt(limit)} ${opis.jednostka} o ${fmt(wartosc - limit)} ${opis.jednostka}.`,
    };
  }
  if (margines < OCENA_GRANICZNA_PCT) {
    return {
      verdict: "graniczny",
      margines_pct: margines,
      komunikat: `${opis.co} ${fmt(wartosc)} ${opis.jednostka} mieści się w limicie ${fmt(limit)} ${opis.jednostka}, ale zapas to tylko ${fmt(margines)}%. Przy niepewności danych wejściowych to wynik graniczny — nie przyjmuj go jako spełniony bez sprawdzenia założeń.`,
    };
  }
  return {
    verdict: "spelniony",
    margines_pct: margines,
    komunikat: `${opis.co} ${fmt(wartosc)} ${opis.jednostka} przy limicie ${fmt(limit)} ${opis.jednostka} — zapas ${fmt(margines)}%.`,
  };
}

/** Liczba do prezentacji: przecinek dziesiętny (polska norma zapisu), zadana precyzja. */
export function formatLiczba(v: number, miejsca: number): string {
  if (!Number.isFinite(v)) return "—";
  return v.toFixed(miejsca).replace(".", ",");
}
