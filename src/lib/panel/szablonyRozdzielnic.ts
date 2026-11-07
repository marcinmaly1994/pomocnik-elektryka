import type { PanelConfig, PanelDevice } from "@/types";
import { balancePhases, MANUAL_DEVICE_TYPES } from "./devices";

/**
 * Biblioteka gotowych układów rozdzielnic (F17 z audytu 5.11.2026).
 *
 * Tryb „Składam ręcznie" zaczynał od samego rozłącznika głównego i każdy aparat
 * trzeba było dokładać po kolei — przy typowym domu to kilkadziesiąt kliknięć, zanim
 * w ogóle widać, czy obudowa 2 × 18 wystarczy. Szablon wstawia od razu typowy układ,
 * który potem się poprawia: zmienia nastawy, dokłada obwody, kasuje zbędne.
 *
 * Układy to PUNKT WYJŚCIA, nie projekt: nastawy i przekroje są typowe dla danego
 * rodzaju obwodu, a dobór i tak sprawdza zakładka (selektywność, bilans faz).
 */

/** Obwód odpływowy w szablonie: nastawa, opis, liczba biegunów (domyślnie 1P). */
interface ObwodSzablonu {
  label: string;
  caption: string;
  poles?: "1P" | "3P";
  /** Rodzaj aparatu — domyślnie wyłącznik nadprądowy. */
  kind?: "mcb" | "rcbo";
  cable?: string;
}

interface GrupaSzablonu {
  /** Różnicówka nad obwodami grupy; brak — obwody bez RCD (np. falownik PV). */
  rcd?: { prad: number; czulosc: 30 | 300; typ: "A" | "F" | "B" };
  obwody: ObwodSzablonu[];
}

export interface SzablonRozdzielnicy {
  id: string;
  nazwa: string;
  opis: string;
  config: PanelConfig;
  /** Aparaty zaraz za rozłącznikiem głównym (SPD, CZF…) — klucze `MANUAL_DEVICE_TYPES`. */
  naPoczatku: { kind: string; label?: string }[];
  grupy: GrupaSzablonu[];
}

const g = (label: string, caption: string, extra: Partial<ObwodSzablonu> = {}): ObwodSzablonu => ({ label, caption, ...extra });

export const SZABLONY_ROZDZIELNIC: SzablonRozdzielnicy[] = [
  {
    id: "mieszkanie",
    nazwa: "Mieszkanie",
    opis: "3-fazowe 40 A, 2 różnicówki: pokoje oraz kuchnia z łazienką; płyta indukcyjna 3-fazowa.",
    config: { supply3f: true, mainRating: 40, perRow: 18 },
    naPoczatku: [{ kind: "spd", label: "T1+T2" }],
    grupy: [
      {
        rcd: { prad: 40, czulosc: 30, typ: "A" },
        obwody: [
          g("B10", "Oświetlenie — pokoje", { cable: "YDYp 3×1,5" }),
          g("B10", "Oświetlenie — kuchnia, łazienka, przedpokój", { cable: "YDYp 3×1,5" }),
          g("B16", "Gniazda — salon", { cable: "YDYp 3×2,5" }),
          g("B16", "Gniazda — sypialnia, pokój", { cable: "YDYp 3×2,5" }),
          g("B16", "Gniazda — przedpokój", { cable: "YDYp 3×2,5" }),
        ],
      },
      {
        rcd: { prad: 40, czulosc: 30, typ: "A" },
        obwody: [
          g("B16", "Gniazda — kuchnia, blat", { cable: "YDYp 3×2,5" }),
          g("B16", "Gniazda — łazienka", { cable: "YDYp 3×2,5" }),
          g("B16", "Pralka", { cable: "YDYp 3×2,5" }),
          g("B16", "Zmywarka", { cable: "YDYp 3×2,5" }),
          g("B16", "Piekarnik", { cable: "YDYp 3×2,5" }),
          g("B16", "Płyta indukcyjna", { poles: "3P", cable: "YDYp 5×2,5" }),
        ],
      },
    ],
  },
  {
    id: "dom",
    nazwa: "Dom jednorodzinny",
    opis: "3-fazowe 63 A, SPD, czujnik zaniku fazy, 3 różnicówki: oświetlenie, gniazda, kuchnia i łazienki.",
    config: { supply3f: true, mainRating: 63, perRow: 18 },
    naPoczatku: [{ kind: "spd", label: "T1+T2" }, { kind: "ovr", label: "CZF" }],
    grupy: domGrupy(),
  },
  {
    id: "dom-pv",
    nazwa: "Dom z fotowoltaiką",
    opis: "Jak dom jednorodzinny plus obwód falownika PV 3-fazowego, bez różnicówki po stronie AC (wg instrukcji falownika).",
    config: { supply3f: true, mainRating: 63, perRow: 18 },
    naPoczatku: [{ kind: "spd", label: "T1+T2" }, { kind: "ovr", label: "CZF" }],
    grupy: [...domGrupy(), { obwody: [g("C20", "Falownik PV", { poles: "3P", cable: "YDYp 5×4" })] }],
  },
  {
    id: "dom-pv-ev",
    nazwa: "Dom z fotowoltaiką i ładowarką EV",
    opis: "Jak dom z PV plus ładowarka 11 kW na osobnej różnicówce typu B (typ A wystarczy tylko przy ładowarce z detekcją 6 mA DC).",
    config: { supply3f: true, mainRating: 63, perRow: 24 },
    naPoczatku: [{ kind: "spd", label: "T1+T2" }, { kind: "ovr", label: "CZF" }],
    grupy: [
      ...domGrupy(),
      { obwody: [g("C20", "Falownik PV", { poles: "3P", cable: "YDYp 5×4" })] },
      // 63 A, nie 40: różnicówka nie ma własnej ochrony przed przeciążeniem, więc jej prąd
      // nie może być mniejszy od rozłącznika głównego (reguła 3 w `computeSelectivity`).
      { rcd: { prad: 63, czulosc: 30, typ: "B" }, obwody: [g("C20", "Ładowarka EV 11 kW", { poles: "3P", cable: "YDY 5×6" })] },
    ],
  },
];

function domGrupy(): GrupaSzablonu[] {
  return [
    {
      rcd: { prad: 63, czulosc: 30, typ: "A" },
      obwody: [
        g("B10", "Oświetlenie — parter", { cable: "YDYp 3×1,5" }),
        g("B10", "Oświetlenie — piętro", { cable: "YDYp 3×1,5" }),
        g("B10", "Oświetlenie zewnętrzne", { cable: "YDYp 3×1,5" }),
        g("B10", "Rolety", { cable: "YDYp 3×1,5" }),
        // Tu, nie przy kuchni: tam byłby siódmy obwód za jedną różnicówką, a od siedmiu
        // `computeSelectivity` ostrzega o zbyt wielu obwodach wyłączanych naraz.
        g("B16", "Kocioł / pompa ciepła — sterowanie", { cable: "YDYp 3×2,5" }),
      ],
    },
    {
      rcd: { prad: 63, czulosc: 30, typ: "A" },
      obwody: [
        g("B16", "Gniazda — salon", { cable: "YDYp 3×2,5" }),
        g("B16", "Gniazda — pokoje parter", { cable: "YDYp 3×2,5" }),
        g("B16", "Gniazda — pokoje piętro", { cable: "YDYp 3×2,5" }),
        g("B16", "Gniazda — garaż", { cable: "YDYp 3×2,5" }),
        g("B16", "Gniazda zewnętrzne", { cable: "YDYp 3×2,5" }),
        g("B16", "Gniazdo 400 V — garaż", { poles: "3P", cable: "YDYp 5×2,5" }),
      ],
    },
    {
      rcd: { prad: 63, czulosc: 30, typ: "A" },
      obwody: [
        g("B16", "Gniazda — kuchnia, blat", { cable: "YDYp 3×2,5" }),
        g("B16", "Gniazda — łazienki", { cable: "YDYp 3×2,5" }),
        g("B16", "Pralka", { cable: "YDYp 3×2,5" }),
        g("B16", "Zmywarka", { cable: "YDYp 3×2,5" }),
        g("B16", "Piekarnik", { cable: "YDYp 3×2,5" }),
        g("B20", "Płyta indukcyjna", { poles: "3P", cable: "YDYp 5×2,5" }),
      ],
    },
  ];
}

/**
 * Aparaty rozdzielnicy z szablonu — w trybie ręcznym, z oznaczeniami wg IEC 81346
 * (Q, F, FI) nadawanymi po kolei, obwodami przypisanymi do swoich różnicówek
 * (`rcdTag`) i fazami rozłożonymi tak samo jak przy rozdzielnicy z rzutu.
 */
export function aparatyZSzablonu(s: SzablonRozdzielnicy): PanelDevice[] {
  const { supply3f, mainRating } = s.config;
  const licznik: Record<string, number> = {};
  const tag = (prefix: string) => {
    if (!prefix) return "";
    licznik[prefix] = (licznik[prefix] ?? 0) + 1;
    return `${prefix}${licznik[prefix]}`;
  };
  const wielofazowe = supply3f ? "4P" : "2P";
  const out: PanelDevice[] = [];

  // Rozłącznik główny — dokładnie taki, jak w `buildPanelDevices` (klucz `main`).
  out.push({
    uid: "Q1-0",
    key: "main",
    kind: "main",
    tag: tag("Q"),
    modules: supply3f ? 4 : 2,
    label: `${mainRating}A`,
    caption: "Rozłącznik izolacyjny główny",
    poles: wielofazowe,
    phase: supply3f ? "3F" : "L1",
  });

  let nr = 0;
  const reczny = (d: Omit<PanelDevice, "uid" | "manual">): PanelDevice => ({ ...d, uid: `manual-${++nr}`, manual: true });

  for (const a of s.naPoczatku) {
    const def = MANUAL_DEVICE_TYPES.find((t) => t.key === a.kind);
    if (!def) continue;
    // SPD rozłącza wszystkie przewody robocze — bieguny i szerokość z zasilania,
    // tak jak w `addManualDevice`.
    const zZasilania = def.key === "spd";
    out.push(
      reczny({
        kind: def.key,
        tag: tag(def.prefix),
        modules: zZasilania ? (supply3f ? 4 : 2) : def.modules,
        label: a.label ?? def.defLabel,
        caption: def.label,
        poles: zZasilania ? wielofazowe : def.poles,
        phase: supply3f ? "3F" : "L1",
      })
    );
  }

  for (const grupa of s.grupy) {
    let rcdTag: string | undefined;
    if (grupa.rcd) {
      const { prad, czulosc, typ } = grupa.rcd;
      rcdTag = tag("FI");
      out.push(
        reczny({
          kind: "rcd",
          tag: rcdTag,
          modules: supply3f ? 4 : 2,
          label: `${prad}A/${czulosc}mA`,
          caption: `Wyłącznik różnicowoprądowy ${prad}A/${czulosc}mA typ ${typ}`,
          poles: wielofazowe,
          phase: supply3f ? "3F" : "L1",
        })
      );
    }
    for (const o of grupa.obwody) {
      const trojfazowy = o.poles === "3P" && supply3f;
      out.push(
        reczny({
          kind: o.kind ?? "mcb",
          tag: tag("F"),
          modules: trojfazowy ? 3 : o.kind === "rcbo" ? 2 : 1,
          label: o.label,
          caption: o.caption,
          poles: trojfazowy ? "3P" : o.kind === "rcbo" ? "1P+N" : "1P",
          phase: trojfazowy ? "3F" : "",
          cable: o.cable,
          ...(rcdTag ? { rcdTag } : {}),
        })
      );
    }
  }

  return supply3f ? balancePhases(out) : out.map((d) => (d.kind === "mcb" && d.poles === "1P" ? { ...d, phase: "L1" as const } : d));
}

/** Ile modułów zajmie układ — do pokazania przy wyborze („36 mod., 2 × 18"). */
export function modulySzablonu(s: SzablonRozdzielnicy): number {
  return aparatyZSzablonu(s).reduce((suma, d) => suma + d.modules, 0);
}
