import type { PanelConfig, PanelDevice, RcdGroup, UkladSieci } from "@/types";
import { colorForCircuit } from "./circuits";
import { slowoLiczby, zLiczba } from "@/lib/liczby";

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

/** Zabezpieczenie przedlicznikowe przyjmowane, gdy projekt go nie podaje — najczęstsze
 *  w domach i mieszkaniach. To DOMYSŁ, stąd ostrzeżenie w Rozdzielnicy, żeby go sprawdzić. */
export const DOMYSLNE_PRZEDLICZNIKOWE = 25;
/** Najczęstszy przypadek przy przyłączu kablowym 4-żyłowym: PEN rozdzielany w rozdzielnicy. */
export const DOMYSLNY_UKLAD_SIECI: UkladSieci = "TN-C-S";

/** Układy sieci, które obsługuje rysunek rozdzielnicy. Protokoły znają jeszcze TN-C i IT. */
export const UKLADY_SIECI_ROZDZIELNICY: readonly UkladSieci[] = ["TN-C-S", "TN-S", "TT"];
export function jestUklademRozdzielnicy(u: string | undefined): u is UkladSieci {
  return !!u && (UKLADY_SIECI_ROZDZIELNICY as readonly string[]).includes(u);
}

/** Ustawienia zasilania z uzupełnionymi domysłami — jedno miejsce dla wszystkich widoków. */
export function zasilanieRozdzielnicy(c: Pick<PanelConfig, "przedlicznikowe" | "ukladSieci">): {
  przedlicznikowe: number;
  uklad: UkladSieci;
} {
  return { przedlicznikowe: c.przedlicznikowe ?? DOMYSLNE_PRZEDLICZNIKOWE, uklad: c.ukladSieci ?? DOMYSLNY_UKLAD_SIECI };
}

/**
 * Liczba biegunów do OPISU aparatu.
 *
 * Przy ograniczniku przepięć „4P" nie mówi tego, co istotne: czy między N a PE stoi
 * iskiernik (3+1), czy warystor (4+0). SPD w tej aplikacji stoi zawsze ZA rozdziałem
 * PEN (patrz schemat), więc wariant 3+1 / 1+1 jest poprawny w TN-S, TN-C-S i TT —
 * a w TT jest wręcz jedynym właściwym.
 */
export function opisBiegunow(d: Pick<PanelDevice, "kind" | "poles">): string {
  if (d.kind === "spd") {
    if (d.poles === "4P") return "3+1";
    if (d.poles === "2P") return "1+1";
  }
  return d.poles;
}

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
 *  Prefiks wg IEC 81346: F — zabezpieczenia, Q — łączniki, K — styczniki/przekaźniki/czujniki,
 *  T — zasilacze/transformatory, P — sygnalizacja. SPD i jego bezpiecznik dostają osobną serię
 *  sekcji zasilania (`PREFIKS_SEKCJI_ZASILANIA`), a nie prefiks z katalogu — patrz `prefiksAparatu`. */
export const MANUAL_DEVICE_TYPES: ManualDeviceType[] = [
  { key: "mcb", label: "Wyłącznik nadprądowy", prefix: "F", modules: 1, poles: "1P", defLabel: "B16", accent: "#2D5A8C", ratings: ["B6", "B10", "B13", "B16", "B20", "B25", "C10", "C16", "C20", "C25", "C32"] },
  // Domyślnie 3P/3 moduły (wariant 3-fazowy) — przy zmianie na 1P w edycji aparatu
  // `SUGEROWANE_MODULY` w EditDeviceModal sam przeliczy szerokość na 1 moduł. Liczba
  // biegunów wybiera też symbol na schemacie: `GLYPHS.rozBezp3f` z trzema kreskami
  // wkładki dla 3P, `rozBezp1f` z jedną dla reszty (patrz `CircuitBranch` w SchemaTab).
  { key: "rozBezp", label: "Rozłącznik izolacyjny bezpiecznikowy", prefix: "Q", modules: 3, poles: "3P", defLabel: "gG 63A", accent: "#2D5A8C", ratings: ["gG 16A", "gG 20A", "gG 25A", "gG 32A", "gG 40A", "gG 63A", "gG 80A", "gG 100A", "gG 125A"] },
  { key: "rcbo", label: "Wyłącznik różnicowo-nadprądowy", prefix: "F", modules: 2, poles: "1P+N", defLabel: "B16/30mA", accent: "#C1793F", ratings: ["B10/30mA", "B16/30mA", "B20/30mA", "C16/30mA"] },
  { key: "rcd", label: "Wyłącznik różnicowoprądowy", prefix: "FI", modules: 2, poles: "2P", defLabel: "40A/30mA", accent: "#C1793F", ratings: ["25A/30mA", "40A/30mA", "63A/30mA", "40A/300mA", "63A/300mA"] },
  // Domyślnie 4P/4 moduły jak przy zasilaniu 3-fazowym — przy dodawaniu ręcznym
  // (patrz `addManualDevice` w PanelTab) przeliczane na 2P/2 moduły dla instalacji
  // 1-fazowej, tym samym wzorem co rozłącznik główny: SPD musi mieć tyle biegunów,
  // ile przewodów fazowych i N dochodzi do rozdzielnicy, a to zależy od zasilania,
  // nie od samego typu aparatu.
  { key: "spd", label: "Ogranicznik przepięć (SPD)", prefix: "F", modules: 4, poles: "4P", defLabel: "T1+T2", accent: "#3B8C63", ratings: ["T1", "T2", "T1+T2"] },
  // Bezpiecznik pod ogranicznik przepięć. Do dołożenia RĘCZNIE, gdy wytrzymałość
  // zwarciowa SPD jest niższa od spodziewanego prądu zwarcia i nie pokrywa jej
  // zabezpieczenie nadrzędne — dane z karty katalogowej konkretnego ogranicznika.
  { key: "spdFuse", label: "Bezpiecznik pod SPD", prefix: "F", modules: 1, poles: "1P", defLabel: "gG 63A", accent: "#B98C2F", ratings: ["gG 25A", "gG 32A", "gG 40A", "gG 63A", "gG 80A"] },
  { key: "ovr", label: "Czujnik zaniku i asymetrii faz (CZF)", prefix: "K", modules: 1, poles: "3P", defLabel: "CZF", accent: "#C6433A", ratings: ["CZF", "CZN", "OVR"] },
  { key: "ppoz", label: "Rozłącznik przeciwpożarowy", prefix: "Q", modules: 2, poles: "4P", defLabel: "63A", accent: "#C6433A", ratings: ["40A", "63A", "80A", "100A"] },
  { key: "stycznik", label: "Stycznik modułowy", prefix: "K", modules: 2, poles: "2P", defLabel: "20A", accent: "#3B8C63", ratings: ["16A", "20A", "25A", "40A", "63A"] },
  { key: "przekaznik", label: "Przekaźnik bistabilny", prefix: "K", modules: 1, poles: "1P", defLabel: "16A", accent: "#3B8C63", ratings: ["10A", "16A"] },
  { key: "zasilacz", label: "Zasilacz modułowy", prefix: "T", modules: 2, poles: "—", defLabel: "12V DC", accent: "#0F8A9E", ratings: ["12V DC", "24V DC", "24V AC"] },
  { key: "lampka", label: "Lampka sygnalizacyjna", prefix: "P", modules: 1, poles: "3P", defLabel: "L1-L2-L3", accent: "#3B8C63", ratings: ["L1-L2-L3", "230V"] },
  { key: "blank", label: "Rezerwa (zaślepka)", prefix: "", modules: 1, poles: "—", defLabel: "", accent: "#94A3B8", ratings: [""] },
];

/**
 * Dokłada aparat z katalogu na koniec listy — liczba biegunów, szerokość, faza i
 * połączenie szeregowe tam, gdzie wynikają z reszty rozdzielnicy.
 *
 * SPD i RCD rozłączają / obejmują WSZYSTKIE przewody robocze dochodzące do rozdzielnicy
 * (L+N albo L1L2L3+N), więc ich bieguny i szerokość idą z zasilania, tym samym wzorem,
 * którym `buildPanelDevices` liczy rozłącznik główny i różnicówki z automatu.
 *
 * Rozłącznik przeciwpożarowy stoi na dopływie: przy TN-C-S przed rozdziałem PEN, więc
 * rozłącza tylko fazy (PEN-u rozłączać nie wolno); w TN-S i TT — fazy i N. Szerokość
 * zostaje katalogowa — kompaktowe warianty 4P mieszczą się w 2 modułach.
 *
 * Bezpiecznik pod SPD musi mieć tyle torów, ile SPD ma przewodów fazowych — przy
 * zasilaniu 3-fazowym trzy wkładki, nie jedna (audyt rozdzielnicy 15.11.2026, błąd 5).
 * Bezpiecznik i SPD bez pary łączą się ze sobą od razu: obok siebie, równolegle,
 * bezpiecznik nie chroniłby niczego.
 */
export function dolozAparatReczny(
  prev: PanelDevice[],
  def: ManualDeviceType,
  pola: { uid: string; label?: string; caption?: string },
  zasilanie: { supply3f: boolean; uklad: UkladSieci }
): PanelDevice[] {
  const { supply3f, uklad } = zasilanie;
  let poles = def.poles;
  let modules = def.modules;
  if (def.key === "spd" || def.key === "rcd") {
    poles = supply3f ? "4P" : "2P";
    modules = supply3f ? 4 : 2;
  } else if (def.key === "ppoz") {
    poles = uklad === "TN-C-S" ? (supply3f ? "3P" : "1P") : supply3f ? "4P" : "2P";
  } else if (def.key === "spdFuse") {
    poles = supply3f ? "3P" : "1P";
    modules = supply3f ? 3 : 1;
  }

  const prefiks = prefiksAparatu(def);
  const tag = prefiks ? nastepneOznaczenie(prev, prefiks) : "";
  const nowy: PanelDevice = {
    uid: pola.uid,
    kind: def.key,
    manual: true,
    tag,
    modules,
    label: pola.label || def.defLabel,
    caption: pola.caption || def.label,
    poles,
    phase: supply3f && jednofazowy(poles) ? "L1" : supply3f ? "3F" : "L1",
  };

  // Para SPD ↔ bezpiecznik: nowy aparat łączy się z pierwszym, który pary jeszcze nie ma.
  let lista = prev;
  if (def.key === "spdFuse") {
    const spdBezBezpiecznika = prev.find((d) => d.kind === "spd" && !rodzicAparatu(d, prev));
    if (spdBezBezpiecznika) lista = prev.map((d) => (d === spdBezBezpiecznika ? { ...d, zasilanyZ: tag } : d));
  }
  if (def.key === "spd") {
    const wolnyBezpiecznik = prev.find((d) => d.kind === "spdFuse" && !prev.some((s) => s.kind === "spd" && rodzicAparatu(s, prev) === d));
    if (wolnyBezpiecznik) nowy.zasilanyZ = wolnyBezpiecznik.tag;
  }

  /*
   * SPD i jego bezpiecznik — od razu za rozłącznikiem głównym, nie na końcu szyny.
   * Przewody przyłączeniowe SPD mają być jak najkrótsze (zalecenie ≤ 0,5 m), a aparat
   * wstawiony na koniec ostatniego rzędu ciągnie je przez całą rozdzielnicę.
   */
  if (def.key === "spd" || def.key === "spdFuse") {
    let i = lista[0]?.kind === "main" ? 1 : -1;
    if (i > 0) {
      while (i < lista.length && (lista[i].kind === "spd" || lista[i].kind === "spdFuse")) i++;
      return [...lista.slice(0, i), nowy, ...lista.slice(i)];
    }
  }
  return [...lista, nowy];
}

/** Seria oznaczeń sekcji zasilania: SPD i jego bezpiecznik jako F0.1, F0.2… */
export const PREFIKS_SEKCJI_ZASILANIA = "F0.";

/**
 * Prefiks oznaczenia aparatu dokładanego ręcznie.
 *
 * Konwencja projektu (pakiet 3 audytu rozdzielnicy, 15.11.2026): F1…Fn to zabezpieczenia
 * OBWODÓW — numer aparatu zgadza się z numerem obwodu. SPD i jego bezpiecznik należą do
 * sekcji zasilania i mają osobną serię F0.x, żeby nie przesuwać numeracji obwodów.
 * Różnicówki zostają FI (praktyka krajowa; w IEC 81346-2 to też klasa F), czujnik
 * zaniku fazy — K, jak styczniki i przekaźniki.
 */
export function prefiksAparatu(def: Pick<ManualDeviceType, "key" | "prefix">): string {
  return def.key === "spd" || def.key === "spdFuse" ? PREFIKS_SEKCJI_ZASILANIA : def.prefix;
}

/** „F12" → ["F", 12], „F0.3" → ["F0.", 3], „FI2" → ["FI", 2]; bez numeru na końcu — null. */
function rozbiorOznaczenia(tag: string): [string, number] | null {
  const m = String(tag ?? "").match(/^(.*?)(\d+)$/);
  return m ? [m[1], Number(m[2])] : null;
}

/**
 * Następne wolne oznaczenie w serii `prefix`: największy użyty numer + 1.
 *
 * Wcześniej numer brał się z LICZBY aparatów, których oznaczenie ZACZYNA SIĘ od prefiksu.
 * „F" łapało więc także „FI1", „FI2" (luka w numeracji), a po skasowaniu aparatu licznik
 * malał i następny dostawał numer już zajęty (audyt rozdzielnicy 15.11.2026, błąd 11).
 */
export function nastepneOznaczenie(devices: readonly Pick<PanelDevice, "tag">[], prefix: string): string {
  const numery = devices.flatMap((d) => {
    const r = rozbiorOznaczenia(d.tag);
    return r && r[0] === prefix ? [r[1]] : [];
  });
  return `${prefix}${(numery.length ? Math.max(...numery) : 0) + 1}`;
}

/**
 * Usuwa powtórzone oznaczenia: aparaty z automatu (z rzutu) zachowują swoje, a aparat
 * ręczny, którego oznaczenie jest już zajęte, dostaje następne wolne w swojej serii.
 *
 * Kolizja powstaje sama: ręczny wyłącznik dostał „F12", a po dołożeniu obwodu na rzucie
 * automat numeruje obwody F1…F12 od nowa. Odwołania innych aparatów ręcznych
 * (`zasilanyZ`, `rcdTag`) idą za przemianowanym aparatem — wskazywały właśnie jego.
 */
export function ujednolicOznaczenia(devices: PanelDevice[]): PanelDevice[] {
  const zajete = new Set(devices.filter((d) => !d.manual && d.tag).map((d) => d.tag));
  const zmiany = new Map<string, string>();
  const przemianowane = devices.map((d) => {
    if (!d.manual || !d.tag) return d;
    if (!zajete.has(d.tag)) {
      zajete.add(d.tag);
      return d;
    }
    const prefix = rozbiorOznaczenia(d.tag)?.[0] ?? d.tag;
    const nowy = nastepneOznaczenie([...zajete].map((tag) => ({ tag })), prefix);
    zajete.add(nowy);
    zmiany.set(d.tag, nowy);
    return { ...d, tag: nowy };
  });
  if (!zmiany.size) return devices;
  return przemianowane.map((d) => {
    if (!d.manual) return d;
    const zasilanyZ = d.zasilanyZ && zmiany.get(d.zasilanyZ);
    const rcdTag = d.rcdTag && zmiany.get(d.rcdTag);
    return zasilanyZ || rcdTag ? { ...d, ...(zasilanyZ ? { zasilanyZ } : {}), ...(rcdTag ? { rcdTag } : {}) } : d;
  });
}

/**
 * Kolejność po odbudowie z rzutu — taka, jaką użytkownik ułożył.
 *
 * W trybie „z rzutu" lista aparatów jest liczona od nowa przy każdej zmianie planu, a
 * aparaty ręczne doklejane na koniec. Każde przestawienie (strzałkami albo
 * przeciągnięciem) ginęło więc przy następnym elemencie postawionym na rzucie, a SPD
 * lądował z powrotem na końcu szyny (audyt rozdzielnicy 15.11.2026, błąd 12).
 *
 * Aparaty, które były już na liście, zostają w dotychczasowej kolejności; nowe wchodzą
 * zaraz za aparatem, który poprzedza je w świeżo policzonej liście. Tożsamość: klucz
 * obwodu dla aparatów z automatu, `uid` dla ręcznych.
 */
export function zachowajKolejnosc(poprzednie: PanelDevice[], swieze: PanelDevice[]): PanelDevice[] {
  const id = (d: PanelDevice) => (d.manual || !d.key ? `u:${d.uid}` : `k:${d.key}`);
  const pozycja = new Map(poprzednie.map((d, i) => [id(d), i]));
  const znane = swieze.filter((d) => pozycja.has(id(d))).sort((a, b) => pozycja.get(id(a))! - pozycja.get(id(b))!);
  const wynik = [...znane];
  swieze.forEach((d, i) => {
    if (pozycja.has(id(d))) return;
    // Najbliższy poprzednik w świeżej liście, który już stoi w wyniku.
    let j = i - 1;
    while (j >= 0 && !wynik.includes(swieze[j])) j--;
    const gdzie = j >= 0 ? wynik.indexOf(swieze[j]) + 1 : 0;
    wynik.splice(gdzie, 0, d);
  });
  return wynik;
}

/** Biegunowość aparatu jednofazowego — z N albo bez. */
function jednofazowy(poles: string): boolean {
  return poles === "1P" || poles === "1P+N";
}

/**
 * Zabezpieczenie obwodu jednofazowego, któremu przydziela się fazę L1/L2/L3.
 * RCBO (1P+N) też — wcześniej pomijany, dostawał „3F" i na froncie trzy kropki faz
 * (audyt rozdzielnicy 15.11.2026, błąd 10).
 */
export function jestJednofazowymZabezpieczeniem(d: Pick<PanelDevice, "kind" | "poles">): boolean {
  return (d.kind === "mcb" || d.kind === "rcbo") && jednofazowy(d.poles);
}

/**
 * Zapisuje zmiany jednego aparatu — a gdy zmienia się jego OZNACZENIE, przenosi na nowe
 * wszystkie odwołania innych aparatów: `zasilanyZ` (aparaty szeregowo pod nim) i `rcdTag`
 * (obwody pod różnicówką). Bez tego zmiana „F12" na „F0" odpinała lampkę od wyłącznika,
 * a „FI1" na „FI-1" wyrzucała obwody spod różnicówki — po cichu, bo oba pola trzymają
 * oznaczenie, nie identyfikator.
 */
export function przemianujAparat(devices: PanelDevice[], uid: string, zmiany: Partial<PanelDevice>): PanelDevice[] {
  const stary = devices.find((d) => d.uid === uid)?.tag;
  const nowy = zmiany.tag;
  const zmianaTagu = !!stary && !!nowy && nowy !== stary;
  return devices.map((d) => {
    if (d.uid === uid) return { ...d, ...zmiany };
    if (!zmianaTagu) return d;
    const pod = d.zasilanyZ === stary ? { zasilanyZ: nowy } : {};
    const rcd = d.rcdTag === stary ? { rcdTag: nowy } : {};
    return Object.keys(pod).length || Object.keys(rcd).length ? { ...d, ...pod, ...rcd } : d;
  });
}

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

/**
 * Czy ten aparat wolno skasować.
 *
 * Rozłącznik główny jest punktem, z którego wychodzi cała reszta — rozdzielnica bez
 * niego nie jest rozdzielnicą, więc kasowanie go nie ma sensownego wyniku. Zaślepka
 * to z kolei puste miejsce na szynie, a nie aparat: nie ma tam czego kasować, bo
 * zniknięcie „niczego" nie zmienia rysunku.
 *
 * Osobna funkcja, bo pytają o to DWA miejsca i muszą odpowiadać tak samo: kółko „×"
 * na licu aparatu (`PanelRender`) i przycisk w oknie edycji (`EditDeviceModal`).
 * Rozjazd między nimi znaczyłby, że jedna droga kasuje coś, czego druga broni.
 */
/**
 * Czy aparat rysujemy jako gałąź odpływową pod szyną (MCB, RCBO, stycznik…).
 * Wyklucza aparaty, które mają już własne, osobne miejsce na schemacie (main/spd/rcd/
 * lampka) oraz `blank` — zaślepka nie jest prawdziwym aparatem, nie ma czego rysować.
 * Wcześniej ten filtr sprawdzał wyłącznie `kind === "mcb"`, więc cały reszta katalogu
 * (stycznik, przekaźnik, zasilacz, lampka, CZF, rozłącznik ppoż, RCBO…) po prostu
 * znikała ze schematu bez żadnego ostrzeżenia. Lampka dostała WŁASNE miejsce (patrz
 * `LampkaBranch`) zamiast rzędu wyłączników obwodowych, więc wypadła z tego filtru tak
 * samo jak main/spd/rcd.
 *
 * Wspólne dla schematu i paska etapów (App.tsx): etap „Schemat" jest gotowy dopiero,
 * gdy jest co narysować — sam rozłącznik główny to jeszcze nie schemat.
 */
export function jestOdplywem(d: Pick<PanelDevice, "kind">): boolean {
  // Rozłącznik przeciwpożarowy też nie: odcina CAŁY budynek, więc stoi na dopływie przed
  // rozłącznikiem głównym (patrz `RozlacznikPpoz` w SchemaTab), a nie jako jeden z odpływów.
  return d.kind !== "main" && d.kind !== "spd" && d.kind !== "rcd" && d.kind !== "blank" && d.kind !== "lampka" && d.kind !== "ppoz";
}

/** Aparaty, które mogą zasilać inny aparat szeregowo — mają człon zabezpieczający. */
export const RODZAJE_ZABEZPIECZAJACE: readonly string[] = ["mcb", "rcbo", "spdFuse", "rozBezp"];
/**
 * Aparaty, które same nie zabezpieczają obwodu i powinny stać ZA zabezpieczeniem:
 * SPD za bezpiecznikiem (gdy jego wytrzymałość zwarciowa tego wymaga), stycznik
 * i przekaźnik za wyłącznikiem obwodu, który łączą, zasilacz, lampka i CZF za
 * własnym wyłącznikiem lub bezpiecznikiem (audyt rozdzielnicy 15.11.2026, błędy 5 i 7).
 */
export const RODZAJE_POMOCNICZE: readonly string[] = ["spd", "stycznik", "przekaznik", "zasilacz", "lampka", "ovr"];

/**
 * Aparat, z którego `d` jest zasilany szeregowo — albo `undefined`, gdy stoi wprost na
 * szynie głównej. Wskazanie aparatu, którego już nie ma (skasowany) albo który niczego
 * nie zabezpiecza, liczy się jak brak: rysunek nie może podpiąć aparatu pod coś, co
 * nie istnieje, a reguły mają to zgłosić.
 */
export function rodzicAparatu(d: Pick<PanelDevice, "kind" | "zasilanyZ">, devices: readonly PanelDevice[]): PanelDevice | undefined {
  if (!d.zasilanyZ || !RODZAJE_POMOCNICZE.includes(d.kind)) return undefined;
  return devices.find((x) => x.tag === d.zasilanyZ && RODZAJE_ZABEZPIECZAJACE.includes(x.kind));
}

/** Aparaty zasilane szeregowo z `rodzic`, w kolejności listy. */
export function dzieciAparatu(rodzic: PanelDevice, devices: readonly PanelDevice[]): PanelDevice[] {
  return devices.filter((d) => rodzicAparatu(d, devices) === rodzic);
}

/**
 * Podpis przewodu pod aparatem na froncie rozdzielnicy.
 *
 * Pełny podpis („3x2,5 mm²") ma przy czcionce frontu ok. 42 px, a aparat jednomodułowy
 * — 30 px. Nad rzędem wąskich wyłączników podpisy zlewały się w jeden ciąg
 * („3x2,5 mm²3x2,5 mm²3x2,5…"). Przy aparacie o szerokości jednego modułu zostaje
 * więc sam przekrój („2,5") — liczba żył wynika z rodzaju obwodu, a pełny opis jest
 * w dymku, na liście aparatów i w tabeli doboru. Szersze aparaty mają miejsce na całość.
 */
export function podpisPrzewoduNaFroncie(kabel: string, moduly: number): string {
  const bezTypu = kabel.replace(/^YDYp\s+/, "");
  if (moduly >= 2) return bezTypu;
  const m = bezTypu.match(/^\d+\s*[x×]\s*([\d.,]+)/);
  return m ? m[1] : bezTypu;
}

/**
 * Czułość i typ różnicówki do opisu na schemacie: „30 mA · typ B".
 *
 * Z samego „4P · 63A" nie wynika, czy aparat w ogóle chroni obwód, który ma pod sobą —
 * ładowarka EV wymaga typu B, a ten na rysunku nie różnił się niczym od typu A.
 * Czyta z etykiety i podpisu, bo aparat z automatu niesie czułość i typ w podpisie,
 * a dołożony ręcznie — czułość w etykiecie („40A/30mA").
 */
export function czuloscITypRcd(d: Pick<PanelDevice, "label" | "caption">): string | null {
  const tekst = `${d.label ?? ""} ${d.caption ?? ""}`;
  const idn = tekst.match(/(\d+)\s*mA/i)?.[1];
  const typ = tekst.match(/\btyp\s+(AC|A|F|B)\b/i)?.[1]?.toUpperCase();
  const czesci = [idn ? `${idn} mA` : null, typ ? `typ ${typ}` : null].filter(Boolean);
  return czesci.length ? czesci.join(" · ") : null;
}

/**
 * Plakietka różnicówki na froncie: „FI2 · 30 mA", a przy typie innym niż A — z typem:
 * „FI4 · 30 mA · B".
 *
 * Wcześniej stało tam na sztywno „30 mA" — także nad różnicówką 300 mA (audyt
 * rozdzielnicy 15.11.2026, pkt 13). Typ A jest domyślny i najczęstszy, więc nie
 * zajmuje miejsca; inny typ (B przy ładowarce, F przy falowniku) jest właśnie tym,
 * co trzeba zobaczyć na froncie.
 */
export function plakietkaRcd(d: Pick<PanelDevice, "tag" | "label" | "caption">): string {
  const opis = czuloscITypRcd(d);
  const ma = opis?.match(/(\d+)\s*mA/)?.[1];
  const typ = opis?.match(/typ\s+(\w+)/)?.[1];
  return [d.tag, ma ? `${ma} mA` : null, typ && typ !== "A" ? typ : null].filter(Boolean).join(" · ");
}

export function daSieSkasowac(d: Pick<PanelDevice, "kind">): boolean {
  return d.kind !== "main" && d.kind !== "blank";
}

/** Wyciąga prąd znamionowy z etykiety aparatu (np. "B16" -> 16, "C25 3-faz." -> 25). */
export function ratedCurrent(label: string): number {
  const m = String(label || "").match(/(\d+)/);
  return m ? Number(m[1]) : 0;
}

/**
 * Rozdziela obwody 1-fazowe równomiernie na L1/L2/L3, zawsze dokładając do fazy
 * aktualnie najmniej obciążonej — inaczej rośnie prąd w przewodzie neutralnym.
 *
 * Waży PRĄDEM OBLICZENIOWYM obwodu (`pradyWgKlucza`, klucz aparatu `mcb-<id obwodu>`),
 * a prądem znamionowym zabezpieczenia tylko wtedy, gdy obliczeniowego nie ma (aparat
 * dołożony ręcznie). Dwa B16 wyglądają tak samo „po zabezpieczeniu", a jeden ciągnie
 * 3 A, drugi 15 A — w przewodzie N płynie obciążenie, nie nastawa.
 *
 * Wcześniej ta funkcja ważyła samym In, a tabela doboru w Rozdzielnicy przydzielała
 * fazy osobnym algorytmem po Ib. Ten sam obwód dostawał przez to dwie różne fazy:
 * jedną na froncie i schemacie, drugą w tabeli i bilansie. Teraz fazę nadają WYŁĄCZNIE
 * aparaty, a tabela ją od nich czyta (patrz `fazyZRozdzielnicy`).
 */
export function balancePhases(devices: PanelDevice[], pradyWgKlucza?: ReadonlyMap<string, number>): PanelDevice[] {
  const load: Record<"L1" | "L2" | "L3", number> = { L1: 0, L2: 0, L3: 0 };
  const obciazenie = (d: PanelDevice) => (d.key !== undefined ? pradyWgKlucza?.get(d.key) : undefined) ?? ratedCurrent(d.label);
  return devices.map((d) => {
    if (!jestJednofazowymZabezpieczeniem(d)) return d;
    const target = (["L1", "L2", "L3"] as const).reduce((a, b) => (load[a] <= load[b] ? a : b));
    load[target] += obciazenie(d);
    return { ...d, phase: target };
  });
}

export interface BuildPanelDevicesOptions {
  supply3f?: boolean;
  mainRating?: number;
  /** Prąd obliczeniowy obwodu wg klucza aparatu (`mcb-<id>`) — waga bilansu faz. */
  pradyWgKlucza?: ReadonlyMap<string, number>;
  /** Zabezpieczenie przedlicznikowe [A] — różnicówka nie może być od niego słabsza. */
  przedlicznikowe?: number;
}

/** Szereg prądów znamionowych, w jakich faktycznie produkuje się wyłączniki
 *  różnicowoprądowe (2- i 4-biegunowe modułowe). */
const RCD_RATINGS = [25, 40, 63, 80, 100];

/**
 * Prąd znamionowy różnicówki dla danego rozłącznika głównego — musi być ≥ prądowi
 * rozłącznika głównego, inaczej różnicówka (bez własnego zabezpieczenia zwarciowego)
 * nie jest chroniona przed przeciążeniem od aparatu nadrzędnego (patrz reguła 3 w
 * `computeSelectivity`). Wcześniej rating był na sztywno „63A"/„40A" niezależnie od
 * wyboru rozłącznika głównego — przy 80 A rozdzielnica generowała z automatu
 * niepoprawny dobór i własne ostrzeżenie o nim, mimo że nikt niczego źle nie wybrał.
 * Dolny próg (63 A dla 3-fazowego zasilania, 40 A dla 1-fazowego) to najmniejszy
 * rozmiar typowo dostępny w tej klasie aparatu — mniejszy rozłącznik główny nie
 * schodzi poniżej niego. */
function rcdRatingFor(mainRating: number, supply3f: boolean, przedlicznikowe: number): number {
  const floor = supply3f ? 63 : 40;
  const need = Math.max(mainRating, przedlicznikowe, floor);
  return RCD_RATINGS.find((r) => r >= need) ?? RCD_RATINGS[RCD_RATINGS.length - 1];
}

/** Zamienia obwody na listę aparatów rozdzielnicy. Oznaczenia wg IEC 81346:
 *  Q — łączniki (rozłącznik główny), F — zabezpieczenia, FI — różnicowoprądowe.
 *
 * Ogranicznik przepięć (SPD) NIE jest tu generowany automatycznie — dawniej był
 * zawsze obecny (sterowany osobnym wyborem w pasku narzędzi), więc każda rozdzielnica
 * dostawała go z automatu, nawet w instalacjach, które go nie wymagają (np. bez
 * zasilania napowietrznego czy instalacji odgromowej). Jest teraz zwykłą pozycją
 * katalogu (patrz MANUAL_DEVICE_TYPES) — dokłada się go tak samo jak każde inne
 * zabezpieczenie, kiedy jest faktycznie potrzebny. Ostrzeżenie o jego braku
 * (patrz `computeSelectivity`) i tak zostaje, bo dotyczy każdej instalacji. */
export function buildPanelDevices(rcdGroups: RcdGroup[], opts: BuildPanelDevicesOptions = {}): PanelDevice[] {
  const { supply3f = true, mainRating = 40, pradyWgKlucza, przedlicznikowe = DOMYSLNE_PRZEDLICZNIKOWE } = opts;
  const devices: PanelDevice[] = [];
  const p = supply3f ? "4P" : "2P";
  const mod = supply3f ? 4 : 2;

  devices.push({ uid: "", kind: "main", tag: "Q1", modules: mod, label: `${mainRating}A`, caption: "Rozłącznik izolacyjny główny", poles: p, phase: supply3f ? "3F" : "L1", key: "main" });

  let mcbNo = 0;
  const rcdRating = rcdRatingFor(mainRating, supply3f, przedlicznikowe);
  rcdGroups.forEach((r, gi) => {
    devices.push({
      uid: "",
      kind: "rcd",
      tag: `FI${gi + 1}`,
      modules: supply3f ? 4 : 2,
      label: `${rcdRating}A`,
      poles: supply3f ? "4P" : "2P",
      // Pełne oznaczenie składane z JEDNEGO źródła prądu znamionowego (`rcdRating`,
      // ten sam, co trafia na etykietę aparatu) i czułości grupy — inaczej front
      // rozdzielnicy i podpis pod nim podawały dwa różne ampery.
      // Typ w podpisie, bo to on decyduje, czy aparat w ogóle chroni dany obwód —
      // RCD typu B do ładowarki kosztuje kilka razy więcej i w sklepie trzeba o nim wiedzieć.
      caption: `Wyłącznik różnicowoprądowy ${rcdRating}A/${r.rating} typ ${r.typ ?? "A"}`,
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
    ? balancePhases(devices, pradyWgKlucza)
    : devices.map((d) => (jestJednofazowymZabezpieczeniem(d) ? { ...d, phase: "L1" as const } : d));
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
    if (d.kind !== "mcb" && d.kind !== "rcbo") return;
    const i = ratedCurrent(d.label);
    if (d.poles === "3P" || d.poles === "3P+N") {
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
  phaseLoadOverride?: PhaseLoad,
  /** Zabezpieczenie przedlicznikowe i układ sieci — brak = domysły (patrz `zasilanieRozdzielnicy`). */
  zasilanie: Pick<PanelConfig, "przedlicznikowe" | "ukladSieci"> = {}
): SelectivityFinding[] {
  const out: SelectivityFinding[] = [];
  const { przedlicznikowe, uklad } = zasilanieRozdzielnicy(zasilanie);
  const mcbs = devices.filter((d) => d.kind === "mcb" && ratedCurrent(d.label) > 0);
  /** Aparaty obwodowe z członem nadprądowym — RCBO też zabezpiecza obwód. */
  const zabezpieczeniaObwodow = devices.filter((d) => (d.kind === "mcb" || d.kind === "rcbo") && ratedCurrent(d.label) > 0);
  const rcds = devices.filter((d) => d.kind === "rcd");

  /*
   * Aparatem nadrzędnym jest ZABEZPIECZENIE PRZEDLICZNIKOWE, nie rozłącznik główny.
   *
   * Rozłącznik izolacyjny nie ma wyzwalaczy: niczego nie wyłączy ani przy przeciążeniu,
   * ani przy zwarciu. Wcześniej reguły 1–3 liczyły się względem niego — „przy zwarciu
   * zadziała aparat główny", stopniowanie 1,6 × rozłącznik, różnicówka ≥ rozłącznik —
   * czyli sprawdzały koordynację z aparatem, który nie chroni, a pomijały ten, który
   * chroni naprawdę (audyt rozdzielnicy 15.11.2026, błąd 1).
   */

  // 1. rozłącznik główny nie może być słabszy od zabezpieczenia, które go chroni
  const glowny = devices.find((d) => d.kind === "main");
  if (glowny && mainRating < przedlicznikowe) {
    out.push({
      level: "error",
      title: "Rozłącznik główny słabszy niż zabezpieczenie przedlicznikowe",
      detail: `${glowny.tag} ma ${mainRating} A, a zabezpieczenie przedlicznikowe ${przedlicznikowe} A. Rozłącznik nie ma wyzwalaczy — przed przeciążeniem chroni go dopiero zabezpieczenie w złączu, więc prąd do ${przedlicznikowe} A popłynie przez aparat na ${mainRating} A. Dobierz rozłącznik o prądzie ≥ ${przedlicznikowe} A.`,
    });
  }

  // 2. obwód nie może mieć zabezpieczenia równego lub większego od przedlicznikowego
  const bezSelektywnosci = zabezpieczeniaObwodow.filter((d) => ratedCurrent(d.label) >= przedlicznikowe);
  if (bezSelektywnosci.length) {
    out.push({
      level: "warn",
      title: "Zabezpieczenie obwodu nie mniejsze niż przedlicznikowe",
      detail: `${bezSelektywnosci.map((d) => `${d.tag} (${d.label})`).join(", ")} — przy zabezpieczeniu przedlicznikowym ${przedlicznikowe} A nie ma selektywności: przy przeciążeniu lub zwarciu w tym obwodzie może zadziałać zabezpieczenie w złączu i odciąć cały budynek. Zmniejsz zabezpieczenie obwodu albo wystąp do operatora o większą moc przyłączeniową.`,
    });
  }

  // 3. różnicówka (bez członu nadprądowego) nie może być słabsza od aparatu nadrzędnego
  const weakRcd = rcds.filter((d) => ratedCurrent(d.label) > 0 && ratedCurrent(d.label) < przedlicznikowe);
  if (weakRcd.length) {
    out.push({
      level: "error",
      title: "Różnicówka niezabezpieczona przed przeciążeniem",
      detail: `${weakRcd.map((d) => `${d.tag} (${d.label})`).join(", ")} — prąd znamionowy mniejszy od zabezpieczenia przedlicznikowego (${przedlicznikowe} A). Wyłącznik różnicowoprądowy nie ma własnego członu nadprądowego, a rozłącznik główny niczego nie wyłącza. Dobierz różnicówkę na ≥ ${przedlicznikowe} A albo potwierdź w karcie producenta jej koordynację z wyłącznikami za nią.`,
    });
  }

  // 3a. obwody bez dodatkowej ochrony różnicowoprądowej 30 mA
  const czulosc30 = (rcd: PanelDevice | undefined) => {
    const ma = Number(czuloscITypRcd(rcd ?? { label: "", caption: "" })?.match(/(\d+)\s*mA/)?.[1] ?? NaN);
    // Różnicówka bez czytelnej czułości (stary opis „63A") pochodzi z automatu, który
    // daje wyłącznie 30 mA — nie podnosimy alarmu o czymś, czego nie da się odczytać.
    return rcd !== undefined && (Number.isNaN(ma) || ma <= 30);
  };
  /** Wyłącznik, który zasila wyłącznie aparaty w rozdzielnicy (lampka, CZF, zasilacz,
   *  SPD) — nie ma obwodu odbiorczego, więc wymóg 30 mA go nie dotyczy. Stycznik czy
   *  przekaźnik pod nim to już obwód odbiorczy, tylko łączony. */
  const tylkoAparatyWRozdzielnicy = (d: PanelDevice) => {
    const dzieci = dzieciAparatu(d, devices);
    return dzieci.length > 0 && dzieci.every((x) => ["lampka", "ovr", "zasilacz", "spd"].includes(x.kind));
  };
  const bez30mA = [
    ...mcbs.filter((d) => !czulosc30(rcds.find((r) => r.tag === d.rcdTag)) && !tylkoAparatyWRozdzielnicy(d)),
    // RCBO ma własny człon różnicowy — liczy się jego czułość, nie różnicówka nad nim.
    // Bez czytelnej czułości w opisie zakładamy 30 mA, jak w katalogu.
    ...devices.filter((d) => d.kind === "rcbo" && Number(czuloscITypRcd(d)?.match(/(\d+)\s*mA/)?.[1] ?? 30) > 30),
  ];
  if (bez30mA.length) {
    out.push({
      level: uklad === "TT" ? "error" : "warn",
      title: "Obwody bez ochrony różnicowoprądowej 30 mA",
      detail:
        `${bez30mA.map((d) => `${d.tag} (${d.caption})`).join(", ")} — gniazda do 32 A i oświetlenie w mieszkaniach wymagają dodatkowej ochrony wyłącznikiem różnicowoprądowym ≤ 30 mA (PN-HD 60364-4-41). Bez niej zostaw tylko odbiornik stały, jeśli dopuszcza to jego instrukcja (np. falownik PV). Przypisz obwód do różnicówki w edycji aparatu albo zastosuj RCBO.` +
        (uklad === "TT"
          ? " W układzie TT samoczynne wyłączenie zasilania praktycznie zawsze wymaga wyłącznika różnicowoprądowego — wyłącznik nadprądowy sam nie zadziała przy dużej rezystancji uziomu."
          : ""),
    });
  }

  // 3b. aparaty pomocnicze muszą stać za zabezpieczeniem — inaczej przewody sterownicze
  //     (zwykle 1–1,5 mm²) wiszą wprost na szynie chronionej dopiero przedlicznikowym
  const bezZabezpieczenia = devices.filter((d) => RODZAJE_POMOCNICZE.includes(d.kind) && d.kind !== "spd" && !rodzicAparatu(d, devices));
  if (bezZabezpieczenia.length) {
    out.push({
      level: "warn",
      title: "Aparaty pomocnicze bez zabezpieczenia",
      detail: `${bezZabezpieczenia.map((d) => `${d.tag} (${d.caption})`).join(", ")} — stoją wprost na szynie głównej, a jedynym zabezpieczeniem ich przewodów jest przedlicznikowe ${przedlicznikowe} A. Lampkę, czujnik zaniku fazy i zasilacz zasil przez własny wyłącznik (np. B6) albo bezpiecznik; stycznik i przekaźnik stoją za wyłącznikiem obwodu, który łączą. Wskaż to w polu „Zasilany z” w edycji aparatu.`,
    });
  }

  // 3c. bezpiecznik pod SPD ma sens tylko szeregowo PRZED ogranicznikiem
  const spdy = devices.filter((d) => d.kind === "spd");
  const bezpiecznikiBezSpd = devices.filter((d) => d.kind === "spdFuse" && !spdy.some((s) => rodzicAparatu(s, devices) === d));
  if (bezpiecznikiBezSpd.length) {
    out.push({
      level: "warn",
      title: "Bezpiecznik pod SPD nie jest połączony z ogranicznikiem",
      detail: `${bezpiecznikiBezSpd.map((d) => d.tag).join(", ")} — bezpiecznik ogranicznika przepięć stoi szeregowo przed SPD i chroni jego przewody przy zwarciu wewnątrz ogranicznika. Obok SPD, równolegle, nie chroni niczego. ${spdy.length ? "Wskaż go w polu „Zasilany z” w edycji ogranicznika." : "W rozdzielnicy nie ma ogranicznika przepięć."}`,
    });
  }

  // 3d. CZF tylko sygnalizuje — odłącza dopiero stycznik albo wyzwalacz, którym steruje
  const czf = devices.filter((d) => d.kind === "ovr");
  if (czf.length && !devices.some((d) => d.kind === "stycznik")) {
    out.push({
      level: "info",
      title: "Czujnik zaniku fazy bez stycznika",
      detail: `${czf.map((d) => d.tag).join(", ")} — czujnik zaniku i asymetrii faz sam niczego nie odłącza: jego przekaźnik wyjściowy steruje stycznikiem albo wyzwalaczem. Bez nich chroni najwyżej sygnalizacją. Dołóż stycznik dla odbiorników 3-fazowych (silniki, pompa ciepła) albo zrezygnuj z czujnika.`,
    });
  }

  // 3e. rozłącznik ppoż. przed rozdziałem PEN nie może rozłączać PEN
  const ppozZPen = uklad === "TN-C-S" ? devices.filter((d) => d.kind === "ppoz" && (d.poles === "4P" || d.poles === "2P")) : [];
  if (ppozZPen.length) {
    out.push({
      level: "warn",
      title: "Rozłącznik przeciwpożarowy rozłączałby PEN",
      detail: `${ppozZPen.map((d) => `${d.tag} (${d.poles})`).join(", ")} — rozłącznik przeciwpożarowy stoi na dopływie, przed rozdziałem PEN, a przewodu PEN nie wolno rozłączać. Przy układzie TN-C-S zastosuj wariant ${supply3f ? "3P" : "1P"} (tylko przewody fazowe) albo przenieś rozdział PEN przed rozłącznik.`,
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
      // Odmiana przez `zLiczba` — wcześniej „W rozdzielnicy jest 4 wyłączników" (przegląd 12.11.2026).
      detail: `${zLiczba(rcds.length, "wyłącznik różnicowoprądowy", "wyłączniki różnicowoprądowe", "wyłączników różnicowoprądowych")} w rozdzielnicy ${slowoLiczby(rcds.length, "pracuje", "pracują", "pracuje")} równolegle. Jeśli któryś ma być nadrzędny (szeregowo przed pozostałymi), musi być typu S (zwłocznego) i mieć prąd różnicowy co najmniej 3× większy od podrzędnych.`,
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

/** Zalecana rezerwa miejsca na rozbudowę — dobra praktyka, nie wymóg normy. */
export const ZALECANA_REZERWA = 0.2;

/**
 * Rezerwa modułów w obudowie i obudowa, która zostawia zalecane ~20% wolnego miejsca.
 *
 * Bez tej liczby rozdzielnica wychodzi „na styk": dołożenie jednego obwodu po latach
 * znaczy wymianę obudowy (audyt rozdzielnicy 15.11.2026, pkt 14).
 */
export function rezerwaModulow(zajete: number, wszystkie: number, perRow: number): { wolne: number; procent: number; zalecaneRzedy: number } {
  const wolne = Math.max(0, wszystkie - zajete);
  return {
    wolne,
    procent: wszystkie > 0 ? Math.round((wolne / wszystkie) * 100) : 0,
    zalecaneRzedy: Math.max(1, Math.ceil((zajete * (1 + ZALECANA_REZERWA)) / perRow)),
  };
}

export interface KlamraRcd {
  tag: string;
  /** Różnicówka w TYM rzędzie — brak znaczy, że klamra jest kontynuacją z rzędu wyżej. */
  rcd?: PanelSlot;
  startSlot: number;
  endSlot: number;
}

/**
 * Klamry „zasięg różnicówki" w jednym rzędzie frontu.
 *
 * Wcześniej klamra powstawała tylko wtedy, gdy różnicówka i jej obwody stały w tym samym
 * rzędzie. Różnicówka na końcu rzędu z obwodami w następnym nie miała więc klamry
 * wcale, a obwody w drugim rzędzie wyglądały na niechronione (audyt rozdzielnicy
 * 15.11.2026, pkt 13). Teraz rząd, w którym są obwody różnicówki stojącej wyżej,
 * dostaje klamrę-kontynuację nad nimi.
 */
export function klamryRcdWRzedzie(row: PanelSlot[]): KlamraRcd[] {
  const tagi = [...new Set([...row.filter((d) => d.kind === "rcd").map((d) => d.tag), ...row.flatMap((d) => (d.rcdTag ? [d.rcdTag] : []))])];
  return tagi.flatMap((tag) => {
    const rcd = row.find((d) => d.kind === "rcd" && d.tag === tag);
    const czlonkowie = row.filter((d) => d.rcdTag === tag);
    if (!czlonkowie.length) return [];
    const startSlot = rcd ? rcd.slot : Math.min(...czlonkowie.map((m) => m.slot));
    const endSlot = Math.max(...czlonkowie.map((m) => m.slot + m.modules), rcd ? rcd.slot + rcd.modules : 0);
    return [{ tag, rcd, startSlot, endSlot }];
  });
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

/**
 * Przenosi aparat na inną pozycję w rozdzielnicy.
 *
 * Układ (`layoutPanel`) wypełnia szyny po kolei, więc pozycja aparatu to po prostu jego
 * miejsce w tablicy — przeniesienie sprowadza się do przestawienia elementu. Wydzielone
 * jako czysta funkcja, bo to jedyny fragment przeciągania, który da się sprawdzić bez
 * symulowania myszy.
 *
 * Rozłącznik główny zostaje na PIERWSZEJ pozycji: w realnej rozdzielnicy zasilanie
 * wchodzi na pierwszy aparat szyny, a rysunek, na którym główny stoi w środku, nie
 * odpowiadałby niczemu, co da się zmontować.
 */
export function przeniesAparat(devices: PanelDevice[], from: number, to: number): PanelDevice[] {
  if (from === to || from < 0 || to < 0 || from >= devices.length || to >= devices.length) return devices;

  const glownyNaPoczatku = devices[0]?.kind === "main";
  const dolnaGranica = glownyNaPoczatku ? 1 : 0;
  if (glownyNaPoczatku && (from === 0 || to < dolnaGranica)) return devices;

  const kopia = [...devices];
  const [przenoszony] = kopia.splice(from, 1);
  kopia.splice(to, 0, przenoszony);
  return kopia;
}

/**
 * Aparaty, z których Schemat i Kosztorys rysują i liczą rozdzielnicę.
 *
 * Źródłem jest zapisana lista z Rozdzielnicy. W trybie „z rzutu” Rozdzielnica
 * odbudowuje ją z obwodów dopiero przy OTWARCIU zakładki i dokleja do niej aparaty
 * ręczne (patrz efekt w PanelTab.tsx). Do tego czasu lista potrafi zawierać same
 * aparaty ręczne — np. ogranicznik przepięć z przykładu — i brać ją wprost znaczyło
 * pusty schemat bez rozłącznika i wyłączników (przegląd 12.11.2026). Wtedy składamy
 * to samo, co złożyłaby Rozdzielnica: aparaty z obwodów plus ręczne.
 */
export function aparatyDoWidoku(
  zapisane: PanelDevice[],
  tryb: "zRzutu" | "reczny",
  zbudujZObwodow: () => PanelDevice[]
): PanelDevice[] {
  if (!zapisane.length) return zbudujZObwodow();
  if (tryb === "zRzutu" && zapisane.every((d) => d.manual)) return ujednolicOznaczenia([...zbudujZObwodow(), ...zapisane]);
  return zapisane;
}
