/**
 * Model obciążeń i długości tras — warstwa, która zamienia RYSUNEK w liczby
 * wejściowe do doboru (`sizing.ts`).
 *
 * Rozdzielenie jest celowe: `sizing.ts` liczy wyłącznie z normy i nie wie, skąd
 * biorą się moc i długość. Tutaj mieszkają ZAŁOŻENIA — moce typowe odbiorników
 * i sposób szacowania trasy. Każde z nich jest jawne i opisane, bo to jedyne
 * miejsce w całym łańcuchu, gdzie liczby nie pochodzą wprost z tablic.
 */

import type { CableRoute, Circuit, ElementType, InstallationElement, Point, RoomShape, Wall } from "@/types";
import { ELEMENT_TYPES } from "@/lib/elements";
import { computeLightGroups, isLightControl, isLightPoint } from "@/lib/lightGroups";
import { crossesGeometry, routeAlongWalls } from "./routing";

/**
 * Moc typowa pojedynczego punktu [W] — wartości projektowe, nie katalogowe.
 *
 * Dobrane „na wyrost względem dzisiejszego LED-a", bo obwód ma przeżyć wymianę
 * opraw i sprzętu: punkt sufitowy liczony jako 60 W obsłuży zarówno żarówkę LED
 * 8 W, jak i pięcioramienny żyrandol. Gniazdo liczone jest przed współczynnikiem
 * jednoczesności (patrz DIVERSITY) — stąd 300 W, a nie 3680 W wynikające z
 * obciążalności samego gniazda.
 */
export const ASSUMED_POWER_W: Partial<Record<ElementType, number>> = {
  gniazdko: 300,
  gniazdkoHerm: 300,
  gniazdko400: 3000,
  wypustAGD: 2000,
  ladowarkaEV: 7400,
  oswietlenie: 60,
  kinkiet: 40,
  oswietlenieZewn: 60,
  tasmaLed: 30,
  roleta: 100,
  wentylator: 50,
};

/**
 * Współczynnik jednoczesności ks wg rodzaju obwodu.
 *
 * Oświetlenie: 1,0 — wszystkie lampy w obwodzie mogą świecić naraz i zwykle świecą.
 * Gniazda: 0,4 — z ośmiu gniazd w pokoju realnie pracują dwa-trzy. To wartość
 * z praktyki projektowej dla instalacji mieszkaniowych; przy obwodzie kuchennym
 * bywa wyższa, dlatego obwody kuchenne i tak dostają osobne zabezpieczenie.
 * Dedykowane: 1,0 — obwód istnieje właśnie po to, żeby ten jeden odbiornik mógł
 * pracować z pełną mocą.
 */
export const DIVERSITY: Record<"oswietlenie" | "gniazda" | "dedykowany", number> = {
  oswietlenie: 1,
  gniazda: 0.4,
  dedykowany: 1,
};

/** Minimalna moc obliczeniowa obwodu gniazdowego [W] — obwód z jednym gniazdem
 *  i tak trzeba wymiarować na sensowny pobór, inaczej spadek napięcia wychodzi
 *  nierealistycznie mały i długa trasa przechodzi kontrolę, której nie powinna. */
const MIN_SOCKET_CIRCUIT_W = 1500;

export interface CircuitDemand {
  /** Moc obliczeniowa obwodu po współczynniku jednoczesności [W]. */
  powerW: number;
  /** Suma mocy zainstalowanej [W] — do bilansu mocy, nie do doboru. */
  installedW: number;
  /** Elementy bez przypisanej mocy typowej (np. łączniki) — pomijane w bilansie. */
  skipped: number;
}

/** Moc obliczeniowa obwodu: suma mocy typowych × ks, z podłogą dla obwodów gniazdowych. */
export function circuitDemand(
  elements: InstallationElement[],
  kind: "oswietlenie" | "gniazda" | "dedykowany"
): CircuitDemand {
  let installedW = 0;
  let skipped = 0;
  for (const e of elements) {
    const p = ASSUMED_POWER_W[e.type];
    if (p === undefined) {
      skipped += 1;
      continue;
    }
    // Gniazdo wielokrotne (ramka 2-/3-krotna) to tyle odbiorników, ile gniazd.
    installedW += p * Math.max(1, e.gangs || 1);
  }
  const diversified = installedW * DIVERSITY[kind];
  const powerW = kind === "gniazda" ? Math.max(diversified, MIN_SOCKET_CIRCUIT_W) : diversified;
  return { powerW, installedW, skipped };
}

/**
 * Wysokość kondygnacji przyjmowana do naddatku pionowego [m]. Trasa nie biegnie
 * po podłodze w linii prostej: przewód idzie pod sufit i schodzi do puszki.
 */
const CEILING_RUN_M = 2.8;
/** Zapas na zejście do osprzętu i zapas montażowy w puszce [m]. */
const SLACK_M = 1.5;

export interface RouteEstimate {
  /** Trasa do NAJDALSZEGO punktu obwodu [m] — to ona decyduje o spadku napięcia. */
  worstCaseM: number;
  /** Suma tras do wszystkich punktów [m] — materiał do kosztorysu. */
  totalM: number;
}

/**
 * Szacuje długości tras od rozdzielnicy do punktów obwodu.
 *
 * Manhattan, nie linia prosta: przewody układa się wzdłuż ścian i pod stropem,
 * nie po przekątnej pokoju. Do każdego punktu doliczany jest bieg pionowy
 * (pod sufit i z powrotem w dół) oraz zapas montażowy.
 *
 * `metersPerUnit` pochodzi z kalibracji skali planu. Bez kalibracji zwraca `null`
 * — i to jest właściwe zachowanie: lepiej powiedzieć „nie wiem", niż podać
 * spadek napięcia policzony z długości wziętej z sufitu.
 */
export function estimateRoutes(
  panel: Point | null,
  elements: InstallationElement[],
  metersPerUnit: number | null
): RouteEstimate | null {
  if (!panel || metersPerUnit === null || !(metersPerUnit > 0) || elements.length === 0) return null;
  let worst = 0;
  let total = 0;
  for (const e of elements) {
    const manhattanUnits = Math.abs(e.x - panel.x) + Math.abs(e.y - panel.y);
    const runM = manhattanUnits * metersPerUnit + CEILING_RUN_M + SLACK_M;
    total += runM;
    if (runM > worst) worst = runM;
  }
  return { worstCaseM: round1(worst), totalM: round1(total) };
}

/** Znajduje rozdzielnicę na danej kondygnacji — punkt odniesienia dla wszystkich tras. */
export function findPanel(elements: InstallationElement[]): Point | null {
  const p = elements.find((e) => e.type === "rozdzielnica");
  return p ? { x: p.x, y: p.y } : null;
}

/** Łamana Manhattan (jedno załamanie: najpierw poziomo, potem pionowo) — zapasowa
 *  trasa, gdy `routeAlongWalls` nie znajdzie połączenia (brak ścian/pomieszczeń na
 *  kondygnacji, albo końce siedzą w dwóch niepołączonych kawałkach narysowanej
 *  geometrii). Ten sam kształt trasy co przed dodaniem routingu po ścianach
 *  (krok 1) — wciąż lepszy niż linia prosta po przekątnej pokoju. Używana zarówno
 *  dla tras zasilania (rozdzielnica→punkt), jak i sterowania (łącznik→oprawa).
 *
 *  Załamanie ma DWIE możliwe orientacje (przez `{to.x, from.y}` albo przez
 *  `{from.x, to.y}`) — bez geometrii ścian nie da się ich porządnie routować, ale
 *  da się sprawdzić, która z dwóch prostych łamanych NIE przecina po drodze
 *  narysowanej ściany/obrysu (`crossesGeometry`), i wybrać tę. Gdy obie przecinają
 *  coś (albo nic nie narysowano), zostaje pierwsza — to nadal tylko SZACUNEK,
 *  sygnalizowany na rysunku przerywaną kreską, nie obietnica trasy. */
function manhattanFallback(from: Point, to: Point, walls: Wall[], roomShapes: RoomShape[]): Point[] {
  const cornerA: Point = { x: to.x, y: from.y };
  if (cornerA.x === from.x || cornerA.y === to.y) return [from, to];
  const cornerB: Point = { x: from.x, y: to.y };
  const blockedA = crossesGeometry(from, cornerA, walls, roomShapes) || crossesGeometry(cornerA, to, walls, roomShapes);
  if (!blockedA) return [from, cornerA, to];
  const blockedB = crossesGeometry(from, cornerB, walls, roomShapes) || crossesGeometry(cornerB, to, walls, roomShapes);
  return blockedB ? [from, cornerA, to] : [from, cornerB, to];
}

/** Długość łamanej w jednostkach planu — do `lengthUnits`, niezależnie od tego, czy
 *  trasa jest routowana po ścianach, czy to zapasowa łamana Manhattan. */
function polylineLengthUnits(points: Point[]): number {
  let sum = 0;
  for (let i = 0; i < points.length - 1; i++) sum += Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
  return sum;
}

/**
 * Trasy STEROWANIA: łącznik → oprawa, którą przełącza (patrz `computeLightGroups` w
 * lightGroups.ts — wspólny numer grupy łączy łącznik z oprawami, które steruje).
 *
 * Elektrycznie to inna para żył niż zasilanie z rozdzielnicy: fazę do oprawy łączy
 * (i rozłącza) SAM łącznik, więc bez tej trasy rysunek sugerowałby, że łącznik
 * wisi w powietrzu, niepodłączony do niczego — a jest odwrotnie: to jedyny
 * odbiornik/aparat na planie, który nie dostaje WŁASNEJ trasy z rozdzielnicy
 * (patrz pętla niżej: `computeCircuits` celowo nigdy nie wkłada łączników do
 * `circuit.elements`), bo jego zadaniem jest przełączanie już zasilonej oprawy,
 * a nie pobór własnej mocy z osobnego obwodu.
 *
 * `cable`/`breaker`/`circuitId`/`circuitName` przejęte od obwodu, do którego
 * należy STEROWANA OPRAWA (nie tworzymy dla sterowania osobnego, zmyślonego
 * obwodu) — sterowanie fizycznie jedzie tym samym kablem 3-żyłowym co zasilanie
 * (faza, powrót łączony, neutralny), więc to ta sama przynależność obwodowa.
 */
function buildControlRoutes(
  elements: InstallationElement[],
  circuits: Circuit[],
  walls: Wall[],
  roomShapes: RoomShape[],
  groups: Map<string, (number | undefined)[]>
): CableRoute[] {
  const byGroup = new Map<number, { controls: InstallationElement[]; lights: InstallationElement[] }>();
  elements.forEach((e) => {
    const nums = groups.get(e.id);
    if (!nums) return;
    nums.forEach((n) => {
      if (n == null) return;
      const bucket = byGroup.get(n) ?? { controls: [], lights: [] };
      if (isLightControl(e)) bucket.controls.push(e);
      if (isLightPoint(e)) bucket.lights.push(e);
      byGroup.set(n, bucket);
    });
  });

  const out: CableRoute[] = [];
  byGroup.forEach((bucket) => {
    bucket.controls.forEach((c) => {
      bucket.lights.forEach((l) => {
        const from: Point = { x: c.x, y: c.y };
        const to: Point = { x: l.x, y: l.y };
        const routed = routeAlongWalls(from, to, walls, roomShapes);
        const points = routed ?? manhattanFallback(from, to, walls, roomShapes);
        const circuit = circuits.find((circ) => circ.elements.some((el) => el.id === l.id));
        out.push({
          id: `${c.id}->${l.id}`,
          circuitId: circuit?.id ?? "",
          circuitName: circuit?.name ?? "Sterowanie oświetleniem",
          type: l.type,
          cable: circuit?.cable ?? "",
          breaker: circuit?.breaker ?? "",
          room: l.room,
          floor: l.floor,
          points,
          viaWalls: routed !== null,
          kind: "sterowanie",
          lengthUnits: polylineLengthUnits(points),
        });
      });
    });
  });
  return out;
}

/**
 * Łącznik sterujący daną oprawą, NAJBLIŻSZY jej ze wszystkich dzielących z nią
 * numer grupy (patrz `computeLightGroups`) — `null`, gdy oprawa nie jest w ogóle
 * sterowana żadnym łącznikiem na planie (np. jeszcze niepostawionym, albo
 * sterowaną inaczej niż łącznikiem ściennym).
 *
 * Używane do PRZEKIEROWANIA trasy zasilania: w typowej polskiej instalacji
 * zasilanie (faza + neutralny) dochodzi NAJPIERW do puszki łącznika, a dopiero
 * stamtąd 3-żyłowy przewód (faza stała, faza łączona, neutralny) idzie do oprawy
 * — a nie odwrotnie. Przy łączniku schodowym/krzyżowym (kilka łączników na jedną
 * oprawę) wybieramy najbliższy — sama instalacja międzyłącznikowa nie jest tu
 * modelowana, to uproszczenie na tym samym poziomie co reszta routingu.
 */
function findControllingSwitch(
  light: InstallationElement,
  elements: InstallationElement[],
  groups: Map<string, (number | undefined)[]>
): InstallationElement | null {
  const myGroups = new Set((groups.get(light.id) ?? []).filter((n): n is number => n != null));
  if (myGroups.size === 0) return null;

  let best: InstallationElement | null = null;
  let bestDistSq = Infinity;
  for (const e of elements) {
    if (!isLightControl(e)) continue;
    const nums = groups.get(e.id);
    if (!nums?.some((n) => n != null && myGroups.has(n))) continue;
    const distSq = (e.x - light.x) ** 2 + (e.y - light.y) ** 2;
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      best = e;
    }
  }
  return best;
}

/**
 * Wizualne trasy przewodów do narysowania na planie — WZDŁUŻ narysowanych ścian i
 * obrysów pomieszczeń (`routeAlongWalls`, krok 2), a gdy to się nie uda (brak
 * geometrii, albo końce w dwóch niepołączonych jej kawałkach) — łamana Manhattan
 * jako zapasowa trasa (krok 1). `CableRoute.viaWalls` mówi, z której z tych dwóch
 * dana trasa pochodzi.
 *
 * DWA rodzaje tras, zgodnie z tym, jak faktycznie biegnie przewód (`CableRoute.kind`):
 * - „zasilanie" — rozdzielnica → każdy punkt obwodu (gniazdko, oprawa, roleta…).
 *   Obwody RÓŻNYCH rodzajów (oświetleniowy, gniazdowy…) mają WŁASNE, niezależne
 *   trasy — `computeCircuits` nigdy nie miesza ich w jeden obwód, więc nawet gdy
 *   dwie trasy fizycznie biegną tym samym odcinkiem ściany, to i tak dwa osobne
 *   przewody, nie jeden wspólny (patrz rozsuwanie równoległych tras w
 *   DesignCanvas.tsx — bez niego nakładające się trasy wyglądały jak jedna).
 *   WYJĄTEK: oprawa STEROWANA łącznikiem dostaje trasę zasilania NIE do siebie,
 *   tylko do TEGO łącznika (`findControllingSwitch`) — zasilanie fizycznie
 *   dochodzi najpierw do puszki łącznika, a dopiero stamtąd 3-żyłowy przewód
 *   (patrz „sterowanie" niżej) prowadzi do oprawy. Bez tego rysunek sugerowałby
 *   odwrotną, nierealistyczną kolejność: zasilanie prosto do oprawy, z
 *   niezależnym doczepionym sterowaniem, zamiast jednego logicznego łańcucha
 *   rozdzielnica → łącznik → oprawa.
 * - „sterowanie" — łącznik → oprawa, którą przełącza (patrz `buildControlRoutes`).
 *   Sam łącznik NIE dostaje WŁASNEGO obwodu z rozdzielnicy (nie jest samodzielnym
 *   odbiornikiem) — trasa zasilania, którą dostaje (patrz wyżej), należy nadal do
 *   obwodu oprawy, nie do jakiegoś zmyślonego obwodu łącznika.
 *
 * Osobna funkcja od `estimateRoutes`: tamta liczy WYŁĄCZNIE metry do kosztorysu/doboru
 * (z narzutem na bieg pod stropem i zapasem montażowym, które nie mają odpowiednika na
 * rysunku 2D) i dlatego wymaga kalibracji skali. Ta zwraca same punkty ścieżki w
 * jednostkach planu — do narysowania linii nie trzeba znać jej długości w metrach,
 * więc trasy sterowania działają nawet bez skali I bez rozdzielnicy na planie
 * (`panel === null` gasi WYŁĄCZNIE trasy zasilania, nie sterowania — łącznik i
 * oprawa nie potrzebują rozdzielnicy, żeby pokazać swoją zależność).
 *
 * `circuits`/`elements`/`walls`/`roomShapes` powinny pochodzić z TEJ SAMEJ
 * kondygnacji co `panel` — trasa między kondygnacjami nie ma sensu na płaskim
 * rysunku (każda ma własny układ współrzędnych). To odpowiedzialność wywołującego
 * (patrz `useActiveFloorElements`/`useActiveFloorWalls`/`useActiveFloorRoomShapes`).
 */
export function buildCableRoutes(
  panel: Point | null,
  circuits: Circuit[],
  elements: InstallationElement[],
  walls: Wall[],
  roomShapes: RoomShape[]
): CableRoute[] {
  const lightGroups = computeLightGroups(elements);
  const control = buildControlRoutes(elements, circuits, walls, roomShapes, lightGroups);
  if (!panel) return control;

  const supply: CableRoute[] = [];
  for (const c of circuits) {
    for (const e of c.elements) {
      // Oprawa sterowana łącznikiem: zasilanie kończy się NA ŁĄCZNIKU, nie na
      // oprawie — patrz `findControllingSwitch` i komentarz przy tej funkcji
      // niżej. Każdy inny odbiornik (gniazdko, roleta, oprawa BEZ łącznika…)
      // dostaje zasilanie wprost do siebie, jak dotychczas.
      const controllingSwitch = isLightPoint(e) ? findControllingSwitch(e, elements, lightGroups) : null;
      // Punkty świadomie skopiowane do gołego `{x,y}` — `Point[]` ma zostać lekką
      // geometrią, a nie przeciekiem całego `InstallationElement` (rola, pokój,
      // kondygnacja…) tam, gdzie potrzebna jest tylko ścieżka do narysowania.
      const end: Point = controllingSwitch ? { x: controllingSwitch.x, y: controllingSwitch.y } : { x: e.x, y: e.y };
      const routed = routeAlongWalls(panel, end, walls, roomShapes);
      const points = routed ?? manhattanFallback(panel, end, walls, roomShapes);
      supply.push({
        id: e.id,
        circuitId: c.id,
        circuitName: c.name,
        type: e.type,
        cable: c.cable,
        breaker: c.breaker,
        room: e.room,
        floor: e.floor,
        points,
        viaWalls: routed !== null,
        kind: "zasilanie",
        lengthUnits: polylineLengthUnits(points),
      });
    }
  }
  return [...supply, ...control];
}

/** O ile jednostek planu rozsunąć sąsiednie „pasy" tras dzielących ten sam odcinek —
 *  dobrane pod grubość linii trasy w DesignCanvas.tsx (2,5), żeby sąsiednie pasy się
 *  nie stykały, ale też nie odjeżdżały bezsensownie daleko od samej ściany. */
const LANE_SPACING = 4;

/** Klucz odcinka [a,b] NIEZALEŻNY od kierunku (a→b to ten sam odcinek co b→a) i
 *  odporny na drobne różnice zmiennoprzecinkowe między trasami policzonymi
 *  niezależnie, ale po tym samym grafie ścian (stąd zaokrąglenie). */
function segmentKey(a: Point, b: Point): string {
  const pa = `${Math.round(a.x)},${Math.round(a.y)}`;
  const pb = `${Math.round(b.x)},${Math.round(b.y)}`;
  return pa < pb ? `${pa}|${pb}` : `${pb}|${pa}`;
}

/**
 * Rozsuwa trasy, które na jakimś odcinku biegną DOKŁADNIE tym samym śladem, w
 * równoległe „pasy" — bez tego dwie niezależne trasy (np. obwód oświetleniowy i
 * gniazdowy poprowadzone tym samym korytarzem) rysują się jedna na drugiej i
 * wyglądają jak WSPÓLNY przewód, mimo że to dwa osobne obwody, które w
 * rzeczywistości nigdy nie dzielą żyły.
 *
 * Działa na GOTOWYCH trasach z `buildCableRoutes` — nie zmienia ich `points`
 * (`CableRoute` zostaje semantycznie dokładną geometrią, `lengthUnits` się nie
 * rusza), tylko zwraca osobną mapę „co narysować" per trasa. Rozjeżdża się na
 * odcinku po odcinku: gdy dwie trasy rozchodzą się w różnych miejscach, kolejne
 * odcinki mogą mieć różny zestaw „współlokatorów" i różny pas — to naturalne
 * (tak jak w realnym pęku przewodów, część biegnie razem, część się rozchodzi),
 * kosztem drobnego „łamania" na stykach zamiast idealnie gładkiej linii.
 */
export function spreadOverlappingRoutes(routes: CableRoute[]): Map<string, Point[]> {
  const usersBySegment = new Map<string, string[]>();
  routes.forEach((r) => {
    for (let i = 0; i < r.points.length - 1; i++) {
      const key = segmentKey(r.points[i], r.points[i + 1]);
      const users = usersBySegment.get(key) ?? [];
      if (!users.includes(r.id)) users.push(r.id);
      usersBySegment.set(key, users);
    }
  });
  // Stabilny, deterministyczny porządek pasów w obrębie odcinka — inaczej ten sam
  // rysunek dostawałby losowo inny układ pasów przy każdym przeliczeniu.
  usersBySegment.forEach((users) => users.sort());

  const out = new Map<string, Point[]>();
  routes.forEach((r) => {
    const points: Point[] = [];
    for (let i = 0; i < r.points.length - 1; i++) {
      const a = r.points[i];
      const b = r.points[i + 1];
      const users = usersBySegment.get(segmentKey(a, b))!;
      const lane = users.indexOf(r.id);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      // Zerowej długości odcinek (np. `from`===`to` po zaokrągleniu) nie ma
      // kierunku, więc nie ma jak wyznaczyć prostopadłej — zostaje bez przesunięcia.
      const offset =
        len > 0 && users.length > 1
          ? { x: (-dy / len) * (lane - (users.length - 1) / 2) * LANE_SPACING, y: (dx / len) * (lane - (users.length - 1) / 2) * LANE_SPACING }
          : { x: 0, y: 0 };
      points.push({ x: a.x + offset.x, y: a.y + offset.y });
      points.push({ x: b.x + offset.x, y: b.y + offset.y });
    }
    out.set(r.id, points);
  });
  return out;
}

/**
 * Nakłada ręczne poprawki tras (przeciągnięte przez użytkownika na planie, patrz
 * `routeOverrides` w store'ie i edycję uchwytów w DesignCanvas.tsx) na świeżo
 * policzone trasy.
 *
 * Poprawka trzyma WYŁĄCZNIE środkowe punkty (załamania) — bez pierwszego i
 * ostatniego, które zawsze biorą się z aktualnej pozycji rozdzielnicy/łącznika i
 * punktu/oprawy (dokładnie tak zaczyna/kończy się `route.points` w `buildCableRoutes`
 * i `buildControlRoutes`). Dzięki temu przesunięcie elementu na planie nie gubi
 * ręcznie ułożonych zagięć — koniec trasy po prostu podąża za nowym miejscem
 * elementu, tak jak przy trasie automatycznej.
 */
export function applyRouteOverrides(routes: CableRoute[], overrides: Record<string, Point[]>): CableRoute[] {
  return routes.map((r) => {
    const mid = overrides[r.id];
    if (!mid || mid.length === 0) return r;
    const points = [r.points[0], ...mid, r.points[r.points.length - 1]];
    return { ...r, points, lengthUnits: polylineLengthUnits(points) };
  });
}

/** Rodzaj obwodu wg roli elementów — mapowanie na kategorie używane w doborze. */
export function kindForElements(elements: InstallationElement[]): "oswietlenie" | "gniazda" | "dedykowany" {
  const roles = elements.map((e) => ELEMENT_TYPES[e.type]?.role);
  if (roles.some((r) => r === "ev" || r === "socket3f" || r === "dedicated")) return "dedykowany";
  if (roles.some((r) => r === "light")) return "oswietlenie";
  return "gniazda";
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
