/**
 * Model obciążeń i długości tras — warstwa, która zamienia RYSUNEK w liczby
 * wejściowe do doboru (`sizing.ts`).
 *
 * Rozdzielenie jest celowe: `sizing.ts` liczy wyłącznie z normy i nie wie, skąd
 * biorą się moc i długość. Tutaj mieszkają ZAŁOŻENIA — moce typowe odbiorników
 * i sposób szacowania trasy. Każde z nich jest jawne i opisane, bo to jedyne
 * miejsce w całym łańcuchu, gdzie liczby nie pochodzą wprost z tablic.
 */

import type { CableRoute, Circuit, ElementType, InstallationElement, Point } from "@/types";
import { ELEMENT_TYPES } from "@/lib/elements";

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

/**
 * Wizualne trasy przewodów — łamana Manhattan (jedno załamanie: najpierw poziomo,
 * potem pionowo) od rozdzielnicy do każdego punktu obwodu, do narysowania na planie.
 *
 * Osobna funkcja od `estimateRoutes`: tamta liczy WYŁĄCZNIE metry do kosztorysu/doboru
 * (z narzutem na bieg pod stropem i zapasem montażowym, które nie mają odpowiednika na
 * rysunku 2D) i dlatego wymaga kalibracji skali. Ta zwraca same punkty ścieżki w
 * jednostkach planu — do narysowania linii nie trzeba znać jej długości w metrach,
 * więc działa też BEZ skali (jedynym warunkiem jest postawiona na planie rozdzielnica).
 *
 * `circuits` powinny pochodzić z elementów TEJ SAMEJ kondygnacji co `panel` — trasa
 * między kondygnacjami nie ma sensu na płaskim rysunku (każda ma własny układ
 * współrzędnych). To odpowiedzialność wywołującego (patrz `useActiveFloorElements`).
 */
export function buildCableRoutes(panel: Point | null, circuits: Circuit[]): CableRoute[] {
  if (!panel) return [];
  const out: CableRoute[] = [];
  for (const c of circuits) {
    for (const e of c.elements) {
      // Punkty świadomie skopiowane do gołego `{x,y}` — `Point[]` ma zostać lekką
      // geometrią, a nie przeciekiem całego `InstallationElement` (rola, pokój,
      // kondygnacja…) tam, gdzie potrzebna jest tylko ścieżka do narysowania.
      const end: Point = { x: e.x, y: e.y };
      const corner: Point = { x: e.x, y: panel.y };
      const points = corner.x === panel.x || corner.y === end.y ? [panel, end] : [panel, corner, end];
      out.push({
        id: e.id,
        circuitId: c.id,
        circuitName: c.name,
        type: e.type,
        cable: c.cable,
        breaker: c.breaker,
        floor: e.floor,
        points,
        lengthUnits: Math.abs(e.x - panel.x) + Math.abs(e.y - panel.y),
      });
    }
  }
  return out;
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
