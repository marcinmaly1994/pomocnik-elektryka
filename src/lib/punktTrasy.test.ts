import { describe, expect, it } from "vitest";
import { dlugoscOdcinka, nearestRouteSegmentIndex, zalamaniaZNowymPunktem } from "./punktTrasy";

// Trasa w kształcie L: (0,0) → (100,0) → (100,50)
const trasa = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 50 },
];

describe("punkt trasy", () => {
  it("wskazuje odcinek najbliższy kursorowi", () => {
    expect(nearestRouteSegmentIndex({ x: 40, y: 3 }, trasa)).toBe(0);
    expect(nearestRouteSegmentIndex({ x: 97, y: 30 }, trasa)).toBe(1);
  });

  it("nowy punkt trafia w środek wskazanego odcinka, końce zostają przypięte", () => {
    expect(zalamaniaZNowymPunktem(trasa, { x: 40, y: 0 })).toEqual([
      { x: 40, y: 0 },
      { x: 100, y: 0 },
    ]);
    expect(zalamaniaZNowymPunktem(trasa, { x: 100, y: 20 })).toEqual([
      { x: 100, y: 0 },
      { x: 100, y: 20 },
    ]);
  });

  it("prosta trasa bez załamań dostaje pierwsze", () => {
    expect(zalamaniaZNowymPunktem([trasa[0], trasa[1]], { x: 30, y: 0 })).toEqual([{ x: 30, y: 0 }]);
  });

  it("liczy długość odcinka", () => {
    expect(dlugoscOdcinka(trasa, 0)).toBe(100);
    expect(dlugoscOdcinka(trasa, 1)).toBe(50);
    expect(dlugoscOdcinka(trasa, 5)).toBe(0);
  });
});
