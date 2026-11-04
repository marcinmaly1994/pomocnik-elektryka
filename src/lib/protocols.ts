import type { ProtocolKey } from "@/types";
import { formatLiczba } from "@/lib/liczby";
import { zsMaxForBreaker } from "@/lib/panel/sizing";

export type ProtocolRow = Record<string, string | number | undefined>;

export interface ProtocolColumn {
  key: string;
  label: string;
  w: number;
  type: "text" | "number" | "select" | "computed";
  default?: string | number;
  options?: string[];
  /** `limit` to wartość ogólnego pola kryterium protokołu (np. napięcie
   *  probiercze dla izolacji) — niektóre kolumny liczą się względem NIEGO,
   *  nie względem samego wiersza. Opcjonalny, bo większość kolumn (Ia, Zs max)
   *  liczy się wyłącznie z wiersza. */
  compute?: (row: ProtocolRow, limit?: number) => string;
}

export interface ProtocolDef {
  title: string;
  norm: string;
  intro: string;
  columns?: ProtocolColumn[];
  limitLabel?: string;
  limitDefault?: number;
  limitUnit?: string;
  /** Dopuszczalny zakres kryterium [min, max]. Wartość spoza niego jest PRZYCINANA przy
   *  ocenie (patrz `limitOceny`) — dla kryteriów, w których zły kierunek rozluźniałby
   *  werdykt. Brak = dowolna wartość (napięcie probiercze, rezystancje maksymalne). */
  limitZakres?: [number, number];
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
    intro:
      "Pomiar wykonano miernikiem rezystancji izolacji przy odłączonym zasilaniu i odłączonych odbiornikach. Wszystkie wartości rezystancji poniżej podane są w megaomach [MΩ].",
    // JEDEN WIERSZ = JEDEN OBWÓD/URZĄDZENIE, kolumna na każdą parę — układ z wzoru
    // Z.4.4 (Poradnik Projektanta Elektryka). Obwód wypełnia tylko swój podzbiór par
    // (np. TN-C nie ma osobnych N/PE) — puste komórki są normalne, nie błędem.
    // Etykiety par BEZ jednostki (ta jest jedna dla całej tabeli — patrz `intro` —
    // tak jak we wzorze, gdzie jednostka stoi raz w nagłówku "Rezystancja, w [MΩ]"
    // nad wszystkimi sub-kolumnami, nie w każdej z osobna): przy dziesięciu wąskich
    // kolumnach na stronie powtórzone "[MΩ]" w każdej się nie mieściło i obcinało.
    columns: [
      { key: "typ", label: "Typ przewodu (kabla) lub urządzenia", w: 110, type: "text" },
      { key: "obwod", label: "Nazwa obwodu / urządzenia oraz symbol wg dokumentacji", w: 150, type: "text" },
      { key: "l1l2", label: "L1-L2", w: 40, type: "number" },
      { key: "l1l3", label: "L1-L3", w: 40, type: "number" },
      { key: "l2l3", label: "L2-L3", w: 40, type: "number" },
      { key: "l1n", label: "L1-N", w: 36, type: "number" },
      { key: "l2n", label: "L2-N", w: 36, type: "number" },
      { key: "l3n", label: "L3-N", w: 36, type: "number" },
      { key: "l1pe", label: "L1-PE/PEN", w: 54, type: "number" },
      { key: "l2pe", label: "L2-PE/PEN", w: 54, type: "number" },
      { key: "l3pe", label: "L3-PE/PEN", w: 54, type: "number" },
      { key: "npe", label: "N-PE", w: 36, type: "number" },
      {
        key: "rwym",
        label: "R wymagana",
        w: 56,
        type: "computed",
        compute: (_r, limit) => formatLiczba(minRezystancjaIzolacji(Number(limit) || 500), 1),
      },
    ],
    // Napięcie probiercze jest JEDNO dla całego pomiaru (mierzy się nim wszystkie
    // pary na raz), więc — tak jak w Z.4.4 — jest polem ogólnym, nie kolumną
    // w wierszu. Od niego zależy wymagana rezystancja (tabl. 6.1).
    limitLabel: "Napięcie probiercze",
    limitDefault: 500,
    limitUnit: "V",
    extraCriterion:
      "Minimum wg PN-HD 60364-6 tabl. 6.1: 0,5 MΩ przy 250 V (SELV/PELV), 1,0 MΩ przy 500 V i 1000 V. Puste komórki par nieistniejących w danym układzie sieci (np. N/PE w TN-C) nie wpływają na ocenę.",
    evaluate: (r, limit) => {
      const wymagane = minRezystancjaIzolacji(Number(limit) || 500);
      const pary = [r.l1l2, r.l1l3, r.l2l3, r.l1n, r.l2n, r.l3n, r.l1pe, r.l2pe, r.l3pe, r.npe]
        .map(Number)
        .filter((v) => !isNaN(v) && v > 0);
      if (!pary.length) return null;
      return Math.min(...pary) >= wymagane;
    },
  },

  petla: {
    title: "Pomiar impedancji pętli zwarcia",
    norm: "PN-HD 60364-4-41 — ochrona przez samoczynne wyłączenie zasilania",
    intro: "Sprawdzenie skuteczności ochrony przeciwporażeniowej przez samoczynne wyłączenie zasilania (układ TN).",
    columns: [
      { key: "obwod", label: "Obwód", w: 106, type: "text" },
      // „Układ", nie „Obwód": druga kolumna o tej samej nazwie robiła z nagłówka tabeli (i z nazw
      // pól w formularzu) dwa nierozróżnialne „Obwód".
      { key: "uklad", label: "Układ", w: 50, type: "select", options: ["1-faz", "3-faz"], default: "1-faz" },
      { key: "curve", label: "Char.", w: 38, type: "select", options: ["B", "C", "D"], default: "B" },
      { key: "in", label: "In [A]", w: 42, type: "number", default: 16 },
      // W obwodzie 3-fazowym mierzy się pętlę L-PE dla KAŻDEJ fazy — o ocenie
      // decyduje najgorsza. W jednofazowym wypełnia się tylko L1.
      { key: "zs", label: "Zs L1 [Ω]", w: 58, type: "number" },
      { key: "zs2", label: "Zs L2 [Ω]", w: 58, type: "number" },
      { key: "zs3", label: "Zs L3 [Ω]", w: 58, type: "number" },
      { key: "ia", label: "Ia [A]", w: 48, type: "computed", compute: (r) => formatLiczba(zsMaxForBreaker(String(r.curve ?? "B"), Number(r.in ?? 0)).ia, 0) },
      {
        key: "zsmax",
        label: "Zs max [Ω]",
        w: 62,
        type: "computed",
        compute: (r) => {
          const z = zsMaxForBreaker(String(r.curve ?? "B"), Number(r.in ?? 0)).zsMax;
          return z ? formatLiczba(z, 2) : "—";
        },
      },
    ],
    // Próg to Zs max × ta liczba, więc WIĘKSZA znaczy LUŹNIEJSZA ocena. Dawna etykieta
    // „Współczynnik bezpieczeństwa" sugerowała odwrotnie, a pole przyjmowało dowolną
    // wartość: wpisane 2 dawało wynik pozytywny dla pętli dwa razy za długiej. Zakres
    // kończy się na 1,0 (bez zapasu); poniżej to zapas pomiarowy, czyli ocena ostrzejsza.
    limitLabel: "Zapas pomiarowy",
    limitDefault: 1.0,
    limitUnit: "× Zs max (1,0 = bez zapasu; mniej = ostrzej)",
    limitZakres: [0.1, 1.0],
    extraCriterion:
      "Zs max liczone dla U0 = 230 V — zwarcie L-PE ma to samo napięcie w obwodzie 1- i 3-fazowym, więc próg jest wspólny. W obwodzie 3-fazowym mierzy się pętlę dla każdej fazy, a o ocenie decyduje NAJGORSZA z nich.",
    evaluate: (r, limit) => {
      // Najgorsza (największa) zmierzona impedancja z wypełnionych faz. W obwodzie
      // jednofazowym wypełniona jest tylko L1 i sprowadza się to do niej samej.
      const zmierzone = [r.zs, r.zs2, r.zs3].map(Number).filter((v) => !isNaN(v) && v > 0);
      const { zsMax } = zsMaxForBreaker(String(r.curve ?? "B"), Number(r.in ?? 0));
      if (!zmierzone.length || !zsMax) return null;
      // Przycięcie także tutaj, a nie tylko w wywołującym: ocena nie może zależeć od tego,
      // czy ktoś o nim pamiętał.
      return Math.max(...zmierzone) <= zsMax * Math.min(Number(limit), 1);
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
    // Układ z wzoru Z.4.5 (Poradnik Projektanta Elektryka): rodzaj uziomu, zmierzona
    // i dopuszczalna rezystancja obok siebie. Metoda pomiaru jest jedna dla całego
    // protokołu (dopisuje się ją w uwagach), nie osobną kolumną na uziom.
    columns: [
      { key: "miejsce", label: "Rodzaj uziomu oraz symbol zgodny z dokumentacją", w: 220, type: "text" },
      { key: "r", label: "R zmierzona [Ω]", w: 72, type: "number" },
      { key: "rdop", label: "R dopuszczalna [Ω]", w: 76, type: "computed", compute: (_r, limit) => String(limit) },
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
    // pytanie brzmi inaczej: co się zużyło i co zmieniono.
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
  "ciaglosc",
  "izolacja",
  "petla",
  "rcd",
  "uziemienie",
  "odgromowa",
];

/**
 * Werdykt ogólny protokołu: `true` pozytywny, `false` negatywny, `null` brak kompletu danych.
 *
 * Niezgodność przesądza od razu — jeden zły pomiar czyni protokół negatywnym, niezależnie
 * od reszty. Ale wynik POZYTYWNY wymaga oceny każdego wiersza: dotąd wiersze bez wyników
 * były po prostu pomijane, więc jeden wypełniony pomiar izolacji na trzy wiersze albo
 * jedna pozycja oględzin „zgodne" na dwanaście dawały „instalacja w badanym zakresie
 * spełnia wymagania" — także na wydruku, czyli w dokumencie formalnym.
 */
/** Kryterium protokołu w jego dopuszczalnym zakresie. Bez zakresu — bez zmian. Wartość
 *  nieliczbowa wraca do domyślnej, bo `Number("")` dałoby 0 i ocenę negatywną bez powodu. */
export function limitOceny(def: ProtocolDef, limit: number): number {
  if (!def.limitZakres) return limit;
  if (!Number.isFinite(limit)) return def.limitDefault ?? def.limitZakres[1];
  const [min, max] = def.limitZakres;
  return Math.min(max, Math.max(min, limit));
}

export function protocolVerdict(def: ProtocolDef, rows: ProtocolRow[], limit: number): boolean | null {
  if (def.checklist) {
    if (rows.some((r) => r.status === "nie")) return false;
    if (rows.some((r) => !r.status)) return null;
    // Same „n/d" to jeszcze nie ocena — nic nie zostało sprawdzone jako zgodne.
    return rows.some((r) => r.status === "tak") ? true : null;
  }
  const evals = rows.map((r) => def.evaluate!(r, limit));
  if (evals.some((v) => v === false)) return false;
  if (!evals.length || evals.some((v) => v === null)) return null;
  return true;
}

/** Ile wierszy protokołu nie ma jeszcze oceny — do komunikatu „niekompletny". */
export function wierszeBezOceny(def: ProtocolDef, rows: ProtocolRow[], limit: number): number {
  if (def.checklist) return rows.filter((r) => !r.status).length;
  return rows.filter((r) => def.evaluate!(r, limit) === null).length;
}
