import type { PanelDevice, RcdGroup } from "@/types";
import { colorForCircuit } from "./circuits";

/**
 * Kolory faz wg konwencji oznaczania żył (PN-HD 308 S2): L1 brązowy, L2 czarny,
 * L3 szary. Wcześniej było tu czerwony/czarny/fioletowy — kolory ładne, ale
 * niezgodne z tym, co elektryk zobaczy w puszce, więc mylące przy przenoszeniu
 * oznaczeń z rysunku na realną instalację.
 */
export const PHASE_COLORS: Record<string, string> = {
  L1: "#7B4B2A",
  L2: "#2B2B2B",
  L3: "#8A8A8A",
  "3F": "#2D5A8C",
  "": "#94A3B8",
};

export const MOD_W = 34; // szerokość 1 modułu (px) ~ 17,5 mm
export const DEV_H = 150; // wysokość aparatu ~ 85 mm

export interface ManualDeviceType {
  key: string;
  label: string;
  prefix: string;
  modules: number;
  poles: string;
  defLabel: string;
  accent: string;
  ratings: string[];
}

/** Katalog aparatów, które można dołożyć ręcznie — poza tymi wynikającymi z obwodów.
 *  Prefiks wg IEC 81346: F — zabezpieczenia, Q — łączniki, K — styczniki/przekaźniki,
 *  T — zasilacze/transformatory, P — sygnalizacja. */
export const MANUAL_DEVICE_TYPES: ManualDeviceType[] = [
  { key: "mcb", label: "Wyłącznik nadprądowy", prefix: "F", modules: 1, poles: "1P", defLabel: "B16", accent: "#2D5A8C", ratings: ["B6", "B10", "B13", "B16", "B20", "B25", "C10", "C16", "C20", "C25", "C32"] },
  { key: "rcbo", label: "Wyłącznik różnicowo-nadprądowy", prefix: "F", modules: 2, poles: "1P+N", defLabel: "B16/30mA", accent: "#C1793F", ratings: ["B10/30mA", "B16/30mA", "B20/30mA", "C16/30mA"] },
  { key: "rcd", label: "Wyłącznik różnicowoprądowy", prefix: "FI", modules: 2, poles: "2P", defLabel: "40A/30mA", accent: "#C1793F", ratings: ["25A/30mA", "40A/30mA", "63A/30mA", "40A/300mA", "63A/300mA"] },
  // Bezpiecznik pod ogranicznik przepięć. Do dołożenia RĘCZNIE, gdy wytrzymałość
  // zwarciowa SPD jest niższa od spodziewanego prądu zwarcia i nie pokrywa jej
  // zabezpieczenie nadrzędne — dane z karty katalogowej konkretnego ogranicznika.
  { key: "spdFuse", label: "Bezpiecznik pod SPD", prefix: "F", modules: 1, poles: "1P", defLabel: "gG 63A", accent: "#B98C2F", ratings: ["gG 25A", "gG 32A", "gG 40A", "gG 63A", "gG 80A"] },
  { key: "ovr", label: "Czujnik zaniku / zaniku fazy (CZF)", prefix: "F", modules: 1, poles: "3P", defLabel: "CZF", accent: "#C6433A", ratings: ["CZF", "CZN", "OVR"] },
  { key: "ppoz", label: "Rozłącznik przeciwpożarowy", prefix: "Q", modules: 2, poles: "4P", defLabel: "63A", accent: "#C6433A", ratings: ["40A", "63A", "80A", "100A"] },
  { key: "stycznik", label: "Stycznik modułowy", prefix: "K", modules: 2, poles: "2P", defLabel: "20A", accent: "#3B8C63", ratings: ["16A", "20A", "25A", "40A", "63A"] },
  { key: "przekaznik", label: "Przekaźnik bistabilny", prefix: "K", modules: 1, poles: "1P", defLabel: "16A", accent: "#3B8C63", ratings: ["10A", "16A"] },
  { key: "zasilacz", label: "Zasilacz modułowy", prefix: "T", modules: 2, poles: "—", defLabel: "12V DC", accent: "#0F8A9E", ratings: ["12V DC", "24V DC", "24V AC"] },
  { key: "lampka", label: "Lampka sygnalizacyjna", prefix: "P", modules: 1, poles: "3P", defLabel: "L1-L2-L3", accent: "#B98C2F", ratings: ["L1-L2-L3", "230V"] },
  { key: "blank", label: "Rezerwa (zaślepka)", prefix: "", modules: 1, poles: "—", defLabel: "", accent: "#94A3B8", ratings: [""] },
];

/** Kolor akcentu na widoku czołowym — dla auto-generowanych MCB wg typu obwodu
 *  (ten sam kolor co na schemacie jednokreskowym), dla reszty aparatów wg rodzaju.
 *  Przeniesione z logiki wyliczania `accent` w komponencie `PanelDevice` w wersji JS. */
export function accentForDevice(d: PanelDevice): string {
  if (d.kind === "mcb") return d.manual ? "#2D5A8C" : colorForCircuit(d.type || "");
  if (d.kind === "rcd") return "#C1793F";
  if (d.kind === "spd") return "#3B8C63";
  if (d.kind === "spdFuse") return "#B98C2F";
  const manualDef = MANUAL_DEVICE_TYPES.find((t) => t.key === d.kind);
  return manualDef ? manualDef.accent : "#16202B";
}

/** Wyciąga prąd znamionowy z etykiety aparatu (np. "B16" -> 16, "C25 3-faz." -> 25). */
export function ratedCurrent(label: string): number {
  const m = String(label || "").match(/(\d+)/);
  return m ? Number(m[1]) : 0;
}

/** Rozdziela obwody 1-fazowe równomiernie na L1/L2/L3, zawsze dokładając do fazy
 *  aktualnie najmniej obciążonej — inaczej rośnie prąd w przewodzie neutralnym. */
export function balancePhases(devices: PanelDevice[]): PanelDevice[] {
  const load: Record<"L1" | "L2" | "L3", number> = { L1: 0, L2: 0, L3: 0 };
  return devices.map((d) => {
    if (d.kind !== "mcb" || d.poles !== "1P") return d;
    const target = (["L1", "L2", "L3"] as const).reduce((a, b) => (load[a] <= load[b] ? a : b));
    load[target] += ratedCurrent(d.label);
    return { ...d, phase: target };
  });
}

export interface BuildPanelDevicesOptions {
  supply3f?: boolean;
  spd?: string;
  mainRating?: number;
}

/** Zamienia obwody na listę aparatów rozdzielnicy. Oznaczenia wg IEC 81346:
 *  Q — łączniki (rozłącznik główny), F — zabezpieczenia, FI — różnicowoprądowe. */
export function buildPanelDevices(rcdGroups: RcdGroup[], opts: BuildPanelDevicesOptions = {}): PanelDevice[] {
  const { supply3f = true, spd = "T1+T2", mainRating = 40 } = opts;
  const devices: PanelDevice[] = [];
  const p = supply3f ? "4P" : "2P";
  const mod = supply3f ? 4 : 2;

  devices.push({ uid: "", kind: "main", tag: "Q1", modules: mod, label: `${mainRating}A`, caption: "Rozłącznik izolacyjny główny", poles: p, phase: supply3f ? "3F" : "L1", key: "main" });

  // Sam ogranicznik przepięć — BEZ automatycznego bezpiecznika przed nim.
  //
  // Wcześniej razem z SPD wstawiał się tu „gG 63A" opisany jako zabezpieczenie
  // przedlicznikowe. To było podwójnie nie na miejscu: „przedlicznikowe" znaczy
  // PRZED licznikiem, czyli w plombowanej szafce operatora, a nie w rozdzielnicy
  // mieszkaniowej, którą rysuje ta aplikacja. A osobny bezpiecznik pod SPD jest
  // potrzebny tylko wtedy, gdy wytrzymałość zwarciowa ogranicznika jest niższa
  // od spodziewanego prądu zwarcia i nie pokrywa go zabezpieczenie nadrzędne —
  // czyli nie „za każdym razem". Kto go potrzebuje, dokłada go ręcznie
  // (patrz MANUAL_DEVICE_TYPES, pozycja `spdFuse`).
  if (spd !== "brak") {
    devices.push({ uid: "", kind: "spd", tag: "F00", modules: mod, label: spd, caption: `Ogranicznik przepięć ${spd}`, poles: p, phase: supply3f ? "3F" : "L1", key: "spd" });
  }

  let mcbNo = 0;
  rcdGroups.forEach((r, gi) => {
    devices.push({
      uid: "",
      kind: "rcd",
      tag: `FI${gi + 1}`,
      modules: supply3f ? 4 : 2,
      label: supply3f ? "63A" : "40A",
      poles: supply3f ? "4P" : "2P",
      caption: `Wyłącznik różnicowoprądowy ${r.rating}`,
      phase: supply3f ? "3F" : "L1",
      key: `rcd-${r.id}`,
    });
    r.circuits.forEach((c) => {
      const threePhase = c.breaker.includes("3-faz.");
      mcbNo += 1;
      devices.push({
        uid: "",
        kind: "mcb",
        tag: `F${mcbNo}`,
        modules: threePhase ? 3 : 1,
        label: c.breaker.replace(" 3-faz.", ""),
        caption: c.name,
        poles: threePhase ? "3P" : "1P",
        phase: threePhase ? "3F" : "",
        type: c.type,
        cable: c.cable,
        rcdTag: `FI${gi + 1}`,
        key: `mcb-${c.id}`,
      });
    });
  });

  const withPhases = supply3f
    ? balancePhases(devices)
    : devices.map((d) => (d.kind === "mcb" && d.poles === "1P" ? { ...d, phase: "L1" as const } : d));
  return withPhases.map((d, i) => ({ ...d, uid: `${d.tag}-${i}` }));
}

export interface PhaseLoad {
  L1: number;
  L2: number;
  L3: number;
}

/** Bilans obciążenia faz — suma prądów znamionowych zabezpieczeń 1-biegunowych
 *  przypisanych do każdej fazy (3-biegunowe liczą się do wszystkich trzech). */
export function computePhaseLoad(devices: PanelDevice[]): PhaseLoad {
  const load: PhaseLoad = { L1: 0, L2: 0, L3: 0 };
  devices.forEach((d) => {
    if (d.kind !== "mcb") return;
    const i = ratedCurrent(d.label);
    if (d.poles === "3P") {
      load.L1 += i;
      load.L2 += i;
      load.L3 += i;
    } else if (d.phase === "L1" || d.phase === "L2" || d.phase === "L3") {
      load[d.phase] += i;
    }
  });
  return load;
}

export type SelectivityLevel = "error" | "warn" | "info" | "ok";

export interface SelectivityFinding {
  level: SelectivityLevel;
  title: string;
  detail: string;
}

/** Analiza selektywności i poprawności doboru zabezpieczeń. Zwraca listę spostrzeżeń:
 *  błędy (do poprawy), ostrzeżenia i informacje. Reguły są uproszczone — pełną
 *  selektywność zwarciową potwierdzają wyłącznie tabele producenta dla konkretnej
 *  pary aparatów. Przeniesione 1:1 z `computeSelectivity` w wersji JS. */
export function computeSelectivity(
  devices: PanelDevice[],
  mainRating: number,
  supply3f: boolean,
  spdEnabled: boolean,
  /** Rzeczywiste obciążenie faz [A] policzone z prądów obliczeniowych. Bez tego
   *  bilans liczy się z prądów ZNAMIONOWYCH zabezpieczeń, co rozkłada równo
   *  aparaty, a nie obciążenie — patrz `phaseBalance` w `project.ts`. */
  phaseLoadOverride?: PhaseLoad
): SelectivityFinding[] {
  const out: SelectivityFinding[] = [];
  const mcbs = devices.filter((d) => d.kind === "mcb" && ratedCurrent(d.label) > 0);
  const rcds = devices.filter((d) => d.kind === "rcd");

  // 1. żaden obwód nie może mieć zabezpieczenia większego niż rozłącznik główny
  const tooBig = mcbs.filter((d) => ratedCurrent(d.label) > mainRating);
  if (tooBig.length) {
    out.push({
      level: "error",
      title: "Zabezpieczenie obwodu większe niż rozłącznik główny",
      detail: `${tooBig.map((d) => `${d.tag} (${d.label})`).join(", ")} — przy zwarciu zadziała aparat główny i pozbawi zasilania cały budynek. Zwiększ rozłącznik główny (obecnie ${mainRating} A) albo zmniejsz zabezpieczenie obwodu.`,
    });
  }

  // 2. stopniowanie prądów — dla selektywności przeciążeniowej przyjmuje się krotność ok. 1,6
  const weak = mcbs.filter((d) => {
    const i = ratedCurrent(d.label);
    return i <= mainRating && mainRating / i < 1.6;
  });
  if (weak.length) {
    out.push({
      level: "warn",
      title: "Zbyt małe stopniowanie względem aparatu głównego",
      detail: `${weak.map((d) => `${d.tag} (${d.label})`).join(", ")} — stosunek prądów poniżej 1,6. Przy przeciążeniu może zadziałać aparat główny zamiast obwodowego. Zalecane In(główny) ≥ 1,6 × In(obwodu).`,
    });
  }

  // 3. różnicówka musi być zabezpieczona nadprądowo — jej prąd znamionowy nie może być
  //    mniejszy niż prąd aparatu, który ją chroni
  const weakRcd = rcds.filter((d) => ratedCurrent(d.label) > 0 && ratedCurrent(d.label) < mainRating);
  if (weakRcd.length) {
    out.push({
      level: "error",
      title: "Różnicówka niezabezpieczona przed przeciążeniem",
      detail: `${weakRcd.map((d) => `${d.tag} (${d.label})`).join(", ")} — prąd znamionowy mniejszy od rozłącznika głównego (${mainRating} A). Wyłącznik różnicowoprądowy nie ma własnego zabezpieczenia zwarciowego: dobierz go na prąd ≥ ${mainRating} A albo poprzedź osobnym wyłącznikiem nadprądowym.`,
    });
  }

  // 4. liczba obwodów przypadająca na jedną różnicówkę
  const perRcd: Record<string, number> = {};
  mcbs.forEach((d) => {
    if (d.rcdTag) perRcd[d.rcdTag] = (perRcd[d.rcdTag] || 0) + 1;
  });
  const overloaded = Object.entries(perRcd).filter(([, n]) => n > 6);
  if (overloaded.length) {
    out.push({
      level: "warn",
      title: "Dużo obwodów za jedną różnicówką",
      detail: `${overloaded.map(([t, n]) => `${t}: ${n} obwodów`).join(", ")} — prądy upływowe odbiorników sumują się, co grozi przypadkowymi wyłączeniami. Zalecane maks. 6 obwodów na jeden RCD 30 mA.`,
    });
  }

  // 5. selektywność różnicowoprądowa — RCD nadrzędny powinien być typu S
  if (rcds.length > 1) {
    out.push({
      level: "info",
      title: "Selektywność różnicowoprądowa",
      detail: `W rozdzielnicy jest ${rcds.length} wyłączników różnicowoprądowych pracujących równolegle. Jeśli któryś ma być nadrzędny (szeregowo przed pozostałymi), musi być typu S (zwłocznego) i mieć prąd różnicowy co najmniej 3× większy od podrzędnych.`,
    });
  }

  // 6. ogranicznik przepięć
  if (!spdEnabled) {
    out.push({
      level: "warn",
      title: "Brak ogranicznika przepięć",
      detail: "Instalacja nie ma ochrony przepięciowej. Przy zasilaniu napowietrznym lub instalacji odgromowej ochrona przepięciowa jest zalecana, a w wielu przypadkach wymagana.",
    });
  }

  // 7. bilans faz
  if (supply3f) {
    const load = phaseLoadOverride ?? computePhaseLoad(devices);
    const spread = round1(Math.max(load.L1, load.L2, load.L3) - Math.min(load.L1, load.L2, load.L3));
    if (spread > 32) {
      out.push({
        level: "warn",
        title: "Nierównomierne obciążenie faz",
        detail: `Różnica między najbardziej i najmniej obciążoną fazą wynosi ${spread} A (L1: ${load.L1} A, L2: ${load.L2} A, L3: ${load.L3} A). Użyj przycisku „Wyrównaj fazy” lub zmień przypisanie obwodów w tabeli.`,
      });
    }
  }

  if (!out.some((o) => o.level === "error" || o.level === "warn")) {
    out.push({
      level: "ok",
      title: "Nie wykryto problemów",
      detail: "Przyjęte reguły stopniowania i doboru zabezpieczeń są spełnione. Selektywność zwarciową potwierdź tabelami producenta aparatów.",
    });
  }
  return out;
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

export interface PanelSlot extends PanelDevice {
  index: number;
  slot: number;
}

/** Rozkłada aparaty na rzędy szyny DIN — aparat nie może być „przecięty” między rzędami. */
export function layoutPanel(devices: PanelDevice[], perRow: number): PanelSlot[][] {
  const rows: PanelSlot[][] = [];
  let cur: PanelSlot[] = [];
  let used = 0;
  devices.forEach((d, index) => {
    if (used + d.modules > perRow) {
      rows.push(cur);
      cur = [];
      used = 0;
    }
    cur.push({ ...d, index, slot: used });
    used += d.modules;
  });
  if (cur.length) rows.push(cur);
  return rows;
}
