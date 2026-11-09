import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { WynikGlowny } from "./WynikGlowny";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ChevronRight, Download, Plus, Trash2 } from "lucide-react";
import { obliczUziom, REZYSTYWNOSC_GRUNTU, TYP_UZIOMU_LABELS, type TypUziomu } from "@/lib/calc/earthing";
import { dobierzPrzewodACFalownika, obliczStringPV } from "@/lib/calc/pv";
import { obliczObwodEV } from "@/lib/calc/evCharger";
import { KRYTERIUM_LABELS, pelnyDoborPrzekroju } from "@/lib/calc/fullSizing";
import { dobierzWkladkeGGOchrona } from "@/lib/calc/gGFuse";
import { METODA_LABELS, type MetodaOdniesienia3 } from "@/lib/norms/ampacity3";
import { CZAS_GG_LABELS, TYP_WKLADKI_LABELS, type TypWkladkiGG } from "@/lib/norms/gGFuses";
import { obliczBilans, type Faza } from "@/lib/calc/loadBalance";
import { obliczSilnik, SPOSOB_ROZRUCHU_LABELS, type SposobRozruchu } from "@/lib/calc/motor";
import { CalcResultView, PasekWerdyktu } from "./CalcResultView";
import { obliczSpadekNapiecia } from "@/lib/calc/voltageDrop";
import { obliczMaksymalnaDlugosc } from "@/lib/calc/maxLength";
import {
  CEL_ZWARCIA_LABELS,
  impedancjaTransformatora,
  obliczPradyZwarciowe,
  obliczWytrzymaloscZwarciowa,
  type CelZwarcia,
} from "@/lib/calc/shortCircuit";
import {
  C_NAPIECIOWE,
  MODEL_REZYSTYWNOSCI_LABELS,
  type Izolacja,
  type Material,
  type ModelRezystywnosci,
  type RodzajLinii,
} from "@/lib/norms/conductors";
import { limitSpadkuPct } from "@/lib/panel/norms";
import { formatLiczba } from "@/lib/calc/result";
import { bledyBilansuMocy, calcLighting, calcPowerBalance, maxGroundingResistance, UL } from "@/lib/electrical";
import { BREAKER_RATINGS, LAYING_METHOD_LABELS, SECTIONS, U0, type LayingMethod } from "@/lib/panel/norms";
import {
  sizeBreakerForSection,
  voltageDropPct,
  sizeCircuit,
  sizeFeeder,
  zsMaxForBreaker,
  ZAPAS_POMIAROWY,
  type CircuitKind,
} from "@/lib/panel/sizing";
import { useCalculatorsStore, type CalcId, type TrybObwodu } from "@/store/useCalculatorsStore";
import { useRoute } from "@/hooks/useRoute";
import { dopasujParam } from "@/lib/routing";
import { Card } from "./Card";
import { KalkulatorImpedancji } from "./KalkulatorImpedancji";
import { KalkulatorKompensacji } from "./KalkulatorKompensacji";
import { KalkulatorPeN } from "./KalkulatorPeN";
import { KalkulatorSPD } from "./KalkulatorSPD";
import { SZEREG_PELNY_OPTIONS, MATERIAL_OPTIONS, IZOLACJA_OPTIONS, RODZAJ_LINII_OPTIONS } from "./opcje";
import { EkranStartowy, ListaKalkulatorow, SzukajkaKalkulatorow, WyborKalkulatoraMobile } from "./NawigacjaKalkulatorow";
import { filtruj, type GrupaId } from "@/lib/calc/grupy";
import { KryteriaObwodu, PrzelacznikTrybu } from "./DoborObwodu";
import { ocenKryteria, podsumowanieObwodu, type OcenaKryterium } from "@/lib/calc/kryteriaObwodu";
import { Field } from "./Field";
import { HowItWorks } from "./HowItWorks";
import { Button } from "@/components/ui/button";

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
/**
 * Adresy czterech kalkulatorow scalonych w „Dobor obwodu" — kazdy prowadzi do
 * wlasciwego TRYBU, a nie tylko do nowej strony.
 *
 * Linki do nich sa juz w obiegu (w mailach, notatkach, na forach), a kalkulator
 * elektryczny bez wynikow to dla odbiorcy taki sam blad jak 404. Przekierowanie
 * zachowuje intencje: kto szukal doboru zabezpieczenia, trafia w tryb „Mam przekroj",
 * a nie na ekran, na ktorym musi zgadnac, gdzie sie to teraz znajduje.
 */
const TRYBY_OBWODU: TrybObwodu[] = ["przekroj", "zabezpieczenie", "wlz", "pelny"];

const STARE_ADRESY: Record<string, TrybObwodu> = {
  przekroj: "przekroj",
  zabezpieczenie: "zabezpieczenie",
  pelnyDobor: "pelny",
  "pelny-dobor": "pelny",
  wlz: "wlz",
};

/**
 * „Dobór obwodu" od `xl`: pola po lewej, wynik po prawej.
 *
 * Jedyny kalkulator, w którym wynik spadał pod krawędź ekranu — przy 1440×900 zaczynał
 * się na 874–901 px w trzech z czterech trybów (przełącznik trybu, ściąga cos φ i warunki
 * ułożenia stoją przed nim). W pozostałych osiemnastu wynik jest na pierwszym ekranie,
 * więc zostają w jednej kolumnie. Pola i wynik mają podobną wysokość, więc skutek zmiany
 * pola widać obok, bez przewijania w dół i z powrotem. Poniżej `xl` — bez zmian, wynik
 * pod polami.
 */
const UKLAD_POLA_WYNIK = "xl:grid xl:grid-cols-[minmax(0,1fr)_minmax(0,21rem)] xl:items-start xl:gap-x-6";

const CALC_LIST: { id: CalcId; label: string; desc: string }[] = [
  { id: "moc", label: "Bilans mocy budynku", desc: "moc zapotrzebowana i prąd do wniosku o przyłączenie" },
  { id: "obwod", label: "Dobór obwodu", desc: "przekrój, zabezpieczenie, WLZ i cztery kryteria w jednym" },
  { id: "gGWkladka", label: "Dobór wkładki gG", desc: "ochrona przeciwporażeniowa — zabezpieczenie topikowe" },
  { id: "spadek", label: "Spadek napięcia", desc: "sprawdzenie trasy o znanym przekroju" },
  { id: "dlugosc", label: "Maksymalna długość obwodu", desc: "ile metrów wolno pociągnąć — spadek i zadziałanie zabezpieczenia" },
  { id: "impedancja", label: "Impedancja przewodu", desc: "R, X, Z oraz przewody równoległe" },
  { id: "zwarcie", label: "Prądy zwarciowe", desc: "Ik, prąd udarowy, wytrzymałość cieplna" },
  { id: "petla", label: "Impedancja pętli zwarcia", desc: "ochrona przeciwporażeniowa — układ TN" },
  { id: "uziemienieTT", label: "Rezystancja uziemienia", desc: "ochrona przeciwporażeniowa — układ TT" },
  { id: "uziom", label: "Uziom — dobór geometrii", desc: "pręt, bednarka, otok; potrzebna długość" },
  { id: "rcd", label: "Dobór wyłącznika różnicowoprądowego", desc: "zasady doboru RCD — lista kontrolna, bez obliczeń" },
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

const CEL_ZWARCIA_OPTIONS = (Object.entries(CEL_ZWARCIA_LABELS) as [CelZwarcia, string][]).map(([value, label]) => ({
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
const TYP_WKLADKI_OPTIONS = (Object.entries(TYP_WKLADKI_LABELS) as [TypWkladkiGG, string][]).map(([value, label]) => ({ value, label }));

// Z `limitSpadkuPct`, tej samej funkcji, którą liczy dobór obwodu i Rozdzielnica — te
// cztery liczby były tu wpisane ręcznie (6/8%), a dobór dawał 5/7%, więc ta sama
// instalacja miała dwa różne limity w dwóch kalkulatorach (audyt 2026-11-04, B7).
const LIMIT_SPADKU_OPCJE = [
  { value: String(limitSpadkuPct(true)), label: `${limitSpadkuPct(true)}% — oświetlenie (sieć publiczna)` },
  { value: String(limitSpadkuPct(false)), label: `${limitSpadkuPct(false)}% — pozostałe odbiorniki (sieć publiczna)` },
  { value: String(limitSpadkuPct(true, true)), label: `${limitSpadkuPct(true, true)}% — oświetlenie (własna stacja trafo)` },
  { value: String(limitSpadkuPct(false, true)), label: `${limitSpadkuPct(false, true)}% — pozostałe (własna stacja trafo)` },
];

export function CalculatorsTab() {
  // Stan (wejścia i lista odbiorników w bilansie mocy) mieszka w osobnym,
  // trwałym store'zie (`useCalculatorsStore`, localStorage) — bez tego
  // wszystko znikało przy zmianie zakładki albo odświeżeniu strony. Selektory
  // pojedynczych pól (zamiast jednego selektora zwracającego obiekt) to ten
  // sam wzorzec co `useProjectStore` w całej aplikacji — każdy komponent
  // subskrybuje tylko to, co faktycznie czyta.
  const zapisanyActiveCalc = useCalculatorsStore((s) => s.activeCalc);
  const zapisaneOstatnie = useCalculatorsStore((s) => s.ostatnieKalkulatory);
  const zwinieteGrupy = useCalculatorsStore((s) => s.zwinieteGrupy);
  const [frazaSzukania, setFrazaSzukania] = useState("");
  const circuitKind = useCalculatorsStore((s) => s.circuitKind);
  const power = useCalculatorsStore((s) => s.power);
  const phase = useCalculatorsStore((s) => s.phase);
  const cosphi = useCalculatorsStore((s) => s.cosphi);
  const length = useCalculatorsStore((s) => s.length);
  const layingMethod = useCalculatorsStore((s) => s.layingMethod);
  const ambientC = useCalculatorsStore((s) => s.ambientC);
  const bundleCount = useCalculatorsStore((s) => s.bundleCount);
  const motorStart = useCalculatorsStore((s) => s.motorStart);
  const trybObwodu = useCalculatorsStore((s) => s.trybObwodu);
  const obwodZsOhm = useCalculatorsStore((s) => s.obwodZsOhm);
  const obwodIkA = useCalculatorsStore((s) => s.obwodIkA);
  const obwodCzasS = useCalculatorsStore((s) => s.obwodCzasS);
  const obwodI2tA2s = useCalculatorsStore((s) => s.obwodI2tA2s);
  const spadekWlzPct = useCalculatorsStore((s) => s.spadekWlzPct);
  const wlasnaStacja = useCalculatorsStore((s) => s.wlasnaStacja);
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
  const mdPhase = useCalculatorsStore((s) => s.mdPhase);
  const mdCurrentA = useCalculatorsStore((s) => s.mdCurrentA);
  const mdSection = useCalculatorsStore((s) => s.mdSection);
  const mdSectionPE = useCalculatorsStore((s) => s.mdSectionPE);
  const mdMaterial = useCalculatorsStore((s) => s.mdMaterial);
  const mdIzolacja = useCalculatorsStore((s) => s.mdIzolacja);
  const mdCurve = useCalculatorsStore((s) => s.mdCurve);
  const mdInA = useCalculatorsStore((s) => s.mdInA);
  const mdZsPrzed = useCalculatorsStore((s) => s.mdZsPrzed);
  const mdLimitPct = useCalculatorsStore((s) => s.mdLimitPct);
  const mdPlanowana = useCalculatorsStore((s) => s.mdPlanowana);
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
  const ggIz = useCalculatorsStore((s) => s.ggIz);
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
  const ksCosfi = useCalculatorsStore((s) => s.ksCosfi);
  const zCurve = useCalculatorsStore((s) => s.zCurve);
  const zIn = useCalculatorsStore((s) => s.zIn);
  const zMeasured = useCalculatorsStore((s) => s.zMeasured);
  // Zapis sprzed listy mógł mieć wartość spoza szeregu (np. 17) — liczymy i pokazujemy tę samą.
  const zInSzereg: number = (BREAKER_RATINGS as readonly number[]).includes(zIn) ? zIn : 16;
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
  /**
   * Który kalkulator jest otwarty — z pierwszeństwem dla ADRESU.
   *
   * Trzy źródła, w tej właśnie kolejności:
   *  1. parametr z URL („/kalkulatory/spadek") — bo link przysłany przez kogoś ma
   *     otworzyć TO, co w nim jest, a nie to, co akurat siedzi w localStorage;
   *  2. wartość zapisana z poprzedniej wizyty — wejście na samo „/kalkulatory"
   *     wraca tam, gdzie się skończyło;
   *  3. pierwsza pozycja listy — patrz komentarz o białym ekranie wyżej.
   */
  const [route, nawiguj] = useRoute();
  const zParamu = dopasujParam(
    route.tab === "kalkulatory" ? route.param : null,
    CALC_LIST.map((c) => c.id)
  );
  /**
   * `null` = ekran startowy z kafelkami.
   *
   * Wejscie na samo „/kalkulatory" przekierowywalo wczesniej do OSTATNIO otwartego
   * kalkulatora, wiec ktos, kto wchodzil tu pierwszy raz, ladowal w „Doborze obwodu"
   * bez pojecia, ze obok jest siedemnascie innych narzedzi. Pamiec o ostatnim
   * kalkulatorze zostaje — ale jako SKROT na ekranie startowym, nie jako przekierowanie.
   */
  const activeCalc: CalcId | null = zParamu ?? null;

  /**
   * Doprowadza adres do postaci KANONICZNEJ. Trzy przypadki, jeden warunek:
   * wejście na samo „/kalkulatory", parametr wskazujący na nieistniejący kalkulator
   * oraz poprawny, ale inaczej zapisany („/kalkulatory/ggwkladka" zamiast
   * „…/gGWkladka" — patrz `dopasujParam`). W każdym z nich w pasku ma zostać jedna,
   * przewidywalna postać adresu, bo to ją użytkownik skopiuje i wyśle dalej.
   *
   * `replace`, nie `push`: użytkownik nigdzie nie przeszedł, więc „wstecz" nie ma go
   * zawracać na adres, który natychmiast przekieruje z powrotem.
   */
  useEffect(() => {
    if (route.tab !== "kalkulatory") return;
    // Stary adres czterech scalonych kalkulatorow: ustaw tryb i przejdz na „obwod".
    const tryb = route.param ? STARE_ADRESY[route.param] : undefined;
    if (tryb) {
      patch({ trybObwodu: tryb });
      nawiguj("kalkulatory", "obwod", { replace: true });
      return;
    }
    // Brak parametru to WIDOK, nie brak danych — nie ma czego prostowac.
    if (activeCalc && route.param !== activeCalc) nawiguj("kalkulatory", activeCalc, { replace: true });
  }, [route.tab, route.param, activeCalc, nawiguj, patch]);

  /**
   * Tryb w adresie jako `?tryb=…`.
   *
   * Query trzymamy poza routerem (`useRoute` czyta sama sciezke), bo tryb nie jest
   * osobnym widokiem, tylko ustawieniem jednego kalkulatora — ale MA byc w adresie,
   * zeby dalo sie przyslac komus link prosto do „Mam przekroj" i zeby przekierowania
   * ze starych adresow mialy dokad prowadzic.
   */
  const trybWzietyZAdresu = useRef(false);
  useEffect(() => {
    if (route.tab !== "kalkulatory" || activeCalc !== "obwod") return;
    const zAdresu = new URLSearchParams(window.location.search).get("tryb");
    // Adres ustawia tryb TYLKO przy wejściu. Bez tego ograniczenia kliknięcie
    // w zakładkę trybu było natychmiast cofane przez `?tryb=` z paska — adres
    // wygrywał z użytkownikiem i przełącznik wyglądał na zepsuty.
    if (!trybWzietyZAdresu.current) {
      trybWzietyZAdresu.current = true;
      const znany = TRYBY_OBWODU.find((t) => t === zAdresu);
      if (znany && znany !== trybObwodu) {
        patch({ trybObwodu: znany });
        return;
      }
    }
    if (zAdresu !== trybObwodu) {
      window.history.replaceState(null, "", `${window.location.pathname}?tryb=${trybObwodu}`);
    }
  }, [route.tab, route.param, activeCalc, trybObwodu, patch]);

  // Wybór z listy tylko NAWIGUJE — zapisem zajmuje się efekt niżej, jedną drogą dla
  // wszystkich sposobów otwarcia kalkulatora.
  const setActiveCalc = (v: CalcId) => nawiguj("kalkulatory", v);

  /**
   * Zapamiętuje otwarty kalkulator na kolejną wizytę (samo „/kalkulatory" wraca do
   * niego zamiast do pierwszej pozycji listy).
   *
   * Zapis siedzi w EFEKCIE, a nie w obsłudze kliknięcia, bo kalkulator otwiera się
   * na dwa sposoby: klikiem w listę i wprost z adresu — a link przysłany przez kogoś
   * to też „ostatnio używany". Przy zapisie tylko przy kliknięciu wejście z linku na
   * „/kalkulatory/zwarcie", a potem na samo „/kalkulatory", odsyłało do czegoś zupełnie
   * innego, mimo że pomiędzy nie było żadnego wyboru.
   */
  useEffect(() => {
    if (route.tab !== "kalkulatory" || !activeCalc) return;
    // Lista ostatnich: najswiezszy na przodzie, bez powtorzen, maksymalnie trzy —
    // dluzsza przestaje byc skrotem i staje sie druga lista wszystkiego.
    const ostatnie = [activeCalc, ...zapisaneOstatnie.filter((id) => id !== activeCalc)].slice(0, 3);
    const bezZmian = ostatnie.length === zapisaneOstatnie.length && ostatnie.every((id, i) => id === zapisaneOstatnie[i]);
    if (!bezZmian) patch({ ostatnieKalkulatory: ostatnie });
    if (zapisanyActiveCalc !== activeCalc) patch({ activeCalc });
  }, [route.tab, activeCalc, zapisanyActiveCalc, zapisaneOstatnie, patch]);
  const setCircuitKind = (v: CircuitKind) => patch({ circuitKind: v });
  const setPower = (v: number) => patch({ power: v });
  const setPhase = (v: "1" | "3") => patch({ phase: v });
  const setCosphi = (v: number) => patch({ cosphi: v });
  const setLength = (v: number) => patch({ length: v });
  const setLayingMethod = (v: LayingMethod) => patch({ layingMethod: v });
  const setAmbientC = (v: number) => patch({ ambientC: v });
  const setBundleCount = (v: number) => patch({ bundleCount: v });
  const setMotorStart = (v: boolean) => patch({ motorStart: v });
  const setObwodZsOhm = (v: number) => patch({ obwodZsOhm: v });
  const setObwodIkA = (v: number) => patch({ obwodIkA: v });
  const setObwodCzasS = (v: number) => patch({ obwodCzasS: v });
  const setObwodI2tA2s = (v: number) => patch({ obwodI2tA2s: v });
  const setSpadekWlzPct = (v: number) => patch({ spadekWlzPct: v });
  const setWlasnaStacja = (v: boolean) => patch({ wlasnaStacja: v });
  const setBreakerSection = (v: number) => patch({ breakerSection: v });
  const setDuCurrentA = (v: number) => patch({ duCurrentA: v });
  const setDuPhase = (v: "1" | "3") => patch({ duPhase: v });
  const setDuLength = (v: number) => patch({ duLength: v });
  const setDuSection = (v: number) => patch({ duSection: v });
  const setDuLimitPct = (v: number) => patch({ duLimitPct: v });
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
        spadek_wlz_pct: spadekWlzPct,
        wlasna_stacja: wlasnaStacja,
      }),
    [circuitKind, power, phase, cosphi, length, layingMethod, ambientC, bundleCount, motorStart, spadekWlzPct, wlasnaStacja]
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

  // --- maksymalna długość obwodu ---
  const maksDlugosc = useMemo(
    () =>
      obliczMaksymalnaDlugosc({
        uklad: mdPhase === "3" ? "3f" : "1f",
        napiecie_V: mdPhase === "3" ? 400 : U0,
        prad_A: mdCurrentA,
        material: mdMaterial,
        izolacja: mdIzolacja,
        przekroj_mm2: mdSection,
        przekrojPE_mm2: mdSectionPE,
        charakterystyka: mdCurve,
        In_A: mdInA,
        Zs_przed_Ohm: mdZsPrzed,
        limitSpadku_pct: mdLimitPct,
        dlugoscPlanowana_m: mdPlanowana,
      }),
    [mdPhase, mdCurrentA, mdMaterial, mdIzolacja, mdSection, mdSectionPE, mdCurve, mdInA, mdZsPrzed, mdLimitPct, mdPlanowana]
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
        Iz_A: ggIz > 0 ? ggIz : undefined,
      }),
    [ggTyp, ggIb, ggUklad, ggObwodOdbiorczy, ggSprawdzZs, ggZmierzonaZs, ggIz]
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

  // --- 3. bilans mocy ---
  const balance = useMemo(() => calcPowerBalance(devices, ks, ksCosfi), [devices, ks, ksCosfi]);
  const bledyBilansu = useMemo(() => bledyBilansuMocy(devices, ks, ksCosfi), [devices, ks, ksCosfi]);

  // Ta zakładka NIE czyta projektowanej instalacji — świadomie. Kalkulatory (tak samo
  // jak Protokoły pomiarowe) są narzędziem OBOK przepływu 1→2→3→4, a nie jego krokiem:
  // elektryk liczy tu przekrój dla roboty, która z otwartym rzutem nie ma nic wspólnego.
  // Były tu trzy zejścia do `useProjectStore` — „Wczytaj z projektu" w bilansie mocy
  // i „Wczytaj obwód z projektu" w doborze przekroju oraz w pętli zwarcia — usunięte,
  // bo zamieniały samodzielne narzędzie w akcesorium aktualnie rysowanego budynku.
  // Jedyne wczytanie, jakie tu zostaje, biegnie MIĘDZY kalkulatorami („Wczytaj
  // z bilansu mocy" w WLZ) i nie wyprowadza zakładki poza jej własne dane.

  // --- 3. impedancja pętli zwarcia ---
  const zCalc = useMemo(() => {
    const { ia, zsMax } = zsMaxForBreaker(zCurve, zInSzereg);
    /**
     * Prąd zwarcia liczony z Cmin = 0,95, nie z pełnego U0.
     *
     * Tu sprawdza się OCHRONĘ PRZECIWPORAŻENIOWĄ, a jej najgorszym przypadkiem jest
     * prąd NAJMNIEJSZY — ten, przy którym zabezpieczenie ma najtrudniej zadziałać.
     * Liczenie Ik z pełnych 230 V zawyżało go o 5% i mogło pokazać margines, którego
     * w rzeczywistości nie ma (PN-EN 60909-0; ten sam współczynnik co w `zsMaxDlaIa`).
     */
    const ik = zMeasured > 0 ? (C_NAPIECIOWE.min * U0) / zMeasured : 0;
    const zsZalecana = zsMax * ZAPAS_POMIAROWY;
    const zmierzona = zMeasured > 0 && zsMax > 0;
    return {
      ia,
      zsMax,
      zsZalecana,
      ik,
      ok: zmierzona ? zMeasured <= zsMax : null,
      // Drugi próg: wynik pomiaru bierze się z jednej chwili i zimnego przewodu,
      // a warunek ma być spełniony także po nagrzaniu i przy gorszym napięciu.
      okZalecany: zmierzona ? zMeasured <= zsZalecana : null,
      margines: zmierzona ? (1 - zMeasured / zsMax) * 100 : null,
    };
  }, [zCurve, zInSzereg, zMeasured]);

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

  /**
   * Cztery kryteria dla AKTYWNEGO trybu — wspolna stopka scalonego kalkulatora.
   *
   * Tryby przekroj/zabezpieczenie/WLZ jada tym samym silnikiem (`lib/panel/sizing.ts`),
   * wiec ocena idzie po jego wyniku. Tryb „pelny dobor" ma wlasny silnik z szersza
   * dziedzina (Al, XLPE, kabel w gruncie) i liczy kryteria sam — tu tylko
   * przepisujemy jego werdykt na te sama liste, zeby uzytkownik widzial ZAWSZE
   * te same cztery pozycje, niezaleznie od trybu.
   */
  const kryteriaObwodu = useMemo<OcenaKryterium[]>(() => {
    const dodatkowe = {
      Zs_Ohm: obwodZsOhm > 0 ? obwodZsOhm : undefined,
      Ik_A: obwodIkA > 0 ? obwodIkA : undefined,
      czas_s: obwodCzasS > 0 ? obwodCzasS : undefined,
      I2t_A2s: obwodI2tA2s > 0 ? obwodI2tA2s : undefined,
      material: "Cu" as const,
      izolacja: "PVC" as const,
    };
    if (trybObwodu === "pelny") {
      const w = pelnyDobor.wartosci;
      if (!w) return ocenKryteria({ ...dodatkowe, Ib_A: null, In_A: null, Iz_A: null, spadek_pct: null, spadek_limit_pct: 5, Zs_max_Ohm: null, przekroj_mm2: null });
      return (Object.keys(KRYTERIUM_LABELS) as (keyof typeof KRYTERIUM_LABELS)[]).map((k) => {
        const kr = w.kryteria[k];
        return {
          kryterium: k,
          etykieta: KRYTERIUM_LABELS[k],
          // Kryterium OCENIONE jest w tym trybie zawsze spelnione — silnik bierze
          // najwiekszy z wymaganych przekrojow, wiec wynik z definicji przechodzi
          // kazde ze sprawdzonych kryteriow. Ryzykiem jest tu tylko kryterium
          // POMINIETE, i to widac po stanie „nieoceniono".
          stan: kr.ocenione ? ("ok" as const) : ("nieoceniono" as const),
          opis: kr.ocenione
            ? `wymaga min. ${formatLiczba(kr.minPrzekroj_mm2 ?? 0, 2)} mm² — dobrano ${formatLiczba(w.przekroj_mm2, 1)} mm²`
            : (kr.powod_pominiecia ?? "Brak danych do oceny."),
          // Zapas liczony w przekroju: ile brakuje wymaganej zyle do dobranej.
          // Bez tego pasek werdyktu nie mial w tym trybie czego pokazac.
          margines_pct:
            kr.ocenione && kr.minPrzekroj_mm2 !== null && w.przekroj_mm2 > 0
              ? (1 - kr.minPrzekroj_mm2 / w.przekroj_mm2) * 100
              : undefined,
        };
      });
    }
    if (trybObwodu === "zabezpieczenie") {
      // Dobor do znanego przekroju nie liczy spadku (przekroj jest dana, nie wynikiem),
      // ale wszystkie skladniki sa pod reka — liczymy go tym samym wzorem co reszta.
      const drop = length > 0 && sized.Ib_A ? voltageDropPct(length, sized.Ib_A, breakerSection, phase) : null;
      return ocenKryteria({
        ...dodatkowe,
        Ib_A: sized.Ib_A,
        In_A: sizedBreaker.aparat?.In_A ?? null,
        Iz_A: sizedBreaker.Iz_A,
        spadek_pct: drop,
        spadek_limit_pct: limitSpadkuPct(circuitKind === "oswietlenie", wlasnaStacja),
        Zs_max_Ohm: sizedBreaker.Zs_max_Ohm,
        Ia_A: sizedBreaker.Ia_A,
        przekroj_mm2: breakerSection,
      });
    }
    if (trybObwodu === "wlz") {
      return ocenKryteria({
        ...dodatkowe,
        Ib_A: wlzCurrentA,
        In_A: sizedFeeder.aparat?.In_A ?? null,
        Iz_A: sizedFeeder.Iz_A,
        spadek_pct: sizedFeeder.spadek_napiecia_pct,
        spadek_limit_pct: sizedFeeder.spadek_napiecia_limit_pct,
        // WLZ nie dobiera aparatu pod warunek zwarciowy — to zadanie obwodow za
        // rozdzielnica, wiec kryterium zostaje nieocenione zamiast udawac wynik.
        Zs_max_Ohm: null,
        przekroj_mm2: sizedFeeder.przekroj_mm2,
      });
    }
    return ocenKryteria({
      ...dodatkowe,
      Ib_A: sized.Ib_A,
      In_A: sized.aparat?.In_A ?? null,
      Iz_A: sized.Iz_A,
      spadek_pct: sized.spadek_calkowity_pct,
      spadek_limit_pct: sized.spadek_napiecia_limit_pct,
      Zs_max_Ohm: sized.Zs_max_Ohm,
      Ia_A: sized.Ia_A,
      przekroj_mm2: sized.przekroj_mm2,
    });
  }, [trybObwodu, sized, sizedBreaker, sizedFeeder, pelnyDobor, breakerSection, length, phase, circuitKind, wlasnaStacja, wlzCurrentA, obwodZsOhm, obwodIkA, obwodCzasS, obwodI2tA2s]);

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

  // `null` przy ekranie startowym — patrz `activeCalc` wyżej. Tytuły kart czytają
  // z tego obiektu, więc renderują się tylko razem z wybranym kalkulatorem.
  const active = CALC_LIST.find((c) => c.id === activeCalc) ?? CALC_LIST[0];

  return (
    /*
     * Pola na wąskim ekranie mają 16 px. Safari na iPhonie przy stuknięciu w pole
     * z mniejszą czcionką przybliża stronę i sam jej już nie oddala — przy kalkulatorze
     * z czternastoma polami oznaczało to ręczne oddalanie po każdym z nich. Jeden
     * selektor na korzeniu zamiast klasy w każdym polu: `.x input` wygrywa z `text-sm`
     * na samym polu, a nowe pola dostają to same.
     */
    <div className="space-y-5 max-md:[&_:is(input,select,textarea)]:text-base">
      <div>
        <h2 className="pe-display text-xl mb-1">Kalkulatory elektryczne</h2>
        <p className="text-sm text-slate-500">
          Szybkie, orientacyjne obliczenia pomocnicze do wstępnego projektowania instalacji.
        </p>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
        {/* Lista boczna: wyszukiwarka nad grupami. `sticky`, bo przy osiemnastu
            pozycjach i długim wyniku wybór kolejnego kalkulatora wymagał wcześniej
            przewinięcia całej strony z powrotem do góry.

            Na ekranie startowym jej NIE MA: te same pozycje są tam kafelkami, więc
            lista obok byłaby drugą kopią tej samej nawigacji — i zabierałaby jedną
            trzecią szerokości, która przydaje się kafelkom.

            Poniżej `lg` znika na rzecz `WyborKalkulatoraMobile`: przy zawijaniu
            siadała nad treścią i spychała właściwy kalkulator dwa ekrany w dół.

            Wysokość najwyżej okna: przyklejona lista wyższa od ekranu chowała dolne
            pozycje pod jego krawędzią. Jeśli po rozwinięciu wszystkich grup nadal się
            nie mieści, przewija się sama lista, a wyszukiwarka zostaje na górze. */}
        {activeCalc && (
        <div
          className="hidden self-start lg:sticky lg:top-4 lg:flex lg:max-h-[calc(100vh-2rem)] lg:flex-col"
          style={{ width: 260, flexShrink: 0, flexGrow: 0 }}
          data-testid="lista-kalkulatorow"
        >
          <SzukajkaKalkulatorow
            fraza={frazaSzukania}
            onZmien={setFrazaSzukania}
            liczbaWynikow={filtruj(CALC_LIST, frazaSzukania).length}
          />
          <div className="-mx-1 min-h-0 overflow-y-auto px-1 pb-1">
          <ListaKalkulatorow
            zwarta
            lista={CALC_LIST}
            aktywny={activeCalc}
            fraza={frazaSzukania}
            zwiniete={zwinieteGrupy as GrupaId[]}
            onPrzelaczGrupe={(id) =>
              patch({
                zwinieteGrupy: zwinieteGrupy.includes(id)
                  ? zwinieteGrupy.filter((g) => g !== id)
                  : [...zwinieteGrupy, id],
              })
            }
            onWybierz={setActiveCalc}
          />
          </div>
        </div>
        )}

        {/* Kalkulator najwyżej 60rem. Na całą szerokość przy 1920 px pole „Moc" na
            „2000" miało 700 px, jednostka „W" stała daleko za nim, a „Rachunek krok po
            kroku" ciągnął się w wierszach po 200 znaków. Ekran startowy (bez listy
            bocznej) zostaje szeroki — tam miejsce zajmują kafelki w trzech kolumnach. */}
        <div style={{ flex: "1 1 480px", minWidth: 320, maxWidth: activeCalc ? "60rem" : undefined }} data-testid="kalkulator">
          {activeCalc && (
            <WyborKalkulatoraMobile
              lista={CALC_LIST}
              aktywny={activeCalc}
              fraza={frazaSzukania}
              onZmienFraze={setFrazaSzukania}
              zwiniete={zwinieteGrupy as GrupaId[]}
              onPrzelaczGrupe={(id) =>
                patch({
                  zwinieteGrupy: zwinieteGrupy.includes(id)
                    ? zwinieteGrupy.filter((g) => g !== id)
                    : [...zwinieteGrupy, id],
                })
              }
              onWybierz={setActiveCalc}
            />
          )}
          {/* Bez wybranego kalkulatora pokazujemy, CO tu w ogóle jest — zamiast
              wrzucać w ostatnio otwarty, którego nowy użytkownik nie wybierał. */}
          {!activeCalc && (
            <>
              <div className="mb-4 max-w-sm">
                <SzukajkaKalkulatorow
                  fraza={frazaSzukania}
                  onZmien={setFrazaSzukania}
                  liczbaWynikow={filtruj(CALC_LIST, frazaSzukania).length}
                />
              </div>
              <EkranStartowy
                lista={filtruj(CALC_LIST, frazaSzukania)}
                ostatnie={frazaSzukania.trim() ? [] : zapisaneOstatnie}
                onWybierz={setActiveCalc}
              />
            </>
          )}
          {/* Przelacznik trybu STOI NAD karta trybu, a nie w niej: to wybor pytania,
              nie jedno z pol formularza. Cztery dawne kalkulatory (przekroj,
              zabezpieczenie, WLZ, pelny dobor) pytaly o to samo z czterech stron. */}
          {activeCalc === "obwod" && (
            <div className="pe-card mb-4 p-4">
              <PrzelacznikTrybu tryb={trybObwodu} onZmien={(t) => patch({ trybObwodu: t })} />
            </div>
          )}
          {activeCalc === "obwod" && trybObwodu === "przekroj" && (
            <Card title={active.label} tag="przekrój żyły">
              <div className={UKLAD_POLA_WYNIK}>
                <div className="min-w-0">
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
                            className={`flex w-full items-start gap-2.5 rounded-md px-2 py-1.5 text-left ${on ? "bg-blueprint-tlo" : "hover:bg-slate-50"}`}
                          >
                            <span
                              className="pe-mono shrink-0 text-xs font-semibold"
                              style={{ color: on ? "#2D5A8C" : "#8A5526" }}
                            >
                              {e.cos.toFixed(2).replace(".", ",")}
                            </span>
                            <span className="text-xs leading-snug text-slate-600">{e.odbiorniki}</span>
                          </button>
                        );
                      })}
                      <div className="px-2 pb-1 pt-1.5 text-xs leading-relaxed text-slate-500">
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
                  <label className="mb-3 flex items-center gap-2 text-sm text-slate-600">
                    <input
                      type="checkbox"
                      checked={motorStart}
                      onChange={(e) => setMotorStart(e.target.checked)}
                      className="h-4 w-4 rounded border-border"
                    />
                    Odbiornik z rozruchem silnikowym (pompa, lodówka, klimatyzacja) — charakterystyka C
                  </label>

                  {/* Budżet spadku napięcia dotyczy CAŁEJ drogi od złącza. Te dwa pola
                      domykają rachunek: pierwsze odejmuje to, co zjadła już WLZ, drugie
                      podnosi limit tam, gdzie transformator stoi na terenie obiektu. */}
                  <div className="grid gap-x-4 sm:grid-cols-2">
                    <Field
                      label="Spadek napięcia na WLZ"
                      value={spadekWlzPct}
                      onChange={(v) => setSpadekWlzPct(Number(v))}
                      unit="%"
                      step="0.1"
                      hint="Ile z budżetu spadku zużywa już odcinek od złącza do rozdzielnicy. Typowo 0,5-1%. Limit 3/5% liczy się od ZŁĄCZA, więc obwód odbiorczy ma do dyspozycji resztę — zostaw 0, jeśli liczysz sam obwód."
                    />
                  </div>
                  <label className="mb-3 flex items-center gap-2 text-sm text-slate-600">
                    <input
                      type="checkbox"
                      checked={wlasnaStacja}
                      onChange={(e) => setWlasnaStacja(e.target.checked)}
                      className="h-4 w-4 rounded border-border"
                    />
                    Zasilanie z własnej stacji transformatorowej — limit spadku 6% oświetlenie / 8% pozostałe (zamiast 3% / 5%)
                  </label>

                </div>
                <div className="min-w-0" data-testid="wynik-obok">
                  <WynikGlowny
                    data-testid="wynik-doboru"
                    wartosci={
                      sized.przekroj_mm2
                        ? [
                            { etykieta: "Przekrój żyły", wartosc: String(sized.przekroj_mm2).replace(".", ","), jednostka: "mm²" },
                            ...(sized.aparat
                              ? [
                                  {
                                    etykieta: "Wyłącznik nadprądowy",
                                    wartosc: (
                                      <>
                                        {sized.aparat.charakterystyka}
                                        {sized.aparat.In_A} {sized.aparat.bieguny}
                                      </>
                                    ),
                                  },
                                ]
                              : []),
                          ]
                        : []
                    }
                  >
                    {sized.przekroj_mm2 ? (
                      <>
                        {/* Dwa wyniki na równi: przekrój i aparat. Dotąd karta pokazywała sam
                            przekrój, a wyłącznik — połowę wyniku tego kalkulatora — trzeba było
                            wyczytać z kryteriów („In 20 A"), bez charakterystyki i biegunów
                            (audyt 2026-11-04, B11). */}
                        <div className="flex gap-2 flex-wrap">
                          <Badge variant="info"  title="Typ wyłącznika różnicowoprądowego wymagany dla tego odbiornika">
                            {circuitKind === "gniazda" ? "RCD 30 mA " : "RCD "}typ {sized.rcd_typ}
                          </Badge>
                          {sized.Zs_max_Ohm !== null && (
                            <Badge variant="success">Zs max {formatLiczba(sized.Zs_max_Ohm, 2)} Ω</Badge>
                          )}
                        </div>
                        <div className="mt-2 flex gap-2 flex-wrap">
                          <Badge variant="accent">{sized.kabel}</Badge>
                          <Badge variant="info">Ib {formatLiczba((sized.Ib_A ?? 0), 2)} A</Badge>
                          <Badge variant="success">obc. dop. {sized.Iz_A} A</Badge>
                          {sized.spadek_napiecia_pct !== null && (
                            // Z podanym spadkiem na WLZ pokazujemy SUMĘ — bo to ona jest
                            // porównywana z limitem — i rozbicie, żeby było widać, skąd wyszła.
                            <Badge>
                              {sized.spadek_wlz_pct > 0
                                ? `ΔU ${formatLiczba(sized.spadek_calkowity_pct, 2)}% = WLZ ${formatLiczba(sized.spadek_wlz_pct, 2)}% + obwód ${formatLiczba(sized.spadek_napiecia_pct, 2)}% (limit ${sized.spadek_napiecia_limit_pct}%)`
                                : `ΔU ${formatLiczba(sized.spadek_napiecia_pct, 2)}% (limit ${sized.spadek_napiecia_limit_pct}%)`}
                            </Badge>
                          )}
                        </div>
                      </>
                    ) : (
                      <Alert variant="caution" role="note">
                        nie udało się dobrać — zobacz komunikat niżej
                      </Alert>
                    )}
                  </WynikGlowny>

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
                            className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left ${on ? "bg-blueprint-tlo" : "hover:bg-slate-50"}`}
                          >
                            <span
                              className="min-w-0 flex-1 truncate text-xs"
                              style={on ? { color: "#2D5A8C", fontWeight: 600 } : { color: "#4F5D73" }}
                            >
                              {row.label}
                            </span>
                            <span className="pe-mono shrink-0 text-xs text-slate-500">
                              {row.Iz !== null ? `${formatLiczba(row.Iz, row.Iz % 1 === 0 ? 0 : 1)} A` : "—"}
                            </span>
                            <span
                              className="pe-mono w-16 shrink-0 text-right text-xs font-semibold"
                              style={{ color: on ? "#2D5A8C" : "#8A5526" }}
                            >
                              {row.przekroj !== null ? `${String(row.przekroj).replace(".", ",")} mm²` : "—"}
                            </span>
                          </button>
                        );
                      })}
                      <div className="px-2 pb-1 pt-1.5 text-xs leading-relaxed text-slate-500">
                        Kolumny: obciążalność po współczynnikach i wynikający z niej przekrój. Ciepło musi mieć dokąd uciec —
                        przewód natynkowy chłodzi się powietrzem, a ten w ścianie ocieplonej termicznie praktycznie nie oddaje
                        ciepła, więc uniesie najmniej. Pomylenie tych dwóch przypadków to najczęstszy sposób na przegrzanie
                        przewodu w domu energooszczędnym.
                      </div>
                    </div>
                  </div>

                  {sized.ostrzezenia.length > 0 && (
                    <div className="mt-2 space-y-1.5">
                      {/* role="note": lista odświeża się przy każdym wpisanym znaku — role="alert" czytałby KAŻDĄ pozycję przerywając czytnik */}
                      {sized.ostrzezenia.map((w, i) => (
                        <Alert key={i} role="note" variant={w.level === "error" ? "danger" : "caution"}>
                          {w.message}
                        </Alert>
                      ))}
                    </div>
                  )}
                </div>
              </div>

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
                  "Wyłącznik i typ RCD stoją w wyniku obok przekroju. Gdy przekrój jest już przesądzony (przewód leży w ścianie), przełącz na tryb „Mam przekrój” — dobierze sam wyłącznik z warunkiem Ib ≤ In ≤ Iz.",
                  "Wynik jest orientacyjny/edukacyjny — dobór do realizacji i odbioru wykonuje osoba z uprawnieniami, z uwzględnieniem rzeczywistej trasy kabla i warunków otoczenia.",
                ]}
              />
            </Card>
          )}

          {activeCalc === "obwod" && trybObwodu === "zabezpieczenie" && (
            <Card title={active.label} tag="wyłącznik nadprądowy">
              <div className={UKLAD_POLA_WYNIK}>
                <div className="min-w-0">
                  <Alert variant="info" role="note" className="mb-3 text-xs">
                    Przekrój jest tu <strong>daną wejściową</strong> — dobierasz wyłącznik do przewodu, który już leży albo
                    został narzucony projektem. Jeśli dopiero szukasz przekroju, przełącz na tryb „Szukam przekroju”;
                    oba tryby dzielą te same pola, więc nic nie trzeba przepisywać.
                  </Alert>

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
                      hint="Współczynnik mocy odbiornika — z tabliczki znamionowej. Nie znasz wartości? Zobacz podpowiedź w kalkulatorze „Dobór obwodu”: 1,0 dla grzałek, niżej dla silników i elektroniki."
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
                  <label className="mb-3 flex items-center gap-2 text-sm text-slate-600">
                    <input
                      type="checkbox"
                      checked={motorStart}
                      onChange={(e) => setMotorStart(e.target.checked)}
                      className="h-4 w-4 rounded border-border"
                    />
                    Odbiornik z rozruchem silnikowym (pompa, lodówka, klimatyzacja) — charakterystyka C
                  </label>

                </div>
                <div className="min-w-0" data-testid="wynik-obok">
                  <WynikGlowny
                    wartosci={
                      sizedBreaker.aparat
                        ? [
                            {
                              etykieta: "Dobrany wyłącznik nadprądowy",
                              wartosc: (
                                <>
                                  {sizedBreaker.aparat.charakterystyka}
                                  {sizedBreaker.aparat.In_A} {sizedBreaker.aparat.bieguny}
                                </>
                              ),
                            },
                          ]
                        : []
                    }
                  >
                    {sizedBreaker.aparat ? (
                      <>
                        <div className="flex gap-2 flex-wrap">
                          <Badge variant="info">Ib {formatLiczba(sizedBreaker.Ib_A, 2)} A</Badge>
                          <Badge variant="success">Iz {sizedBreaker.Iz_A} A</Badge>
                          <Badge>
                            metoda {sizedBreaker.metoda_odniesienia} · k1 {sizedBreaker.wspolczynniki.k1_temperatura} · k2{" "}
                            {sizedBreaker.wspolczynniki.k2_grupowanie}
                          </Badge>
                        </div>
                      </>
                    ) : (
                      <Alert variant="caution" role="note">
                        nie udało się dobrać — zobacz komunikat niżej
                      </Alert>
                    )}
                  </WynikGlowny>

                  {/* Warunek Ib ≤ In ≤ Iz rozpisany na trzy liczby obok siebie: to JEDYNY
                      warunek doboru zabezpieczenia i cały sens tego kalkulatora, więc ma
                      być widoczny wprost, a nie do odtworzenia z chipów wyżej. */}
                  {sizedBreaker.aparat && (
                    <Alert variant="success" role="note" className="mt-2 items-start">
                      <div>
                        Warunek doboru spełniony:{" "}
                        <strong className="pe-mono">
                          {formatLiczba(sizedBreaker.Ib_A, 2)} A ≤ {sizedBreaker.aparat.In_A} A ≤ {sizedBreaker.Iz_A} A
                        </strong>{" "}
                        (Ib ≤ In ≤ Iz) — wyłącznik zadziała, zanim przewód się przegrzeje.
                      </div>
                    </Alert>
                  )}

                  {sizedBreaker.Ia_A !== null && sizedBreaker.Zs_max_Ohm !== null && (
                    <WynikGlowny
                      wartosci={[
                        { etykieta: "Prąd zadziałania Ia", wartosc: formatLiczba(sizedBreaker.Ia_A, 0), jednostka: "A" },
                        { etykieta: "Wymagana Zs max", wartosc: formatLiczba(sizedBreaker.Zs_max_Ohm, 2), jednostka: "Ω", ton: "akcent" },
                      ]}
                    />
                  )}

                  {sizedBreaker.ostrzezenia.length > 0 && (
                    <div className="mt-2 space-y-1.5">
                      {sizedBreaker.ostrzezenia.map((w, i) => (
                        <Alert key={i} role="note" variant={w.level === "error" ? "danger" : "caution"}>
                          {w.message}
                        </Alert>
                      ))}
                    </div>
                  )}
                </div>
              </div>

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
                  "Ten sam silnik doboru co „Dobór obwodu” i zakładka Rozdzielnica — dla tych samych danych wszystkie trzy miejsca podadzą ten sam aparat.",
                ]}
              />
            </Card>
          )}

          {activeCalc === "obwod" && trybObwodu === "pelny" && (
            <Card title={active.label} tag="4 kryteria naraz">
              <div className={UKLAD_POLA_WYNIK}>
                <div className="min-w-0">
                  <Alert variant="info" role="note" className="mb-3 text-xs">
                    Cztery kryteria liczone NIEZALEŻNIE — obciążalność, spadek napięcia i (opcjonalnie) ochrona
                    przeciwporażeniowa oraz wytrzymałość zwarciowa. Wynikowy przekrój to <strong>maksimum</strong> z nich, nie
                    pierwszy z brzegu. Tylko obwody <strong>3-fazowe</strong> — tablica dla dwóch żył obciążonych (1-fazowe)
                    nie została jeszcze dostarczona.
                  </Alert>

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
                      hint="Współczynnik mocy odbiornika — z tabliczki znamionowej. Nie znasz wartości? Zobacz podpowiedź w kalkulatorze „Dobór obwodu”: 1,0 dla grzałek, niżej dla silników i elektroniki."
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
                    <div className="mb-3 text-xs leading-relaxed text-slate-500">
                      Metoda gruntowa — bez korekty temperatury/grupowania (brak tablic dla gruntu). Wynik ważny dla 20°C w
                      gruncie.
                    </div>
                  )}
                  <label className="mb-3 flex items-center gap-2 text-sm text-slate-600">
                    <input type="checkbox" checked={pdRozruch} onChange={(e) => patch({ pdRozruch: e.target.checked })} className="h-4 w-4 rounded border-border" />
                    Odbiornik z rozruchem silnikowym — charakterystyka C
                  </label>

                  <label className="mb-2 flex items-center gap-2 text-sm text-slate-600">
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

                  <label className="mb-2 flex items-center gap-2 text-sm text-slate-600">
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
                      <label className="mb-3 flex items-center gap-2 text-sm text-slate-600">
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

                </div>
                <div className="min-w-0" data-testid="wynik-obok">
                  {pelnyDobor.wartosci && (
                    <WynikGlowny
                      wartosci={[
                        { etykieta: "Przekrój wynikowy", wartosc: formatLiczba(pelnyDobor.wartosci.przekroj_mm2, 1), jednostka: "mm²" },
                      ]}
                    >
                      <div className="flex gap-2 flex-wrap">
                        <Badge variant="accent">{pelnyDobor.wartosci.kabel}</Badge>
                        <Badge variant="info">In {pelnyDobor.wartosci.In_A} A</Badge>
                        <Badge variant="success">
                          decyduje: {pelnyDobor.wartosci.decydujace.map((k) => KRYTERIUM_LABELS[k]).join(" i ")}
                        </Badge>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-slate-500">
                        {(Object.entries(pelnyDobor.wartosci.kryteria) as [string, (typeof pelnyDobor.wartosci.kryteria)[keyof typeof pelnyDobor.wartosci.kryteria]][]).map(
                          ([k, v]) => (
                            <Badge key={k}>
                              {KRYTERIUM_LABELS[k as keyof typeof KRYTERIUM_LABELS]}:{" "}
                              {v.ocenione ? `${formatLiczba(v.minPrzekroj_mm2!, 1)} mm²` : "nieocenione"}
                            </Badge>
                          )
                        )}
                      </div>
                    </WynikGlowny>
                  )}
                  <CalcResultView wynik={pelnyDobor} />
                </div>
              </div>
            </Card>
          )}

          {activeCalc === "gGWkladka" && (
            <Card title={active.label} tag="wkładka topikowa">
              <Alert variant="info" role="note" className="mb-3 text-xs">
                Imax i Zs max pochodzą wprost z tablicy czasowo-prądowej wkładki (Poradnik Projektanta Elektryka,
                tabl. Z.10.3/Z.10.4) — NIE ze wzoru k×In jak dla wyłączników. Tablica pokrywa czasy 0,2 s / 0,4 s / 5 s;
                nie zawiera 1 s (obwód rozdzielczy w układzie TT) ani 0,1 s.
              </Alert>

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
                <label className="flex items-center gap-2 text-sm text-slate-600 mt-1">
                  <input
                    type="checkbox"
                    checked={ggObwodOdbiorczy}
                    onChange={(e) => patch({ ggObwodOdbiorczy: e.target.checked })}
                    className="h-4 w-4 rounded border-border"
                  />
                  Obwód odbiorczy (≤ 32 A) — inaczej rozdzielczy
                </label>
              </div>

              <label className="mb-2 flex items-center gap-2 text-sm text-slate-600">
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
              <Field
                label="Obciążalność przewodu Iz"
                value={ggIz}
                onChange={(v) => patch({ ggIz: Number(v) })}
                unit="A"
                step="0.5"
                hint="Obciążalność długotrwała przewodu za wkładką, już po współczynnikach temperatury i grupowania — np. z kalkulatora „Dobór obwodu”. Do warunku przeciążeniowego I₂ ≤ 1,45·Iz. 0 = nie sprawdzaj."
              />

              {ggWkladka.wartosci && (
                <WynikGlowny
                  wartosci={[
                    {
                      etykieta: "Dobrana wkładka",
                      wartosc: (
                        <>
                          {TYP_WKLADKI_LABELS[ggTyp]}, In {ggWkladka.wartosci.In_A} A
                        </>
                      ),
                    },
                  ]}
                >
                  <div className="flex gap-2 flex-wrap">
                    <Badge variant="info">czas {CZAS_GG_LABELS[ggWkladka.wartosci.czas_s === 0.2 ? "0.2" : ggWkladka.wartosci.czas_s === 0.4 ? "0.4" : "5"]}</Badge>
                    <Badge variant="accent">Imax (Ia) {formatLiczba(ggWkladka.wartosci.Imax_A, 1)} A</Badge>
                    <Badge variant="success">Zs max {formatLiczba(ggWkladka.wartosci.ZsMax_ohm, 3)} Ω</Badge>
                    <Badge variant="info">I₂ {formatLiczba(ggWkladka.wartosci.I2_A, 1)} A — wymaga Iz ≥ {formatLiczba(ggWkladka.wartosci.I2_A / 1.45, 1)} A</Badge>
                  </div>
                </WynikGlowny>
              )}
              <CalcResultView wynik={ggWkladka} />
            </Card>
          )}

          {activeCalc === "spadek" && (
            <Card title={active.label} tag="sprawdzenie trasy">
              <Alert variant="info" role="note" className="mb-3 text-xs">
                Ten kalkulator sprawdza trasę o <strong>znanym przekroju</strong> — np. kabel, który już jest ułożony
                albo narzucony z góry. Jeśli dopiero dobierasz przewód, użyj „Dobór obwodu”: tam przekrój
                jest wynikiem, dobieranym pod obciążalność i spadek naraz.
              </Alert>

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
                  hint="Współczynnik mocy odbiornika — z tabliczki znamionowej. Nie znasz wartości? Zobacz podpowiedź w kalkulatorze „Dobór obwodu”: 1,0 dla grzałek, niżej dla silników i elektroniki."
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
              <label className="mb-3 flex items-center gap-2 text-sm text-slate-600">
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
                <WynikGlowny
                  wartosci={[
                    { etykieta: "Spadek napięcia na trasie", wartosc: formatLiczba(spadekPelny.wartosci.spadek_pct, 2), jednostka: "%" },
                  ]}
                >
                  <div className="flex gap-2 flex-wrap">
                    <Badge variant="accent">ΔU {formatLiczba(spadekPelny.wartosci.spadek_V, 2)} V</Badge>
                    <Badge variant="info">
                      napięcie u odbiornika {formatLiczba(spadekPelny.wartosci.napiecieKoncowe_V, 1)} V
                    </Badge>
                    {spadekPelny.wartosci.minPrzekroj_mm2 !== null && (
                      <Badge variant="success">
                        min. przekrój w limicie {String(spadekPelny.wartosci.minPrzekroj_mm2).replace(".", ",")} mm²
                      </Badge>
                    )}
                  </div>
                </WynikGlowny>
              )}

              <CalcResultView wynik={spadekPelny} />
            </Card>
          )}

          {activeCalc === "dlugosc" && (
            <Card title={active.label} tag="granica trasy">
              <Alert variant="info" role="note" className="mb-3 text-xs">
                Odwrotność „Spadku napięcia": tam podajesz długość i patrzysz na wynik, tutaj dostajesz{" "}
                <strong>granicę wprost</strong>. Liczone są dwa warunki naraz — spadek napięcia i zadziałanie
                zabezpieczenia przy zwarciu na końcu trasy — a wiąże ten, który wypada krócej.
              </Alert>

              <div className="grid gap-x-4 sm:grid-cols-2">
                <Field label="Zasilanie" value={mdPhase} onChange={(v) => patch({ mdPhase: v as "1" | "3" })} options={PHASE_OPTIONS} />
                <Field
                  label="Prąd obliczeniowy (Ib)"
                  value={mdCurrentA}
                  onChange={(v) => patch({ mdCurrentA: Number(v) })}
                  unit="A"
                  step="0.1"
                  hint="Prąd, jaki popłynie trasą przy pełnym obciążeniu. Do warunku spadku napięcia — im większy, tym krótsza dopuszczalna trasa."
                />
                <Field
                  label="Przekrój żyły fazowej"
                  value={String(mdSection)}
                  onChange={(v) => patch({ mdSection: Number(v) })}
                  options={SZEREG_PELNY_OPTIONS}
                />
                <Field
                  label="Przekrój żyły ochronnej PE"
                  value={String(mdSectionPE)}
                  onChange={(v) => patch({ mdSectionPE: Number(v) })}
                  options={SZEREG_PELNY_OPTIONS}
                  hint="Pętla zwarciowa idzie fazą TAM i przewodem PE Z POWROTEM, więc cieńszy PE skraca dopuszczalną trasę. W przewodach YDY/YKY o przekroju do 16 mm² PE ma zwykle taki sam przekrój jak faza."
                />
                <Field label="Materiał żyły" value={mdMaterial} onChange={(v) => patch({ mdMaterial: v as Material })} options={MATERIAL_OPTIONS} />
                <Field
                  label="Izolacja (temperatura pracy)"
                  value={mdIzolacja}
                  onChange={(v) => patch({ mdIzolacja: v as Izolacja })}
                  options={IZOLACJA_OPTIONS}
                />
                <Field
                  label="Charakterystyka zabezpieczenia"
                  value={mdCurve}
                  onChange={(v) => patch({ mdCurve: v as "B" | "C" | "D" })}
                  options={[
                    { value: "B", label: "B (5×In)" },
                    { value: "C", label: "C (10×In)" },
                    { value: "D", label: "D (20×In)" },
                  ]}
                  hint="Krotność GÓRNEJ granicy pasma wyzwalania magnetycznego. Charakterystyka C wymaga dwa razy mniejszej impedancji pętli niż B, więc skraca dopuszczalną trasę o połowę."
                />
                <Field
                  label="Prąd znamionowy zabezpieczenia (In)"
                  value={mdInA}
                  onChange={(v) => patch({ mdInA: Number(v) })}
                  unit="A"
                />
                <Field
                  label="Impedancja pętli przed odcinkiem"
                  value={mdZsPrzed}
                  onChange={(v) => patch({ mdZsPrzed: Number(v) })}
                  unit="Ω"
                  step="0.01"
                  hint="Impedancja od transformatora do rozdzielnicy, z której wychodzi ten obwód — zmierzona miernikiem pętli albo z kalkulatora „Prądy zwarciowe”. Dla domu jednorodzinnego typowo 0,2–0,8 Ω."
                />
                <Field
                  label="Dopuszczalny spadek napięcia"
                  value={String(mdLimitPct)}
                  onChange={(v) => patch({ mdLimitPct: Number(v) })}
                  options={LIMIT_SPADKU_OPCJE}
                  hint="Budżet dla TEGO odcinka. Jeśli spadek zjada już WLZ, odejmij go tutaj — limit normy dotyczy całej drogi od złącza."
                />
                <Field
                  label="Planowana długość trasy"
                  value={mdPlanowana}
                  onChange={(v) => patch({ mdPlanowana: Number(v) })}
                  unit="m"
                  hint="Trasa, którą chcesz poprowadzić — to ją oceniamy względem wyliczonej granicy. Mierz drogę przewodu, a nie odległość w linii prostej."
                />
              </div>

              {maksDlugosc.wartosci && (
                <WynikGlowny
                  wartosci={[
                    { etykieta: "Maksymalna długość trasy", wartosc: formatLiczba(maksDlugosc.wartosci.L_max_m, 1), jednostka: "m" },
                  ]}
                >
                  <div className="flex flex-wrap gap-2">
                    {/* Obie granice OBOK siebie, nie tylko ta wiążąca: dopiero z nich
                        widać, co poprawić — grubszą żyłę czy inne zabezpieczenie. */}
                    <Badge variant={maksDlugosc.wartosci.wiazace === "spadek" ? "accent" : "info"}>
                      spadek napięcia {formatLiczba(maksDlugosc.wartosci.L_spadek_m, 1)} m
                    </Badge>
                    <Badge variant={maksDlugosc.wartosci.wiazace === "ochrona" ? "accent" : "info"}>
                      samoczynne wyłączenie {formatLiczba(maksDlugosc.wartosci.L_ochrona_m, 1)} m
                    </Badge>
                    <Badge variant="success">
                      Zs max {formatLiczba(maksDlugosc.wartosci.Zs_max_Ohm, 2)} Ω przy Ia {formatLiczba(maksDlugosc.wartosci.Ia_A, 0)} A
                    </Badge>
                  </div>
                </WynikGlowny>
              )}

              <CalcResultView wynik={maksDlugosc} />

              <HowItWorks
                formulas={[
                  {
                    label: "Granica ze spadku napięcia",
                    eq: "L ≤ ΔU_dop · S / (k · Ib · ρ)",
                    where: "k = 2 dla 1 fazy, √3 dla 3 faz; ΔU_dop = limit% · U",
                  },
                  {
                    label: "Granica z samoczynnego wyłączenia",
                    eq: "L ≤ (Zs_max − Z_przed) / (ρ · (1/S_L + 1/S_PE))",
                    where: "Zs_max = 0,95 · U₀ / Ia, Ia = krotność górna × In",
                  },
                ]}
                notes={[
                  "Warunek cieplny (S ≥ Ik·√t/k) nie ogranicza długości — dłuższy obwód to mniejszy prąd zwarcia, czyli mniejsze obciążenie cieplne żyły. Ogranicza ją za to zdolność zabezpieczenia do zadziałania, i to jest właśnie drugi z liczonych tu warunków.",
                  "Obwód zabezpieczony wyłącznikiem różnicowoprądowym spełnia warunek samoczynnego wyłączenia niezależnie od impedancji pętli, więc realną granicą zostaje wtedy sam spadek napięcia.",
                  "Prąd przyjęty jako skupiony na końcu trasy. Dla linii z odbiorami rozłożonymi po drodze (np. oprawy oświetleniowe) granica jest większa — policz taką trasę w kalkulatorze „Spadek napięcia”, który liczy sumę momentów prądowych.",
                  "Rachunek pomija reaktancję, więc od 35 mm² kalkulator odmawia liczenia zamiast podawać wynik zaniżony — tak samo jak „Spadek napięcia” w metodzie uproszczonej.",
                ]}
              />
            </Card>
          )}

          {activeCalc === "zwarcie" && (
            <Card title={active.label} tag="PN-EN 60909">
              <Alert variant="info" role="note" className="mb-3 text-xs">
                Współczynnik napięciowy <strong>c wynika z celu obliczenia</strong>, a nie z osobnego pola: do doboru
                aparatów liczy się najgorszy przypadek największego prądu (c = 1,05), a do ochrony przeciwporażeniowej —
                najmniejszego (c = 0,95). Pomylenie ich daje wynik pozornie poprawny i całkowicie nieprzydatny.
              </Alert>

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
                <WynikGlowny
                  wartosci={[
                    { etykieta: "Prąd zwarcia trójfazowego", wartosc: formatLiczba(zwarcie.wartosci.Ik3_A / 1000, 2), jednostka: "kA" },
                  ]}
                >
                  <div className="flex gap-2 flex-wrap">
                    <Badge variant="accent">Zt {formatLiczba(trafo.wartosci.Zt_ohm * 1000, 2)} mΩ</Badge>
                    <Badge variant="info">Ik2 {formatLiczba(zwarcie.wartosci.Ik2_A / 1000, 2)} kA</Badge>
                    {zwarcie.wartosci.Ik1_A !== null && (
                      <Badge variant="info">Ik1 {formatLiczba(zwarcie.wartosci.Ik1_A, 0)} A</Badge>
                    )}
                    {zwarcie.wartosci.ip_A !== null && (
                      <Badge variant="success">ip {formatLiczba(zwarcie.wartosci.ip_A / 1000, 2)} kA</Badge>
                    )}
                    <Badge>
                      c = {formatLiczba(zwarcie.wartosci.c, 2)}
                    </Badge>
                  </div>
                  <div className="mt-2 text-xs leading-relaxed text-slate-500">
                    Wymagana zdolność zwarciowa aparatu w tym miejscu: Icn ≥{" "}
                    <strong>{formatLiczba(zwarcie.wartosci.Ik3_A / 1000, 2)} kA</strong> (dobieraj z c = 1,05).
                  </div>
                </WynikGlowny>
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
                <WynikGlowny
                  wartosci={[
                    { etykieta: "Minimalny przekrój ze względu na zwarcie", wartosc: formatLiczba(wytrzymalosc.wartosci.minPrzekroj_mm2, 2), jednostka: "mm²" },
                  ]}
                >
                  <div className="flex gap-2 flex-wrap">
                    <Badge variant="accent">k = {wytrzymalosc.wartosci.k}</Badge>
                    {wytrzymalosc.wartosci.maksCzas_s !== null && (
                      <Badge variant="info">
                        t max dla {String(zwPrzekroj).replace(".", ",")} mm² = {formatLiczba(wytrzymalosc.wartosci.maksCzas_s, 3)} s
                      </Badge>
                    )}
                  </div>
                </WynikGlowny>
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
                <WynikGlowny
                  wartosci={[
                    { etykieta: "Rezystancja uziemienia", wartosc: formatLiczba(uziom.wartosci.R_wypadkowa_ohm, 2), jednostka: "Ω" },
                  ]}
                >
                  <div className="flex gap-2 flex-wrap">
                    {uzLiczba > 1 && (
                      <Badge variant="accent">
                        pojedynczy {formatLiczba(uziom.wartosci.R_pojedynczy_ohm, 2)} Ω
                      </Badge>
                    )}
                    {uziom.wartosci.potrzebnaDlugosc_m !== null && (
                      <Badge variant="success">
                        długość dla {formatLiczba(uzWymagana, 0)} Ω: {formatLiczba(uziom.wartosci.potrzebnaDlugosc_m, 1)} m
                      </Badge>
                    )}
                  </div>
                </WynikGlowny>
              )}
              <CalcResultView wynik={uziom} />
            </Card>
          )}

          {activeCalc === "bilansFaz" && (
            <Card title={active.label} tag="asymetria i przewód N">
              <Alert variant="info" role="note" className="mb-3 text-xs">
                Przy odbiorach nieliniowych (zasilacze impulsowe, LED, falowniki) 3. harmoniczna sumuje się w przewodzie
                neutralnym <strong>arytmetycznie</strong>, zamiast się znosić — prąd w N potrafi wtedy przekroczyć prąd
                fazowy nawet przy idealnie symetrycznym obciążeniu. W przewodzie N nie ma wyłącznika, więc nic tego
                przeciążenia nie wyłapie.
              </Alert>

              <div className="space-y-2 mb-3">
                {/* Na wąskim ekranie wiersz łamie się na dwa: nazwa i faza, pod nimi moc,
                    cos φ i kosz (`order`). W jednym rzędzie pięć pól ściskało nazwę do
                    pustego kwadracika ok. 26 px; z fazą w drugim rzędzie ucinało „L1".
                    Kreska między odbiorami, bo przy dwóch liniach na odbiór sam odstęp
                    nie mówił, która moc należy do której nazwy. */}
                {bfOdbiory.map((o) => (
                  <div key={o.id} className="flex flex-wrap items-center gap-2 border-b border-border pb-2 last:border-0 last:pb-0 sm:border-0 sm:pb-0 sm:flex-nowrap">
                    <input
                      className="pe-input text-sm order-1 min-w-0 flex-1 basis-40 sm:order-none sm:basis-auto"
                      aria-label="Nazwa odbioru"
                      value={o.nazwa}
                      onChange={(e) => setOdbioryFazowe((ds) => ds.map((x) => (x.id === o.id ? { ...x, nazwa: e.target.value } : x)))}
                    />
                    <input
                      className="pe-input text-sm order-3 w-20 pe-mono sm:order-none"
                      type="number"
                      aria-label={`Moc: ${o.nazwa}`}
                      title="Moc czynna odbioru [W] — z tabliczki znamionowej."
                      value={o.mocW}
                      onChange={(e) => setOdbioryFazowe((ds) => ds.map((x) => (x.id === o.id ? { ...x, mocW: Number(e.target.value) } : x)))}
                    />
                    <span className="order-3 text-xs text-slate-400 sm:order-none">W</span>
                    <input
                      className="pe-input text-sm order-3 w-16 pe-mono sm:order-none"
                      type="number"
                      step="0.05"
                      aria-label={`cos φ: ${o.nazwa}`}
                      title="Współczynnik mocy odbiornika — z tabliczki znamionowej (1,0 dla grzałek, niżej dla silników i elektroniki)."
                      value={o.cosfi}
                      onChange={(e) => setOdbioryFazowe((ds) => ds.map((x) => (x.id === o.id ? { ...x, cosfi: Number(e.target.value) } : x)))}
                    />
                    <select
                      // Stałe w-28: pole z własną strzałką (padding-right 2rem) potrzebuje ok. 112 px,
                      // żeby najdłuższa opcja („3-fazowy”) się mieściła — i przy 16 px (telefon), i
                      // przy 14 px (od md); węższe w-24 ucinało napis (zmierzone: 57 px tekstu na 52 px).
                      className="pe-input pe-select order-2 w-28 sm:order-none text-base md:text-sm"
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
                    <button
                      onClick={() => setOdbioryFazowe((ds) => ds.filter((x) => x.id !== o.id))}
                      aria-label={`Usuń odbiór: ${o.nazwa}`}
                      className="order-3 ml-auto sm:order-none sm:ml-0 [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11 flex items-center justify-center text-slate-400 hover:text-red-500"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Button variant="secondary" size="sm"
                  onClick={() =>
                    setOdbioryFazowe((ds) => [...ds, { id: crypto.randomUUID(), nazwa: "Nowy odbiór", mocW: 1000, cosfi: 1, faza: "L1" }])
                  }
                >
                  <Plus size={13} /> Dodaj odbiór
                </Button>
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
                <WynikGlowny
                  wartosci={[
                    { etykieta: "Prąd w przewodzie neutralnym", wartosc: formatLiczba(bilansFaz.wartosci.IN_calkowity_A, 2), jednostka: "A" },
                  ]}
                >
                  <div className="flex gap-2 flex-wrap">
                    <Badge variant="accent">
                      L1 {formatLiczba(bilansFaz.wartosci.prady.L1, 1)} A · L2 {formatLiczba(bilansFaz.wartosci.prady.L2, 1)} A · L3{" "}
                      {formatLiczba(bilansFaz.wartosci.prady.L3, 1)} A
                    </Badge>
                    <Badge variant="info">asymetria {formatLiczba(bilansFaz.wartosci.asymetria_pct, 1)}%</Badge>
                    <Badge variant="success">S {formatLiczba(bilansFaz.wartosci.S_VA / 1000, 2)} kVA</Badge>
                    <Badge>
                      cosφ {formatLiczba(bilansFaz.wartosci.cosfi, 3)}
                    </Badge>
                  </div>
                </WynikGlowny>
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
                <WynikGlowny
                  wartosci={[
                    { etykieta: "Prąd znamionowy silnika", wartosc: formatLiczba(silnik.wartosci.In_A, 2), jednostka: "A" },
                  ]}
                >
                  <div className="flex gap-2 flex-wrap">
                    <Badge variant="accent">prąd rozruchowy {formatLiczba(silnik.wartosci.Ir_A, 1)} A</Badge>
                    {slRozruch === "gwiazda_trojkat" && (
                      <Badge variant="info">
                        przy DOL byłoby {formatLiczba(silnik.wartosci.Ir_bezposredni_A, 1)} A
                      </Badge>
                    )}
                    <Badge variant="info">stycznik AC-3 ≥ {formatLiczba(silnik.wartosci.stycznikAC3_A, 1)} A</Badge>
                    {silnik.wartosci.klasaWyzwalania && (
                      <Badge variant="success">przekaźnik klasy {silnik.wartosci.klasaWyzwalania}</Badge>
                    )}
                    <Badge>
                      moment {formatLiczba(silnik.wartosci.momentWzgledny * 100, 0)}% momentu przy DOL
                    </Badge>
                  </div>
                </WynikGlowny>
              )}
              <CalcResultView wynik={silnik} />
            </Card>
          )}

          {activeCalc === "impedancja" && <KalkulatorImpedancji label={active.label} />}

          {activeCalc === "peN" && <KalkulatorPeN label={active.label} />}

          {activeCalc === "spd" && <KalkulatorSPD label={active.label} />}

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

              <label className="mb-3 flex items-center gap-2 text-sm text-slate-600">
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
                <WynikGlowny
                  wartosci={[
                    { etykieta: "Napięcie stringu w zimnie", wartosc: formatLiczba(stringPV.wartosci.VocZimny_V, 1), jednostka: "V" },
                  ]}
                >
                  <div className="flex gap-2 flex-wrap">
                    <Badge variant="accent">I projektowy (1,25×Isc) {formatLiczba(stringPV.wartosci.IprojektowyA, 2)} A</Badge>
                    <Badge variant="info">spadek DC {formatLiczba(stringPV.wartosci.spadekDC_pct, 2)}%</Badge>
                    {stringPV.wartosci.VmppGoracy_V !== null && (
                      <Badge variant="success">Vmpp w upale {formatLiczba(stringPV.wartosci.VmppGoracy_V, 1)} V</Badge>
                    )}
                  </div>
                </WynikGlowny>
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
                <WynikGlowny wartosci={[]}>
                  {/* Dotąd ten blok to podpis i znaczniki, bez jednej liczby: nie dopisujemy wartości,
                      której kalkulator nie pokazywał, więc podpis zostaje małym tekstem nad znacznikami. */}
                  <div className="mb-1 text-sm text-slate-500">Przewód i zabezpieczenie AC</div>
                  <div className="flex gap-2 flex-wrap">
                    <Badge variant="accent">{falownikAC.kabel}</Badge>
                    <Badge variant="info">
                      wyłącznik {falownikAC.aparat.charakterystyka}
                      {falownikAC.aparat.In_A} {falownikAC.aparat.bieguny}
                    </Badge>
                  </div>
                </WynikGlowny>
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

              <label className="mb-3 flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={evWbudowanaOchronaDC}
                  onChange={(e) => patch({ evWbudowanaOchronaDC: e.target.checked })}
                  className="h-4 w-4 rounded border-border"
                />
                Ładowarka ma wbudowaną ochronę przed prądem upływu stałym (RDC-DD)
              </label>

              {obwodEV.wartosci && (
                <WynikGlowny
                  wartosci={[
                    { etykieta: "Prąd obliczeniowy", wartosc: formatLiczba(obwodEV.wartosci.Ib_A, 2), jednostka: "A" },
                  ]}
                >
                  {obwodEV.wartosci.dobor.kabel && obwodEV.wartosci.dobor.aparat ? (
                    <div className="flex gap-2 flex-wrap">
                      <Badge variant="accent">{obwodEV.wartosci.dobor.kabel}</Badge>
                      <Badge variant="info">
                        wyłącznik {obwodEV.wartosci.dobor.aparat.charakterystyka}
                        {obwodEV.wartosci.dobor.aparat.In_A} {obwodEV.wartosci.dobor.aparat.bieguny}
                      </Badge>
                      <Badge variant="success">
                        {obwodEV.wartosci.wymaganyRCD === "typA_wystarczy" ? "RCD typu A wystarczy" : "wymagany RCD typu B / A+RDC-DD"}
                      </Badge>
                    </div>
                  ) : (
                    <Alert variant="caution" role="note">
                      nie udało się dobrać — zobacz ostrzeżenia niżej
                    </Alert>
                  )}
                </WynikGlowny>
              )}

              {obwodEV.wartosci?.dobor.ostrzezenia && obwodEV.wartosci.dobor.ostrzezenia.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  {obwodEV.wartosci.dobor.ostrzezenia.map((o, i) => (
                    <Alert key={i} role="note" variant={o.level === "error" ? "danger" : "caution"}>
                      {o.message}
                    </Alert>
                  ))}
                </div>
              )}
              <CalcResultView wynik={obwodEV} />
            </Card>
          )}

          {activeCalc === "kompensacja" && <KalkulatorKompensacji label={active.label} />}

          {activeCalc === "moc" && (
            <Card title={active.label} tag="bilans mocy">
              <div className="space-y-2 mb-3">
                {/* Na wąskim ekranie nazwa idzie na całą szerokość, a moc i kosz pod nią —
                    w jednym rzędzie kosz wypadał za krawędź ekranu i strona przewijała się
                    w bok (patrz bilans faz, ten sam układ). */}
                {devices.map((d) => (
                  <div key={d.id} className="flex flex-wrap items-center gap-2 border-b border-border pb-2 last:border-0 last:pb-0 sm:border-0 sm:pb-0 sm:flex-nowrap">
                    <input
                      className="pe-input text-sm w-full min-w-0 sm:w-auto sm:flex-1"
                      aria-label="Nazwa odbiornika"
                      value={d.name}
                      onChange={(e) => setDevices((ds) => ds.map((x) => (x.id === d.id ? { ...x, name: e.target.value } : x)))}
                    />
                    <input
                      className="pe-input text-sm w-24 pe-mono"
                      type="number"
                      aria-label={`Moc: ${d.name}`}
                      title="Moc znamionowa tego odbiornika [W] — z tabliczki znamionowej."
                      value={d.power}
                      onChange={(e) => setDevices((ds) => ds.map((x) => (x.id === d.id ? { ...x, power: Number(e.target.value) } : x)))}
                    />
                    <span className="text-xs text-slate-400 w-6">W</span>
                    <button
                      onClick={() => setDevices((ds) => ds.filter((x) => x.id !== d.id))}
                      aria-label={`Usuń odbiornik: ${d.name}`}
                      className="[@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11 flex items-center justify-center ml-auto text-slate-400 hover:text-red-500 sm:ml-0"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Button variant="secondary" size="sm"
                  onClick={() => setDevices((ds) => [...ds, { id: crypto.randomUUID(), name: "Nowy odbiornik", power: 1000 }])}
                >
                  <Plus size={13} /> Dodaj odbiornik
                </Button>
              </div>
              <Field
                label="Współczynnik jednoczesności (ks)"
                value={ks}
                onChange={(v) => setKs(Number(v))}
                step="0.05"
                hint="Odzwierciedla, że nie wszystkie odbiorniki pracują naraz z pełną mocą. Orientacyjnie 0,6–0,8 dla domu jednorodzinnego — im więcej odbiorników, tym niższy. Podnieś go, jeśli masz pompę ciepła, ładowarkę EV albo kuchenkę indukcyjną (te potrafią pracować długo i równocześnie)."
              />
              <Field
                label="Współczynnik mocy cos φ"
                value={ksCosfi}
                onChange={(v) => patch({ ksCosfi: Number(v) })}
                step="0.05"
                hint="Wypadkowy cos φ instalacji. 1 dla odbiorników grzejnych (bojler, kuchenka, grzałki); przy dużym udziale silników, pomp ciepła i zasilaczy przyjmij niższy — prąd rośnie o 1/cos φ."
              />
              {bledyBilansu.length > 0 ? (
                <Alert variant="danger" role="alert" data-testid="bledy-bilansu" className="mt-2">
                  <div className="mb-1 font-semibold">Popraw dane — wynik nie jest liczony:</div>
                  <ul className="list-disc pl-5">
                    {bledyBilansu.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                </Alert>
              ) : (
              <WynikGlowny
                wartosci={[
                  { etykieta: "Moc zainstalowana", wartosc: formatLiczba(balance.sumPower, 0), jednostka: "W" },
                  { etykieta: "Moc zapotrzebowana", wartosc: formatLiczba(balance.demandPower, 0), jednostka: "W", ton: "akcent" },
                  { etykieta: "Prąd — 1-faz.", wartosc: formatLiczba(balance.demandCurrent1, 1), jednostka: "A" },
                  { etykieta: "Prąd — 3-faz.", wartosc: formatLiczba(balance.demandCurrent3, 1), jednostka: "A" },
                ]}
              />
              )}
              <HowItWorks
                formulas={[
                  { label: "Moc zainstalowana", eq: "Pi = ΣP", where: "suma mocy znamionowych wszystkich odbiorników" },
                  { label: "Moc zapotrzebowana (szczytowa)", eq: "Pz = Pi × ks", where: "ks — współczynnik jednoczesności (0 < ks ≤ 1)" },
                  { label: "Prąd zapotrzebowany", eq: "I₁f = Pz / (U · cos φ)   |   I₃f = Pz / (√3 · U · cos φ)", where: "U = 230 V dla 1 fazy, 400 V dla 3 faz" },
                ]}
                notes={[
                  "Lista odbiorników jest wyłącznie Twoja — kalkulator nie zagląda do rysowanego rzutu. Wpisz odbiorniki tej instalacji, którą właśnie liczysz, łącznie z tymi bez widocznego gniazda (np. piekarnik podłączony na stałe).",
                  "Współczynnik jednoczesności odzwierciedla fakt, że nie wszystkie odbiorniki pracują jednocześnie z pełną mocą.",
                  "Wartości orientacyjne ks dla domu jednorodzinnego: 0,6–0,8. Im więcej odbiorników, tym niższy współczynnik.",
                  "Moc zapotrzebowana służy do doboru mocy przyłączeniowej we wniosku do operatora sieci oraz zabezpieczenia przedlicznikowego.",
                  "Dla instalacji z pompą ciepła, ładowarką EV lub kuchenką indukcyjną warto przyjąć wyższy ks — te odbiorniki potrafią pracować równocześnie i długotrwale.",
                  "Domyślnie cos φ = 1 (odbiorniki grzejne). Przy dużym udziale silników, pomp ciepła i zasilaczy wpisz niższy — rzeczywisty prąd jest wyższy o 1/cos φ.",
                  "Kalkulator nie dobiera zabezpieczenia przedlicznikowego ani mocy przyłączeniowej — te ustala operator sieci w warunkach przyłączenia. Podaje moc i prąd, z którymi idzie się do wniosku.",
                ]}
              />
            </Card>
          )}

          {activeCalc === "obwod" && trybObwodu === "wlz" && (
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
                  <Button variant="secondary" size="sm"
                    type="button"
                    onClick={loadWlzCurrentFromBalance}
                    className="-mt-2 mb-3"
                  >
                    <Download size={13} /> Wczytaj z bilansu mocy
                  </Button>
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

              <WynikGlowny wartosci={[]}>
                {sizedFeeder.przekroj_mm2 && sizedFeeder.aparat ? (
                  <div className="flex gap-2 flex-wrap">
                    <Badge variant="accent">{sizedFeeder.kabel}</Badge>
                    <Badge variant="info">
                      wyłącznik {sizedFeeder.aparat.charakterystyka}
                      {sizedFeeder.aparat.In_A} {sizedFeeder.aparat.bieguny}
                    </Badge>
                    <Badge variant="success">obc. dop. {sizedFeeder.Iz_A} A</Badge>
                    {sizedFeeder.spadek_napiecia_pct !== null && (
                      <Badge>
                        ΔU {sizedFeeder.spadek_napiecia_pct}% (limit {sizedFeeder.spadek_napiecia_limit_pct}%)
                      </Badge>
                    )}
                  </div>
                ) : (
                  <Alert variant="caution" role="note">
                    nie udało się dobrać — zobacz komunikat niżej
                  </Alert>
                )}
              </WynikGlowny>

              {sizedFeeder.ostrzezenia.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  {sizedFeeder.ostrzezenia.map((w, i) => (
                    <Alert key={i} role="note" variant={w.level === "error" ? "danger" : "caution"}>
                      {w.message}
                    </Alert>
                  ))}
                </div>
              )}

              <HowItWorks
                formulas={[
                  { label: "Warunek doboru zabezpieczenia", eq: "Ib ≤ In ≤ Iz", where: "Iz = Iz₀ × k1 × k2 — obciążalność po współczynnikach temperatury i grupowania" },
                  { label: "Spadek napięcia — 1-fazowy / 3-fazowy", eq: "ΔU = (2·L·Ib·ρ)/S   |   ΔU = (√3·L·Ib·ρ)/S", where: "ρ = 0,0225 Ω·mm²/m przy 70°C, ten sam wzór co w doborze obwodu odbiorczego" },
                ]}
                notes={[
                  "Ten sam silnik doboru co „Dobór obwodu” i Rozdzielnica (`sizeCircuit`/`sizeFeeder` w `lib/panel/sizing.ts`) — ta sama tablica obciążalności, te same współczynniki poprawkowe.",
                  "Minimalny przekrój WLZ przyjęto na 10 mm² — praktyka projektowa dla domu jednorodzinnego (kabel dźwiga cały budynek), NIE liczba wprost z normy.",
                  "Domyślny limit spadku napięcia na samej WLZ to 2%, węższy niż 3-5% dla obwodu odbiorczego — WLZ to tylko odcinek całej trasy do odbiornika, więc zostawia miejsce na spadek za rozdzielnicą. Można go zmienić powyżej.",
                  "Tablice dotyczą przewodu w budynku (pod tynkiem/w rurce/natynkowo) — NIE kabla ziemnego. Jeśli WLZ biegnie w ziemi od złącza kablowo-pomiarowego, ten kalkulator się nie sprawdzi — potrzebna inna metoda odniesienia.",
                  "„Wczytaj z bilansu mocy” bierze prąd zapotrzebowany (Pz) z kalkulatora „Bilans mocy budynku” dla wybranej tu liczby faz — uzupełnij najpierw listę odbiorników w tamtym kalkulatorze.",
                ]}
              />
            </Card>
          )}

          {/* Wspolna stopka wszystkich trybow: te same cztery kryteria, niezaleznie
              od tego, czym uzytkownik zaczal. Dwa ostatnie wymagaja liczb, ktorych
              dobor nie ma skad wziac sam — sa wiec polami, a nieuzupelnione zostaja
              NIEOCENIONE, nigdy „spelnione". */}
          {activeCalc === "obwod" && (
            <Card title="Cztery kryteria doboru" tag="werdykt">
              {/* Tryb „pełny dobór" ma WŁASNE pola na impedancję i prąd zwarcia
                  (w karcie wyżej, pod checkboxami) i tylko one wchodzą do jego
                  silnika. Te trzy poniżej były dla niego martwe: dawało się je
                  wypełnić, a kryteria dalej pokazywały „nie podano". */}
              {trybObwodu === "pelny" ? (
                <p className="mb-3 text-xs leading-relaxed text-slate-500">
                  Kryteria 3 i 4 włączasz w karcie wyżej — checkboxami „sprawdź ochronę przeciwporażeniową" i „sprawdź
                  wytrzymałość zwarciową". Ten tryb liczy je z impedancji źródła i prądu zwarcia, a nie z gotowej Zs.
                </p>
              ) : (
              <div className="mb-3 grid gap-x-4 sm:grid-cols-2 lg:grid-cols-4">
                <Field
                  label="Impedancja pętli Zs"
                  value={obwodZsOhm}
                  onChange={(v) => setObwodZsOhm(Number(v))}
                  unit="Ω"
                  step="0.01"
                  hint="Zmierzona albo policzona impedancja pętli zwarcia w tym punkcie. Bez niej trzecie kryterium zostaje nieocenione — dobór zna tylko wartość WYMAGANĄ, nie rzeczywistą."
                />
                <Field
                  label="Spodziewany prąd zwarcia Ik"
                  value={obwodIkA}
                  onChange={(v) => setObwodIkA(Number(v))}
                  unit="A"
                  hint="Prąd zwarcia w tym punkcie — z kalkulatora „Prądy zwarciowe” albo z danych operatora. Zostaw 0, a policzy się z impedancji pętli: Ik = 0,95·230 V / Zs."
                />
                <Field
                  label="Czas wyłączenia t"
                  value={obwodCzasS}
                  onChange={(v) => setObwodCzasS(Number(v))}
                  unit="s"
                  step="0.05"
                  hint="RZECZYWISTY czas zadziałania zabezpieczenia przy tym prądzie zwarcia, odczytany z jego charakterystyki — nie dopuszczalny czas z tabl. 41.1. Używany tylko, gdy Ik < Ia; przy Ik ≥ Ia wyłącznik działa elektromagnetycznie (< 0,1 s) i liczy się I²t."
                />
                <Field
                  label="I²t aparatu"
                  value={obwodI2tA2s}
                  onChange={(v) => setObwodI2tA2s(Number(v))}
                  unit="A²s"
                  step="100"
                  hint="Energia przenoszona przez wyłącznik przy tym prądzie zwarcia — z karty katalogowej (wykres I²t albo klasa ograniczenia energii). Potrzebna, gdy Ik ≥ Ia: warunek to k²S² ≥ I²t. 0 = nie podano."
                />
              </div>
              )}
              {/* Werdykt zbiorczy STOI NAD listą kryteriów i przykleja się przy
                  przewijaniu — dotąd był szarym akapitem pod czterema kartami, czyli
                  najmniej widocznym elementem tego, po co się tu w ogóle przychodzi. */}
              <PasekWerdyktu ocena={podsumowanieObwodu(kryteriaObwodu)} />
              <div className="mt-2">
                <KryteriaObwodu oceny={kryteriaObwodu} />
              </div>
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
                {/* Lista szeregu znamionowego zamiast wolnej liczby: pole przyjmowało 17 A
                    albo 0 A, a przy 0 wynik po prostu znikał bez słowa (audyt, B16). */}
                <Field
                  label="Prąd znamionowy In"
                  value={zInSzereg}
                  onChange={(v) => setZIn(Number(v))}
                  unit="A"
                  options={BREAKER_RATINGS.map((r) => ({ value: String(r), label: `${r} A` }))}
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
              <WynikGlowny
                wartosci={[
                  { etykieta: "Prąd zadziałania Ia", wartosc: formatLiczba(zCalc.ia, 0), jednostka: "A" },
                  // Dwa progi obok siebie, nie jeden: pierwszy to granica z normy, drugi —
                  // z jakim zapasem powinien wyjść POMIAR, żeby obwód przeszedł odbiór
                  // także przy nagrzanych przewodach i niższym napięciu sieci.
                  // Brak danych to samo „—” bez jednostki, nie „— Ω”.
                  {
                    etykieta: "Zs max — limit normy",
                    wartosc: zCalc.zsMax ? formatLiczba(zCalc.zsMax, 2) : "—",
                    jednostka: zCalc.zsMax ? "Ω" : undefined,
                    ton: "akcent",
                  },
                  {
                    etykieta: "Zs — limit zalecany (0,8)",
                    wartosc: zCalc.zsZalecana ? formatLiczba(zCalc.zsZalecana, 2) : "—",
                    jednostka: zCalc.zsZalecana ? "Ω" : undefined,
                    ton: "akcent",
                  },
                  {
                    etykieta: "Prąd zwarcia Ik (c = 0,95)",
                    wartosc: zCalc.ik ? formatLiczba(zCalc.ik, 0) : "—",
                    jednostka: zCalc.ik ? "A" : undefined,
                  },
                ]}
              />
              {zMeasured < 0 && (
                <Alert variant="danger" role="alert" className="mt-2">
                  Impedancja pętli zwarcia nie może być ujemna — sprawdź wpisaną wartość. Zostaw 0, żeby zobaczyć samo Zs max
                  bez oceny.
                </Alert>
              )}
              {zCalc.ok !== null && (
                /* role="status" jawnie: werdykt liczy się od nowa przy każdym wciśnięciu klawisza, a domyślny
                  `alert` (wariant danger) czytałby czytnik ekranu na nowo po każdej cyfrze. */
                <Alert variant={!zCalc.ok ? "danger" : zCalc.okZalecany ? "success" : "caution"} role="status" className="mt-2 items-start">
                  <span>
                    {!zCalc.ok
                      ? "Warunek niespełniony — zmierzona Zs przekracza limit normy. Skróć obwód, zwiększ przekrój lub zmień charakterystykę zabezpieczenia."
                      : zCalc.okZalecany
                        ? `Warunek spełniony z zapasem ${formatLiczba(zCalc.margines!, 0)}% — zabezpieczenie zadziała w wymaganym czasie.`
                        : `Mieści się w normie, ale bez zapasu (do limitu ${formatLiczba(zCalc.margines!, 0)}%). Pomiar wykonuje się na zimnym przewodzie, a nagrzany ma większą rezystancję — po obciążeniu obwód może wypaść poza limit.`}
                  </span>
                </Alert>
              )}
              <HowItWorks
                formulas={[
                  { label: "Warunek samoczynnego wyłączenia zasilania", eq: "Zs × Ia ≤ U₀", where: "Zs — impedancja pętli zwarcia [Ω], Ia — prąd zadziałania [A], U₀ = 230 V" },
                  { label: "Maksymalna dopuszczalna impedancja", eq: "Zs max = Cmin × U₀ / Ia", where: "Cmin = 0,95 (PN-EN 60909-0) — wartość, której zmierzona Zs nie może przekroczyć" },
                  { label: "Prąd zadziałania wyzwalacza magnetycznego", eq: "Ia = k × In", where: "k = 5 dla char. B, 10 dla C, 20 dla D (górna granica pasma)" },
                  { label: "Spodziewany prąd zwarcia", eq: "Ik = Cmin × U₀ / Zs", where: "najmniejszy prąd, jaki popłynie przy zwarciu L-PE" },
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
              <WynikGlowny
                wartosci={[
                  { etykieta: "Maksymalna dopuszczalna RA", wartosc: formatLiczba(groundingCheck.raMax, 0), jednostka: "Ω", ton: "akcent" },
                ]}
              />
              {groundingCheck.ok !== null && (
                /* role="status" jawnie: wynik przelicza się przy każdej zmianie pola, a `alert` (wariant danger)
                    przerywałby czytnikowi ekranu przy każdym znaku. */
                <Alert variant={groundingCheck.ok ? "success" : "danger"} role="status" className="mt-2">
                  {groundingCheck.ok
                    ? "Warunek spełniony — RCD zadziała, zanim napięcie dotykowe przekroczy 50 V."
                    : "Warunek niespełniony — zmierzona RA przekracza wartość dopuszczalną. Popraw uziom (dodatkowy uziomik, głębsze wbicie) albo zastosuj RCD o niższym IΔn."}
                </Alert>
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
              <WynikGlowny
                wartosci={[
                  { etykieta: "Wymagany strumień całkowity", wartosc: formatLiczba(lightCalc.requiredLumens, 0), jednostka: "lm" },
                  { etykieta: "Liczba opraw", wartosc: Math.ceil(lightCalc.fixtureCount) || 0, jednostka: "szt.", ton: "akcent" },
                ]}
              />
              <div className="text-xs text-slate-500 mt-2">
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
            <Card title={active.label} tag="lista kontrolna">
              {/* Lista zasad, nie kalkulator — mówimy to wprost, żeby nikt nie szukał tu wyniku.
                  Treść poprawiona po audycie 2026-11-04 (B14): typ A zamiast „AC/A" (spójnie
                  z doborem w Rozdzielnicy), SPD nazwany po imieniu, reguła liczby obwodów
                  oznaczona jako praktyka, a nie wymóg normy. */}
              <p className="mb-3 text-sm text-slate-500">
                Zasady doboru do sprawdzenia przy projekcie — bez obliczeń. Typ RCD dla konkretnego obwodu podaje „Dobór obwodu”
                i tabela doboru w Rozdzielnicy.
              </p>
              <ul className="text-sm space-y-2.5 text-slate-700">
                <li className="flex gap-2">
                  <ChevronRight size={15} className="mt-0.5 shrink-0 text-copper" /> Obwody gniazd wtyczkowych do 32 A — RCD 30 mA (PN-HD 60364-4-41, ochrona uzupełniająca). Typ A jako minimum: zasilacze impulsowe i elektronika w odbiornikach dają prąd różnicowy pulsujący, na który typ AC nie reaguje.
                </li>
                <li className="flex gap-2">
                  <ChevronRight size={15} className="mt-0.5 shrink-0 text-copper" /> Łazienka, kuchnia, tarasy — RCD 30 mA, zalecany osobny obwód i osobna ochrona.
                </li>
                <li className="flex gap-2">
                  <ChevronRight size={15} className="mt-0.5 shrink-0 text-copper" /> Pralka, pompa ciepła i inne odbiorniki z przemiennikiem częstotliwości — typ F albo wg zaleceń producenta. Ładowarka EV i falownik PV, które mogą wprowadzić gładki prąd stały — typ B (albo A z urządzeniem RDC-DD), pod własnym RCD.
                </li>
                <li className="flex gap-2">
                  <ChevronRight size={15} className="mt-0.5 shrink-0 text-copper" /> Praktyka projektowa (nie wymóg normy): kilka obwodów, zwykle do 6–8, na jedną różnicówkę — upływy odbiorników się sumują, a jedno zadziałanie nie powinno odciąć całego domu.
                </li>
                <li className="flex gap-2">
                  <ChevronRight size={15} className="mt-0.5 shrink-0 text-copper" /> Rozważ ogranicznik przepięć (SPD) typu 2 — albo typu 1+2 przy instalacji odgromowej lub zasilaniu napowietrznym — na początku instalacji.
                </li>
              </ul>
              <HowItWorks
                formulas={[
                  { label: "Warunek ochrony przy dotyku pośrednim", eq: "RA × IΔn ≤ UL", where: "RA — rezystancja uziemienia [Ω], IΔn — prąd różnicowy znamionowy [A], UL = 50 V" },
                  { label: "Maksymalna rezystancja uziemienia (RCD 30 mA)", eq: "RA ≤ 50 / 0,03 = 1667 Ω", where: "dlatego w układzie TT z RCD 30 mA wymagania wobec uziemienia są łagodne" },
                  { label: "Dobór prądu znamionowego RCD", eq: "In(RCD) ≥ In zabezpieczenia przed nim", where: "RCD nie ma własnego wyzwalacza nadprądowego — przed przeciążeniem i zwarciem chroni go aparat nadrzędny (tak dobiera go Rozdzielnica)" },
                ]}
                notes={[
                  "Typ AC reaguje tylko na prąd różnicowy sinusoidalny; typ A dodatkowo na pulsujący stały — dziś to praktyczne minimum przy zasilaczach impulsowych i elektronice.",
                  "Typ B jest wymagany m.in. przy ładowarkach pojazdów elektrycznych i falownikach, gdzie może pojawić się gładki prąd stały.",
                  "Rozdzielenie instalacji na kilka RCD ogranicza skutki zadziałania — awaria w jednym obwodzie nie pozbawia zasilania całego domu.",
                  "Prądy upływowe odbiorników sumują się. Zbyt wiele obwodów za jednym RCD 30 mA prowadzi do przypadkowych wyłączeń bez rzeczywistej usterki.",
                  "Wyłącznik różnicowoprądowy należy regularnie testować przyciskiem TEST, z częstotliwością podaną przez producenta — sprawdza to mechanizm wyzwalający, ale nie zastępuje pomiaru prądu i czasu zadziałania w protokole.",
                ]}
              />
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
