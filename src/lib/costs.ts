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
  mcb: 15, mcb3f: 45, rcd: 90, glowny: 60, rozdzielnica: 130, robocizna: 0,
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
  kabelLan: "Przewód UTP kat. 6 (mb)",
  kabelKoncentryk: "Przewód koncentryczny RG-6 (mb)",
  mcb: "Wyłącznik nadprądowy 1-faz. B10/16 (szt.)",
  mcb3f: "Wyłącznik nadprądowy 3-faz. C16/C25 (szt.)",
  rcd: "Wyłącznik różnicowoprądowy 30mA (szt.)",
  glowny: "Wyłącznik główny (szt.)",
  rozdzielnica: "Obudowa rozdzielnicy (szt.)",
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
  puszka: "puszkaRozgalezna", rozdzielnica: "rozdzielnica",
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
}

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

  const pointElements = elements.filter((e) => !["rozdzielnica", "puszka"].includes(e.type) && ELEMENT_TYPES[e.type]?.role !== "sanitary");
  const rooms = new Set(elements.map((e) => e.room)).size || 1;
  q.puszkaPodtynkowa = pointElements.length;
  q.puszkaRozgalezna = Math.max(q.puszkaRozgalezna, rooms);
  q.robocizna = pointElements.length;

  let kabel15 = 0;
  let kabel25 = 0;
  let kabel4 = 0;
  // Trasa policzona po planie bije ryczałt: obwód z pięcioma gniazdami tuż przy
  // rozdzielnicy i taki sam obwód na drugim końcu domu dostawały dotąd identyczne
  // 35 mb, co jest zgadywaniem, nie kosztorysem.
  const measured = opts.routeLengthsM;
  const hasMeasured = !!measured && circuits.some((c) => measured.has(c.id));
  circuits.forEach((c) => {
    const len = measured?.get(c.id) ?? c.elements.length * 5 + 10;
    if (c.cable.includes("1,5")) kabel15 += len;
    else if (c.cable.includes("5x2,5") || c.cable.includes("5x4")) kabel4 += len;
    else kabel25 += len;
  });
  q.kabel15 = Math.round(kabel15);
  q.kabel25 = Math.round(kabel25);
  q.kabel4 = Math.round(kabel4);

  q.kabelLan = (q.rj45 + q.domofon) * 15;
  q.kabelKoncentryk = q.rtvsat * 15;

  const threePhase = circuits.filter((c) => c.breaker.includes("3-faz.")).length;
  q.mcb3f = threePhase;
  q.mcb = circuits.length - threePhase;
  q.rcd = rcdGroups.length;
  q.glowny = circuits.length ? 1 : 0;
  q.rozdzielnica = Math.max(q.rozdzielnica, circuits.length ? 1 : 0);

  return { quantities: q, cableLengthSource: hasMeasured ? "plan" : "ryczalt" };
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
  kabel15: ["ydyp 3x1,5", "ydyp 3×1,5", "1,5 mm"],
  kabel25: ["ydyp 3x2,5", "ydyp 3×2,5", "2,5 mm"],
  kabel4: ["ydyp 3x4", "ydyp 5x2,5", "4 mm"],
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
