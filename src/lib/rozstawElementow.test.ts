import { describe, it, expect } from "vitest";
import { kierunekWzdluzSciany, odsunOdSasiadow, type ZajetySymbol } from "./rozstawElementow";

/**
 * Rozsuwanie osprzętu stawianego blisko siebie.
 *
 * Klik decyduje o ŚRODKU symbolu, a symbol ma swoją szerokość — o której klikający nie
 * myśli. Dwa gniazda obok siebie lądowały więc jedno na drugim i spod wierzchniego nie
 * dało się już wyciągnąć tego pod spodem ani zobaczyć, że tam jest.
 */
describe("kierunekWzdluzSciany", () => {
  /** Trzonek symbolu patrzy PROSTOPADLE do ściany, więc ściana biegnie prostopadle do niego. */
  it("ściana pionowa (trzonek w lewo, obrót 270°) rozsuwa w pionie", () => {
    const k = kierunekWzdluzSciany(270);
    expect(k.x).toBeCloseTo(0, 10);
    expect(Math.abs(k.y)).toBeCloseTo(1, 10);
  });

  it("ściana pozioma (trzonek do góry, obrót 0°) rozsuwa w poziomie", () => {
    const k = kierunekWzdluzSciany(0);
    expect(Math.abs(k.x)).toBeCloseTo(1, 10);
    expect(k.y).toBeCloseTo(0, 10);
  });

  it("kierunek jest wektorem jednostkowym przy każdym obrocie", () => {
    for (const obrot of [0, 45, 90, 137, 180, 270, 359]) {
      const k = kierunekWzdluzSciany(obrot);
      expect(Math.hypot(k.x, k.y), `obrót ${obrot}°`).toBeCloseTo(1, 10);
    }
  });
});

describe("odsunOdSasiadow", () => {
  /** Gniazdo: pudełko 20 × 16 jedn., stojące prosto. */
  const gniazdo = (x: number, y: number, obrot = 0): ZajetySymbol => ({
    x,
    y,
    polSzer: 10,
    polWys: 8,
    obrot,
  });

  it("bez sąsiadów nie rusza punktu", () => {
    expect(odsunOdSasiadow(gniazdo(100, 100), [], 0)).toEqual({ x: 100, y: 100 });
  });

  it("sąsiad poza zasięgiem nie rusza punktu", () => {
    expect(odsunOdSasiadow(gniazdo(140, 100), [gniazdo(100, 100)], 0)).toEqual({ x: 140, y: 100 });
  });

  /**
   * Sedno zgłoszenia „za daleko od siebie": przesunięcie kończy się na STYKU pudełek,
   * czyli 20 jedn. dla dwóch symboli o szerokości 20. Wcześniej liczyliśmy połową
   * PRZEKĄTNEJ i wychodziło ~25,6 — o 28% za dużo, i to było widać.
   */
  it("rozsuwa dokładnie do styku pudełek, nie dalej", () => {
    const wynik = odsunOdSasiadow(gniazdo(105, 100), [gniazdo(100, 100)], 0);
    expect(wynik.x).toBeCloseTo(120, 6);
    expect(wynik.y).toBeCloseTo(100, 6);
  });

  it("odsuwa na TĘ stronę, po której element już jest", () => {
    expect(odsunOdSasiadow(gniazdo(95, 100), [gniazdo(100, 100)], 0).x).toBeCloseTo(80, 6);
  });

  it("rząd gniazd przechodzi wzdłuż, zamiast utknąć na pierwszym", () => {
    const rzad = [gniazdo(100, 100), gniazdo(120, 100), gniazdo(140, 100)];
    const wynik = odsunOdSasiadow(gniazdo(104, 100), rzad, 0);
    expect(wynik.x).toBeCloseTo(160, 6);
  });

  /**
   * Sąsiad na innej wysokości montażu mija się bokiem — nie ma czego rozsuwać.
   * Model kołowy odpychał go tu niepotrzebnie, bo koło sięga dalej niż pudełko.
   */
  it("sąsiad odsunięty w poprzek nie przeszkadza", () => {
    const wynik = odsunOdSasiadow(gniazdo(100, 118), [gniazdo(100, 100)], 0);
    expect(wynik).toEqual({ x: 100, y: 118 });
  });

  it("rozsuwa w pionie, gdy tak biegnie ściana", () => {
    const naPionowej = (x: number, y: number) => gniazdo(x, y, 270);
    const wynik = odsunOdSasiadow(naPionowej(100, 105), [naPionowej(100, 100)], 270);
    expect(wynik.x).toBeCloseTo(100, 6);
    expect(wynik.y).toBeCloseTo(120, 6);
  });

  /** Sąsiad obrócony inaczej (tuż za rogiem) liczy się SWOIM pudełkiem, nie naszym. */
  it("sąsiad obrócony o 90° zajmuje wzdłuż tyle, ile ma wysokości", () => {
    const wynik = odsunOdSasiadow(gniazdo(105, 100), [gniazdo(100, 100, 90)], 0);
    // nasza połowa szerokości (10) + jego połowa WYSOKOŚCI (8), bo leży bokiem
    expect(wynik.x).toBeCloseTo(118, 6);
  });

  it("klik w sam środek sąsiada też zostaje rozsunięty", () => {
    const wynik = odsunOdSasiadow(gniazdo(100, 100), [gniazdo(100, 100)], 0);
    expect(Math.abs(wynik.x - 100)).toBeCloseTo(20, 6);
  });

  it("zdegenerowane pudełko nie zapętla liczenia", () => {
    const zero: ZajetySymbol = { x: 100, y: 100, polSzer: 0, polWys: 0, obrot: 0 };
    expect(odsunOdSasiadow(zero, [zero], 0)).toEqual({ x: 100, y: 100 });
  });
});
