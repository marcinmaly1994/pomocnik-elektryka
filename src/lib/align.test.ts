import { describe, it, expect } from "vitest";
import type { InstallationElement } from "@/types";
import { alignMoves, distributeMoves, offsetMoves } from "./align";

function el(id: string, x: number, y: number): InstallationElement {
  return { id, type: "gniazdko", x, y, room: "Salon", floor: "f1", dedicated: false, note: "", gangs: 1 };
}

/** Trzy gniazdka postawione „na oko": nierówno w pionie i nierówno rozłożone w poziomie. */
const A = el("a", 0, 10);
const B = el("b", 30, 14);
const C = el("c", 100, 8);
const WSZYSTKIE = [A, B, C];
const IDS = ["a", "b", "c"];

/** Wynik ruchów nałożony na elementy — czytelniej niż porównywanie tablic ruchów. */
function po(elements: InstallationElement[], moves: { id: string; x: number; y: number }[]) {
  const m = new Map(moves.map((r) => [r.id, r]));
  return elements.map((e) => {
    const r = m.get(e.id);
    return { id: e.id, x: r ? r.x : e.x, y: r ? r.y : e.y };
  });
}

describe("alignMoves", () => {
  it("do lewej sprowadza wszystkie do najmniejszego X, nie ruszając Y", () => {
    const wynik = po(WSZYSTKIE, alignMoves(WSZYSTKIE, IDS, "lewo"));
    expect(wynik.map((e) => e.x)).toEqual([0, 0, 0]);
    expect(wynik.map((e) => e.y)).toEqual([10, 14, 8]);
  });

  it("do prawej sprowadza do największego X", () => {
    expect(po(WSZYSTKIE, alignMoves(WSZYSTKIE, IDS, "prawo")).map((e) => e.x)).toEqual([100, 100, 100]);
  });

  it("do góry i do dołu działają na osi Y", () => {
    expect(po(WSZYSTKIE, alignMoves(WSZYSTKIE, IDS, "gora")).map((e) => e.y)).toEqual([8, 8, 8]);
    expect(po(WSZYSTKIE, alignMoves(WSZYSTKIE, IDS, "dol")).map((e) => e.y)).toEqual([14, 14, 14]);
  });

  it("wyśrodkowanie liczy się z OBRYSU zaznaczenia, nie ze średniej pozycji", () => {
    // Średnia X to (0+30+100)/3 ≈ 43,3; środek obrysu to (0+100)/2 = 50.
    expect(po(WSZYSTKIE, alignMoves(WSZYSTKIE, IDS, "srodekX")).map((e) => e.x)).toEqual([50, 50, 50]);
    // Analogicznie w pionie: (8+14)/2 = 11, nie średnia 10,67.
    expect(po(WSZYSTKIE, alignMoves(WSZYSTKIE, IDS, "srodekY")).map((e) => e.y)).toEqual([11, 11, 11]);
  });

  it("kolejność zaznaczania nie ma znaczenia", () => {
    const wprzod = alignMoves(WSZYSTKIE, ["a", "b", "c"], "lewo");
    const wstecz = alignMoves(WSZYSTKIE, ["c", "b", "a"], "lewo");
    expect(new Set(wprzod.map((m) => `${m.id}:${m.x}`))).toEqual(new Set(wstecz.map((m) => `${m.id}:${m.x}`)));
  });

  it("zwraca tylko elementy, które faktycznie się ruszają", () => {
    // „a" ma już najmniejszy X, więc nie ma po co go przesuwać ani zaśmiecać historii.
    expect(alignMoves(WSZYSTKIE, IDS, "lewo").map((m) => m.id)).toEqual(["b", "c"]);
  });

  it("już wyrównany rząd nie generuje żadnego ruchu", () => {
    const rowne = [el("a", 5, 0), el("b", 5, 30)];
    expect(alignMoves(rowne, ["a", "b"], "lewo")).toEqual([]);
  });

  it("mniej niż dwa elementy nie mają się do czego wyrównać", () => {
    expect(alignMoves(WSZYSTKIE, ["a"], "lewo")).toEqual([]);
    expect(alignMoves(WSZYSTKIE, [], "lewo")).toEqual([]);
  });

  it("nie rusza elementów spoza zaznaczenia", () => {
    expect(alignMoves(WSZYSTKIE, ["a", "b"], "lewo").some((m) => m.id === "c")).toBe(false);
  });
});

describe("distributeMoves", () => {
  it("skrajne zostają, środkowy ląduje dokładnie pośrodku", () => {
    const wynik = po(WSZYSTKIE, distributeMoves(WSZYSTKIE, IDS, "x"));
    expect(wynik.map((e) => e.x)).toEqual([0, 50, 100]);
  });

  it("nie rusza osi prostopadłej", () => {
    expect(po(WSZYSTKIE, distributeMoves(WSZYSTKIE, IDS, "x")).map((e) => e.y)).toEqual([10, 14, 8]);
  });

  it("kolejność w zaznaczeniu nie ma znaczenia — liczy się położenie", () => {
    const odwrotnie = distributeMoves(WSZYSTKIE, ["c", "a", "b"], "x");
    expect(po(WSZYSTKIE, odwrotnie).map((e) => e.x)).toEqual([0, 50, 100]);
  });

  it("rozkłada też w pionie", () => {
    const pion = [el("a", 0, 0), el("b", 0, 5), el("c", 0, 40), el("d", 0, 60)];
    const wynik = po(pion, distributeMoves(pion, ["a", "b", "c", "d"], "y"));
    expect(wynik.map((e) => e.y)).toEqual([0, 20, 40, 60]);
  });

  it("dwa elementy są z definicji równo rozłożone — brak ruchów", () => {
    expect(distributeMoves(WSZYSTKIE, ["a", "c"], "x")).toEqual([]);
  });

  it("już równy rozstaw nie generuje ruchu", () => {
    const rowne = [el("a", 0, 0), el("b", 10, 0), el("c", 20, 0)];
    expect(distributeMoves(rowne, ["a", "b", "c"], "x")).toEqual([]);
  });
});

describe("offsetMoves", () => {
  it("przesuwa całe zaznaczenie o wektor, zachowując wzajemne odstępy", () => {
    const wynik = po(WSZYSTKIE, offsetMoves(WSZYSTKIE, IDS, 5, -2));
    expect(wynik).toEqual([
      { id: "a", x: 5, y: 8 },
      { id: "b", x: 35, y: 12 },
      { id: "c", x: 105, y: 6 },
    ]);
  });

  it("pomija elementy spoza zaznaczenia", () => {
    expect(offsetMoves(WSZYSTKIE, ["b"], 1, 1)).toEqual([{ id: "b", x: 31, y: 15 }]);
  });
});
