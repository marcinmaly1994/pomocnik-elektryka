import type { Point, RoomShape } from "@/types";
import { nearestPointOnPolyline } from "@/lib/geometry";
import { MANUAL_DRAW_SCALE_MPU } from "@/lib/design";

/**
 * Przyciąganie rysowanego pomieszczenia do pomieszczeń już narysowanych.
 *
 * Pokoje w domu stykają się ścianami, a bez przyciągania trafienie w tę samą linię
 * wymagało celowania z dokładnością do jednostki planu. Efekt: albo szczelina między
 * pokojami, albo zachodzenie ich na siebie — a jedno i drugie psuje potem powierzchnie
 * w zestawieniu i przypisanie osprzętu do pomieszczeń (`detectRoomName`).
 *
 * Siatka (`GRID`) tego nie załatwia: pomieszczenie może mieć bok o dowolnej długości,
 * więc jego krawędź nie musi leżeć na linii siatki, i wtedy sąsiad przyciągnięty do
 * siatki mija się z nią o kilka jednostek.
 */

/**
 * Zasięgi przyciągania podane w METRACH, nie w jednostkach planu.
 *
 * Bo to jest stwierdzenie o budynku, a nie o precyzji myszy: „kliknąłeś pół metra od
 * ściany, więc chodziło ci o tę ścianę". W jednostkach planu ten sam próg znaczyłby co
 * innego na rysunku odręcznym (1 jedn. = 5 cm) niż na skalibrowanym podkładzie
 * (1 jedn. = 1 cm) — na tym drugim przyciąganie działałoby pięć razy ciaśniej, choć
 * ręka użytkownika drży tak samo.
 *
 * NAROŻNIK ma zasięg większy niż krawędź: to punkt widoczny na rysunku i celuje się
 * w niego świadomie. Krawędź ciągnie się przez całą długość ściany, więc przy szerokim
 * progu odbierałaby punkty stawiane obok celowo — np. wąski przedpokój wzdłuż pokoju.
 */
export const PROMIEN_NAROZNIKA_M = 0.6;
export const PROMIEN_KRAWEDZI_M = 0.4;

/** Te same zasięgi w jednostkach planu. Bez kalibracji obowiązuje skala rysunku
 *  odręcznego — ta sama zasada co przy grubości obrysu (`gruboscObrysuPokoju`). */
export function promienieDoPokoi(metersPerUnit: number | null): { naroznik: number; krawedz: number } {
  const mpu = metersPerUnit !== null && metersPerUnit > 0 ? metersPerUnit : MANUAL_DRAW_SCALE_MPU;
  return { naroznik: PROMIEN_NAROZNIKA_M / mpu, krawedz: PROMIEN_KRAWEDZI_M / mpu };
}

/** Zamknięty obrys jako łamana — ostatni punkt wraca do pierwszego. */
function zamkniety(r: RoomShape): Point[] {
  return r.points.length > 0 ? [...r.points, r.points[0]] : [];
}

export interface PrzyciagniecieDoPokoju {
  point: Point;
  /** Co złapało — narożnik sąsiada czy punkt na jego krawędzi. */
  rodzaj: "naroznik" | "krawedz";
  /** Pomieszczenie, do którego przyciągnęliśmy. */
  roomId: string;
}

/**
 * Najbliższy punkt zaczepienia w istniejących pomieszczeniach albo `null`, gdy nic nie
 * jest w zasięgu.
 *
 * NAROŻNIKI mają pierwszeństwo przed krawędziami, i to bezwarunkowe: narożnik leżący
 * dalej (ale w swoim promieniu) wygrywa z bliższym punktem na krawędzi. Inaczej przy
 * dociąganiu nowego pokoju do rogu sąsiada punkt lądowałby na krawędzi tuż obok rogu —
 * czyli o włos od tego, o co chodziło, i z zostawioną szczeliną.
 */
export function snapDoPokoi(
  p: Point,
  roomShapes: RoomShape[],
  promienNaroznika: number,
  promienKrawedzi: number
): PrzyciagniecieDoPokoju | null {
  let naroznik: { trafienie: PrzyciagniecieDoPokoju; dist: number } | null = null;
  let krawedz: { trafienie: PrzyciagniecieDoPokoju; dist: number } | null = null;

  for (const r of roomShapes) {
    for (const v of r.points) {
      const dist = Math.hypot(p.x - v.x, p.y - v.y);
      if (dist <= promienNaroznika && (!naroznik || dist < naroznik.dist)) {
        naroznik = { trafienie: { point: { x: v.x, y: v.y }, rodzaj: "naroznik", roomId: r.id }, dist };
      }
    }
    const n = nearestPointOnPolyline(p, zamkniety(r));
    if (!n) continue;
    const dist = Math.hypot(p.x - n.point.x, p.y - n.point.y);
    if (dist <= promienKrawedzi && (!krawedz || dist < krawedz.dist)) {
      krawedz = { trafienie: { point: n.point, rodzaj: "krawedz", roomId: r.id }, dist };
    }
  }

  return (naroznik ?? krawedz)?.trafienie ?? null;
}
