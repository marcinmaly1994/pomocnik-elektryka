import { useMemo } from "react";
import {
  AlertTriangle,
  Anchor,
  Cable,
  Calculator,
  Check,
  ChevronRight,
  ClipboardCheck,
  Download,
  Flame,
  Gauge,
  Home,
  Info,
  Plus,
  Scale,
  Shovel,
  Cog,
  Trash2,
  TrendingDown,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { obliczUziom, REZYSTYWNOSC_GRUNTU, TYP_UZIOMU_LABELS, type TypUziomu } from "@/lib/calc/earthing";
import { obliczBilans, type Faza } from "@/lib/calc/loadBalance";
import { obliczSilnik, SPOSOB_ROZRUCHU_LABELS, type SposobRozruchu } from "@/lib/calc/motor";
import { CalcResultView } from "./CalcResultView";
import { obliczSpadekNapiecia } from "@/lib/calc/voltageDrop";
import { obliczKompensacje, UKLAD_BATERII_LABELS, type UkladBaterii } from "@/lib/calc/powerFactor";
import {
  CEL_ZWARCIA_LABELS,
  impedancjaTransformatora,
  obliczPradyZwarciowe,
  obliczWytrzymaloscZwarciowa,
  type CelZwarcia,
} from "@/lib/calc/shortCircuit";
import { RODZAJ_LINII_LABELS, type Izolacja, type Material, type RodzajLinii } from "@/lib/norms/conductors";
import { formatLiczba } from "@/lib/calc/result";
import { calcLighting, calcPowerBalance, maxGroundingResistance, UL } from "@/lib/electrical";
import { computeCircuits } from "@/lib/panel/circuits";
import { circuitDemand, kindForElements } from "@/lib/panel/loads";
import { LAYING_METHOD_LABELS, SECTIONS, U0, type LayingMethod } from "@/lib/panel/norms";
import {
  sizeBreakerForSection,
  sizeCircuit,
  sizeFeeder,
  zsMaxForBreaker,
  type CircuitKind,
} from "@/lib/panel/sizing";
import { useCalculatorsStore, type CalcId } from "@/store/useCalculatorsStore";
import { useProjectStore } from "@/store/useProjectStore";
import { Card } from "./Card";
import { Field } from "./Field";
import { HowItWorks } from "./HowItWorks";

const CALC_LIST: { id: CalcId; label: string; desc: string; icon: LucideIcon }[] = [
  { id: "spadek", label: "Spadek napięcia", desc: "sprawdzenie trasy o znanym przekroju", icon: TrendingDown },
  { id: "zwarcie", label: "Prądy zwarciowe", desc: "Ik, prąd udarowy, wytrzymałość cieplna", icon: Flame },
  { id: "kompensacja", label: "Kompensacja mocy biernej", desc: "moc baterii, pojemność, rezonans", icon: Gauge },
  { id: "przekroj", label: "Dobór przekroju przewodu", desc: "przekrój wg obciążalności i spadku", icon: Cable },
  { id: "zabezpieczenie", label: "Dobór zabezpieczenia", desc: "wyłącznik do znanego przekroju", icon: Zap },
  { id: "moc", label: "Bilans mocy budynku", desc: "moc zapotrzebowana, dobór przyłącza", icon: Home },
  { id: "wlz", label: "Dobór WLZ (linii zasilającej)", desc: "przekrój kabla od licznika do rozdzielnicy", icon: Cable },
  { id: "petla", label: "Impedancja pętli zwarcia", desc: "ochrona przeciwporażeniowa — układ TN", icon: ClipboardCheck },
  { id: "uziemienieTT", label: "Rezystancja uziemienia", desc: "ochrona przeciwporażeniowa — układ TT", icon: Anchor },
  { id: "uziom", label: "Uziom — dobór geometrii", desc: "pręt, bednarka, otok; potrzebna długość", icon: Shovel },
  { id: "bilansFaz", label: "Bilans faz i prąd w N", desc: "asymetria, przewód neutralny, 3. harmoniczna", icon: Scale },
  { id: "silnik", label: "Silnik indukcyjny", desc: "rozruch, zabezpieczenia, spadek przy starcie", icon: Cog },
  { id: "oswietlenie", label: "Dobór oświetlenia", desc: "strumień świetlny i liczba opraw", icon: Calculator },
  { id: "rcd", label: "Dobór wyłącznika różnicowoprądowego", desc: "zasady doboru RCD", icon: Info },
];

const CIRCUIT_KIND_OPTIONS: { value: CircuitKind; label: string }[] = [
  { value: "oswietlenie", label: "Oświetlenie" },
  { value: "gniazda", label: "Gniazda" },
  { value: "dedykowany", label: "Odbiornik dedykowany" },
];

const LAYING_METHOD_OPTIONS = (Object.entries(LAYING_METHOD_LABELS) as [LayingMethod, string][]).map(
  ([value, label]) => ({ value, label })
);

/**
 * Orientacyjne cos φ typowych odbiorników domowych — ŚCIĄGA, nie tablica normowa.
 *
 * Powód istnienia: cos φ to jedyne pole w tym formularzu, którego laik nie ma skąd
 * wziąć. Moc odczyta z tabliczki znamionowej, długość zmierzy, sposób ułożenia
 * wybierze z listy — a współczynnik mocy albo jest schowany w karcie katalogowej,
 * albo nie ma go wcale. Bez podpowiedzi zostaje domyślna 1, która dla odbiornika
 * silnikowego zaniża prąd obliczeniowy (Ib = P/(U·cos φ)) i przez to CAŁY dobór.
 *
 * Wartości to typowe zakresy z praktyki instalatorskiej dla pracy przy pełnym
 * obciążeniu — nie da się ich wziąć z normy, bo zależą od konkretnego egzemplarza.
 * Stąd jawne „orientacyjne" w nagłówku i odesłanie do tabliczki znamionowej:
 * podana wartość ma być punktem startowym, nie zastępować danych producenta.
 * Silniki obciążone częściowo mają cos φ WYRAŹNIE niższy niż podany tu dla pracy
 * znamionowej — to najczęstsze źródło niedoszacowania, więc mówimy o tym wprost.
 */
const COSPHI_EXAMPLES: { cos: number; odbiorniki: string }[] = [
  { cos: 1.0, odbiorniki: "Grzałki, piekarnik, czajnik, bojler, żarówki — odbiorniki czysto rezystancyjne" },
  { cos: 0.95, odbiorniki: "Płyta indukcyjna, ładowarka EV, komputery i RTV z układem PFC" },
  { cos: 0.9, odbiorniki: "Pralka, zmywarka, oprawy LED z porządnym zasilaczem" },
  { cos: 0.85, odbiorniki: "Silniki 3-fazowe przy pełnym obciążeniu, pompa ciepła" },
  { cos: 0.8, odbiorniki: "Klimatyzacja, lodówka, zamrażarka — napęd sprężarki" },
  { cos: 0.7, odbiorniki: "Pompy i wentylatory 1-fazowe, elektronarzędzia" },
  { cos: 0.6, odbiorniki: "Małe silniki 1-fazowe słabo obciążone, świetlówki nieskompensowane" },
];

const PHASE_OPTIONS = [
  { value: "1", label: "1-fazowe 230V" },
  { value: "3", label: "3-fazowe 400V" },
];

const SECTION_OPTIONS = SECTIONS.map((s) => ({ value: String(s), label: `${String(s).replace(".", ",")} mm²` }));

/** Szereg handlowy do kalkulatorów inżynierskich — szerszy niż `SECTIONS`
 *  (te obejmują tylko zakres domowego doboru obwodów, do 25 mm²). */
const SZEREG_PELNY = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300, 400, 500, 630];
const SZEREG_PELNY_OPTIONS = SZEREG_PELNY.map((s) => ({ value: String(s), label: `${String(s).replace(".", ",")} mm²` }));

const MATERIAL_OPTIONS: { value: Material; label: string }[] = [
  { value: "Cu", label: "miedź (Cu)" },
  { value: "Al", label: "aluminium (Al)" },
];
const IZOLACJA_OPTIONS: { value: Izolacja; label: string }[] = [
  { value: "PVC", label: "PVC (70 °C)" },
  { value: "XLPE", label: "XLPE / EPR (90 °C)" },
];
const RODZAJ_LINII_OPTIONS = (Object.entries(RODZAJ_LINII_LABELS) as [RodzajLinii, string][]).map(([value, label]) => ({
  value,
  label,
}));
const CEL_ZWARCIA_OPTIONS = (Object.entries(CEL_ZWARCIA_LABELS) as [CelZwarcia, string][]).map(([value, label]) => ({
  value,
  label,
}));
const UKLAD_BATERII_OPTIONS = (Object.entries(UKLAD_BATERII_LABELS) as [UkladBaterii, string][]).map(([value, label]) => ({
  value,
  label,
}));

/**
 * Progi dopuszczalnego spadku napięcia (PN-HD 60364-5-52 zał. G) — do szybkiego
 * wyboru zamiast wpisywania liczby z pamięci. Edytowalne, bo bywają zaostrzane
 * warunkami przyłączenia (np. wymóg gminy dla oświetlenia drogowego).
 */
const TYP_UZIOMU_OPTIONS = (Object.entries(TYP_UZIOMU_LABELS) as [TypUziomu, string][]).map(([value, label]) => ({
  value,
  label,
}));
const GRUNT_OPTIONS = REZYSTYWNOSC_GRUNTU.map((g) => ({
  value: String(g.typowa),
  label: `${g.nazwa} — ok. ${g.typowa} Ω·m (${g.min}–${g.max})`,
}));
const ROZRUCH_OPTIONS = (Object.entries(SPOSOB_ROZRUCHU_LABELS) as [SposobRozruchu, string][]).map(([value, label]) => ({
  value,
  label,
}));
const FAZA_OPTIONS = [
  { value: "L1", label: "L1" },
  { value: "L2", label: "L2" },
  { value: "L3", label: "L3" },
  { value: "3f", label: "3-fazowy" },
];

const LIMIT_SPADKU_OPCJE = [
  { value: "3", label: "3% — oświetlenie (sieć publiczna)" },
  { value: "5", label: "5% — pozostałe odbiorniki (sieć publiczna)" },
  { value: "6", label: "6% — oświetlenie (własna stacja trafo)" },
  { value: "8", label: "8% — pozostałe (własna stacja trafo)" },
];

export function CalculatorsTab() {
  // Stan (wejścia i lista odbiorników w bilansie mocy) mieszka w osobnym,
  // trwałym store'zie (`useCalculatorsStore`, localStorage) — bez tego
  // wszystko znikało przy zmianie zakładki albo odświeżeniu strony. Selektory
  // pojedynczych pól (zamiast jednego selektora zwracającego obiekt) to ten
  // sam wzorzec co `useProjectStore` w całej aplikacji — każdy komponent
  // subskrybuje tylko to, co faktycznie czyta.
  const zapisanyActiveCalc = useCalculatorsStore((s) => s.activeCalc);
  const circuitKind = useCalculatorsStore((s) => s.circuitKind);
  const power = useCalculatorsStore((s) => s.power);
  const phase = useCalculatorsStore((s) => s.phase);
  const cosphi = useCalculatorsStore((s) => s.cosphi);
  const length = useCalculatorsStore((s) => s.length);
  const layingMethod = useCalculatorsStore((s) => s.layingMethod);
  const ambientC = useCalculatorsStore((s) => s.ambientC);
  const bundleCount = useCalculatorsStore((s) => s.bundleCount);
  const motorStart = useCalculatorsStore((s) => s.motorStart);
  const breakerSection = useCalculatorsStore((s) => s.breakerSection);
  const duCurrentA = useCalculatorsStore((s) => s.duCurrentA);
  const duPhase = useCalculatorsStore((s) => s.duPhase);
  const duLength = useCalculatorsStore((s) => s.duLength);
  const duSection = useCalculatorsStore((s) => s.duSection);
  const duLimitPct = useCalculatorsStore((s) => s.duLimitPct);
  const duMaterial = useCalculatorsStore((s) => s.duMaterial);
  const duIzolacja = useCalculatorsStore((s) => s.duIzolacja);
  const duCosfi = useCalculatorsStore((s) => s.duCosfi);
  const duZReaktancja = useCalculatorsStore((s) => s.duZReaktancja);
  const duRodzajLinii = useCalculatorsStore((s) => s.duRodzajLinii);
  const duRownolegle = useCalculatorsStore((s) => s.duRownolegle);
  const zwCel = useCalculatorsStore((s) => s.zwCel);
  const zwSnKVA = useCalculatorsStore((s) => s.zwSnKVA);
  const zwUkPct = useCalculatorsStore((s) => s.zwUkPct);
  const zwUnV = useCalculatorsStore((s) => s.zwUnV);
  const zwStratyCuW = useCalculatorsStore((s) => s.zwStratyCuW);
  const zwZsOhm = useCalculatorsStore((s) => s.zwZsOhm);
  const zwRdoX = useCalculatorsStore((s) => s.zwRdoX);
  const zwCzasS = useCalculatorsStore((s) => s.zwCzasS);
  const zwPrzekroj = useCalculatorsStore((s) => s.zwPrzekroj);
  const zwMaterial = useCalculatorsStore((s) => s.zwMaterial);
  const zwIzolacja = useCalculatorsStore((s) => s.zwIzolacja);
  const kmPkW = useCalculatorsStore((s) => s.kmPkW);
  const kmCos1 = useCalculatorsStore((s) => s.kmCos1);
  const kmCos2 = useCalculatorsStore((s) => s.kmCos2);
  const kmUV = useCalculatorsStore((s) => s.kmUV);
  const kmUklad = useCalculatorsStore((s) => s.kmUklad);
  const kmSkKVA = useCalculatorsStore((s) => s.kmSkKVA);
  const uzTyp = useCalculatorsStore((s) => s.uzTyp);
  const uzRho = useCalculatorsStore((s) => s.uzRho);
  const uzDlugosc = useCalculatorsStore((s) => s.uzDlugosc);
  const uzSrednicaMm = useCalculatorsStore((s) => s.uzSrednicaMm);
  const uzSzerokoscMm = useCalculatorsStore((s) => s.uzSzerokoscMm);
  const uzGlebokosc = useCalculatorsStore((s) => s.uzGlebokosc);
  const uzLiczba = useCalculatorsStore((s) => s.uzLiczba);
  const uzEta = useCalculatorsStore((s) => s.uzEta);
  const uzWymagana = useCalculatorsStore((s) => s.uzWymagana);
  const bfOdbiory = useCalculatorsStore((s) => s.bfOdbiory);
  const bfH3Pct = useCalculatorsStore((s) => s.bfH3Pct);
  const setOdbioryFazowe = useCalculatorsStore((s) => s.setOdbioryFazowe);
  const slMocKW = useCalculatorsStore((s) => s.slMocKW);
  const slUn = useCalculatorsStore((s) => s.slUn);
  const slCosfi = useCalculatorsStore((s) => s.slCosfi);
  const slSprawnosc = useCalculatorsStore((s) => s.slSprawnosc);
  const slKrotnosc = useCalculatorsStore((s) => s.slKrotnosc);
  const slRozruch = useCalculatorsStore((s) => s.slRozruch);
  const slCzasRozruchu = useCalculatorsStore((s) => s.slCzasRozruchu);
  const slImpedancja = useCalculatorsStore((s) => s.slImpedancja);
  const devices = useCalculatorsStore((s) => s.devices);
  const ks = useCalculatorsStore((s) => s.ks);
  const zCurve = useCalculatorsStore((s) => s.zCurve);
  const zIn = useCalculatorsStore((s) => s.zIn);
  const zMeasured = useCalculatorsStore((s) => s.zMeasured);
  const wlzCurrentA = useCalculatorsStore((s) => s.wlzCurrentA);
  const wlzPhase = useCalculatorsStore((s) => s.wlzPhase);
  const wlzLength = useCalculatorsStore((s) => s.wlzLength);
  const wlzLayingMethod = useCalculatorsStore((s) => s.wlzLayingMethod);
  const wlzAmbientC = useCalculatorsStore((s) => s.wlzAmbientC);
  const wlzBundleCount = useCalculatorsStore((s) => s.wlzBundleCount);
  const wlzDropLimit = useCalculatorsStore((s) => s.wlzDropLimit);
  const ttIdnMa = useCalculatorsStore((s) => s.ttIdnMa);
  const ttMeasuredRa = useCalculatorsStore((s) => s.ttMeasuredRa);
  const roomA = useCalculatorsStore((s) => s.roomA);
  const lux = useCalculatorsStore((s) => s.lux);
  const lumPerOpr = useCalculatorsStore((s) => s.lumPerOpr);
  const mf = useCalculatorsStore((s) => s.mf);
  const uf = useCalculatorsStore((s) => s.uf);
  const patch = useCalculatorsStore((s) => s.patch);
  const setDevices = useCalculatorsStore((s) => s.setDevices);

  /**
   * Identyfikator wczytany z localStorage może pochodzić ze STARSZEJ wersji, w
   * której kalkulatory nazywały się inaczej — np. „przewod" sprzed rozbicia na
   * „przekroj" i „zabezpieczenie". Taki nieznany identyfikator wywracał całą
   * zakładkę: `CALC_LIST.find(...)!` zwracało `undefined`, a odczyt `.label`
   * kończył się białym ekranem u KAŻDEGO, kto korzystał z kalkulatorów przed
   * aktualizacją (świeży localStorage tego nie pokazuje, więc łatwo to przeoczyć).
   * Cofamy się do pierwszej pozycji zamiast ufać zapisanej wartości.
   */
  const activeCalc: CalcId = CALC_LIST.some((c) => c.id === zapisanyActiveCalc) ? zapisanyActiveCalc : CALC_LIST[0].id;

  const setActiveCalc = (v: CalcId) => patch({ activeCalc: v });
  const setCircuitKind = (v: CircuitKind) => patch({ circuitKind: v });
  const setPower = (v: number) => patch({ power: v });
  const setPhase = (v: "1" | "3") => patch({ phase: v });
  const setCosphi = (v: number) => patch({ cosphi: v });
  const setLength = (v: number) => patch({ length: v });
  const setLayingMethod = (v: LayingMethod) => patch({ layingMethod: v });
  const setAmbientC = (v: number) => patch({ ambientC: v });
  const setBundleCount = (v: number) => patch({ bundleCount: v });
  const setMotorStart = (v: boolean) => patch({ motorStart: v });
  const setBreakerSection = (v: number) => patch({ breakerSection: v });
  const setDuCurrentA = (v: number) => patch({ duCurrentA: v });
  const setDuPhase = (v: "1" | "3") => patch({ duPhase: v });
  const setDuLength = (v: number) => patch({ duLength: v });
  const setDuSection = (v: number) => patch({ duSection: v });
  const setDuLimitPct = (v: number) => patch({ duLimitPct: v });
  const setKm = (p: Partial<Parameters<typeof patch>[0]>) => patch(p);
  const setKs = (v: number) => patch({ ks: v });
  const setZCurve = (v: string) => patch({ zCurve: v });
  const setZIn = (v: number) => patch({ zIn: v });
  const setZMeasured = (v: number) => patch({ zMeasured: v });
  const setWlzCurrentA = (v: number) => patch({ wlzCurrentA: v });
  const setWlzPhase = (v: "1" | "3") => patch({ wlzPhase: v });
  const setWlzLength = (v: number) => patch({ wlzLength: v });
  const setWlzLayingMethod = (v: LayingMethod) => patch({ wlzLayingMethod: v });
  const setWlzAmbientC = (v: number) => patch({ wlzAmbientC: v });
  const setWlzBundleCount = (v: number) => patch({ wlzBundleCount: v });
  const setWlzDropLimit = (v: number) => patch({ wlzDropLimit: v });
  const setTtIdnMa = (v: number) => patch({ ttIdnMa: v });
  const setTtMeasuredRa = (v: number) => patch({ ttMeasuredRa: v });
  const setRoomA = (v: number) => patch({ roomA: v });
  const setLux = (v: number) => patch({ lux: v });
  const setLumPerOpr = (v: number) => patch({ lumPerOpr: v });
  const setMf = (v: number) => patch({ mf: v });
  const setUf = (v: number) => patch({ uf: v });

  // --- 1. dobór przewodu, zabezpieczenia i spadku napięcia ---
  // Ten sam silnik (`sizeCircuit`), co automatyczny dobór w zakładce Rozdzielnica
  // (`lib/panel/project.ts`) — jedno źródło prawdy, więc obie zakładki nigdy nie
  // podadzą różnego wyniku dla tych samych danych wejściowych.
  const sized = useMemo(
    () =>
      sizeCircuit({
        id: "kalkulator",
        nazwa: "Obwód",
        typ: circuitKind,
        moc_W: power,
        liczba_faz: phase,
        cos_phi: cosphi,
        dlugosc_m: length > 0 ? length : undefined,
        sposob_ulozenia: layingMethod,
        temperatura_otoczenia_C: ambientC,
        obwodow_w_wiazce: bundleCount,
        rozruch_silnikowy: motorStart,
      }),
    [circuitKind, power, phase, cosphi, length, layingMethod, ambientC, bundleCount, motorStart]
  );

  /**
   * Ten sam dobór (`sized`) policzony dla KAŻDEGO sposobu ułożenia — do tabelki
   * porównawczej pod wynikiem.
   *
   * Sposób ułożenia był polem formularza od dawna, ale jego wpływ pozostawał
   * niewidoczny: użytkownik przestawiał listę i albo wynik się nie zmieniał, albo
   * zmieniał się bez wyjaśnienia. Tymczasem to jeden z najmocniej działających
   * parametrów — ta sama żyła 2,5 mm² uniesie 27 A natynkowo i tylko 19,5 A
   * w ścianie ocieplonej (tabl. B.52.4), czyli różnicę większą niż niejeden stopień
   * przekroju. Pokazanie wszystkich czterech wariantów naraz robi z tego pola
   * świadomy wybór zamiast ustawienia, które się pomija.
   */
  const layingComparison = useMemo(
    () =>
      LAYING_METHOD_OPTIONS.map((opt) => {
        const r = sizeCircuit({
          id: "porownanie",
          nazwa: "Obwód",
          typ: circuitKind,
          moc_W: power,
          liczba_faz: phase,
          cos_phi: cosphi,
          dlugosc_m: length > 0 ? length : undefined,
          sposob_ulozenia: opt.value,
          temperatura_otoczenia_C: ambientC,
          obwodow_w_wiazce: bundleCount,
          rozruch_silnikowy: motorStart,
        });
        return { ...opt, przekroj: r.przekroj_mm2, Iz: r.Iz_A };
      }),
    [circuitKind, power, phase, cosphi, length, ambientC, bundleCount, motorStart]
  );

  // --- 3. dobór zabezpieczenia do ZNANEGO przekroju ---
  // Odwrotna strona `sizeCircuit`: przekrój jest wejściem, aparat wyjściem.
  // Jednostkowy test w `sizing.test.ts` pilnuje, że dla tych samych danych oba
  // dobory podają TEN SAM aparat — inaczej dwa kalkulatory przeczyłyby sobie.
  const sizedBreaker = useMemo(
    () =>
      sizeBreakerForSection({
        prad_A: sized.Ib_A ?? 0,
        liczba_faz: phase,
        przekroj_mm2: breakerSection as (typeof SECTIONS)[number],
        sposob_ulozenia: layingMethod,
        temperatura_otoczenia_C: ambientC,
        obwodow_w_wiazce: bundleCount,
        rozruch_silnikowy: motorStart,
        typ: circuitKind,
      }),
    [sized.Ib_A, phase, breakerSection, layingMethod, ambientC, bundleCount, motorStart, circuitKind]
  );

  /**
   * Spadek napięcia — pełny silnik wg specyfikacji (`lib/calc/voltageDrop.ts`):
   * model temperaturowy ρ(θ), metoda pełna z reaktancją, przewody równoległe,
   * kroki rachunku i ocena warunku z progiem „graniczny".
   *
   * Zastąpił wcześniejsze wywołanie `voltageDropPct` z `lib/panel/sizing.ts`.
   * UWAGA: te dwa silniki liczą rezystywność INACZEJ (patrz komentarz w
   * `lib/norms/conductors.ts`) — `sizing.ts` używa stałej 0,0225 Ω·mm²/m, tu
   * liczymy z γ₂₀ = 56 i poprawki temperaturowej, co przy 70 °C daje ~0,0214.
   * Różnica ~5%; ujednolicenie wymaga świadomej decyzji, bo przeliczyłoby
   * dobory w całej zakładce Rozdzielnica.
   */
  const spadekPelny = useMemo(
    () =>
      obliczSpadekNapiecia({
        uklad: duPhase === "3" ? "3f" : "1f",
        napiecie_V: duPhase === "3" ? 400 : U0,
        prad_A: duCurrentA,
        cosfi: duCosfi,
        dlugosc_m: duLength,
        material: duMaterial,
        przekroj_mm2: duSection,
        izolacja: duIzolacja,
        zReaktancja: duZReaktancja,
        rodzajLinii: duRodzajLinii,
        rownolegle: duRownolegle,
        limit_pct: duLimitPct,
      }),
    [duPhase, duCurrentA, duCosfi, duLength, duMaterial, duSection, duIzolacja, duZReaktancja, duRodzajLinii, duRownolegle, duLimitPct]
  );

  // --- prądy zwarciowe ---
  const trafo = useMemo(
    () => impedancjaTransformatora({ Sn_VA: zwSnKVA * 1000, uk_pct: zwUkPct, Un_V: zwUnV, straty_Cu_W: zwStratyCuW }),
    [zwSnKVA, zwUkPct, zwUnV, zwStratyCuW]
  );
  const zwarcie = useMemo(
    () =>
      obliczPradyZwarciowe({
        cel: zwCel,
        Un_V: zwUnV,
        U0_V: U0,
        Zk_ohm: trafo.wartosci?.Zt_ohm ?? 0,
        Zs_ohm: zwZsOhm > 0 ? zwZsOhm : undefined,
        R_do_X: zwRdoX >= 0 ? zwRdoX : undefined,
      }),
    [zwCel, zwUnV, trafo.wartosci?.Zt_ohm, zwZsOhm, zwRdoX]
  );
  const wytrzymalosc = useMemo(
    () =>
      obliczWytrzymaloscZwarciowa({
        Ik_A: zwarcie.wartosci?.Ik3_A ?? 0,
        czas_s: zwCzasS,
        material: zwMaterial,
        izolacja: zwIzolacja,
        przekroj_mm2: zwPrzekroj,
      }),
    [zwarcie.wartosci?.Ik3_A, zwCzasS, zwMaterial, zwIzolacja, zwPrzekroj]
  );

  // --- uziom (geometria) ---
  // Średnica i szerokość podawane w MILIMETRACH (tak są w katalogach), silnik
  // liczy w metrach — konwersja tutaj, na granicy wejścia, zgodnie z zasadą
  // „SI w rdzeniu, konwersja tylko na wejściu/wyjściu" (spec pkt 3.1).
  const uziom = useMemo(
    () =>
      obliczUziom({
        typ: uzTyp,
        rho_ohm_m: uzRho,
        dlugosc_m: uzDlugosc,
        srednica_m: uzSrednicaMm / 1000,
        szerokosc_m: uzSzerokoscMm / 1000,
        glebokosc_m: uzGlebokosc,
        liczba: uzLiczba,
        wspWykorzystania: uzEta,
        wymagana_ohm: uzWymagana > 0 ? uzWymagana : undefined,
      }),
    [uzTyp, uzRho, uzDlugosc, uzSrednicaMm, uzSzerokoscMm, uzGlebokosc, uzLiczba, uzEta, uzWymagana]
  );

  // --- bilans faz i prąd w przewodzie neutralnym ---
  const bilansFaz = useMemo(
    () =>
      obliczBilans({
        odbiory: bfOdbiory.map((o) => ({ nazwa: o.nazwa, moc_W: o.mocW, cosfi: o.cosfi, faza: o.faza })),
        U0_V: U0,
        Un_V: 400,
        udzialH3_pct: bfH3Pct,
      }),
    [bfOdbiory, bfH3Pct]
  );

  // --- silnik indukcyjny ---
  const silnik = useMemo(
    () =>
      obliczSilnik({
        moc_W: slMocKW * 1000,
        Un_V: slUn,
        cosfi: slCosfi,
        sprawnosc: slSprawnosc,
        krotnoscRozruchu: slKrotnosc,
        sposobRozruchu: slRozruch,
        czasRozruchu_s: slCzasRozruchu > 0 ? slCzasRozruchu : undefined,
        impedancjaObwodu_ohm: slImpedancja > 0 ? slImpedancja : undefined,
      }),
    [slMocKW, slUn, slCosfi, slSprawnosc, slKrotnosc, slRozruch, slCzasRozruchu, slImpedancja]
  );

  // --- kompensacja mocy biernej ---
  const kompensacja = useMemo(
    () =>
      obliczKompensacje({
        P_W: kmPkW * 1000,
        cosfi1: kmCos1,
        cosfi2: kmCos2,
        napiecie_V: kmUV,
        czestotliwosc_Hz: 50,
        uklad: kmUklad,
        Sk_VA: kmSkKVA > 0 ? kmSkKVA * 1000 : undefined,
      }),
    [kmPkW, kmCos1, kmCos2, kmUV, kmUklad, kmSkKVA]
  );

  // --- 3. bilans mocy ---
  const balance = useMemo(() => calcPowerBalance(devices, ks), [devices, ks]);

  // Obwody z CAŁEGO budynku (wszystkie kondygnacje — `draft.elements` nie jest
  // filtrowane per piętro, tak samo jak w Rozdzielnicy, patrz PanelTab.tsx),
  // przepuszczone przez ten sam model obciążeń co dobór normatywny
  // (`circuitDemand`), żeby „Wczytaj z projektu" dawało moc zainstalowaną
  // zgodną co do watu z tym, co widać w Rozdzielnicy — nie osobno wymyśloną
  // liczbę. Filtr `power > 0` odsiewa obwody złożone wyłącznie z elementów bez
  // przypisanej mocy typowej (np. same łączniki bez lamp w tej samej paczce).
  const projectElements = useProjectStore((s) => s.draft.elements);
  const projectDevices = useMemo(() => {
    return computeCircuits(projectElements)
      .map((c) => {
        const kind = kindForElements(c.elements);
        return { name: c.name, power: Math.round(circuitDemand(c.elements, kind).installedW) };
      })
      .filter((d) => d.power > 0);
  }, [projectElements]);

  function loadDevicesFromProject() {
    if (!confirm("Zastąpić listę odbiorników obwodami wyliczonymi z planu? Obecna lista zostanie nadpisana.")) return;
    setDevices(() => projectDevices.map((d) => ({ id: crypto.randomUUID(), ...d })));
  }

  // --- 3. impedancja pętli zwarcia ---
  const zCalc = useMemo(() => {
    const { ia, zsMax } = zsMaxForBreaker(zCurve, zIn);
    const ik = zMeasured > 0 ? U0 / zMeasured : 0;
    return { ia, zsMax, ik, ok: zsMax > 0 && zMeasured > 0 ? zMeasured <= zsMax : null };
  }, [zCurve, zIn, zMeasured]);

  // --- 4. WLZ (linia zasilająca) ---
  const sizedFeeder = useMemo(
    () =>
      sizeFeeder({
        prad_A: wlzCurrentA,
        liczba_faz: wlzPhase,
        dlugosc_m: wlzLength > 0 ? wlzLength : undefined,
        sposob_ulozenia: wlzLayingMethod,
        temperatura_otoczenia_C: wlzAmbientC,
        obwodow_w_wiazce: wlzBundleCount,
        limit_spadku_pct: wlzDropLimit,
      }),
    [wlzCurrentA, wlzPhase, wlzLength, wlzLayingMethod, wlzAmbientC, wlzBundleCount, wlzDropLimit]
  );

  function loadWlzCurrentFromBalance() {
    setWlzCurrentA(Math.round((wlzPhase === "3" ? balance.demandCurrent3 : balance.demandCurrent1) * 10) / 10);
  }

  // --- 5. rezystancja uziemienia (układ TT) ---
  const groundingCheck = useMemo(() => {
    const raMax = maxGroundingResistance(ttIdnMa / 1000);
    return { raMax, ok: raMax > 0 && ttMeasuredRa > 0 ? ttMeasuredRa <= raMax : null };
  }, [ttIdnMa, ttMeasuredRa]);

  // --- 6. oświetlenie ---
  const lightCalc = useMemo(
    () =>
      calcLighting({
        roomAreaM2: roomA,
        luxRequired: lux,
        lumensPerFixture: lumPerOpr,
        maintenanceFactor: mf,
        utilizationFactor: uf,
      }),
    [roomA, lux, lumPerOpr, mf, uf]
  );

  const active = CALC_LIST.find((c) => c.id === activeCalc)!; // bezpieczne — `activeCalc` jest wyżej sprowadzone do istniejącej pozycji

  return (
    <div className="space-y-5">
      <div>
        <h2 className="pe-display text-xl mb-1">Kalkulatory elektryczne</h2>
        <p className="text-sm text-slate-500">
          Szybkie, orientacyjne obliczenia pomocnicze do wstępnego projektowania instalacji.
        </p>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
        <div className="space-y-1.5" style={{ width: 260, flexShrink: 0, flexGrow: 0 }}>
          {CALC_LIST.map((c) => {
            const Icon = c.icon;
            const on = activeCalc === c.id;
            return (
              <button
                key={c.id}
                onClick={() => setActiveCalc(c.id)}
                className="w-full text-left p-3 rounded-lg flex items-start gap-2.5"
                style={on ? { background: "#2D5A8C10", border: "1px solid #2D5A8C" } : { background: "#fff", border: "1px solid #DCE2E8" }}
              >
                <Icon size={16} className="shrink-0 mt-0.5" style={{ color: on ? "#2D5A8C" : "#94A3B8" }} />
                <div className="min-w-0">
                  <div className="text-[13px] font-medium" style={{ color: on ? "#2D5A8C" : "#16202B" }}>
                    {c.label}
                  </div>
                  <div className="text-[11px] text-slate-500 leading-snug">{c.desc}</div>
                </div>
              </button>
            );
          })}
        </div>

        <div style={{ flex: "1 1 480px", minWidth: 320 }}>
          {activeCalc === "przekroj" && (
            <Card title={active.label} icon={Cable} tag="przekrój żyły">
              <div className="grid sm:grid-cols-2 gap-x-4">
                <Field
                  label="Rodzaj obwodu"
                  value={circuitKind}
                  onChange={(v) => setCircuitKind(v as CircuitKind)}
                  options={CIRCUIT_KIND_OPTIONS}
                />
                <Field label="Moc odbiornika" value={power} onChange={(v) => setPower(Number(v))} unit="W" />
                <Field
                  label="Zasilanie"
                  value={phase}
                  onChange={(v) => setPhase(v as "1" | "3")}
                  options={PHASE_OPTIONS}
                />
                <Field label="Współczynnik cos φ" value={cosphi} onChange={(v) => setCosphi(Number(v))} step="0.05" />
              </div>

              {/* Ściąga cos φ — patrz `COSPHI_EXAMPLES`. Wiersze są KLIKALNE i wpisują
                  wartość do pola wyżej: to jedyne pole formularza, którego laik nie ma
                  skąd wziąć, a przepisywanie liczby ręcznie z tabelki obok pola byłoby
                  krokiem bez powodu. Aktywny wiersz jest podświetlony, żeby było widać,
                  która wartość siedzi w formularzu. */}
              <details className="mb-3 rounded-lg border border-border bg-white/60">
                <summary className="cursor-pointer list-none px-3 py-2 text-xs font-semibold text-slate-600 hover:text-copper">
                  Nie znasz cos φ? Zobacz orientacyjne wartości dla typowych odbiorników
                </summary>
                <div className="border-t border-border px-1.5 py-1.5">
                  {COSPHI_EXAMPLES.map((e) => {
                    const on = Math.abs(cosphi - e.cos) < 0.001;
                    return (
                      <button
                        key={e.cos}
                        type="button"
                        onClick={() => setCosphi(e.cos)}
                        title={`Wpisz cos φ = ${String(e.cos).replace(".", ",")}`}
                        className="flex w-full items-start gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-slate-50"
                        style={on ? { background: "#2D5A8C10" } : undefined}
                      >
                        <span
                          className="pe-mono shrink-0 text-[12px] font-semibold"
                          style={{ color: on ? "#2D5A8C" : "#8A5526" }}
                        >
                          {e.cos.toFixed(2).replace(".", ",")}
                        </span>
                        <span className="text-[11.5px] leading-snug text-slate-600">{e.odbiorniki}</span>
                      </button>
                    );
                  })}
                  <div className="px-2 pb-1 pt-1.5 text-[11px] leading-relaxed text-slate-500">
                    Wartości orientacyjne, dla pracy przy pełnym obciążeniu — jeśli tabliczka znamionowa albo karta
                    katalogowa podaje cos φ, wpisz TĘ wartość. Silnik obciążony częściowo ma cos φ wyraźnie niższy niż
                    znamionowy (nawet 0,3–0,5 na biegu jałowym), więc dla odbiorników silnikowych pracujących z zapasem
                    mocy przyjmij wartość niższą od podanej tutaj.
                  </div>
                </div>
              </details>

              <div className="mb-2 mt-1 text-xs font-semibold text-slate-600">Trasa i warunki ułożenia</div>
              <div className="grid sm:grid-cols-2 gap-x-4">
                <Field
                  label="Długość trasy (w jedną stronę)"
                  value={length}
                  onChange={(v) => setLength(Number(v))}
                  unit="m"
                />
                <Field
                  label="Sposób ułożenia"
                  value={layingMethod}
                  onChange={(v) => setLayingMethod(v as LayingMethod)}
                  options={LAYING_METHOD_OPTIONS}
                />
                <Field label="Temperatura otoczenia" value={ambientC} onChange={(v) => setAmbientC(Number(v))} unit="°C" />
                <Field
                  label="Obwodów we wspólnej trasie"
                  value={bundleCount}
                  onChange={(v) => setBundleCount(Number(v))}
                  step="1"
                />
              </div>
              <label className="mb-3 flex items-center gap-2 text-[13px] text-slate-600">
                <input
                  type="checkbox"
                  checked={motorStart}
                  onChange={(e) => setMotorStart(e.target.checked)}
                  className="h-4 w-4 rounded border-border"
                />
                Odbiornik z rozruchem silnikowym (pompa, lodówka, klimatyzacja) — charakterystyka C
              </label>

              <div className="mt-2 p-3 pe-result">
                <div className="text-xs text-slate-500 mb-1">Wymagany przekrój żyły</div>
                {sized.przekroj_mm2 ? (
                  <>
                    <div className="pe-mono text-lg text-blueprint">
                      {String(sized.przekroj_mm2).replace(".", ",")} mm²
                    </div>
                    <div className="mt-2 flex gap-2 flex-wrap">
                      <span className="pe-chip pe-tag-copper">{sized.kabel}</span>
                      <span className="pe-chip pe-tag-blue">Ib {(sized.Ib_A ?? 0).toFixed(2)} A</span>
                      <span className="pe-chip pe-tag-green">obc. dop. {sized.Iz_A} A</span>
                      {sized.spadek_napiecia_pct !== null && (
                        <span className="pe-chip" style={{ background: "#EEF1F4", color: "#475569" }}>
                          ΔU {sized.spadek_napiecia_pct}% (limit {sized.spadek_napiecia_limit_pct}%)
                        </span>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="text-sm mt-2 flex items-center gap-1" style={{ color: "#A2352C" }}>
                    <AlertTriangle size={14} /> nie udało się dobrać — zobacz komunikat niżej
                  </div>
                )}
              </div>

              {/* Wpływ sposobu ułożenia — patrz `layingComparison`. Tabelka stoi POD
                  wynikiem, bo to uzasadnienie wybranej liczby, a nie kolejne pole do
                  wypełnienia. Aktualnie wybrany wariant jest podświetlony, a każdy
                  wiersz klikalny — porównanie ma prowadzić do zmiany założenia jednym
                  kliknięciem, nie do wracania w górę formularza. */}
              <div className="mt-3 rounded-lg border border-border bg-white/60">
                <div className="border-b border-border px-3 py-2 text-xs font-semibold text-slate-600">
                  Jak sposób ułożenia zmienia wynik
                </div>
                <div className="px-1.5 py-1.5">
                  {layingComparison.map((row) => {
                    const on = row.value === layingMethod;
                    return (
                      <button
                        key={row.value}
                        type="button"
                        onClick={() => setLayingMethod(row.value)}
                        title={`Przyjmij ułożenie: ${row.label}`}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-slate-50"
                        style={on ? { background: "#2D5A8C10" } : undefined}
                      >
                        <span
                          className="min-w-0 flex-1 truncate text-[11.5px]"
                          style={on ? { color: "#2D5A8C", fontWeight: 600 } : { color: "#64748B" }}
                        >
                          {row.label}
                        </span>
                        <span className="pe-mono shrink-0 text-[11.5px] text-slate-500">
                          {row.Iz !== null ? `${row.Iz} A` : "—"}
                        </span>
                        <span
                          className="pe-mono w-16 shrink-0 text-right text-[12px] font-semibold"
                          style={{ color: on ? "#2D5A8C" : "#8A5526" }}
                        >
                          {row.przekroj !== null ? `${String(row.przekroj).replace(".", ",")} mm²` : "—"}
                        </span>
                      </button>
                    );
                  })}
                  <div className="px-2 pb-1 pt-1.5 text-[11px] leading-relaxed text-slate-500">
                    Kolumny: obciążalność po współczynnikach i wynikający z niej przekrój. Ciepło musi mieć dokąd uciec —
                    przewód natynkowy chłodzi się powietrzem, a ten w ścianie ocieplonej termicznie praktycznie nie oddaje
                    ciepła, więc uniesie najmniej. Pomylenie tych dwóch przypadków to najczęstszy sposób na przegrzanie
                    przewodu w domu energooszczędnym.
                  </div>
                </div>
              </div>

              {sized.ostrzezenia.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  {sized.ostrzezenia.map((w, i) => (
                    <div
                      key={i}
                      className="flex gap-2 rounded-md p-2.5 text-[11.5px] leading-relaxed"
                      style={{
                        background: w.level === "error" ? "#C6433A14" : "#C1793F14",
                        color: w.level === "error" ? "#A2352C" : "#8A5526",
                      }}
                    >
                      <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                      <div>{w.message}</div>
                    </div>
                  ))}
                </div>
              )}

              <HowItWorks
                formulas={[
                  { label: "Prąd obliczeniowy — obwód 1-fazowy", eq: "Ib = P / (U × cos φ)", where: "P — moc czynna [W], U = 230 V, cos φ — współczynnik mocy" },
                  { label: "Prąd obliczeniowy — obwód 3-fazowy", eq: "Ib = P / (√3 × U × cos φ)", where: "U = 400 V (napięcie międzyfazowe)" },
                  { label: "Obciążalność po korekcie", eq: "Iz = Iz₀ × k1 × k2", where: "Iz₀ — obciążalność z tablicy dla METODY ODNIESIENIA wynikającej ze sposobu ułożenia, k1 — wsp. temperatury otoczenia, k2 — wsp. grupowania" },
                  { label: "Metoda odniesienia wg sposobu ułożenia", eq: "pod tynkiem → B2, w rurce → B1, natynkowo → C, ściana ocieplona → A1", where: "każda metoda ma własny wiersz w tablicy obciążalności (PN-HD 60364-5-52 tabl. B.52.4)" },
                  { label: "Spadek napięcia — 1-fazowy / 3-fazowy", eq: "ΔU = (2·L·Ib·ρ)/S   |   ΔU = (√3·L·Ib·ρ)/S", where: "ρ = 0,0225 Ω·mm²/m — rezystywność miedzi przy 70°C (żyła nagrzana prądem roboczym, nie 20°C)" },
                ]}
                notes={[
                  "Kalkulator szuka NAJMNIEJSZEGO przekroju, który jednocześnie spełnia obciążalność (Ib ≤ In ≤ Iz) i limit spadku napięcia — 3% dla obwodów oświetleniowych, 5% dla pozostałych. To ten sam silnik doboru, który automatycznie liczy zakładka „Rozdzielnica” dla obwodów narysowanych na planie, więc oba miejsca zawsze dają ten sam wynik dla tych samych danych.",
                  "Sposób ułożenia decyduje o tym, ile ciepła przewód może oddać, a więc wprost o obciążalności: ta sama żyła 2,5 mm² uniesie 27 A natynkowo i tylko 19,5 A w ścianie ocieplonej termicznie. Tabelka pod wynikiem pokazuje wszystkie cztery warianty naraz — jeśli nie masz pewności, którym pójdzie trasa, przyjmij ostrzejszy.",
                  "Przekrój bywa podnoszony ponad wynikający z samej obciążalności — decyduje wtedy spadek napięcia na długiej trasie. Kalkulator mówi o tym wprost w ostrzeżeniu.",
                  "Bez podanej długości trasy (albo przy długości = 0) spadek napięcia NIE jest sprawdzany — dobór pokrywa wtedy wyłącznie obciążalność.",
                  "Dobrany tu przekrój przenieś do kalkulatora „Dobór zabezpieczenia”, żeby zobaczyć sam wyłącznik wraz z warunkiem Ib ≤ In ≤ Iz i wymaganiem na pętlę zwarcia.",
                  "Wynik jest orientacyjny/edukacyjny — dobór do realizacji i odbioru wykonuje osoba z uprawnieniami, z uwzględnieniem rzeczywistej trasy kabla i warunków otoczenia.",
                ]}
              />
            </Card>
          )}

          {activeCalc === "zabezpieczenie" && (
            <Card title={active.label} icon={Zap} tag="wyłącznik nadprądowy">
              <div className="mb-3 rounded-md p-2.5 text-[11.5px] leading-relaxed" style={{ background: "#2D5A8C10", color: "#2D5A8C" }}>
                Przekrój jest tu <strong>daną wejściową</strong> — dobierasz wyłącznik do przewodu, który już leży albo
                został narzucony projektem. Jeśli dopiero szukasz przekroju, zacznij od „Dobór przekroju przewodu”;
                oba kalkulatory dzielą te same pola, więc nic nie trzeba przepisywać.
              </div>

              <div className="grid sm:grid-cols-2 gap-x-4">
                <Field
                  label="Rodzaj obwodu"
                  value={circuitKind}
                  onChange={(v) => setCircuitKind(v as CircuitKind)}
                  options={CIRCUIT_KIND_OPTIONS}
                />
                <Field
                  label="Przekrój żyły przewodu"
                  value={String(breakerSection)}
                  onChange={(v) => setBreakerSection(Number(v))}
                  options={SECTION_OPTIONS}
                />
                <Field label="Moc odbiornika" value={power} onChange={(v) => setPower(Number(v))} unit="W" />
                <Field label="Zasilanie" value={phase} onChange={(v) => setPhase(v as "1" | "3")} options={PHASE_OPTIONS} />
                <Field label="Współczynnik cos φ" value={cosphi} onChange={(v) => setCosphi(Number(v))} step="0.05" />
              </div>

              <div className="mb-2 mt-1 text-xs font-semibold text-slate-600">Warunki ułożenia (decydują o obciążalności)</div>
              <div className="grid sm:grid-cols-2 gap-x-4">
                <Field
                  label="Sposób ułożenia"
                  value={layingMethod}
                  onChange={(v) => setLayingMethod(v as LayingMethod)}
                  options={LAYING_METHOD_OPTIONS}
                />
                <Field label="Temperatura otoczenia" value={ambientC} onChange={(v) => setAmbientC(Number(v))} unit="°C" />
                <Field
                  label="Obwodów we wspólnej trasie"
                  value={bundleCount}
                  onChange={(v) => setBundleCount(Number(v))}
                  step="1"
                />
              </div>
              <label className="mb-3 flex items-center gap-2 text-[13px] text-slate-600">
                <input
                  type="checkbox"
                  checked={motorStart}
                  onChange={(e) => setMotorStart(e.target.checked)}
                  className="h-4 w-4 rounded border-border"
                />
                Odbiornik z rozruchem silnikowym (pompa, lodówka, klimatyzacja) — charakterystyka C
              </label>

              <div className="mt-2 p-3 pe-result">
                <div className="text-xs text-slate-500 mb-1">Dobrany wyłącznik nadprądowy</div>
                {sizedBreaker.aparat ? (
                  <>
                    <div className="pe-mono text-lg text-blueprint">
                      {sizedBreaker.aparat.charakterystyka}
                      {sizedBreaker.aparat.In_A} {sizedBreaker.aparat.bieguny}
                    </div>
                    <div className="mt-2 flex gap-2 flex-wrap">
                      <span className="pe-chip pe-tag-blue">Ib {sizedBreaker.Ib_A.toFixed(2)} A</span>
                      <span className="pe-chip pe-tag-green">Iz {sizedBreaker.Iz_A} A</span>
                      <span className="pe-chip" style={{ background: "#EEF1F4", color: "#475569" }}>
                        metoda {sizedBreaker.metoda_odniesienia} · k1 {sizedBreaker.wspolczynniki.k1_temperatura} · k2{" "}
                        {sizedBreaker.wspolczynniki.k2_grupowanie}
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="text-sm mt-2 flex items-center gap-1" style={{ color: "#A2352C" }}>
                    <AlertTriangle size={14} /> nie udało się dobrać — zobacz komunikat niżej
                  </div>
                )}
              </div>

              {/* Warunek Ib ≤ In ≤ Iz rozpisany na trzy liczby obok siebie: to JEDYNY
                  warunek doboru zabezpieczenia i cały sens tego kalkulatora, więc ma
                  być widoczny wprost, a nie do odtworzenia z chipów wyżej. */}
              {sizedBreaker.aparat && (
                <div className="mt-2 p-3 rounded-lg text-sm flex items-start gap-2" style={{ background: "#3B8C631A", color: "#2C6B4A" }}>
                  <Check size={16} className="shrink-0 mt-0.5" />
                  <div>
                    Warunek doboru spełniony:{" "}
                    <strong className="pe-mono">
                      {sizedBreaker.Ib_A.toFixed(2)} A ≤ {sizedBreaker.aparat.In_A} A ≤ {sizedBreaker.Iz_A} A
                    </strong>{" "}
                    (Ib ≤ In ≤ Iz) — wyłącznik zadziała, zanim przewód się przegrzeje.
                  </div>
                </div>
              )}

              {sizedBreaker.Ia_A !== null && sizedBreaker.Zs_max_Ohm !== null && (
                <div className="mt-2 p-3 pe-result grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs text-slate-500">Prąd zadziałania Ia</div>
                    <div className="pe-mono">{sizedBreaker.Ia_A.toFixed(0)} A</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Wymagana Zs max</div>
                    <div className="pe-mono text-copper">{sizedBreaker.Zs_max_Ohm.toFixed(2)} Ω</div>
                  </div>
                </div>
              )}

              {sizedBreaker.ostrzezenia.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  {sizedBreaker.ostrzezenia.map((w, i) => (
                    <div
                      key={i}
                      className="flex gap-2 rounded-md p-2.5 text-[11.5px] leading-relaxed"
                      style={{
                        background: w.level === "error" ? "#C6433A14" : "#C1793F14",
                        color: w.level === "error" ? "#A2352C" : "#8A5526",
                      }}
                    >
                      <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                      <div>{w.message}</div>
                    </div>
                  ))}
                </div>
              )}

              <HowItWorks
                formulas={[
                  {
                    label: "Warunek doboru zabezpieczenia",
                    eq: "Ib ≤ In ≤ Iz",
                    where: "Ib — prąd obliczeniowy, In — prąd znamionowy wyłącznika, Iz — obciążalność przewodu po współczynnikach",
                  },
                  {
                    label: "Obciążalność przewodu po korekcie",
                    eq: "Iz = Iz₀ × k1 × k2",
                    where: "Iz₀ z tablicy dla metody odniesienia wynikającej ze sposobu ułożenia — to dlatego warunki ułożenia są tu polem obowiązkowym, mimo że przekrój jest już znany",
                  },
                  {
                    label: "Prąd zadziałania wyzwalacza magnetycznego",
                    eq: "Ia = k × In",
                    where: "k = 5 dla charakterystyki B, 10 dla C, 20 dla D",
                  },
                  {
                    label: "Wymaganie na pętlę zwarcia",
                    eq: "Zs max = U₀ / Ia",
                    where: "U₀ = 230 V — zmierzona Zs nie może przekroczyć tej wartości (patrz kalkulator „Impedancja pętli zwarcia”)",
                  },
                ]}
                notes={[
                  "Wyłącznik chroni PRZEWÓD, nie odbiornik — dlatego górną granicą jest obciążalność przewodu (Iz), a nie moc urządzenia. Zabezpieczenie dobrane „pod odbiornik”, bez sprawdzenia Iz, to klasyczny sposób na przegrzanie instalacji.",
                  "Obwód wymiarowany jest pod docelową obsadę, nie tylko pod dzisiejszą moc — obwód gniazd dostaje typowo B16, a oświetlenia B10, nawet jeśli chwilowy pobór jest dużo niższy. Kalkulator schodzi poniżej tej wartości tylko wtedy, gdy obciążalność przewodu na to nie pozwala, i mówi o tym wprost.",
                  "Charakterystyka C (zamiast B) dla odbiorników z rozruchem silnikowym zapobiega wyłączaniu przy prądzie rozruchowym — ale podnosi Ia dwukrotnie, więc ZAOSTRZA wymaganie na impedancję pętli zwarcia.",
                  "Warunek Ib ≤ In ≤ Iz to dopiero połowa ochrony: drugą jest samoczynne wyłączenie w wymaganym czasie, czyli warunek na Zs. Sprawdź go w kalkulatorze „Impedancja pętli zwarcia”, wpisując pokazaną tu Zs max.",
                  "Ten sam silnik doboru co „Dobór przekroju przewodu” i zakładka Rozdzielnica — dla tych samych danych wszystkie trzy miejsca podadzą ten sam aparat.",
                ]}
              />
            </Card>
          )}

          {activeCalc === "spadek" && (
            <Card title={active.label} icon={TrendingDown} tag="sprawdzenie trasy">
              <div className="mb-3 rounded-md p-2.5 text-[11.5px] leading-relaxed" style={{ background: "#2D5A8C10", color: "#2D5A8C" }}>
                Ten kalkulator sprawdza trasę o <strong>znanym przekroju</strong> — np. kabel, który już jest ułożony
                albo narzucony z góry. Jeśli dopiero dobierasz przewód, użyj „Dobór przekroju przewodu”: tam przekrój
                jest wynikiem, dobieranym pod obciążalność i spadek naraz.
              </div>

              <div className="grid sm:grid-cols-2 gap-x-4">
                <Field label="Prąd obciążenia (Ib)" value={duCurrentA} onChange={(v) => setDuCurrentA(Number(v))} unit="A" step="0.1" />
                <Field label="Zasilanie" value={duPhase} onChange={(v) => setDuPhase(v as "1" | "3")} options={PHASE_OPTIONS} />
                <Field label="Współczynnik cos φ" value={duCosfi} onChange={(v) => patch({ duCosfi: Number(v) })} step="0.05" />
                <Field label="Długość trasy (w jedną stronę)" value={duLength} onChange={(v) => setDuLength(Number(v))} unit="m" />
                <Field
                  label="Przekrój żyły"
                  value={String(duSection)}
                  onChange={(v) => setDuSection(Number(v))}
                  options={SZEREG_PELNY_OPTIONS}
                />
                <Field
                  label="Materiał żyły"
                  value={duMaterial}
                  onChange={(v) => patch({ duMaterial: v as Material })}
                  options={MATERIAL_OPTIONS}
                />
                <Field
                  label="Izolacja (temperatura pracy)"
                  value={duIzolacja}
                  onChange={(v) => patch({ duIzolacja: v as Izolacja })}
                  options={IZOLACJA_OPTIONS}
                />
                <Field
                  label="Przewody równoległe na fazę"
                  value={duRownolegle}
                  onChange={(v) => patch({ duRownolegle: Number(v) })}
                  step="1"
                />
                <Field
                  label="Dopuszczalny spadek napięcia"
                  value={String(duLimitPct)}
                  onChange={(v) => setDuLimitPct(Number(v))}
                  options={LIMIT_SPADKU_OPCJE}
                />
              </div>

              {/* Metoda pełna jest OBOWIĄZKOWA od 35 mm² (spec pkt 7) — silnik zwraca
                  wtedy twardy błąd zamiast liczyć dalej, więc checkbox musi być
                  widoczny obok pola przekroju, a nie schowany w opcjach. */}
              <label className="mb-3 flex items-center gap-2 text-[13px] text-slate-600">
                <input
                  type="checkbox"
                  checked={duZReaktancja}
                  onChange={(e) => patch({ duZReaktancja: e.target.checked })}
                  className="h-4 w-4 rounded border-border"
                />
                Uwzględnij reaktancję (metoda pełna — wymagana dla przekrojów od 35 mm²)
              </label>
              {duZReaktancja && (
                <Field
                  label="Rodzaj linii (reaktancja jednostkowa X′)"
                  value={duRodzajLinii}
                  onChange={(v) => patch({ duRodzajLinii: v as RodzajLinii })}
                  options={RODZAJ_LINII_OPTIONS}
                />
              )}

              {spadekPelny.wartosci && (
                <div className="mt-2 p-3 pe-result">
                  <div className="text-xs text-slate-500 mb-1">Spadek napięcia na trasie</div>
                  <div className="pe-mono text-lg text-blueprint">{formatLiczba(spadekPelny.wartosci.spadek_pct, 2)} %</div>
                  <div className="mt-2 flex gap-2 flex-wrap">
                    <span className="pe-chip pe-tag-copper">ΔU {formatLiczba(spadekPelny.wartosci.spadek_V, 2)} V</span>
                    <span className="pe-chip pe-tag-blue">
                      napięcie u odbiornika {formatLiczba(spadekPelny.wartosci.napiecieKoncowe_V, 1)} V
                    </span>
                    {spadekPelny.wartosci.minPrzekroj_mm2 !== null && (
                      <span className="pe-chip pe-tag-green">
                        min. przekrój w limicie {String(spadekPelny.wartosci.minPrzekroj_mm2).replace(".", ",")} mm²
                      </span>
                    )}
                  </div>
                </div>
              )}

              <CalcResultView wynik={spadekPelny} />
            </Card>
          )}

          {activeCalc === "zwarcie" && (
            <Card title={active.label} icon={Flame} tag="PN-EN 60909">
              <div className="mb-3 rounded-md p-2.5 text-[11.5px] leading-relaxed" style={{ background: "#2D5A8C10", color: "#2D5A8C" }}>
                Współczynnik napięciowy <strong>c wynika z celu obliczenia</strong>, a nie z osobnego pola: do doboru
                aparatów liczy się najgorszy przypadek największego prądu (c = 1,05), a do ochrony przeciwporażeniowej —
                najmniejszego (c = 0,95). Pomylenie ich daje wynik pozornie poprawny i całkowicie nieprzydatny.
              </div>

              <Field label="Cel obliczenia" value={zwCel} onChange={(v) => patch({ zwCel: v as CelZwarcia })} options={CEL_ZWARCIA_OPTIONS} />

              <div className="mb-2 mt-1 text-xs font-semibold text-slate-600">Transformator zasilający</div>
              <div className="grid sm:grid-cols-2 gap-x-4">
                <Field label="Moc znamionowa Sn" value={zwSnKVA} onChange={(v) => patch({ zwSnKVA: Number(v) })} unit="kVA" />
                <Field label="Napięcie zwarcia uk" value={zwUkPct} onChange={(v) => patch({ zwUkPct: Number(v) })} unit="%" step="0.1" />
                <Field label="Napięcie międzyfazowe Un" value={zwUnV} onChange={(v) => patch({ zwUnV: Number(v) })} unit="V" />
                <Field
                  label="Straty obciążeniowe ΔPCu (0 = pomiń)"
                  value={zwStratyCuW}
                  onChange={(v) => patch({ zwStratyCuW: Number(v) })}
                  unit="W"
                />
              </div>

              <div className="mb-2 mt-1 text-xs font-semibold text-slate-600">Miejsce zwarcia</div>
              <div className="grid sm:grid-cols-2 gap-x-4">
                <Field label="Impedancja pętli Zs (0 = pomiń Ik1)" value={zwZsOhm} onChange={(v) => patch({ zwZsOhm: Number(v) })} unit="Ω" step="0.01" />
                <Field label="Stosunek R/X (do prądu udarowego)" value={zwRdoX} onChange={(v) => patch({ zwRdoX: Number(v) })} step="0.01" />
              </div>

              {trafo.wartosci && zwarcie.wartosci && (
                <div className="mt-2 p-3 pe-result">
                  <div className="text-xs text-slate-500 mb-1">Prąd zwarcia trójfazowego</div>
                  <div className="pe-mono text-lg text-blueprint">{formatLiczba(zwarcie.wartosci.Ik3_A / 1000, 2)} kA</div>
                  <div className="mt-2 flex gap-2 flex-wrap">
                    <span className="pe-chip pe-tag-copper">Zt {formatLiczba(trafo.wartosci.Zt_ohm * 1000, 2)} mΩ</span>
                    <span className="pe-chip pe-tag-blue">Ik2 {formatLiczba(zwarcie.wartosci.Ik2_A / 1000, 2)} kA</span>
                    {zwarcie.wartosci.Ik1_A !== null && (
                      <span className="pe-chip pe-tag-blue">Ik1 {formatLiczba(zwarcie.wartosci.Ik1_A, 0)} A</span>
                    )}
                    {zwarcie.wartosci.ip_A !== null && (
                      <span className="pe-chip pe-tag-green">ip {formatLiczba(zwarcie.wartosci.ip_A / 1000, 2)} kA</span>
                    )}
                    <span className="pe-chip" style={{ background: "#EEF1F4", color: "#475569" }}>
                      c = {formatLiczba(zwarcie.wartosci.c, 2)}
                    </span>
                  </div>
                  <div className="mt-2 text-[11px] leading-relaxed text-slate-500">
                    Wymagana zdolność zwarciowa aparatu w tym miejscu: Icn ≥{" "}
                    <strong>{formatLiczba(zwarcie.wartosci.Ik3_A / 1000, 2)} kA</strong> (dobieraj z c = 1,05).
                  </div>
                </div>
              )}

              {/* Błąd danych transformatora wyklucza policzenie zwarcia, więc
                  pokazujemy WTEDY jego komunikat — inaczej użytkownik widziałby
                  „impedancja musi być większa od zera" zamiast przyczyny. */}
              {trafo.bledy.length > 0 ? <CalcResultView wynik={trafo} /> : <CalcResultView wynik={zwarcie} />}

              <div className="mb-2 mt-4 text-xs font-semibold text-slate-600">
                Wytrzymałość zwarciowa cieplna przewodu (S ≥ I·√t / k)
              </div>
              <div className="grid sm:grid-cols-2 gap-x-4">
                <Field label="Czas trwania zwarcia" value={zwCzasS} onChange={(v) => patch({ zwCzasS: Number(v) })} unit="s" step="0.01" />
                <Field
                  label="Przekrój żyły"
                  value={String(zwPrzekroj)}
                  onChange={(v) => patch({ zwPrzekroj: Number(v) })}
                  options={SZEREG_PELNY_OPTIONS}
                />
                <Field label="Materiał" value={zwMaterial} onChange={(v) => patch({ zwMaterial: v as Material })} options={MATERIAL_OPTIONS} />
                <Field label="Izolacja" value={zwIzolacja} onChange={(v) => patch({ zwIzolacja: v as Izolacja })} options={IZOLACJA_OPTIONS} />
              </div>
              {wytrzymalosc.wartosci && (
                <div className="mt-2 p-3 pe-result">
                  <div className="text-xs text-slate-500 mb-1">Minimalny przekrój ze względu na zwarcie</div>
                  <div className="pe-mono text-lg text-blueprint">
                    {formatLiczba(wytrzymalosc.wartosci.minPrzekroj_mm2, 2)} mm²
                  </div>
                  <div className="mt-2 flex gap-2 flex-wrap">
                    <span className="pe-chip pe-tag-copper">k = {wytrzymalosc.wartosci.k}</span>
                    {wytrzymalosc.wartosci.maksCzas_s !== null && (
                      <span className="pe-chip pe-tag-blue">
                        t max dla {String(zwPrzekroj).replace(".", ",")} mm² = {formatLiczba(wytrzymalosc.wartosci.maksCzas_s, 3)} s
                      </span>
                    )}
                  </div>
                </div>
              )}
              <CalcResultView wynik={wytrzymalosc} />
            </Card>
          )}

          {activeCalc === "uziom" && (
            <Card title={active.label} icon={Shovel} tag="geometria uziomu">
              <div className="grid sm:grid-cols-2 gap-x-4">
                <Field label="Typ uziomu" value={uzTyp} onChange={(v) => patch({ uzTyp: v as TypUziomu })} options={TYP_UZIOMU_OPTIONS} />
                <Field
                  label="Rodzaj gruntu (wartości orientacyjne)"
                  value={String(uzRho)}
                  onChange={(v) => patch({ uzRho: Number(v) })}
                  options={GRUNT_OPTIONS}
                />
                <Field label="Rezystywność gruntu ρ" value={uzRho} onChange={(v) => patch({ uzRho: Number(v) })} unit="Ω·m" />
                <Field label="Długość uziomu" value={uzDlugosc} onChange={(v) => patch({ uzDlugosc: Number(v) })} unit="m" step="0.1" />
                {uzTyp === "pionowy" && (
                  <Field label="Średnica pręta" value={uzSrednicaMm} onChange={(v) => patch({ uzSrednicaMm: Number(v) })} unit="mm" />
                )}
                {uzTyp === "poziomy" && (
                  <>
                    <Field label="Szerokość bednarki" value={uzSzerokoscMm} onChange={(v) => patch({ uzSzerokoscMm: Number(v) })} unit="mm" />
                    <Field label="Głębokość ułożenia" value={uzGlebokosc} onChange={(v) => patch({ uzGlebokosc: Number(v) })} unit="m" step="0.1" />
                  </>
                )}
                <Field label="Liczba uziomów równolegle" value={uzLiczba} onChange={(v) => patch({ uzLiczba: Number(v) })} step="1" />
                {uzLiczba > 1 && (
                  <Field
                    label="Wsp. wykorzystania η (0,6–0,9)"
                    value={uzEta}
                    onChange={(v) => patch({ uzEta: Number(v) })}
                    step="0.05"
                  />
                )}
                <Field
                  label="Wymagana rezystancja (0 = bez oceny)"
                  value={uzWymagana}
                  onChange={(v) => patch({ uzWymagana: Number(v) })}
                  unit="Ω"
                />
              </div>

              {uziom.wartosci && (
                <div className="mt-2 p-3 pe-result">
                  <div className="text-xs text-slate-500 mb-1">Rezystancja uziemienia</div>
                  <div className="pe-mono text-lg text-blueprint">{formatLiczba(uziom.wartosci.R_wypadkowa_ohm, 2)} Ω</div>
                  <div className="mt-2 flex gap-2 flex-wrap">
                    {uzLiczba > 1 && (
                      <span className="pe-chip pe-tag-copper">
                        pojedynczy {formatLiczba(uziom.wartosci.R_pojedynczy_ohm, 2)} Ω
                      </span>
                    )}
                    {uziom.wartosci.potrzebnaDlugosc_m !== null && (
                      <span className="pe-chip pe-tag-green">
                        długość dla {formatLiczba(uzWymagana, 0)} Ω: {formatLiczba(uziom.wartosci.potrzebnaDlugosc_m, 1)} m
                      </span>
                    )}
                  </div>
                </div>
              )}
              <CalcResultView wynik={uziom} />
            </Card>
          )}

          {activeCalc === "bilansFaz" && (
            <Card title={active.label} icon={Scale} tag="asymetria i przewód N">
              <div className="mb-3 rounded-md p-2.5 text-[11.5px] leading-relaxed" style={{ background: "#2D5A8C10", color: "#2D5A8C" }}>
                Przy odbiorach nieliniowych (zasilacze impulsowe, LED, falowniki) 3. harmoniczna sumuje się w przewodzie
                neutralnym <strong>arytmetycznie</strong>, zamiast się znosić — prąd w N potrafi wtedy przekroczyć prąd
                fazowy nawet przy idealnie symetrycznym obciążeniu. W przewodzie N nie ma wyłącznika, więc nic tego
                przeciążenia nie wyłapie.
              </div>

              <div className="space-y-2 mb-3">
                {bfOdbiory.map((o) => (
                  <div key={o.id} className="flex items-center gap-2">
                    <input
                      className="pe-input text-sm flex-1 min-w-0"
                      value={o.nazwa}
                      onChange={(e) => setOdbioryFazowe((ds) => ds.map((x) => (x.id === o.id ? { ...x, nazwa: e.target.value } : x)))}
                    />
                    <input
                      className="pe-input text-sm w-20 pe-mono"
                      type="number"
                      aria-label={`Moc: ${o.nazwa}`}
                      value={o.mocW}
                      onChange={(e) => setOdbioryFazowe((ds) => ds.map((x) => (x.id === o.id ? { ...x, mocW: Number(e.target.value) } : x)))}
                    />
                    <span className="text-xs text-slate-400">W</span>
                    <input
                      className="pe-input text-sm w-16 pe-mono"
                      type="number"
                      step="0.05"
                      aria-label={`cos φ: ${o.nazwa}`}
                      value={o.cosfi}
                      onChange={(e) => setOdbioryFazowe((ds) => ds.map((x) => (x.id === o.id ? { ...x, cosfi: Number(e.target.value) } : x)))}
                    />
                    <select
                      className="pe-input text-sm w-24"
                      aria-label={`Faza: ${o.nazwa}`}
                      value={o.faza ?? "3f"}
                      onChange={(e) =>
                        setOdbioryFazowe((ds) =>
                          ds.map((x) => (x.id === o.id ? { ...x, faza: e.target.value === "3f" ? null : (e.target.value as Faza) } : x))
                        )
                      }
                    >
                      {FAZA_OPTIONS.map((f) => (
                        <option key={f.value} value={f.value}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                    <button onClick={() => setOdbioryFazowe((ds) => ds.filter((x) => x.id !== o.id))} className="text-slate-400 hover:text-red-500">
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <button
                  onClick={() =>
                    setOdbioryFazowe((ds) => [...ds, { id: crypto.randomUUID(), nazwa: "Nowy odbiór", mocW: 1000, cosfi: 1, faza: "L1" }])
                  }
                  className="pe-btn-ghost text-xs px-2.5 py-1.5 flex items-center gap-1"
                >
                  <Plus size={13} /> Dodaj odbiór
                </button>
              </div>
              <Field
                label="Udział 3. harmonicznej w prądzie fazowym"
                value={bfH3Pct}
                onChange={(v) => patch({ bfH3Pct: Number(v) })}
                unit="%"
                step="5"
              />

              {bilansFaz.wartosci && (
                <div className="mt-2 p-3 pe-result">
                  <div className="text-xs text-slate-500 mb-1">Prąd w przewodzie neutralnym</div>
                  <div className="pe-mono text-lg text-blueprint">{formatLiczba(bilansFaz.wartosci.IN_calkowity_A, 2)} A</div>
                  <div className="mt-2 flex gap-2 flex-wrap">
                    <span className="pe-chip pe-tag-copper">
                      L1 {formatLiczba(bilansFaz.wartosci.prady.L1, 1)} A · L2 {formatLiczba(bilansFaz.wartosci.prady.L2, 1)} A · L3{" "}
                      {formatLiczba(bilansFaz.wartosci.prady.L3, 1)} A
                    </span>
                    <span className="pe-chip pe-tag-blue">asymetria {formatLiczba(bilansFaz.wartosci.asymetria_pct, 1)}%</span>
                    <span className="pe-chip pe-tag-green">S {formatLiczba(bilansFaz.wartosci.S_VA / 1000, 2)} kVA</span>
                    <span className="pe-chip" style={{ background: "#EEF1F4", color: "#475569" }}>
                      cosφ {formatLiczba(bilansFaz.wartosci.cosfi, 3)}
                    </span>
                  </div>
                </div>
              )}
              <CalcResultView wynik={bilansFaz} />
            </Card>
          )}

          {activeCalc === "silnik" && (
            <Card title={active.label} icon={Cog} tag="rozruch i zabezpieczenia">
              <div className="grid sm:grid-cols-2 gap-x-4">
                <Field label="Moc na wale" value={slMocKW} onChange={(v) => patch({ slMocKW: Number(v) })} unit="kW" step="0.1" />
                <Field label="Napięcie międzyfazowe" value={slUn} onChange={(v) => patch({ slUn: Number(v) })} unit="V" />
                <Field label="Współczynnik mocy cos φ" value={slCosfi} onChange={(v) => patch({ slCosfi: Number(v) })} step="0.01" />
                <Field label="Sprawność η" value={slSprawnosc} onChange={(v) => patch({ slSprawnosc: Number(v) })} step="0.01" />
                <Field
                  label="Krotność prądu rozruchowego (z tabliczki)"
                  value={slKrotnosc}
                  onChange={(v) => patch({ slKrotnosc: Number(v) })}
                  step="0.5"
                />
                <Field label="Sposób rozruchu" value={slRozruch} onChange={(v) => patch({ slRozruch: v as SposobRozruchu })} options={ROZRUCH_OPTIONS} />
                <Field label="Czas rozruchu (0 = pomiń)" value={slCzasRozruchu} onChange={(v) => patch({ slCzasRozruchu: Number(v) })} unit="s" step="0.5" />
                <Field
                  label="Impedancja obwodu zasilającego (0 = pomiń)"
                  value={slImpedancja}
                  onChange={(v) => patch({ slImpedancja: Number(v) })}
                  unit="Ω"
                  step="0.01"
                />
              </div>

              {silnik.wartosci && (
                <div className="mt-2 p-3 pe-result">
                  <div className="text-xs text-slate-500 mb-1">Prąd znamionowy silnika</div>
                  <div className="pe-mono text-lg text-blueprint">{formatLiczba(silnik.wartosci.In_A, 2)} A</div>
                  <div className="mt-2 flex gap-2 flex-wrap">
                    <span className="pe-chip pe-tag-copper">prąd rozruchowy {formatLiczba(silnik.wartosci.Ir_A, 1)} A</span>
                    {slRozruch === "gwiazda_trojkat" && (
                      <span className="pe-chip pe-tag-blue">
                        przy DOL byłoby {formatLiczba(silnik.wartosci.Ir_bezposredni_A, 1)} A
                      </span>
                    )}
                    <span className="pe-chip pe-tag-blue">stycznik AC-3 ≥ {formatLiczba(silnik.wartosci.stycznikAC3_A, 1)} A</span>
                    {silnik.wartosci.klasaWyzwalania && (
                      <span className="pe-chip pe-tag-green">przekaźnik klasy {silnik.wartosci.klasaWyzwalania}</span>
                    )}
                    <span className="pe-chip" style={{ background: "#EEF1F4", color: "#475569" }}>
                      moment {formatLiczba(silnik.wartosci.momentWzgledny * 100, 0)}% momentu przy DOL
                    </span>
                  </div>
                </div>
              )}
              <CalcResultView wynik={silnik} />
            </Card>
          )}

          {activeCalc === "kompensacja" && (
            <Card title={active.label} icon={Gauge} tag="moc bierna">
              <div className="grid sm:grid-cols-2 gap-x-4">
                <Field label="Moc czynna odbioru" value={kmPkW} onChange={(v) => setKm({ kmPkW: Number(v) })} unit="kW" />
                <Field label="Napięcie (międzyfazowe)" value={kmUV} onChange={(v) => setKm({ kmUV: Number(v) })} unit="V" />
                <Field label="cos φ przed kompensacją" value={kmCos1} onChange={(v) => setKm({ kmCos1: Number(v) })} step="0.01" />
                <Field label="cos φ docelowy" value={kmCos2} onChange={(v) => setKm({ kmCos2: Number(v) })} step="0.01" />
                <Field
                  label="Układ połączeń baterii"
                  value={kmUklad}
                  onChange={(v) => setKm({ kmUklad: v as UkladBaterii })}
                  options={UKLAD_BATERII_OPTIONS}
                />
                <Field
                  label="Moc zwarciowa Sk (0 = nie sprawdzaj rezonansu)"
                  value={kmSkKVA}
                  onChange={(v) => setKm({ kmSkKVA: Number(v) })}
                  unit="kVA"
                />
              </div>

              {kompensacja.wartosci && (
                <div className="mt-2 p-3 pe-result">
                  <div className="text-xs text-slate-500 mb-1">Wymagana moc baterii kondensatorów</div>
                  <div className="pe-mono text-lg text-blueprint">{formatLiczba(kompensacja.wartosci.Qc_var / 1000, 2)} kvar</div>
                  <div className="mt-2 flex gap-2 flex-wrap">
                    <span className="pe-chip pe-tag-copper">
                      C = {formatLiczba(kompensacja.wartosci.C_F * 1e6, 1)} µF
                      {kmUklad === "trojkat" ? " / gałąź" : ""}
                    </span>
                    <span className="pe-chip pe-tag-blue">tgφ₁ = {formatLiczba(kompensacja.wartosci.tgfi1, 3)}</span>
                    <span className="pe-chip pe-tag-blue">tgφ₂ = {formatLiczba(kompensacja.wartosci.tgfi2, 3)}</span>
                    {kompensacja.wartosci.rzadRezonansu !== null && (
                      <span className="pe-chip pe-tag-green">
                        rezonans przy n ≈ {formatLiczba(kompensacja.wartosci.rzadRezonansu, 2)}
                      </span>
                    )}
                  </div>
                </div>
              )}

              <CalcResultView wynik={kompensacja} />
            </Card>
          )}

          {activeCalc === "moc" && (
            <Card title={active.label} icon={Home} tag="bilans mocy">
              <div className="space-y-2 mb-3">
                {devices.map((d) => (
                  <div key={d.id} className="flex items-center gap-2">
                    <input
                      className="pe-input text-sm flex-1"
                      value={d.name}
                      onChange={(e) => setDevices((ds) => ds.map((x) => (x.id === d.id ? { ...x, name: e.target.value } : x)))}
                    />
                    <input
                      className="pe-input text-sm w-24 pe-mono"
                      type="number"
                      value={d.power}
                      onChange={(e) => setDevices((ds) => ds.map((x) => (x.id === d.id ? { ...x, power: Number(e.target.value) } : x)))}
                    />
                    <span className="text-xs text-slate-400 w-6">W</span>
                    <button onClick={() => setDevices((ds) => ds.filter((x) => x.id !== d.id))} className="text-slate-400 hover:text-red-500">
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setDevices((ds) => [...ds, { id: crypto.randomUUID(), name: "Nowy odbiornik", power: 1000 }])}
                  className="pe-btn-ghost text-xs px-2.5 py-1.5 flex items-center gap-1"
                >
                  <Plus size={13} /> Dodaj odbiornik
                </button>
                <button
                  onClick={loadDevicesFromProject}
                  disabled={projectDevices.length === 0}
                  title={
                    projectDevices.length === 0
                      ? "Brak elementów na planie — narysuj instalację, żeby wczytać bilans stąd"
                      : "Zastąp listę mocą zainstalowaną obwodów wyliczonych z planu"
                  }
                  className="pe-btn-ghost text-xs px-2.5 py-1.5 flex items-center gap-1 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Download size={13} /> Wczytaj z projektu
                </button>
              </div>
              <Field label="Współczynnik jednoczesności (ks)" value={ks} onChange={(v) => setKs(Number(v))} step="0.05" />
              <div className="mt-2 p-3 pe-result grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-slate-500">Moc zainstalowana</div>
                  <div className="pe-mono">{balance.sumPower.toFixed(0)} W</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Moc zapotrzebowana</div>
                  <div className="pe-mono text-copper">{balance.demandPower.toFixed(0)} W</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Prąd — 1-faz.</div>
                  <div className="pe-mono">{balance.demandCurrent1.toFixed(1)} A</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Prąd — 3-faz.</div>
                  <div className="pe-mono">{balance.demandCurrent3.toFixed(1)} A</div>
                </div>
              </div>
              <HowItWorks
                formulas={[
                  { label: "Moc zainstalowana", eq: "Pi = ΣP", where: "suma mocy znamionowych wszystkich odbiorników" },
                  { label: "Moc zapotrzebowana (szczytowa)", eq: "Pz = Pi × ks", where: "ks — współczynnik jednoczesności (0 < ks ≤ 1)" },
                  { label: "Prąd zapotrzebowany", eq: "I₁f = Pz / U   |   I₃f = Pz / (√3 × U)", where: "U = 230 V dla 1 fazy, 400 V dla 3 faz" },
                ]}
                notes={[
                  "„Wczytaj z projektu” zastępuje listę mocą zainstalowaną obwodów wyliczonych z elementów rozstawionych na planie (ten sam model obciążeń co w Rozdzielnicy) — to tylko punkt startowy, dopisz ręcznie odbiorniki, których nie ma na rysunku (np. piekarnik podłączony na stałe bez widocznego gniazda).",
                  "Współczynnik jednoczesności odzwierciedla fakt, że nie wszystkie odbiorniki pracują jednocześnie z pełną mocą.",
                  "Wartości orientacyjne ks dla domu jednorodzinnego: 0,6–0,8. Im więcej odbiorników, tym niższy współczynnik.",
                  "Moc zapotrzebowana służy do doboru mocy przyłączeniowej we wniosku do operatora sieci oraz zabezpieczenia przedlicznikowego.",
                  "Dla instalacji z pompą ciepła, ładowarką EV lub kuchenką indukcyjną warto przyjąć wyższy ks — te odbiorniki potrafią pracować równocześnie i długotrwale.",
                  "Kalkulator zakłada cos φ = 1. Przy dużym udziale silników rzeczywisty prąd będzie wyższy o 1/cos φ.",
                ]}
              />
            </Card>
          )}

          {activeCalc === "wlz" && (
            <Card title={active.label} icon={Cable} tag="WLZ">
              <div className="grid sm:grid-cols-2 gap-x-4">
                <div>
                  <Field label="Prąd obliczeniowy" value={wlzCurrentA} onChange={(v) => setWlzCurrentA(Number(v))} unit="A" />
                  <button
                    type="button"
                    onClick={loadWlzCurrentFromBalance}
                    className="pe-btn-ghost -mt-2 mb-3 text-xs px-2.5 py-1.5 flex items-center gap-1"
                  >
                    <Download size={13} /> Wczytaj z bilansu mocy
                  </button>
                </div>
                <Field
                  label="Zasilanie"
                  value={wlzPhase}
                  onChange={(v) => setWlzPhase(v as "1" | "3")}
                  options={[
                    { value: "1", label: "1-fazowe 230V" },
                    { value: "3", label: "3-fazowe 400V" },
                  ]}
                />
              </div>

              <div className="mb-2 mt-1 text-xs font-semibold text-slate-600">Trasa i warunki ułożenia</div>
              <div className="grid sm:grid-cols-2 gap-x-4">
                <Field label="Długość trasy (w jedną stronę)" value={wlzLength} onChange={(v) => setWlzLength(Number(v))} unit="m" />
                <Field
                  label="Sposób ułożenia"
                  value={wlzLayingMethod}
                  onChange={(v) => setWlzLayingMethod(v as LayingMethod)}
                  options={LAYING_METHOD_OPTIONS}
                />
                <Field label="Temperatura otoczenia" value={wlzAmbientC} onChange={(v) => setWlzAmbientC(Number(v))} unit="°C" />
                <Field
                  label="Obwodów we wspólnej trasie"
                  value={wlzBundleCount}
                  onChange={(v) => setWlzBundleCount(Number(v))}
                  step="1"
                />
                <Field
                  label="Dopuszczalny spadek napięcia na WLZ"
                  value={wlzDropLimit}
                  onChange={(v) => setWlzDropLimit(Number(v))}
                  unit="%"
                  step="0.5"
                />
              </div>

              <div className="mt-2 p-3 pe-result">
                {sizedFeeder.przekroj_mm2 && sizedFeeder.aparat ? (
                  <div className="flex gap-2 flex-wrap">
                    <span className="pe-chip pe-tag-copper">{sizedFeeder.kabel}</span>
                    <span className="pe-chip pe-tag-blue">
                      wyłącznik {sizedFeeder.aparat.charakterystyka}
                      {sizedFeeder.aparat.In_A} {sizedFeeder.aparat.bieguny}
                    </span>
                    <span className="pe-chip pe-tag-green">obc. dop. {sizedFeeder.Iz_A} A</span>
                    {sizedFeeder.spadek_napiecia_pct !== null && (
                      <span className="pe-chip" style={{ background: "#EEF1F4", color: "#475569" }}>
                        ΔU {sizedFeeder.spadek_napiecia_pct}% (limit {sizedFeeder.spadek_napiecia_limit_pct}%)
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="text-sm flex items-center gap-1" style={{ color: "#A2352C" }}>
                    <AlertTriangle size={14} /> nie udało się dobrać — zobacz komunikat niżej
                  </div>
                )}
              </div>

              {sizedFeeder.ostrzezenia.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  {sizedFeeder.ostrzezenia.map((w, i) => (
                    <div
                      key={i}
                      className="flex gap-2 rounded-md p-2.5 text-[11.5px] leading-relaxed"
                      style={{
                        background: w.level === "error" ? "#C6433A14" : "#C1793F14",
                        color: w.level === "error" ? "#A2352C" : "#8A5526",
                      }}
                    >
                      <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                      <div>{w.message}</div>
                    </div>
                  ))}
                </div>
              )}

              <HowItWorks
                formulas={[
                  { label: "Warunek doboru zabezpieczenia", eq: "Ib ≤ In ≤ Iz", where: "Iz = Iz₀ × k1 × k2 — obciążalność po współczynnikach temperatury i grupowania" },
                  { label: "Spadek napięcia — 1-fazowy / 3-fazowy", eq: "ΔU = (2·L·Ib·ρ)/S   |   ΔU = (√3·L·Ib·ρ)/S", where: "ρ = 0,0225 Ω·mm²/m przy 70°C, ten sam wzór co w doborze obwodu odbiorczego" },
                ]}
                notes={[
                  "Ten sam silnik doboru co „Dobór przekroju przewodu” i Rozdzielnica (`sizeCircuit`/`sizeFeeder` w `lib/panel/sizing.ts`) — ta sama tablica obciążalności, te same współczynniki poprawkowe.",
                  "Minimalny przekrój WLZ przyjęto na 10 mm² — praktyka projektowa dla domu jednorodzinnego (kabel dźwiga cały budynek), NIE liczba wprost z normy.",
                  "Domyślny limit spadku napięcia na samej WLZ to 2%, węższy niż 3-5% dla obwodu odbiorczego — WLZ to tylko odcinek całej trasy do odbiornika, więc zostawia miejsce na spadek za rozdzielnicą. Można go zmienić powyżej.",
                  "Tablice dotyczą przewodu w budynku (pod tynkiem/w rurce/natynkowo) — NIE kabla ziemnego. Jeśli WLZ biegnie w ziemi od złącza kablowo-pomiarowego, ten kalkulator się nie sprawdzi — potrzebna inna metoda odniesienia.",
                  "„Wczytaj z bilansu mocy” bierze prąd zapotrzebowany (Pz) z kalkulatora „Bilans mocy budynku” dla wybranej tu liczby faz — uzupełnij najpierw listę odbiorników w tamtym kalkulatorze.",
                ]}
              />
            </Card>
          )}

          {activeCalc === "petla" && (
            <Card title={active.label} icon={ClipboardCheck} tag="ochrona przeciwporażeniowa">
              <div className="grid sm:grid-cols-3 gap-x-4">
                <Field
                  label="Charakterystyka"
                  value={zCurve}
                  onChange={(v) => setZCurve(String(v))}
                  options={[
                    { value: "B", label: "B (5×In)" },
                    { value: "C", label: "C (10×In)" },
                    { value: "D", label: "D (20×In)" },
                  ]}
                />
                <Field label="Prąd znamionowy In" value={zIn} onChange={(v) => setZIn(Number(v))} unit="A" />
                <Field label="Zmierzona Zs" value={zMeasured} onChange={(v) => setZMeasured(Number(v))} unit="Ω" step="0.01" />
              </div>
              <div className="mt-2 p-3 pe-result grid grid-cols-3 gap-3">
                <div>
                  <div className="text-xs text-slate-500">Prąd zadziałania Ia</div>
                  <div className="pe-mono">{zCalc.ia.toFixed(0)} A</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Zs maksymalna</div>
                  <div className="pe-mono text-copper">{zCalc.zsMax ? zCalc.zsMax.toFixed(2) : "—"} Ω</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Prąd zwarcia Ik</div>
                  <div className="pe-mono">{zCalc.ik ? zCalc.ik.toFixed(0) : "—"} A</div>
                </div>
              </div>
              {zCalc.ok !== null && (
                <div
                  className="mt-2 p-3 rounded-lg text-sm flex items-start gap-2"
                  style={zCalc.ok ? { background: "#3B8C631A", color: "#2C6B4A" } : { background: "#C6433A1A", color: "#A2352C" }}
                >
                  {zCalc.ok ? <Check size={16} className="shrink-0 mt-0.5" /> : <AlertTriangle size={16} className="shrink-0 mt-0.5" />}
                  {zCalc.ok
                    ? "Warunek spełniony — zabezpieczenie zadziała w wymaganym czasie."
                    : "Warunek niespełniony — zmierzona Zs przekracza wartość dopuszczalną. Skróć obwód, zwiększ przekrój lub zmień charakterystykę zabezpieczenia."}
                </div>
              )}
              <HowItWorks
                formulas={[
                  { label: "Warunek samoczynnego wyłączenia zasilania", eq: "Zs × Ia ≤ U₀", where: "Zs — impedancja pętli zwarcia [Ω], Ia — prąd zadziałania [A], U₀ = 230 V" },
                  { label: "Maksymalna dopuszczalna impedancja", eq: "Zs max = U₀ / Ia", where: "wartość, której zmierzona Zs nie może przekroczyć" },
                  { label: "Prąd zadziałania wyzwalacza magnetycznego", eq: "Ia = k × In", where: "k = 5 dla char. B, 10 dla C, 20 dla D (górna granica pasma)" },
                  { label: "Spodziewany prąd zwarcia", eq: "Ik = U₀ / Zs", where: "prąd, jaki popłynie przy zwarciu L-PE" },
                ]}
                notes={[
                  "Wymagany czas wyłączenia w układzie TN dla obwodów odbiorczych do 32 A wynosi 0,4 s, a dla obwodów rozdzielczych — 5 s.",
                  "Przyjęto górną granicę pasma wyzwalania magnetycznego, co jest podejściem bezpiecznym — rzeczywisty wyłącznik zadziała przy prądzie nie większym niż ta wartość.",
                  "W praktyce pomiarowej często stosuje się dodatkowy zapas (np. mnożnik 0,8 dla Zs max), uwzględniający wzrost rezystancji przewodów przy nagrzaniu.",
                  "Jeśli warunek nie jest spełniony, ochronę można też zapewnić wyłącznikiem różnicowoprądowym — dla RCD 30 mA warunek Zs jest znacznie łagodniejszy.",
                  "Kalkulator dotyczy układu TN. Dla układu TT kryterium opiera się na rezystancji uziemienia, nie na impedancji pętli.",
                ]}
              />
            </Card>
          )}

          {activeCalc === "uziemienieTT" && (
            <Card title={active.label} icon={Anchor} tag="ochrona przeciwporażeniowa">
              <div className="grid sm:grid-cols-2 gap-x-4">
                <Field
                  label="Prąd różnicowy RCD (IΔn)"
                  value={ttIdnMa}
                  onChange={(v) => setTtIdnMa(Number(v))}
                  options={[
                    { value: "30", label: "30 mA" },
                    { value: "100", label: "100 mA" },
                    { value: "300", label: "300 mA" },
                    { value: "500", label: "500 mA" },
                  ]}
                />
                <Field label="Zmierzona rezystancja uziemienia RA" value={ttMeasuredRa} onChange={(v) => setTtMeasuredRa(Number(v))} unit="Ω" step="0.5" />
              </div>
              <div className="mt-2 p-3 pe-result">
                <div className="text-xs text-slate-500 mb-1">Maksymalna dopuszczalna RA</div>
                <div className="pe-mono text-lg text-copper">{groundingCheck.raMax.toFixed(0)} Ω</div>
              </div>
              {groundingCheck.ok !== null && (
                <div
                  className="mt-2 p-3 rounded-lg text-sm flex items-start gap-2"
                  style={groundingCheck.ok ? { background: "#3B8C631A", color: "#2C6B4A" } : { background: "#C6433A1A", color: "#A2352C" }}
                >
                  {groundingCheck.ok ? <Check size={16} className="shrink-0 mt-0.5" /> : <AlertTriangle size={16} className="shrink-0 mt-0.5" />}
                  {groundingCheck.ok
                    ? "Warunek spełniony — RCD zadziała, zanim napięcie dotykowe przekroczy 50 V."
                    : "Warunek niespełniony — zmierzona RA przekracza wartość dopuszczalną. Popraw uziom (dodatkowy uziomik, głębsze wbicie) albo zastosuj RCD o niższym IΔn."}
                </div>
              )}
              <HowItWorks
                formulas={[
                  { label: "Warunek ochrony przy dotyku pośrednim", eq: "RA × IΔn ≤ UL", where: `RA — rezystancja uziemienia [Ω], IΔn — prąd różnicowy znamionowy [A], UL = ${UL} V` },
                  { label: "Maksymalna dopuszczalna rezystancja uziemienia", eq: "RA max = UL / IΔn", where: "wartość, której zmierzona RA nie może przekroczyć" },
                ]}
                notes={[
                  "W układzie TT (w przeciwieństwie do TN — patrz „Impedancja pętli zwarcia”) skuteczność ochrony nie zależy od impedancji pętli zwarcia, tylko od rezystancji uziomu i prądu różnicowego wyłącznika, który ten uziom chroni.",
                  "Im niższy prąd IΔn wyłącznika różnicowoprądowego, tym łagodniejsze wymaganie wobec uziemienia — dla typowego RCD 30 mA wystarczy RA ≤ 1667 Ω, co w praktyce spełnia niemal każdy uziom.",
                  "300-500 mA to typowe wartości dla wyłączników różnicowoprądowych na początku instalacji (ochrona przeciwpożarowa, selektywność względem RCD 30 mA na obwodach odbiorczych) — tam wymaganie wobec RA jest już wyraźnie ostrzejsze.",
                  "Pomiar wykonuje się miernikiem rezystancji uziemienia (metoda techniczna, udarowa albo cęgowa) — patrz protokół „Pomiar rezystancji uziemienia” w zakładce Protokoły.",
                ]}
              />
            </Card>
          )}

          {activeCalc === "oswietlenie" && (
            <Card title={active.label} icon={Calculator} tag="natężenie oświetlenia">
              <div className="grid sm:grid-cols-2 gap-x-4">
                <Field label="Powierzchnia pomieszczenia" value={roomA} onChange={(v) => setRoomA(Number(v))} unit="m²" />
                <Field label="Wymagane natężenie" value={lux} onChange={(v) => setLux(Number(v))} unit="lx" />
                <Field label="Strumień jednej oprawy" value={lumPerOpr} onChange={(v) => setLumPerOpr(Number(v))} unit="lm" />
                <Field label="Wsp. utrzymania (MF)" value={mf} onChange={(v) => setMf(Number(v))} step="0.05" />
                <Field label="Wsp. wykorzystania (UF)" value={uf} onChange={(v) => setUf(Number(v))} step="0.05" />
              </div>
              <div className="mt-2 p-3 pe-result grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-slate-500">Wymagany strumień całkowity</div>
                  <div className="pe-mono">{lightCalc.requiredLumens.toFixed(0)} lm</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Liczba opraw</div>
                  <div className="pe-mono text-lg text-copper">{Math.ceil(lightCalc.fixtureCount) || 0} szt.</div>
                </div>
              </div>
              <div className="text-[11px] text-slate-500 mt-2">
                Orientacyjne wymagania: pokój dzienny 150–300 lx, kuchnia (blat) 500 lx, łazienka 200–300 lx, biuro 500 lx, korytarz 100 lx.
              </div>
              <HowItWorks
                formulas={[
                  { label: "Metoda strumienia świetlnego", eq: "Φ = (E × A) / (UF × MF)", where: "E — wymagane natężenie [lx], A — powierzchnia [m²], UF — wsp. wykorzystania, MF — wsp. utrzymania" },
                  { label: "Liczba opraw", eq: "n = Φ / Φ_oprawy", where: "Φ_oprawy — strumień świetlny jednej oprawy [lm] z karty katalogowej" },
                ]}
                notes={[
                  "Współczynnik wykorzystania UF zależy od geometrii pomieszczenia i odbicia ścian/sufitu — typowo 0,4–0,7. Dla jasnego pokoju o zwykłych proporcjach przyjmij 0,6.",
                  "Współczynnik utrzymania MF uwzględnia starzenie źródeł i zabrudzenie opraw — dla LED w warunkach domowych zwykle 0,8.",
                  "Metoda daje średnie natężenie na płaszczyźnie roboczej. Nie zastępuje obliczeń rozkładu światła, gdy istotna jest równomierność lub olśnienie.",
                  "Wynik zaokrąglaj w górę i rozmieszczaj oprawy równomiernie — odległość między nimi nie powinna przekraczać ok. 1,5× wysokości zawieszenia nad płaszczyzną roboczą.",
                ]}
              />
            </Card>
          )}

          {activeCalc === "rcd" && (
            <Card title={active.label} icon={Info} tag="bezpieczeństwo">
              <ul className="text-sm space-y-2.5 text-slate-700">
                <li className="flex gap-2">
                  <ChevronRight size={15} className="mt-0.5 shrink-0 text-copper" /> Obwody gniazd wtyczkowych — RCD 30 mA (typ AC/A), obowiązkowo.
                </li>
                <li className="flex gap-2">
                  <ChevronRight size={15} className="mt-0.5 shrink-0 text-copper" /> Łazienka, kuchnia, tarasy — RCD 30 mA, zalecany osobny obwód i osobna ochrona.
                </li>
                <li className="flex gap-2">
                  <ChevronRight size={15} className="mt-0.5 shrink-0 text-copper" /> Odbiorniki z elektroniką (np. pompy ciepła, falowniki) — rozważ typ A lub B wg zaleceń producenta.
                </li>
                <li className="flex gap-2">
                  <ChevronRight size={15} className="mt-0.5 shrink-0 text-copper" /> Maks. 6–8 obwodów na jeden RCD 40A — powyżej dziel na kolejne różnicówki.
                </li>
                <li className="flex gap-2">
                  <ChevronRight size={15} className="mt-0.5 shrink-0 text-copper" /> Rozważ wyłącznik przeciwprzepięciowy (typ 2) na początku instalacji.
                </li>
              </ul>
              <HowItWorks
                formulas={[
                  { label: "Warunek ochrony przy dotyku pośrednim", eq: "RA × IΔn ≤ UL", where: "RA — rezystancja uziemienia [Ω], IΔn — prąd różnicowy znamionowy [A], UL = 50 V" },
                  { label: "Maksymalna rezystancja uziemienia (RCD 30 mA)", eq: "RA ≤ 50 / 0,03 = 1667 Ω", where: "dlatego w układzie TT z RCD 30 mA wymagania wobec uziemienia są łagodne" },
                  { label: "Dobór prądu znamionowego RCD", eq: "In(RCD) ≥ ΣIn zabezpieczeń za nim", where: "RCD nie ma własnego zabezpieczenia zwarciowego — musi być chroniony nadprądowo" },
                ]}
                notes={[
                  "Typ AC reaguje tylko na prąd różnicowy sinusoidalny; typ A dodatkowo na pulsujący stały — dziś to praktyczne minimum przy zasilaczach impulsowych i elektronice.",
                  "Typ B jest wymagany m.in. przy ładowarkach pojazdów elektrycznych i falownikach, gdzie może pojawić się gładki prąd stały.",
                  "Rozdzielenie instalacji na kilka RCD ogranicza skutki zadziałania — awaria w jednym obwodzie nie pozbawia zasilania całego domu.",
                  "Prądy upływowe odbiorników sumują się. Zbyt wiele obwodów za jednym RCD 30 mA prowadzi do przypadkowych wyłączeń bez rzeczywistej usterki.",
                  "Wyłącznik różnicowoprądowy należy testować przyciskiem TEST co najmniej raz na pół roku — to jedyny sposób sprawdzenia, czy mechanizm nie zastygł.",
                ]}
              />
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
