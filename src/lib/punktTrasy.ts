import type { Point } from "@/types";

/**
 * Operacje na łamanej trasy przewodu — wspólne dla płótna (gdzie pada gest) i zakładki
 * (gdzie stoi menu i okno informacji), żeby „odcinek pod kursorem" znaczył w obu
 * miejscach to samo.
 */

/** Indeks odcinka [i, i+1] łamanej `points` najbliższego punktowi `p` — do wstawienia
 *  nowego załamania trasy dokładnie tam, gdzie wskazał użytkownik, zamiast zawsze na
 *  końcu, i do pokazania długości TEGO odcinka. `nearestPointOnPolyline` w geometry.ts
 *  liczy to samo, ale nie zwraca indeksu, którego tu akurat potrzeba. */
export function nearestRouteSegmentIndex(p: Point, points: Point[]): number {
  let bestIdx = 0;
  let bestDistSq = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) continue;
    const t = Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
    const distSq = (p.x - (a.x + t * dx)) ** 2 + (p.y - (a.y + t * dy)) ** 2;
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      bestIdx = i;
    }
  }
  return bestIdx;
}

/**
 * Załamania trasy (BEZ pierwszego i ostatniego punktu — te są przypięte do elementów)
 * po wstawieniu `p` w najbliższy mu odcinek. Dokładnie ten kształt przyjmuje ręczna
 * poprawka trasy (`routeOverrides`).
 */
export function zalamaniaZNowymPunktem(points: Point[], p: Point): Point[] {
  const i = nearestRouteSegmentIndex(p, points);
  return [...points.slice(0, i + 1), p, ...points.slice(i + 1)].slice(1, -1);
}

/** Długość odcinka [i, i+1] w jednostkach planu. */
export function dlugoscOdcinka(points: Point[], i: number): number {
  const a = points[i];
  const b = points[i + 1];
  return a && b ? Math.hypot(b.x - a.x, b.y - a.y) : 0;
}
