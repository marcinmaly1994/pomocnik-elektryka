import { describe, it, expect } from "vitest";
import type { RoomShape, Wall } from "@/types";
import { przyscienny, snapToWall } from "./wallSnap";

/** Pokoj 200 x 200 z lewym gornym rogiem w (0,0); srodek w (100,100). */
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

/** Pozioma sciana wzdluz y = 0. */
const SCIANA_POZIOMA: Wall = { id: "w1", floor: "f1", thickness: 5, points: [{ x: 0, y: 0 }, { x: 200, y: 0 }] };

describe("przyscienny", () => {
  it("osprzet montowany w scianie owszem", () => {
    expect(przyscienny("gniazdko")).toBe(true);
    expect(przyscienny("wlacznik")).toBe(true);
    expect(przyscienny("kinkiet")).toBe(true);
  });

  it("punkt sufitowy i czujnik dymu NIE — wisza na srodku pomieszczenia", () => {
    expect(przyscienny("oswietlenie")).toBe(false);
    expect(przyscienny("czujnikDymu")).toBe(false);
  });

  it("przybory sanitarne NIE — ich pozycje ustawia wyposazenie, nie linia sciany", () => {
    expect(przyscienny("wanna")).toBe(false);
    expect(przyscienny("umywalka")).toBe(false);
  });
});

describe("snapToWall — przyklejanie", () => {
  it("punkt blisko sciany laduje DOKLADNIE na niej", () => {
    const w = snapToWall({ x: 50, y: 6 }, [SCIANA_POZIOMA], [], 20)!;
    expect(w.x).toBeCloseTo(50, 6);
    expect(w.y).toBeCloseTo(0, 6);
  });

  it("punkt dalej niz tolerancja zostaje tam, gdzie go postawiono", () => {
    expect(snapToWall({ x: 50, y: 60 }, [SCIANA_POZIOMA], [], 20)).toBeNull();
  });

  it("bez zadnej geometrii nie ma do czego przykleic", () => {
    expect(snapToWall({ x: 50, y: 6 }, [], [], 20)).toBeNull();
  });

  it("wybiera BLIZSZA ze scian, nie pierwsza z listy", () => {
    const daleka: Wall = { id: "w2", floor: "f1", thickness: 5, points: [{ x: 0, y: 100 }, { x: 200, y: 100 }] };
    // Punkt (50, 92) jest 8 od dalekiej i 92 od poziomej — ma wygrac ta blizsza.
    const w = snapToWall({ x: 50, y: 92 }, [SCIANA_POZIOMA, daleka], [], 20)!;
    expect(w.y).toBeCloseTo(100, 6);
  });

  it("krawedz pomieszczenia dziala tak samo jak sciana", () => {
    // Plan narysowany samymi obrysami pokoi jest w tej aplikacji pelnoprawny.
    const w = snapToWall({ x: 50, y: 6 }, [], [POKOJ], 20)!;
    expect(w.y).toBeCloseTo(0, 6);
  });
});

describe("snapToWall — obrot", () => {
  /** Kierunek trzonka symbolu przy danym obrocie: przy 0 stopni wskazuje (0,-1). */
  function trzonek(rotationDeg: number) {
    const t = (rotationDeg * Math.PI) / 180;
    return { x: Math.sin(t), y: -Math.cos(t) };
  }

  it("przy scianie GORNEJ trzonek patrzy w gore, poza pomieszczenie", () => {
    const w = snapToWall({ x: 100, y: 6 }, [], [POKOJ], 20)!;
    const t = trzonek(w.rotation);
    expect(t.y).toBeLessThan(-0.9); // prawie dokladnie (0,-1)
    expect(Math.abs(t.x)).toBeLessThan(0.1);
  });

  it("przy scianie DOLNEJ trzonek patrzy w dol — strona zalezy od wnetrza pokoju", () => {
    const w = snapToWall({ x: 100, y: 194 }, [], [POKOJ], 20)!;
    expect(trzonek(w.rotation).y).toBeGreaterThan(0.9);
  });

  it("przy scianie LEWEJ trzonek patrzy w lewo", () => {
    const w = snapToWall({ x: 6, y: 100 }, [], [POKOJ], 20)!;
    expect(trzonek(w.rotation).x).toBeLessThan(-0.9);
  });

  it("przy scianie PRAWEJ trzonek patrzy w prawo", () => {
    const w = snapToWall({ x: 194, y: 100 }, [], [POKOJ], 20)!;
    expect(trzonek(w.rotation).x).toBeGreaterThan(0.9);
  });

  it("symbol jest ZAWSZE prostopadly do sciany, takze skosnej", () => {
    const skos: Wall = { id: "w3", floor: "f1", thickness: 5, points: [{ x: 0, y: 0 }, { x: 100, y: 100 }] };
    const w = snapToWall({ x: 52, y: 48 }, [skos], [], 20)!;
    // Sciana pod 45 stopni, wiec trzonek ma byc pod 135 albo -45 — w obu przypadkach
    // iloczyn skalarny z kierunkiem sciany (1,1)/sqrt(2) jest zerowy.
    const t = trzonek(w.rotation);
    const kierunekSciany = { x: Math.SQRT1_2, y: Math.SQRT1_2 };
    expect(Math.abs(t.x * kierunekSciany.x + t.y * kierunekSciany.y)).toBeLessThan(1e-6);
  });

  it("bez pomieszczenia nadal obraca prostopadle — po prostu bez wyboru strony", () => {
    const w = snapToWall({ x: 50, y: 6 }, [SCIANA_POZIOMA], [], 20)!;
    const t = trzonek(w.rotation);
    expect(Math.abs(t.x)).toBeLessThan(1e-6); // pionowo, czyli prostopadle do poziomej sciany
  });
});

describe("snapToWall — klik tuz ZA linia sciany", () => {
  function trzonek(rotationDeg: number) {
    const t = (rotationDeg * Math.PI) / 180;
    return { x: Math.sin(t), y: -Math.cos(t) };
  }

  /**
   * Celujac w sciane bardzo latwo przestrzelic o kilka jednostek na ZEWNATRZ obrysu.
   * Punkt nie lezy wtedy w zadnym pomieszczeniu, wiec bez wskazania pokoju przez
   * dopasowana krawedz trzonek szedl w strone wybrana na chybil trafil — w polowie
   * przypadkow w glab pomieszczenia.
   */
  it("trzonek nadal ucieka od wnetrza, mimo ze punkt jest poza obrysem", () => {
    const w = snapToWall({ x: 100, y: -5 }, [], [POKOJ], 20)!;
    expect(w.y).toBeCloseTo(0, 6);
    expect(trzonek(w.rotation).y).toBeLessThan(-0.9); // w gore, poza pokoj
  });

  it("to samo przy dolnej krawedzi", () => {
    const w = snapToWall({ x: 100, y: 205 }, [], [POKOJ], 20)!;
    expect(trzonek(w.rotation).y).toBeGreaterThan(0.9);
  });

  it("i przy lewej", () => {
    const w = snapToWall({ x: -5, y: 100 }, [], [POKOJ], 20)!;
    expect(trzonek(w.rotation).x).toBeLessThan(-0.9);
  });

  it("klik z zewnatrz daje ten sam obrot co klik z wewnatrz tej samej sciany", () => {
    const zZewnatrz = snapToWall({ x: 100, y: -5 }, [], [POKOJ], 20)!;
    const zWewnatrz = snapToWall({ x: 100, y: 5 }, [], [POKOJ], 20)!;
    expect(zZewnatrz.rotation).toBeCloseTo(zWewnatrz.rotation, 6);
  });
});
