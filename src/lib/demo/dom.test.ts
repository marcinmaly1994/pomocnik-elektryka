import { describe, it, expect } from "vitest";
import { zbudujProjektDom } from "./dom";
import { polygonAreaM2 } from "@/lib/geometry";
import { MANUAL_DRAW_SCALE_MPU } from "@/lib/design";
import { computeCircuits } from "@/lib/panel/circuits";

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

describe("dom — parter", () => {
  const payload = zbudujProjektDom();
  const naParterze = payload.draft.elements.filter((e) => e.floor === "f1");

  it("ma rozdzielnicę główną i pięćdziesiąt elementów", () => {
    expect(naParterze.length).toBe(50);
    expect(naParterze.some((e) => e.type === "rozdzielnica")).toBe(true);
  });

  it("ładowarka EV, kocioł i pralka są dedykowane", () => {
    for (const id of ["demo-e-dom-ev", "demo-e-dom-kociol", "demo-e-dom-pralka"]) {
      const el = naParterze.find((e) => e.id === id);
      expect(el, id).toBeTruthy();
      expect(el!.dedicated, id).toBe(true);
    }
  });

  it("kotłownia i pralnia NIE dzielą obwodu gniazd z pokojami", () => {
    const rs = payload.draft.roomShapes.filter((r) => r.floor === "f1");
    const obwody = computeCircuits(naParterze, rs);
    const gospodarcze = new Set(["Kotłownia", "Pralnia"]);
    const mieszkalne = new Set(["Salon"]);
    for (const c of obwody) {
      const pokoje = new Set(c.elements.map((e) => e.room));
      const maGosp = [...pokoje].some((x) => gospodarcze.has(x));
      const maMieszk = [...pokoje].some((x) => mieszkalne.has(x));
      expect(maGosp && maMieszk, `obwód ${c.name} miesza gospodarcze z pokojami`).toBe(false);
    }
  });
});
