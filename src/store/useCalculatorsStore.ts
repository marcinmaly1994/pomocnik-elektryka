import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CelZwarcia } from "@/lib/calc/shortCircuit";
import type { UkladBaterii } from "@/lib/calc/powerFactor";
import type { TypUziomu } from "@/lib/calc/earthing";
import type { Faza } from "@/lib/calc/loadBalance";
import type { SposobRozruchu } from "@/lib/calc/motor";
import type { TypSPD } from "@/lib/calc/spd";
import type { MetodaOdniesienia3 } from "@/lib/norms/ampacity3";
import type { Izolacja, Material, ModelRezystywnosci, RodzajLinii } from "@/lib/norms/conductors";
import type { TypWkladkiGG } from "@/lib/norms/gGFuses";
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
  | "obwod"
  | "spadek"
  | "zwarcie"
  | "kompensacja"
  | "przekroj"
  | "zabezpieczenie"
  | "moc"
  | "petla"
  | "wlz"
  | "uziemienieTT"
  | "uziom"
  | "bilansFaz"
  | "silnik"
  | "impedancja"
  | "peN"
  | "spd"
  | "pelnyDobor"
  | "gGWkladka"
  | "pv"
  | "ev"
  | "oswietlenie"
  | "rcd";

/**
 * Tryb scalonego kalkulatora „Dobor obwodu".
 *
 * Cztery dawne kalkulatory pytaly o to samo z czterech stron: raz przekroj byl
 * wynikiem, raz dana, raz chodzilo o linie zasilajaca, raz o komplet czterech
 * kryteriow. Uzytkownik musial najpierw zgadnac, w ktorym z nich jest jego pytanie.
 */
export type TrybObwodu = "przekroj" | "zabezpieczenie" | "wlz" | "pelny";

export interface CalculatorDevice {
  id: string;
  name: string;
  power: number;
}

/** Odbiór w bilansie faz — z przypisaniem do fazy (`null` = trójfazowy). */
export interface OdbiorFazowy {
  id: string;
  nazwa: string;
  mocW: number;
  cosfi: number;
  faza: Faza | null;
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
  /** Tryb kalkulatora „Dobor obwodu" — patrz TrybObwodu. */
  trybObwodu: TrybObwodu;
  /** Impedancja petli w tym punkcie [Ω] — do 3. kryterium. 0 = nie podano. */
  obwodZsOhm: number;
  /** Spodziewany prad zwarcia [A] i czas wylaczenia [s] — do 4. kryterium. */
  obwodIkA: number;
  obwodCzasS: number;
  /**
   * Spadek napiecia zuzyty juz na WLZ [%].
   *
   * Limit 3/5% dotyczy calej drogi OD ZLACZA, a nie samego obwodu odbiorczego —
   * bez tego pola kalkulator liczyl obwod w oderwaniu od odcinka lezacego przed
   * rozdzielnica i przepuszczal instalacje jako calosc przekraczajace norme.
   */
  spadekWlzPct: number;
  /** Zasilanie z wlasnej stacji transformatorowej — budzet spadku wiekszy o 2 p.p. */
  wlasnaStacja: boolean;
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
  duModel: ModelRezystywnosci;
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

  // --- uziemienia (geometria uziomu) ---
  uzTyp: TypUziomu;
  uzRho: number;
  uzDlugosc: number;
  uzSrednicaMm: number;
  uzSzerokoscMm: number;
  uzGlebokosc: number;
  uzLiczba: number;
  uzEta: number;
  uzWymagana: number;

  // --- bilans faz i prąd w przewodzie N ---
  bfOdbiory: OdbiorFazowy[];
  bfH3Pct: number;

  // --- silniki indukcyjne ---
  slMocKW: number;
  slUn: number;
  slCosfi: number;
  slSprawnosc: number;
  slKrotnosc: number;
  slRozruch: SposobRozruchu;
  slCzasRozruchu: number;
  slImpedancja: number;

  // --- kalkulatory uzupełniające (impedancja / PE-N / SPD) ---
  imDlugosc: number;
  imPrzekroj: number;
  imMaterial: Material;
  imIzolacja: Izolacja;
  imRodzajLinii: RodzajLinii;
  /** Przewody równoległe — długości poszczególnych żył [m], rozdzielone przecinkami. */
  imRownoleglePrad: number;
  imRownolegleDlugosci: string;
  imRownolegleIz: number;

  peFazowy: number;
  peMaterial: Material;
  peIzolacja: Izolacja;
  pePradZwarciowy: number;
  peCzas: number;
  pnPradFazowy: number;
  pnH3Pct: number;

  spdTyp: TypSPD;
  spdUp: number;
  spdUw: number;
  spdDlugosc: number;

  // --- pełny dobór (4 kryteria, pkt 5.2) ---
  pdIb: number;
  pdNapiecie: number;
  pdMaterial: Material;
  pdIzolacja: Izolacja;
  pdMetoda: MetodaOdniesienia3;
  pdTemperatura: number;
  pdWiazka: number;
  pdRozruch: boolean;
  pdDlugosc: number;
  pdCosfi: number;
  pdLimitSpadku: number;
  pdSprawdzOchrone: boolean;
  pdImpedancjaZrodla: number;
  pdUklad: "TN" | "TT";
  pdObwodOdbiorczy: boolean;
  pdSprawdzZwarcie: boolean;
  pdIk: number;

  // --- dobór wkładki gG (ochrona przeciwporażeniowa) ---
  ggTyp: TypWkladkiGG;
  ggIb: number;
  ggUklad: "TN" | "TT";
  ggObwodOdbiorczy: boolean;
  ggSprawdzZs: boolean;
  ggZmierzonaZs: number;

  // --- fotowoltaika: string DC ---
  pvIsc: number;
  pvVoc: number;
  pvVmpp: number;
  pvImpp: number;
  pvLiczbaModulow: number;
  pvBeta: number;
  pvTempMin: number;
  pvTempMax: number;
  pvSprawdzMppt: boolean;
  pvFalownikVocMax: number;
  pvFalownikMpptMin: number;
  pvDlugoscDC: number;
  pvPrzekrojDC: number;
  pvMaterialDC: Material;
  pvLimitSpadkuDC: number;
  // --- fotowoltaika: strona AC falownika ---
  pvMocAC: number;
  pvFazaAC: "1" | "3";
  pvDlugoscAC: number;
  pvSposobUlozeniaAC: LayingMethod;

  // --- ładowarka EV ---
  evMoc: number;
  evFaza: "1" | "3";
  evCosfi: number;
  evDlugosc: number;
  evSposobUlozenia: LayingMethod;
  evWbudowanaOchronaDC: boolean;

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
  setOdbioryFazowe: (updater: (o: OdbiorFazowy[]) => OdbiorFazowy[]) => void;
}

const DEFAULT_DEVICES: CalculatorDevice[] = [
  { id: crypto.randomUUID(), name: "Gniazda i oświetlenie", power: 6000 },
  { id: crypto.randomUUID(), name: "Kuchenka elektryczna", power: 7000 },
  { id: crypto.randomUUID(), name: "Bojler / pompa ciepła", power: 3000 },
];

/** Trzy odbiory na różnych fazach — punkt wyjścia pokazujący, po co ten kalkulator
 *  w ogóle jest (asymetria widoczna od razu, bez wpisywania czegokolwiek). */
const DEFAULT_ODBIORY_FAZOWE: OdbiorFazowy[] = [
  { id: crypto.randomUUID(), nazwa: "Gniazda parter", mocW: 2300, cosfi: 1, faza: "L1" },
  { id: crypto.randomUUID(), nazwa: "Gniazda piętro", mocW: 1800, cosfi: 1, faza: "L2" },
  { id: crypto.randomUUID(), nazwa: "Oświetlenie LED", mocW: 600, cosfi: 0.95, faza: "L3" },
];

export const useCalculatorsStore = create<CalculatorsState & CalculatorsActions>()(
  persist(
    (set) => ({
      // Scalony „Dobor obwodu" jest naturalnym wejsciem: to od doboru obwodu zaczyna
      // sie kazda robota, a trzy pozostale tryby siedza w tym samym kalkulatorze.
      activeCalc: "obwod",

      circuitKind: "gniazda",
      power: 2000,
      phase: "1",
      cosphi: 1,
      length: 15,
      layingMethod: "w_scianie",
      ambientC: 30,
      bundleCount: 1,
      motorStart: false,
      trybObwodu: "przekroj",
      obwodZsOhm: 0,
      obwodIkA: 0,
      obwodCzasS: 0.4,
      spadekWlzPct: 0,
      wlasnaStacja: false,
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
      duModel: "annexG",
      duRownolegle: 1,

      zwCel: "dobor_aparatu",
      // Stacja 100 kVA to typowy transformator zasilajacy kilka domow — daje Ik3
      // okolo 3,8 kA na zlaczu. Domyslne 630 kVA (23,9 kA) opisywalo zaklad
      // przemyslowy: kazdy, kto nie zmienil tych pol, dostawal wynik bez zwiazku
      // z instalacja, ktora liczyl.
      zwSnKVA: 100,
      zwUkPct: 4,
      zwUnV: 400,
      zwStratyCuW: 1750,
      zwZsOhm: 1,
      zwRdoX: 0.1,
      zwCzasS: 0.1,
      zwPrzekroj: 10,
      zwMaterial: "Cu",
      zwIzolacja: "PVC",

      uzTyp: "pionowy",
      uzRho: 100,
      uzDlugosc: 3,
      uzSrednicaMm: 16,
      uzSzerokoscMm: 30,
      uzGlebokosc: 0.8,
      uzLiczba: 1,
      uzEta: 0.8,
      uzWymagana: 30,

      bfOdbiory: DEFAULT_ODBIORY_FAZOWE,
      bfH3Pct: 0,

      slMocKW: 5.5,
      slUn: 400,
      slCosfi: 0.85,
      slSprawnosc: 0.88,
      slKrotnosc: 6,
      slRozruch: "bezposredni",
      slCzasRozruchu: 5,
      slImpedancja: 0,

      imDlugosc: 100,
      imPrzekroj: 16,
      imMaterial: "Cu",
      imIzolacja: "PVC",
      imRodzajLinii: "kabel_wielozylowy",
      imRownoleglePrad: 200,
      imRownolegleDlugosci: "40, 60",
      imRownolegleIz: 120,

      peFazowy: 10,
      peMaterial: "Cu",
      peIzolacja: "PVC",
      pePradZwarciowy: 0,
      peCzas: 0.4,
      pnPradFazowy: 32,
      pnH3Pct: 0,

      spdTyp: "T2",
      spdUp: 1500,
      spdUw: 2500,
      spdDlugosc: 0.5,

      pdIb: 40,
      pdNapiecie: 400,
      pdMaterial: "Cu",
      pdIzolacja: "PVC",
      pdMetoda: "B2",
      pdTemperatura: 30,
      pdWiazka: 1,
      pdRozruch: false,
      pdDlugosc: 30,
      pdCosfi: 0.9,
      pdLimitSpadku: 4,
      pdSprawdzOchrone: false,
      pdImpedancjaZrodla: 0.3,
      pdUklad: "TN",
      pdObwodOdbiorczy: true,
      pdSprawdzZwarcie: false,
      pdIk: 3000,

      ggTyp: "D0gG",
      ggIb: 16,
      ggUklad: "TN",
      ggObwodOdbiorczy: true,
      ggSprawdzZs: false,
      ggZmierzonaZs: 1.5,

      pvIsc: 10.5,
      pvVoc: 41.5,
      pvVmpp: 34.5,
      pvImpp: 9.9,
      pvLiczbaModulow: 12,
      pvBeta: -0.27,
      pvTempMin: -15,
      pvTempMax: 70,
      pvSprawdzMppt: false,
      pvFalownikVocMax: 600,
      pvFalownikMpptMin: 200,
      pvDlugoscDC: 15,
      pvPrzekrojDC: 6,
      pvMaterialDC: "Cu",
      pvLimitSpadkuDC: 1,
      pvMocAC: 5000,
      pvFazaAC: "1",
      pvDlugoscAC: 10,
      pvSposobUlozeniaAC: "w_scianie",

      evMoc: 7360,
      evFaza: "1",
      evCosfi: 1,
      evDlugosc: 15,
      evSposobUlozenia: "w_scianie",
      evWbudowanaOchronaDC: false,

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
      setOdbioryFazowe: (updater) => set((s) => ({ bfOdbiory: updater(s.bfOdbiory) })),
    }),
    { name: "pomocnikelektryka_kalkulatory" }
  )
);
