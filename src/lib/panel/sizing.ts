/**
 * Deterministyczny dobór przekroju i zabezpieczenia pojedynczego obwodu.
 *
 * Wszystkie liczby pochodzą z tablic w `norms.ts` — ta warstwa tylko je składa
 * i iteruje po przekrojach. Nic tu nie jest „przyjęte z doświadczenia": jeżeli
 * czegoś nie da się policzyć (brak mocy, brak długości), funkcja NIE zgaduje,
 * tylko zwraca ostrzeżenie i zostawia pole `null`.
 *
 * Celowo bez zależności od React, store'a i typów planu — wejściem jest czysty
 * opis obwodu, dzięki czemu ten sam kod obsłuży obwody wyprowadzone z rysunku
 * i obwody podane wprost z zewnątrz.
 */

import {
  BREAKER_RATINGS,
  CURVE_MULTIPLIER,
  LAYING_METHOD_LABELS,
  limitSpadkuPct,
  REFERENCE_METHOD_FOR,
  RHO_CU_70C,
  SECTIONS,
  U0,
  baseAmpacity,
  groupingFactor,
  temperatureFactor,
  type Curve,
  type LayingMethod,
  type ReferenceMethod,
  type Section,
} from "./norms";
import { C_NAPIECIOWE } from "@/lib/norms/conductors";

export type CircuitKind = "oswietlenie" | "gniazda" | "dedykowany";
export type PhaseCount = "1" | "3";
export type PhaseAssignment = "L1" | "L2" | "L3" | "auto";
export type SizingStatus = "ok" | "warn" | "error";

export interface SizingWarning {
  /** Kod maszynowy — stabilny, do testów i filtrowania w UI. */
  code: string;
  level: "warn" | "error";
  message: string;
}

/** Opis obwodu na wejściu doboru. Pola opcjonalne oznaczają „może brakować" — ich
 *  brak daje ostrzeżenie, a nie domyślną wartość wziętą z powietrza. */
export interface CircuitSpec {
  id: string;
  nazwa: string;
  typ: CircuitKind;
  pomieszczenie?: string;
  strefa_mokra?: boolean;
  /** Moc odbiornika [W]. Alternatywa dla `prad_A` — wystarczy jedno z dwóch. */
  moc_W?: number;
  /** Prąd obliczeniowy [A], jeśli znany wprost (ma pierwszeństwo przed `moc_W`). */
  prad_A?: number;
  liczba_faz: PhaseCount;
  faza?: PhaseAssignment;
  /** Długość trasy [m] — bez niej nie da się sprawdzić spadku napięcia. */
  dlugosc_m?: number;
  sposob_ulozenia: LayingMethod;
  temperatura_otoczenia_C?: number;
  /** Odbiornik z rozruchem silnikowym (lodówka, pompa, klimatyzacja) → charakterystyka C. */
  rozruch_silnikowy?: boolean;
  /** Ile obwodów biegnie w tej samej wiązce/rurce — wpływa na współczynnik grupowania. */
  obwodow_w_wiazce?: number;
  /** Współczynnik mocy. Dla odbiorników rezystancyjnych 1,0. */
  cos_phi?: number;
  /**
   * Spadek napięcia zużyty JUŻ na WLZ [%] — odcinek od złącza do rozdzielnicy.
   *
   * Limit 3/5% dotyczy CAŁEJ drogi od złącza do odbiornika, a nie samego obwodu
   * odbiorczego. Licząc obwód w oderwaniu od WLZ, dopuszczaliśmy instalacje, które
   * jako całość limit przekraczają — i to tym bardziej, im dłuższa jest WLZ.
   */
  spadek_wlz_pct?: number;
  /** Instalacja zasilana z własnej stacji transformatorowej — budżet większy o 2 p.p. */
  wlasna_stacja?: boolean;
}

export interface SizedCircuit {
  id: string;
  nazwa: string;
  typ: CircuitKind;
  pomieszczenie?: string;
  liczba_faz: PhaseCount;
  faza: PhaseAssignment;
  /** Prąd obliczeniowy [A]. `null`, gdy nie podano ani mocy, ani prądu. */
  Ib_A: number | null;
  przekroj_mm2: Section | null;
  /** Opis kabla w konwencji używanej w kosztorysie, np. „YDYp 3x2,5 mm²". */
  kabel: string | null;
  aparat: {
    charakterystyka: Curve;
    In_A: number;
    bieguny: "1P" | "3P";
  } | null;
  /** Obciążalność po współczynnikach k1·k2 [A]. */
  Iz_A: number | null;
  wspolczynniki: { k1_temperatura: number; k2_grupowanie: number };
  spadek_napiecia_pct: number | null;
  /** Limit dla CAŁEJ drogi od złącza — obwód plus WLZ. */
  spadek_napiecia_limit_pct: number;
  /** Spadek przyjęty na WLZ [%] — 0, gdy nie podano. */
  spadek_wlz_pct: number;
  /** Suma: WLZ + obwód. To ona jest porównywana z limitem. */
  spadek_calkowity_pct: number | null;
  /** Prąd zadziałania wyzwalacza magnetycznego [A]. */
  Ia_A: number | null;
  /** Maksymalna dopuszczalna impedancja pętli zwarcia [Ω]. */
  Zs_max_Ohm: number | null;
  rcd_typ: "A" | "B" | "F";
  status: SizingStatus;
  ostrzezenia: SizingWarning[];
}

/** Minimalny przekrój wynikający z przeznaczenia obwodu (PN-HD 60364-5-52 tabl. 52.3
 *  + praktyka: obwody gniazdowe nigdy poniżej 2,5 mm²). */
const MIN_SECTION_FOR: Record<CircuitKind, Section> = {
  oswietlenie: 1.5,
  gniazda: 2.5,
  dedykowany: 2.5,
};

/**
 * Typowy prąd znamionowy zabezpieczenia dla danego rodzaju obwodu.
 *
 * Obwód wymiaruje się pod DOCELOWĄ obsadę, a nie pod moc chwilowo do niego
 * podpiętą: obwód oświetleniowy z dwiema lampkami po 8 W dostaje B10, a nie B6,
 * bo za rok wisi tam pięć opraw. Dobór schodzi poniżej tej wartości tylko wtedy,
 * gdy obciążalność przewodu na to nie pozwala — i wtedy mówi o tym wprost.
 */
const PREFERRED_RATING_FOR: Record<CircuitKind, number> = {
  oswietlenie: 10,
  gniazda: 16,
  dedykowany: 16,
};

/** Prąd obliczeniowy z podanego prądu albo z mocy. `null` = brak danych do wyliczenia. */
function resolveCurrent(spec: CircuitSpec, phases: PhaseCount, cosPhi: number): number | null {
  if (typeof spec.prad_A === "number" && spec.prad_A > 0) return spec.prad_A;
  if (typeof spec.moc_W === "number" && spec.moc_W > 0) return currentFromPower(spec.moc_W, phases, cosPhi);
  return null;
}

/** Liczba żył w kablu wg liczby faz — do opisu typu „YDYp 3x2,5 mm²". */
function coreCount(phases: PhaseCount): number {
  return phases === "3" ? 5 : 3; // 3F: L1+L2+L3+N+PE, 1F: L+N+PE
}

function formatSection(s: Section): string {
  return String(s).replace(".", ",");
}

function cableLabel(section: Section, phases: PhaseCount): string {
  return `YDYp ${coreCount(phases)}x${formatSection(section)} mm²`;
}

/** ΔU% — dla 1 fazy liczone po pętli (2·L), dla 3 faz międzyfazowo (√3·L). */
export function voltageDropPct(lengthM: number, currentA: number, section: number, phases: PhaseCount): number {
  if (!(section > 0)) return 0;
  const U = phases === "3" ? 400 : 230;
  const dropV =
    phases === "3"
      ? (Math.sqrt(3) * lengthM * currentA * RHO_CU_70C) / section
      : (2 * lengthM * currentA * RHO_CU_70C) / section;
  return (dropV / U) * 100;
}

/** Prąd obliczeniowy z mocy: I = P/(U·cosφ) dla 1F, P/(√3·U·cosφ) dla 3F. */
export function currentFromPower(powerW: number, phases: PhaseCount, cosPhi: number): number {
  const U = phases === "3" ? 400 : 230;
  const denom = phases === "3" ? Math.sqrt(3) * U * cosPhi : U * cosPhi;
  return denom > 0 ? powerW / denom : 0;
}

/**
 * Zs_max z prądu zadziałania — jedno miejsce dla całej aplikacji.
 *
 * Dobór w Rozdzielnicy, kalkulator pętli zwarcia i protokół pomiarowy muszą podawać
 * TĘ SAMĄ liczbę: gdyby dobór dopuszczał 2,88 Ω, a protokół wymagał 2,73 Ω, ten sam
 * obwód przechodziłby projekt i oblewał odbiór.
 */
/**
 * Zapas pomiarowy dla ODBIORU: zmierzona Zs powinna zmieścić się w 0,8 limitu normy.
 *
 * Pomiar robi się na zimnym przewodzie i przy takim napięciu, jakie akurat jest
 * w sieci. Nagrzany przewód ma większą rezystancję, więc obwód zmierzony dokładnie
 * na granicy wypada poza nią przy pierwszym dłuższym obciążeniu. Ten próg nie
 * zastępuje limitu normy — pokazywany jest OBOK niego.
 */
export const ZAPAS_POMIAROWY = 0.8;

export function zsMaxDlaIa(ia: number): number {
  return ia > 0 ? (C_NAPIECIOWE.min * U0) / ia : 0;
}

export interface LoopImpedanceResult {
  /** Prąd zadziałania wyzwalacza magnetycznego [A]. */
  ia: number;
  /** Maksymalna dopuszczalna impedancja pętli zwarcia [Ω]. */
  zsMax: number;
}

/**
 * Maksymalna dopuszczalna impedancja pętli zwarcia [Ω].
 *
 *   Zs_max = Cmin · U0 / Ia,   Ia = k · In   (k zależne od charakterystyki)
 *
 * Współczynnik napięciowy Cmin = 0,95 (PN-EN 60909-0) był tu wcześniej pominięty,
 * czyli liczony jak 1,0 — a to jest błąd W STRONĘ NIEBEZPIECZNĄ. Napięcie w sieci
 * bywa niższe od znamionowego, więc prąd zwarcia jest mniejszy niż przy 230 V;
 * pomijając to, dopuszczaliśmy pętlę o 5% dłuższą niż wolno, przy której
 * zabezpieczenie może nie zadziałać w wymaganym czasie. Dla B16 daje to 2,73 Ω
 * zamiast 2,88 Ω.
 *
 * Ten sam współczynnik obowiązuje wszędzie, gdzie liczy się skuteczność ochrony
 * przeciwporażeniowej — patrz `C_NAPIECIOWE.min` w `lib/norms/conductors.ts`
 * i `wspolczynnikC` w `lib/calc/shortCircuit.ts`.
 *
 * Osobna funkcja od `sizeCircuit`: weryfikacja pomiarowa Zs zakłada już
 * ZAINSTALOWANY wyłącznik o znanym In — nie ma tu nic do dobierania, tylko
 * sprawdzenie warunku samoczynnego wyłączenia zasilania na podstawie zmierzonej
 * wartości. Charakterystyka jako zwykły `string` (nie `Curve`), bo wywołujące
 * miejsca bywają formularzem albo zapisanym protokołem, gdzie litera to
 * dowolny tekst — nieznana wartość liczy się jak B (k=5), tak jak wcześniej
 * w `lib/electrical.ts`.
 */
export function zsMaxForBreaker(curve: string, inA: number): LoopImpedanceResult {
  const k = CURVE_MULTIPLIER[curve.toUpperCase() as Curve] ?? CURVE_MULTIPLIER.B;
  const ia = k * inA;
  return { ia, zsMax: ia > 0 ? zsMaxDlaIa(ia) : 0 };
}

/**
 * Dobiera przekrój i zabezpieczenie tak, żeby jednocześnie spełnić:
 *  - Ib ≤ In ≤ Iz  (PN-HD 60364-4-43; dla wyłączników nadprądowych warunek
 *    I2 ≤ 1,45·Iz jest wtedy spełniony automatycznie, bo I2 = 1,45·In),
 *  - ΔU ≤ 3% dla oświetlenia i 5% dla pozostałych obwodów.
 *
 * Szuka NAJMNIEJSZEGO przekroju spełniającego oba warunki naraz — dlatego pętla
 * po przekrojach, a nie dwa niezależne dobory (przekrój dobrany tylko pod
 * obciążalność potrafi nie przejść spadku napięcia na długiej trasie i odwrotnie).
 */
export function sizeCircuit(spec: CircuitSpec): SizedCircuit {
  const warnings: SizingWarning[] = [];
  const phases = spec.liczba_faz;
  const cosPhi = spec.cos_phi ?? (spec.typ === "oswietlenie" ? 0.95 : 1);
  const ambientC = spec.temperatura_otoczenia_C ?? 30;
  const bundle = spec.obwodow_w_wiazce ?? 1;
  const method = REFERENCE_METHOD_FOR[spec.sposob_ulozenia];
  const loadedCores: 2 | 3 = phases === "3" ? 3 : 2;
  const curve: Curve = spec.rozruch_silnikowy ? "C" : "B";
  // Limit dotyczy CALEJ drogi od zlacza: budzet obwodu to limit MINUS to, co zjadla
  // juz WLZ. Bez tego dwa poprawne osobno odcinki dawaly razem instalacje ponad norme.
  const dropWlz = Math.max(0, spec.spadek_wlz_pct ?? 0);
  const dropLimit = limitSpadkuPct(spec.typ === "oswietlenie", spec.wlasna_stacja);
  const budzetObwodu = Math.max(0, dropLimit - dropWlz);

  const k1 = temperatureFactor(ambientC);
  const k2 = groupingFactor(bundle);

  // Typ RCD: elektronika i indukcja generują składową stałą pulsującą → typ A to
  // minimum; ładowarka EV i falowniki potrafią dać prąd gładkostały → typ B.
  const rcdType: "A" | "B" | "F" = /ładowarka|ev\b|falownik|fotowolta/i.test(spec.nazwa) ? "B" : "A";

  const base = (): SizedCircuit => ({
    spadek_wlz_pct: dropWlz,
    spadek_calkowity_pct: null,
    id: spec.id,
    nazwa: spec.nazwa,
    typ: spec.typ,
    pomieszczenie: spec.pomieszczenie,
    liczba_faz: phases,
    faza: spec.faza ?? "auto",
    Ib_A: null,
    przekroj_mm2: null,
    kabel: null,
    aparat: null,
    Iz_A: null,
    wspolczynniki: { k1_temperatura: k1, k2_grupowanie: k2 },
    spadek_napiecia_pct: null,
    spadek_napiecia_limit_pct: dropLimit,
    Ia_A: null,
    Zs_max_Ohm: null,
    rcd_typ: rcdType,
    status: "error",
    ostrzezenia: warnings,
  });

  // --- prąd obliczeniowy -----------------------------------------------------
  const ibResolved = resolveCurrent(spec, phases, cosPhi);
  if (ibResolved === null) {
    warnings.push({
      code: "BRAK_MOCY",
      level: "error",
      message: `Obwód „${spec.nazwa}" nie ma podanej ani mocy, ani prądu — nie da się dobrać zabezpieczenia. Uzupełnij moc odbiorników.`,
    });
    return base();
  }
  // Jawnie typowana stała, a nie zawężony `number | null`: TypeScript nie przenosi
  // zawężenia z control flow do wnętrza zagnieżdżonej funkcji `pick` niżej.
  const Ib: number = ibResolved;

  if (spec.strefa_mokra === false && /łazienk|prysznic|wanna/i.test(spec.pomieszczenie ?? "")) {
    warnings.push({
      code: "STREFA_MOKRA_NIESPOJNA",
      level: "warn",
      message: `Obwód w pomieszczeniu „${spec.pomieszczenie}" oznaczono jako poza strefą mokrą — sprawdź, czy to na pewno prawda.`,
    });
  }

  // --- iteracja po przekrojach ----------------------------------------------
  const minSection = MIN_SECTION_FOR[spec.typ];
  const candidates = SECTIONS.filter((s) => s >= minSection);

  interface Pick {
    section: Section;
    In: number;
    Iz: number;
    drop: number | null;
  }

  const hasLength = typeof spec.dlugosc_m === "number" && spec.dlugosc_m > 0;

  /** Najmniejszy przekrój, dla którego istnieje In ≥ floorA przy In ≤ Iz, a spadek
   *  napięcia mieści się w limicie. Bez podanej długości warunek spadku pomijamy. */
  function pick(floorA: number): Pick | null {
    for (const section of candidates) {
      const Iz = baseAmpacity(section, method, loadedCores) * k1 * k2;
      const In = BREAKER_RATINGS.find((r) => r >= floorA && r <= Iz);
      if (In === undefined) continue; // ten przekrój nie udźwignie wymaganego prądu
      if (!hasLength) return { section, In, Iz, drop: null };
      const drop = voltageDropPct(spec.dlugosc_m!, Ib, section, phases);
      if (drop <= budzetObwodu) return { section, In, Iz, drop };
    }
    return null;
  }

  const preferred = PREFERRED_RATING_FOR[spec.typ];
  let chosen = pick(Math.max(Ib, preferred));
  let downgraded = false;
  if (!chosen) {
    // Typowy prąd znamionowy się nie mieści (np. mocne grupowanie albo wysoka
    // temperatura) — schodzimy do In wynikającego wprost z prądu obliczeniowego.
    chosen = pick(Ib);
    downgraded = chosen !== null;
  }

  if (!chosen) {
    const carriesIb = candidates.some((section) => {
      const Iz = baseAmpacity(section, method, loadedCores) * k1 * k2;
      return BREAKER_RATINGS.some((r) => r >= Ib && r <= Iz);
    });
    const biggest = candidates[candidates.length - 1];
    if (carriesIb && hasLength) {
      // Obciążalność da się spełnić, ale żaden dostępny przekrój nie mieści się
      // w limicie spadku napięcia — trasa jest po prostu za długa.
      const drop = voltageDropPct(spec.dlugosc_m!, Ib, biggest, phases);
      warnings.push({
        code: "SPADEK_NAPIECIA_NIE_DO_SPELNIENIA",
        level: "error",
        message: `Nawet przy ${formatSection(biggest)} mm² spadek napięcia wynosi ${drop.toFixed(2)}% przy limicie ${dropLimit}% (trasa ${spec.dlugosc_m} m, Ib ${Ib.toFixed(1)} A). Skróć trasę albo zasil obwód z podrozdzielnicy.`,
      });
    } else {
      warnings.push({
        code: "PRZEKROJ_NIE_DO_DOBRANIA",
        level: "error",
        message: `Prąd obliczeniowy ${Ib.toFixed(1)} A przekracza obciążalność największego przekroju z tablicy (${formatSection(biggest)} mm², metoda ${method}, k1=${k1.toFixed(2)}, k2=${k2.toFixed(2)}). Podziel odbiory na kilka obwodów.`,
      });
    }
    const failed = base();
    failed.Ib_A = round(Ib, 2);
    return failed;
  }

  if (downgraded) {
    warnings.push({
      code: "IN_PONIZEJ_TYPOWEGO",
      level: "warn",
      message: `Dobrano ${curve}${chosen.In} zamiast typowego ${curve}${preferred} dla tego rodzaju obwodu — obciążalność po współczynnikach (${chosen.Iz.toFixed(1)} A) nie pozwala na wyższy prąd znamionowy.`,
    });
  }

  // --- ostrzeżenia informacyjne ---------------------------------------------
  if (chosen.drop === null) {
    warnings.push({
      code: "BRAK_DLUGOSCI",
      level: "warn",
      message: `Obwód „${spec.nazwa}" nie ma podanej długości trasy — spadek napięcia NIE został sprawdzony. Dobór pokrywa wyłącznie obciążalność.`,
    });
  }

  if (chosen.section > MIN_SECTION_FOR[spec.typ] && chosen.drop !== null) {
    const atMin = voltageDropPct(spec.dlugosc_m!, Ib, MIN_SECTION_FOR[spec.typ], phases);
    if (atMin > budzetObwodu) {
      warnings.push({
        code: "PRZEKROJ_PODNIESIONY_SPADEK",
        level: "warn",
        message: `Przekrój podniesiono do ${formatSection(chosen.section)} mm² ze względu na spadek napięcia (przy ${formatSection(MIN_SECTION_FOR[spec.typ])} mm² byłoby ${atMin.toFixed(2)}% > ${dropLimit}%).`,
      });
    }
  }

  if (k2 < 1) {
    warnings.push({
      code: "GRUPOWANIE",
      level: "warn",
      message: `Uwzględniono współczynnik grupowania k2=${k2.toFixed(2)} (${bundle} obwodów w wiązce) — obciążalność spadła do ${chosen.Iz.toFixed(1)} A. Rozdzielenie tras podniosłoby ją z powrotem.`,
    });
  }

  if (ambientC > 30) {
    warnings.push({
      code: "TEMPERATURA",
      level: "warn",
      message: `Temperatura otoczenia ${ambientC} °C obniża obciążalność (k1=${k1.toFixed(2)}). Przy trasie przez nieocieploną poddasze/kotłownię sprawdź założenie.`,
    });
  }

  const Ia = CURVE_MULTIPLIER[curve] * chosen.In;
  const poles: "1P" | "3P" = phases === "3" ? "3P" : "1P";

  const hasError = warnings.some((w) => w.level === "error");
  const status: SizingStatus = hasError ? "error" : warnings.length > 0 ? "warn" : "ok";

  return {
    spadek_wlz_pct: dropWlz,
    id: spec.id,
    nazwa: spec.nazwa,
    typ: spec.typ,
    pomieszczenie: spec.pomieszczenie,
    liczba_faz: phases,
    faza: spec.faza ?? "auto",
    Ib_A: round(Ib, 2),
    przekroj_mm2: chosen.section,
    kabel: cableLabel(chosen.section, phases),
    aparat: { charakterystyka: curve, In_A: chosen.In, bieguny: poles },
    Iz_A: round(chosen.Iz, 2),
    wspolczynniki: { k1_temperatura: round(k1, 3), k2_grupowanie: k2 },
    spadek_napiecia_pct: chosen.drop === null ? null : round(chosen.drop, 2),
    spadek_calkowity_pct: chosen.drop === null ? null : round(chosen.drop + dropWlz, 2),
    spadek_napiecia_limit_pct: dropLimit,
    Ia_A: Ia,
    Zs_max_Ohm: round(zsMaxDlaIa(Ia), 3),
    rcd_typ: rcdType,
    status,
    ostrzezenia: warnings,
  };
}

function round(v: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

// --- dobór samego zabezpieczenia do ZNANEGO przekroju ------------------------

/**
 * Dobiera wyłącznik nadprądowy, gdy przekrój przewodu jest już PRZESĄDZONY.
 *
 * Odwrotna strona `sizeCircuit`: tam przekrój jest wynikiem (funkcja iteruje po
 * przekrojach, szukając najmniejszego, który spełni obciążalność i spadek naraz),
 * tutaj jest daną — bo przewód już leży w ścianie albo został narzucony projektem.
 * `sizeCircuit` nie odpowiada na to pytanie, bo z definicji sama wybiera przekrój.
 *
 * Warunek jest ten sam co w `sizeCircuit` (Ib ≤ In ≤ Iz, PN-HD 60364-4-43) i
 * korzysta z tych samych tablic — więc dla tych samych danych oba dobory podadzą
 * ten sam aparat. Różnica wyłącznie w tym, co jest wejściem, a co wyjściem.
 *
 * Spadek napięcia NIE jest tu liczony: zależy od przekroju i długości, a nie od
 * doboru aparatu — sprawdza go kalkulator „Spadek napięcia" i `sizeCircuit`.
 */
export interface BreakerSpec {
  /** Prąd obliczeniowy Ib [A]. */
  prad_A: number;
  liczba_faz: PhaseCount;
  /** Przekrój ŻYŁY [mm²] — dana wejściowa, nie wynik. */
  przekroj_mm2: Section;
  sposob_ulozenia: LayingMethod;
  temperatura_otoczenia_C?: number;
  obwodow_w_wiazce?: number;
  /** Odbiornik z rozruchem silnikowym → charakterystyka C zamiast B. */
  rozruch_silnikowy?: boolean;
  /** Rodzaj obwodu — decyduje o TYPOWYM prądzie znamionowym (`PREFERRED_RATING_FOR`). */
  typ: CircuitKind;
}

export interface SizedBreaker {
  Ib_A: number;
  /** Obciążalność przewodu po współczynnikach k1·k2 [A]. */
  Iz_A: number;
  /** Obciążalność z tablicy, przed współczynnikami [A] — pokazuje wpływ ułożenia. */
  Iz_bazowa_A: number;
  metoda_odniesienia: ReferenceMethod;
  wspolczynniki: { k1_temperatura: number; k2_grupowanie: number };
  aparat: { charakterystyka: Curve; In_A: number; bieguny: "1P" | "3P" } | null;
  Ia_A: number | null;
  Zs_max_Ohm: number | null;
  status: SizingStatus;
  ostrzezenia: SizingWarning[];
}

export function sizeBreakerForSection(spec: BreakerSpec): SizedBreaker {
  const warnings: SizingWarning[] = [];
  const phases = spec.liczba_faz;
  const ambientC = spec.temperatura_otoczenia_C ?? 30;
  const bundle = spec.obwodow_w_wiazce ?? 1;
  const method = REFERENCE_METHOD_FOR[spec.sposob_ulozenia];
  const loadedCores: 2 | 3 = phases === "3" ? 3 : 2;
  const curve: Curve = spec.rozruch_silnikowy ? "C" : "B";

  const k1 = temperatureFactor(ambientC);
  const k2 = groupingFactor(bundle);
  const IzBase = baseAmpacity(spec.przekroj_mm2, method, loadedCores);
  const Iz = IzBase * k1 * k2;
  const Ib = spec.prad_A;

  const common = {
    Ib_A: round(Ib, 2),
    Iz_A: round(Iz, 2),
    Iz_bazowa_A: IzBase,
    metoda_odniesienia: method,
    wspolczynniki: { k1_temperatura: round(k1, 3), k2_grupowanie: k2 },
  };

  if (!(Ib > 0)) {
    warnings.push({
      code: "BRAK_PRADU",
      level: "error",
      message: "Podaj prąd obliczeniowy (albo moc odbiornika) — bez niego nie ma czego zabezpieczać.",
    });
    return { ...common, aparat: null, Ia_A: null, Zs_max_Ohm: null, status: "error", ostrzezenia: warnings };
  }

  // Ten sam porządek co w `sizeCircuit`: najpierw próbujemy typowy dla rodzaju
  // obwodu prąd znamionowy (obwód gniazd dostaje B16, nawet gdy dziś pobiera mało),
  // a dopiero gdy przewód tego nie udźwignie — schodzimy do In wynikającego z Ib.
  const preferred = PREFERRED_RATING_FOR[spec.typ];
  let In = BREAKER_RATINGS.find((r) => r >= Math.max(Ib, preferred) && r <= Iz);
  if (In === undefined) {
    In = BREAKER_RATINGS.find((r) => r >= Ib && r <= Iz);
    if (In !== undefined) {
      warnings.push({
        code: "IN_PONIZEJ_TYPOWEGO",
        level: "warn",
        message: `Dobrano ${curve}${In} zamiast typowego ${curve}${preferred} dla tego rodzaju obwodu — obciążalność przewodu po współczynnikach (${Iz.toFixed(1)} A) nie pozwala na wyższy prąd znamionowy.`,
      });
    }
  }

  if (In === undefined) {
    warnings.push({
      code: "PRZEWOD_ZA_SLABY",
      level: "error",
      message:
        Ib > Iz
          ? `Prąd obliczeniowy ${Ib.toFixed(1)} A przekracza obciążalność tego przewodu (${Iz.toFixed(1)} A przy metodzie ${method}, k1=${k1.toFixed(2)}, k2=${k2.toFixed(2)}). Żaden wyłącznik tego nie naprawi — potrzebny grubszy przewód, lepsze warunki ułożenia albo podział na kilka obwodów.`
          : `Między prądem obliczeniowym ${Ib.toFixed(1)} A a obciążalnością ${Iz.toFixed(1)} A nie mieści się żaden znormalizowany prąd znamionowy z szeregu. Zwiększ przekrój albo popraw warunki ułożenia.`,
    });
    return { ...common, aparat: null, Ia_A: null, Zs_max_Ohm: null, status: "error", ostrzezenia: warnings };
  }

  if (k2 < 1) {
    warnings.push({
      code: "GRUPOWANIE",
      level: "warn",
      message: `Uwzględniono współczynnik grupowania k2=${k2.toFixed(2)} (${bundle} obwodów w wiązce) — obciążalność spadła z ${IzBase} A do ${Iz.toFixed(1)} A. Rozdzielenie tras podniosłoby ją z powrotem.`,
    });
  }
  if (ambientC > 30) {
    warnings.push({
      code: "TEMPERATURA",
      level: "warn",
      message: `Temperatura otoczenia ${ambientC} °C obniża obciążalność (k1=${k1.toFixed(2)}). Przy trasie przez nieocieplone poddasze albo kotłownię sprawdź to założenie.`,
    });
  }

  const Ia = CURVE_MULTIPLIER[curve] * In;
  const poles: "1P" | "3P" = phases === "3" ? "3P" : "1P";
  const hasError = warnings.some((w) => w.level === "error");

  return {
    ...common,
    aparat: { charakterystyka: curve, In_A: In, bieguny: poles },
    Ia_A: Ia,
    Zs_max_Ohm: round(zsMaxDlaIa(Ia), 3),
    status: hasError ? "error" : warnings.length > 0 ? "warn" : "ok",
    ostrzezenia: warnings,
  };
}

/** Opis słowny przyjętych założeń — do legendy pod schematem. */
export function sizingAssumptions(spec: CircuitSpec): string {
  const method = REFERENCE_METHOD_FOR[spec.sposob_ulozenia];
  return `metoda ${method} (${LAYING_METHOD_LABELS[spec.sposob_ulozenia]}), ${spec.temperatura_otoczenia_C ?? 30} °C, ${spec.obwodow_w_wiazce ?? 1} obw. w wiązce`;
}

// --- dobór WLZ (wewnętrznej linii zasilającej) -------------------------------

/**
 * Dobór przekroju i zabezpieczenia WLZ — kabla od złącza/licznika do
 * rozdzielnicy głównej. Osobna funkcja od `sizeCircuit`, nie parametryzacja
 * istniejącej: `CircuitSpec.typ` opisuje KOŃCOWY obwód odbiorczy (stąd
 * `MIN_SECTION_FOR`/`PREFERRED_RATING_FOR` dla „oświetlenia"/„gniazd" —
 * pojęcia, które dla WLZ nie mają sensu), a mieszanie dwóch różnych
 * zastosowań w jednym typie danych byłoby mylące. Pętla dobierająca przekrój
 * jest w efekcie podobna do tej w `sizeCircuit` (świadomie: obie korzystają z
 * tych samych tablic normatywnych w `norms.ts`, więc krok „szukaj najmniejszego
 * przekroju spełniającego obciążalność i spadek napięcia naraz" musi wyglądać
 * tak samo) — nie wydzielono tego do wspólnego helpera, żeby nie ruszać
 * dobrze przetestowanego, produkcyjnego kodu `sizeCircuit` dla korzyści czysto
 * porządkowej.
 *
 * UWAGA: tablice `norms.ts` (i więc ten dobór) dotyczą przewodów w budynku
 * (pod tynkiem/w rurce/natynkowo) — NIE kabla ziemnego. Jeśli WLZ biegnie w
 * ziemi (typowe dla przyłącza ze złącza kablowo-pomiarowego na granicy
 * działki), to inna metoda odniesienia z zupełnie inną tablicą obciążalności
 * — ten kalkulator jej nie obejmuje i nie powinien być do tego używany.
 */

/** Minimalny przekrój WLZ — praktyka projektowa dla domu jednorodzinnego
 *  (kabel dźwiga cały budynek, więc nawet przy małym poborze nie schodzi się
 *  do przekrojów typowych dla pojedynczego obwodu odbiorczego), NIE liczba
 *  wprost z normy. */
const MIN_SECTION_FEEDER: Section = 10;

/**
 * Domyślny dopuszczalny spadek napięcia na samej WLZ — WARTOŚĆ Z PRAKTYKI
 * PROJEKTOWEJ, nie z normy wprost. WLZ to tylko odcinek całej trasy do
 * odbiornika: normowy limit 3-5% (patrz `MAX_VOLTAGE_DROP_PCT`) dotyczy
 * całości od złącza do najdalszego punktu, więc zostawienie na WLZ własnego,
 * węższego budżetu (2%) chroni miejsce na spadek na obwodzie odbiorczym za
 * rozdzielnicą — inaczej krótka, ale słabo dobrana WLZ mogłaby samodzielnie
 * zużyć cały limit.
 */
const DEFAULT_FEEDER_DROP_LIMIT_PCT = 2;

export interface FeederSpec {
  /** Prąd obliczeniowy WLZ [A] — zwykle prąd zapotrzebowany z bilansu mocy budynku. */
  prad_A: number;
  liczba_faz: PhaseCount;
  dlugosc_m?: number;
  sposob_ulozenia: LayingMethod;
  temperatura_otoczenia_C?: number;
  obwodow_w_wiazce?: number;
  /** Dopuszczalny spadek napięcia na WLZ [%] — patrz `DEFAULT_FEEDER_DROP_LIMIT_PCT`. */
  limit_spadku_pct?: number;
}

export interface SizedFeeder {
  przekroj_mm2: Section | null;
  kabel: string | null;
  aparat: { charakterystyka: Curve; In_A: number; bieguny: "1P" | "3P" } | null;
  /** Obciążalność po współczynnikach k1·k2 [A]. */
  Iz_A: number | null;
  wspolczynniki: { k1_temperatura: number; k2_grupowanie: number };
  spadek_napiecia_pct: number | null;
  spadek_napiecia_limit_pct: number;
  status: SizingStatus;
  ostrzezenia: SizingWarning[];
}

export function sizeFeeder(spec: FeederSpec): SizedFeeder {
  const warnings: SizingWarning[] = [];
  const phases = spec.liczba_faz;
  const ambientC = spec.temperatura_otoczenia_C ?? 30;
  const bundle = spec.obwodow_w_wiazce ?? 1;
  const method = REFERENCE_METHOD_FOR[spec.sposob_ulozenia];
  const loadedCores: 2 | 3 = phases === "3" ? 3 : 2;
  const dropLimit = spec.limit_spadku_pct ?? DEFAULT_FEEDER_DROP_LIMIT_PCT;
  const curve: Curve = "B";

  const k1 = temperatureFactor(ambientC);
  const k2 = groupingFactor(bundle);
  const Ib = spec.prad_A;

  const base = (): SizedFeeder => ({
    przekroj_mm2: null,
    kabel: null,
    aparat: null,
    Iz_A: null,
    wspolczynniki: { k1_temperatura: round(k1, 3), k2_grupowanie: k2 },
    spadek_napiecia_pct: null,
    spadek_napiecia_limit_pct: dropLimit,
    status: "error",
    ostrzezenia: warnings,
  });

  if (!(Ib > 0)) {
    warnings.push({
      code: "BRAK_PRADU",
      level: "error",
      message: "Podaj prąd obliczeniowy WLZ (np. wczytany z bilansu mocy budynku).",
    });
    return base();
  }

  const candidates = SECTIONS.filter((s) => s >= MIN_SECTION_FEEDER);
  const hasLength = typeof spec.dlugosc_m === "number" && spec.dlugosc_m > 0;

  interface Pick {
    section: Section;
    In: number;
    Iz: number;
    drop: number | null;
  }

  function pick(): Pick | null {
    for (const section of candidates) {
      const Iz = baseAmpacity(section, method, loadedCores) * k1 * k2;
      const In = BREAKER_RATINGS.find((r) => r >= Ib && r <= Iz);
      if (In === undefined) continue;
      if (!hasLength) return { section, In, Iz, drop: null };
      const drop = voltageDropPct(spec.dlugosc_m!, Ib, section, phases);
      if (drop <= dropLimit) return { section, In, Iz, drop };
    }
    return null;
  }

  const chosen = pick();
  if (!chosen) {
    const biggest = candidates[candidates.length - 1];
    const carriesIb = candidates.some((section) => {
      const Iz = baseAmpacity(section, method, loadedCores) * k1 * k2;
      return BREAKER_RATINGS.some((r) => r >= Ib && r <= Iz);
    });
    if (carriesIb && hasLength) {
      const drop = voltageDropPct(spec.dlugosc_m!, Ib, biggest, phases);
      warnings.push({
        code: "SPADEK_NAPIECIA_NIE_DO_SPELNIENIA",
        level: "error",
        message: `Nawet przy ${formatSection(biggest)} mm² spadek napięcia wynosi ${drop.toFixed(2)}% przy limicie ${dropLimit}% (trasa ${spec.dlugosc_m} m, Ib ${Ib.toFixed(1)} A). Skróć trasę albo podnieś limit, jeśli obwód odbiorczy za rozdzielnicą i tak ma spory zapas.`,
      });
    } else {
      warnings.push({
        code: "PRZEKROJ_NIE_DO_DOBRANIA",
        level: "error",
        message: `Prąd obliczeniowy ${Ib.toFixed(1)} A przekracza obciążalność największego przekroju z tablicy (${formatSection(biggest)} mm², metoda ${method}, k1=${k1.toFixed(2)}, k2=${k2.toFixed(2)}). Dla takiego poboru WLZ wymaga doboru indywidualnego przez projektanta.`,
      });
    }
    return base();
  }

  if (chosen.drop === null) {
    warnings.push({
      code: "BRAK_DLUGOSCI",
      level: "warn",
      message: "Nie podano długości trasy WLZ — spadek napięcia NIE został sprawdzony. Dobór pokrywa wyłącznie obciążalność.",
    });
  }
  if (k2 < 1) {
    warnings.push({
      code: "GRUPOWANIE",
      level: "warn",
      message: `Uwzględniono współczynnik grupowania k2=${k2.toFixed(2)} (${bundle} obwodów w wiązce) — obciążalność spadła do ${chosen.Iz.toFixed(1)} A.`,
    });
  }
  if (ambientC > 30) {
    warnings.push({
      code: "TEMPERATURA",
      level: "warn",
      message: `Temperatura otoczenia ${ambientC} °C obniża obciążalność (k1=${k1.toFixed(2)}).`,
    });
  }

  const hasError = warnings.some((w) => w.level === "error");
  const status: SizingStatus = hasError ? "error" : warnings.length > 0 ? "warn" : "ok";

  return {
    przekroj_mm2: chosen.section,
    kabel: cableLabel(chosen.section, phases),
    aparat: { charakterystyka: curve, In_A: chosen.In, bieguny: phases === "3" ? "3P" : "1P" },
    Iz_A: round(chosen.Iz, 2),
    wspolczynniki: { k1_temperatura: round(k1, 3), k2_grupowanie: k2 },
    spadek_napiecia_pct: chosen.drop === null ? null : round(chosen.drop, 2),
    spadek_napiecia_limit_pct: dropLimit,
    status,
    ostrzezenia: warnings,
  };
}
