import type { Point, RoomShape, Wall } from "@/types";
import { nearestPointOnPolyline } from "@/lib/geometry";
import { MANUAL_DRAW_SCALE_MPU } from "@/lib/design";

/**
 * Przyciąganie RYSOWANEGO punktu do geometrii, która już jest na rzucie — obrysów
 * pomieszczeń i ścian.
 *
 * Pokoje i ściany w domu stykają się ze sobą, a bez przyciągania trafienie w tę samą
 * linię wymagało celowania z dokładnością do jednostki planu. Efekt: albo szczelina,
 * albo zachodzenie na siebie — a jedno i drugie psuje potem powierzchnie w zestawieniu
 * i przypisanie osprzętu do pomieszczeń (`detectRoomName`).
 *
 * Siatka (`GRID`) tego nie załatwia: bok pomieszczenia może mieć dowolną długość, więc
 * jego krawędź wcale nie musi leżeć na linii siatki, i wtedy sąsiad przyciągnięty do
 * siatki mija się z nią o kilka jednostek. Na wgranym podkładzie jest jeszcze gorzej —
 * siatkę się tam gasi, bo ściany na zdjęciu nie leżą na jej oczkach.
 *
 * HISTORIA: moduł nazywał się `roomSnap` i znał WYŁĄCZNIE pomieszczenia. Ściany były
 * więc jedyną figurą bez przyciągania do czegokolwiek poza siatką: dorysowanie ścianki
 * działowej do już postawionej ściany wymagało trafienia co do piksela, a pomieszczenie
 * rysowane wewnątrz gotowego obrysu ścian nie łapało go wcale. Argument z akapitu wyżej
 * stosuje się do ścian tak samo jak do pokoi, więc cele przyciągania to teraz JEDNO
 * i DRUGIE, a korzystają z tego oba narzędzia rysujące.
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
export function promieniePrzyciagania(metersPerUnit: number | null): { naroznik: number; krawedz: number } {
  const mpu = metersPerUnit !== null && metersPerUnit > 0 ? metersPerUnit : MANUAL_DRAW_SCALE_MPU;
  return { naroznik: PROMIEN_NAROZNIKA_M / mpu, krawedz: PROMIEN_KRAWEDZI_M / mpu };
}

/** Zamknięty obrys jako łamana — ostatni punkt wraca do pierwszego. Pomieszczenie
 *  trzyma same wierzchołki, bez powtórzonego domknięcia (inaczej niż ściana, która
 *  domknięcie ma zapisane jawnie — patrz `closeWall` w DesignTab.tsx). */
function zamkniety(points: Point[]): Point[] {
  return points.length > 0 ? [...points, points[0]] : [];
}

/** Skąd wzięliśmy punkt zaczepienia — do podświetlenia na płótnie i do testów. */
export type ZrodloPrzyciagniecia = { kind: "room"; id: string } | { kind: "wall"; id: string };

export interface Przyciagniecie {
  point: Point;
  /** Co złapało — wierzchołek sąsiada czy punkt na jego krawędzi. */
  rodzaj: "naroznik" | "krawedz";
  zrodlo: ZrodloPrzyciagniecia;
}

/** Co bierzemy pod uwagę przy przyciąganiu. Obie listy są opcjonalne, bo narzędzie
 *  potrafi działać na rzucie, na którym jednej z nich jeszcze nie ma. */
export interface CelePrzyciagania {
  roomShapes?: RoomShape[];
  walls?: Wall[];
}

/**
 * Najbliższy punkt zaczepienia w istniejącej geometrii albo `null`, gdy nic nie jest
 * w zasięgu.
 *
 * NAROŻNIKI mają pierwszeństwo przed krawędziami, i to bezwarunkowe: narożnik leżący
 * dalej (ale w swoim promieniu) wygrywa z bliższym punktem na krawędzi. Inaczej przy
 * dociąganiu nowego pokoju do rogu sąsiada punkt lądowałby na krawędzi tuż obok rogu —
 * czyli o włos od tego, o co chodziło, i z zostawioną szczeliną.
 *
 * Pomieszczenia są sprawdzane PRZED ścianami przy równej odległości, bo to one niosą
 * powierzchnię i przypisanie osprzętu; ściana jest rysunkiem muru wokół nich. Przy
 * różnych odległościach decyduje odległość, nie kolejność.
 */
export function snapDoGeometrii(
  p: Point,
  cele: CelePrzyciagania,
  promienNaroznika: number,
  promienKrawedzi: number
): Przyciagniecie | null {
  const trafienia: { trafienie: Przyciagniecie; dist: number }[] = [];

  const rozwaz = (wierzcholki: Point[], lamana: Point[], zrodlo: ZrodloPrzyciagniecia) => {
    for (const v of wierzcholki) {
      const dist = Math.hypot(p.x - v.x, p.y - v.y);
      if (dist <= promienNaroznika) {
        trafienia.push({ trafienie: { point: { x: v.x, y: v.y }, rodzaj: "naroznik", zrodlo }, dist });
      }
    }
    const n = nearestPointOnPolyline(p, lamana);
    if (!n) return;
    const dist = Math.hypot(p.x - n.point.x, p.y - n.point.y);
    if (dist <= promienKrawedzi) {
      trafienia.push({ trafienie: { point: n.point, rodzaj: "krawedz", zrodlo }, dist });
    }
  };

  for (const r of cele.roomShapes ?? []) rozwaz(r.points, zamkniety(r.points), { kind: "room", id: r.id });
  // Ściana jest ŁAMANĄ, nie wielokątem: zamknięcie (jeśli jest) siedzi już w jej
  // punktach jako powtórzony pierwszy wierzchołek, więc domykanie jej tutaj po raz
  // drugi dołożyłoby zerowej długości odcinek.
  for (const w of cele.walls ?? []) rozwaz(w.points, w.points, { kind: "wall", id: w.id });

  const najblizszy = (rodzaj: Przyciagniecie["rodzaj"]) =>
    trafienia
      .filter((t) => t.trafienie.rodzaj === rodzaj)
      .reduce<(typeof trafienia)[number] | null>((best, t) => (!best || t.dist < best.dist ? t : best), null);

  return (najblizszy("naroznik") ?? najblizszy("krawedz"))?.trafienie ?? null;
}

/**
 * Zasięg wyrównywania do osi [m] — CIAŚNIEJSZY niż przyciąganie do narożnika.
 *
 * Narożnik to jeden punkt i celuje się w niego świadomie, więc może mieć szeroki próg.
 * Oś ciągnie się przez cały rysunek, więc szeroki próg robiłby kursor lepkim wszędzie:
 * przy kilkunastu narożnikach na rzucie prawie każde miejsce leżałoby w zasięgu
 * którejś osi i punkt przestawałby siadać tam, gdzie się klika.
 */
export const PROMIEN_OSI_M = 0.2;

/** Ten sam zasięg w jednostkach planu — patrz `promieniePrzyciagania`. */
export function promienOsi(metersPerUnit: number | null): number {
  const mpu = metersPerUnit !== null && metersPerUnit > 0 ? metersPerUnit : MANUAL_DRAW_SCALE_MPU;
  return PROMIEN_OSI_M / mpu;
}

export interface WyrownanieDoOsi {
  punkt: Point;
  /** Punkt, z którego wzięliśmy pion (`osX`) i poziom (`osY`). `null` = oś nie złapała. */
  osX: Point | null;
  osY: Point | null;
}

/**
 * Wyrównuje punkt do PIONU albo POZIOMU punktów, które już są na rysunku.
 *
 * Przyciąganie do geometrii (`snapDoGeometrii`) łapie dopiero wtedy, gdy trafi się
 * prawie w sam narożnik sąsiada. Rysując drugą albo trzecią ścianę pokoju człowiek
 * celuje gdzie indziej: chce, żeby wierzchołek stanął W LINII z poprzednim albo
 * z krawędzią pokoju obok. Bez tego wychodzi ukos o kilka centymetrów — na oko
 * niewidoczny, a zostaje w obrysie i w metrażu.
 *
 * Osie liczą się OSOBNO dla x i y, i to jest tu istotne: punkt bywa w pionie z jednym
 * narożnikiem, a w poziomie z zupełnie innym. Tak właśnie wygląda dostawianie pokoju
 * do rogu sąsiada — pion bierze z jego ściany, poziom z własnego poprzedniego punktu.
 *
 * Zwraca też PUNKTY ODNIESIENIA, nie tylko wynik: wołający może chcieć pokazać, skąd
 * wzięło się wyrównanie, a bez tego musiałby zgadywać po współrzędnych.
 *
 * Kandydat, na którym już SIEDZIMY (obie osie w tolerancji), jest pomijany. Wyrównanie
 * mówi „stoisz w jednej linii z czymś ODDALONYM"; przy punkcie tuż pod kursorem obie osie
 * złapałyby naraz i wynik byłby jego dokładną kopią — czyli odcinek zerowej długości
 * w rysowanej figurze. Trafienie w konkretny punkt to zadanie przyciągania do geometrii
 * (`snapDoGeometrii`) albo domknięcia figury, i to one mają o tym decydować.
 */
export function wyrownajDoOsi(p: Point, kandydaci: Point[], tolerancja: number): WyrownanieDoOsi {
  const oddalone = kandydaci.filter(
    (k) => Math.abs(p.x - k.x) > tolerancja || Math.abs(p.y - k.y) > tolerancja
  );
  const najblizszy = (wspolrzedna: "x" | "y") =>
    oddalone.reduce<{ punkt: Point; odleglosc: number } | null>((best, k) => {
      const odleglosc = Math.abs(p[wspolrzedna] - k[wspolrzedna]);
      if (odleglosc > tolerancja) return best;
      return !best || odleglosc < best.odleglosc ? { punkt: k, odleglosc } : best;
    }, null);

  const osX = najblizszy("x");
  const osY = najblizszy("y");
  return {
    punkt: { x: osX ? osX.punkt.x : p.x, y: osY ? osY.punkt.y : p.y },
    osX: osX?.punkt ?? null,
    osY: osY?.punkt ?? null,
  };
}
