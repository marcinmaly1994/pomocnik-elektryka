import { describe, expect, it } from "vitest";
import type { Point, RoomShape, Wall } from "@/types";
import { crossesGeometry, routeAlongWalls, wsunObrys } from "./routing";

function wall(points: Point[]): Wall {
  return { id: Math.random().toString(36).slice(2), floor: "parter", points };
}

function room(points: Point[]): RoomShape {
  return { id: Math.random().toString(36).slice(2), floor: "parter", name: "Pokój", color: "#000", points };
}

/** Długość łamanej — do porównywania z sumą odcinków oczekiwanej trasy. */
function polylineLength(points: Point[]): number {
  let sum = 0;
  for (let i = 0; i < points.length - 1; i++) sum += Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
  return sum;
}

describe("routeAlongWalls", () => {
  it("bez żadnej ściany ani pomieszczenia zwraca null — nie ma po czym routować", () => {
    expect(routeAlongWalls({ x: 0, y: 0 }, { x: 100, y: 100 }, [], [])).toBeNull();
  });

  it("prosta ściana: trasa doskakuje z obu końców i biegnie wzdłuż niej", () => {
    // ściana pozioma y=0, od x=0 do x=100; punkty stoją nad/pod nią
    const w = wall([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
    const from = { x: 10, y: -20 };
    const to = { x: 90, y: 20 };
    const path = routeAlongWalls(from, to, [w], []);
    expect(path).not.toBeNull();
    expect(path![0]).toEqual(from);
    expect(path![path!.length - 1]).toEqual(to);
    // trasa musi przejść PRZEZ ścianę (punkty pośrednie leżą na y=0)
    const onWall = path!.slice(1, -1);
    expect(onWall.length).toBeGreaterThan(0);
    onWall.forEach((p) => expect(p.y).toBeCloseTo(0, 6));
  });

  it("ściana pod kątem prostym (L): trasa idzie przez narożnik, nie po przekątnej", () => {
    // ściana L: (0,0)->(100,0)->(100,100)
    const w = wall([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]);
    const from = { x: 10, y: -10 }; // blisko początku pierwszego odcinka
    const to = { x: 110, y: 90 }; // blisko końca drugiego odcinka
    const path = routeAlongWalls(from, to, [w], []);
    expect(path).not.toBeNull();
    // trasa MUSI odwiedzić okolice narożnika (100,0) — inaczej szłaby po przekątnej
    const nearCorner = path!.some((p) => Math.hypot(p.x - 100, p.y - 0) < 5);
    expect(nearCorner).toBe(true);
  });

  it("dwie ściany, których końce się stykają (w granicy tolerancji), łączą się w JEDNĄ sieć", () => {
    const w1 = wall([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
    // drugi odcinek zaczyna się 3 jedn. od końca pierwszego — w praktyce ten sam róg,
    // narysowany osobnym gestem, więc nie trafił idealnie w ten sam piksel
    const w2 = wall([{ x: 103, y: 0 }, { x: 103, y: 100 }]);
    const from = { x: 10, y: -10 };
    const to = { x: 110, y: 90 };
    const path = routeAlongWalls(from, to, [w1, w2], []);
    expect(path).not.toBeNull();
  });

  it("dwie ściany DALEKO od siebie NIE łączą się — trasa między nimi to null", () => {
    const w1 = wall([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
    const w2 = wall([{ x: 500, y: 500 }, { x: 600, y: 500 }]);
    const from = { x: 10, y: -10 }; // blisko w1
    const to = { x: 550, y: 520 }; // blisko w2, ale w1/w2 się nie stykają
    expect(routeAlongWalls(from, to, [w1, w2], [])).toBeNull();
  });

  it("obrys pomieszczenia jest ZAMKNIĘTY — domykający odcinek ostatni→pierwszy punkt też jest routowalny", () => {
    // kwadratowy pokój 0,0 – 100,100; from/to blisko przeciwległych boków,
    // najkrótsza trasa może iść przez domykającą krawędź (lewy bok, x=0)
    const r = room([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }]);
    const from = { x: -5, y: 10 };
    const to = { x: -5, y: 90 };
    const path = routeAlongWalls(from, to, [], [r]);
    expect(path).not.toBeNull();
    // trasa wzdłuż lewego boku (x≈0) jest krótsza niż dookoła przez pozostałe 3 boki —
    // Dijkstra ma wybrać właśnie ją
    expect(polylineLength(path!)).toBeLessThan(100 * 1.5);
  });

  it("punkt umieszczony DOKŁADNIE na ścianie nie dokłada zbędnego, zerowego odcinka", () => {
    const w = wall([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
    const from = { x: 50, y: 0 }; // leży dokładnie NA ścianie
    const to = { x: 90, y: 20 };
    const path = routeAlongWalls(from, to, [w], []);
    expect(path).not.toBeNull();
    // brak dwóch kolejnych punktów w tym samym miejscu
    for (let i = 0; i < path!.length - 1; i++) {
      expect(Math.hypot(path![i + 1].x - path![i].x, path![i + 1].y - path![i].y)).toBeGreaterThan(0);
    }
  });
});

describe("crossesGeometry", () => {
  it("wykrywa przecięcie ODCINKA z narysowaną ścianą", () => {
    const w = wall([{ x: 50, y: -10 }, { x: 50, y: 10 }]);
    expect(crossesGeometry({ x: 0, y: 0 }, { x: 100, y: 0 }, [w], [])).toBe(true);
  });

  it("odcinek RÓWNOLEGŁY do ściany, który jej nie mija, nie liczy się jako przecięcie", () => {
    const w = wall([{ x: 50, y: -10 }, { x: 50, y: 10 }]);
    expect(crossesGeometry({ x: 0, y: 100 }, { x: 100, y: 100 }, [w], [])).toBe(false);
  });

  it("dotknięcie końca/narożnika (bez wejścia w głąb odcinka) NIE liczy się jako przecięcie", () => {
    // odcinek kończy się DOKŁADNIE na ścianie (typowy `from`/`to` doskoku) —
    // to nie jest przebicie, tylko właściwe dojście do celu
    const w = wall([{ x: 50, y: -10 }, { x: 50, y: 10 }]);
    expect(crossesGeometry({ x: 0, y: 0 }, { x: 50, y: 0 }, [w], [])).toBe(false);
  });

  it("uwzględnia też obrysy pomieszczeń, nie tylko ściany", () => {
    const r = room([{ x: 40, y: -10 }, { x: 60, y: -10 }, { x: 60, y: 10 }, { x: 40, y: 10 }]);
    expect(crossesGeometry({ x: 0, y: 0 }, { x: 100, y: 0 }, [], [r])).toBe(true);
  });
});

/**
 * Trasa biegnie OBOK sciany, nie po jej osi.
 *
 * Wczesniej graf lezal dokladnie na obrysach, wiec przewod dzielil os ze sciana
 * i ginal pod jej grubym pociagnieciem — na rysunku nie bylo widac, ktoredy idzie,
 * a dwie trasy wzdluz tej samej sciany zlewaly sie w jedno.
 */
describe("wsunObrys", () => {
  const kwadrat = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ];

  it("wsuwa prostokat DO SRODKA o zadana odleglosc, rownomiernie", () => {
    const w = wsunObrys(kwadrat, 10);
    expect(w).toEqual([
      { x: 10, y: 10 },
      { x: 90, y: 10 },
      { x: 90, y: 90 },
      { x: 10, y: 90 },
    ]);
  });

  /** Kierunek ustalany doswiadczalnie, wiec kolejnosc punktow nie moze go odwrocic —
   *  blad oznaczalby trasy biegnace NA ZEWNATRZ pomieszczenia. */
  it("obojetne, czy wielobok podano zgodnie z ruchem wskazowek, czy przeciwnie", () => {
    const odwrotny = [...kwadrat].reverse();
    const w = wsunObrys(odwrotny, 10);
    for (const p of w) {
      expect(p.x).toBeGreaterThanOrEqual(10);
      expect(p.x).toBeLessThanOrEqual(90);
      expect(p.y).toBeGreaterThanOrEqual(10);
      expect(p.y).toBeLessThanOrEqual(90);
    }
  });

  /** W waskim pokoju wsuniecie zjadloby cala szerokosc — lepiej trasa po obrysie
   *  niz w poprzek pomieszczenia. */
  it("pomieszczenie ciasniejsze niz wsuniecie zostaje bez zmian", () => {
    const waski = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 8 },
      { x: 0, y: 8 },
    ];
    expect(wsunObrys(waski, 10)).toEqual(waski);
  });

  it("wielobok wydluzony zachowuje ROWNY odstep od kazdej sciany", () => {
    // Przesuwanie wierzcholkow „ku srodkowi" dawaloby tu przy krotszych scianach
    // zupelnie inny odstep niz przy dluzszych — stad przesuwanie KRAWEDZI.
    const w = wsunObrys(
      [
        { x: 0, y: 0 },
        { x: 400, y: 0 },
        { x: 400, y: 60 },
        { x: 0, y: 60 },
      ],
      10
    );
    expect(w).toEqual([
      { x: 10, y: 10 },
      { x: 390, y: 10 },
      { x: 390, y: 50 },
      { x: 10, y: 50 },
    ]);
  });

  it("za malo punktow albo zerowe wsuniecie: bez zmian", () => {
    expect(wsunObrys([{ x: 0, y: 0 }, { x: 10, y: 0 }], 5)).toHaveLength(2);
    expect(wsunObrys(kwadrat, 0)).toEqual(kwadrat);
  });
});

describe("routeAlongWalls — odsuniecie od sciany", () => {
  it("trasa po obrysie pomieszczenia NIE lezy na jego krawedzi", () => {
    const pokoj = room([
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 200 },
      { x: 0, y: 200 },
    ]);
    const trasa = routeAlongWalls({ x: 10, y: 5 }, { x: 190, y: 195 }, [], [pokoj])!;
    expect(trasa).not.toBeNull();
    // Punkty POSREDNIE (bez koncow, ktore siedza na osprzecie) trzymaja sie z dala
    // od krawedzi x=0/200 i y=0/200.
    const posrednie = trasa.slice(1, -1);
    expect(posrednie.length).toBeGreaterThan(0);
    for (const p of posrednie) {
      const doKrawedzi = Math.min(p.x, 200 - p.x, p.y, 200 - p.y);
      expect(doKrawedzi).toBeGreaterThan(1);
    }
  });

  /** Sciana OTWARTA nie ma wnetrza, wiec nie ma jej dokad wsunac — routing po niej
   *  dziala jak dotad i to jest wlasciwe zachowanie, nie przeoczenie. */
  it("po otwartej scianie trasa biegnie jak dotad", () => {
    const s = wall([
      { x: 0, y: 100 },
      { x: 200, y: 100 },
    ]);
    const trasa = routeAlongWalls({ x: 10, y: 90 }, { x: 190, y: 90 }, [s], [])!;
    expect(trasa).not.toBeNull();
    expect(trasa.some((p) => Math.abs(p.y - 100) < 0.01)).toBe(true);
  });
});

/**
 * Zgloszenie uzytkownika: przewod do oprawy dobijal do konca sciany i dopiero tam
 * skrecal. Kandydaci na wejscie w siec byli odsiewani po ODLEGLOSCI WZGLEDNEJ
 * (najwyzej poltora raza dalej niz najblizszy odcinek), wiec oprawa wiszaca blizej
 * jednej sciany niz drugiej tracila te druga z listy — nawet gdy trasa przez nia
 * wychodzila znacznie krotsza. Teraz kryterium jest przynaleznosc do POMIESZCZENIA.
 */
describe("routeAlongWalls — wejscie w siec z wlasnego pomieszczenia", () => {
  const POKOJ = room([
    { x: 0, y: 0 },
    { x: 400, y: 0 },
    { x: 400, y: 300 },
    { x: 0, y: 300 },
  ]);

  it("oprawa schodzi do sciany, przy ktorej cala trasa jest KROTSZA, a nie do najblizszej", () => {
    // Rozdzielnica w lewym dolnym rogu. Oprawa wisi 60 od prawej sciany, ale az 150
    // od dolnej — dawny prog (1,5x) odcinal dolna, choc to wlasnie nia trasa
    // z rozdzielnicy jest o polowe krotsza.
    const trasa = routeAlongWalls({ x: 20, y: 285 }, { x: 340, y: 150 }, [], [POKOJ], { to: true })!;
    expect(trasa).not.toBeNull();
    // Trasa NIE dociera do prawej sciany: zeszlaby tam tylko po to, zeby wrocic.
    const przyPrawej = trasa.filter((p) => p.x > 380);
    expect(przyPrawej).toHaveLength(0);
    // Odgalezienie do oprawy jest PIONOWE — czyli pod katem prostym do dolnej sciany.
    const przedKoncem = trasa[trasa.length - 2];
    expect(przedKoncem.x).toBeCloseTo(340, 6);
  });

  /**
   * Druga strona tego samego rozroznienia — i regresja, ktora sama sie tu pojawila.
   * Gdy KAZDY punkt mogl siegnac dowolnej sciany swojego pokoju, rozdzielnica stojaca
   * przy dolnej scianie laczyla sie wprost z prawa: doskok przez pol pokoju bywa
   * krotszy niz obejscie narozem. Rysunek pokazywal wtedy przewod biegnacy srodkiem
   * podlogi. Osprzet przyscienny wchodzi w mur tam, gdzie stoi.
   */
  it("osprzet PRZYSCIENNY nie doskakuje przez pol pokoju do dalszej sciany", () => {
    // Oba konce przy dolnej scianie, daleko od siebie — bez flagi `swobodne`.
    const trasa = routeAlongWalls({ x: 20, y: 285 }, { x: 380, y: 150 }, [], [POKOJ])!;
    expect(trasa).not.toBeNull();
    // Punkty POSREDNIE trzymaja sie obrysu: zaden nie wypada w srodku pokoju.
    for (const p of trasa.slice(1, -1)) {
      const doKrawedzi = Math.min(p.x, 400 - p.x, p.y, 300 - p.y);
      expect(doKrawedzi).toBeLessThan(15); // przy scianie, a nie w srodku
    }
  });

  /** Kryterium pomieszczenia zastepuje prog odleglosci TYLKO tam, gdzie pomieszczenia
   *  sa. Plan rysowany samymi scianami dziala jak dotad. */
  it("bez obrysow pomieszczen routing po samych scianach nadal dziala", () => {
    const s = wall([
      { x: 0, y: 0 },
      { x: 200, y: 0 },
    ]);
    const trasa = routeAlongWalls({ x: 10, y: 20 }, { x: 190, y: 20 }, [s], []);
    expect(trasa).not.toBeNull();
  });

  /** Doskok nie ma prawa wyjsc poza obrys — inaczej trasa „laczylaby w powietrzu"
   *  dwa niepolaczone ze soba kawalki planu i mimo to wyszla jako routowana. */
  it("punkt w JEDNYM pokoju nie doskakuje do sciany DRUGIEGO", () => {
    const drugi = room([
      { x: 600, y: 0 },
      { x: 800, y: 0 },
      { x: 800, y: 300 },
      { x: 600, y: 300 },
    ]);
    const trasa = routeAlongWalls({ x: 200, y: 150 }, { x: 700, y: 150 }, [], [POKOJ, drugi]);
    expect(trasa).toBeNull(); // dwa rozlaczne kawalki geometrii — zostaje szacunek Manhattan
  });
});
