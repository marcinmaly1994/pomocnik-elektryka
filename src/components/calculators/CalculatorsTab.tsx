import { useMemo } from "react";
import { AlertTriangle, Check, ChevronRight, Download, Plus, Trash2 } from "lucide-react";
import { obliczUziom, REZYSTYWNOSC_GRUNTU, TYP_UZIOMU_LABELS, type TypUziomu } from "@/lib/calc/earthing";
import { obliczImpedancjePrzewodu, obliczPrzewodyRownolegle } from "@/lib/calc/conductorImpedance";
import { dobierzN, dobierzPE } from "@/lib/calc/protectiveConductor";
import { KATEGORIE_PRZEPIECIOWE, obliczKoordynacjeSPD, TYP_SPD_LABELS, type TypSPD } from "@/lib/calc/spd";
import { dobierzPrzewodACFalownika, obliczStringPV } from "@/lib/calc/pv";
import { obliczObwodEV } from "@/lib/calc/evCharger";
import { KRYTERIUM_LABELS, pelnyDoborPrzekroju } from "@/lib/calc/fullSizing";
import { dobierzWkladkeGGOchrona } from "@/lib/calc/gGFuse";
import { METODA_LABELS, type MetodaOdniesienia3 } from "@/lib/norms/ampacity3";
import { CZAS_GG_LABELS, TYP_WKLADKI_LABELS, type TypWkladkiGG } from "@/lib/norms/gGFuses";
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
import {
  MODEL_REZYSTYWNOSCI_LABELS,
  RODZAJ_LINII_LABELS,
  type Izolacja,
  type Material,
  type ModelRezystywnosci,
  type RodzajLinii,
} from "@/lib/norms/conductors";
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
import { Field, HintButton } from "./Field";
import { HowItWorks } from "./HowItWorks";

/**
 * Kolejność grupowana wg fazy pracy elektryka, nie wg tego, kiedy który kalkulator
 * powstał (patrz przegląd — sesja porządkująca zakładkę Kalkulatory):
 *  1. Bilans i zasilanie budynku — od ogółu (moc) do szczegółu (WLZ).
 *  2. Codzienny dobór obwodu — przekrój/zabezpieczenie/pełny dobór/wkładka gG,
 *     a na końcu spadek napięcia: to narzędzie WERYFIKUJE gotową trasę
 *     („sprawdzenie trasy o znanym przekroju”), więc pasuje za doborem, nie przed nim.
 *  3. Dane wejściowe do ochrony — impedancja przewodu i prądy zwarciowe, w tej
 *     kolejności: pierwsze jest budulcem drugiego (Zk do liczenia Ik).
 *  4. Ochrona przeciwporażeniowa — pętla TN, uziemienie TT, uziom, RCD, PE/N.
 *  5. Obciążenia specjalne i jakość zasilania.
 *  6. Instalacje specjalne (opcjonalne, coraz częstsze) — PV, EV, oświetlenie.
 */
const CALC_LIST: { id: CalcId; label: string; desc: string }[] = [
  { id: "moc", label: "Bilans mocy budynku", desc: "moc zapotrzebowana, dobór przyłącza" },
  { id: "wlz", label: "Dobór WLZ (linii zasilającej)", desc: "przekrój kabla od licznika do rozdzielnicy" },
  { id: "przekroj", label: "Dobór przekroju przewodu", desc: "przekrój wg obciążalności i spadku" },
  { id: "zabezpieczenie", label: "Dobór zabezpieczenia", desc: "wyłącznik do znanego przekroju" },
  { id: "pelnyDobor", label: "Pełny dobór (4 kryteria)", desc: "obciążalność + spadek + ochrona + zwarcie naraz" },
  { id: "gGWkladka", label: "Dobór wkładki gG", desc: "ochrona przeciwporażeniowa — zabezpieczenie topikowe" },
  { id: "spadek", label: "Spadek napięcia", desc: "sprawdzenie trasy o znanym przekroju" },
  { id: "impedancja", label: "Impedancja przewodu", desc: "R, X, Z oraz przewody równoległe" },
  { id: "zwarcie", label: "Prądy zwarciowe", desc: "Ik, prąd udarowy, wytrzymałość cieplna" },
  { id: "petla", label: "Impedancja pętli zwarcia", desc: "ochrona przeciwporażeniowa — układ TN" },
  { id: "uziemienieTT", label: "Rezystancja uziemienia", desc: "ochrona przeciwporażeniowa — układ TT" },
  { id: "uziom", label: "Uziom — dobór geometrii", desc: "pręt, bednarka, otok; potrzebna długość" },
  { id: "rcd", label: "Dobór wyłącznika różnicowoprądowego", desc: "zasady doboru RCD" },
  { id: "peN", label: "Dobór przewodu PE i N", desc: "reguła, warunek cieplny, harmoniczne" },
  { id: "bilansFaz", label: "Bilans faz i prąd w N", desc: "asymetria, przewód neutralny, 3. harmoniczna" },
  { id: "kompensacja", label: "Kompensacja mocy biernej", desc: "moc baterii, pojemność, rezonans" },
  { id: "silnik", label: "Silnik indukcyjny", desc: "rozruch, zabezpieczenia, spadek przy starcie" },
  { id: "spd", label: "Ochronniki przepięć (SPD)", desc: "koordynacja Up, długość przewodów" },
  { id: "pv", label: "Instalacja fotowoltaiczna", desc: "string DC, Voc na zimno, spadek DC, AC falownika" },
  { id: "ev", label: "Ładowarka pojazdu elektrycznego", desc: "praca ciągła, wymagany typ RCD" },
  { id: "oswietlenie", label: "Dobór oświetlenia", desc: "strumień świetlny i liczba opraw" },
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

const METODA3_OPTIONS = (Object.entries(METODA_LABELS) as [MetodaOdniesienia3, string][]).map(([value, label]) => ({
  value,
  label,
}));
const UKLAD_OPTIONS = [
  { value: "TN", label: "TN" },
  { value: "TT", label: "TT" },
];

const MODEL_REZ_OPTIONS =(Object.entries(MODEL_REZYSTYWNOSCI_LABELS) as [ModelRezystywnosci, string][]).map(([value, label]) => ({
  value,
  label,
}));
const TYP_SPD_OPTIONS = (Object.entries(TYP_SPD_LABELS) as [TypSPD, string][]).map(([value, label]) => ({ value, label }));
const TYP_WKLADKI_OPTIONS = (Object.entries(TYP_WKLADKI_LABELS) as [TypWkladkiGG, string][]).map(([value, label]) => ({ value, label }));
const UW_OPTIONS = KATEGORIE_PRZEPIECIOWE.map((k) => ({
  value: String(k.Uw_V),
  label: `Kat. ${k.kategoria} — ${k.Uw_V} V (${k.opis})`,
}));

/** „40, 60" → [40, 60]. Puste i niepoprawne wpisy odpadają, żeby literówka nie
 *  wywracała kalkulatora w trakcie pisania. */
function parsujDlugosci(tekst: string): number[] {
  return tekst
    .split(/[,;]/)
    .map((s) => Number(s.trim().replace(",", ".")))
    .filter((n) => Number.isFinite(n) && n > 0);
}

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
  const duModel = useCalculatorsStore((s) => s.duModel);
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
  const imDlugosc = useCalculatorsStore((s) => s.imDlugosc);
  const imPrzekroj = useCalculatorsStore((s) => s.imPrzekroj);
  const imMaterial = useCalculatorsStore((s) => s.imMaterial);
  const imIzolacja = useCalculatorsStore((s) => s.imIzolacja);
  const imRodzajLinii = useCalculatorsStore((s) => s.imRodzajLinii);
  const imRownoleglePrad = useCalculatorsStore((s) => s.imRownoleglePrad);
  const imRownolegleDlugosci = useCalculatorsStore((s) => s.imRownolegleDlugosci);
  const imRownolegleIz = useCalculatorsStore((s) => s.imRownolegleIz);
  const peFazowy = useCalculatorsStore((s) => s.peFazowy);
  const peMaterial = useCalculatorsStore((s) => s.peMaterial);
  const peIzolacja = useCalculatorsStore((s) => s.peIzolacja);
  const pePradZwarciowy = useCalculatorsStore((s) => s.pePradZwarciowy);
  const peCzas = useCalculatorsStore((s) => s.peCzas);
  const pnPradFazowy = useCalculatorsStore((s) => s.pnPradFazowy);
  const pnH3Pct = useCalculatorsStore((s) => s.pnH3Pct);
  const spdTyp = useCalculatorsStore((s) => s.spdTyp);
  const spdUp = useCalculatorsStore((s) => s.spdUp);
  const spdUw = useCalculatorsStore((s) => s.spdUw);
  const spdDlugosc = useCalculatorsStore((s) => s.spdDlugosc);
  const pdIb = useCalculatorsStore((s) => s.pdIb);
  const pdNapiecie = useCalculatorsStore((s) => s.pdNapiecie);
  const pdMaterial = useCalculatorsStore((s) => s.pdMaterial);
  const pdIzolacja = useCalculatorsStore((s) => s.pdIzolacja);
  const pdMetoda = useCalculatorsStore((s) => s.pdMetoda);
  const pdTemperatura = useCalculatorsStore((s) => s.pdTemperatura);
  const pdWiazka = useCalculatorsStore((s) => s.pdWiazka);
  const pdRozruch = useCalculatorsStore((s) => s.pdRozruch);
  const pdDlugosc = useCalculatorsStore((s) => s.pdDlugosc);
  const pdCosfi = useCalculatorsStore((s) => s.pdCosfi);
  const pdLimitSpadku = useCalculatorsStore((s) => s.pdLimitSpadku);
  const pdSprawdzOchrone = useCalculatorsStore((s) => s.pdSprawdzOchrone);
  const pdImpedancjaZrodla = useCalculatorsStore((s) => s.pdImpedancjaZrodla);
  const pdUklad = useCalculatorsStore((s) => s.pdUklad);
  const pdObwodOdbiorczy = useCalculatorsStore((s) => s.pdObwodOdbiorczy);
  const pdSprawdzZwarcie = useCalculatorsStore((s) => s.pdSprawdzZwarcie);
  const pdIk = useCalculatorsStore((s) => s.pdIk);
  const ggTyp = useCalculatorsStore((s) => s.ggTyp);
  const ggIb = useCalculatorsStore((s) => s.ggIb);
  const ggUklad = useCalculatorsStore((s) => s.ggUklad);
  const ggObwodOdbiorczy = useCalculatorsStore((s) => s.ggObwodOdbiorczy);
  const ggSprawdzZs = useCalculatorsStore((s) => s.ggSprawdzZs);
  const ggZmierzonaZs = useCalculatorsStore((s) => s.ggZmierzonaZs);
  const pvIsc = useCalculatorsStore((s) => s.pvIsc);
  const pvVoc = useCalculatorsStore((s) => s.pvVoc);
  const pvVmpp = useCalculatorsStore((s) => s.pvVmpp);
  const pvImpp = useCalculatorsStore((s) => s.pvImpp);
  const pvLiczbaModulow = useCalculatorsStore((s) => s.pvLiczbaModulow);
  const pvBeta = useCalculatorsStore((s) => s.pvBeta);
  const pvTempMin = useCalculatorsStore((s) => s.pvTempMin);
  const pvTempMax = useCalculatorsStore((s) => s.pvTempMax);
  const pvSprawdzMppt = useCalculatorsStore((s) => s.pvSprawdzMppt);
  const pvFalownikVocMax = useCalculatorsStore((s) => s.pvFalownikVocMax);
  const pvFalownikMpptMin = useCalculatorsStore((s) => s.pvFalownikMpptMin);
  const pvDlugoscDC = useCalculatorsStore((s) => s.pvDlugoscDC);
  const pvPrzekrojDC = useCalculatorsStore((s) => s.pvPrzekrojDC);
  const pvMaterialDC = useCalculatorsStore((s) => s.pvMaterialDC);
  const pvLimitSpadkuDC = useCalculatorsStore((s) => s.pvLimitSpadkuDC);
  const pvMocAC = useCalculatorsStore((s) => s.pvMocAC);
  const pvFazaAC = useCalculatorsStore((s) => s.pvFazaAC);
  const pvDlugoscAC = useCalculatorsStore((s) => s.pvDlugoscAC);
  const pvSposobUlozeniaAC = useCalculatorsStore((s) => s.pvSposobUlozeniaAC);
  const evMoc = useCalculatorsStore((s) => s.evMoc);
  const evFaza = useCalculatorsStore((s) => s.evFaza);
  const evCosfi = useCalculatorsStore((s) => s.evCosfi);
  const evDlugosc = useCalculatorsStore((s) => s.evDlugosc);
  const evSposobUlozenia = useCalculatorsStore((s) => s.evSposobUlozenia);
  const evWbudowanaOchronaDC = useCalculatorsStore((s) => s.evWbudowanaOchronaDC);
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
        modelRezystywnosci: duModel,
      }),
    [duPhase, duCurrentA, duCosfi, duLength, duMaterial, duSection, duIzolacja, duZReaktancja, duRodzajLinii, duRownolegle, duLimitPct, duModel]
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

  // --- kalkulatory uzupełniające ---
  const impedancja = useMemo(
    () =>
      obliczImpedancjePrzewodu({
        dlugosc_m: imDlugosc,
        przekroj_mm2: imPrzekroj,
        material: imMaterial,
        izolacja: imIzolacja,
        rodzajLinii: imRodzajLinii,
      }),
    [imDlugosc, imPrzekroj, imMaterial, imIzolacja, imRodzajLinii]
  );
  const rownolegle = useMemo(
    () =>
      obliczPrzewodyRownolegle({
        pradCalkowity_A: imRownoleglePrad,
        dlugosci_m: parsujDlugosci(imRownolegleDlugosci),
        przekroj_mm2: imPrzekroj,
        material: imMaterial,
        izolacja: imIzolacja,
        Iz_jednej_A: imRownolegleIz > 0 ? imRownolegleIz : undefined,
      }),
    [imRownoleglePrad, imRownolegleDlugosci, imPrzekroj, imMaterial, imIzolacja, imRownolegleIz]
  );
  const przewodPE = useMemo(
    () =>
      dobierzPE({
        przekrojFazowy_mm2: peFazowy,
        material: peMaterial,
        izolacja: peIzolacja,
        pradZwarciowy_A: pePradZwarciowy > 0 ? pePradZwarciowy : undefined,
        czasWylaczenia_s: peCzas > 0 ? peCzas : undefined,
      }),
    [peFazowy, peMaterial, peIzolacja, pePradZwarciowy, peCzas]
  );
  const przewodN = useMemo(
    () => dobierzN({ przekrojFazowy_mm2: peFazowy, pradFazowy_A: pnPradFazowy, udzialH3_pct: pnH3Pct }),
    [peFazowy, pnPradFazowy, pnH3Pct]
  );
  const spd = useMemo(
    () => obliczKoordynacjeSPD({ typ: spdTyp, Up_V: spdUp, Uw_V: spdUw, dlugoscPrzewodow_m: spdDlugosc }),
    [spdTyp, spdUp, spdUw, spdDlugosc]
  );

  // --- pełny dobór (4 kryteria) ---
  const pelnyDobor = useMemo(
    () =>
      pelnyDoborPrzekroju({
        Ib_A: pdIb,
        napiecie_V: pdNapiecie,
        material: pdMaterial,
        izolacja: pdIzolacja,
        metoda: pdMetoda,
        temperatura_otoczenia_C: pdTemperatura,
        obwodow_w_wiazce: pdWiazka,
        rozruch_silnikowy: pdRozruch,
        dlugosc_m: pdDlugosc,
        cosfi: pdCosfi,
        limitSpadku_pct: pdLimitSpadku,
        impedancjaZrodla_ohm: pdSprawdzOchrone ? pdImpedancjaZrodla : undefined,
        uklad: pdUklad,
        obwodOdbiorczy: pdObwodOdbiorczy,
        Ik_A: pdSprawdzZwarcie ? pdIk : undefined,
      }),
    [
      pdIb,
      pdNapiecie,
      pdMaterial,
      pdIzolacja,
      pdMetoda,
      pdTemperatura,
      pdWiazka,
      pdRozruch,
      pdDlugosc,
      pdCosfi,
      pdLimitSpadku,
      pdSprawdzOchrone,
      pdImpedancjaZrodla,
      pdUklad,
      pdObwodOdbiorczy,
      pdSprawdzZwarcie,
      pdIk,
    ]
  );

  // --- dobór wkładki gG ---
  const ggWkladka = useMemo(
    () =>
      dobierzWkladkeGGOchrona({
        typ: ggTyp,
        Ib_A: ggIb,
        uklad: ggUklad,
        obwodOdbiorczy: ggObwodOdbiorczy,
        zmierzonaZs_ohm: ggSprawdzZs ? ggZmierzonaZs : undefined,
      }),
    [ggTyp, ggIb, ggUklad, ggObwodOdbiorczy, ggSprawdzZs, ggZmierzonaZs]
  );

  // --- fotowoltaika ---
  const stringPV = useMemo(
    () =>
      obliczStringPV({
        Isc_A: pvIsc,
        Voc_V: pvVoc,
        Vmpp_V: pvVmpp > 0 ? pvVmpp : undefined,
        Impp_A: pvImpp > 0 ? pvImpp : undefined,
        liczbaModulowSzeregowo: pvLiczbaModulow,
        betaNapiecia_pct_na_C: pvBeta,
        tempMin_C: pvTempMin,
        tempMax_C: pvSprawdzMppt ? pvTempMax : undefined,
        falownikVocMax_V: pvFalownikVocMax,
        falownikMpptMin_V: pvSprawdzMppt ? pvFalownikMpptMin : undefined,
        dlugoscDC_m: pvDlugoscDC,
        przekrojDC_mm2: pvPrzekrojDC,
        materialDC: pvMaterialDC,
        limitSpadkuDC_pct: pvLimitSpadkuDC,
      }),
    [
      pvIsc,
      pvVoc,
      pvVmpp,
      pvImpp,
      pvLiczbaModulow,
      pvBeta,
      pvTempMin,
      pvTempMax,
      pvSprawdzMppt,
      pvFalownikVocMax,
      pvFalownikMpptMin,
      pvDlugoscDC,
      pvPrzekrojDC,
      pvMaterialDC,
      pvLimitSpadkuDC,
    ]
  );
  const falownikAC = useMemo(
    () =>
      dobierzPrzewodACFalownika({
        mocAC_W: pvMocAC,
        liczba_faz: pvFazaAC,
        cos_phi: 1,
        dlugosc_m: pvDlugoscAC,
        sposob_ulozenia: pvSposobUlozeniaAC,
      }),
    [pvMocAC, pvFazaAC, pvDlugoscAC, pvSposobUlozeniaAC]
  );

  // --- ładowarka EV ---
  const obwodEV = useMemo(
    () =>
      obliczObwodEV({
        mocLadowania_W: evMoc,
        liczba_faz: evFaza,
        cos_phi: evCosfi,
        dlugosc_m: evDlugosc,
        sposob_ulozenia: evSposobUlozenia,
        maWbudowanaOchroneDC: evWbudowanaOchronaDC,
      }),
    [evMoc, evFaza, evCosfi, evDlugosc, evSposobUlozenia, evWbudowanaOchronaDC]
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
            const on = activeCalc === c.id;
            return (
              <button
                key={c.id}
                onClick={() => setActiveCalc(c.id)}
                className="w-full text-left p-3 rounded-lg"
                style={on ? { background: "#2D5A8C10", border: "1px solid #2D5A8C" } : { background: "#fff", border: "1px solid #DCE2E8" }}
              >
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
            <Card title={active.label} tag="przekrój żyły">
              <div className="grid sm:grid-cols-2 gap-x-4">
                <Field
                  label="Rodzaj obwodu"
                  value={circuitKind}
                  onChange={(v) => setCircuitKind(v as CircuitKind)}
                  options={CIRCUIT_KIND_OPTIONS}
                />
                <Field
                  label="Moc odbiornika"
                  value={power}
                  onChange={(v) => setPower(Number(v))}
                  unit="W"
                />
                <Field
                  label="Zasilanie"
                  value={phase}
                  onChange={(v) => setPhase(v as "1" | "3")}
                  options={PHASE_OPTIONS}
                />
                <Field
                  label="Współczynnik cos φ"
                  value={cosphi}
                  onChange={(v) => setCosphi(Number(v))}
                  step="0.05"
                  hint="Współczynnik mocy odbiornika — z tabliczki znamionowej albo karty katalogowej. Nie znasz wartości? Rozwiń podpowiedź „Nie znasz cos φ?” poniżej."
                />
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
                <Field
                  label="Temperatura otoczenia"
                  value={ambientC}
                  onChange={(v) => setAmbientC(Number(v))}
                  unit="°C"
                />
                <Field
                  label="Obwodów we wspólnej trasie"
                  value={bundleCount}
                  onChange={(v) => setBundleCount(Number(v))}
                  step="1"
                  hint="Ile obwodów biegnie razem w tej samej rurce/korytku/wiązce na dłuższym odcinku trasy. Więcej przewodów obok siebie gorzej oddaje ciepło, więc obniża dopuszczalną obciążalność każdego z nich."
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
            <Card title={active.label} tag="wyłącznik nadprądowy">
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
                <Field
                  label="Moc odbiornika"
                  value={power}
                  onChange={(v) => setPower(Number(v))}
                  unit="W"
                />
                <Field
                  label="Zasilanie"
                  value={phase}
                  onChange={(v) => setPhase(v as "1" | "3")}
                  options={PHASE_OPTIONS}
                />
                <Field
                  label="Współczynnik cos φ"
                  value={cosphi}
                  onChange={(v) => setCosphi(Number(v))}
                  step="0.05"
                  hint="Współczynnik mocy odbiornika — z tabliczki znamionowej. Nie znasz wartości? Zobacz podpowiedź w kalkulatorze „Dobór przekroju przewodu”: 1,0 dla grzałek, niżej dla silników i elektroniki."
                />
              </div>

              <div className="mb-2 mt-1 text-xs font-semibold text-slate-600">Warunki ułożenia (decydują o obciążalności)</div>
              <div className="grid sm:grid-cols-2 gap-x-4">
                <Field
                  label="Sposób ułożenia"
                  value={layingMethod}
                  onChange={(v) => setLayingMethod(v as LayingMethod)}
                  options={LAYING_METHOD_OPTIONS}
                />
                <Field
                  label="Temperatura otoczenia"
                  value={ambientC}
                  onChange={(v) => setAmbientC(Number(v))}
                  unit="°C"
                />
                <Field
                  label="Obwodów we wspólnej trasie"
                  value={bundleCount}
                  onChange={(v) => setBundleCount(Number(v))}
                  step="1"
                  hint="Ile obwodów biegnie razem w tej samej rurce/korytku/wiązce na dłuższym odcinku trasy — więcej obok siebie obniża obciążalność każdego z nich."
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

          {activeCalc === "pelnyDobor" && (
            <Card title={active.label} tag="4 kryteria naraz">
              <div className="mb-3 rounded-md p-2.5 text-[11.5px] leading-relaxed" style={{ background: "#2D5A8C10", color: "#2D5A8C" }}>
                Cztery kryteria liczone NIEZALEŻNIE — obciążalność, spadek napięcia i (opcjonalnie) ochrona
                przeciwporażeniowa oraz wytrzymałość zwarciowa. Wynikowy przekrój to <strong>maksimum</strong> z nich, nie
                pierwszy z brzegu. Tylko obwody <strong>3-fazowe</strong> — tablica dla dwóch żył obciążonych (1-fazowe)
                nie została jeszcze dostarczona.
              </div>

              <div className="grid sm:grid-cols-2 gap-x-4">
                <Field
                  label="Prąd obliczeniowy Ib"
                  value={pdIb}
                  onChange={(v) => patch({ pdIb: Number(v) })}
                  unit="A"
                  hint="Prąd, jaki faktycznie popłynie tym obwodem przy pełnym obciążeniu — z bilansu mocy odbiorników (Ib = P / (√3 · U · cosφ) dla 3 faz) albo wprost z projektu."
                />
                <Field
                  label="Napięcie międzyfazowe"
                  value={pdNapiecie}
                  onChange={(v) => patch({ pdNapiecie: Number(v) })}
                  unit="V"
                  hint="Napięcie między dwiema fazami — w polskiej sieci nn to standardowo 400 V."
                />
                <Field
                  label="Materiał żyły"
                  value={pdMaterial}
                  onChange={(v) => patch({ pdMaterial: v as Material })}
                  options={MATERIAL_OPTIONS}
                />
                <Field
                  label="Izolacja"
                  value={pdIzolacja}
                  onChange={(v) => patch({ pdIzolacja: v as Izolacja })}
                  options={IZOLACJA_OPTIONS}
                  hint="Rodzaj izolacji przewodu — sprawdź na oznaczeniu kabla (np. YDY/YKY to PVC, YKYFtms/YKXS to XLPE). Wyższa dopuszczalna temperatura żyły XLPE daje większą obciążalność."
                />
                <Field
                  label="Metoda odniesienia"
                  value={pdMetoda}
                  onChange={(v) => patch({ pdMetoda: v as MetodaOdniesienia3 })}
                  options={METODA3_OPTIONS}
                />
                <Field
                  label="Długość trasy"
                  value={pdDlugosc}
                  onChange={(v) => patch({ pdDlugosc: Number(v) })}
                  unit="m"
                />
                <Field
                  label="cos φ"
                  value={pdCosfi}
                  onChange={(v) => patch({ pdCosfi: Number(v) })}
                  step="0.01"
                  hint="Współczynnik mocy odbiornika — z tabliczki znamionowej. Nie znasz wartości? Zobacz podpowiedź w kalkulatorze „Dobór przekroju przewodu”: 1,0 dla grzałek, niżej dla silników i elektroniki."
                />
                <Field
                  label="Dopuszczalny spadek napięcia"
                  value={pdLimitSpadku}
                  onChange={(v) => patch({ pdLimitSpadku: Number(v) })}
                  unit="%"
                  step="0.5"
                  hint="Standardowo 5% dla obwodów siłowych i 3% dla oświetlenia przy zasilaniu z sieci publicznej — pełną listę progów (też dla własnej stacji trafo) znajdziesz w kalkulatorze „Spadek napięcia”."
                />
              </div>

              {pdMetoda !== "D1" && pdMetoda !== "D2" ? (
                <div className="grid sm:grid-cols-2 gap-x-4">
                  <Field
                    label="Temperatura otoczenia"
                    value={pdTemperatura}
                    onChange={(v) => patch({ pdTemperatura: Number(v) })}
                    unit="°C"
                  />
                  <Field
                    label="Obwodów we wspólnej trasie"
                    value={pdWiazka}
                    onChange={(v) => patch({ pdWiazka: Number(v) })}
                    step="1"
                    hint="Ile obwodów biegnie razem w tej samej rurce/korytku/wiązce na dłuższym odcinku trasy — więcej obok siebie obniża obciążalność każdego z nich."
                  />
                </div>
              ) : (
                <div className="mb-3 text-[11px] leading-relaxed text-slate-500">
                  Metoda gruntowa — bez korekty temperatury/grupowania (brak tablic dla gruntu). Wynik ważny dla 20°C w
                  gruncie.
                </div>
              )}
              <label className="mb-3 flex items-center gap-2 text-[13px] text-slate-600">
                <input type="checkbox" checked={pdRozruch} onChange={(e) => patch({ pdRozruch: e.target.checked })} className="h-4 w-4 rounded border-border" />
                Odbiornik z rozruchem silnikowym — charakterystyka C
              </label>

              <label className="mb-2 flex items-center gap-2 text-[13px] text-slate-600">
                <input
                  type="checkbox"
                  checked={pdSprawdzOchrone}
                  onChange={(e) => patch({ pdSprawdzOchrone: e.target.checked })}
                  className="h-4 w-4 rounded border-border"
                />
                Sprawdź też ochronę przeciwporażeniową (wymaga impedancji źródła)
              </label>
              {pdSprawdzOchrone && (
                <div className="mb-3 grid sm:grid-cols-2 gap-x-4">
                  <Field
                    label="Impedancja źródła i reszty obwodu"
                    value={pdImpedancjaZrodla}
                    onChange={(v) => patch({ pdImpedancjaZrodla: Number(v) })}
                    unit="Ω"
                    step="0.01"
                    hint="Impedancja CAŁEJ sieci przed tym miejscem — transformatora, WLZ i wszystkiego dotąd. Weź z pomiaru pętli zwarcia w rozdzielnicy zasilającej ten odcinek albo policz w kalkulatorze „Impedancja przewodu”."
                  />
                  <Field
                    label="Układ sieci"
                    value={pdUklad}
                    onChange={(v) => patch({ pdUklad: v as "TN" | "TT" })}
                    options={UKLAD_OPTIONS}
                    hint="TN — przewód PE połączony z uziemionym punktem sieci (najczęstszy w Polsce w budynkach zasilanych z sieci operatora). TT — własny uziom budynku, niezależny od sieci."
                  />
                </div>
              )}

              <label className="mb-2 flex items-center gap-2 text-[13px] text-slate-600">
                <input
                  type="checkbox"
                  checked={pdSprawdzZwarcie}
                  onChange={(e) => patch({ pdSprawdzZwarcie: e.target.checked })}
                  className="h-4 w-4 rounded border-border"
                />
                Sprawdź też wytrzymałość zwarciową cieplną (wymaga prądu zwarciowego)
              </label>
              {pdSprawdzZwarcie && (
                <>
                  {/* Czas wyłączenia (kryterium 4) zależy od układu sieci i od tego, czy to
                      obwód KOŃCOWY (≤ 32 A) czy rozdzielczy — inaczej niż przy kryterium 3
                      (ochrona przeciwporażeniowa), które go nie potrzebuje. Bez tych dwóch pól
                      kalkulator MILCZĄCO zakładał TN + obwód odbiorczy (0,4 s) — dla realnego
                      obwodu rozdzielczego (5 s) to zaniża wymagany przekrój z kryterium 4,
                      a ten kalkulator celuje właśnie w duże przekroje/prądy, gdzie obwody
                      rozdzielcze są normą, nie wyjątkiem. */}
                  <div className="grid sm:grid-cols-2 gap-x-4">
                    <Field
                      label="Układ sieci"
                      value={pdUklad}
                      onChange={(v) => patch({ pdUklad: v as "TN" | "TT" })}
                      options={UKLAD_OPTIONS}
                      hint="TN — przewód PE połączony z uziemionym punktem sieci (najczęstszy w Polsce). TT — własny uziom budynku, niezależny od sieci."
                    />
                    <Field
                      label="Prąd zwarciowy w tym miejscu"
                      value={pdIk}
                      onChange={(v) => patch({ pdIk: Number(v) })}
                      unit="A"
                      hint="Prąd zwarcia jednofazowego (L-PE) w tym miejscu instalacji — z pomiaru, z kalkulatora „Prądy zwarciowe” albo z dokumentacji projektowej."
                    />
                  </div>
                  <label className="mb-3 flex items-center gap-2 text-[13px] text-slate-600">
                    <input
                      type="checkbox"
                      checked={pdObwodOdbiorczy}
                      onChange={(e) => patch({ pdObwodOdbiorczy: e.target.checked })}
                      className="h-4 w-4 rounded border-border"
                    />
                    Obwód odbiorczy (≤ 32 A) — inaczej rozdzielczy
                  </label>
                </>
              )}

              {pelnyDobor.wartosci && (
                <div className="mt-2 p-3 pe-result">
                  <div className="text-xs text-slate-500 mb-1">Przekrój wynikowy</div>
                  <div className="pe-mono text-lg text-blueprint">{formatLiczba(pelnyDobor.wartosci.przekroj_mm2, 1)} mm²</div>
                  <div className="mt-2 flex gap-2 flex-wrap">
                    <span className="pe-chip pe-tag-copper">{pelnyDobor.wartosci.kabel}</span>
                    <span className="pe-chip pe-tag-blue">In {pelnyDobor.wartosci.In_A} A</span>
                    <span className="pe-chip pe-tag-green">
                      decyduje: {pelnyDobor.wartosci.decydujace.map((k) => KRYTERIUM_LABELS[k]).join(" i ")}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-slate-500">
                    {(Object.entries(pelnyDobor.wartosci.kryteria) as [string, (typeof pelnyDobor.wartosci.kryteria)[keyof typeof pelnyDobor.wartosci.kryteria]][]).map(
                      ([k, v]) => (
                        <span key={k} className="pe-chip" style={{ background: "#EEF1F4", color: "#475569" }}>
                          {KRYTERIUM_LABELS[k as keyof typeof KRYTERIUM_LABELS]}:{" "}
                          {v.ocenione ? `${formatLiczba(v.minPrzekroj_mm2!, 1)} mm²` : "nieocenione"}
                        </span>
                      )
                    )}
                  </div>
                </div>
              )}
              <CalcResultView wynik={pelnyDobor} />
            </Card>
          )}

          {activeCalc === "gGWkladka" && (
            <Card title={active.label} tag="wkładka topikowa">
              <div className="mb-3 rounded-md p-2.5 text-[11.5px] leading-relaxed" style={{ background: "#2D5A8C10", color: "#2D5A8C" }}>
                Imax i Zs max pochodzą wprost z tablicy czasowo-prądowej wkładki (Poradnik Projektanta Elektryka,
                tabl. Z.10.3/Z.10.4) — NIE ze wzoru k×In jak dla wyłączników. Tablica pokrywa czasy 0,2 s / 0,4 s / 5 s;
                nie zawiera 1 s (obwód rozdzielczy w układzie TT) ani 0,1 s.
              </div>

              <div className="grid sm:grid-cols-2 gap-x-4">
                <Field
                  label="Typ wkładki"
                  value={ggTyp}
                  onChange={(v) => patch({ ggTyp: v as TypWkladkiGG })}
                  options={TYP_WKLADKI_OPTIONS}
                />
                <Field
                  label="Prąd obliczeniowy Ib"
                  value={ggIb}
                  onChange={(v) => patch({ ggIb: Number(v) })}
                  unit="A"
                  hint="Prąd, jaki faktycznie popłynie tym obwodem przy pełnym obciążeniu."
                />
                <Field
                  label="Układ sieci"
                  value={ggUklad}
                  onChange={(v) => patch({ ggUklad: v as "TN" | "TT" })}
                  options={UKLAD_OPTIONS}
                  hint="TN — przewód PE połączony z uziemionym punktem sieci (najczęstszy w Polsce). TT — własny uziom budynku, niezależny od sieci."
                />
                <label className="flex items-center gap-2 text-[13px] text-slate-600 mt-1">
                  <input
                    type="checkbox"
                    checked={ggObwodOdbiorczy}
                    onChange={(e) => patch({ ggObwodOdbiorczy: e.target.checked })}
                    className="h-4 w-4 rounded border-border"
                  />
                  Obwód odbiorczy (≤ 32 A) — inaczej rozdzielczy
                </label>
              </div>

              <label className="mb-2 flex items-center gap-2 text-[13px] text-slate-600">
                <input
                  type="checkbox"
                  checked={ggSprawdzZs}
                  onChange={(e) => patch({ ggSprawdzZs: e.target.checked })}
                  className="h-4 w-4 rounded border-border"
                />
                Oceń warunek ochronny wg zmierzonej/obliczonej impedancji pętli zwarcia
              </label>
              {ggSprawdzZs && (
                <Field
                  label="Zmierzona impedancja pętli zwarcia Zs"
                  value={ggZmierzonaZs}
                  onChange={(v) => patch({ ggZmierzonaZs: Number(v) })}
                  unit="Ω"
                  step="0.01"
                  hint="Wynik pomiaru pętli zwarcia L-PE miernikiem instalacyjnym w danym punkcie obwodu — albo wartość obliczona w kalkulatorze „Impedancja pętli zwarcia”."
                />
              )}

              {ggWkladka.wartosci && (
                <div className="mt-2 p-3 pe-result">
                  <div className="text-xs text-slate-500 mb-1">Dobrana wkładka</div>
                  <div className="pe-mono text-lg text-blueprint">
                    {TYP_WKLADKI_LABELS[ggTyp]}, In {ggWkladka.wartosci.In_A} A
                  </div>
                  <div className="mt-2 flex gap-2 flex-wrap">
                    <span className="pe-chip pe-tag-blue">czas {CZAS_GG_LABELS[ggWkladka.wartosci.czas_s === 0.2 ? "0.2" : ggWkladka.wartosci.czas_s === 0.4 ? "0.4" : "5"]}</span>
                    <span className="pe-chip pe-tag-copper">Imax (Ia) {formatLiczba(ggWkladka.wartosci.Imax_A, 1)} A</span>
                    <span className="pe-chip pe-tag-green">Zs max {formatLiczba(ggWkladka.wartosci.ZsMax_ohm, 3)} Ω</span>
                  </div>
                </div>
              )}
              <CalcResultView wynik={ggWkladka} />
            </Card>
          )}

          {activeCalc === "spadek" && (
            <Card title={active.label} tag="sprawdzenie trasy">
              <div className="mb-3 rounded-md p-2.5 text-[11.5px] leading-relaxed" style={{ background: "#2D5A8C10", color: "#2D5A8C" }}>
                Ten kalkulator sprawdza trasę o <strong>znanym przekroju</strong> — np. kabel, który już jest ułożony
                albo narzucony z góry. Jeśli dopiero dobierasz przewód, użyj „Dobór przekroju przewodu”: tam przekrój
                jest wynikiem, dobieranym pod obciążalność i spadek naraz.
              </div>

              <div className="grid sm:grid-cols-2 gap-x-4">
                <Field
                  label="Prąd obciążenia (Ib)"
                  value={duCurrentA}
                  onChange={(v) => setDuCurrentA(Number(v))}
                  unit="A"
                  step="0.1"
                  hint="Prąd, jaki faktycznie popłynie tą trasą przy pełnym obciążeniu — z bilansu mocy odbiorników albo z pomiaru."
                />
                <Field
                  label="Zasilanie"
                  value={duPhase}
                  onChange={(v) => setDuPhase(v as "1" | "3")}
                  options={PHASE_OPTIONS}
                />
                <Field
                  label="Współczynnik cos φ"
                  value={duCosfi}
                  onChange={(v) => patch({ duCosfi: Number(v) })}
                  step="0.05"
                  hint="Współczynnik mocy odbiornika — z tabliczki znamionowej. Nie znasz wartości? Zobacz podpowiedź w kalkulatorze „Dobór przekroju przewodu”: 1,0 dla grzałek, niżej dla silników i elektroniki."
                />
                <Field
                  label="Długość trasy (w jedną stronę)"
                  value={duLength}
                  onChange={(v) => setDuLength(Number(v))}
                  unit="m"
                />
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
                  hint="Sprawdź na oznaczeniu kabla (np. YDY/YKY to PVC, YKYFtms/YKXS to XLPE) — wpływa nieznacznie na rezystywność przy modelu temperaturowym."
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
                {/* Wybór modelu rezystywności stoi jawnie w formularzu, bo to on
                    decyduje o zgodności z doborem w Rozdzielnicy — patrz
                    `ModelRezystywnosci`. Domyślne uproszczenie zał. G daje
                    identyczny wynik jak dobór obwodów; model temperaturowy jest
                    ok. 5% mniej konserwatywny i na styku limitu może dopuścić
                    cieńszy przewód, więc użytkownik ma to wybierać świadomie. */}
                <Field
                  label="Model rezystywności"
                  value={duModel}
                  onChange={(v) => patch({ duModel: v as ModelRezystywnosci })}
                  options={MODEL_REZ_OPTIONS}
                  hint="Jak dokładnie liczyć rezystywność miedzi/aluminium w warunkach ruchowych. Zostaw domyślne uproszczenie normy, żeby wynik zgadzał się z automatycznym doborem w Rozdzielnicy."
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
                  hint="Jak fizycznie wygląda trasa — kabel wielożyłowy w jednej powłoce, kable jednożyłowe osobno, czy linia napowietrzna. Wybierz opis najbliższy rzeczywistości; przy kablach jednożyłowych i liniach gołych realna wartość zależy dodatkowo od rozstawu żył."
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
            <Card title={active.label} tag="PN-EN 60909">
              <div className="mb-3 rounded-md p-2.5 text-[11.5px] leading-relaxed" style={{ background: "#2D5A8C10", color: "#2D5A8C" }}>
                Współczynnik napięciowy <strong>c wynika z celu obliczenia</strong>, a nie z osobnego pola: do doboru
                aparatów liczy się najgorszy przypadek największego prądu (c = 1,05), a do ochrony przeciwporażeniowej —
                najmniejszego (c = 0,95). Pomylenie ich daje wynik pozornie poprawny i całkowicie nieprzydatny.
              </div>

              <Field
                label="Cel obliczenia"
                value={zwCel}
                onChange={(v) => patch({ zwCel: v as CelZwarcia })}
                options={CEL_ZWARCIA_OPTIONS}
              />

              <div className="mb-2 mt-1 text-xs font-semibold text-slate-600">Transformator zasilający</div>
              <div className="grid sm:grid-cols-2 gap-x-4">
                <Field
                  label="Moc znamionowa Sn"
                  value={zwSnKVA}
                  onChange={(v) => patch({ zwSnKVA: Number(v) })}
                  unit="kVA"
                  hint="Moc pozorna transformatora — z jego tabliczki znamionowej (typowo 100–1000 kVA dla stacji SN/nn zasilających budynki)."
                />
                <Field
                  label="Napięcie zwarcia uk"
                  value={zwUkPct}
                  onChange={(v) => patch({ zwUkPct: Number(v) })}
                  unit="%"
                  step="0.1"
                  hint="Z tabliczki znamionowej transformatora (oznaczenie „uk” albo „Uz”) — typowo 4–6% dla transformatorów rozdzielczych SN/nn. Mówi, jaką część napięcia znamionowego trzeba przyłożyć, żeby popłynął prąd znamionowy przy zwartym uzwojeniu wtórnym: im MNIEJSZE uk, tym WIĘKSZY prąd zwarcia."
                />
                <Field
                  label="Napięcie międzyfazowe Un"
                  value={zwUnV}
                  onChange={(v) => patch({ zwUnV: Number(v) })}
                  unit="V"
                  hint="Napięcie znamionowe strony wtórnej (nn) transformatora — w Polsce standardowo 400 V."
                />
                <Field
                  label="Straty obciążeniowe ΔPCu (0 = pomiń)"
                  value={zwStratyCuW}
                  onChange={(v) => patch({ zwStratyCuW: Number(v) })}
                  unit="W"
                  hint="Straty mocy w uzwojeniach przy obciążeniu znamionowym — z tabliczki znamionowej albo protokołu prób transformatora. Bez tej wartości wynik pomija rezystancję transformatora, co lekko zawyża obliczony prąd zwarcia."
                />
              </div>

              <div className="mb-2 mt-1 text-xs font-semibold text-slate-600">Miejsce zwarcia</div>
              <div className="grid sm:grid-cols-2 gap-x-4">
                <Field
                  label="Impedancja pętli Zs (0 = pomiń Ik1)"
                  value={zwZsOhm}
                  onChange={(v) => patch({ zwZsOhm: Number(v) })}
                  unit="Ω"
                  step="0.01"
                  hint="Impedancja pętli zwarcia L-PE w miejscu zwarcia — z pomiaru miernikiem instalacyjnym albo z kalkulatora „Impedancja pętli zwarcia”. Zostaw 0, żeby pominąć obliczenie zwarcia jednofazowego Ik1."
                />
                <Field
                  label="Stosunek R/X (do prądu udarowego)"
                  value={zwRdoX}
                  onChange={(v) => patch({ zwRdoX: Number(v) })}
                  step="0.01"
                  hint="Stosunek rezystancji do reaktancji całego obwodu od źródła do miejsca zwarcia — policzysz go w kalkulatorze „Impedancja przewodu”. Wpływa tylko na prąd udarowy, nie na wartość skuteczną zwarcia."
                />
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
                <Field
                  label="Czas trwania zwarcia"
                  value={zwCzasS}
                  onChange={(v) => patch({ zwCzasS: Number(v) })}
                  unit="s"
                  step="0.01"
                  hint="Rzeczywisty czas, przez jaki płynie prąd zwarciowy zanim zabezpieczenie zadziała — odczytaj z charakterystyki wyzwalania wyłącznika/wkładki dla tego prądu, albo przyjmij maksymalny czas wyłączenia wg normy (0,4 s dla obwodu odbiorczego TN)."
                />
                <Field
                  label="Przekrój żyły"
                  value={String(zwPrzekroj)}
                  onChange={(v) => patch({ zwPrzekroj: Number(v) })}
                  options={SZEREG_PELNY_OPTIONS}
                />
                <Field
                  label="Materiał"
                  value={zwMaterial}
                  onChange={(v) => patch({ zwMaterial: v as Material })}
                  options={MATERIAL_OPTIONS}
                />
                <Field
                  label="Izolacja"
                  value={zwIzolacja}
                  onChange={(v) => patch({ zwIzolacja: v as Izolacja })}
                  options={IZOLACJA_OPTIONS}
                  hint="Sprawdź na oznaczeniu kabla (np. YDY/YKY to PVC, YKYFtms/YKXS to XLPE) — decyduje o współczynniku k wytrzymałości zwarciowej."
                />
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
            <Card title={active.label} tag="geometria uziomu">
              <div className="grid sm:grid-cols-2 gap-x-4">
                <Field
                  label="Typ uziomu"
                  value={uzTyp}
                  onChange={(v) => patch({ uzTyp: v as TypUziomu })}
                  options={TYP_UZIOMU_OPTIONS}
                />
                <Field
                  label="Rodzaj gruntu (wartości orientacyjne)"
                  value={String(uzRho)}
                  onChange={(v) => patch({ uzRho: Number(v) })}
                  options={GRUNT_OPTIONS}
                  hint="Skrót do pola „Rezystywność gruntu” niżej — wybierz najbliższy opis, żeby wstawić typową wartość. To tylko orientacyjny punkt startowy: do projektu wykonawczego rezystywność trzeba ZMIERZYĆ na działce."
                />
                <Field
                  label="Rezystywność gruntu ρ"
                  value={uzRho}
                  onChange={(v) => patch({ uzRho: Number(v) })}
                  unit="Ω·m"
                  hint="Im mniejsza wartość, tym lepiej przewodzący grunt i mniejsza rezystancja uziomu. Z pomiaru miernikiem rezystywności gruntu — albo orientacyjnie z listy „Rodzaj gruntu” obok."
                />
                <Field
                  label="Długość uziomu"
                  value={uzDlugosc}
                  onChange={(v) => patch({ uzDlugosc: Number(v) })}
                  unit="m"
                  step="0.1"
                />
                {uzTyp === "pionowy" && (
                  <Field
                    label="Średnica pręta"
                    value={uzSrednicaMm}
                    onChange={(v) => patch({ uzSrednicaMm: Number(v) })}
                    unit="mm"
                    hint="Średnica pręta uziomowego — typowo 16–20 mm dla prętów stalowych ocynkowanych/miedziowanych."
                  />
                )}
                {uzTyp === "poziomy" && (
                  <>
                    <Field
                      label="Szerokość bednarki"
                      value={uzSzerokoscMm}
                      onChange={(v) => patch({ uzSzerokoscMm: Number(v) })}
                      unit="mm"
                      hint="Szerokość taśmy (bednarki) uziomowej — typowo 25 lub 30 mm."
                    />
                    <Field
                      label="Głębokość ułożenia"
                      value={uzGlebokosc}
                      onChange={(v) => patch({ uzGlebokosc: Number(v) })}
                      unit="m"
                      step="0.1"
                      hint="Głębokość, na jakiej bednarka leży w wykopie — typowo 0,6–0,8 m, poniżej strefy przemarzania."
                    />
                  </>
                )}
                <Field
                  label="Liczba uziomów równolegle"
                  value={uzLiczba}
                  onChange={(v) => patch({ uzLiczba: Number(v) })}
                  step="1"
                  hint="Ile identycznych uziomów połączono ze sobą — więcej obniża wypadkową rezystancję, ale coraz mniej przy zbyt bliskim rozstawie (patrz współczynnik wykorzystania η niżej)."
                />
                {uzLiczba > 1 && (
                  <Field
                    label="Wsp. wykorzystania η (0,6–0,9)"
                    value={uzEta}
                    onChange={(v) => patch({ uzEta: Number(v) })}
                    step="0.05"
                    hint="Im uziomy stoją bliżej siebie, tym bardziej sobie „przeszkadzają” i tym niższą wartość przyjmij z zakresu 0,6–0,9. Przy rozstawie większym niż dwie długości uziomu bliżej 0,9."
                  />
                )}
                <Field
                  label="Wymagana rezystancja (0 = bez oceny)"
                  value={uzWymagana}
                  onChange={(v) => patch({ uzWymagana: Number(v) })}
                  unit="Ω"
                  hint="Docelowa maksymalna rezystancja uziemienia, np. z warunku ochrony w układzie TT (patrz kalkulator „Rezystancja uziemienia”) albo z wymagań instalacji odgromowej. Zostaw 0, żeby policzyć samą rezystancję bez oceny."
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
            <Card title={active.label} tag="asymetria i przewód N">
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
                      title="Moc czynna odbioru [W] — z tabliczki znamionowej."
                      value={o.mocW}
                      onChange={(e) => setOdbioryFazowe((ds) => ds.map((x) => (x.id === o.id ? { ...x, mocW: Number(e.target.value) } : x)))}
                    />
                    <span className="text-xs text-slate-400">W</span>
                    <input
                      className="pe-input text-sm w-16 pe-mono"
                      type="number"
                      step="0.05"
                      aria-label={`cos φ: ${o.nazwa}`}
                      title="Współczynnik mocy odbiornika — z tabliczki znamionowej (1,0 dla grzałek, niżej dla silników i elektroniki)."
                      value={o.cosfi}
                      onChange={(e) => setOdbioryFazowe((ds) => ds.map((x) => (x.id === o.id ? { ...x, cosfi: Number(e.target.value) } : x)))}
                    />
                    <select
                      className="pe-input text-sm w-24"
                      aria-label={`Faza: ${o.nazwa}`}
                      title="Do której fazy podłączony jest ten odbiór — albo „3-fazowy”, jeśli obciąża wszystkie trzy równo."
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
                hint="0% dla odbiorów LINIOWYCH (grzałki, silniki bez elektroniki). Dla zasilaczy impulsowych, opraw LED i falowników realnie to często 60–90% — bez tej wartości prąd w przewodzie N wyjdzie zaniżony."
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
            <Card title={active.label} tag="rozruch i zabezpieczenia">
              <div className="grid sm:grid-cols-2 gap-x-4">
                <Field
                  label="Moc na wale"
                  value={slMocKW}
                  onChange={(v) => patch({ slMocKW: Number(v) })}
                  unit="kW"
                  step="0.1"
                  hint="Moc MECHANICZNA silnika z tabliczki znamionowej (oznaczenie „Pn” albo „kW”) — to NIE jest moc pobierana z sieci, ta jest o 1/η większa."
                />
                <Field
                  label="Napięcie międzyfazowe"
                  value={slUn}
                  onChange={(v) => patch({ slUn: Number(v) })}
                  unit="V"
                  hint="Napięcie znamionowe silnika z tabliczki — dla silnika 3-fazowego w Polsce zwykle 400 V (połączenie w gwiazdę)."
                />
                <Field
                  label="Współczynnik mocy cos φ"
                  value={slCosfi}
                  onChange={(v) => patch({ slCosfi: Number(v) })}
                  step="0.01"
                  hint="Z tabliczki znamionowej silnika (oznaczenie „cos φ”) — typowo 0,80–0,90 dla silników klatkowych przy pełnym obciążeniu."
                />
                <Field
                  label="Sprawność η"
                  value={slSprawnosc}
                  onChange={(v) => patch({ slSprawnosc: Number(v) })}
                  step="0.01"
                  hint="Sprawność silnika z tabliczki znamionowej (oznaczenie „η”, w procentach — wpisz jako ułamek, np. 0,88 dla 88%)."
                />
                <Field
                  label="Krotność prądu rozruchowego (z tabliczki)"
                  value={slKrotnosc}
                  onChange={(v) => patch({ slKrotnosc: Number(v) })}
                  step="0.5"
                  hint="Stosunek Ir/In z tabliczki znamionowej (oznaczenie „Ir/In” albo „Isr/In”) — dla silników klatkowych zwykle 5–8. Nie zgaduj: poza tym zakresem odczytaj wartość wprost z tabliczki."
                />
                <Field
                  label="Sposób rozruchu"
                  value={slRozruch}
                  onChange={(v) => patch({ slRozruch: v as SposobRozruchu })}
                  options={ROZRUCH_OPTIONS}
                  hint="Jak silnik jest uruchamiany — bezpośredni (DOL) daje pełny prąd i moment rozruchowy; gwiazda-trójkąt obniża oba do 1/3, więc nadaje się tylko do napędów ruszających bez dużego obciążenia."
                />
                <Field
                  label="Czas rozruchu (0 = pomiń)"
                  value={slCzasRozruchu}
                  onChange={(v) => patch({ slCzasRozruchu: Number(v) })}
                  unit="s"
                  step="0.5"
                  hint="Ile realnie trwa rozruch tego napędu — z pomiaru albo doświadczenia z podobną maszyną. Potrzebne do doboru klasy wyzwalania przekaźnika termicznego."
                />
                <Field
                  label="Impedancja obwodu zasilającego (0 = pomiń)"
                  value={slImpedancja}
                  onChange={(v) => patch({ slImpedancja: Number(v) })}
                  unit="Ω"
                  step="0.01"
                  hint="Impedancja przewodu i źródła od rozdzielnicy do silnika — policzysz ją w kalkulatorze „Impedancja przewodu”. Potrzebna do sprawdzenia spadku napięcia w chwili rozruchu."
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

          {activeCalc === "impedancja" && (
            <Card title={active.label} tag="R, X, Z">
              <div className="grid sm:grid-cols-2 gap-x-4">
                <Field
                  label="Długość przewodu"
                  value={imDlugosc}
                  onChange={(v) => patch({ imDlugosc: Number(v) })}
                  unit="m"
                />
                <Field
                  label="Przekrój żyły"
                  value={String(imPrzekroj)}
                  onChange={(v) => patch({ imPrzekroj: Number(v) })}
                  options={SZEREG_PELNY_OPTIONS}
                />
                <Field
                  label="Materiał"
                  value={imMaterial}
                  onChange={(v) => patch({ imMaterial: v as Material })}
                  options={MATERIAL_OPTIONS}
                />
                <Field
                  label="Izolacja"
                  value={imIzolacja}
                  onChange={(v) => patch({ imIzolacja: v as Izolacja })}
                  options={IZOLACJA_OPTIONS}
                  hint="Sprawdź na oznaczeniu kabla (np. YDY/YKY to PVC, YKYFtms/YKXS to XLPE) — decyduje o temperaturze żyły przyjętej do liczenia rezystancji."
                />
                <Field
                  label="Rodzaj linii (X′)"
                  value={imRodzajLinii}
                  onChange={(v) => patch({ imRodzajLinii: v as RodzajLinii })}
                  options={RODZAJ_LINII_OPTIONS}
                  hint="Jak fizycznie wygląda trasa — kabel wielożyłowy, kable jednożyłowe osobno, czy linia napowietrzna. Wybierz opis najbliższy rzeczywistości."
                />
              </div>

              {impedancja.wartosci && (
                <div className="mt-2 p-3 pe-result">
                  <div className="text-xs text-slate-500 mb-1">Impedancja przewodu</div>
                  <div className="pe-mono text-lg text-blueprint">{formatLiczba(impedancja.wartosci.Z_ohm, 4)} Ω</div>
                  <div className="mt-2 flex gap-2 flex-wrap">
                    <span className="pe-chip pe-tag-copper">R {formatLiczba(impedancja.wartosci.R_ohm, 4)} Ω</span>
                    <span className="pe-chip pe-tag-blue">X {formatLiczba(impedancja.wartosci.X_ohm, 4)} Ω</span>
                    {impedancja.wartosci.R_do_X !== null && (
                      <span className="pe-chip pe-tag-green">R/X {formatLiczba(impedancja.wartosci.R_do_X, 2)}</span>
                    )}
                    <span className="pe-chip" style={{ background: "#EEF1F4", color: "#475569" }}>
                      γ {formatLiczba(impedancja.wartosci.gamma, 1)} przy {formatLiczba(impedancja.wartosci.tempZyly_C, 0)} °C
                    </span>
                  </div>
                </div>
              )}
              <CalcResultView wynik={impedancja} />

              <div className="mb-2 mt-4 text-xs font-semibold text-slate-600">Przewody równoległe — podział prądu</div>
              <div className="mb-3 rounded-md p-2.5 text-[11.5px] leading-relaxed" style={{ background: "#2D5A8C10", color: "#2D5A8C" }}>
                Prąd dzieli się <strong>odwrotnie proporcjonalnie do impedancji</strong>, więc krótsza żyła bierze go
                więcej. Zabezpieczenie nadprądowe mierzy prąd CAŁKOWITY, więc przeciążenia pojedynczej żyły nie wykryje —
                stąd normowy wymóg jednakowej długości i przekroju.
              </div>
              <div className="grid sm:grid-cols-2 gap-x-4">
                <Field
                  label="Prąd całkowity obwodu"
                  value={imRownoleglePrad}
                  onChange={(v) => patch({ imRownoleglePrad: Number(v) })}
                  unit="A"
                />
                <Field
                  label="Obciążalność jednej żyły (0 = bez oceny)"
                  value={imRownolegleIz}
                  onChange={(v) => patch({ imRownolegleIz: Number(v) })}
                  unit="A"
                  hint="Dopuszczalny prąd długotrwały POJEDYNCZEJ żyły po współczynnikach korekcyjnych — z kalkulatora „Dobór przekroju przewodu” albo z Rozdzielnicy. Zostaw 0, żeby zobaczyć sam podział prądu bez oceny."
                />
              </div>
              {/* Jawne htmlFor/id z tego samego powodu co w `Field` — przycisk „i" jest
                  elementem etykietowalnym i przy owinięciu obu w <label> przejąłby
                  powiązanie, zostawiając pole bez nazwy dostępnej. */}
              <div className="mb-3">
                <div className="mb-1 flex items-center gap-1 text-xs text-slate-500">
                  <label htmlFor="im-rownolegle-dlugosci">Długości poszczególnych żył (po przecinku)</label>
                  <HintButton hint="Wpisz długość KAŻDEJ żyły biegnącej równolegle, oddzieloną przecinkiem — np. dla dwóch żył o różnej długości: 40, 60. Różne długości to właśnie ten problem, który ten kalkulator pokazuje liczbowo." />
                </div>
                <input
                  id="im-rownolegle-dlugosci"
                  className="pe-input pe-mono w-full text-sm"
                  value={imRownolegleDlugosci}
                  onChange={(e) => patch({ imRownolegleDlugosci: e.target.value })}
                  placeholder="np. 40, 60"
                />
              </div>

              {rownolegle.wartosci && (
                <div className="mt-2 p-3 pe-result">
                  <div className="text-xs text-slate-500 mb-1">Najbardziej obciążona żyła</div>
                  <div className="pe-mono text-lg text-blueprint">{formatLiczba(rownolegle.wartosci.Imax_A, 1)} A</div>
                  <div className="mt-2 flex gap-2 flex-wrap">
                    <span className="pe-chip pe-tag-copper">
                      podział {rownolegle.wartosci.prady_A.map((I) => formatLiczba(I, 1)).join(" / ")} A
                    </span>
                    <span className="pe-chip pe-tag-blue">
                      przy równym podziale {formatLiczba(rownolegle.wartosci.pradRowny_A, 1)} A
                    </span>
                    <span className="pe-chip pe-tag-green">odchylenie {formatLiczba(rownolegle.wartosci.odchylenie_pct, 1)}%</span>
                  </div>
                </div>
              )}
              <CalcResultView wynik={rownolegle} />
            </Card>
          )}

          {activeCalc === "peN" && (
            <Card title={active.label} tag="PE i N">
              <div className="grid sm:grid-cols-2 gap-x-4">
                <Field
                  label="Przekrój przewodu fazowego"
                  value={String(peFazowy)}
                  onChange={(v) => patch({ peFazowy: Number(v) })}
                  options={SZEREG_PELNY_OPTIONS}
                />
                <Field
                  label="Materiał"
                  value={peMaterial}
                  onChange={(v) => patch({ peMaterial: v as Material })}
                  options={MATERIAL_OPTIONS}
                />
                <Field
                  label="Izolacja"
                  value={peIzolacja}
                  onChange={(v) => patch({ peIzolacja: v as Izolacja })}
                  options={IZOLACJA_OPTIONS}
                  hint="Sprawdź na oznaczeniu kabla (np. YDY/YKY to PVC, YKYFtms/YKXS to XLPE) — decyduje o współczynniku k wytrzymałości zwarciowej."
                />
                <Field
                  label="Prąd zwarcia doziemnego (0 = pomiń warunek cieplny)"
                  value={pePradZwarciowy}
                  onChange={(v) => patch({ pePradZwarciowy: Number(v) })}
                  unit="A"
                  hint="Prąd zwarcia L-PE w tym miejscu — z pomiaru, z kalkulatora „Prądy zwarciowe” albo z dokumentacji projektowej. Bez niego sprawdzany jest tylko sam warunek tabelaryczny."
                />
                <Field
                  label="Czas wyłączenia"
                  value={peCzas}
                  onChange={(v) => patch({ peCzas: Number(v) })}
                  unit="s"
                  step="0.1"
                  hint="Rzeczywisty czas zadziałania zabezpieczenia tego obwodu przy podanym prądzie zwarciowym — z charakterystyki wyzwalania albo maksymalny czas wg normy (0,4 s dla obwodu odbiorczego TN)."
                />
              </div>

              {przewodPE.wartosci && (
                <div className="mt-2 p-3 pe-result">
                  <div className="text-xs text-slate-500 mb-1">Wymagany przekrój przewodu PE</div>
                  <div className="pe-mono text-lg text-blueprint">{formatLiczba(przewodPE.wartosci.wymagany_mm2, 1)} mm²</div>
                  <div className="mt-2 flex gap-2 flex-wrap">
                    <span className="pe-chip pe-tag-copper">z reguły {formatLiczba(przewodPE.wartosci.zReguly_mm2, 1)} mm²</span>
                    {przewodPE.wartosci.zWarunkuCieplnego_mm2 !== null && (
                      <span className="pe-chip pe-tag-blue">
                        z warunku cieplnego {formatLiczba(przewodPE.wartosci.zWarunkuCieplnego_mm2, 2)} mm²
                      </span>
                    )}
                    <span className="pe-chip pe-tag-green">decyduje: {przewodPE.wartosci.decyduje}</span>
                  </div>
                </div>
              )}
              <CalcResultView wynik={przewodPE} />

              <div className="mb-2 mt-4 text-xs font-semibold text-slate-600">Przewód neutralny N</div>
              <div className="grid sm:grid-cols-2 gap-x-4">
                <Field
                  label="Prąd fazowy"
                  value={pnPradFazowy}
                  onChange={(v) => patch({ pnPradFazowy: Number(v) })}
                  unit="A"
                />
                <Field
                  label="Udział 3. harmonicznej"
                  value={pnH3Pct}
                  onChange={(v) => patch({ pnH3Pct: Number(v) })}
                  unit="%"
                  step="5"
                  hint="0% dla odbiorów liniowych. Dla zasilaczy impulsowych, opraw LED i falowników realnie to często 60–90% — bez tej wartości prąd w N wyjdzie zaniżony."
                />
              </div>
              {przewodN.wartosci && (
                <div className="mt-2 p-3 pe-result">
                  <div className="text-xs text-slate-500 mb-1">Prąd w przewodzie N (obciążenie symetryczne)</div>
                  <div className="pe-mono text-lg text-blueprint">{formatLiczba(przewodN.wartosci.IN_A, 1)} A</div>
                  <div className="mt-2 flex gap-2 flex-wrap">
                    <span className="pe-chip pe-tag-copper">zalecany przekrój N {formatLiczba(przewodN.wartosci.zalecany_mm2, 1)} mm²</span>
                  </div>
                </div>
              )}
              <CalcResultView wynik={przewodN} />
            </Card>
          )}

          {activeCalc === "spd" && (
            <Card title={active.label} tag="koordynacja ochrony">
              <div className="mb-3 rounded-md p-2.5 text-[11.5px] leading-relaxed" style={{ background: "#2D5A8C10", color: "#2D5A8C" }}>
                Skuteczny poziom ochrony <strong>nie równa się Up z tabliczki</strong> — dochodzi do niego spadek
                indukcyjny na przewodach przyłączeniowych, rzędu 1 kV na metr przy udarze 8/20 µs. Stąd bierze się reguła
                „przewody ≤ 0,5 m”: to wynik rachunku, nie zalecenie montażowe.
              </div>

              <div className="grid sm:grid-cols-2 gap-x-4">
                <Field
                  label="Typ ogranicznika"
                  value={spdTyp}
                  onChange={(v) => patch({ spdTyp: v as TypSPD })}
                  options={TYP_SPD_OPTIONS}
                />
                <Field
                  label="Poziom ochrony Up (z tabliczki)"
                  value={spdUp}
                  onChange={(v) => patch({ spdUp: Number(v) })}
                  unit="V"
                  hint="Napięciowy poziom ochrony ogranicznika — z jego tabliczki znamionowej albo karty katalogowej (oznaczenie „Up”)."
                />
                <Field
                  label="Wytrzymałość udarowa urządzenia U_w"
                  value={String(spdUw)}
                  onChange={(v) => patch({ spdUw: Number(v) })}
                  options={UW_OPTIONS}
                  hint="Wpisz wartość z karty katalogowej chronionego urządzenia, jeśli ją znasz — w przeciwnym razie wybierz kategorię przepięciową odpowiadającą jego miejscu w instalacji (im dalej od wejścia, tym niższa kategoria i mniejsza wytrzymałość)."
                />
                <Field
                  label="Długość przewodów przyłączeniowych (łącznie)"
                  value={spdDlugosc}
                  onChange={(v) => patch({ spdDlugosc: Number(v) })}
                  unit="m"
                  step="0.1"
                  hint="Suma długości przewodu doprowadzającego i odprowadzającego ogranicznik (faza + PE) — nie tylko jednego z nich."
                />
              </div>

              {spd.wartosci && (
                <div className="mt-2 p-3 pe-result">
                  <div className="text-xs text-slate-500 mb-1">Skuteczny poziom ochrony na zaciskach urządzenia</div>
                  <div className="pe-mono text-lg text-blueprint">{formatLiczba(spd.wartosci.UpSkuteczne_V, 0)} V</div>
                  <div className="mt-2 flex gap-2 flex-wrap">
                    <span className="pe-chip pe-tag-copper">
                      przyrost na przewodach {formatLiczba(spd.wartosci.przyrostNaPrzewodach_V, 0)} V
                    </span>
                    <span className="pe-chip pe-tag-blue">U_w urządzenia {formatLiczba(spdUw, 0)} V</span>
                    <span className="pe-chip pe-tag-green">
                      maks. długość przewodów {formatLiczba(spd.wartosci.maksDlugosc_m, 2)} m
                    </span>
                  </div>
                </div>
              )}
              <CalcResultView wynik={spd} />
            </Card>
          )}

          {activeCalc === "pv" && (
            <Card title={active.label} tag="string DC">
              <div className="mb-2 text-xs font-semibold text-slate-600">Moduł i string (dane z karty katalogowej)</div>
              <div className="grid sm:grid-cols-2 gap-x-4">
                <Field
                  label="Prąd zwarciowy Isc (STC)"
                  value={pvIsc}
                  onChange={(v) => patch({ pvIsc: Number(v) })}
                  unit="A"
                  step="0.1"
                  hint="Prąd zwarciowy modułu w warunkach standardowych (STC) — z karty katalogowej modułu, oznaczenie „Isc”."
                />
                <Field
                  label="Napięcie jałowe Voc (STC)"
                  value={pvVoc}
                  onChange={(v) => patch({ pvVoc: Number(v) })}
                  unit="V"
                  step="0.1"
                  hint="Napięcie jałowe (bez obciążenia) modułu w warunkach STC — z karty katalogowej, oznaczenie „Voc”."
                />
                <Field
                  label="Napięcie Vmpp (STC, opcjonalne)"
                  value={pvVmpp}
                  onChange={(v) => patch({ pvVmpp: Number(v) })}
                  unit="V"
                  step="0.1"
                  hint="Napięcie w punkcie mocy maksymalnej — z karty katalogowej (oznaczenie „Vmpp”/„Vmp”). Bez niego spadek % liczony jest względem Voc, mniej dokładnie."
                />
                <Field
                  label="Prąd Impp (STC, opcjonalne)"
                  value={pvImpp}
                  onChange={(v) => patch({ pvImpp: Number(v) })}
                  unit="A"
                  step="0.1"
                  hint="Prąd w punkcie mocy maksymalnej — z karty katalogowej. Bez niego spadek napięcia liczony jest prądem Isc, co go zawyża (bezpieczna, ale mniej dokładna strona)."
                />
                <Field
                  label="Liczba modułów w szeregu"
                  value={pvLiczbaModulow}
                  onChange={(v) => patch({ pvLiczbaModulow: Number(v) })}
                  step="1"
                  hint="Ile modułów jest połączonych szeregowo w jednym stringu podłączonym do jednego wejścia MPPT falownika."
                />
                <Field
                  label="Współczynnik temperaturowy napięcia β"
                  value={pvBeta}
                  onChange={(v) => patch({ pvBeta: Number(v) })}
                  unit="%/°C"
                  step="0.01"
                  hint="Z karty katalogowej modułu (oznaczenie „temperature coefficient of Voc”) — zwykle wartość UJEMNA, ok. −0,25 do −0,35 %/°C: napięcie modułu ROŚNIE, gdy robi się zimno."
                />
                <Field
                  label="Temperatura minimalna modułu"
                  value={pvTempMin}
                  onChange={(v) => patch({ pvTempMin: Number(v) })}
                  unit="°C"
                  hint="Najniższa spodziewana temperatura w lokalizacji instalacji — moduł na słońcu w mrozie osiąga temperaturę zbliżoną do temperatury powietrza."
                />
                <Field
                  label="Maks. napięcie wejściowe falownika"
                  value={pvFalownikVocMax}
                  onChange={(v) => patch({ pvFalownikVocMax: Number(v) })}
                  unit="V"
                  hint="Maksymalne dopuszczalne napięcie DC na wejściu falownika — z jego karty katalogowej. Przekroczenie grozi zniszczeniem falownika."
                />
              </div>

              <label className="mb-3 flex items-center gap-2 text-[13px] text-slate-600">
                <input
                  type="checkbox"
                  checked={pvSprawdzMppt}
                  onChange={(e) => patch({ pvSprawdzMppt: e.target.checked })}
                  className="h-4 w-4 rounded border-border"
                />
                Sprawdź też dolną granicę zakresu MPPT w upale (wymaga Vmpp)
              </label>
              {pvSprawdzMppt && (
                <div className="grid sm:grid-cols-2 gap-x-4">
                  <Field
                    label="Temperatura maksymalna modułu"
                    value={pvTempMax}
                    onChange={(v) => patch({ pvTempMax: Number(v) })}
                    unit="°C"
                    hint="Najwyższa spodziewana temperatura modułu w pełnym słońcu — zwykle wyraźnie wyższa niż temperatura powietrza, typowo 60–70°C."
                  />
                  <Field
                    label="Minimalne napięcie zakresu MPPT falownika"
                    value={pvFalownikMpptMin}
                    onChange={(v) => patch({ pvFalownikMpptMin: Number(v) })}
                    unit="V"
                    hint="Dolna granica zakresu MPPT z karty katalogowej falownika (oznaczenie „MPPT voltage range”)."
                  />
                </div>
              )}

              <div className="mb-2 mt-3 text-xs font-semibold text-slate-600">Kabel DC</div>
              <div className="grid sm:grid-cols-2 gap-x-4">
                <Field
                  label="Długość trasy DC (w jedną stronę)"
                  value={pvDlugoscDC}
                  onChange={(v) => patch({ pvDlugoscDC: Number(v) })}
                  unit="m"
                />
                <Field
                  label="Przekrój żyły DC"
                  value={String(pvPrzekrojDC)}
                  onChange={(v) => patch({ pvPrzekrojDC: Number(v) })}
                  options={SZEREG_PELNY_OPTIONS}
                  hint="Przekrój kabla solarnego DC — typowo 4 lub 6 mm² dla pojedynczego stringu."
                />
                <Field
                  label="Materiał"
                  value={pvMaterialDC}
                  onChange={(v) => patch({ pvMaterialDC: v as Material })}
                  options={MATERIAL_OPTIONS}
                />
                <Field
                  label="Dopuszczalny spadek DC"
                  value={pvLimitSpadkuDC}
                  onChange={(v) => patch({ pvLimitSpadkuDC: Number(v) })}
                  unit="%"
                  step="0.1"
                  hint="W praktyce projektowej instalacji PV przyjmuje się zwykle do 1% — większy spadek to bezpowrotna strata energii z produkcji."
                />
              </div>

              {stringPV.wartosci && (
                <div className="mt-2 p-3 pe-result">
                  <div className="text-xs text-slate-500 mb-1">Napięcie stringu w zimnie</div>
                  <div className="pe-mono text-lg text-blueprint">{formatLiczba(stringPV.wartosci.VocZimny_V, 1)} V</div>
                  <div className="mt-2 flex gap-2 flex-wrap">
                    <span className="pe-chip pe-tag-copper">I projektowy (1,25×Isc) {formatLiczba(stringPV.wartosci.IprojektowyA, 2)} A</span>
                    <span className="pe-chip pe-tag-blue">spadek DC {formatLiczba(stringPV.wartosci.spadekDC_pct, 2)}%</span>
                    {stringPV.wartosci.VmppGoracy_V !== null && (
                      <span className="pe-chip pe-tag-green">Vmpp w upale {formatLiczba(stringPV.wartosci.VmppGoracy_V, 1)} V</span>
                    )}
                  </div>
                </div>
              )}
              <CalcResultView wynik={stringPV} />

              <div className="mb-2 mt-4 text-xs font-semibold text-slate-600">Wyjście AC falownika</div>
              <div className="grid sm:grid-cols-2 gap-x-4">
                <Field
                  label="Moc AC falownika"
                  value={pvMocAC}
                  onChange={(v) => patch({ pvMocAC: Number(v) })}
                  unit="W"
                />
                <Field
                  label="Zasilanie"
                  value={pvFazaAC}
                  onChange={(v) => patch({ pvFazaAC: v as "1" | "3" })}
                  options={PHASE_OPTIONS}
                />
                <Field
                  label="Długość trasy AC"
                  value={pvDlugoscAC}
                  onChange={(v) => patch({ pvDlugoscAC: Number(v) })}
                  unit="m"
                />
                <Field
                  label="Sposób ułożenia"
                  value={pvSposobUlozeniaAC}
                  onChange={(v) => patch({ pvSposobUlozeniaAC: v as LayingMethod })}
                  options={LAYING_METHOD_OPTIONS}
                />
              </div>
              {falownikAC.przekroj_mm2 && falownikAC.aparat && (
                <div className="mt-2 p-3 pe-result">
                  <div className="text-xs text-slate-500 mb-1">Przewód i zabezpieczenie AC</div>
                  <div className="mt-1 flex gap-2 flex-wrap">
                    <span className="pe-chip pe-tag-copper">{falownikAC.kabel}</span>
                    <span className="pe-chip pe-tag-blue">
                      wyłącznik {falownikAC.aparat.charakterystyka}
                      {falownikAC.aparat.In_A} {falownikAC.aparat.bieguny}
                    </span>
                  </div>
                </div>
              )}
              {!falownikAC.przekroj_mm2 && (
                <div className="mt-2 flex items-center gap-1 text-sm" style={{ color: "#A2352C" }}>
                  <AlertTriangle size={14} /> nie udało się dobrać przewodu AC
                </div>
              )}
            </Card>
          )}

          {activeCalc === "ev" && (
            <Card title={active.label} tag="EVSE">
              <div className="grid sm:grid-cols-2 gap-x-4">
                <Field
                  label="Moc ładowania"
                  value={evMoc}
                  onChange={(v) => patch({ evMoc: Number(v) })}
                  unit="W"
                  hint="Moc ładowania z tabliczki/dokumentacji ładowarki (np. 3,7 kW dla 1-fazowej 16 A, 11 kW albo 22 kW dla 3-fazowej)."
                />
                <Field
                  label="Zasilanie"
                  value={evFaza}
                  onChange={(v) => patch({ evFaza: v as "1" | "3" })}
                  options={PHASE_OPTIONS}
                />
                <Field
                  label="Współczynnik mocy cos φ"
                  value={evCosfi}
                  onChange={(v) => patch({ evCosfi: Number(v) })}
                  step="0.01"
                  hint="Nowoczesne ładowarki z korekcją współczynnika mocy (PFC) mają cos φ bliski 1,0 — sprawdź w karcie katalogowej, jeśli chcesz dokładniejszą wartość."
                />
                <Field
                  label="Długość trasy"
                  value={evDlugosc}
                  onChange={(v) => patch({ evDlugosc: Number(v) })}
                  unit="m"
                />
                <Field
                  label="Sposób ułożenia"
                  value={evSposobUlozenia}
                  onChange={(v) => patch({ evSposobUlozenia: v as LayingMethod })}
                  options={LAYING_METHOD_OPTIONS}
                />
              </div>

              <label className="mb-3 flex items-center gap-2 text-[13px] text-slate-600">
                <input
                  type="checkbox"
                  checked={evWbudowanaOchronaDC}
                  onChange={(e) => patch({ evWbudowanaOchronaDC: e.target.checked })}
                  className="h-4 w-4 rounded border-border"
                />
                Ładowarka ma wbudowaną ochronę przed prądem upływu stałym (RDC-DD)
              </label>

              {obwodEV.wartosci && (
                <div className="mt-2 p-3 pe-result">
                  <div className="text-xs text-slate-500 mb-1">Prąd obliczeniowy</div>
                  <div className="pe-mono text-lg text-blueprint">{formatLiczba(obwodEV.wartosci.Ib_A, 2)} A</div>
                  {obwodEV.wartosci.dobor.kabel && obwodEV.wartosci.dobor.aparat ? (
                    <div className="mt-2 flex gap-2 flex-wrap">
                      <span className="pe-chip pe-tag-copper">{obwodEV.wartosci.dobor.kabel}</span>
                      <span className="pe-chip pe-tag-blue">
                        wyłącznik {obwodEV.wartosci.dobor.aparat.charakterystyka}
                        {obwodEV.wartosci.dobor.aparat.In_A} {obwodEV.wartosci.dobor.aparat.bieguny}
                      </span>
                      <span className="pe-chip pe-tag-green">
                        {obwodEV.wartosci.wymaganyRCD === "typA_wystarczy" ? "RCD typu A wystarczy" : "wymagany RCD typu B / A+RDC-DD"}
                      </span>
                    </div>
                  ) : (
                    <div className="mt-2 flex items-center gap-1 text-sm" style={{ color: "#A2352C" }}>
                      <AlertTriangle size={14} /> nie udało się dobrać — zobacz ostrzeżenia niżej
                    </div>
                  )}
                </div>
              )}

              {obwodEV.wartosci?.dobor.ostrzezenia && obwodEV.wartosci.dobor.ostrzezenia.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  {obwodEV.wartosci.dobor.ostrzezenia.map((o, i) => (
                    <div
                      key={i}
                      className="flex gap-2 rounded-md p-2.5 text-[11.5px] leading-relaxed"
                      style={{
                        background: o.level === "error" ? "#C6433A14" : "#C1793F14",
                        color: o.level === "error" ? "#A2352C" : "#8A5526",
                      }}
                    >
                      <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                      <div>{o.message}</div>
                    </div>
                  ))}
                </div>
              )}
              <CalcResultView wynik={obwodEV} />
            </Card>
          )}

          {activeCalc === "kompensacja" && (
            <Card title={active.label} tag="moc bierna">
              <div className="grid sm:grid-cols-2 gap-x-4">
                <Field
                  label="Moc czynna odbioru"
                  value={kmPkW}
                  onChange={(v) => setKm({ kmPkW: Number(v) })}
                  unit="kW"
                />
                <Field
                  label="Napięcie (międzyfazowe)"
                  value={kmUV}
                  onChange={(v) => setKm({ kmUV: Number(v) })}
                  unit="V"
                  hint="Napięcie międzyfazowe sieci zasilającej — w Polsce standardowo 400 V."
                />
                <Field
                  label="cos φ przed kompensacją"
                  value={kmCos1}
                  onChange={(v) => setKm({ kmCos1: Number(v) })}
                  step="0.01"
                  hint="Obecny współczynnik mocy instalacji — z pomiaru analizatorem sieci albo z faktury za energię (zakład energetyczny często go tam podaje, jeśli nalicza opłatę za energię bierną)."
                />
                <Field
                  label="cos φ docelowy"
                  value={kmCos2}
                  onChange={(v) => setKm({ kmCos2: Number(v) })}
                  step="0.01"
                  hint="Współczynnik mocy, jaki chcesz uzyskać po kompensacji — zwykle 0,93–0,95, żeby uniknąć opłat za energię bierną (sprawdź próg w umowie z operatorem)."
                />
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
                  hint="Moc zwarciowa sieci w punkcie przyłączenia baterii — podaje ją zakład energetyczny w warunkach przyłączenia, albo policzysz ją z impedancji transformatora (kalkulator „Prądy zwarciowe”: Sk ≈ Un²/Zk). Potrzebna do sprawdzenia ryzyka rezonansu z harmonicznymi."
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
            <Card title={active.label} tag="bilans mocy">
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
                      title="Moc znamionowa tego odbiornika [W] — z tabliczki znamionowej."
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
              <Field
                label="Współczynnik jednoczesności (ks)"
                value={ks}
                onChange={(v) => setKs(Number(v))}
                step="0.05"
                hint="Odzwierciedla, że nie wszystkie odbiorniki pracują naraz z pełną mocą. Orientacyjnie 0,6–0,8 dla domu jednorodzinnego — im więcej odbiorników, tym niższy. Podnieś go, jeśli masz pompę ciepła, ładowarkę EV albo kuchenkę indukcyjną (te potrafią pracować długo i równocześnie)."
              />
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
            <Card title={active.label} tag="WLZ">
              <div className="grid sm:grid-cols-2 gap-x-4">
                <div>
                  <Field
                    label="Prąd obliczeniowy"
                    value={wlzCurrentA}
                    onChange={(v) => setWlzCurrentA(Number(v))}
                    unit="A"
                    hint="Prąd zapotrzebowany całego budynku (nie suma mocy zainstalowanej!) — wczytaj go przyciskiem poniżej z kalkulatora „Bilans mocy budynku” albo wpisz wartość z wniosku o przyłączenie."
                  />
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
                <Field
                  label="Długość trasy (w jedną stronę)"
                  value={wlzLength}
                  onChange={(v) => setWlzLength(Number(v))}
                  unit="m"
                />
                <Field
                  label="Sposób ułożenia"
                  value={wlzLayingMethod}
                  onChange={(v) => setWlzLayingMethod(v as LayingMethod)}
                  options={LAYING_METHOD_OPTIONS}
                  hint="Jak kabel WLZ jest ułożony WEWNĄTRZ budynku (pod tynkiem, w rurce, natynkowo…) — te tablice nie obejmują kabla ułożonego w ziemi."
                />
                <Field
                  label="Temperatura otoczenia"
                  value={wlzAmbientC}
                  onChange={(v) => setWlzAmbientC(Number(v))}
                  unit="°C"
                />
                <Field
                  label="Obwodów we wspólnej trasie"
                  value={wlzBundleCount}
                  onChange={(v) => setWlzBundleCount(Number(v))}
                  step="1"
                  hint="Ile innych obwodów biegnie razem z WLZ w tej samej rurce/korytku na dłuższym odcinku trasy."
                />
                <Field
                  label="Dopuszczalny spadek napięcia na WLZ"
                  value={wlzDropLimit}
                  onChange={(v) => setWlzDropLimit(Number(v))}
                  unit="%"
                  step="0.5"
                  hint="Domyślnie 2% — węższy limit niż 3–5% dla obwodu odbiorczego, bo WLZ to tylko odcinek całej trasy i musi zostawić zapas na spadek za rozdzielnicą."
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
            <Card title={active.label} tag="ochrona przeciwporażeniowa">
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
                  hint="Litera wydrukowana na wyłączniku obok prądu znamionowego (np. „B16”, „C16”) — B do zwykłych obwodów, C dla odbiorników z rozruchem silnikowym (pompy, lodówki), D dla silników o dużym prądzie rozruchowym."
                />
                <Field
                  label="Prąd znamionowy In"
                  value={zIn}
                  onChange={(v) => setZIn(Number(v))}
                  unit="A"
                />
                <Field
                  label="Zmierzona Zs"
                  value={zMeasured}
                  onChange={(v) => setZMeasured(Number(v))}
                  unit="Ω"
                  step="0.01"
                  hint="Wynik pomiaru pętli zwarcia L-PE miernikiem instalacyjnym w danym punkcie obwodu. Zostaw puste/0, żeby zobaczyć samo Zs max bez oceny."
                />
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
            <Card title={active.label} tag="ochrona przeciwporażeniowa">
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
                  hint="Prąd zadziałania wyłącznika różnicowoprądowego chroniącego ten obwód — sprawdź na obudowie RCD (oznaczenie „IΔn”). 30 mA to standard dla obwodów odbiorczych, wyższe wartości typowe dla wyłączników na początku instalacji."
                />
                <Field
                  label="Zmierzona rezystancja uziemienia RA"
                  value={ttMeasuredRa}
                  onChange={(v) => setTtMeasuredRa(Number(v))}
                  unit="Ω"
                  step="0.5"
                  hint="Wynik pomiaru uziomu miernikiem rezystancji uziemienia — patrz protokół „Pomiar rezystancji uziemienia” w zakładce Protokoły."
                />
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
            <Card title={active.label} tag="natężenie oświetlenia">
              <div className="grid sm:grid-cols-2 gap-x-4">
                <Field
                  label="Powierzchnia pomieszczenia"
                  value={roomA}
                  onChange={(v) => setRoomA(Number(v))}
                  unit="m²"
                />
                <Field
                  label="Wymagane natężenie"
                  value={lux}
                  onChange={(v) => setLux(Number(v))}
                  unit="lx"
                  hint="Docelowe natężenie oświetlenia na płaszczyźnie roboczej — orientacyjne wartości podane pod wynikiem (np. 150–300 lx dla pokoju dziennego, 500 lx dla blatu w kuchni)."
                />
                <Field
                  label="Strumień jednej oprawy"
                  value={lumPerOpr}
                  onChange={(v) => setLumPerOpr(Number(v))}
                  unit="lm"
                  hint="Strumień świetlny pojedynczej oprawy — z karty katalogowej albo opakowania żarówki/opraw LED (oznaczenie „lm”, nie moc w watach)."
                />
                <Field
                  label="Wsp. utrzymania (MF)"
                  value={mf}
                  onChange={(v) => setMf(Number(v))}
                  step="0.05"
                  hint="Uwzględnia spadek strumienia świetlnego w czasie (starzenie się źródeł, zabrudzenie opraw) — typowo 0,8 dla pomieszczeń czyszczonych regularnie."
                />
                <Field
                  label="Wsp. wykorzystania (UF)"
                  value={uf}
                  onChange={(v) => setUf(Number(v))}
                  step="0.05"
                  hint="Zależy od geometrii pomieszczenia i odbicia ścian/sufitu — typowo 0,4–0,7. Dla jasnego pokoju o zwykłych proporcjach przyjmij 0,6."
                />
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
            <Card title={active.label} tag="bezpieczeństwo">
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
