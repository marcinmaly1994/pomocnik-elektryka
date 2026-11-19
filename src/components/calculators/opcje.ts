import { REZYSTYWNOSC_GRUNTU, TYP_UZIOMU_LABELS, type TypUziomu } from "@/lib/calc/earthing";
import { SPOSOB_ROZRUCHU_LABELS, type SposobRozruchu } from "@/lib/calc/motor";
import { CEL_ZWARCIA_LABELS, type CelZwarcia } from "@/lib/calc/shortCircuit";
import { METODA_LABELS, type MetodaOdniesienia3 } from "@/lib/norms/ampacity3";
import {
  MODEL_REZYSTYWNOSCI_LABELS,
  RODZAJ_LINII_LABELS,
  RODZAJ_OBWODU_CZASU_LABELS,
  type Izolacja,
  type Material,
  type ModelRezystywnosci,
  type RodzajLinii,
  type RodzajObwoduCzasu,
} from "@/lib/norms/conductors";
import { LAYING_METHOD_LABELS, limitSpadkuPct, SECTIONS, type LayingMethod } from "@/lib/panel/norms";
import type { CircuitKind } from "@/lib/panel/sizing";

/**
 * Listy wyboru wspólne dla kilku kalkulatorów.
 *
 * Wydzielone z `CalculatorsTab` nie dla porządku, tylko z konieczności: kalkulatory
 * przenoszone do własnych plików potrzebują tych samych list, a import z
 * `CalculatorsTab` dałby cykl (to on importuje kalkulatory).
 */

/** Szereg handlowy do kalkulatorów inżynierskich — szerszy niż `SECTIONS`
 *  (te obejmują tylko zakres domowego doboru obwodów, do 25 mm²). */
export const SZEREG_PELNY = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300, 400, 500, 630];

export const SZEREG_PELNY_OPTIONS = SZEREG_PELNY.map((s) => ({
  value: String(s),
  label: `${String(s).replace(".", ",")} mm²`,
}));

export const MATERIAL_OPTIONS: { value: Material; label: string }[] = [
  { value: "Cu", label: "miedź (Cu)" },
  { value: "Al", label: "aluminium (Al)" },
];

export const IZOLACJA_OPTIONS: { value: Izolacja; label: string }[] = [
  { value: "PVC", label: "PVC (70 °C)" },
  { value: "XLPE", label: "XLPE / EPR (90 °C)" },
];

export const RODZAJ_LINII_OPTIONS = (Object.entries(RODZAJ_LINII_LABELS) as [RodzajLinii, string][]).map(
  ([value, label]) => ({ value, label }),
);

export const UKLAD_OPTIONS = [
  { value: "TN", label: "TN" },
  { value: "TT", label: "TT" },
];

// Rodzaj obwodu zamiast pola „obwód odbiorczy (≤ 32 A)": norma ma DWIE granice — gniazda do
// 63 A, odbiorniki stałe do 32 A — więc gniazdo 40–63 A trafiało do rozdzielczych (5 s).
// Granicę sprawdza kalkulator sam, z dobranego In (audyt Kalkulatorów, K3).
export const RODZAJ_OBWODU_OPTIONS = (Object.entries(RODZAJ_OBWODU_CZASU_LABELS) as [RodzajObwoduCzasu, string][]).map(([value, label]) => ({
  value,
  label,
}));
export const RODZAJ_OBWODU_HINT =
  "Czas wyłączenia wg PN-HD 60364-4-41 (411.3.2): 0,4 s w TN (0,2 s w TT) dla obwodów z gniazdami do 63 A i odbiorników przyłączonych na stałe do 32 A; powyżej tych granic i w obwodach rozdzielczych — 5 s (1 s). Granicę prądu kalkulator sprawdza sam z dobranego In.";

export const CIRCUIT_KIND_OPTIONS: { value: CircuitKind; label: string }[] = [
  { value: "oswietlenie", label: "Oświetlenie" },
  { value: "gniazda", label: "Gniazda" },
  { value: "dedykowany", label: "Odbiornik dedykowany" },
];

export const LAYING_METHOD_OPTIONS = (Object.entries(LAYING_METHOD_LABELS) as [LayingMethod, string][]).map(
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
export const COSPHI_EXAMPLES: { cos: number; odbiorniki: string }[] = [
  { cos: 1.0, odbiorniki: "Grzałki, piekarnik, czajnik, bojler, żarówki — odbiorniki czysto rezystancyjne" },
  { cos: 0.95, odbiorniki: "Płyta indukcyjna, ładowarka EV, komputery i RTV z układem PFC" },
  { cos: 0.9, odbiorniki: "Pralka, zmywarka, oprawy LED z porządnym zasilaczem" },
  { cos: 0.85, odbiorniki: "Silniki 3-fazowe przy pełnym obciążeniu, pompa ciepła" },
  { cos: 0.8, odbiorniki: "Klimatyzacja, lodówka, zamrażarka — napęd sprężarki" },
  { cos: 0.7, odbiorniki: "Pompy i wentylatory 1-fazowe, elektronarzędzia" },
  { cos: 0.6, odbiorniki: "Małe silniki 1-fazowe słabo obciążone, świetlówki nieskompensowane" },
];

export const PHASE_OPTIONS = [
  { value: "1", label: "1-fazowe 230V" },
  { value: "3", label: "3-fazowe 400V" },
];

export const SECTION_OPTIONS = SECTIONS.map((s) => ({ value: String(s), label: `${String(s).replace(".", ",")} mm²` }));

export const CEL_ZWARCIA_OPTIONS = (Object.entries(CEL_ZWARCIA_LABELS) as [CelZwarcia, string][]).map(([value, label]) => ({
  value,
  label,
}));

/**
 * Progi dopuszczalnego spadku napięcia (PN-HD 60364-5-52 zał. G) — do szybkiego
 * wyboru zamiast wpisywania liczby z pamięci. Edytowalne, bo bywają zaostrzane
 * warunkami przyłączenia (np. wymóg gminy dla oświetlenia drogowego).
 */
export const TYP_UZIOMU_OPTIONS = (Object.entries(TYP_UZIOMU_LABELS) as [TypUziomu, string][]).map(([value, label]) => ({
  value,
  label,
}));
export const GRUNT_OPTIONS = REZYSTYWNOSC_GRUNTU.map((g) => ({
  value: String(g.typowa),
  label: `${g.nazwa} — ok. ${g.typowa} Ω·m (${g.min}–${g.max})`,
}));
export const ROZRUCH_OPTIONS = (Object.entries(SPOSOB_ROZRUCHU_LABELS) as [SposobRozruchu, string][]).map(([value, label]) => ({
  value,
  label,
}));
export const FAZA_OPTIONS = [
  { value: "L1", label: "L1" },
  { value: "L2", label: "L2" },
  { value: "L3", label: "L3" },
  { value: "3f", label: "3-fazowy" },
];

export const METODA3_OPTIONS = (Object.entries(METODA_LABELS) as [MetodaOdniesienia3, string][]).map(([value, label]) => ({
  value,
  label,
}));
export const MODEL_REZ_OPTIONS =(Object.entries(MODEL_REZYSTYWNOSCI_LABELS) as [ModelRezystywnosci, string][]).map(([value, label]) => ({
  value,
  label,
}));

// Z `limitSpadkuPct`, tej samej funkcji, którą liczy dobór obwodu i Rozdzielnica — te
// cztery liczby były tu wpisane ręcznie (6/8%), a dobór dawał 5/7%, więc ta sama
// instalacja miała dwa różne limity w dwóch kalkulatorach (audyt 2026-11-04, B7).
export const LIMIT_SPADKU_OPCJE = [
  { value: String(limitSpadkuPct(true)), label: `${limitSpadkuPct(true)}% — oświetlenie (sieć publiczna)` },
  { value: String(limitSpadkuPct(false)), label: `${limitSpadkuPct(false)}% — pozostałe odbiorniki (sieć publiczna)` },
  { value: String(limitSpadkuPct(true, true)), label: `${limitSpadkuPct(true, true)}% — oświetlenie (własna stacja trafo)` },
  { value: String(limitSpadkuPct(false, true)), label: `${limitSpadkuPct(false, true)}% — pozostałe (własna stacja trafo)` },
];
