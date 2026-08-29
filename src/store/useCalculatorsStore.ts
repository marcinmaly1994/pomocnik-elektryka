import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CelZwarcia } from "@/lib/calc/shortCircuit";
import type { UkladBaterii } from "@/lib/calc/powerFactor";
import type { Izolacja, Material, RodzajLinii } from "@/lib/norms/conductors";
import type { LayingMethod } from "@/lib/panel/norms";
import type { CircuitKind } from "@/lib/panel/sizing";

/**
 * Stan zakładki „Kalkulatory" — osobny store od `useProjectStore`, bo te
 * kalkulatory są narzędziami NIEZALEŻNYMI od konkretnego projektu (patrz opisy
 * w `CalculatorsTab.tsx`: „działają niezależnie od projektu na planie"), a nie
 * czymś, co powinno wędrować do chmury razem z rzutem domu i resetować się przy
 * „Nowy projekt". Zapisywany lokalnie (localStorage, klucz niżej) przez
 * `persist` z samego zustanda — bez custom debounce jak przy autosave projektu
 * w `useProjectStore`, bo tu nie ma z czym synchronizować się w chmurze ani
 * czego scalać, więc prosty zapis przy każdej zmianie w zupełności wystarcza.
 *
 * Bez tego stan (a zwłaszcza ręcznie wpisana lista odbiorników w „Bilansie
 * mocy") znikał przy każdym przejściu na inną zakładkę i przy odświeżeniu
 * strony — mimo że reszta projektu jest zapisywana lokalnie od dawna.
 */

export type CalcId =
  | "spadek"
  | "zwarcie"
  | "kompensacja"
  | "przekroj"
  | "zabezpieczenie"
  | "moc"
  | "petla"
  | "wlz"
  | "uziemienieTT"
  | "oswietlenie"
  | "rcd";

export interface CalculatorDevice {
  id: string;
  name: string;
  power: number;
}

interface CalculatorsState {
  activeCalc: CalcId;

  /**
   * --- dobór przekroju przewodu ORAZ dobór zabezpieczenia ---
   *
   * Jeden komplet pól dla obu kalkulatorów, a nie dwa osobne: to te same dane
   * wejściowe opisujące ten sam obwód (moc, fazy, warunki ułożenia), tylko
   * pytanie jest inne — „jaki przekrój położyć" kontra „jaki bezpiecznik dać".
   * Dzięki temu przejście między nimi nie każe przepisywać wszystkiego od nowa,
   * co przy rozbiciu jednego kalkulatora na dwa byłoby krokiem wstecz.
   */
  circuitKind: CircuitKind;
  power: number;
  phase: "1" | "3";
  cosphi: number;
  length: number;
  layingMethod: LayingMethod;
  ambientC: number;
  bundleCount: number;
  motorStart: boolean;
  /** Przekrój ŻYŁY [mm²] — dana wejściowa doboru zabezpieczenia (tam, gdzie
   *  w doborze przekroju jest wynikiem). Patrz `sizeBreakerForSection`. */
  breakerSection: number;

  /**
   * --- sprawdzenie spadku napięcia na ZNANYM przekroju ---
   *
   * Osobny zestaw pól od „doboru przewodu" powyżej, bo to odwrotne pytanie:
   * tam przekrój jest WYNIKIEM (`sizeCircuit` szuka najmniejszego, który spełnia
   * obciążalność i spadek naraz), tutaj jest DANĄ WEJŚCIOWĄ — sprawdzamy trasę,
   * która już istnieje albo jest z góry narzucona. Wspólny jest silnik
   * (`voltageDropPct`), nie stan formularza.
   */
  duCurrentA: number;
  duPhase: "1" | "3";
  duLength: number;
  duSection: number;
  duLimitPct: number;
  /** Materiał żyły, izolacja i cosφ — potrzebne do modelu temperaturowego
   *  (ρ(θ) = ρ₂₀[1+α(θ−20)]) i do metody pełnej z reaktancją. */
  duMaterial: Material;
  duIzolacja: Izolacja;
  duCosfi: number;
  duZReaktancja: boolean;
  duRodzajLinii: RodzajLinii;
  duRownolegle: number;

  // --- prądy zwarciowe i wytrzymałość zwarciowa cieplna ---
  zwCel: CelZwarcia;
  zwSnKVA: number;
  zwUkPct: number;
  zwUnV: number;
  zwStratyCuW: number;
  zwZsOhm: number;
  zwRdoX: number;
  /** Sprawdzenie cieplne: prąd i czas trwania zwarcia + przewód. */
  zwCzasS: number;
  zwPrzekroj: number;
  zwMaterial: Material;
  zwIzolacja: Izolacja;

  // --- kompensacja mocy biernej ---
  kmPkW: number;
  kmCos1: number;
  kmCos2: number;
  kmUV: number;
  kmUklad: UkladBaterii;
  kmSkKVA: number;

  // --- bilans mocy ---
  devices: CalculatorDevice[];
  ks: number;

  // --- impedancja pętli zwarcia ---
  zCurve: string;
  zIn: number;
  zMeasured: number;

  // --- WLZ (linia zasilająca) ---
  wlzCurrentA: number;
  wlzPhase: "1" | "3";
  wlzLength: number;
  wlzLayingMethod: LayingMethod;
  wlzAmbientC: number;
  wlzBundleCount: number;
  wlzDropLimit: number;

  // --- rezystancja uziemienia (układ TT) ---
  ttIdnMa: number;
  ttMeasuredRa: number;

  // --- oświetlenie ---
  roomA: number;
  lux: number;
  lumPerOpr: number;
  mf: number;
  uf: number;
}

interface CalculatorsActions {
  /** Płytki patch — jak `setDocHeader`/`setPanelConfig` w `useProjectStore`,
   *  bo to płaska „torba ustawień", nie zagnieżdżona struktura wymagająca
   *  osobnej logiki scalania. */
  patch: (p: Partial<CalculatorsState>) => void;
  setDevices: (updater: (devices: CalculatorDevice[]) => CalculatorDevice[]) => void;
}

const DEFAULT_DEVICES: CalculatorDevice[] = [
  { id: crypto.randomUUID(), name: "Gniazda i oświetlenie", power: 6000 },
  { id: crypto.randomUUID(), name: "Kuchenka elektryczna", power: 7000 },
  { id: crypto.randomUUID(), name: "Bojler / pompa ciepła", power: 3000 },
];

export const useCalculatorsStore = create<CalculatorsState & CalculatorsActions>()(
  persist(
    (set) => ({
      activeCalc: "przekroj",

      circuitKind: "gniazda",
      power: 2000,
      phase: "1",
      cosphi: 1,
      length: 15,
      layingMethod: "w_scianie",
      ambientC: 30,
      bundleCount: 1,
      motorStart: false,
      breakerSection: 2.5,

      duCurrentA: 10,
      duPhase: "1",
      duLength: 25,
      duSection: 2.5,
      duLimitPct: 3,
      duMaterial: "Cu",
      duIzolacja: "PVC",
      duCosfi: 1,
      duZReaktancja: false,
      duRodzajLinii: "kabel_wielozylowy",
      duRownolegle: 1,

      zwCel: "dobor_aparatu",
      zwSnKVA: 630,
      zwUkPct: 4,
      zwUnV: 400,
      zwStratyCuW: 6500,
      zwZsOhm: 1,
      zwRdoX: 0.1,
      zwCzasS: 0.1,
      zwPrzekroj: 10,
      zwMaterial: "Cu",
      zwIzolacja: "PVC",

      kmPkW: 100,
      kmCos1: 0.8,
      kmCos2: 0.95,
      kmUV: 400,
      kmUklad: "trojkat",
      kmSkKVA: 0,

      devices: DEFAULT_DEVICES,
      ks: 0.7,

      zCurve: "B",
      zIn: 16,
      zMeasured: 0.8,

      wlzCurrentA: 20,
      wlzPhase: "3",
      wlzLength: 20,
      wlzLayingMethod: "w_rurce",
      wlzAmbientC: 30,
      wlzBundleCount: 1,
      wlzDropLimit: 2,

      ttIdnMa: 30,
      ttMeasuredRa: 15,

      roomA: 20,
      lux: 300,
      lumPerOpr: 1200,
      mf: 0.8,
      uf: 0.6,

      patch: (p) => set(p),
      setDevices: (updater) => set((s) => ({ devices: updater(s.devices) })),
    }),
    { name: "pomocnikelektryka_kalkulatory" }
  )
);
