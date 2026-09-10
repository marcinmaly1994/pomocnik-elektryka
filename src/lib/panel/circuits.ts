import type { Circuit, InstallationElement, RcdGroup, RoomShape } from "@/types";
import { ELEMENT_TYPES } from "@/lib/elements";
import { computeLightGroups } from "@/lib/lightGroups";
import { isWetRoomName, zastosowaniePokoju, ZASTOSOWANIE_OPIS, type ZastosowaniePokoju } from "@/lib/design";

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Dzieli światła na obwody, RESPEKTUJĄC grupy sterowania (lib/lightGroups.ts).
 *
 * Powód nie jest kosmetyczny: łącznik jest włączony szeregowo w przewód fazowy
 * obwodu, który zasila sterowane nim lampy — fizycznie nie da się jednym
 * łącznikiem przełączać dwóch różnych obwodów pod dwoma zabezpieczeniami.
 * Dotychczasowe `chunk(lights, N)` dzieliło światła po N „na ślepo", więc grupa
 * mogła zostać rozerwana między dwa obwody — czyli zaprojektować instalację,
 * której nie da się fizycznie wykonać. Grupa jest tu niepodzielna; limit `N`
 * (miejsce na szynie) jest respektowany między grupami, nie wewnątrz nich.
 *
 * Światła bez grupy (brak łącznika w pobliżu, brak przypisanego pomieszczenia)
 * trafiają do paczek tak jak dotychczas — każde jako grupa o rozmiarze 1, co
 * przy braku jakichkolwiek grup daje dokładnie stare zachowanie `chunk`.
 */
export function chunkLightsByGroup(
  lights: InstallationElement[],
  lightGroups: Map<string, (number | undefined)[]>,
  maxPerCircuit: number
): InstallationElement[][] {
  const bucketOrder: string[] = [];
  const buckets = new Map<string, InstallationElement[]>();
  lights.forEach((l) => {
    // Numeracja grup w computeLightGroups zaczyna się od 1 OSOBNO na każdej
    // kondygnacji, więc sam numer nie wystarcza jako klucz — bez piętra grupa 1
    // z parteru scaliłaby się z grupą 1 z piętra.
    const g = lightGroups.get(l.id)?.[0];
    const key = g != null ? `${l.floor}::grupa${g}` : `pojedyncze::${l.id}`;
    if (!buckets.has(key)) {
      buckets.set(key, []);
      bucketOrder.push(key);
    }
    buckets.get(key)!.push(l);
  });

  const circuits: InstallationElement[][] = [];
  let current: InstallationElement[] = [];
  for (const key of bucketOrder) {
    const bucket = buckets.get(key)!;
    if (current.length > 0 && current.length + bucket.length > maxPerCircuit) {
      circuits.push(current);
      current = [];
    }
    current.push(...bucket);
    // Grupa większa niż limit modułowy trafia sama, w jednym obwodzie
    // przekraczającym limit — lepiej przekroczyć zalecaną liczbę punktów niż
    // rozerwać grupę na dwa obwody, co nie dałoby się fizycznie wykonać.
    if (bucket.length > maxPerCircuit) {
      circuits.push(current);
      current = [];
    }
  }
  if (current.length) circuits.push(current);
  return circuits;
}

function roleOf(e: InstallationElement) {
  return ELEMENT_TYPES[e.type]?.role;
}

/**
 * Odbiorniki, którym numeru obwodu przypisać SIĘ NIE DA — bo z definicji mają
 * własny obwód: ładowarka EV, gniazdo trójfazowe, wypust AGD i gniazdo oznaczone
 * jako dedykowane.
 *
 * To jedyne miejsce, gdzie ręczny wybór jest odrzucany zamiast uszanowany. Powód
 * nie jest formalny: obwód takiego odbiornika ma inny przewód, inne zabezpieczenie
 * i często inną liczbę faz. Dorzucenie go do wspólnego obwodu gniazd nie dałoby
 * „obwodu z ładowarką", tylko obwód z błędnym doborem — a menu i tak musi
 * powiedzieć, dlaczego tej opcji nie ma (patrz `DesignTab`).
 */
export function maWlasnyObwodZDefinicji(e: InstallationElement): boolean {
  const rola = roleOf(e);
  return rola === "ev" || rola === "socket3f" || rola === "dedicated" || (rola === "socket" && e.dedicated);
}

/** Numer obwodu wskazany ręcznie — tylko tam, gdzie w ogóle wolno go wskazać. */
function recznyNumer(e: InstallationElement): number | undefined {
  return !maWlasnyObwodZDefinicji(e) && typeof e.obwod === "number" ? e.obwod : undefined;
}

/**
 * Obwody złożone RĘCZNIE — po numerze wpisanym przez projektanta.
 *
 * Idą PRZED regułami automatycznymi i zabierają im swoje elementy, bo ręczny wybór
 * jest decyzją projektową: automat dzieli po rodzaju punktu i mokrości pomieszczenia,
 * a projektant wie, że kuchnia ma iść osobno, choć reguła tego nie widzi.
 *
 * Przewód i zabezpieczenie biorą się z zawartości: obwód z choćby jedną oprawą jest
 * oświetleniowy (1,5 mm², B10), pozostałe gniazdowe (2,5 mm², B16). Mieszanki nie
 * blokujemy — bywa uzasadniona — ale `ostrzezeniaObwodow` ją zgłasza.
 */
function obwodyReczne(elements: InstallationElement[]): { numer: number; elementy: InstallationElement[] }[] {
  const wg = new Map<number, InstallationElement[]>();
  for (const e of elements) {
    const numer = recznyNumer(e);
    if (numer === undefined) continue;
    if (!wg.has(numer)) wg.set(numer, []);
    wg.get(numer)!.push(e);
  }
  return [...wg.entries()].sort(([a], [b]) => a - b).map(([numer, elementy]) => ({ numer, elementy }));
}

/**
 * Heurystyka grupowania elementów instalacji w obwody — przeniesiona z wersji JS.
 * Odbiorniki wymagające własnego obwodu (EV, gniazda 400V, wypusty AGD, gniazda
 * dedykowane, hermetyczne) dostają osobne obwody; zwykłe gniazda i oświetlenie są
 * grupowane po pomieszczeniu/typie w paczki po kilka sztuk (limit modułowy szyny).
 */
export function computeCircuits(wszystkie: InstallationElement[], roomShapes: RoomShape[] = []): Circuit[] {
  const circuits: Circuit[] = [];
  let n = 1;
  const add = (c: Omit<Circuit, "id">) => circuits.push({ id: "obw" + n++, ...c });

  // Najpierw to, co projektant przypisał ręcznie — reszta reguł dostaje już tylko
  // elementy bez numeru, więc automat nie „odbiera" mu jego decyzji.
  for (const { numer, elementy } of obwodyReczne(wszystkie)) {
    const oswietleniowy = elementy.some((e) => roleOf(e) === "light");
    const pokoje = [...new Set(elementy.map((e) => e.room).filter(Boolean))];
    add({
      name: `Obwód ${numer}${pokoje.length ? ` — ${pokoje.join(", ")}` : ""}`,
      type: oswietleniowy ? "oswietlenie" : "gniazdko",
      elements: elementy,
      cable: oswietleniowy ? "YDYp 3x1,5 mm²" : "YDYp 3x2,5 mm²",
      breaker: oswietleniowy ? "B10" : "B16",
      rcd: true,
    });
  }
  const elements = wszystkie.filter((e) => recznyNumer(e) === undefined);

  elements.filter((e) => roleOf(e) === "ev").forEach((e) => {
    add({ name: `Ładowarka EV — ${e.room}`, type: "gniazdko", elements: [e], cable: "YDYp 5x4 mm²", breaker: "C25 3-faz.", rcd: true });
  });

  elements.filter((e) => roleOf(e) === "socket3f").forEach((e) => {
    add({ name: `Gniazdo trójfazowe — ${e.room}`, type: "gniazdko", elements: [e], cable: "YDYp 5x2,5 mm²", breaker: "C16 3-faz.", rcd: true });
  });

  elements.filter((e) => roleOf(e) === "dedicated").forEach((e) => {
    // Rola "dedicated" niesie tylko wypust AGD (patrz ELEMENT_TYPES) — nazwa odbiornika
    // (jeśli wpisana) albo sama litera z symbolu odróżniają obwody w tym samym pokoju.
    add({ name: `Wypust AGD — ${e.room} (${e.note || `litera ${e.agdLetter || "A"}`})`, type: "gniazdko", elements: [e], cable: "YDYp 3x2,5 mm²", breaker: "B16", rcd: true });
  });

  elements.filter((e) => roleOf(e) === "socket" && e.dedicated).forEach((e) => {
    add({ name: `Obwód dedykowany — ${e.room} (${e.note || "odbiornik AGD"})`, type: "gniazdko", elements: [e], cable: "YDYp 3x2,5 mm²", breaker: "B16", rcd: true });
  });

  const herm = elements.filter((e) => roleOf(e) === "socketWet" && !e.dedicated);
  chunk(herm, 6).forEach((g, i) => {
    add({ name: `Gniazda hermetyczne ${i + 1}`, type: "gniazdko", elements: g, cable: "YDYp 3x2,5 mm²", breaker: "B16", rcd: true });
  });

  const regular = elements.filter((e) => roleOf(e) === "socket" && !e.dedicated);
  const byRoom: Record<string, InstallationElement[]> = {};
  regular.filter((e) => isWetRoomName(e.room, roomShapes)).forEach((e) => {
    (byRoom[e.room] ??= []).push(e);
  });
  Object.entries(byRoom).forEach(([room, list]) => {
    chunk(list, 6).forEach((g, i) => {
      add({ name: `Obwód gniazd — ${room}${i ? " " + (i + 1) : ""}`, type: "gniazdko", elements: g, cable: "YDYp 3x2,5 mm²", breaker: "B16", rcd: true });
    });
  });
  /**
   * Pomieszczenia SUCHE — wspólny obwód wolno dzielić tylko tym o tym samym
   * ZASTOSOWANIU (patrz `zastosowaniePokoju`).
   *
   * Wcześniej wszystkie suche punkty szły do jednego worka dzielonego co 8 sztuk, więc
   * garaż potrafił wylądować na jednym zabezpieczeniu z sypialnią, a pomieszczenie
   * nazwane tak, że reguła mokra go nie rozpoznała — z pokojami. Dwa pokoje na jednym
   * obwodzie są w porządku i dalej tak zostają; łączenie pomieszczeń o różnym
   * przeznaczeniu nie.
   */
  const sucheWgZastosowania = new Map<ZastosowaniePokoju, InstallationElement[]>();
  regular
    .filter((e) => !isWetRoomName(e.room, roomShapes))
    .forEach((e) => {
      const z = zastosowaniePokoju(e.room, roomShapes);
      if (!sucheWgZastosowania.has(z)) sucheWgZastosowania.set(z, []);
      sucheWgZastosowania.get(z)!.push(e);
    });
  for (const [zastosowanie, lista] of sucheWgZastosowania) {
    chunk(lista, 8).forEach((g, i) => {
      // „Obwód gniazd ogólnych" zostaje bez dopisku: punkty bez rozpoznanego
      // pomieszczenia to dokładnie to, co ta nazwa znaczyła od zawsze.
      const name =
        zastosowanie === "nieznane"
          ? `Obwód gniazd ogólnych ${i + 1}`
          : `Obwód gniazd — ${ZASTOSOWANIE_OPIS[zastosowanie]} ${i + 1}`;
      add({ name, type: "gniazdko", elements: g, cable: "YDYp 3x2,5 mm²", breaker: "B16", rcd: true });
    });
  }

  // Jedno wyliczenie grup dla całego planu — te same numery, które widać przy
  // łącznikach i lampach na rysunku, decydują teraz też o tym, co wyląduje na
  // wspólnym obwodzie (patrz `chunkLightsByGroup`).
  const lightGroups = computeLightGroups(elements);

  const lightsOut = elements.filter((e) => e.type === "oswietlenieZewn");
  chunkLightsByGroup(lightsOut, lightGroups, 8).forEach((g, i) => {
    add({ name: `Oświetlenie zewnętrzne ${i + 1}`, type: "oswietlenie", elements: g, cable: "YDYp 3x1,5 mm²", breaker: "B10", rcd: true });
  });
  const lightsIn = elements.filter((e) => roleOf(e) === "light" && e.type !== "oswietlenieZewn");
  chunkLightsByGroup(lightsIn, lightGroups, 10).forEach((g, i) => {
    add({ name: `Obwód oświetlenia ${i + 1}`, type: "oswietlenie", elements: g, cable: "YDYp 3x1,5 mm²", breaker: "B10", rcd: true });
  });

  chunk(
    elements.filter((e) => roleOf(e) === "blind"),
    8
  ).forEach((g, i) => {
    add({ name: `Obwód rolet ${i + 1}`, type: "roleta", elements: g, cable: "YDYp 3x1,5 mm²", breaker: "B10", rcd: true });
  });

  return circuits.filter((c) => c.elements.length > 0);
}

export interface LowVoltageSummary {
  type: string;
  label: string;
  count: number;
}

/** Elementy niskoprądowe (LAN/RTV/domofon…) — poza rozdzielnicą 230V, tylko zestawienie. */
export function computeLowVoltage(elements: InstallationElement[]): LowVoltageSummary[] {
  const lv = elements.filter((e) => roleOf(e) === "lv");
  const byType: Record<string, InstallationElement[]> = {};
  lv.forEach((e) => {
    (byType[e.type] ??= []).push(e);
  });
  return Object.entries(byType).map(([type, list]) => ({
    type,
    label: ELEMENT_TYPES[type as keyof typeof ELEMENT_TYPES].label,
    count: list.length,
  }));
}

/** Grupuje obwody po maks. 6 na jeden wyłącznik różnicowoprądowy 30 mA.
 *  Prąd ZNAMIONOWY aparatu dobiera `rcdRatingFor` w devices.ts wg rozłącznika
 *  głównego — tu ustalamy tylko czułość (patrz `RcdGroup.rating`). */
export function computeRcdGroups(circuits: Circuit[]): RcdGroup[] {
  const groups: RcdGroup[] = [];
  for (let i = 0; i < circuits.length; i += 6) {
    groups.push({ id: "rcd" + (groups.length + 1), rating: "30mA", circuits: circuits.slice(i, i + 6) });
  }
  return groups;
}

/** Dobiera orientacyjny rozłącznik główny wg liczby obwodów w instalacji. */
export function mainBreakerFor(circuitCount: number): string {
  if (circuitCount <= 6) return "B25";
  if (circuitCount <= 12) return "B32";
  return "B40";
}

/**
 * Paleta tras na rzucie — po JEDNYM kolorze na obwód.
 *
 * Wcześniej trasa brała kolor POMIESZCZENIA punktu docelowego. Dawało to spójny
 * rzut, ale gubiło rzecz najważniejszą przy czytaniu instalacji: w jednym pokoju
 * obwód gniazd i obwód oświetlenia wychodziły tym samym kolorem, więc dwa różne
 * kable wyglądały jak jeden. Kolor pomieszczenia jest już na rzucie — niesie go
 * wypełnienie obrysu — a kolor przewodu ma odpowiadać na pytanie „co siedzi na
 * jednym zabezpieczeniu".
 *
 * Barwy dobrane pod SĄSIEDZTWO: kolejne obwody dostają kolejne pozycje z listy,
 * więc różnica ma być widoczna między sąsiadami w cyklu, nie tylko „gdzieś w palecie".
 */
export const KOLORY_OBWODOW = [
  "#1F6FB2",
  "#D2691E",
  "#2E9E5B",
  "#8E5CD9",
  "#0FA3B1",
  "#D33F3F",
  "#B98C2F",
  "#D2559A",
] as const;

/** Trasa, której nie da się przypisać do żadnego obwodu (np. sterowanie oprawą, która
 *  nie weszła jeszcze do żadnego) — neutralna szarość, żeby nie udawała obwodu. */
export const KOLOR_BEZ_OBWODU = "#5B6B7E";

/** Kolor obwodu wg jego pozycji w liście obwodów — cyklicznie z `KOLORY_OBWODOW`. */
export function kolorObwodu(index: number): string {
  return KOLORY_OBWODOW[((index % KOLORY_OBWODOW.length) + KOLORY_OBWODOW.length) % KOLORY_OBWODOW.length];
}

/** Kolor wg typu obwodu — używany na schemacie jednokreskowym i w widoku rozdzielnicy. */
export function colorForCircuit(type: string): string {
  return ({ gniazdko: "#2D5A8C", oswietlenie: "#C1793F", roleta: "#7C5CBF" } as Record<string, string>)[type] || "#2D5A8C";
}

/** Zalecane maksimum punktów na obwód — PRAKTYKA projektowa, nie liczba z normy.
 *  PN-HD 60364 nie podaje limitu punktów; te wartości są tymi samymi, których używa
 *  automat wyżej, więc ręczny podział ocenia się tą samą miarą co automatyczny. */
export const ZALECANE_MAKS = { gniazda: 8, gniazdaMokre: 6, oswietlenie: 10 } as const;

export interface OstrzezenieObwodu {
  /** Numer obwodu wpisany ręcznie — po nim użytkownik go rozpozna na rzucie. */
  numer: number;
  tresc: string;
}

/**
 * Zastrzeżenia do obwodów złożonych RĘCZNIE.
 *
 * Ostrzegamy, nie blokujemy — tak jak wszędzie indziej w tej aplikacji: liczymy,
 * pokazujemy werdykt i mówimy dlaczego, zamiast odmawiać. Projektant bywa mądrzejszy
 * od reguły (kuchnia z sześcioma gniazdami, z których realnie pracują dwa), ale musi
 * wiedzieć, że od reguły odszedł.
 *
 * Elementów, które z definicji mają własny obwód, tu nie ma — ich w ogóle nie da się
 * przypisać ręcznie (patrz `maWlasnyObwodZDefinicji`).
 */
/**
 * Grupa sterowania ROZERWANA między obwody — jedyne ostrzeżenie na tej liście, które
 * mówi „tego nie da się zbudować", a nie „to odbiega od praktyki".
 *
 * Łącznik jest włączony szeregowo w przewód fazowy obwodu, który zasila sterowane nim
 * oprawy. Fizycznie nie da się jednym łącznikiem przełączać dwóch obwodów pod dwoma
 * zabezpieczeniami — automat pilnuje tego twardo (`chunkLightsByGroup`), ale RĘCZNY
 * numer omijał ten strażnik bez słowa.
 *
 * „Auto" liczy się tu jako osobne przypisanie: oprawa z numerem i oprawa bez numeru
 * trafiają do dwóch różnych obwodów tak samo skutecznie, jak dwa różne numery.
 *
 * Numery grup zaczynają się od 1 OSOBNO na każdej kondygnacji (patrz
 * `computeLightGroups`), więc kluczem musi być piętro razem z numerem — inaczej
 * grupa 1 z parteru zlałaby się z grupą 1 z piętra.
 */
function rozerwaneGrupySterowania(elements: InstallationElement[]): OstrzezenieObwodu[] {
  const grupy = computeLightGroups(elements);
  const wg = new Map<string, { numery: Set<number | "auto">; opis: string }>();

  for (const e of elements) {
    if (roleOf(e) !== "light") continue;
    const g = grupy.get(e.id)?.[0];
    if (g == null) continue;
    const klucz = `${e.floor}::${g}`;
    if (!wg.has(klucz)) wg.set(klucz, { numery: new Set(), opis: `${g}${e.room ? ` (${e.room})` : ""}` });
    wg.get(klucz)!.numery.add(recznyNumer(e) ?? "auto");
  }

  const out: OstrzezenieObwodu[] = [];
  for (const { numery, opis } of wg.values()) {
    // Jeden wspólny obwód dla całej grupy — tak ma być.
    if (numery.size < 2) continue;
    // Grupa bez ANI JEDNEGO ręcznego numeru nie jest naszą sprawą: tamtą pilnuje
    // automat i z definicji jej nie rozrywa.
    const reczne = [...numery].filter((n): n is number => typeof n === "number");
    if (reczne.length === 0) continue;
    const wypis = [...numery].map((n) => (n === "auto" ? "automat" : `obwód ${n}`)).join(" i ");
    out.push({
      numer: Math.min(...reczne),
      tresc: `Oprawy sterowane jednym łącznikiem (grupa ${opis}) trafiły do różnych obwodów: ${wypis}. Tego nie da się wykonać — łącznik siedzi w przewodzie JEDNEGO obwodu, więc nie przełączy drugiego. Nadaj wszystkim oprawom tej grupy ten sam numer.`,
    });
  }
  return out;
}

export function ostrzezeniaObwodow(
  elements: InstallationElement[],
  roomShapes: RoomShape[] = []
): OstrzezenieObwodu[] {
  const out: OstrzezenieObwodu[] = [...rozerwaneGrupySterowania(elements)];
  for (const { numer, elementy } of obwodyReczne(elements)) {
    const oprawy = elementy.filter((e) => roleOf(e) === "light").length;
    const gniazda = elementy.length - oprawy;

    // Mieszanka oświetlenia z gniazdami: fizycznie wykonalna, ale dobór potraktuje
    // taki obwód jako oświetleniowy (1,5 mm², B10) — a to za mało pod gniazda.
    if (oprawy > 0 && gniazda > 0) {
      out.push({
        numer,
        tresc: `Obwód ${numer} miesza oświetlenie (${oprawy}) z gniazdami (${gniazda}). Dobór potraktuje go jako oświetleniowy — 1,5 mm² i B10, czyli za mało pod gniazda. Rozdziel je albo sprawdź dobór ręcznie.`,
      });
    }

    /**
     * Pomieszczenia o RÓŻNYM zastosowaniu na jednym obwodzie.
     *
     * Automat tego nie robi (patrz podział gniazd wyżej), ale ręczny numer omija ten
     * podział bez słowa. Ostrzegamy, nie blokujemy: bywa uzasadnione — dwa sąsiadujące
     * pomieszczenia przy jednym pionie, jedno gniazdo w garażu obok drzwi do domu —
     * tyle że wspólny obwód znaczy wspólne zabezpieczenie, więc usterka w jednym gasi
     * oba. Punkty bez rozpoznanego pomieszczenia (`nieznane`) nie liczą się do
     * różnicy: nie wiadomo, do czego służą, więc nie ma czego zgłaszać.
     */
    const zastosowania = [...new Set(elementy.map((e) => zastosowaniePokoju(e.room, roomShapes)))].filter(
      (z) => z !== "nieznane"
    );
    if (zastosowania.length > 1) {
      out.push({
        numer,
        tresc: `Obwód ${numer} łączy pomieszczenia o różnym przeznaczeniu (${zastosowania
          .map((z) => ZASTOSOWANIE_OPIS[z])
          .join(" i ")}). Wspólny obwód to wspólne zabezpieczenie — usterka w jednym z nich wyłączy pozostałe. Jeśli to nie jest zamierzone, rozdziel je na osobne obwody.`,
      });
    }

    const mokre = elementy.filter((e) => roleOf(e) === "socketWet" || isWetRoomName(e.room, roomShapes)).length;
    const limit =
      oprawy > 0 && gniazda === 0
        ? ZALECANE_MAKS.oswietlenie
        : mokre > 0
          ? ZALECANE_MAKS.gniazdaMokre
          : ZALECANE_MAKS.gniazda;
    if (elementy.length > limit) {
      out.push({
        numer,
        tresc: `Obwód ${numer} ma ${elementy.length} punktów przy zalecanych ${limit}${mokre > 0 ? " (pomieszczenie mokre)" : ""}. To praktyka projektowa, nie zakaz z normy — ale przy takiej liczbie punktów sprawdź obciążenie i spadek napięcia.`,
      });
    }
  }
  return out;
}
