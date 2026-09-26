import type { Circuit, ElementType, InstallationElement, PanelDevice, PriceTable, RcdGroup } from "@/types";
import { ELEMENT_TYPES, gniazdoPodwojne, mechanizmowWElemencie } from "@/lib/elements";

export const DEFAULT_PRICES: PriceTable = {
  gniazdko: 15, gniazdkoPodwojne: 22, gniazdkoHerm: 25, gniazdko400: 45, wypustAGD: 8, ladowarkaEV: 0,
  wlacznik: 15, wlacznikDwubiegunowy: 22, wlacznikGrupowy: 22,
  wlacznikSchodowy: 18, wlacznikKrzyzowy: 28,
  sciemniacz: 60, czujnikRuchu: 45,
  oprawa: 0, tasmaLed: 25, wentylator: 90,
  napedRolety: 0, napedBramy: 0, termostat: 120,
  rj45: 20, rtvsat: 20, domofon: 0, dzwonek: 30, czujnikDymu: 55, czujnikCzadu: 80,
  puszkaPodtynkowa: 2, puszkaRozgalezna: 5,
  kabel15: 2.5, kabel25: 3.5, kabel4: 6, kabelLan: 2, kabelKoncentryk: 2,
  // Przekroje, ktore w domu wychodza realnie (kuchnia, ladowarka, dluga trasa) —
  // ceny orientacyjne, tak samo jak trzy powyzej, i tak samo do poprawienia recznie.
  kabel3x4: 5.5, kabel3x6: 8, kabel3x10: 13,
  // Rzadkie: zostaja BEZ ceny, bo zmyslona liczba jest gorsza od jawnego pytania —
  // pozycja bez ceny trafia na liste „uzupelnij" (patrz `pozycjeBezCeny`).
  kabel3x16: 0, kabel3x25: 0, kabel5x6: 0, kabel5x10: 0, kabel5x16: 0, kabel5x25: 0,
  kabelInny: 0,
  mcb: 15, mcb3f: 45, rcd: 90, glowny: 60, rozdzielnica: 130, szafkaTeletech: 0, robocizna: 0,
  // Aparaty dokładane w Rozdzielnicy ręcznie — BEZ ceny, z tego samego powodu co rzadkie
  // przekroje: rozrzut cen jest duży (SPD T1+T2 to kilkaset złotych, T2 — sto kilkadziesiąt),
  // a zmyślona liczba jest gorsza od jawnego pytania. Trafiają na listę „uzupełnij".
  rcbo: 0, spd: 0, spdFuse: 0, rozBezp: 0, ovr: 0, ppoz: 0, stycznik: 0, przekaznik: 0, zasilacz: 0, lampka: 0,
};

/** Podstawowa stawka VAT. Dla materiałów i usług elektrycznych w budownictwie
 *  mieszkaniowym bywa 8%, ale to zależy od rodzaju obiektu i zakresu prac — kosztorys
 *  jest orientacyjny, więc przyjmujemy stawkę podstawową i nie udajemy doradztwa
 *  podatkowego. */
export const VAT_RATE = 23;

export const PRICE_LABELS: Record<string, string> = {
  gniazdko: "Gniazdko 230V podtynkowe (szt.)",
  gniazdkoPodwojne: "Gniazdko 230V podwójne (szt.)",
  gniazdkoHerm: "Gniazdko hermetyczne IP44 (szt.)",
  gniazdko400: "Gniazdo 400V / siłowe (szt.)",
  wypustAGD: "Wypust zasilający AGD (szt.)",
  ladowarkaEV: "Ładowarka EV / wallbox (szt., opcjonalnie)",
  wlacznik: "Łącznik jednobiegunowy (szt.)",
  wlacznikDwubiegunowy: "Łącznik dwubiegunowy (szt.)",
  wlacznikGrupowy: "Łącznik grupowy / świecznikowy (szt.)",
  wlacznikSchodowy: "Łącznik schodowy (szt.)",
  wlacznikKrzyzowy: "Łącznik krzyżowy (szt.)",
  sciemniacz: "Ściemniacz (szt.)",
  czujnikRuchu: "Czujnik ruchu (szt.)",
  oprawa: "Oprawa oświetleniowa (szt., opcjonalnie)",
  tasmaLed: "Taśma LED z zasilaczem (kpl.)",
  wentylator: "Wentylator łazienkowy (szt.)",
  napedRolety: "Napęd rolety (szt., opcjonalnie)",
  napedBramy: "Napęd bramy garażowej (szt., opcjonalnie)",
  termostat: "Termostat / regulator (szt.)",
  rj45: "Gniazdo RJ45 (szt.)",
  rtvsat: "Gniazdo RTV/SAT (szt.)",
  domofon: "Domofon / wideodomofon (kpl., opcjonalnie)",
  dzwonek: "Dzwonek z przyciskiem (kpl.)",
  czujnikDymu: "Czujnik dymu (szt.)",
  czujnikCzadu: "Czujnik czadu (CO) (szt.)",
  puszkaPodtynkowa: "Puszka podtynkowa (szt.)",
  puszkaRozgalezna: "Puszka rozgałęźna (szt.)",
  kabel15: "Przewód YDYp 3×1,5 mm² (mb)",
  kabel25: "Przewód YDYp 3×2,5 mm² (mb)",
  kabel4: "Przewód YDYp 5×2,5 / 5×4 mm² (mb)",
  kabel3x4: "Przewód YDYp 3×4 mm² (mb)",
  kabel3x6: "Przewód YDYp 3×6 mm² (mb)",
  kabel3x10: "Przewód YDYp 3×10 mm² (mb)",
  kabel3x16: "Przewód YDYp 3×16 mm² (mb)",
  kabel3x25: "Przewód YDYp 3×25 mm² (mb)",
  kabel5x6: "Przewód YDYp 5×6 mm² (mb)",
  kabel5x10: "Przewód YDYp 5×10 mm² (mb)",
  kabel5x16: "Przewód YDYp 5×16 mm² (mb)",
  kabel5x25: "Przewód YDYp 5×25 mm² (mb)",
  kabelInny: "Przewód YDYp — inny przekrój (mb)",
  kabelLan: "Przewód UTP kat. 6 (mb)",
  kabelKoncentryk: "Przewód koncentryczny RG-6 (mb)",
  mcb: "Wyłącznik nadprądowy 1-faz. B10/16 (szt.)",
  mcb3f: "Wyłącznik nadprądowy 3-faz. C16/C25 (szt.)",
  rcd: "Wyłącznik różnicowoprądowy 30mA (szt.)",
  glowny: "Wyłącznik główny (szt.)",
  rcbo: "Wyłącznik różnicowo-nadprądowy RCBO (szt.)",
  spd: "Ogranicznik przepięć SPD (szt.)",
  spdFuse: "Bezpiecznik z podstawą pod SPD (szt.)",
  rozBezp: "Rozłącznik izolacyjny bezpiecznikowy (szt.)",
  ovr: "Czujnik zaniku / kolejności faz (szt.)",
  ppoz: "Rozłącznik przeciwpożarowy (szt.)",
  stycznik: "Stycznik modułowy (szt.)",
  przekaznik: "Przekaźnik bistabilny (szt.)",
  zasilacz: "Zasilacz modułowy (szt.)",
  lampka: "Lampka sygnalizacyjna (szt.)",
  rozdzielnica: "Obudowa rozdzielnicy (szt.)",
  szafkaTeletech: "Szafka teletechniczna / rack (szt., opcjonalnie)",
  robocizna: "Robocizna za punkt instalacyjny (szt., opcjonalnie)",
};

/** Mapowanie typu elementu na pozycję cennika (elementy bez wpisu liczone są tylko jako punkt instalacyjny). */
const TYPE_TO_PRICE_KEY: Partial<Record<ElementType, string>> = {
  gniazdko: "gniazdko", gniazdkoHerm: "gniazdkoHerm", gniazdko400: "gniazdko400",
  wypustAGD: "wypustAGD", ladowarkaEV: "ladowarkaEV",
  wlacznik: "wlacznik", wlacznikDwubiegunowy: "wlacznikDwubiegunowy",
  wlacznikGrupowy: "wlacznikGrupowy", wlacznikSchodowy: "wlacznikSchodowy",
  wlacznikKrzyzowy: "wlacznikKrzyzowy",
  sciemniacz: "sciemniacz", czujnikRuchu: "czujnikRuchu",
  oswietlenie: "oprawa", kinkiet: "oprawa", oswietlenieZewn: "oprawa", tasmaLed: "tasmaLed",
  roleta: "napedRolety", napedBramy: "napedBramy", wentylator: "wentylator", termostat: "termostat",
  rj45: "rj45", rtvsat: "rtvsat", domofon: "domofon", dzwonek: "dzwonek", czujnikDymu: "czujnikDymu", czujnikCzadu: "czujnikCzadu",
  puszka: "puszkaRozgalezna", rozdzielnica: "rozdzielnica", szafkaTeletech: "szafkaTeletech",
};

/** Rodzaje aparatów z katalogu Rozdzielnicy (`MANUAL_DEVICE_TYPES`), które mają w cenniku
 *  pozycję o tym samym kluczu co `kind` aparatu. */
const APARATY_DOKLADANE = ["rcbo", "spd", "spdFuse", "rozBezp", "ovr", "ppoz", "stycznik", "przekaznik", "zasilacz", "lampka"];

export interface CostResult {
  quantities: Record<string, number>;
  /** Skąd wzięły się metry kabla: policzone z planu czy z ryczałtu na punkt. */
  cableLengthSource: "plan" | "ryczalt";
}

export interface CostOptions {
  /** Sumaryczne długości tras [m] per obwód, policzone z planu (patrz
   *  `routeLengths` w `lib/panel/project.ts`). Pusta mapa = brak kalibracji
   *  skali albo brak rozdzielnicy na rysunku. */
  routeLengthsM?: Map<string, number>;
  /**
   * Metry przewodu NISKOPRĄDOWEGO policzone z planu (patrz `lowVoltageLengths`).
   * Brak = ryczałt 15 mb na punkt, czyli zachowanie sprzed mierzenia tych tras.
   */
  lvLengthsM?: { lan: number; koncentryk: number };
  /**
   * Aparaty z zakładki ROZDZIELNICA — to je wyceniamy, a nie odtwarzamy z obwodów.
   *
   * Dotąd kosztorys liczył wyłączniki z obwodów policzonych z rzutu, więc nic, co
   * użytkownik zrobił w Rozdzielnicy, do niego nie trafiało: po usunięciu aparatu F7
   * rozdzielnica miała 13 aparatów, a kosztorys dalej 10 wyłączników 1-faz.; dołożony
   * ogranicznik przepięć, stycznik czy lampka nie były wyceniane wcale. Schemat bierze
   * aparaty z rozdzielnicy od dawna — teraz tak samo kosztorys.
   *
   * Brak = zachowanie dotychczasowe (aparaty z obwodów).
   */
  aparaty?: PanelDevice[];
}

/**
 * Pozycja kosztorysu dla kabla opisanego tak jak w doborze („YDYp 3x2,5 mm²").
 *
 * Dotąd kubełki były trzy i dopasowywały się po FRAGMENCIE tekstu: wszystko, co nie
 * miało w nazwie „1,5" ani pięciu żył, lądowało w pozycji „3×2,5 mm²". Obwód dobrany
 * na 6 mm² — a takie wychodzą, odkąd warunki doboru da się ustawić uczciwie — był więc
 * wyceniany jako 2,5 mm², czyli za mniej więcej połowę tego, co realnie kosztuje.
 * Kosztorys kazał kupić cieńszy kabel, niż sam zaprojektował.
 *
 * Przekrój czytamy z opisu, zamiast zgadywać po podciągu. Kombinacja spoza listy trafia
 * do pozycji „inny przekrój" — widocznej i bez ceny, bo lepiej zapytać niż po cichu
 * doliczyć do niewłaściwego wiersza.
 */
export function kluczKabla(cable: string): string {
  const m = cable.match(/(\d+)\s*[x×]\s*(\d+(?:[.,]\d+)?)/i);
  if (!m) return "kabelInny";
  const zyl = m[1];
  const przekroj = m[2].replace(".", ",");
  return KLUCZE_KABLI[`${zyl}x${przekroj}`] ?? "kabelInny";
}

/** Żyły × przekrój → pozycja kosztorysu. Klucze `kabel15`/`kabel25`/`kabel4` zostają
 *  przy swoich starych nazwach mimo nierównej konwencji: to po nich zapisane projekty
 *  trzymają ręcznie poprawione ceny, a zmiana nazwy po cichu by je porzuciła. */
const KLUCZE_KABLI: Record<string, string> = {
  "3x1,5": "kabel15",
  "3x2,5": "kabel25",
  "3x4": "kabel3x4",
  "3x6": "kabel3x6",
  "3x10": "kabel3x10",
  "3x16": "kabel3x16",
  "3x25": "kabel3x25",
  // Pięciożyłowe 2,5 i 4 dzielą jedną pozycję od zawsze — tak też jest opisana.
  "5x2,5": "kabel4",
  "5x4": "kabel4",
  "5x6": "kabel5x6",
  "5x10": "kabel5x10",
  "5x16": "kabel5x16",
  "5x25": "kabel5x25",
};

/**
 * Szacuje ilości materiałów i robocizny z elementów na planie i obwodów.
 *
 * Długości przewodów bierze z realnych tras po planie, jeśli plan ma
 * skalibrowaną skalę i postawioną rozdzielnicę. Bez tego wraca do ryczałtu
 * (5 mb na punkt + 10 mb na obwód) — i mówi o tym przez `cableLengthSource`,
 * żeby kosztorys nie udawał policzonego, kiedy jest zgadnięty.
 */
export function computeCosts(
  elements: InstallationElement[],
  circuits: Circuit[],
  rcdGroups: RcdGroup[],
  opts: CostOptions = {}
): CostResult {
  const q: Record<string, number> = {};
  Object.keys(PRICE_LABELS).forEach((k) => {
    q[k] = 0;
  });

  elements.forEach((e) => {
    // Gniazdo podwójne idzie na WŁASNĄ pozycję cennika, w jednej sztuce: to inny produkt
    // niż pojedyncze, o innej cenie — a nie dwa pojedyncze sklejone. Puszkę i robociznę
    // dostaje jedną, bo zajmuje jedno miejsce w ścianie (patrz `pointElements` niżej).
    const key = gniazdoPodwojne(e) ? "gniazdkoPodwojne" : TYPE_TO_PRICE_KEY[e.type];
    // Dwie sztuki z jednego punktu zostały już tylko tam, gdzie stary zapis trzyma
    // podwójny łącznik jako `gangs: 2` — patrz `mechanizmowWElemencie`.
    const count = mechanizmowWElemencie(e);
    if (key) q[key] += count;
  });

  // Szafka teletechniczna dolacza do rozdzielnicy i puszki: to obudowa, a nie punkt
  // instalacyjny — nie ma przy niej puszki podtynkowej ani osobnej robocizny za punkt.
  const pointElements = elements.filter((e) => !["rozdzielnica", "puszka", "szafkaTeletech"].includes(e.type) && ELEMENT_TYPES[e.type]?.role !== "sanitary");
  // `|| 1` ratuje przypadek, w którym elementy SĄ, ale żaden nie ma przypisanego
  // pomieszczenia — wtedy zbiór nazw jest pusty, a puszka rozgałęźna i tak jest
  // potrzebna. Na PUSTYM projekcie ten sam fallback wystawiał jednak rachunek za dom,
  // którego nie ma: jedna puszka, 6,15 zł brutto i pełna tabela kosztorysu u kogoś,
  // kto dopiero wszedł na stronę i niczego jeszcze nie narysował. Stąd warunek na
  // `elements.length` — zero elementów to zero pomieszczeń, nie „co najmniej jedno".
  const rooms = elements.length ? new Set(elements.map((e) => e.room)).size || 1 : 0;
  q.puszkaPodtynkowa = pointElements.length;
  q.puszkaRozgalezna = Math.max(q.puszkaRozgalezna, rooms);
  q.robocizna = pointElements.length;

  // Trasa policzona po planie bije ryczałt: obwód z pięcioma gniazdami tuż przy
  // rozdzielnicy i taki sam obwód na drugim końcu domu dostawały dotąd identyczne
  // 35 mb, co jest zgadywaniem, nie kosztorysem.
  const measured = opts.routeLengthsM;
  const hasMeasured = !!measured && circuits.some((c) => measured.has(c.id));
  const metryKabla = new Map<string, number>();
  circuits.forEach((c) => {
    const len = measured?.get(c.id) ?? c.elements.length * 5 + 10;
    const klucz = kluczKabla(c.cable);
    metryKabla.set(klucz, (metryKabla.get(klucz) ?? 0) + len);
  });
  for (const [klucz, metry] of metryKabla) q[klucz] = Math.round(metry);

  // Ryczałt 15 mb na punkt zostaje TYLKO wtedy, gdy nie ma od czego mierzyć: bez
  // rozdzielnicy na planie albo bez skali. Gdy trasy da się policzyć, liczą się tak samo
  // jak przy zasilaniu — patrz `lowVoltageLengths`.
  q.kabelLan = Math.round(opts.lvLengthsM ? opts.lvLengthsM.lan : (q.rj45 + q.domofon) * 15);
  q.kabelKoncentryk = Math.round(opts.lvLengthsM ? opts.lvLengthsM.koncentryk : q.rtvsat * 15);

  if (opts.aparaty) {
    // Aparaty z ROZDZIELNICY, nie odtworzone z obwodów — patrz `CostOptions.aparaty`.
    const ap = opts.aparaty;
    const ile = (warunek: (d: PanelDevice) => boolean) => ap.filter(warunek).length;
    const wielobiegunowy = (d: PanelDevice) => /^[34]P/.test(d.poles);
    q.mcb = ile((d) => d.kind === "mcb" && !wielobiegunowy(d));
    q.mcb3f = ile((d) => d.kind === "mcb" && wielobiegunowy(d));
    q.rcd = ile((d) => d.kind === "rcd");
    q.glowny = ile((d) => d.kind === "main");
    for (const k of APARATY_DOKLADANE) q[k] = ile((d) => d.kind === k);
    q.rozdzielnica = Math.max(q.rozdzielnica, ap.length ? 1 : 0);
  } else {
    const threePhase = circuits.filter((c) => c.breaker.includes("3-faz.")).length;
    q.mcb3f = threePhase;
    q.mcb = circuits.length - threePhase;
    q.rcd = rcdGroups.length;
    q.glowny = circuits.length ? 1 : 0;
    q.rozdzielnica = Math.max(q.rozdzielnica, circuits.length ? 1 : 0);
  }

  return { quantities: q, cableLengthSource: hasMeasured ? "plan" : "ryczalt" };
}

/**
 * Ręcznie wpisane WARTOŚCI pozycji [zł netto], per klucz cennika.
 *
 * Osobno od cen jednostkowych, bo to inny rodzaj informacji: cena jednostkowa mnoży się
 * przez policzoną ilość, a wartość zastępuje cały ten rachunek. Tak wyglądają realne
 * oferty — robocizna bywa podana ryczałtem za mieszkanie, a nie „za punkt”, i nie da się
 * jej wtedy sensownie rozbić na sztuki.
 *
 * `0` jest pełnoprawną wartością („ta pozycja jest w cenie czegoś innego”), więc brak
 * nadpisania to brak klucza, nie zero — ten sam zapis co przy `heightM` elementu.
 */
export type CostOverrides = Record<string, number>;

/**
 * Ręcznie poprawione ILOŚCI pozycji, per klucz cennika.
 *
 * Ilości są SZACOWANE z rzutu — puszki podtynkowe z liczby punktów, rozgałęźne z liczby
 * pomieszczeń, metry kabla z tras albo z ryczałtu. Aplikacja sama pisze pod tabelą, żeby
 * je zweryfikować na realnym rzucie budynku, a do tej pory nie dawała ich poprawić:
 * jedyne wyjście prowadziło przez wpisanie wartości ryczałtem, co gubi informację
 * „ile tego kupić”.
 *
 * `0` jest pełnoprawną ilością („tej pozycji w ogóle nie robimy”), więc brak poprawki
 * to brak klucza, nie zero — ten sam zapis co przy `CostOverrides`.
 */
export type QtyOverrides = Record<string, number>;

export interface CostRow {
  key: string;
  label: string;
  /** Ilość: oszacowana z rzutu albo poprawiona ręcznie. */
  qty: number;
  /** Ilość pochodzi z ręcznej poprawki, nie z oszacowania. */
  qtyOverridden: boolean;
  /** Cena jednostkowa z cennika [zł]. Przy pozycji ryczałtowej dalej widoczna,
   *  ale nieużyta — patrz `overridden`. */
  price: number;
  /** Wartość pozycji [zł netto]: ilość × cena albo kwota wpisana ręcznie. */
  value: number;
  /** Wartość pochodzi z ręcznego wpisu, nie z mnożenia. */
  overridden: boolean;
}

function nadpisane(map: Record<string, number>, key: string): boolean {
  return typeof map[key] === "number" && Number.isFinite(map[key]);
}

/**
 * Wiersze kosztorysu: pozycje z ilością, ceną i wartością — każda z nich policzona
 * albo poprawiona ręcznie.
 *
 * Wydzielone ze składnika, bo to jedyne miejsce, w którym decyduje się, co wchodzi do
 * sumy — a suma jest tym, po co ktoś tu przychodzi.
 *
 * Ilość i wartość są NIEZALEŻNE. Poprawiona ilość przelicza wartość (bo tyle sztuk razy
 * cena), ale wartość podana ryczałtem zostaje na swoim miejscu — „90 punktów robocizny,
 * 14 500 zł ryczałtem” to zdanie sensowne i poprawienie liczby punktów na 85 nie zmienia
 * umówionej kwoty.
 */
export function kosztorysRows(
  quantities: Record<string, number>,
  prices: Record<string, number>,
  overrides: CostOverrides = {},
  qtyOverrides: QtyOverrides = {}
): CostRow[] {
  return Object.keys(PRICE_LABELS)
    .filter(
      // Pozycja z ręcznie ustawioną ILOŚCIĄ zostaje na liście nawet po wyzerowaniu —
      // inaczej wpisanie zera kasowałoby wiersz razem z jedyną drogą powrotu.
      // Sama wartość tego nie robi: nadpisanie kwoty przy pozycji, której na rzucie
      // nie ma (bo np. skasowano rozdzielnicę), zostawiałoby w kosztorysie widmo.
      (k) => (quantities[k] ?? 0) > 0 || nadpisane(qtyOverrides, k)
    )
    .map((k) => {
      const qtyNadpisana = nadpisane(qtyOverrides, k);
      const qty = qtyNadpisana ? qtyOverrides[k] : quantities[k] ?? 0;
      const price = prices[k] ?? 0;
      const wartoscNadpisana = nadpisane(overrides, k);
      return {
        key: k,
        label: PRICE_LABELS[k],
        qty,
        qtyOverridden: qtyNadpisana,
        price,
        value: wartoscNadpisana ? overrides[k] : qty * price,
        overridden: wartoscNadpisana,
      };
    });
}

/**
 * Pozycje, których BRAK w sumie — jest ilość, a wartość zerowa.
 *
 * Liczy się wartość, nie cena jednostkowa: pozycja wyceniona ryczałtem ma prawo mieć
 * zerową cenę za sztukę i nadal wchodzić do kosztorysu pełną kwotą. Pilnowanie ceny
 * jednostkowej kazałoby uzupełniać cenę czegoś, co użytkownik już wycenił.
 *
 * Pozycje o ZEROWEJ ILOŚCI są pomijane: nie ma tam czego wyceniać, więc rada
 * „uzupełnij cenę” byłaby nie na temat — to pozycja wykreślona z zakresu, nie luka.
 */
export function pozycjeBezCeny(rows: CostRow[]): string[] {
  return wierszeBezCeny(rows).map((r) => r.label.replace(/\s*\(.*?\)\s*$/, ""));
}

/** To samo, ale z zachowaniem `key` — potrzebne, żeby odróżnić BRAK ROBOCIZNY od
 *  braku dowolnej innej pozycji (patrz `podsumowanieKosztorysu`). */
function wierszeBezCeny(rows: CostRow[]): CostRow[] {
  return rows.filter((r) => r.value === 0 && r.qty !== 0);
}

export interface PodsumowanieKosztorysu {
  netto: number;
  vat: number;
  brutto: number;
  /** Nazwy pozycji, które MAJĄ ilość, ale nie mają wartości — czyli nie weszły do sumy. */
  niewycenione: string[];
  /** Czy wśród nich jest ROBOCIZNA. Osobno od reszty, bo to ona decyduje o tym, czym
   *  ta suma w ogóle jest: bez niej to cena materiału, a nie cena instalacji. */
  brakRobocizny: boolean;
  /**
   * Podpis pod wielką liczbą — MA być prawdziwy.
   *
   * Dotąd stało tam zawsze „RAZEM brutto", mimo że `robocizna` ma domyślną cenę 0 i na
   * typowym projekcie do sumy nie wchodziła. Laik dostawał więc za mieszkanie 70 m²
   * „RAZEM brutto 2621,74 zł" — kwotę za sam materiał, zaniżoną kilkakrotnie względem
   * tego, co zapłaci — a zastrzeżenie stało POD nią, drobnym drukiem. Liczba z takim
   * podpisem trafiała też do PDF-a wysyłanego wykonawcy.
   *
   * Świadomie NIE wymyślamy stawki robocizny, żeby suma się „domknęła": zmyślona
   * liczba jest gorsza od jawnego pytania (ta sama zasada co przy rzadkich przekrojach
   * w `DEFAULT_PRICES`). Zamiast tego suma mówi, czym jest.
   */
  etykietaSumy: string;
}

/** Klucz robocizny w cenniku — jedno miejsce, żeby nazwa nie rozjechała się z `DEFAULT_PRICES`. */
const KLUCZ_ROBOCIZNY = "robocizna";

export function podsumowanieKosztorysu(rows: CostRow[]): PodsumowanieKosztorysu {
  const netto = rows.reduce((a, r) => a + r.value, 0);
  const vat = netto * (VAT_RATE / 100);
  const bezCeny = wierszeBezCeny(rows);
  const brakRobocizny = bezCeny.some((r) => r.key === KLUCZ_ROBOCIZNY);
  return {
    netto,
    vat,
    brutto: netto + vat,
    niewycenione: bezCeny.map((r) => r.label.replace(/\s*\(.*?\)\s*$/, "")),
    brakRobocizny,
    etykietaSumy: brakRobocizny
      ? "RAZEM brutto — sam materiał"
      : bezCeny.length > 0
        ? "RAZEM brutto — niepełny"
        : "RAZEM brutto",
  };
}

/**
 * Słowa kluczowe pozycji cennika CSV — dopasowanie kończy się na PIERWSZYM trafieniu,
 * więc kolejność ma znaczenie.
 *
 * Aparaty rozdzielnicy stoją PRZED łącznikami: „wyłącznik" zawiera podciąg „łącznik",
 * więc „Wyłącznik nadprądowy B16" i „Wyłącznik różnicowoprądowy" trafiały dotąd do
 * pozycji łącznika jednobiegunowego (usterka przeniesiona z pierwowzoru i przypięta
 * testem jako „celowo wierna źródłu").
 *
 * Przewody z przekrojem w nazwie („YDYp 3x2,5") rozpoznaje `kluczKabla`, zanim dojdzie
 * do tej listy — tu zostają tylko nazwy bez żył × przekroju. Dłuższe przed krótszymi:
 * „16 mm" zawiera „6 mm", a cena przewodu 3×16 lądowała w pozycji 3×6.
 */
const CSV_KEYWORD_MAP: [string, string[]][] = [
  // Aparaty dokładane w Rozdzielnicy ręcznie (patrz `APARATY_DOKLADANE`). Kolejność:
  // RCBO przed `mcb` („RCBO B16/30mA" zawiera „ b16"), rozłącznik bezpiecznikowy przed
  // `glowny` (zawiera „rozłącznik izolacyjny"), bezpiecznik pod SPD przed `spd`
  // („pod SPD" zawiera „ spd"), rozłącznik ppoż. przed łącznikami („łącznik").
  ["rcbo", ["rcbo", "różnicowo-nadprądow", "roznicowo-nadpradow", "różnicowo nadprądow", "roznicowo nadpradow"]],
  ["ppoz", ["przeciwpożar", "przeciwpozar", "ppoż", "ppoz"]],
  ["rozBezp", ["rozłącznik bezpiecznikow", "rozlacznik bezpiecznikow", "izolacyjny bezpiecznikow"]],
  ["spdFuse", ["pod spd", "wkładka topikowa", "wkladka topikowa"]],
  ["spd", ["ogranicznik przepięć", "ogranicznik przepiec", "ochronnik przepięciow", "ochronnik przepieciow", " spd", "spd "]],
  ["ovr", ["czujnik zaniku", "zaniku fazy", "kolejności faz", "kolejnosci faz", "czf"]],
  ["stycznik", ["stycznik"]],
  ["przekaznik", ["przekaźnik", "przekaznik"]],
  ["zasilacz", ["zasilacz modułow", "zasilacz modulow", "zasilacz din", "zasilacz na szyn"]],
  ["lampka", ["lampka sygnaliz", "lampka kontrol"]],
  ["rcd", ["różnicowoprądowy", "roznicowopradowy", "rcd"]],
  ["glowny", ["wyłącznik główny", "wylacznik glowny", "rozłącznik izolacyjny", "rozlacznik izolacyjny"]],
  ["mcb", ["wyłącznik nadprądowy", "wylacznik nadpradowy", " b16", " b10", " b20", " c16", " c20", " c25"]],
  ["rozdzielnica", ["rozdzielnica", "obudowa"]],
  ["gniazdkoPodwojne", ["gniazdo podwójne", "gniazdko podwójne", "gniazdo podwojne", "gniazdko podwojne"]],
  ["gniazdko", ["gniazdko", "gniazdo podtynkowe"]],
  // Warianty łączników MUSZĄ stać przed ogólnym `wlacznik`: „łącznik" jest podciągiem
  // każdej z tych nazw.
  ["wlacznikDwubiegunowy", ["dwubiegunow"]],
  ["wlacznikGrupowy", ["grupow", "świecznikow", "swiecznikow"]],
  // „zmienny" zostaje jako alias — cenniki bywają opisane jedną albo drugą nazwą
  ["wlacznikSchodowy", ["schodow", "zmienny"]],
  ["wlacznikKrzyzowy", ["krzyżow", "krzyzow"]],
  ["wlacznik", ["włącznik", "lacznik", "łącznik"]],
  ["puszkaPodtynkowa", ["puszka podtynkowa"]],
  ["puszkaRozgalezna", ["puszka rozgałęźna", "rozgalezna"]],
  ["kabelLan", ["utp", "ftp", "skrętka", "skretka"]],
  ["kabelKoncentryk", ["koncentry", "rg-6", "rg6"]],
  ["kabel3x25", ["25 mm"]],
  ["kabel3x16", ["16 mm"]],
  ["kabel3x10", ["10 mm"]],
  ["kabel3x6", ["6 mm"]],
  ["kabel3x4", ["4 mm"]],
  ["kabel25", ["2,5 mm"]],
  ["kabel15", ["1,5 mm"]],
];

/**
 * Cena z pola cennika: „15,90", „15.90", „1 234,56", „1.234,56", „15,90 zł".
 *
 * Polski Excel eksportuje przecinek dziesiętny, więc przecinek jest tu domyślnie
 * separatorem części ułamkowej. Gdy są oba znaki, dziesiętny jest ten OSTATNI.
 */
function parsujCene(pole: string): number {
  let t = pole.replace(/[^\d.,]/g, "");
  const przecinek = t.lastIndexOf(",");
  const kropka = t.lastIndexOf(".");
  if (przecinek !== -1 && kropka !== -1) {
    t = przecinek > kropka ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  } else if (przecinek !== -1) {
    t = t.replace(",", ".");
  }
  return parseFloat(t);
}

/**
 * Linia cennika → nazwa i cena. Ostatnie pole to cena, reszta — opis.
 *
 * Separatorem jest średnik albo tabulator, a PRZECINEK tylko wtedy, gdy nie ma żadnego
 * z nich. Dotąd dzielił po wszystkich trzech naraz, więc przecinek dziesiętny rozbijał
 * cenę: „Gniazdko podtynkowe;15,90" dawało 90 zł, „YDYp 3x10 mm;13,20" — 20 zł,
 * a „YDYp 3x2,5 mm;3,50" rozpadało się już w nazwie i nie dopasowywało wcale.
 */
function rozbijLinieCennika(linia: string): { nazwa: string; cena: number } | null {
  let pola: string[];
  if (linia.includes(";")) pola = linia.split(";");
  else if (linia.includes("\t")) pola = linia.split("\t");
  else {
    pola = linia.split(",");
    // „Gniazdko,15,90" — przecinek dziesiętny w pliku rozdzielanym przecinkami.
    const ost = pola[pola.length - 1];
    const przed = pola[pola.length - 2];
    if (pola.length >= 3 && /^\s*\d{1,2}\s*$/.test(ost) && /^\s*\d[\d\s]*$/.test(przed)) {
      pola = [...pola.slice(0, -2), `${przed},${ost}`];
    }
  }
  if (pola.length < 2) return null;
  const cena = parsujCene(pola[pola.length - 1]);
  if (!(cena > 0)) return null;
  return { nazwa: pola.slice(0, -1).join(" "), cena };
}

/** Pozycja cennika dla nazwy z pliku CSV — albo `null`, gdy nic nie pasuje. */
function kluczZNazwy(nazwa: string): string | null {
  const mala = nazwa.toLowerCase();
  // Przewód z żyłami × przekrojem w nazwie — ta sama droga co w kosztorysie, więc
  // cena trafia dokładnie do tej pozycji, do której trafią policzone metry.
  if (/ydy|yky|przew|kabel/.test(mala)) {
    const klucz = kluczKabla(nazwa);
    if (klucz !== "kabelInny") return klucz;
  }
  for (const [klucz, slowa] of CSV_KEYWORD_MAP) {
    if (!slowa.some((kw) => mala.includes(kw))) continue;
    // Nadprądowy 3-biegunowy / 3-fazowy ma w kosztorysie własną pozycję.
    if (klucz === "mcb" && /\b[34]p\b|3\s*-?\s*faz/.test(mala)) return "mcb3f";
    return klucz;
  }
  return null;
}

/** Parsuje cennik CSV (`nazwa;cena` per linia) i zwraca dopasowane aktualizacje cen. */
export function parsePriceCsv(text: string): Record<string, number> {
  const updates: Record<string, number> = {};
  for (const linia of text.split(/\r?\n/)) {
    if (!linia.trim()) continue;
    const pozycja = rozbijLinieCennika(linia);
    if (!pozycja) continue;
    const klucz = kluczZNazwy(pozycja.nazwa);
    if (klucz) updates[klucz] = pozycja.cena;
  }
  return updates;
}
