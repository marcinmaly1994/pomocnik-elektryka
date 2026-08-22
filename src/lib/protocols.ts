import type { ProtocolKey } from "@/types";
import { zsMaxForBreaker } from "@/lib/panel/sizing";

export type ProtocolRow = Record<string, string | number | undefined>;

export interface ProtocolColumn {
  key: string;
  label: string;
  w: number;
  type: "text" | "number" | "select" | "computed";
  default?: string | number;
  options?: string[];
  compute?: (row: ProtocolRow) => string;
}

export interface ProtocolDef {
  title: string;
  norm: string;
  intro: string;
  columns?: ProtocolColumn[];
  limitLabel?: string;
  limitDefault?: number;
  limitUnit?: string;
  evaluate?: (row: ProtocolRow, limit: number) => boolean | null;
  checklist?: boolean;
  items?: string[];
  /** Kryteria, które NIE są jedną edytowalną liczbą — np. czasy zadziałania RCD
   *  wynikające z typu wyłącznika. Drukowane w protokole pod kryterium głównym,
   *  żeby dokument mówił wprost, wobec czego oceniono wiersze. */
  extraCriterion?: string;
}

/**
 * Minimalna rezystancja izolacji wg napięcia próby (PN-HD 60364-6, tabl. 6.1):
 * obwody SELV/PELV bada się napięciem 250 V i wymaga 0,5 MΩ, obwody do 500 V —
 * napięciem 500 V i 1,0 MΩ, powyżej 500 V — napięciem 1000 V i 1,0 MΩ.
 *
 * Wcześniej cały protokół miał JEDEN próg, więc obwód SELV zmierzony np. na
 * 0,7 MΩ dostawał werdykt negatywny, mimo że spełnia wymaganie normy.
 */
export function minRezystancjaIzolacji(napiecieProby: number): number {
  return napiecieProby <= 250 ? 0.5 : 1.0;
}

/**
 * Dopuszczalne czasy zadziałania RCD wg PN-EN 61008 / PN-EN 61009.
 *
 * Wyłącznik zwykły: ≤300 ms przy IΔn i ≤40 ms przy 5·IΔn. Wyłącznik selektywny (S)
 * ma zwłokę Z ZAŁOŻENIA — musi zadziałać w 130–500 ms przy IΔn i 50–150 ms przy
 * 5·IΔn. Ocenianie selektywnego progiem 300 ms dawało werdykt negatywny dla
 * poprawnie działającego aparatu.
 */
export function dopuszczalneCzasyRcd(selektywny: boolean): { t1: [number, number]; t5: [number, number] } {
  return selektywny ? { t1: [130, 500], t5: [50, 150] } : { t1: [0, 300], t5: [0, 40] };
}

/**
 * Definicje protokołów pomiarowych — przeniesione 1:1 z wersji JS. Zakres wg
 * PN-HD 60364-6 (kontrola po wykonaniu instalacji i badania okresowe).
 * Każdy protokół deklaruje własne kolumny/kryterium oceny — narzędzie tylko
 * liczy i pilnuje formy, ocenę merytoryczną zawsze podejmuje osoba z uprawnieniami.
 */
export const PROTOCOL_DEFS: Record<ProtocolKey, ProtocolDef> = {
  izolacja: {
    title: "Pomiar rezystancji izolacji",
    norm: "PN-HD 60364-6 zał. D — kontrola po wykonaniu (rezystancja izolacji)",
    intro: "Pomiar wykonano miernikiem rezystancji izolacji przy odłączonym zasilaniu i odłączonych odbiornikach.",
    columns: [
      { key: "obwod", label: "Obwód / miejsce pomiaru", w: 138, type: "text" },
      { key: "u", label: "U pom. [V]", w: 56, type: "select", options: ["250", "500", "1000"], default: "500" },
      { key: "ln", label: "L-N [MΩ]", w: 54, type: "number" },
      { key: "lpe", label: "L-PE [MΩ]", w: 54, type: "number" },
      { key: "npe", label: "N-PE [MΩ]", w: 54, type: "number" },
      {
        key: "rmin",
        label: "R min [MΩ]",
        w: 58,
        type: "computed",
        compute: (r) => minRezystancjaIzolacji(Number(r.u ?? 500)).toFixed(1),
      },
    ],
    // Próg bierze się z napięcia próby (kolumna „R min"), a nie z tego pola. Zostaje
    // ono jako WŁASNE, ostrzejsze wymaganie — np. gdy zleceniodawca stawia wyższą
    // poprzeczkę niż norma. Zero znaczy „oceniaj wyłącznie wg normy".
    limitLabel: "Własny próg (0 = wg normy)",
    limitDefault: 0,
    limitUnit: "MΩ",
    extraCriterion: "Minimum wg PN-HD 60364-6 tabl. 6.1: 0,5 MΩ przy 250 V (SELV/PELV), 1,0 MΩ przy 500 V i 1000 V.",
    evaluate: (r, limit) => {
      const vals = [r.ln, r.lpe, r.npe].map(Number).filter((v) => !isNaN(v) && v > 0);
      if (!vals.length) return null;
      const wymagane = Math.max(minRezystancjaIzolacji(Number(r.u ?? 500)), Number(limit) || 0);
      return Math.min(...vals) >= wymagane;
    },
  },

  petla: {
    title: "Pomiar impedancji pętli zwarcia",
    norm: "PN-HD 60364-4-41 — ochrona przez samoczynne wyłączenie zasilania",
    intro: "Sprawdzenie skuteczności ochrony przeciwporażeniowej przez samoczynne wyłączenie zasilania (układ TN).",
    columns: [
      { key: "obwod", label: "Obwód", w: 120, type: "text" },
      { key: "curve", label: "Char.", w: 40, type: "select", options: ["B", "C", "D"], default: "B" },
      { key: "in", label: "In [A]", w: 44, type: "number", default: 16 },
      { key: "zs", label: "Zs zmierz. [Ω]", w: 70, type: "number" },
      { key: "ia", label: "Ia [A]", w: 48, type: "computed", compute: (r) => zsMaxForBreaker(String(r.curve ?? "B"), Number(r.in ?? 0)).ia.toFixed(0) },
      {
        key: "zsmax",
        label: "Zs max [Ω]",
        w: 62,
        type: "computed",
        compute: (r) => {
          const z = zsMaxForBreaker(String(r.curve ?? "B"), Number(r.in ?? 0)).zsMax;
          return z ? z.toFixed(2) : "—";
        },
      },
    ],
    limitLabel: "Współczynnik bezpieczeństwa",
    limitDefault: 1.0,
    limitUnit: "×Zs max",
    evaluate: (r, limit) => {
      const zs = Number(r.zs);
      const { zsMax } = zsMaxForBreaker(String(r.curve ?? "B"), Number(r.in ?? 0));
      if (!zs || !zsMax) return null;
      return zs <= zsMax * Number(limit);
    },
  },

  rcd: {
    title: "Badanie wyłączników różnicowoprądowych",
    norm: "PN-HD 60364-4-41 — ochrona uzupełniająca (RCD); PN-HD 60364-6 zał. D",
    intro: "Sprawdzenie prądu i czasu zadziałania wyłączników różnicowoprądowych oraz napięcia dotykowego.",
    columns: [
      { key: "ozn", label: "Oznaczenie", w: 68, type: "text" },
      { key: "idn", label: "IΔn [mA]", w: 50, type: "number", default: 30 },
      { key: "typ", label: "Typ", w: 38, type: "select", options: ["AC", "A", "B", "F"], default: "A" },
      { key: "sel", label: "Selekt. (S)", w: 52, type: "select", options: ["nie", "tak"], default: "nie" },
      { key: "id", label: "IΔ zadz. [mA]", w: 62, type: "number" },
      { key: "t1", label: "t przy IΔn [ms]", w: 68, type: "number" },
      { key: "t5", label: "t przy 5·IΔn [ms]", w: 74, type: "number" },
      { key: "ub", label: "UB [V]", w: 44, type: "number" },
    ],
    // Czasy wynikają z typu wyłącznika, więc NIE są tu edytowalne — edytowalne jest
    // dopuszczalne napięcie dotykowe, bo ono faktycznie zależy od obiektu: 50 V
    // zwykle, 25 V w warunkach szczególnych (łazienki, place budowy, gospodarstwa rolne).
    limitLabel: "Dopuszczalne napięcie dotykowe UB",
    limitDefault: 50,
    limitUnit: "V",
    extraCriterion:
      "Czasy wg PN-EN 61008/61009 — zwykły: ≤300 ms przy IΔn, ≤40 ms przy 5·IΔn; selektywny (S): 130–500 ms przy IΔn, 50–150 ms przy 5·IΔn. Prąd zadziałania: 0,5·IΔn ≤ IΔ ≤ IΔn.",
    evaluate: (r, limit) => {
      const idn = Number(r.idn);
      const id = Number(r.id);
      const t1 = Number(r.t1);
      const t5 = Number(r.t5);
      const ub = Number(r.ub);
      // Bez prądu zadziałania i bez CHOĆ JEDNEGO czasu nie ma czego oceniać.
      if (!idn || !id || (!t1 && !t5)) return null;
      const { t1: zakres1, t5: zakres5 } = dopuszczalneCzasyRcd(String(r.sel ?? "nie") === "tak");
      const wZakresie = (v: number, [min, max]: [number, number]) => v >= min && v <= max;
      const okPrad = id >= 0.5 * idn && id <= idn;
      // Czas niewpisany nie psuje oceny — pomiar mógł jeszcze nie zostać wykonany.
      // Wpisany musi się zmieścić w zakresie właściwym dla typu wyłącznika.
      const okT1 = !t1 || wZakresie(t1, zakres1);
      const okT5 = !t5 || wZakresie(t5, zakres5);
      const okUb = isNaN(ub) || ub <= Number(limit);
      return okPrad && okT1 && okT5 && okUb;
    },
  },

  uziemienie: {
    title: "Pomiar rezystancji uziemienia",
    norm: "PN-HD 60364-5-54 — uziemienia i przewody ochronne",
    intro: "Pomiar rezystancji uziomu wykonano metodą techniczną / cęgową przy odłączonym połączeniu wyrównawczym.",
    columns: [
      { key: "miejsce", label: "Uziom / miejsce pomiaru", w: 170, type: "text" },
      { key: "metoda", label: "Metoda", w: 90, type: "select", options: ["3-przewodowa", "4-przewodowa", "cęgowa", "udarowa"], default: "3-przewodowa" },
      { key: "r", label: "R [Ω]", w: 62, type: "number" },
    ],
    limitLabel: "Rezystancja maksymalna",
    limitDefault: 30,
    limitUnit: "Ω",
    evaluate: (r, limit) => {
      const v = Number(r.r);
      if (!v) return null;
      return v <= Number(limit);
    },
  },

  ciaglosc: {
    title: "Sprawdzenie ciągłości przewodów ochronnych",
    norm: "PN-HD 60364-6 zał. D — ciągłość przewodów ochronnych i połączeń wyrównawczych",
    intro: "Sprawdzenie ciągłości przewodów ochronnych PE oraz połączeń wyrównawczych.",
    columns: [
      { key: "punkt", label: "Obwód / punkt sprawdzany", w: 190, type: "text" },
      { key: "r", label: "R [Ω]", w: 62, type: "number" },
      { key: "i", label: "I pom. [A]", w: 62, type: "number", default: 0.2 },
    ],
    limitLabel: "Rezystancja maksymalna",
    limitDefault: 1.0,
    limitUnit: "Ω",
    evaluate: (r, limit) => {
      const v = Number(r.r);
      if (isNaN(v) || r.r === "" || r.r === undefined) return null;
      return v <= Number(limit);
    },
  },

  ogledziny: {
    title: "Oględziny instalacji",
    norm: "PN-HD 60364-6 pkt 6.4 — oględziny; art. 62 ust. 1 pkt 2 Prawa budowlanego",
    intro: "Oględziny stanu przewodów, osprzętu i połączeń w ramach kontroli okresowej instalacji elektrycznej.",
    checklist: true,
    // Pytania sformułowane pod BADANIE OKRESOWE, nie odbiorcze. Przy odbiorze
    // sprawdza się, czy wykonawca zrobił instalację poprawnie; po pięciu latach
    // pytanie brzmi inaczej: co się zużyło i co zmieniono. Rozdzielnica, zabezpieczenia
    // i zgodność z dokumentacją mają własny protokół (`rozdzielnice`).
    items: [
      "Izolacja przewodów widocznych bez uszkodzeń, pęknięć i przetarć",
      "Brak śladów przegrzania przewodów, zacisków i połączeń",
      "Osprzęt (gniazda, łączniki) bez uszkodzeń mechanicznych, pewnie zamocowany",
      "Oprawy oświetleniowe kompletne, bez śladów przegrzań",
      "Puszki połączeniowe zamknięte, połączenia wykonane trwale",
      "Połączenia wyrównawcze obecne, nieuszkodzone, bez korozji",
      "Osłony i obudowy kompletne — ochrona przed dotykiem bezpośrednim",
      "Stopnie ochrony IP odpowiednie do AKTUALNYCH warunków środowiskowych",
      "Brak śladów zawilgocenia i korozji w obrębie instalacji",
      "Brak instalacji prowizorycznych i przedłużaczy używanych na stałe",
      "Zmiana sposobu użytkowania pomieszczeń nie narusza wymagań instalacji",
      "Dostęp do aparatury do obsługi i konserwacji niezastawiony",
    ],
  },

  rozdzielnice: {
    title: "Rozdzielnice, zabezpieczenia i oznaczenia",
    norm: "PN-HD 60364-6 pkt 6.4; art. 62 ust. 1 pkt 2 Prawa budowlanego — sprawność osprzętu i zabezpieczeń",
    intro:
      "Sprawdzenie stanu rozdzielnic, doboru i kompletności zabezpieczeń, oznaczeń obwodów oraz zgodności stanu instalacji z dokumentacją.",
    checklist: true,
    items: [
      "Obudowa rozdzielnicy nieuszkodzona, osłony i drzwiczki kompletne",
      "Brak śladów przegrzań na aparatach, zaciskach i szynach",
      "Połączenia w rozdzielnicy pewne, bez luzów i przebarwień",
      "Zabezpieczenia zgodne z dokumentacją (typ, charakterystyka, prąd znamionowy)",
      "Brak zabezpieczeń wymienionych na inne parametry niż projektowe",
      "Wyłączniki różnicowoprądowe obecne tam, gdzie są wymagane",
      "Przycisk TEST wyłączników RCD sprawdzony i działający",
      "Szyny PE i N kompletne, połączenia pewne, brak korozji",
      "Oznaczenia przewodów ochronnych i neutralnych prawidłowe",
      "Opisy obwodów czytelne i ZGODNE ZE STANEM FAKTYCZNYM",
      "Schemat rozdzielnicy obecny i aktualny",
      "Stopień ochrony IP rozdzielnicy właściwy dla miejsca zainstalowania",
      "Instalacja nierozbudowana samowolnie po poprzednim badaniu",
      "Stan instalacji zgodny z dokumentacją powykonawczą",
    ],
  },

  odgromowa: {
    title: "Ochrona odgromowa (LPS)",
    norm: "PN-EN 62305-3 — urządzenie piorunochronne; art. 62 ust. 1 pkt 2 Prawa budowlanego",
    intro:
      "Sprawdzenie urządzenia piorunochronnego: ciągłość galwaniczna zwodów, przewodów odprowadzających i złączy oraz rezystancja uziemienia mierzona przy złączach kontrolnych.",
    columns: [
      { key: "zlacze", label: "Złącze kontrolne / uziom", w: 150, type: "text" },
      { key: "ciaglosc", label: "Ciągłość R [Ω]", w: 72, type: "number" },
      { key: "r", label: "R uziemienia [Ω]", w: 80, type: "number" },
      { key: "stan", label: "Stan / korozja", w: 90, type: "select", options: ["dobry", "do naprawy", "n/d"], default: "dobry" },
    ],
    // Wartość ZALECANA, nie ustawowa — stąd pole edytowalne, a nie stała w kodzie.
    // Ustawa wymaga zbadania uziemień, nie narzuca progu; ten bierze się z praktyki
    // i dokumentacji obiektu, więc ostatnie słowo ma osoba wykonująca pomiar.
    limitLabel: "Rezystancja uziemienia maks.",
    limitDefault: 10,
    limitUnit: "Ω",
    extraCriterion: "Ciągłość połączeń uznaje się za zachowaną przy R ≤ 1 Ω. Element oznaczony „do naprawy” daje ocenę negatywną niezależnie od wyników.",
    evaluate: (r, limit) => {
      const rez = Number(r.r);
      const ciag = Number(r.ciaglosc);
      const maCiaglosc = r.ciaglosc !== "" && r.ciaglosc !== undefined && !isNaN(ciag);
      if (!rez && !maCiaglosc) return null;
      if (String(r.stan ?? "") === "do naprawy") return false;
      const okRez = !rez || rez <= Number(limit);
      const okCiag = !maCiaglosc || ciag <= CIAGLOSC_LPS_MAX;
      return okRez && okCiag;
    },
  },
};

/** Próg ciągłości połączeń urządzenia piorunochronnego [Ω] — patrz `extraCriterion`. */
const CIAGLOSC_LPS_MAX = 1;

/**
 * Kolejność zakładek odpowiada przebiegowi kontroli okresowej: najpierw to, co
 * widać (oględziny, rozdzielnica), potem pomiary od najprostszego do najbardziej
 * złożonego, na końcu ochrona odgromowa jako osobna instalacja.
 */
export const PROTOCOL_ORDER: ProtocolKey[] = [
  "ogledziny",
  "rozdzielnice",
  "ciaglosc",
  "izolacja",
  "petla",
  "rcd",
  "uziemienie",
  "odgromowa",
];

/** Werdykt ogólny protokołu: `true` pozytywny, `false` negatywny, `null` brak kompletu danych. */
export function protocolVerdict(def: ProtocolDef, rows: ProtocolRow[], limit: number): boolean | null {
  if (def.checklist) {
    const bad = rows.filter((r) => r.status === "nie").length;
    const done = rows.filter((r) => r.status && r.status !== "nd").length;
    if (!done) return null;
    return bad === 0;
  }
  const evals = rows.map((r) => def.evaluate!(r, limit)).filter((v): v is boolean => v !== null);
  if (!evals.length) return null;
  return evals.every(Boolean);
}
