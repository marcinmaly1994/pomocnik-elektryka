import { describe, it, expect } from "vitest";
import { snap, clampNum, pointInPolygon, polygonArea, polygonAreaM2, nearestPointOnPolyline } from "./geometry";

describe("snap", () => {
  it("zaokrągla do siatki 20", () => {
    expect(snap(23)).toBe(20);
    expect(snap(31)).toBe(40);
  });

  it("obsługuje inną wielkość siatki", () => {
    expect(snap(12, 10)).toBe(10);
    expect(snap(16, 10)).toBe(20);
  });
});

describe("clampNum", () => {
  it("ogranicza do zakresu", () => {
    expect(clampNum(-5, 0, 1000)).toBe(0);
    expect(clampNum(2000, 0, 1000)).toBe(1000);
    expect(clampNum(500, 0, 1000)).toBe(500);
  });
});

describe("pointInPolygon", () => {
  const square = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ];

  it("wykrywa punkt wewnątrz", () => {
    expect(pointInPolygon({ x: 50, y: 50 }, square)).toBe(true);
  });

  it("wykrywa punkt na zewnątrz", () => {
    expect(pointInPolygon({ x: 150, y: 50 }, square)).toBe(false);
  });
});

describe("polygonArea / polygonAreaM2", () => {
  const square = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ];

  it("liczy pole prostokąta", () => {
    expect(polygonArea(square)).toBe(10000);
  });

  it("kierunek obrysu nie wpływa na wynik", () => {
    expect(polygonArea([...square].reverse())).toBe(10000);
  });

  it("figura zdegenerowana ma pole zero, a nie NaN", () => {
    expect(polygonArea([])).toBe(0);
    expect(polygonArea([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBe(0);
  });

  it("liczy pole trójkąta", () => {
    expect(polygonArea([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }])).toBe(50);
  });

  it("skala przelicza się KWADRATOWO, nie liniowo", () => {
    // 100×100 jedn. przy 0,05 m/jedn. to 5×5 m = 25 m², a nie 500 m²
    expect(polygonAreaM2(square, 0.05)).toBeCloseTo(25, 6);
  });

  it("bez kalibracji nie zgaduje metrów", () => {
    expect(polygonAreaM2(square, null)).toBeNull();
    expect(polygonAreaM2(square, 0)).toBeNull();
  });
});

describe("nearestPointOnPolyline", () => {
  // pozioma ściana od (0,0) do (100,0)
  const wall = [{ x: 0, y: 0 }, { x: 100, y: 0 }];

  it("rzutuje punkt prostopadle na segment", () => {
    const r = nearestPointOnPolyline({ x: 40, y: 25 }, wall);
    expect(r!.point).toEqual({ x: 40, y: 0 });
    expect(r!.angle).toBeCloseTo(0, 6);
  });

  it("przycina do końca segmentu, gdy rzut wypada poza nim", () => {
    expect(nearestPointOnPolyline({ x: -30, y: 10 }, wall)!.point).toEqual({ x: 0, y: 0 });
    expect(nearestPointOnPolyline({ x: 200, y: -10 }, wall)!.point).toEqual({ x: 100, y: 0 });
  });

  it("wybiera NAJBLIŻSZY z kilku segmentów łamanej", () => {
    // łamana w kształcie L: (0,0)→(100,0)→(100,100)
    const bent = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];
    const r = nearestPointOnPolyline({ x: 90, y: 40 }, bent);
    expect(r!.point).toEqual({ x: 100, y: 40 });
    expect(r!.angle).toBeCloseTo(Math.PI / 2, 6); // drugi segment idzie w dół (+y)
  });

  it("kąt segmentu pionowego to ±90°", () => {
    const vertical = [{ x: 0, y: 0 }, { x: 0, y: 50 }];
    expect(nearestPointOnPolyline({ x: 10, y: 25 }, vertical)!.angle).toBeCloseTo(Math.PI / 2, 6);
  });

  it("łamana bez segmentów (0 lub 1 punkt) zwraca null", () => {
    expect(nearestPointOnPolyline({ x: 0, y: 0 }, [])).toBeNull();
    expect(nearestPointOnPolyline({ x: 0, y: 0 }, [{ x: 5, y: 5 }])).toBeNull();
  });
});
