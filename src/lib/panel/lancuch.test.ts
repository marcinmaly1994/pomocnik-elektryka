import { describe, expect, it } from "vitest";
import { kolejnoscLancucha } from "./lancuch";

const p = (x: number, y: number) => ({ x, y });

/**
 * Kolejnosc punktow w lancuchu decyduje ZARAZEM o rysunku trasy i o metrach
 * przewodu w kosztorysie (patrz `buildCableRoutes` i `estimateRoutes`). Dlatego
 * musi byc powtarzalna co do jednego punktu — inaczej te dwie rzeczy zaczna
 * opisywac dwie rozne instalacje.
 */
describe("kolejnoscLancucha", () => {
  it("idzie od rozdzielnicy do najblizszej puszki, potem do kolejnej najblizszej", () => {
    const start = p(0, 0);
    // Podane w kolejnosci ODWROTNEJ do geograficznej — sens testu polega na tym,
    // ze kolejnosc wejsciowa NIE decyduje o trasie.
    const wynik = kolejnoscLancucha(start, [p(100, 0), p(10, 0), p(50, 0)]);
    expect(wynik).toEqual([p(10, 0), p(50, 0), p(100, 0)]);
  });

  /** Metryka Manhattan, nie euklidesowa: przewod biegnie wzdluz scian. */
  it("mierzy po obrysie, nie po przekatnej", () => {
    // (30,30) jest blizej w linii prostej (42,4 < 45), ale dalej po obrysie (60 > 45).
    const wynik = kolejnoscLancucha(p(0, 0), [p(30, 30), p(45, 0)]);
    expect(wynik[0]).toEqual(p(45, 0));
  });

  it("przy remisie wygrywa kolejnosc wejsciowa — wynik ma byc powtarzalny", () => {
    const a = { x: 10, y: 0, id: "a" };
    const b = { x: 0, y: 10, id: "b" };
    expect(kolejnoscLancucha(p(0, 0), [a, b]).map((e) => e.id)).toEqual(["a", "b"]);
    expect(kolejnoscLancucha(p(0, 0), [b, a]).map((e) => e.id)).toEqual(["b", "a"]);
  });

  it("nie gubi ani nie duplikuje punktow", () => {
    const punkty = Array.from({ length: 12 }, (_, i) => ({ x: (i * 37) % 100, y: (i * 53) % 100, id: `p${i}` }));
    const wynik = kolejnoscLancucha(p(0, 0), punkty);
    expect(wynik).toHaveLength(punkty.length);
    expect(new Set(wynik.map((e) => e.id)).size).toBe(punkty.length);
  });

  it("radzi sobie z lista pusta i jednoelementowa", () => {
    expect(kolejnoscLancucha(p(0, 0), [])).toEqual([]);
    expect(kolejnoscLancucha(p(0, 0), [p(5, 5)])).toEqual([p(5, 5)]);
  });

  it("nie modyfikuje tablicy wejsciowej", () => {
    const punkty = [p(100, 0), p(10, 0)];
    kolejnoscLancucha(p(0, 0), punkty);
    expect(punkty).toEqual([p(100, 0), p(10, 0)]);
  });
});
