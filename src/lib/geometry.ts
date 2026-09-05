import type { Point } from "@/types";

/** Zaokrągla współrzędną do najbliższej linii siatki — przyciąganie przy rysowaniu/przeciąganiu. */
export function snap(v: number, grid = 20): number {
  return Math.round(v / grid) * grid;
}

export function clampNum(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * Pole wielokąta wzorem Gaussa (sznurowadła), w jednostkach planu do kwadratu.
 *
 * Zwraca wartość BEZWZGLĘDNĄ, bo obrys narysowany „w lewo" ma ujemną orientację,
 * a użytkownika nie interesuje kierunek klikania — tylko ile metrów ma pokój.
 */
export function polygonArea(points: Point[]): number {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    sum += points[j].x * points[i].y - points[i].x * points[j].y;
  }
  return Math.abs(sum) / 2;
}

/** Pole w metrach kwadratowych. `metersPerUnit` skaluje się KWADRATOWO — to
 *  najczęstszy błąd przy przeliczaniu powierzchni, więc siedzi w jednym miejscu. */
export function polygonAreaM2(points: Point[], metersPerUnit: number | null): number | null {
  if (metersPerUnit === null || !(metersPerUnit > 0)) return null;
  return polygonArea(points) * metersPerUnit * metersPerUnit;
}

/**
 * Najbliższy punkt na ŁAMANEJ (np. ścianie) do danego punktu, wraz z kierunkiem
 * segmentu w tym miejscu (radiany) — do „przyklejania" otworu (drzwi/okna) do
 * ściany, w którą kliknięto: sam klik rzadko trafia idealnie na linię, więc
 * otwór ma stanąć na NAJBLIŻSZYM miejscu ściany, nie dokładnie pod kursorem.
 */
export function nearestPointOnPolyline(pt: Point, points: Point[]): { point: Point; angle: number } | null {
  let best: { point: Point; angle: number; distSq: number } | null = null;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) continue;
    const t = clampNum(((pt.x - a.x) * dx + (pt.y - a.y) * dy) / lenSq, 0, 1);
    const px = a.x + t * dx;
    const py = a.y + t * dy;
    const distSq = (pt.x - px) ** 2 + (pt.y - py) ** 2;
    if (!best || distSq < best.distSq) best = { point: { x: px, y: py }, angle: Math.atan2(dy, dx), distSq };
  }
  return best ? { point: best.point, angle: best.angle } : null;
}

/** Algorytm ray-casting: czy punkt leży wewnątrz wielokąta (używane do wykrycia,
 *  w którym narysowanym pomieszczeniu wylądował nowo postawiony element). */
export function pointInPolygon(pt: Point, points: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i].x;
    const yi = points[i].y;
    const xj = points[j].x;
    const yj = points[j].y;
    const intersect = yi > pt.y !== yj > pt.y && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Odległość punktu od PROSTOKĄTA obróconego o `rotationDeg` (środek w `cx`/`cy`).
 * `0`, gdy punkt leży wewnątrz prostokąta.
 *
 * Potrzebne do stref ochronnych: norma mierzy je od KRAWĘDZI wanny czy brodzika, a nie
 * od punktu w jej środku (patrz `SANITARY_FIXTURES`). Zbiór punktów w zadanej odległości
 * od prostokąta to prostokąt o zaokrąglonych narożnikach — dlatego strefa 2 rysuje się
 * jako `Rect` z `cornerRadius` równym jej zasięgowi, a nie jako okrąg.
 *
 * Liczone w układzie WŁASNYM prostokąta: obracamy punkt o `-rotationDeg`, dzięki czemu
 * dalej wystarczy porównanie z połową boków.
 */
export function distanceToRect(
  p: Point,
  cx: number,
  cy: number,
  w: number,
  h: number,
  rotationDeg = 0
): number {
  const a = (-rotationDeg * Math.PI) / 180;
  const dx = p.x - cx;
  const dy = p.y - cy;
  const lx = dx * Math.cos(a) - dy * Math.sin(a);
  const ly = dx * Math.sin(a) + dy * Math.cos(a);
  const ox = Math.max(Math.abs(lx) - w / 2, 0);
  const oy = Math.max(Math.abs(ly) - h / 2, 0);
  return Math.hypot(ox, oy);
}

/**
 * Wymiary obrysu [m], jeśli jest PROSTOKĄTEM równoległym do osi — inaczej `null`.
 *
 * Prostokątność sprawdzamy naprawdę (cztery wierzchołki, dwie różne wartości X i dwie
 * Y), a nie po samej liczbie punktów: dla litery L czy wykusza wymiary wzięte z obrysu
 * opisywałyby prostokąt, którego na rysunku nie ma — a podpis, który kłamie, jest
 * gorszy od braku podpisu. Tam zostaje sama powierzchnia, prawdziwa dla każdego
 * kształtu (patrz `polygonAreaM2`).
 *
 * Porównanie po zaokrągleniu do 1/1000 jednostki, bo narożniki bywają wynikiem
 * przeciągania myszą i różnią się o wartości niewidoczne na rysunku.
 */
export function rectangleSizeM(points: Point[], metersPerUnit: number | null): { w: number; h: number } | null {
  if (metersPerUnit === null || !(metersPerUnit > 0) || points.length !== 4) return null;
  const xs = [...new Set(points.map((p) => Math.round(p.x * 1000)))];
  const ys = [...new Set(points.map((p) => Math.round(p.y * 1000)))];
  if (xs.length !== 2 || ys.length !== 2) return null;
  return {
    w: (Math.abs(xs[1] - xs[0]) / 1000) * metersPerUnit,
    h: (Math.abs(ys[1] - ys[0]) / 1000) * metersPerUnit,
  };
}
