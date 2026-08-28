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

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
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

function buildGraph(walls: Wall[], roomShapes: RoomShape[]): Graph {
  const graph: Graph = { nodes: [], adj: new Map(), segments: [] };
  walls.forEach((w) => addPolyline(graph, w.points, false));
  roomShapes.forEach((r) => addPolyline(graph, r.points, true));
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
  let best: { seg: Segment; point: Point; distSq: number } | null = null;
  for (const seg of graph.segments) {
    const proj = projectOntoSegment(p, seg.a, seg.b);
    if (!best || proj.distSq < best.distSq) best = { seg, point: proj.point, distSq: proj.distSq };
  }
  const entry = nodeIndex(graph, best!.point);
  addEdge(graph, entry, best!.seg.aIdx, dist(graph.nodes[entry], best!.seg.a));
  addEdge(graph, entry, best!.seg.bIdx, dist(graph.nodes[entry], best!.seg.b));
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
export function routeAlongWalls(from: Point, to: Point, walls: Wall[], roomShapes: RoomShape[]): Point[] | null {
  const graph = buildGraph(walls, roomShapes);
  const start = connectPoint(graph, from);
  const end = connectPoint(graph, to);
  if (start === null || end === null) return null;

  const path = dijkstra(graph, start, end);
  if (!path) return null;

  return dedupeConsecutive([from, ...path.map((i) => graph.nodes[i]), to]);
}
