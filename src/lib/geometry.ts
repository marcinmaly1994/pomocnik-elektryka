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
