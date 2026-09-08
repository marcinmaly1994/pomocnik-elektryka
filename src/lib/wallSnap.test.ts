import { describe, it, expect } from "vitest";
import type { RoomShape, Wall } from "@/types";
import { przyscienny, punktPrzyscienny, snapElementToWall, snapToWall } from "./wallSnap";
import { montazPrzyscienny, zasiegPrzyscienny } from "./glyphs";

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

/**
 * Osadzenie KONKRETNEGO symbolu: element ma stać po stronie pomieszczenia i dotykać
 * ściany, a nie siedzieć na niej środkiem.
 *
 * Przedtem gniazdko wychodziło trzonkiem na zewnątrz budynku, łącznik siedział na
 * murze okrakiem, a plakietka RJ45 była przecięta linią ściany na pół.
 */
describe("snapElementToWall — osadzenie symbolu", () => {
  /** Punkt, którym symbol ma dotknąć ściany: środek plus zasięg w stronę ściany. */
  function czubek(w: { x: number; y: number; rotation: number }, type: Parameters<typeof zasiegPrzyscienny>[0], skala: number) {
    const rad = ((w.rotation - montazPrzyscienny(type)) * Math.PI) / 180;
    return {
      x: w.x + Math.sin(rad) * zasiegPrzyscienny(type) * skala,
      y: w.y - Math.cos(rad) * zasiegPrzyscienny(type) * skala,
    };
  }

  it("trzonek gniazdka ląduje na linii ściany, a symbol zostaje w pomieszczeniu", () => {
    const w = snapElementToWall({ x: 100, y: 6 }, [], [POKOJ], 20, "gniazdko", 1)!;
    // Górna krawędź pokoju to y = 0, wnętrze jest niżej.
    expect(czubek(w, "gniazdko", 1).y).toBeCloseTo(0, 6);
    expect(w.y).toBeCloseTo(zasiegPrzyscienny("gniazdko"), 6);
    expect(w.x).toBeCloseTo(100, 6);
  });

  it("odsunięcie skaluje się razem z symbolem", () => {
    const maly = snapElementToWall({ x: 100, y: 6 }, [], [POKOJ], 20, "gniazdko", 0.7)!;
    const duzy = snapElementToWall({ x: 100, y: 6 }, [], [POKOJ], 20, "gniazdko", 1.4)!;
    expect(duzy.y).toBeCloseTo(2 * maly.y, 6);
  });

  it("działa tak samo na każdej ścianie pokoju", () => {
    const doly = snapElementToWall({ x: 100, y: 194 }, [], [POKOJ], 20, "gniazdko", 1)!;
    const lewa = snapElementToWall({ x: 6, y: 100 }, [], [POKOJ], 20, "gniazdko", 1)!;
    expect(czubek(doly, "gniazdko", 1).y).toBeCloseTo(200, 6);
    expect(czubek(lewa, "gniazdko", 1).x).toBeCloseTo(0, 6);
  });

  it("kinkiet dostaje obrót montażowy — plecami do muru, nie do podłogi", () => {
    const goly = snapToWall({ x: 6, y: 100 }, [], [POKOJ], 20)!;
    const kinkiet = snapElementToWall({ x: 6, y: 100 }, [], [POKOJ], 20, "kinkiet", 1)!;
    expect(kinkiet.rotation).toBeCloseTo((goly.rotation + 90) % 360, 6);
  });

  /**
   * Regres, który wychodzi dopiero przy DRUGIM ruchu: po osadzeniu środek symbolu leży
   * dalej od ściany niż tolerancja, więc przeciągnięcie go wzdłuż tej samej ściany
   * przestawało się przyklejać i po cichu zostawiało element krzywo.
   */
  it("element już osadzony przykleja się ponownie, gdy przesunąć go wzdłuż ściany", () => {
    const pierwsze = snapElementToWall({ x: 100, y: 6 }, [], [POKOJ], 8, "gniazdko", 1)!;
    expect(pierwsze.y).toBeGreaterThan(8); // środek już poza samą tolerancją
    const drugie = snapElementToWall({ x: 140, y: pierwsze.y }, [], [POKOJ], 8, "gniazdko", 1)!;
    expect(drugie.y).toBeCloseTo(pierwsze.y, 6);
    expect(drugie.x).toBeCloseTo(140, 6);
  });

  it("dalej niż tolerancja liczona od krawędzi symbolu — bez przyklejania", () => {
    expect(snapElementToWall({ x: 100, y: 60 }, [], [POKOJ], 8, "gniazdko", 1)).toBeNull();
  });

  /**
   * Plan rysowany samymi ścianami nie ma „wnętrza", więc strona brała się z kolejności
   * normalnych. Odkąd symbol jest odsuwany od ściany, zła strona nie jest już tylko
   * brzydka — wyrzuca element na zewnątrz budynku.
   */
  it("bez pomieszczenia zostaje po tej stronie ściany, z której kliknięto", () => {
    const ponizej = snapElementToWall({ x: 50, y: 6 }, [SCIANA_POZIOMA], [], 20, "gniazdko", 1)!;
    const powyzej = snapElementToWall({ x: 50, y: -6 }, [SCIANA_POZIOMA], [], 20, "gniazdko", 1)!;
    expect(ponizej.y).toBeGreaterThan(0);
    expect(powyzej.y).toBeLessThan(0);
  });
});

/**
 * Punkt styku symbolu ze sciana — operacja ODWROTNA do odsuniecia srodka w
 * `snapElementToWall`. Trasy przewodow dochodza wlasnie tam, bo tam siedzi puszka.
 */
describe("punktPrzyscienny", () => {
  it("po przyklejeniu do sciany wraca DOKLADNIE w punkt na jej linii", () => {
    // Gniazdo klikniete tuz przy gornej scianie pokoju (y = 0) — snap odsuwa jego
    // srodek do wnetrza, a punkt przyscienny ma wrocic na sama linie sciany.
    const przyklejone = snapElementToWall({ x: 100, y: 6 }, [], [POKOJ], 20, "gniazdko", 1)!;
    const styk = punktPrzyscienny({ type: "gniazdko", x: przyklejone.x, y: przyklejone.y, rotation: przyklejone.rotation }, 1)!;
    expect(styk.x).toBeCloseTo(100, 6);
    expect(styk.y).toBeCloseTo(0, 6);
  });

  it("skaluje sie razem z symbolem — suwak rozmiaru nie rozjezdza sie z rysunkiem", () => {
    const bez = punktPrzyscienny({ type: "gniazdko", x: 100, y: 100, rotation: 0 }, 1)!;
    const podwojne = punktPrzyscienny({ type: "gniazdko", x: 100, y: 100, rotation: 0 }, 2)!;
    expect(100 - podwojne.y).toBeCloseTo(2 * (100 - bez.y), 6);
  });

  it("typ NIEprzyscienny (punkt sufitowy) nie ma strony przysciennej", () => {
    expect(punktPrzyscienny({ type: "oswietlenie", x: 100, y: 100, rotation: 0 }, 1)).toBeNull();
  });
});
