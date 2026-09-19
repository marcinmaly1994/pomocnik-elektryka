import { describe, it, expect } from "vitest";
import { zbudujProjektDom } from "./dom";
import { polygonAreaM2 } from "@/lib/geometry";
import { MANUAL_DRAW_SCALE_MPU } from "@/lib/design";

describe("dom — szkielet", () => {
  const payload = zbudujProjektDom();
  const pole = (f: string) =>
    payload.draft.roomShapes
      .filter((r) => r.floor === f)
      .reduce((a, r) => a + (polygonAreaM2(r.points, MANUAL_DRAW_SCALE_MPU) ?? 0), 0);

  it("ma dwie kondygnacje z wysokością w świetle", () => {
    expect(payload.floors.map((f) => f.id)).toEqual(["f1", "f2"]);
    expect(payload.floors[0].heightM).toBe(2.8);
    expect(payload.floors[1].heightM).toBe(2.6);
  });

  it("parter ma 80 m², piętro 56 m², razem 136 m²", () => {
    expect(pole("f1")).toBeCloseTo(80, 1);
    expect(pole("f2")).toBeCloseTo(56, 1);
    expect(payload.projectName).toContain("136 m²");
  });

  it("piętra nie ma nad garażem — obrysy kondygnacji są różne", () => {
    const minX = (f: string) => Math.min(...payload.draft.roomShapes.filter((r) => r.floor === f).flatMap((r) => r.points.map((q) => q.x)));
    expect(minX("f2")).toBeGreaterThan(minX("f1"));
  });

  it("każdy otwór należy do ściany, która istnieje na tej samej kondygnacji", () => {
    for (const o of payload.draft.openings) {
      const w = payload.draft.walls.find((x) => x.id === o.wallId);
      expect(w, `otwór ${o.id}`).toBeTruthy();
      expect(w!.floor, `otwór ${o.id}`).toBe(o.floor);
    }
  });
});
