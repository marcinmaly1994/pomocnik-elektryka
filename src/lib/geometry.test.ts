import { describe, it, expect } from "vitest";
import { snap, clampNum, pointInPolygon, polygonArea, polygonAreaM2, nearestPointOnPolyline, distanceToRect, rectangleSizeM, punktWewnatrzWielokata, przesunNaDlugosc, prostokatOdKotwicy, obrysyNachodza } from "./geometry";

describe("snap", () => {
  it("zaokrągla do siatki 20", () => {
    expect(snap(23)).toBe(20);
    expect(snap(31)).toBe(40);
  });

  it("obsługuje inną wielkość siatki", () => {
    expect(snap(12, 10)).toBe(10);
    expect(snap(16, 10)).toBe(20);
  });
});

describe("clampNum", () => {
  it("ogranicza do zakresu", () => {
    expect(clampNum(-5, 0, 1000)).toBe(0);
    expect(clampNum(2000, 0, 1000)).toBe(1000);
    expect(clampNum(500, 0, 1000)).toBe(500);
  });
});

describe("pointInPolygon", () => {
  const square = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ];

  it("wykrywa punkt wewnątrz", () => {
    expect(pointInPolygon({ x: 50, y: 50 }, square)).toBe(true);
  });

  it("wykrywa punkt na zewnątrz", () => {
    expect(pointInPolygon({ x: 150, y: 50 }, square)).toBe(false);
  });
});

describe("polygonArea / polygonAreaM2", () => {
  const square = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ];

  it("liczy pole prostokąta", () => {
    expect(polygonArea(square)).toBe(10000);
  });

  it("kierunek obrysu nie wpływa na wynik", () => {
    expect(polygonArea([...square].reverse())).toBe(10000);
  });

  it("figura zdegenerowana ma pole zero, a nie NaN", () => {
    expect(polygonArea([])).toBe(0);
    expect(polygonArea([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBe(0);
  });

  it("liczy pole trójkąta", () => {
    expect(polygonArea([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }])).toBe(50);
  });

  it("skala przelicza się KWADRATOWO, nie liniowo", () => {
    // 100×100 jedn. przy 0,05 m/jedn. to 5×5 m = 25 m², a nie 500 m²
    expect(polygonAreaM2(square, 0.05)).toBeCloseTo(25, 6);
  });

  it("bez kalibracji nie zgaduje metrów", () => {
    expect(polygonAreaM2(square, null)).toBeNull();
    expect(polygonAreaM2(square, 0)).toBeNull();
  });
});

describe("nearestPointOnPolyline", () => {
  // pozioma ściana od (0,0) do (100,0)
  const wall = [{ x: 0, y: 0 }, { x: 100, y: 0 }];

  it("rzutuje punkt prostopadle na segment", () => {
    const r = nearestPointOnPolyline({ x: 40, y: 25 }, wall);
    expect(r!.point).toEqual({ x: 40, y: 0 });
    expect(r!.angle).toBeCloseTo(0, 6);
  });

  it("przycina do końca segmentu, gdy rzut wypada poza nim", () => {
    expect(nearestPointOnPolyline({ x: -30, y: 10 }, wall)!.point).toEqual({ x: 0, y: 0 });
    expect(nearestPointOnPolyline({ x: 200, y: -10 }, wall)!.point).toEqual({ x: 100, y: 0 });
  });

  it("wybiera NAJBLIŻSZY z kilku segmentów łamanej", () => {
    // łamana w kształcie L: (0,0)→(100,0)→(100,100)
    const bent = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];
    const r = nearestPointOnPolyline({ x: 90, y: 40 }, bent);
    expect(r!.point).toEqual({ x: 100, y: 40 });
    expect(r!.angle).toBeCloseTo(Math.PI / 2, 6); // drugi segment idzie w dół (+y)
  });

  it("kąt segmentu pionowego to ±90°", () => {
    const vertical = [{ x: 0, y: 0 }, { x: 0, y: 50 }];
    expect(nearestPointOnPolyline({ x: 10, y: 25 }, vertical)!.angle).toBeCloseTo(Math.PI / 2, 6);
  });

  it("łamana bez segmentów (0 lub 1 punkt) zwraca null", () => {
    expect(nearestPointOnPolyline({ x: 0, y: 0 }, [])).toBeNull();
    expect(nearestPointOnPolyline({ x: 0, y: 0 }, [{ x: 5, y: 5 }])).toBeNull();
  });
});

describe("distanceToRect", () => {
  // Prostokąt 4 × 2 wyśrodkowany w (10, 10): boki od 8 do 12 w X i od 9 do 11 w Y.
  const R = { cx: 10, cy: 10, w: 4, h: 2 };
  const d = (x: number, y: number, rot = 0) => distanceToRect({ x, y }, R.cx, R.cy, R.w, R.h, rot);

  it("punkt wewnątrz ma odległość zero", () => {
    expect(d(10, 10)).toBe(0);
    expect(d(11.9, 10.9)).toBe(0);
  });

  it("na krawędzi też zero", () => {
    expect(d(12, 10)).toBe(0);
  });

  it("mierzy od KRAWĘDZI, nie od środka", () => {
    // 3 jedn. od środka wzdłuż dłuższego boku to 1 jedn. od krawędzi
    expect(d(13, 10)).toBeCloseTo(1, 10);
    expect(d(10, 12)).toBeCloseTo(1, 10);
  });

  it("przy narożniku liczy po przekątnej", () => {
    // (15, 14) → 3 w prawo i 3 w dół od narożnika (12, 11)
    expect(d(15, 14)).toBeCloseTo(Math.hypot(3, 3), 10);
  });

  it("obrót zamienia osie prostokąta", () => {
    // Prostokąt 4 × 2: bez obrotu dłuższy bok (połowa 2) leży poziomo, po obrocie
    // o 90° pionowo. Ta sama para punktów, 1,5 jedn. od środka, zamienia się więc
    // rolami: co było wewnątrz, wychodzi za krawędź i odwrotnie.
    expect(d(11.5, 10, 0)).toBe(0); // wzdłuż dłuższego boku
    expect(d(10, 11.5, 0)).toBeCloseTo(0.5, 10); // wzdłuż krótszego

    expect(d(10, 11.5, 90)).toBe(0); // teraz dłuższy bok jest pionowy
    expect(d(11.5, 10, 90)).toBeCloseTo(0.5, 10);
  });

  it("obrót o 180° nic nie zmienia dla prostokąta", () => {
    expect(d(13, 10, 180)).toBeCloseTo(d(13, 10, 0), 10);
  });
});

describe("rectangleSizeM", () => {
  const prostokat = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 60 },
    { x: 0, y: 60 },
  ];

  it("przelicza boki prostokąta na metry", () => {
    expect(rectangleSizeM(prostokat, 0.05)).toEqual({ w: 5, h: 3 });
  });

  it("kolejność wierzchołków nie ma znaczenia", () => {
    const odwrotnie = [...prostokat].reverse();
    expect(rectangleSizeM(odwrotnie, 0.05)).toEqual({ w: 5, h: 3 });
  });

  it("kształt inny niż prostokąt nie dostaje wymiarów — podpis, który kłamie, jest gorszy od braku", () => {
    const litera_L = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 30 },
      { x: 50, y: 30 },
      { x: 50, y: 60 },
      { x: 0, y: 60 },
    ];
    expect(rectangleSizeM(litera_L, 0.05)).toBeNull();
  });

  it("czworokąt nieprostokątny (trapez) też odpada", () => {
    const trapez = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 80, y: 60 },
      { x: 20, y: 60 },
    ];
    expect(rectangleSizeM(trapez, 0.05)).toBeNull();
  });

  it("bez skali nie ma czego przeliczać", () => {
    expect(rectangleSizeM(prostokat, null)).toBeNull();
    expect(rectangleSizeM(prostokat, 0)).toBeNull();
  });
});

describe("punktWewnatrzWielokata", () => {
  const PROSTOKAT = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 60 },
    { x: 0, y: 60 },
  ];

  /** Obrys w ksztalcie U: wciecie od gory, miedzy x=30 a x=70, ponizej y=40. */
  const LITERA_U = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 70, y: 100 },
    { x: 70, y: 40 },
    { x: 30, y: 40 },
    { x: 30, y: 100 },
    { x: 0, y: 100 },
  ];

  /** Obrys w ksztalcie L. */
  const LITERA_L = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 50 },
    { x: 50, y: 50 },
    { x: 50, y: 100 },
    { x: 0, y: 100 },
  ];

  it("dla prostokata zwraca punkt w srodku", () => {
    const p = punktWewnatrzWielokata(PROSTOKAT)!;
    expect(pointInPolygon(p, PROSTOKAT)).toBe(true);
  });

  /**
   * Sedno: srednia wierzcholkow litery U wypada w jej WCIECIU, czyli poza figura.
   * Test najpierw to pokazuje, potem sprawdza, ze funkcja tego bledu nie robi.
   */
  it("dla figury wklesłej zwraca punkt NAPRAWDE wewnatrz — srednia wierzcholkow by nie wystarczyla", () => {
    const srednia = {
      x: LITERA_U.reduce((s, p) => s + p.x, 0) / LITERA_U.length,
      y: LITERA_U.reduce((s, p) => s + p.y, 0) / LITERA_U.length,
    };
    expect(pointInPolygon(srednia, LITERA_U)).toBe(false);

    const p = punktWewnatrzWielokata(LITERA_U)!;
    expect(pointInPolygon(p, LITERA_U)).toBe(true);
  });

  it("radzi sobie tez z litera L", () => {
    const p = punktWewnatrzWielokata(LITERA_L)!;
    expect(pointInPolygon(p, LITERA_L)).toBe(true);
  });

  it("trojkat tez ma wnetrze", () => {
    const trojkat = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 80 }];
    expect(pointInPolygon(punktWewnatrzWielokata(trojkat)!, trojkat)).toBe(true);
  });

  it("figura bez wnetrza zwraca null", () => {
    expect(punktWewnatrzWielokata([])).toBeNull();
    expect(punktWewnatrzWielokata([{ x: 0, y: 0 }, { x: 10, y: 10 }])).toBeNull();
    // Wszystkie punkty na jednej poziomej linii — zerowa wysokosc.
    expect(punktWewnatrzWielokata([{ x: 0, y: 5 }, { x: 10, y: 5 }, { x: 20, y: 5 }])).toBeNull();
    // Wspolliniowe pionowo — sa przeciecia, ale kazdy odcinek ma zerowa szerokosc.
    expect(punktWewnatrzWielokata([{ x: 5, y: 0 }, { x: 5, y: 10 }, { x: 5, y: 20 }])).toBeNull();
  });

  /** Obrys narysowany „w lewo" ma ujemna orientacje — wnetrze jest to samo. */
  it("kierunek obrysu nie ma znaczenia", () => {
    const odwrotny = [...LITERA_U].reverse();
    expect(pointInPolygon(punktWewnatrzWielokata(odwrotny)!, odwrotny)).toBe(true);
  });
});

/**
 * Powierzchnia a wymiary — dwie miary, które się UZUPEŁNIAJĄ, i to jest powód, dla
 * którego mają na rzucie osobne przełączniki.
 *
 * `rectangleSizeM` odpowiada „a × b" tylko dla prostokąta i milczy dla każdego innego
 * kształtu, bo „a × b" opisywałoby wtedy prostokąt, którego na rysunku nie ma.
 * `polygonAreaM2` liczy wzorem geodety z samego obrysu, więc odpowiada ZAWSZE —
 * dokładnie tam, gdzie tamta milczy.
 */
describe("powierzchnia dla kształtów innych niż prostokąt", () => {
  /** 1 jedn. = 0,5 m, więc pole w m² to pole w jedn.² podzielone przez cztery. */
  const MPU = 0.5;

  it("trójkąt prostokątny: połowa prostokąta opisanego", () => {
    const trojkat = [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 0, y: 6 }];
    expect(polygonAreaM2(trojkat, MPU)).toBeCloseTo(6, 10); // 8·6/2 = 24 jedn.² → 6 m²
    expect(rectangleSizeM(trojkat, MPU)).toBeNull();
  });

  it("trapez: średnia podstaw razy wysokość", () => {
    // Podstawy 10 i 6, wysokość 4 → (10+6)/2 · 4 = 32 jedn.² → 8 m²
    const trapez = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 8, y: 4 }, { x: 2, y: 4 }];
    expect(polygonAreaM2(trapez, MPU)).toBeCloseTo(8, 10);
    expect(rectangleSizeM(trapez, MPU)).toBeNull();
  });

  it("litera L: pole wklęsłego obrysu, nie prostokąta opisanego", () => {
    // Kwadrat 10×10 z wyciętym narożnikiem 4×4 → 100 − 16 = 84 jedn.² → 21 m².
    // Prostokąt opisany dałby 25 m², czyli o jedną piątą za dużo.
    const litera = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 6 },
      { x: 6, y: 6 },
      { x: 6, y: 10 },
      { x: 0, y: 10 },
    ];
    expect(polygonAreaM2(litera, MPU)).toBeCloseTo(21, 10);
    expect(rectangleSizeM(litera, MPU)).toBeNull();
  });

  it("kolejność wierzchołków nie zmienia pola", () => {
    // Obrys rysowany „w drugą stronę" to ten sam pokój — wzór geodety daje wtedy
    // wynik ujemny i dopiero wartość bezwzględna czyni z niego powierzchnię.
    const trapez = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 8, y: 4 }, { x: 2, y: 4 }];
    expect(polygonAreaM2([...trapez].reverse(), MPU)).toBeCloseTo(polygonAreaM2(trapez, MPU)!, 10);
  });
});

/**
 * Korekta długości ostatniego rysowanego odcinka.
 *
 * Interfejs pozwala klikać z grubsza, a potem wpisać liczbę — i to tutaj siedzi
 * cała matematyka tej operacji, razem z przypadkami, których interfejsem nie da się
 * wywołać: dwa punkty w tym samym miejscu (kierunek nieokreślony) albo długość, która
 * przyszła z pola tekstowego jako `NaN`.
 */
describe("przesunNaDlugosc", () => {
  it("skraca odcinek, zachowując kierunek", () => {
    // Odcinek poziomy o długości 10 skrócony do 4 — koniec zostaje na tej samej osi.
    expect(przesunNaDlugosc({ x: 0, y: 0 }, { x: 10, y: 0 }, 4)).toEqual({ x: 4, y: 0 });
  });

  it("wydłuża odcinek, zachowując kierunek", () => {
    expect(przesunNaDlugosc({ x: 0, y: 0 }, { x: 0, y: 3 }, 12)).toEqual({ x: 0, y: 12 });
  });

  it("zachowuje kąt odcinka ukośnego", () => {
    // 3-4-5: kierunek (0.6, 0.8), więc długość 10 daje (6, 8).
    const wynik = przesunNaDlugosc({ x: 0, y: 0 }, { x: 3, y: 4 }, 10);
    expect(wynik.x).toBeCloseTo(6);
    expect(wynik.y).toBeCloseTo(8);
  });

  it("liczy od punktu POCZĄTKOWEGO, nie od środka układu", () => {
    const wynik = przesunNaDlugosc({ x: 100, y: 50 }, { x: 110, y: 50 }, 2);
    expect(wynik).toEqual({ x: 102, y: 50 });
  });

  it("odcinek zerowy zostaje bez zmian, zamiast dzielić przez zero", () => {
    // Kierunku nie ma z czego wyznaczyć. Zwrócenie NaN rozjechałoby cały rysunek,
    // a wyrzucenie wyjątku wywróciłoby edytor przy podwójnym kliknięciu w to samo miejsce.
    const p = { x: 7, y: 7 };
    expect(przesunNaDlugosc(p, { x: 7, y: 7 }, 5)).toEqual(p);
  });

  it("długość nie-dodatnia albo nieliczbowa zostawia punkt bez zmian", () => {
    const od = { x: 0, y: 0 };
    const doP = { x: 10, y: 0 };
    expect(przesunNaDlugosc(od, doP, 0)).toEqual(doP);
    expect(przesunNaDlugosc(od, doP, -3)).toEqual(doP);
    expect(przesunNaDlugosc(od, doP, Number.NaN)).toEqual(doP);
    expect(przesunNaDlugosc(od, doP, Number.POSITIVE_INFINITY)).toEqual(doP);
  });
});

/**
 * Prostokątne pomieszczenie z podanych wymiarów.
 *
 * Kotwicę stawia użytkownik kliknięciem, wymiary wpisuje — a ta funkcja rozstrzyga,
 * W KTÓRĄ STRONĘ prostokąt się rozwinie, żeby zmieścić się w planie.
 */
describe("prostokatOdKotwicy", () => {
  const plan = { w: 1000, h: 800 };

  it("rozwija się w prawo i w dół, gdy jest miejsce", () => {
    const pkt = prostokatOdKotwicy({ x: 100, y: 100 }, 200, 150, plan)!;
    expect(pkt).toEqual([
      { x: 100, y: 100 },
      { x: 300, y: 100 },
      { x: 300, y: 250 },
      { x: 100, y: 250 },
    ]);
  });

  it("odbija się w lewo, gdy przy prawej krawędzi brakuje miejsca", () => {
    const pkt = prostokatOdKotwicy({ x: 950, y: 100 }, 200, 150, plan)!;
    const xs = pkt.map((p) => p.x);
    expect(Math.min(...xs)).toBe(750);
    expect(Math.max(...xs)).toBe(950);
    // Oś pionowa nietknięta — odbicie dotyczy KAŻDEJ OSI OSOBNO.
    expect(Math.min(...pkt.map((p) => p.y))).toBe(100);
  });

  it("odbija się w górę, gdy przy dolnej krawędzi brakuje miejsca", () => {
    const pkt = prostokatOdKotwicy({ x: 100, y: 780 }, 200, 150, plan)!;
    const ys = pkt.map((p) => p.y);
    expect(Math.min(...ys)).toBe(630);
    expect(Math.max(...ys)).toBe(780);
    expect(Math.min(...pkt.map((p) => p.x))).toBe(100);
  });

  it("odbija się w obu osiach naraz w rogu planu", () => {
    const pkt = prostokatOdKotwicy({ x: 990, y: 790 }, 200, 150, plan)!;
    expect(Math.min(...pkt.map((p) => p.x))).toBe(790);
    expect(Math.min(...pkt.map((p) => p.y))).toBe(640);
  });

  it("prostokąt większy od planu powstaje mimo to, w prawo i w dół", () => {
    // Użytkownik poprosił o taki wymiar. To nie jest moment na poprawianie go bez
    // pytania — plan da się powiększyć, a cicho przycięty pokój kłamałby o metrażu.
    const pkt = prostokatOdKotwicy({ x: 100, y: 100 }, 5000, 4000, plan)!;
    expect(Math.max(...pkt.map((p) => p.x))).toBe(5100);
    expect(Math.max(...pkt.map((p) => p.y))).toBe(4100);
  });

  it("wymiar niedodatni albo nieliczbowy nie tworzy pomieszczenia", () => {
    const k = { x: 100, y: 100 };
    expect(prostokatOdKotwicy(k, 0, 150, plan)).toBeNull();
    expect(prostokatOdKotwicy(k, 200, -5, plan)).toBeNull();
    expect(prostokatOdKotwicy(k, Number.NaN, 150, plan)).toBeNull();
    expect(prostokatOdKotwicy(k, 200, Number.POSITIVE_INFINITY, plan)).toBeNull();
  });
});

/**
 * Czy dwa obrysy pomieszczeń zachodzą na siebie (audyt 5.11.2026, B8). Wspólna ściana
 * sąsiednich pokoi to NIE jest nakładanie — tak rysuje się każde mieszkanie.
 */
describe("obrysyNachodza", () => {
  const pr = (x0: number, y0: number, x1: number, y1: number) => [
    { x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 },
  ];

  it("sąsiedzi ze wspólną ścianą — nie", () => {
    expect(obrysyNachodza(pr(0, 0, 100, 100), pr(100, 0, 200, 100))).toBe(false);
  });

  it("sąsiad dotykający tylko narożnikiem albo fragmentem ściany — nie", () => {
    expect(obrysyNachodza(pr(0, 0, 100, 100), pr(100, 100, 200, 200))).toBe(false);
    expect(obrysyNachodza(pr(0, 0, 100, 100), pr(100, 40, 200, 60))).toBe(false);
  });

  it("rozłączne — nie", () => {
    expect(obrysyNachodza(pr(0, 0, 100, 100), pr(300, 0, 400, 100))).toBe(false);
  });

  it("częściowe zachodzenie — tak", () => {
    expect(obrysyNachodza(pr(0, 0, 100, 100), pr(60, 30, 160, 130))).toBe(true);
  });

  it("krzyż (żaden narożnik w środku drugiego) — tak", () => {
    expect(obrysyNachodza(pr(0, 40, 200, 60), pr(90, 0, 110, 100))).toBe(true);
  });

  it("jeden w środku drugiego — tak, w obie strony", () => {
    expect(obrysyNachodza(pr(0, 0, 200, 200), pr(50, 50, 80, 80))).toBe(true);
    expect(obrysyNachodza(pr(50, 50, 80, 80), pr(0, 0, 200, 200))).toBe(true);
  });

  it("połowa pokoju obrysowana drugi raz (wspólne narożniki i ściany) — tak", () => {
    expect(obrysyNachodza(pr(0, 0, 200, 100), pr(0, 0, 100, 100))).toBe(true);
  });

  it("ten sam obrys dwa razy — tak", () => {
    expect(obrysyNachodza(pr(0, 0, 100, 100), pr(0, 0, 100, 100))).toBe(true);
  });

  it("pasy na tych samych liniach zachodzące bokiem — tak", () => {
    expect(obrysyNachodza(pr(0, 0, 200, 200), pr(150, 0, 300, 200))).toBe(true);
  });

  it("zachodzenie o włos (mniej niż tolerancja) — nie, to szum przyciągania", () => {
    expect(obrysyNachodza(pr(0, 0, 100, 100), pr(99.8, 0, 200, 100))).toBe(false);
  });
});
