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
      { key: "obwod", label: "Obwód / miejsce pomiaru", w: 150, type: "text" },
      { key: "u", label: "U pom. [V]", w: 58, type: "number", default: 500 },
      { key: "ln", label: "L-N [MΩ]", w: 58, type: "number" },
      { key: "lpe", label: "L-PE [MΩ]", w: 58, type: "number" },
      { key: "npe", label: "N-PE [MΩ]", w: 58, type: "number" },
    ],
    limitLabel: "Rezystancja minimalna",
    limitDefault: 1.0,
    limitUnit: "MΩ",
    evaluate: (r, limit) => {
      const vals = [r.ln, r.lpe, r.npe].map(Number).filter((v) => !isNaN(v) && v > 0);
      if (!vals.length) return null;
      return Math.min(...vals) >= Number(limit);
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
      { key: "ozn", label: "Oznaczenie", w: 78, type: "text" },
      { key: "idn", label: "IΔn [mA]", w: 56, type: "number", default: 30 },
      { key: "typ", label: "Typ", w: 42, type: "select", options: ["AC", "A", "B", "F"], default: "A" },
      { key: "id", label: "IΔ zadz. [mA]", w: 68, type: "number" },
      { key: "t", label: "t zadz. [ms]", w: 62, type: "number" },
      { key: "ub", label: "UB [V]", w: 48, type: "number" },
    ],
    limitLabel: "Maks. czas zadziałania",
    limitDefault: 300,
    limitUnit: "ms",
    evaluate: (r, limit) => {
      const idn = Number(r.idn);
      const id = Number(r.id);
      const t = Number(r.t);
      const ub = Number(r.ub);
      if (!idn || !id || !t) return null;
      const okPrad = id >= 0.5 * idn && id <= idn;
      const okCzas = t <= Number(limit);
      const okUb = isNaN(ub) || ub <= 50;
      return okPrad && okCzas && okUb;
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
    title: "Protokół oględzin instalacji",
    norm: "PN-HD 60364-6 pkt 6.4 — oględziny",
    intro: "Oględziny instalacji elektrycznej przed uruchomieniem / w ramach badania okresowego.",
    checklist: true,
    items: [
      "Zgodność wykonania instalacji z dokumentacją projektową",
      "Dobór przewodów pod względem obciążalności i spadku napięcia",
      "Dobór i nastawy urządzeń zabezpieczających",
      "Prawidłowość połączeń przewodów, brak uszkodzeń izolacji",
      "Obecność i prawidłowość połączeń wyrównawczych",
      "Oznakowanie przewodów neutralnych i ochronnych",
      "Umieszczenie schematów, opisów i oznaczeń obwodów",
      "Dostępność aparatury do obsługi i konserwacji",
      "Stopnie ochrony IP właściwe dla warunków środowiskowych",
      "Ochrona przed dotykiem bezpośrednim (osłony, obudowy)",
      "Prawidłowy dobór urządzeń do wpływów zewnętrznych",
      "Stan techniczny rozdzielnicy i osprzętu",
    ],
  },
};

export const PROTOCOL_ORDER: ProtocolKey[] = ["ogledziny", "ciaglosc", "izolacja", "petla", "rcd", "uziemienie"];

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
