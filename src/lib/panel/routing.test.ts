import { describe, expect, it } from "vitest";
import type { Point, RoomShape, Wall } from "@/types";
import { crossesGeometry, routeAlongWalls } from "./routing";

function wall(points: Point[]): Wall {
  return { id: Math.random().toString(36).slice(2), floor: "parter", points };
}

function room(points: Point[]): RoomShape {
  return { id: Math.random().toString(36).slice(2), floor: "parter", name: "Pokój", color: "#000", points };
}

/** Długość łamanej — do porównywania z sumą odcinków oczekiwanej trasy. */
function polylineLength(points: Point[]): number {
  let sum = 0;
  for (let i = 0; i < points.length - 1; i++) sum += Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
  return sum;
}

describe("routeAlongWalls", () => {
  it("bez żadnej ściany ani pomieszczenia zwraca null — nie ma po czym routować", () => {
    expect(routeAlongWalls({ x: 0, y: 0 }, { x: 100, y: 100 }, [], [])).toBeNull();
  });

  it("prosta ściana: trasa doskakuje z obu końców i biegnie wzdłuż niej", () => {
    // ściana pozioma y=0, od x=0 do x=100; punkty stoją nad/pod nią
    const w = wall([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
    const from = { x: 10, y: -20 };
    const to = { x: 90, y: 20 };
    const path = routeAlongWalls(from, to, [w], []);
    expect(path).not.toBeNull();
    expect(path![0]).toEqual(from);
    expect(path![path!.length - 1]).toEqual(to);
    // trasa musi przejść PRZEZ ścianę (punkty pośrednie leżą na y=0)
    const onWall = path!.slice(1, -1);
    expect(onWall.length).toBeGreaterThan(0);
    onWall.forEach((p) => expect(p.y).toBeCloseTo(0, 6));
  });

  it("ściana pod kątem prostym (L): trasa idzie przez narożnik, nie po przekątnej", () => {
    // ściana L: (0,0)->(100,0)->(100,100)
    const w = wall([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]);
    const from = { x: 10, y: -10 }; // blisko początku pierwszego odcinka
    const to = { x: 110, y: 90 }; // blisko końca drugiego odcinka
    const path = routeAlongWalls(from, to, [w], []);
    expect(path).not.toBeNull();
    // trasa MUSI odwiedzić okolice narożnika (100,0) — inaczej szłaby po przekątnej
    const nearCorner = path!.some((p) => Math.hypot(p.x - 100, p.y - 0) < 5);
    expect(nearCorner).toBe(true);
  });

  it("dwie ściany, których końce się stykają (w granicy tolerancji), łączą się w JEDNĄ sieć", () => {
    const w1 = wall([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
    // drugi odcinek zaczyna się 3 jedn. od końca pierwszego — w praktyce ten sam róg,
    // narysowany osobnym gestem, więc nie trafił idealnie w ten sam piksel
    const w2 = wall([{ x: 103, y: 0 }, { x: 103, y: 100 }]);
    const from = { x: 10, y: -10 };
    const to = { x: 110, y: 90 };
    const path = routeAlongWalls(from, to, [w1, w2], []);
    expect(path).not.toBeNull();
  });

  it("dwie ściany DALEKO od siebie NIE łączą się — trasa między nimi to null", () => {
    const w1 = wall([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
    const w2 = wall([{ x: 500, y: 500 }, { x: 600, y: 500 }]);
    const from = { x: 10, y: -10 }; // blisko w1
    const to = { x: 550, y: 520 }; // blisko w2, ale w1/w2 się nie stykają
    expect(routeAlongWalls(from, to, [w1, w2], [])).toBeNull();
  });

  it("obrys pomieszczenia jest ZAMKNIĘTY — domykający odcinek ostatni→pierwszy punkt też jest routowalny", () => {
    // kwadratowy pokój 0,0 – 100,100; from/to blisko przeciwległych boków,
    // najkrótsza trasa może iść przez domykającą krawędź (lewy bok, x=0)
    const r = room([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }]);
    const from = { x: -5, y: 10 };
    const to = { x: -5, y: 90 };
    const path = routeAlongWalls(from, to, [], [r]);
    expect(path).not.toBeNull();
    // trasa wzdłuż lewego boku (x≈0) jest krótsza niż dookoła przez pozostałe 3 boki —
    // Dijkstra ma wybrać właśnie ją
    expect(polylineLength(path!)).toBeLessThan(100 * 1.5);
  });

  it("punkt umieszczony DOKŁADNIE na ścianie nie dokłada zbędnego, zerowego odcinka", () => {
    const w = wall([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
    const from = { x: 50, y: 0 }; // leży dokładnie NA ścianie
    const to = { x: 90, y: 20 };
    const path = routeAlongWalls(from, to, [w], []);
    expect(path).not.toBeNull();
    // brak dwóch kolejnych punktów w tym samym miejscu
    for (let i = 0; i < path!.length - 1; i++) {
      expect(Math.hypot(path![i + 1].x - path![i].x, path![i + 1].y - path![i].y)).toBeGreaterThan(0);
    }
  });
});

describe("crossesGeometry", () => {
  it("wykrywa przecięcie ODCINKA z narysowaną ścianą", () => {
    const w = wall([{ x: 50, y: -10 }, { x: 50, y: 10 }]);
    expect(crossesGeometry({ x: 0, y: 0 }, { x: 100, y: 0 }, [w], [])).toBe(true);
  });

  it("odcinek RÓWNOLEGŁY do ściany, który jej nie mija, nie liczy się jako przecięcie", () => {
    const w = wall([{ x: 50, y: -10 }, { x: 50, y: 10 }]);
    expect(crossesGeometry({ x: 0, y: 100 }, { x: 100, y: 100 }, [w], [])).toBe(false);
  });

  it("dotknięcie końca/narożnika (bez wejścia w głąb odcinka) NIE liczy się jako przecięcie", () => {
    // odcinek kończy się DOKŁADNIE na ścianie (typowy `from`/`to` doskoku) —
    // to nie jest przebicie, tylko właściwe dojście do celu
    const w = wall([{ x: 50, y: -10 }, { x: 50, y: 10 }]);
    expect(crossesGeometry({ x: 0, y: 0 }, { x: 50, y: 0 }, [w], [])).toBe(false);
  });

  it("uwzględnia też obrysy pomieszczeń, nie tylko ściany", () => {
    const r = room([{ x: 40, y: -10 }, { x: 60, y: -10 }, { x: 60, y: 10 }, { x: 40, y: 10 }]);
    expect(crossesGeometry({ x: 0, y: 0 }, { x: 100, y: 0 }, [], [r])).toBe(true);
  });
});
