/**
 * Spina rysunek z doborem: bierze obwody wyprowadzone z planu, dokłada im moc
 * i długość trasy (`loads.ts`), przepuszcza przez dobór normatywny (`sizing.ts`)
 * i liczy podsumowania rozdzielnicy — bilans faz oraz rezerwę modułów.
 *
 * To jedyne miejsce, które zna JEDNOCZEŚNIE typy planu i typy doboru. Dzięki temu
 * `sizing.ts` zostaje czystym kalkulatorem normy, a store i komponenty nie muszą
 * wiedzieć nic o tablicach obciążalności.
 */

import type { Circuit, InstallationElement } from "@/types";
import { computeCircuits } from "./circuits";
import { circuitDemand, estimateRoutes, findPanel, kindForElements } from "./loads";
import { sizeCircuit, type PhaseAssignment, type SizedCircuit } from "./sizing";
import type { LayingMethod } from "./norms";

export interface ProjectSizingOptions {
  /** Metry na jednostkę planu z kalibracji skali; `null` = brak kalibracji. */
  metersPerUnit: number | null;
  sposob_ulozenia?: LayingMethod;
  temperatura_otoczenia_C?: number;
  /** Ile obwodów dzieli wspólną trasę — wpływa na współczynnik grupowania. */
  obwodow_w_wiazce?: number;
}

/** Obwód z planu przepuszczony przez dobór — zachowuje `id` obwodu źródłowego. */
export function sizeProjectCircuits(
  circuits: Circuit[],
  allElements: InstallationElement[],
  opts: ProjectSizingOptions
): SizedCircuit[] {
  const panel = findPanel(allElements);
  return circuits.map((c) => {
    const kind = kindForElements(c.elements);
    const demand = circuitDemand(c.elements, kind);
    const routes = estimateRoutes(panel, c.elements, opts.metersPerUnit);
    // „3-faz." w etykiecie zabezpieczenia to sposób, w jaki obwody trójfazowe są
    // oznaczane w warstwie planu — tu tłumaczymy to na liczbę faz doboru.
    const phases = c.breaker.includes("3-faz.") ? "3" : "1";
    return sizeCircuit({
      id: c.id,
      nazwa: c.name,
      typ: kind,
      pomieszczenie: c.elements[0]?.room,
      strefa_mokra: /łazienk|pralni|kuchni/i.test(c.elements[0]?.room ?? ""),
      moc_W: demand.powerW,
      liczba_faz: phases,
      dlugosc_m: routes?.worstCaseM,
      sposob_ulozenia: opts.sposob_ulozenia ?? "w_scianie",
      temperatura_otoczenia_C: opts.temperatura_otoczenia_C,
      obwodow_w_wiazce: opts.obwodow_w_wiazce,
      rozruch_silnikowy: /lodówk|pomp|klimatyz|wentylat/i.test(c.name),
    });
  });
}

/**
 * Nadpisuje w obwodach kabel i zabezpieczenie wynikiem doboru.
 *
 * Bez tego kroku rozdzielnica pokazywałaby na licu aparatu stałą z
 * `computeCircuits` (np. „B10" dla rolet), a w etykiecie pod nim przekrój
 * z doboru („3x2,5 mm²") — dwie różne odpowiedzi na tym samym aparacie.
 * Obwody, których nie udało się dobrać, zostają nietknięte: lepiej pokazać
 * wartość wyjściową niż puste pole.
 */
export function applySizing(circuits: Circuit[], sized: SizedCircuit[]): Circuit[] {
  const byId = new Map(sized.map((s) => [s.id, s]));
  return circuits.map((c) => {
    const s = byId.get(c.id);
    if (!s?.aparat || !s.kabel) return c;
    return {
      ...c,
      cable: s.kabel,
      // sufiks „3-faz." jest umową całej warstwy planu (patrz `buildPanelDevices`),
      // więc musi przetrwać podmianę, inaczej aparat 3-biegunowy zwęzi się do 1 modułu
      breaker: `${s.aparat.charakterystyka}${s.aparat.In_A}${s.liczba_faz === "3" ? " 3-faz." : ""}`,
    };
  });
}

/**
 * Jedno wejście dla wszystkich zakładek: obwody z planu + ich dobór, już
 * uzgodnione ze sobą. Rozdzielnica, Schemat i Kosztorys muszą wołać to samo,
 * inaczej każda z nich pokazuje inny przekrój dla tego samego obwodu.
 */
export function computeSizedCircuits(
  elements: InstallationElement[],
  opts: ProjectSizingOptions
): { circuits: Circuit[]; sized: SizedCircuit[] } {
  const raw = computeCircuits(elements);
  const sized = sizeProjectCircuits(raw, elements, opts);
  return { circuits: applySizing(raw, sized), sized };
}

/**
 * Sumaryczne długości tras per obwód [m] — materiał do kosztorysu.
 *
 * Uwaga na różnicę względem doboru: tam liczy się trasa do punktu NAJDALSZEGO
 * (bo to ona decyduje o spadku napięcia), tutaj suma wszystkich tras (bo tyle
 * kabla trzeba kupić). Mapa jest pusta, gdy nie da się tego policzyć — brak
 * kalibracji skali albo brak rozdzielnicy na rysunku.
 */
export function routeLengths(
  circuits: Circuit[],
  allElements: InstallationElement[],
  metersPerUnit: number | null
): Map<string, number> {
  const panel = findPanel(allElements);
  const out = new Map<string, number>();
  for (const c of circuits) {
    const r = estimateRoutes(panel, c.elements, metersPerUnit);
    if (r) out.set(c.id, r.totalM);
  }
  return out;
}

export type Phase = "L1" | "L2" | "L3";
const PHASES: Phase[] = ["L1", "L2", "L3"];

export interface PhaseBalance {
  /** Obciążenie fazy prądem obliczeniowym [A]. */
  amps: Record<Phase, number>;
  /** Udział fazy w obciążeniu całkowitym [%] — idealnie 33,3 na każdą. */
  percent: Record<Phase, number>;
  /** Różnica między najbardziej i najmniej obciążoną fazą [%]. */
  spreadPct: number;
}

/**
 * Rozdziela obwody 1-fazowe na L1/L2/L3 według PRĄDU OBLICZENIOWEGO, a nie prądu
 * znamionowego zabezpieczenia.
 *
 * To istotna różnica: dwa obwody B16 wyglądają identycznie „po zabezpieczeniu",
 * ale jeden może ciągnąć 3 A, a drugi 15 A. Bilansowanie po In rozkłada równo
 * aparaty, nie obciążenie — a to obciążenie płynie w przewodzie neutralnym.
 *
 * Obwody z fazą ustawioną ręcznie (`faza` inne niż "auto") są respektowane i tylko
 * doliczane do bilansu.
 */
export function assignPhases(sized: SizedCircuit[], supply3f: boolean): SizedCircuit[] {
  if (!supply3f) return sized.map((s) => ({ ...s, faza: "L1" as PhaseAssignment }));

  const load: Record<Phase, number> = { L1: 0, L2: 0, L3: 0 };

  // Najpierw obwody z ręcznie ustaloną fazą i trójfazowe — zajmują miejsce,
  // zanim automat zacznie dokładać resztę.
  for (const s of sized) {
    if (s.liczba_faz === "3") {
      const perPhase = (s.Ib_A ?? 0) / 3;
      PHASES.forEach((p) => (load[p] += perPhase));
    } else if (s.faza !== "auto" && PHASES.includes(s.faza as Phase)) {
      load[s.faza as Phase] += s.Ib_A ?? 0;
    }
  }

  return sized.map((s) => {
    if (s.liczba_faz === "3") return { ...s, faza: "auto" as PhaseAssignment };
    if (s.faza !== "auto" && PHASES.includes(s.faza as Phase)) return s;
    const target = PHASES.reduce((a, b) => (load[a] <= load[b] ? a : b));
    load[target] += s.Ib_A ?? 0;
    return { ...s, faza: target as PhaseAssignment };
  });
}

/** Bilans faz w amperach i procentach — obwody 3-fazowe obciążają wszystkie trzy. */
export function phaseBalance(sized: SizedCircuit[]): PhaseBalance {
  const amps: Record<Phase, number> = { L1: 0, L2: 0, L3: 0 };
  for (const s of sized) {
    const ib = s.Ib_A ?? 0;
    if (s.liczba_faz === "3") {
      PHASES.forEach((p) => (amps[p] += ib / 3));
    } else if (PHASES.includes(s.faza as Phase)) {
      amps[s.faza as Phase] += ib;
    }
  }
  const total = amps.L1 + amps.L2 + amps.L3;
  const percent: Record<Phase, number> = { L1: 0, L2: 0, L3: 0 };
  PHASES.forEach((p) => (percent[p] = total > 0 ? round1((amps[p] / total) * 100) : 0));
  const values = PHASES.map((p) => percent[p]);
  return {
    amps: { L1: round1(amps.L1), L2: round1(amps.L2), L3: round1(amps.L3) },
    percent,
    spreadPct: round1(Math.max(...values) - Math.min(...values)),
  };
}

export interface PanelCapacity {
  usedModules: number;
  /** Liczba rzędów szyny DIN potrzebna na aparaty (bez rezerwy). */
  rows: number;
  /** Pojemność rozdzielnicy przy tej liczbie rzędów. */
  capacity: number;
  freeModules: number;
  reservePct: number;
  /** Czy rezerwa mieści się w zalecanych min. 20%. */
  ok: boolean;
}

/**
 * Rezerwa miejsca w rozdzielnicy. Zalecane minimum to 20% wolnych modułów —
 * rozdzielnica zapełniona „pod korek" oznacza, że każda późniejsza zmiana
 * (dołożony obwód, wymiana na różnicowo-nadprądowy) wymaga wymiany obudowy.
 */
export function panelCapacity(usedModules: number, modulesPerRow = 12): PanelCapacity {
  const rowsForDevices = Math.ceil(usedModules / modulesPerRow) || 1;
  // Dokładamy rząd, jeżeli przy obecnej liczbie rzędów rezerwa spadłaby poniżej 20%.
  const rows = usedModules / (rowsForDevices * modulesPerRow) > 0.8 ? rowsForDevices + 1 : rowsForDevices;
  const capacity = rows * modulesPerRow;
  const freeModules = capacity - usedModules;
  const reservePct = capacity > 0 ? round1((freeModules / capacity) * 100) : 0;
  return { usedModules, rows, capacity, freeModules, reservePct, ok: reservePct >= 20 };
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
