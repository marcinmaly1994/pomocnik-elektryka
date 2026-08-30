import { describe, expect, it } from "vitest";
import { obciazalnosc3Zyly, PRZEKROJE_3ZYLY_AL, PRZEKROJE_3ZYLY_CU } from "./ampacity3";

/**
 * Wartości potwierdzone z użytkownikiem komórka po komórce (dwie rundy poprawek
 * na przepisanym tekście tablic B.52.4/B.52.5, PN-HD 60364-5-52) — patrz komentarz
 * na górze `ampacity3.ts`. Ten plik zamraża je testem, żeby przyszła zmiana nie
 * mogła po cichu podmienić wartości bezpieczeństwa bez złamania czegoś widocznego.
 */

describe("obciążalność 3 żyły — punkty kontrolne z obu tablic", () => {
  it("PVC/Cu skrajne wiersze (1,5 i 300 mm²) i poprawiona komórka (2,5mm²/D2)", () => {
    expect(obciazalnosc3Zyly("Cu", "PVC", "A1", 1.5)).toBe(13.5);
    expect(obciazalnosc3Zyly("Cu", "PVC", "D2", 1.5)).toBe(19);
    // ta komórka miała literówkę w pierwszej wersji (26 zamiast 24) — użytkownik
    // potwierdził 24 jako poprawną wartość ze skanu
    expect(obciazalnosc3Zyly("Cu", "PVC", "D2", 2.5)).toBe(24);
    expect(obciazalnosc3Zyly("Cu", "PVC", "D1", 2.5)).toBe(24);
    // kolumna C przy 300 mm² — druga poprawiona komórka (464, nie 439)
    expect(obciazalnosc3Zyly("Cu", "PVC", "C", 300)).toBe(464);
  });

  it("XLPE/Cu — wiersze dopisane w drugiej rundzie (240 i 300 mm²)", () => {
    expect(obciazalnosc3Zyly("Cu", "XLPE", "C", 240)).toBe(500);
    expect(obciazalnosc3Zyly("Cu", "XLPE", "C", 300)).toBe(576);
    expect(obciazalnosc3Zyly("Cu", "XLPE", "D1", 300)).toBe(365);
    expect(obciazalnosc3Zyly("Cu", "XLPE", "D2", 300)).toBe(419);
  });

  it("XLPE jest zawsze wyższe niż PVC dla tej samej metody i przekroju (90°C > 70°C)", () => {
    for (const S of [1.5, 25, 300]) {
      for (const m of ["A1", "B2", "C"] as const) {
        expect(obciazalnosc3Zyly("Cu", "XLPE", m, S)!).toBeGreaterThan(obciazalnosc3Zyly("Cu", "PVC", m, S)!);
      }
    }
  });

  it("miedź jest zawsze wyższa niż aluminium dla tej samej metody, izolacji i przekroju", () => {
    for (const S of [2.5, 25, 300]) {
      for (const iz of ["PVC", "XLPE"] as const) {
        expect(obciazalnosc3Zyly("Cu", iz, "C", S)!).toBeGreaterThan(obciazalnosc3Zyly("Al", iz, "C", S)!);
      }
    }
  });

  it("D2 (bezpośrednio w gruncie) jest ZAWSZE ≥ D1 (w rurze w gruncie) tam, gdzie obie wartości istnieją", () => {
    for (const S of PRZEKROJE_3ZYLY_CU) {
      for (const iz of ["PVC", "XLPE"] as const) {
        const d1 = obciazalnosc3Zyly("Cu", iz, "D1", S)!;
        const d2 = obciazalnosc3Zyly("Cu", iz, "D2", S)!;
        expect(d2).toBeGreaterThanOrEqual(d1);
      }
    }
  });
});

describe("potwierdzona luka: aluminium metoda D2 poniżej 16 mm²", () => {
  it("brak wartości D2 dla Al 2,5/4/6/10 mm² w OBU tablicach — to luka normy, nie zero", () => {
    for (const S of [2.5, 4, 6, 10]) {
      expect(obciazalnosc3Zyly("Al", "PVC", "D2", S)).toBeUndefined();
      expect(obciazalnosc3Zyly("Al", "XLPE", "D2", S)).toBeUndefined();
    }
  });

  it("od 16 mm² aluminium ma już komplet metod łącznie z D2", () => {
    for (const S of [16, 25, 300]) {
      expect(obciazalnosc3Zyly("Al", "PVC", "D2", S)).toBeTypeOf("number");
      expect(obciazalnosc3Zyly("Al", "XLPE", "D2", S)).toBeTypeOf("number");
    }
  });

  it("miedź NIE ma tej luki — D2 istnieje dla wszystkich przekrojów od 1,5 mm² w górę", () => {
    for (const S of PRZEKROJE_3ZYLY_CU) {
      expect(obciazalnosc3Zyly("Cu", "PVC", "D2", S)).toBeTypeOf("number");
      expect(obciazalnosc3Zyly("Cu", "XLPE", "D2", S)).toBeTypeOf("number");
    }
  });

  it("kombinacja spoza tablicy (nieistniejący przekrój) zwraca undefined, nie 0 ani ekstrapolację", () => {
    expect(obciazalnosc3Zyly("Cu", "PVC", "A1", 500)).toBeUndefined();
    expect(obciazalnosc3Zyly("Al", "PVC", "A1", 1.5)).toBeUndefined(); // Al nie ma 1,5 mm²
  });
});

describe("zakresy przekrojów", () => {
  it("miedź zaczyna się od 1,5 mm², aluminium od 2,5 mm² — oba kończą na 300 mm²", () => {
    expect(PRZEKROJE_3ZYLY_CU[0]).toBe(1.5);
    expect(PRZEKROJE_3ZYLY_AL[0]).toBe(2.5);
    expect(PRZEKROJE_3ZYLY_CU[PRZEKROJE_3ZYLY_CU.length - 1]).toBe(300);
    expect(PRZEKROJE_3ZYLY_AL[PRZEKROJE_3ZYLY_AL.length - 1]).toBe(300);
  });
});
