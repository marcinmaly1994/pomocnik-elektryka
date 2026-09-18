import { describe, it, expect } from "vitest";
import { kierunekWzdluzSciany, odsunOdSasiadow } from "./rozstawElementow";

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
  const POZIOMO = { x: 1, y: 0 };

  it("bez sąsiadów nie rusza punktu", () => {
    expect(odsunOdSasiadow({ x: 100, y: 100, r: 10 }, [], POZIOMO)).toEqual({ x: 100, y: 100 });
  });

  it("sąsiad poza zasięgiem nie rusza punktu", () => {
    const wynik = odsunOdSasiadow({ x: 100, y: 100, r: 10 }, [{ x: 140, y: 100, r: 10 }], POZIOMO);
    expect(wynik).toEqual({ x: 100, y: 100 });
  });

  it("zachodzące symbole rozsuwa dokładnie do STYKU, nie dalej", () => {
    const wynik = odsunOdSasiadow({ x: 105, y: 100, r: 10 }, [{ x: 100, y: 100, r: 10 }], POZIOMO);
    expect(wynik.x).toBeCloseTo(120, 6);
    expect(wynik.y).toBeCloseTo(100, 6);
  });

  /** Sedno: gniazdo kliknięte po lewej stronie sąsiada ma zostać po lewej. */
  it("odsuwa na TĘ stronę, po której element już jest", () => {
    const wynik = odsunOdSasiadow({ x: 95, y: 100, r: 10 }, [{ x: 100, y: 100, r: 10 }], POZIOMO);
    expect(wynik.x).toBeCloseTo(80, 6);
  });

  it("rząd gniazd przechodzi wzdłuż, zamiast utknąć na pierwszym", () => {
    const rzad = [
      { x: 100, y: 100, r: 10 },
      { x: 120, y: 100, r: 10 },
      { x: 140, y: 100, r: 10 },
    ];
    const wynik = odsunOdSasiadow({ x: 104, y: 100, r: 10 }, rzad, POZIOMO);
    expect(wynik.x).toBeCloseTo(160, 6);
    for (const s of rzad) expect(Math.hypot(wynik.x - s.x, wynik.y - s.y)).toBeGreaterThanOrEqual(20 - 1e-9);
  });

  /**
   * Sąsiad odsunięty także w poprzek wymaga KRÓTSZEGO przesunięcia niż suma promieni:
   * część odległości jest już „załatwiona" w drugiej osi. Przesuwanie o pełną sumę
   * odrzucałoby gniazdo dalej, niż trzeba, i robiło dziury w rzędzie.
   */
  it("przy sąsiedzie odsuniętym w poprzek przesuwa tylko o brakującą część", () => {
    const wynik = odsunOdSasiadow({ x: 100, y: 112, r: 10 }, [{ x: 100, y: 100, r: 10 }], POZIOMO);
    expect(wynik.x).toBeCloseTo(100 + Math.sqrt(400 - 144), 6);
  });

  it("rozsuwa też w pionie, gdy tak biegnie ściana", () => {
    const wynik = odsunOdSasiadow({ x: 100, y: 105, r: 10 }, [{ x: 100, y: 100, r: 10 }], { x: 0, y: 1 });
    expect(wynik.x).toBeCloseTo(100, 6);
    expect(wynik.y).toBeCloseTo(120, 6);
  });

  it("zerowy kierunek nie wywraca liczenia", () => {
    const wynik = odsunOdSasiadow({ x: 100, y: 100, r: 10 }, [{ x: 100, y: 100, r: 10 }], { x: 0, y: 0 });
    expect(wynik).toEqual({ x: 100, y: 100 });
  });

  /** Klik dokładnie w środek sąsiada: żadna strona nie jest bliższa, ale wyjść trzeba. */
  it("klik w sam środek sąsiada też zostaje rozsunięty", () => {
    const wynik = odsunOdSasiadow({ x: 100, y: 100, r: 10 }, [{ x: 100, y: 100, r: 10 }], POZIOMO);
    expect(Math.abs(wynik.x - 100)).toBeCloseTo(20, 6);
  });
});
