import type { ElementType, Point, RoomShape, Wall } from "@/types";
import { nearestPointOnPolyline, pointInPolygon } from "@/lib/geometry";

/**
 * Przyklejanie osprzętu do ściany, z obrotem symbolu prostopadle do niej.
 *
 * Powód: gniazdko postawione przy skośnej albo pionowej ścianie stało w domyślnej
 * orientacji i trzeba je było obracać ręcznie klawiszem R. Przy kilkudziesięciu
 * elementach to kilkadziesiąt dodatkowych ruchów — a że prawie nikt ich nie wykonuje,
 * rzuty wychodziły z symbolami zwróconymi byle jak.
 *
 * Co jest tu trudne: nie sam obrót o 90°, tylko KTÓRA ze stron. Symbol gniazda ma
 * trzonek (patrz `SocketArcKonva`) — w rysunku instalacyjnym trzonek wchodzi w ścianę,
 * a łuk patrzy w pomieszczenie. Obrót w złą stronę wygląda dokładnie tak samo źle jak
 * brak obrotu, więc strona jest wybierana świadomie: trzonek ma być odwrócony od
 * ŚRODKA pomieszczenia, w którym element stoi.
 */

/**
 * Typy montowane pod stropem albo stojące wolno — te NIE przyklejają się do ściany.
 *
 * Punkt sufitowy i czujnik dymu wiszą na środku pomieszczenia; przyklejenie ich do
 * najbliższej ściany byłoby aktywnym psuciem rysunku. Przybory sanitarne to nie
 * osprzęt, tylko punkt odniesienia dla stref — ich pozycję ustawia się względem
 * rzeczywistego wyposażenia łazienki, nie względem linii ściany.
 */
const NIE_PRZYSCIENNE: readonly ElementType[] = ["oswietlenie", "czujnikDymu", "wanna", "prysznic", "umywalka"];

export function przyscienny(type: ElementType): boolean {
  return !NIE_PRZYSCIENNE.includes(type);
}

export interface WynikPrzyciagania {
  x: number;
  y: number;
  /** Obrót symbolu w stopniach, prostopadle do ściany. */
  rotation: number;
}

/** Zamknięty obrys pomieszczenia jako łamana — ostatni punkt wraca do pierwszego. */
function zamknietyObrys(r: RoomShape): Point[] {
  return r.points.length > 0 ? [...r.points, r.points[0]] : [];
}

/** Środek ciężkości obrysu — punkt odniesienia dla „która strona jest wnętrzem". */
function srodek(points: Point[]): Point {
  const n = points.length || 1;
  return {
    x: points.reduce((s, p) => s + p.x, 0) / n,
    y: points.reduce((s, p) => s + p.y, 0) / n,
  };
}

/**
 * Obrót, przy którym trzonek symbolu patrzy w stronę `kierunek`.
 *
 * Przy obrocie 0 trzonek wskazuje w górę, czyli wektor (0, −1) — patrz `SocketArcKonva`.
 * Obrót o θ (zgodnie z ruchem wskazówek zegara, bo oś Y rośnie w dół) przenosi go na
 * (sin θ, −cos θ), stąd θ = atan2(dx, −dy).
 */
function obrotDlaKierunku(dx: number, dy: number): number {
  return (Math.atan2(dx, -dy) * 180) / Math.PI;
}


/**
 * Przykleja punkt do najbliższej ściany albo krawędzi pomieszczenia i zwraca obrót
 * prostopadły do niej. `null`, gdy nic nie ma w zasięgu — wtedy element zostaje tam,
 * gdzie go postawiono.
 *
 * Krawędzie pomieszczeń liczą się na równi ze ścianami, bo plan narysowany samymi
 * obrysami pokoi jest w tej aplikacji pełnoprawny (patrz `onRoomEdgeClickForOpening`) —
 * bez tego przyciąganie nie działałoby na połowie projektów.
 */
export function snapToWall(
  p: Point,
  walls: Wall[],
  roomShapes: RoomShape[],
  toleranceUnits: number
): WynikPrzyciagania | null {
  let najlepszy: { point: Point; angle: number; dist: number; pokoj: RoomShape | null } | null = null;

  const rozwaz = (linia: Point[], pokoj: RoomShape | null) => {
    const n = nearestPointOnPolyline(p, linia);
    if (!n) return;
    const dist = Math.hypot(p.x - n.point.x, p.y - n.point.y);
    if (dist <= toleranceUnits && (!najlepszy || dist < najlepszy.dist)) {
      najlepszy = { point: n.point, angle: n.angle, dist, pokoj };
    }
  };

  for (const w of walls) rozwaz(w.points, null);
  for (const r of roomShapes) rozwaz(zamknietyObrys(r), r);
  if (!najlepszy) return null;
  const trafienie: { point: Point; angle: number; dist: number; pokoj: RoomShape | null } = najlepszy;

  /**
   * Dwie NORMALNE do ściany — kandydaci na kierunek trzonka. Liczone jako wektory,
   * nie jako kąty: wybór między nimi sprowadza się wtedy do iloczynu skalarnego
   * i znika cała arytmetyka zawijania kątów, w której łatwo o błąd znaku.
   */
  const kierunek = { x: Math.cos(trafienie.angle), y: Math.sin(trafienie.angle) };
  const n1 = { x: -kierunek.y, y: kierunek.x };
  const n2 = { x: kierunek.y, y: -kierunek.x };

  /**
   * Wybór strony: trzonek ma być odwrócony od WNĘTRZA pomieszczenia.
   *
   * Pomieszczenie ustalamy w dwóch krokach i drugi z nich jest tu kluczowy. Sam
   * `pointInPolygon` nie wystarcza, bo celując w ścianę bardzo łatwo przestrzelić
   * o kilka jednostek NA ZEWNĄTRZ obrysu — a wtedy punkt nie leży w żadnym pokoju
   * i trzonek szedł w stronę wybraną na chybił trafił, czyli w połowie przypadków
   * w głąb pomieszczenia. Wyłapane dopiero przy klikaniu w aplikacji, bo w testach
   * jednostkowych trafia się w „równe" współrzędne.
   *
   * Gdy więc punkt nie leży w żadnym obrysie, bierzemy pomieszczenie, do którego
   * należy DOPASOWANA KRAWĘDŹ — to ono jest wnętrzem, od którego trzonek ma uciekać.
   * Zostaje jeszcze przypadek ściany bez pomieszczenia (plan rysowany samymi
   * ścianami): tam nie ma żadnego „wnętrza" i zostaje pierwsza normalna — symbol
   * nadal jest prostopadły, czyli i tak bliżej prawdy niż domyślne 0°.
   */
  const pokoj = roomShapes.find((r) => pointInPolygon(p, r.points)) ?? trafienie.pokoj;
  let wybrana = n1;
  if (pokoj) {
    const c = srodek(pokoj.points);
    const naZewnatrz = { x: trafienie.point.x - c.x, y: trafienie.point.y - c.y };
    const dot = (n: Point) => n.x * naZewnatrz.x + n.y * naZewnatrz.y;
    wybrana = dot(n1) >= dot(n2) ? n1 : n2;
  }

  const rotation = obrotDlaKierunku(wybrana.x, wybrana.y);
  return { x: trafienie.point.x, y: trafienie.point.y, rotation: ((rotation % 360) + 360) % 360 };
}
