/**
 * Routing przewodów WZDŁUŻ narysowanej geometrii (ścian i obrysów pomieszczeń),
 * zamiast linii prostej/Manhattan — krok 2 w stronę realistycznych tras (krok 1,
 * poglądowa łamana Manhattan, mieszka w `loads.ts`/`buildCableRoutes`).
 *
 * Elektryk kładzie przewód „w ścianie" (patrz `sposob_ulozenia: "w_scianie"` w
 * sizing.ts — to już jest domyślne założenie doboru), więc ściany i obrysy
 * pomieszczeń są dokładnie tym, po czym przewód faktycznie biegnie. Ten moduł
 * buduje z nich GRAF (węzły = narożniki, krawędzie = odcinki ścian/obrysów) i szuka
 * najkrótszej ścieżki po nim — od rozdzielnicy do punktu, z „doskokiem" na końcach
 * (rozdzielnica/punkt rzadko stoją idealnie NA ścianie, więc dochodzą krótkim
 * odcinkiem do najbliższego miejsca na najbliższej ścianie/obrysie).
 *
 * Zwraca `null`, gdy nie da się wyznaczyć trasy (brak ścian/pomieszczeń w ogóle,
 * albo rozdzielnica i punkt siedzą w dwóch niepołączonych ze sobą kawałkach
 * geometrii) — to jest właściwe zachowanie: wywołujący (`buildCableRoutes`) ma
 * wtedy spaść na prostszy szacunek Manhattan, a nie zmyślać trasę donikąd.
 */

import type { Point, RoomShape, Wall } from "@/types";
import { clampNum } from "@/lib/geometry";

/** Punkty bliższe niż to (jedn. planu) traktujemy jako TEN SAM narożnik — inaczej
 *  dwie ściany narysowane osobno, których końce nie trafiły w idealnie ten sam
 *  piksel, tworzyłyby dwa osobne, niepołączone węzły w miejscu, które wizualnie
 *  jest jednym rogiem pokoju. */
const MERGE_TOLERANCE = 10;

/**
 * O ile jednostek planu trasa biegnie OBOK ściany, a nie po niej.
 *
 * Dotąd graf routingu leżał dokładnie na obrysach, więc przewód dzielił oś ze ścianą
 * i ginął pod jej grubym pociągnięciem — na rysunku nie było widać, którędy właściwie
 * idzie, a dwie trasy wzdłuż tej samej ściany zlewały się w jedno. Odsunięcie do
 * wnętrza pomieszczenia robi z nich osobne linie, które da się przeczytać.
 *
 * Wartość jest w JEDNOSTKACH PLANU, nie w metrach, i to jest świadome: to konwencja
 * RYSUNKOWA (ma być widać), a nie wymiar instalacji — przewód i tak biegnie w ścianie
 * albo tuż przy niej.
 *
 * Sześć jednostek to przy typowej skali 30 cm na rzucie: wyraźnie obok obrysu (ten
 * ma ok. 1,6 jedn. grubości), a nadal czytelnie „wzdłuż tej ściany", a nie w poprzek
 * pokoju. Trasa biegnie przez to mniej więcej na wysokości przyklejonych gniazd
 * (ich środek wypada o jedną jednostkę dalej) — i tak ma być: to 
 * odpowiada za to, żeby linia kończyła się PRZED symbolem, zamiast go przecinać.
 */
export const ODSUNIECIE_TRASY = 6;

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function cross(o: Point, a: Point, b: Point): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/** Przecięcie WŁAŚCIWE (wnętrze obu odcinków, nie samo dotknięcie końca/narożnika) —
 *  „doskok" trasy MA prawo dotknąć ściany, do której akurat dochodzi, ale nie ma
 *  prawa przeciąć PO DRODZE innej. Ścisła nierówność (`> 0`/`< 0`, nie `>= 0`) celowo
 *  wyklucza styczne/współliniowe przypadki — inaczej każdy doskok kończący się
 *  dokładnie NA innej ścianie (częste przy narożnikach) fałszywie liczyłby się jako
 *  kolizja. */
function segmentsIntersect(p1: Point, p2: Point, p3: Point, p4: Point): boolean {
  const d1 = cross(p3, p4, p1);
  const d2 = cross(p3, p4, p2);
  const d3 = cross(p1, p2, p3);
  const d4 = cross(p1, p2, p4);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

interface Segment {
  aIdx: number;
  bIdx: number;
  a: Point;
  b: Point;
}

interface Graph {
  nodes: Point[];
  adj: Map<number, Map<number, number>>;
  segments: Segment[];
}

/** Zwraca indeks istniejącego węzła w promieniu `MERGE_TOLERANCE` albo dokłada nowy. */
function nodeIndex(graph: Graph, p: Point): number {
  for (let i = 0; i < graph.nodes.length; i++) {
    if (dist(graph.nodes[i], p) <= MERGE_TOLERANCE) return i;
  }
  graph.nodes.push(p);
  graph.adj.set(graph.nodes.length - 1, new Map());
  return graph.nodes.length - 1;
}

/** Krawędź o WADZE = odległości euklidesowej; przy powtórnym dodaniu (dwie ściany
 *  nachodzące na ten sam odcinek) zostaje krótsza z dwóch zaproponowanych wag. */
function addEdge(graph: Graph, a: number, b: number, w: number) {
  if (a === b) return;
  const da = graph.adj.get(a)!;
  const db = graph.adj.get(b)!;
  if (!da.has(b) || da.get(b)! > w) da.set(b, w);
  if (!db.has(a) || db.get(a)! > w) db.set(a, w);
}

/** Dokłada do grafu jedną łamaną (ścianę — otwartą, albo obrys pomieszczenia —
 *  zamknięty domykającym odcinkiem ostatni→pierwszy punkt). */
function addPolyline(graph: Graph, points: Point[], closed: boolean) {
  if (points.length < 2) return;
  const idxs = points.map((p) => nodeIndex(graph, p));
  for (let i = 0; i < idxs.length - 1; i++) {
    graph.segments.push({ aIdx: idxs[i], bIdx: idxs[i + 1], a: points[i], b: points[i + 1] });
    addEdge(graph, idxs[i], idxs[i + 1], dist(points[i], points[i + 1]));
  }
  if (closed) {
    const last = idxs.length - 1;
    graph.segments.push({ aIdx: idxs[last], bIdx: idxs[0], a: points[last], b: points[0] });
    addEdge(graph, idxs[last], idxs[0], dist(points[last], points[0]));
  }
}

/** Czy punkt leży wewnątrz wieloboku — zwykłe puszczanie promienia w prawo. */
function wWieloboku(p: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Punkt przecięcia dwóch prostych zadanych punktem i kierunkiem. `null`, gdy są
 *  (prawie) równoległe — wtedy nie ma sensownego narożnika do wyliczenia. */
function przeciecieProstych(p1: Point, d1: Point, p2: Point, d2: Point): Point | null {
  const det = d1.x * d2.y - d1.y * d2.x;
  if (Math.abs(det) < 1e-9) return null;
  const t = ((p2.x - p1.x) * d2.y - (p2.y - p1.y) * d2.x) / det;
  return { x: p1.x + t * d1.x, y: p1.y + t * d1.y };
}

/**
 * Wielobok wsunięty do WNĘTRZA o `d` jednostek — po nim, a nie po samym obrysie,
 * biegnie trasa przewodu (patrz `ODSUNIECIE_TRASY`).
 *
 * Każda krawędź przesuwa się o `d` wzdłuż swojej normalnej, a nowe narożniki to
 * przecięcia sąsiednich, przesuniętych prostych — dzięki temu odstęp od ściany jest
 * równy na całej długości, także w rogach. Przesuwanie samych wierzchołków „ku
 * środkowi" byłoby prostsze, ale w wydłużonym pokoju dawałoby przy krótszych
 * ścianach zupełnie inny odstęp niż przy dłuższych.
 *
 * Kierunek „do wnętrza" ustalamy DOŚWIADCZALNIE — przesuwamy środek pierwszej
 * krawędzi w jedną stronę i sprawdzamy, czy wylądował w wieloboku. To pewniejsze niż
 * wnioskowanie ze znaku pola: przy odwróconej osi Y (a taka jest na płótnie)
 * konwencje orientacji łatwo pomylić, a błąd oznaczałby trasy biegnące NA ZEWNĄTRZ
 * pomieszczenia.
 *
 * Zwraca WEJŚCIE BEZ ZMIAN, gdy wsunięcie nie ma sensu: za mało punktów, wielobok
 * ciaśniejszy niż samo wsunięcie (mały schowek), albo gdy wynik wywraca się na
 * drugą stronę. Lepiej narysować trasę po obrysie niż w poprzek pokoju.
 */
export function wsunObrys(points: Point[], d: number): Point[] {
  if (points.length < 3 || d <= 0) return points;

  const kierunki = points.map((a, i) => {
    const b = points[(i + 1) % points.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    return len < 1e-9 ? null : { dx: dx / len, dy: dy / len };
  });
  if (kierunki.some((k) => k === null)) return points;

  const pierwszy = kierunki[0]!;
  const srodek = { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 };
  const proba = { x: srodek.x + pierwszy.dy * d, y: srodek.y - pierwszy.dx * d };
  const znak = wWieloboku(proba, points) ? 1 : -1;
  const normalna = (k: { dx: number; dy: number }) => ({ x: k.dy * znak, y: -k.dx * znak });

  const wsuniete: Point[] = [];
  for (let i = 0; i < points.length; i++) {
    const poprzednia = (i - 1 + points.length) % points.length;
    const nPrev = normalna(kierunki[poprzednia]!);
    const nCur = normalna(kierunki[i]!);
    const aPrev = { x: points[poprzednia].x + nPrev.x * d, y: points[poprzednia].y + nPrev.y * d };
    const aCur = { x: points[i].x + nCur.x * d, y: points[i].y + nCur.y * d };
    const róg =
      przeciecieProstych(aPrev, { x: kierunki[poprzednia]!.dx, y: kierunki[poprzednia]!.dy }, aCur, {
        x: kierunki[i]!.dx,
        y: kierunki[i]!.dy,
      }) ?? aCur;
    // Narożnik odjeżdżający wielokrotnie dalej niż samo wsunięcie znaczy, że
    // wielobok zaczyna się wywracać (ostry kąt, ściana krótsza niż odstęp).
    if (dist(róg, points[i]) > d * 4) return points;
    wsuniete.push(róg);
  }
  // Ostatnia kontrola: środek pierwszej wsuniętej krawędzi ma nadal leżeć w środku.
  const kontrola = { x: (wsuniete[0].x + wsuniete[1].x) / 2, y: (wsuniete[0].y + wsuniete[1].y) / 2 };
  return wWieloboku(kontrola, points) ? wsuniete : points;
}

/** Czy łamana jest zamknięta (ostatni punkt wraca na pierwszy) — tylko taka ma
 *  „wnętrze", więc tylko taką da się wsunąć. */
function zamknieta(points: Point[]): boolean {
  return points.length > 3 && dist(points[0], points[points.length - 1]) < 0.01;
}

/**
 * `wsuniecie` > 0 buduje graf na obrysach ODSUNIĘTYCH do wnętrza — używa tego
 * `routeAlongWalls`, żeby przewód nie leżał na osi ściany. `crossesGeometry` woła
 * z zerem, bo tam chodzi o PRAWDZIWE położenie ścian: kolizję trzeba sprawdzać
 * z tym, co stoi na planie, a nie z linią pomocniczą odsuniętą o kilka jednostek.
 */
function buildGraph(walls: Wall[], roomShapes: RoomShape[], wsuniecie = 0): Graph {
  const graph: Graph = { nodes: [], adj: new Map(), segments: [] };
  walls.forEach((w) => {
    // Ściana OTWARTA nie ma wnętrza, więc nie ma jej dokąd wsunąć — zostaje jak jest.
    const ring = zamknieta(w.points);
    const pts = wsuniecie > 0 && ring ? wsunObrys(w.points.slice(0, -1), wsuniecie) : w.points;
    addPolyline(graph, pts, wsuniecie > 0 && ring);
  });
  roomShapes.forEach((r) => addPolyline(graph, wsuniecie > 0 ? wsunObrys(r.points, wsuniecie) : r.points, true));
  return graph;
}

/** Rzut punktu `p` na ODCINEK [a,b], przycięty do samego odcinka (nie do prostej
 *  nieskończonej) — ten sam wzór co `nearestPointOnPolyline` w geometry.ts, tu
 *  osobno, bo tam wynik nie niesie ze sobą, KTÓRY to był odcinek. */
function projectOntoSegment(p: Point, a: Point, b: Point): { point: Point; distSq: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return { point: a, distSq: (p.x - a.x) ** 2 + (p.y - a.y) ** 2 };
  const t = clampNum(((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq, 0, 1);
  const point = { x: a.x + t * dx, y: a.y + t * dy };
  return { point, distSq: (p.x - point.x) ** 2 + (p.y - point.y) ** 2 };
}

/**
 * „Doskakuje" punktem `p` (rozdzielnica albo odbiornik) do najbliższego miejsca na
 * najbliższym odcinku sieci — wstawia tam NOWY węzeł (albo reużywa istniejący, gdy
 * projekcja trafiła w promień `MERGE_TOLERANCE` od narożnika) i łączy go z obydwoma
 * końcami tego odcinka, żeby Dijkstra mógł stamtąd ruszyć w obie strony wzdłuż ściany.
 * Zwraca `null`, gdy w grafie nie ma żadnego odcinka (brak ścian/pomieszczeń).
 */
function connectPoint(graph: Graph, p: Point): number | null {
  if (graph.segments.length === 0) return null;
  const candidates = graph.segments
    .map((seg) => ({ seg, ...projectOntoSegment(p, seg.a, seg.b) }))
    .sort((a, b) => a.distSq - b.distSq);
  // Wolimy najbliższy odcinek, do którego da się dojść PROSTO, nie przecinając po
  // drodze innej ściany/obrysu — inaczej „doskok" (odcinek od punktu do sieci)
  // potrafił przeciąć ścianę stojącą MIĘDZY punktem a odcinkiem, na który akurat
  // trafił jako najbliższy w linii prostej (patrz zgłoszenie: przewody „przechodzą
  // przez ściany"). Gdy żaden kandydat nie jest wolny od kolizji (np. punkt w
  // zamkniętym, w pełni otoczonym przez inne ściany pomieszczeniu), wracamy do
  // dotychczasowego zachowania — najbliższy mimo wszystko, żeby routing nie
  // spadał bez potrzeby na zapasowy szacunek Manhattan.
  const clear = candidates.find(
    (c) => !graph.segments.some((other) => other !== c.seg && segmentsIntersect(p, c.point, other.a, other.b))
  );
  const best = clear ?? candidates[0];
  const entry = nodeIndex(graph, best.point);
  addEdge(graph, entry, best.seg.aIdx, dist(graph.nodes[entry], best.seg.a));
  addEdge(graph, entry, best.seg.bIdx, dist(graph.nodes[entry], best.seg.b));
  return entry;
}

/** Dijkstra bez kopca — grafy tras są rzędu dziesiątek/setek węzłów (narożniki
 *  ścian i pomieszczeń jednej kondygnacji), więc O(V²) jest tu tańsze do napisania
 *  i utrzymania niż kopiec, a różnicy w czasie działania nikt nie zauważy. */
function dijkstra(graph: Graph, start: number, end: number): number[] | null {
  const dist_ = new Array<number>(graph.nodes.length).fill(Infinity);
  const prev = new Array<number | null>(graph.nodes.length).fill(null);
  const visited = new Array<boolean>(graph.nodes.length).fill(false);
  dist_[start] = 0;

  for (let iter = 0; iter < graph.nodes.length; iter++) {
    let u = -1;
    let best = Infinity;
    for (let i = 0; i < graph.nodes.length; i++) {
      if (!visited[i] && dist_[i] < best) {
        best = dist_[i];
        u = i;
      }
    }
    if (u === -1 || u === end) break;
    visited[u] = true;
    for (const [v, w] of graph.adj.get(u) ?? []) {
      if (visited[v]) continue;
      const nd = dist_[u] + w;
      if (nd < dist_[v]) {
        dist_[v] = nd;
        prev[v] = u;
      }
    }
  }

  if (dist_[end] === Infinity) return null;
  const path: number[] = [];
  let cur: number | null = end;
  while (cur !== null) {
    path.unshift(cur);
    cur = prev[cur];
  }
  return path;
}

/** Usuwa kolejne po sobie punkty leżące praktycznie w tym samym miejscu — powstają
 *  na złączeniach (np. gdy `from` sam jest bardzo blisko punktu doskoku). */
function dedupeConsecutive(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || dist(last, p) > 0.01) out.push(p);
  }
  return out;
}

/**
 * Trasa od `from` do `to` WZDŁUŻ ścian i obrysów pomieszczeń danej kondygnacji.
 * `null`, gdy nie ma żadnej geometrii do routingu albo `from`/`to` wypadają w dwóch
 * częściach planu, między którymi sieć ścian/pomieszczeń nie łączy się — wtedy
 * wywołujący ma spaść na prostszy szacunek (patrz `buildCableRoutes` w loads.ts).
 */
/** Czy odcinek `a`-`b` przecina KTÓRĄKOLWIEK ścianę/obrys pomieszczenia — używane
 *  przez zapasowy szacunek Manhattan w loads.ts, który (w odróżnieniu od
 *  `routeAlongWalls`) nie ma żadnej wiedzy o geometrii i bez tej sprawdzki rysował
 *  linię na wprost przez wszystko, co stanęło na drodze. */
export function crossesGeometry(a: Point, b: Point, walls: Wall[], roomShapes: RoomShape[]): boolean {
  const graph = buildGraph(walls, roomShapes);
  return graph.segments.some((seg) => segmentsIntersect(a, b, seg.a, seg.b));
}

export function routeAlongWalls(from: Point, to: Point, walls: Wall[], roomShapes: RoomShape[]): Point[] | null {
  // Graf na obrysach WSUNIĘTYCH do wnętrza — patrz `ODSUNIECIE_TRASY`. Trasa biegnie
  // wtedy obok ściany, a nie po jej osi, i widać ją na rysunku jako osobną linię.
  const graph = buildGraph(walls, roomShapes, ODSUNIECIE_TRASY);
  const start = connectPoint(graph, from);
  const end = connectPoint(graph, to);
  if (start === null || end === null) return null;

  const path = dijkstra(graph, start, end);
  if (!path) return null;

  return dedupeConsecutive([from, ...path.map((i) => graph.nodes[i]), to]);
}
