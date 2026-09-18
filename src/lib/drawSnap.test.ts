import { describe, it, expect } from "vitest";
import type { RoomShape, Wall } from "@/types";
import {
  promieniePrzyciagania,
  PROMIEN_KRAWEDZI_M,
  PROMIEN_NAROZNIKA_M,
  snapDoGeometrii,
  wyrownajDoOsi,
} from "./drawSnap";

/** Zasiegi w jednostkach planu przy skali rysunku odrecznego (1 jedn. = 5 cm). */
const { naroznik: PROMIEN_NAROZNIKA, krawedz: PROMIEN_KRAWEDZI } = promieniePrzyciagania(null);

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

/** Zamknieta sciana o tym samym obrysie co POKOJ, przesunieta o 500 w prawo —
 *  domkniecie jest zapisane JAWNIE, jako powtorzony pierwszy punkt na koncu. */
const SCIANA_ZAMKNIETA: Wall = {
  id: "w1",
  floor: "f1",
  thickness: 25,
  points: [
    { x: 500, y: 0 },
    { x: 700, y: 0 },
    { x: 700, y: 200 },
    { x: 500, y: 200 },
    { x: 500, y: 0 },
  ],
};

/** Pojedynczy odcinek — sciana nie musi byc zamknieta. */
const SCIANKA: Wall = {
  id: "w2",
  floor: "f1",
  points: [
    { x: 0, y: 400 },
    { x: 200, y: 400 },
  ],
};

describe("snapDoGeometrii — pomieszczenia", () => {
  it("dociaga do naroznika sasiada", () => {
    const t = snapDoGeometrii({ x: 205, y: -4 }, { roomShapes: [POKOJ] }, PROMIEN_NAROZNIKA, PROMIEN_KRAWEDZI)!;
    expect(t.point).toEqual({ x: 200, y: 0 });
    expect(t.rodzaj).toBe("naroznik");
    expect(t.zrodlo).toEqual({ kind: "room", id: "r1" });
  });

  it("dociaga do krawedzi, gdy zaden naroznik nie jest w zasiegu", () => {
    const t = snapDoGeometrii({ x: 204, y: 100 }, { roomShapes: [POKOJ] }, PROMIEN_NAROZNIKA, PROMIEN_KRAWEDZI)!;
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
    const t = snapDoGeometrii({ x: 202, y: 8 }, { roomShapes: [POKOJ] }, PROMIEN_NAROZNIKA, PROMIEN_KRAWEDZI)!;
    expect(t.rodzaj).toBe("naroznik");
    expect(t.point).toEqual({ x: 200, y: 0 });
  });

  it("krawedz domykajaca obrys tez lapie — ostatni bok nie jest gorszy od reszty", () => {
    // Bok (0,200)-(0,0), czyli ten domykajacy liste punktow.
    const t = snapDoGeometrii({ x: -3, y: 100 }, { roomShapes: [POKOJ] }, PROMIEN_NAROZNIKA, PROMIEN_KRAWEDZI)!;
    expect(t.point).toEqual({ x: 0, y: 100 });
  });

  it("nic w zasiegu — brak przyciagania", () => {
    expect(snapDoGeometrii({ x: 400, y: 400 }, { roomShapes: [POKOJ] }, PROMIEN_NAROZNIKA, PROMIEN_KRAWEDZI)).toBeNull();
    expect(
      snapDoGeometrii({ x: 200 + PROMIEN_KRAWEDZI + 1, y: 100 }, { roomShapes: [POKOJ] }, PROMIEN_NAROZNIKA, PROMIEN_KRAWEDZI)
    ).toBeNull();
  });

  it("promien naroznika jest szerszy niz krawedzi — w niego celuje sie swiadomie", () => {
    expect(PROMIEN_NAROZNIKA).toBeGreaterThan(PROMIEN_KRAWEDZI);
    const tylkoNaroznik = { x: 200 + PROMIEN_KRAWEDZI + 2, y: 0 };
    expect(snapDoGeometrii(tylkoNaroznik, { roomShapes: [POKOJ] }, PROMIEN_NAROZNIKA, PROMIEN_KRAWEDZI)!.rodzaj).toBe(
      "naroznik"
    );
  });

  it("wybiera BLIZSZY z dwoch sasiadow, nie pierwszego z listy", () => {
    const drugi: RoomShape = { ...POKOJ, id: "r2", points: POKOJ.points.map((p) => ({ x: p.x + 210, y: p.y })) };
    const t = snapDoGeometrii({ x: 408, y: 0 }, { roomShapes: [POKOJ, drugi] }, PROMIEN_NAROZNIKA, PROMIEN_KRAWEDZI)!;
    expect(t.zrodlo).toEqual({ kind: "room", id: "r2" });
    expect(t.point).toEqual({ x: 410, y: 0 });
  });

  it("bez celow nie ma do czego przyciagac", () => {
    expect(snapDoGeometrii({ x: 10, y: 10 }, {}, PROMIEN_NAROZNIKA, PROMIEN_KRAWEDZI)).toBeNull();
    expect(
      snapDoGeometrii({ x: 10, y: 10 }, { roomShapes: [], walls: [] }, PROMIEN_NAROZNIKA, PROMIEN_KRAWEDZI)
    ).toBeNull();
  });

  it("pomieszczenie bez punktow nie wywraca liczenia", () => {
    const puste: RoomShape = { ...POKOJ, id: "r3", points: [] };
    expect(snapDoGeometrii({ x: 10, y: 10 }, { roomShapes: [puste] }, PROMIEN_NAROZNIKA, PROMIEN_KRAWEDZI)).toBeNull();
  });
});

/**
 * Sciany byly dotad JEDYNA figura bez przyciagania do czegokolwiek poza siatka —
 * dorysowanie scianki dzialowej do juz postawionej sciany wymagalo trafienia co do
 * piksela. To sa testy tej luki.
 */
describe("snapDoGeometrii — sciany", () => {
  it("dociaga do naroznika zapisanej sciany", () => {
    const t = snapDoGeometrii({ x: 704, y: 3 }, { walls: [SCIANA_ZAMKNIETA] }, PROMIEN_NAROZNIKA, PROMIEN_KRAWEDZI)!;
    expect(t.point).toEqual({ x: 700, y: 0 });
    expect(t.rodzaj).toBe("naroznik");
    expect(t.zrodlo).toEqual({ kind: "wall", id: "w1" });
  });

  it("dociaga do krawedzi sciany miedzy naroznikami", () => {
    const t = snapDoGeometrii({ x: 703, y: 100 }, { walls: [SCIANA_ZAMKNIETA] }, PROMIEN_NAROZNIKA, PROMIEN_KRAWEDZI)!;
    expect(t.point).toEqual({ x: 700, y: 100 });
    expect(t.rodzaj).toBe("krawedz");
  });

  it("sciana otwarta (zwykly odcinek) tez jest celem", () => {
    const t = snapDoGeometrii({ x: 100, y: 403 }, { walls: [SCIANKA] }, PROMIEN_NAROZNIKA, PROMIEN_KRAWEDZI)!;
    expect(t.point).toEqual({ x: 100, y: 400 });
    expect(t.zrodlo).toEqual({ kind: "wall", id: "w2" });
  });

  /**
   * Sciana otwarta NIE jest domykana w locie: gdyby modul dokladal jej zamkniecie
   * (tak jak robi to dla pomieszczenia), odcinek (0,400)-(200,400) dostalby widmowy
   * bok powrotny i punkt w polowie „drogi powrotnej" lapalby sie na nieistniejaca
   * krawedz. Tu: punkt daleko od odcinka, ale blisko jego srodka w pionie.
   */
  it("otwarta sciana nie dostaje widmowego boku domykajacego", () => {
    expect(snapDoGeometrii({ x: 100, y: 500 }, { walls: [SCIANKA] }, PROMIEN_NAROZNIKA, PROMIEN_KRAWEDZI)).toBeNull();
  });

  it("sciana bez punktow nie wywraca liczenia", () => {
    const puste: Wall = { id: "w3", floor: "f1", points: [] };
    expect(snapDoGeometrii({ x: 10, y: 10 }, { walls: [puste] }, PROMIEN_NAROZNIKA, PROMIEN_KRAWEDZI)).toBeNull();
  });
});

describe("snapDoGeometrii — pomieszczenia i sciany razem", () => {
  /** Najczestszy uklad po „Narysuj dom samodzielnie": obrys domu narysowany sciana,
   *  a pomieszczenia obrysowywane w srodku. Pokoj musi zlapac sciane. */
  it("rysowany pokoj lapie naroznik sciany", () => {
    const t = snapDoGeometrii(
      { x: 503, y: 197 },
      { roomShapes: [POKOJ], walls: [SCIANA_ZAMKNIETA] },
      PROMIEN_NAROZNIKA,
      PROMIEN_KRAWEDZI
    )!;
    expect(t.point).toEqual({ x: 500, y: 200 });
    expect(t.zrodlo).toEqual({ kind: "wall", id: "w1" });
  });

  it("przy dwoch celach w zasiegu decyduje ODLEGLOSC, nie rodzaj figury", () => {
    // Sciana dokladnie na krawedzi pokoju, ale jej naroznik jest blizej punktu.
    const przySamymPokoju: Wall = { id: "w4", floor: "f1", points: [{ x: 206, y: 0 }, { x: 206, y: 200 }] };
    const t = snapDoGeometrii(
      { x: 205, y: 100 },
      { roomShapes: [POKOJ], walls: [przySamymPokoju] },
      PROMIEN_NAROZNIKA,
      PROMIEN_KRAWEDZI
    )!;
    expect(t.zrodlo).toEqual({ kind: "wall", id: "w4" });
    expect(t.point).toEqual({ x: 206, y: 100 });
  });
});

describe("promieniePrzyciagania", () => {
  /** Zasieg jest twierdzeniem o BUDYNKU („polowa metra od sciany"), nie o precyzji
   *  myszy — wiec w jednostkach planu musi rosnac, gdy jednostka maleje. */
  it("przelicza metry na jednostki planu wg skali", () => {
    expect(promieniePrzyciagania(0.05)).toEqual({
      naroznik: PROMIEN_NAROZNIKA_M / 0.05,
      krawedz: PROMIEN_KRAWEDZI_M / 0.05,
    });
    expect(promieniePrzyciagania(0.01).krawedz).toBeGreaterThan(promieniePrzyciagania(0.05).krawedz);
  });

  it("bez kalibracji bierze skale rysunku odrecznego", () => {
    expect(promieniePrzyciagania(null)).toEqual(promieniePrzyciagania(0.05));
    expect(promieniePrzyciagania(0)).toEqual(promieniePrzyciagania(0.05));
  });

  it("naroznik ma szerszy zasieg niz krawedz w kazdej skali", () => {
    [0.005, 0.01, 0.05, 0.2].forEach((mpu) => {
      const { naroznik, krawedz } = promieniePrzyciagania(mpu);
      expect(naroznik).toBeGreaterThan(krawedz);
    });
  });
});

/**
 * Wyrównanie wierzchołka do OSI punktów, które już są na rysunku.
 *
 * Przyciąganie do geometrii łapie punkt dopiero wtedy, gdy trafi się prawie w narożnik
 * sąsiada. Rysując trzecią ścianę pokoju człowiek celuje gdzie indziej: chce, żeby
 * wierzchołek stanął W LINII z poprzednim — pionowo albo poziomo — albo w linii
 * z krawędzią pokoju obok. Bez tego wychodzi ukos o kilka centymetrów, którego na oko
 * nie widać, a który zostaje w metrażu i w obrysie.
 *
 * Osie działają OSOBNO dla x i y. Punkt bywa w linii z jednym narożnikiem w pionie,
 * a z zupełnie innym w poziomie — i to jest normalny przypadek przy dostawianiu pokoju
 * do rogu sąsiada.
 */
describe("wyrownajDoOsi", () => {
  const TOL = 4;

  it("bez kandydatów w zasięgu zwraca punkt bez zmian", () => {
    const w = wyrownajDoOsi({ x: 100, y: 100 }, [{ x: 200, y: 200 }], TOL);
    expect(w.punkt).toEqual({ x: 100, y: 100 });
    expect(w.osX).toBeNull();
    expect(w.osY).toBeNull();
  });

  it("dociąga x do osi pionowej wcześniejszego punktu", () => {
    const wczesniejszy = { x: 100, y: 40 };
    const w = wyrownajDoOsi({ x: 103, y: 220 }, [wczesniejszy], TOL);
    expect(w.punkt).toEqual({ x: 100, y: 220 });
    expect(w.osX).toEqual(wczesniejszy);
    expect(w.osY).toBeNull();
  });

  it("dociąga y do osi poziomej, nie ruszając x", () => {
    const w = wyrownajDoOsi({ x: 500, y: 98 }, [{ x: 10, y: 100 }], TOL);
    expect(w.punkt).toEqual({ x: 500, y: 100 });
    expect(w.osY).toEqual({ x: 10, y: 100 });
  });

  /** Sedno: pion z jednego narożnika, poziom z innego — tak wygląda dostawianie pokoju. */
  it("bierze pion i poziom z RÓŻNYCH punktów odniesienia", () => {
    const wPionie = { x: 100, y: 500 };
    const wPoziomie = { x: 900, y: 200 };
    const w = wyrownajDoOsi({ x: 102, y: 198 }, [wPionie, wPoziomie], TOL);
    expect(w.punkt).toEqual({ x: 100, y: 200 });
    expect(w.osX).toEqual(wPionie);
    expect(w.osY).toEqual(wPoziomie);
  });

  it("z kilku kandydatów w zasięgu wybiera NAJBLIŻSZY", () => {
    const w = wyrownajDoOsi({ x: 100, y: 0 }, [{ x: 97, y: 50 }, { x: 101, y: 50 }], TOL);
    expect(w.punkt.x).toBe(101);
  });

  it("poza tolerancją nie rusza współrzędnej", () => {
    const w = wyrownajDoOsi({ x: 100, y: 100 }, [{ x: 95, y: 100 }], TOL);
    expect(w.punkt.x).toBe(100);
    expect(w.osX).toBeNull();
    // y trafione co do jednostki, więc ta oś łapie
    expect(w.osY).toEqual({ x: 95, y: 100 });
  });

  /**
   * Punkt tuż pod kursorem nie jest OSIĄ, tylko tym samym punktem. Gdyby liczył się
   * jak każdy inny, obie osie złapałyby naraz i wynik byłby jego dokładną kopią —
   * czyli odcinek zerowej długości w rysowanej figurze. Złapane przez test rysowania
   * ściany: klik 1,5 jedn. od pierwszego punktu robił z trzeciego wierzchołka duplikat
   * pierwszego, choć wielobok wcale się nie domykał.
   */
  it("kandydat, na którym już siedzimy, nie jest osią", () => {
    const w = wyrownajDoOsi({ x: 101, y: 102 }, [{ x: 100, y: 100 }], TOL);
    expect(w.punkt).toEqual({ x: 101, y: 102 });
    expect(w.osX).toBeNull();
    expect(w.osY).toBeNull();
  });

  it("ten sam punkt oddalony w JEDNEJ osi nadal wyrównuje w drugiej", () => {
    const w = wyrownajDoOsi({ x: 101, y: 300 }, [{ x: 100, y: 100 }], TOL);
    expect(w.punkt).toEqual({ x: 100, y: 300 });
    expect(w.osX).toEqual({ x: 100, y: 100 });
  });

  it("pusta lista kandydatów niczego nie wywraca", () => {
    expect(wyrownajDoOsi({ x: 7, y: 9 }, [], TOL).punkt).toEqual({ x: 7, y: 9 });
  });
});
