import { describe, it, expect } from "vitest";
import type { RoomShape } from "@/types";
import { promienieDoPokoi, PROMIEN_KRAWEDZI_M, PROMIEN_NAROZNIKA_M, snapDoPokoi } from "./roomSnap";

/** Zasiegi w jednostkach planu przy skali rysunku odrecznego (1 jedn. = 5 cm). */
const { naroznik: PROMIEN_NAROZNIKA, krawedz: PROMIEN_KRAWEDZI } = promienieDoPokoi(null);

/** Pokoj 200 x 200 z lewym gornym rogiem w (0,0). */
const POKOJ: RoomShape = {
  id: "r1",
  floor: "f1",
  name: "Salon",
  color: "#3B8C63",
  points: [
    { x: 0, y: 0 },
    { x: 200, y: 0 },
    { x: 200, y: 200 },
    { x: 0, y: 200 },
  ],
};

describe("snapDoPokoi", () => {
  it("dociaga do naroznika sasiada", () => {
    const t = snapDoPokoi({ x: 205, y: -4 }, [POKOJ], PROMIEN_NAROZNIKA, PROMIEN_KRAWEDZI)!;
    expect(t.point).toEqual({ x: 200, y: 0 });
    expect(t.rodzaj).toBe("naroznik");
    expect(t.roomId).toBe("r1");
  });

  it("dociaga do krawedzi, gdy zaden naroznik nie jest w zasiegu", () => {
    const t = snapDoPokoi({ x: 204, y: 100 }, [POKOJ], PROMIEN_NAROZNIKA, PROMIEN_KRAWEDZI)!;
    expect(t.point).toEqual({ x: 200, y: 100 });
    expect(t.rodzaj).toBe("krawedz");
  });

  /**
   * Sedno kolejnosci: przy dociaganiu nowego pokoju do ROGU sasiada punkt lezy blizej
   * jego krawedzi niz samego rogu. Gdyby wygrywala odleglosc, punkt ladowalby tuz obok
   * naroznika — czyli o wlos od tego, o co chodzilo, i ze szczelina.
   */
  it("naroznik wygrywa z blizsza krawedzia", () => {
    // 2 jedn. od krawedzi pionowej, 8 jedn. od naroznika (200,0).
    const t = snapDoPokoi({ x: 202, y: 8 }, [POKOJ], PROMIEN_NAROZNIKA, PROMIEN_KRAWEDZI)!;
    expect(t.rodzaj).toBe("naroznik");
    expect(t.point).toEqual({ x: 200, y: 0 });
  });

  it("krawedz domykajaca obrys tez lapie — ostatni bok nie jest gorszy od reszty", () => {
    // Bok (0,200)-(0,0), czyli ten domykajacy liste punktow.
    const t = snapDoPokoi({ x: -3, y: 100 }, [POKOJ], PROMIEN_NAROZNIKA, PROMIEN_KRAWEDZI)!;
    expect(t.point).toEqual({ x: 0, y: 100 });
  });

  it("nic w zasiegu — brak przyciagania", () => {
    expect(snapDoPokoi({ x: 400, y: 400 }, [POKOJ], PROMIEN_NAROZNIKA, PROMIEN_KRAWEDZI)).toBeNull();
    expect(snapDoPokoi({ x: 200 + PROMIEN_KRAWEDZI + 1, y: 100 }, [POKOJ], PROMIEN_NAROZNIKA, PROMIEN_KRAWEDZI)).toBeNull();
  });

  it("promien naroznika jest szerszy niz krawedzi — w niego celuje sie swiadomie", () => {
    expect(PROMIEN_NAROZNIKA).toBeGreaterThan(PROMIEN_KRAWEDZI);
    const tylkoNaroznik = { x: 200 + PROMIEN_KRAWEDZI + 2, y: 0 };
    expect(snapDoPokoi(tylkoNaroznik, [POKOJ], PROMIEN_NAROZNIKA, PROMIEN_KRAWEDZI)!.rodzaj).toBe("naroznik");
  });

  it("wybiera BLIZSZY z dwoch sasiadow, nie pierwszego z listy", () => {
    const drugi: RoomShape = { ...POKOJ, id: "r2", points: POKOJ.points.map((p) => ({ x: p.x + 210, y: p.y })) };
    const t = snapDoPokoi({ x: 408, y: 0 }, [POKOJ, drugi], PROMIEN_NAROZNIKA, PROMIEN_KRAWEDZI)!;
    expect(t.roomId).toBe("r2");
    expect(t.point).toEqual({ x: 410, y: 0 });
  });

  it("bez pomieszczen nie ma do czego przyciagac", () => {
    expect(snapDoPokoi({ x: 10, y: 10 }, [], PROMIEN_NAROZNIKA, PROMIEN_KRAWEDZI)).toBeNull();
  });

  it("pomieszczenie bez punktow nie wywraca liczenia", () => {
    const puste: RoomShape = { ...POKOJ, id: "r3", points: [] };
    expect(snapDoPokoi({ x: 10, y: 10 }, [puste], PROMIEN_NAROZNIKA, PROMIEN_KRAWEDZI)).toBeNull();
  });
});

describe("promienieDoPokoi", () => {
  /** Zasieg jest twierdzeniem o BUDYNKU („polowa metra od sciany"), nie o precyzji
   *  myszy — wiec w jednostkach planu musi rosnac, gdy jednostka maleje. */
  it("przelicza metry na jednostki planu wg skali", () => {
    expect(promienieDoPokoi(0.05)).toEqual({ naroznik: PROMIEN_NAROZNIKA_M / 0.05, krawedz: PROMIEN_KRAWEDZI_M / 0.05 });
    expect(promienieDoPokoi(0.01).krawedz).toBeGreaterThan(promienieDoPokoi(0.05).krawedz);
  });

  it("bez kalibracji bierze skale rysunku odrecznego", () => {
    expect(promienieDoPokoi(null)).toEqual(promienieDoPokoi(0.05));
    expect(promienieDoPokoi(0)).toEqual(promienieDoPokoi(0.05));
  });

  it("naroznik ma szerszy zasieg niz krawedz w kazdej skali", () => {
    [0.005, 0.01, 0.05, 0.2].forEach((mpu) => {
      const { naroznik, krawedz } = promienieDoPokoi(mpu);
      expect(naroznik).toBeGreaterThan(krawedz);
    });
  });
});
