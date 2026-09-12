import type { Circuit, ElementType, InstallationElement, PriceTable, RcdGroup } from "@/types";
import { ELEMENT_TYPES, mechanizmowWElemencie } from "@/lib/elements";

export const DEFAULT_PRICES: PriceTable = {
  gniazdko: 15, gniazdkoHerm: 25, gniazdko400: 45, wypustAGD: 8, ladowarkaEV: 0,
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
};

/** Podstawowa stawka VAT. Dla materiałów i usług elektrycznych w budownictwie
 *  mieszkaniowym bywa 8%, ale to zależy od rodzaju obiektu i zakresu prac — kosztorys
 *  jest orientacyjny, więc przyjmujemy stawkę podstawową i nie udajemy doradztwa
 *  podatkowego. */
export const VAT_RATE = 23;

export const PRICE_LABELS: Record<string, string> = {
  gniazdko: "Gniazdko 230V podtynkowe (szt.)",
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
    const key = TYPE_TO_PRICE_KEY[e.type];
    // Gniazda wielokrotne liczymy wg liczby mechanizmów w ramce. Łączniki nie mają już
    // wariantów (liczbę biegunów niesie typ symbolu), ale `wlacznik`/`wlacznikSchodowy`
    // zostają na tej liście, żeby projekty zapisane przed tą zmianą — gdzie podwójny
    // łącznik był zapisany jako `gangs: 2` — nadal wyceniały się tak samo jak wtedy.
    const count = mechanizmowWElemencie(e);
    if (key) q[key] += count;
  });

  // Szafka teletechniczna dolacza do rozdzielnicy i puszki: to obudowa, a nie punkt
  // instalacyjny — nie ma przy niej puszki podtynkowej ani osobnej robocizny za punkt.
  const pointElements = elements.filter((e) => !["rozdzielnica", "puszka", "szafkaTeletech"].includes(e.type) && ELEMENT_TYPES[e.type]?.role !== "sanitary");
  const rooms = new Set(elements.map((e) => e.room)).size || 1;
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

  const threePhase = circuits.filter((c) => c.breaker.includes("3-faz.")).length;
  q.mcb3f = threePhase;
  q.mcb = circuits.length - threePhase;
  q.rcd = rcdGroups.length;
  q.glowny = circuits.length ? 1 : 0;
  q.rozdzielnica = Math.max(q.rozdzielnica, circuits.length ? 1 : 0);

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
  return rows.filter((r) => r.value === 0 && r.qty !== 0).map((r) => r.label.replace(/\s*\(.*?\)\s*$/, ""));
}

/** Dopasowuje pozycje cennika CSV (nazwa;cena) po słowach kluczowych w nazwie. */
const CSV_KEYWORD_MAP: Record<string, string[]> = {
  gniazdko: ["gniazdko", "gniazdo podtynkowe"],
  // Warianty łączników MUSZĄ stać przed ogólnym `wlacznik`: dopasowanie kończy się na
  // pierwszym trafieniu, a "łącznik" jest podciągiem każdej z tych nazw, więc odwrotna
  // kolejność wrzucałaby cenę np. krzyżowego do pozycji jednobiegunowej.
  wlacznikDwubiegunowy: ["dwubiegunow"],
  wlacznikGrupowy: ["grupow", "świecznikow", "swiecznikow"],
  // „zmienny" zostaje jako alias — cenniki bywają opisane jedną albo drugą nazwą
  wlacznikSchodowy: ["schodow", "zmienny"],
  wlacznikKrzyzowy: ["krzyżow", "krzyzow"],
  wlacznik: ["włącznik", "lacznik", "łącznik"],
  puszkaPodtynkowa: ["puszka podtynkowa"],
  puszkaRozgalezna: ["puszka rozgałęźna", "rozgalezna"],
  // Pięciożyłowe PRZED trzyżyłowymi: „5x4" zawiera „4", więc odwrotna kolejność
  // wrzucałaby cenę kabla pięciożyłowego do pozycji 3×4 mm².
  kabel4: ["ydyp 5x2,5", "ydyp 5×2,5", "5x4", "5×4"],
  kabel5x6: ["5x6", "5×6"],
  kabel5x10: ["5x10", "5×10"],
  kabel5x16: ["5x16", "5×16"],
  kabel5x25: ["5x25", "5×25"],
  kabel15: ["ydyp 3x1,5", "ydyp 3×1,5", "1,5 mm"],
  kabel25: ["ydyp 3x2,5", "ydyp 3×2,5", "2,5 mm"],
  kabel3x4: ["ydyp 3x4", "ydyp 3×4", "4 mm"],
  kabel3x6: ["ydyp 3x6", "ydyp 3×6", "6 mm"],
  kabel3x10: ["ydyp 3x10", "ydyp 3×10", "10 mm"],
  kabel3x16: ["ydyp 3x16", "ydyp 3×16", "16 mm"],
  kabel3x25: ["ydyp 3x25", "ydyp 3×25", "25 mm"],
  mcb: ["wyłącznik nadprądowy", "wylacznik nadpradowy", " b16", " b10", " b20"],
  rcd: ["różnicowoprądowy", "roznicowopradowy", "rcd"],
  glowny: ["wyłącznik główny", "wylacznik glowny", "rozłącznik izolacyjny", "rozlacznik izolacyjny"],
  rozdzielnica: ["rozdzielnica", "obudowa"],
};

/** Parsuje cennik CSV (`nazwa;cena` per linia) i zwraca dopasowane aktualizacje cen. */
export function parsePriceCsv(text: string): Record<string, number> {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const updates: Record<string, number> = {};
  lines.forEach((line) => {
    const parts = line.split(/[,;\t]/);
    if (parts.length < 2) return;
    const name = parts[0].toLowerCase();
    const priceRaw = parts[parts.length - 1].replace(/[^\d.,]/g, "").replace(",", ".");
    const price = parseFloat(priceRaw);
    if (!price) return;
    for (const [key, keywords] of Object.entries(CSV_KEYWORD_MAP)) {
      if (keywords.some((kw) => name.includes(kw))) {
        updates[key] = price;
        break;
      }
    }
  });
  return updates;
}
