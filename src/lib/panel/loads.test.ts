import { describe, expect, it } from "vitest";
import type { Circuit, ElementType, InstallationElement } from "@/types";
import { applyRouteOverrides, buildCableRoutes, circuitDemand, estimateRoutes, estimateRoutesByFloor, findPanel, findPanels, kindForElements, panelDlaKondygnacji, spreadOverlappingRoutes, zakonczSkosem } from "./loads";

function el(type: ElementType, over: Partial<InstallationElement> = {}): InstallationElement {
  return {
    id: Math.random().toString(36).slice(2),
    type,
    x: 0,
    y: 0,
    room: "Salon",
    floor: "parter",
    dedicated: false,
    note: "",
    gangs: 1,
    ...over,
  };
}

describe("circuitDemand", () => {
  it("sumuje moce typowe i mnoży przez współczynnik jednoczesności", () => {
    // 4 punkty sufitowe × 60 W × ks 1,0 = 240 W
    const d = circuitDemand([el("oswietlenie"), el("oswietlenie"), el("oswietlenie"), el("oswietlenie")], "oswietlenie");
    expect(d.installedW).toBe(240);
    expect(d.powerW).toBe(240);
  });

  it("gniazdo wielokrotne liczy się tyle razy, ile ma gniazd", () => {
    const d = circuitDemand([el("gniazdko", { gangs: 3 })], "gniazda");
    expect(d.installedW).toBe(900); // 3 × 300 W
  });

  it("obwód gniazdowy ma podłogę mocy — jedno gniazdo nie daje 120 W", () => {
    // 1 × 300 W × 0,4 = 120 W, ale obwód wymiaruje się na minimum 1500 W
    const d = circuitDemand([el("gniazdko")], "gniazda");
    expect(d.installedW).toBe(300);
    expect(d.powerW).toBe(1500);
  });

  it("powyżej podłogi działa już sam współczynnik jednoczesności", () => {
    // 20 gniazd × 300 W = 6000 W × 0,4 = 2400 W > 1500 W
    const d = circuitDemand(
      Array.from({ length: 20 }, () => el("gniazdko")),
      "gniazda"
    );
    expect(d.powerW).toBeCloseTo(2400, 5);
  });

  it("elementy bez mocy typowej (łączniki) są liczone osobno, nie jako 0 W po cichu", () => {
    const d = circuitDemand([el("oswietlenie"), el("wlacznik"), el("wlacznik")], "oswietlenie");
    expect(d.installedW).toBe(60);
    expect(d.skipped).toBe(2);
  });
});

describe("estimateRoutes", () => {
  const panel = { x: 0, y: 0 };

  /** Pion + zapas dla gniazda na 0,3 m przy rozdzielnicy na 1,5 m i kondygnacji 2,8 m:
   *  podejście (2,8 − 1,5) + zejście (2,8 − 0,3) + zapas 1,5 = 5,3 m. */
  const NADDATEK_GNIAZDO = 5.3;
  /** Sam zapas montazowy w puszce — tyle dokłada kolejne gniazdo na tej samej
   *  wysokosci, bo miedzy puszkami przewod nie wraca pod strop. */
  const ZAPAS = 1.5;

  it("liczy trasę po obrysie (Manhattan), nie po przekątnej", () => {
    // punkt (30,40) przy skali 0,1 m/jedn.: (30+40)·0,1 = 7 m + naddatek pionowy
    // po przekątnej byłoby 50·0,1 = 5 m — zaniżenie o 40%
    const r = estimateRoutes(panel, [el("gniazdko", { x: 30, y: 40 })], 0.1);
    expect(r!.worstCaseM).toBeCloseTo(7 + NADDATEK_GNIAZDO, 1);
  });

  it("o spadku napięcia decyduje punkt najdalszy, a nie suma tras", () => {
    const r = estimateRoutes(
      panel,
      [el("gniazdko", { x: 10, y: 0 }), el("gniazdko", { x: 100, y: 0 })],
      0.1
    );
    // Bieg poziomy łańcucha: 1 m do pierwszego gniazda + 9 m do drugiego = 10 m,
    // plus JEDNO zejście (do punktu najdalszego).
    expect(r!.worstCaseM).toBeCloseTo(10 + NADDATEK_GNIAZDO, 1);
    // Materiału więcej: każda puszka ma własne zejście i zapas.
    // Drugi odcinek idzie z puszki do puszki na tej samej wysokosci: sam bieg
    // poziomy plus zapas montazowy, bez wracania pod strop.
    expect(r!.totalM).toBeCloseTo(1 + NADDATEK_GNIAZDO + 9 + ZAPAS, 1);
    expect(r!.totalM).toBeGreaterThan(r!.worstCaseM);
  });

  /**
   * Przypadek ze zgloszenia: dwa gniazda obok siebie, daleko od rozdzielnicy.
   * Gwiazda liczyla odcinek do pokoju DWA RAZY — po razie na gniazdo. Lancuch liczy
   * go raz i dokłada tylko przeskok miedzy puszkami, bo to jeden kabel wchodzacy po
   * drodze do obu.
   */
  it("odcinek do pokoju liczy sie RAZ, a nie po razie na kazde gniazdo", () => {
    const dwa = estimateRoutes(
      panel,
      [el("gniazdko", { x: 100, y: 0 }), el("gniazdko", { x: 110, y: 0 })],
      0.1
    )!;
    const jedno = estimateRoutes(panel, [el("gniazdko", { x: 100, y: 0 })], 0.1)!;

    // Drugie gniazdo dokłada tylko metr przeskoku + własne zejście i zapas...
    expect(dwa.totalM).toBeCloseTo(jedno.totalM + 1 + ZAPAS, 1);
    // ...a nie cały bieg od rozdzielnicy jeszcze raz (to byłoby ok. 15 m więcej).
    expect(dwa.totalM).toBeLessThan(jedno.totalM * 1.5);
  });

  it("naddatek pionowy zależy od WYSOKOŚCI MONTAŻU, nie jest jedną stałą", () => {
    // Do punktu sufitowego (2,8 m) przewód nie schodzi wcale, do gniazda (0,3 m)
    // schodzi przez całą kondygnację — wcześniej oba dostawały te same 2,8 m.
    const gniazdo = estimateRoutes(panel, [el("gniazdko", { x: 10, y: 0 })], 0.1)!;
    const sufit = estimateRoutes(panel, [el("oswietlenie", { x: 10, y: 0 })], 0.1)!;
    expect(gniazdo.worstCaseM - sufit.worstCaseM).toBeCloseTo(2.5, 1); // 2,8 − 0,3
  });

  it("wysokość wpisana ręcznie na elemencie wygrywa z wartością typową", () => {
    const domyslne = estimateRoutes(panel, [el("gniazdko", { x: 10, y: 0 })], 0.1)!;
    // To samo gniazdo, ale nad blatem w kuchni (1,15 m) — zejście krótsze o 0,85 m.
    const nadBlatem = estimateRoutes(panel, [el("gniazdko", { x: 10, y: 0, heightM: 1.15 })], 0.1)!;
    expect(domyslne.worstCaseM - nadBlatem.worstCaseM).toBeCloseTo(0.85, 1);
  });

  it("bez kalibracji skali zwraca null zamiast zmyślonej długości", () => {
    expect(estimateRoutes(panel, [el("gniazdko", { x: 30, y: 40 })], null)).toBeNull();
    expect(estimateRoutes(panel, [el("gniazdko", { x: 30, y: 40 })], 0)).toBeNull();
  });

  it("bez rozdzielnicy na planie nie ma punktu odniesienia — też null", () => {
    expect(estimateRoutes(null, [el("gniazdko", { x: 30, y: 40 })], 0.1)).toBeNull();
  });
});

describe("buildCableRoutes", () => {
  const panel = { x: 0, y: 0 };
  function circuit(over: Partial<Circuit> = {}): Circuit {
    return { id: "obw1", name: "Obwód gniazd ogólnych 1", type: "gniazdko", elements: [], cable: "YDYp 3x2,5 mm²", breaker: "B16", rcd: true, ...over };
  }

  it("bez rozdzielnicy na planie zwraca pustą tablicę zamiast tras donikąd", () => {
    const e = el("gniazdko", { x: 30, y: 40 });
    expect(buildCableRoutes(null, [circuit({ elements: [e] })], [e], [], [])).toEqual([]);
  });

  // Wszystkie poniższe testy wołają BEZ ścian/pomieszczeń ([], []) — `routeAlongWalls`
  // nie ma wtedy po czym routować i celowo spada na zapasową łamaną Manhattan
  // (patrz `manhattanFallback`); routing po ścianach ma OSOBNE testy w routing.test.ts.

  it("punkt NIE leżący na osi rozdzielnicy dostaje złamaną (Manhattan) trasę z jednym narożnikiem", () => {
    const e = el("gniazdko", { x: 30, y: 40 });
    const [r] = buildCableRoutes(panel, [circuit({ elements: [e] })], [e], [], []);
    expect(r.points).toEqual([panel, { x: 30, y: 0 }, { x: 30, y: 40 }]);
    expect(r.lengthUnits).toBe(70); // |30-0| + |40-0|
    expect(r.viaWalls).toBe(false);
  });

  it("punkt leżący na tej samej osi co rozdzielnica dostaje prostą trasę bez narożnika", () => {
    const e = el("gniazdko", { x: 50, y: 0 });
    const [r] = buildCableRoutes(panel, [circuit({ elements: [e] })], [e], [], []);
    expect(r.points).toEqual([panel, { x: 50, y: 0 }]);
  });

  it("niesie dalej tożsamość obwodu (id, nazwa, kabel, zabezpieczenie) — do kolorowania i etykiet", () => {
    const e = el("oswietlenie", { x: 10, y: 10 });
    const [r] = buildCableRoutes(
      panel,
      [circuit({ id: "obw7", name: "Obwód oświetlenia 1", type: "oswietlenie", cable: "YDYp 3x1,5 mm²", breaker: "B10", elements: [e] })],
      [e],
      [],
      []
    );
    expect(r).toMatchObject({
      id: e.id,
      circuitId: "obw7",
      circuitName: "Obwód oświetlenia 1",
      type: "oswietlenie",
      cable: "YDYp 3x1,5 mm²",
      breaker: "B10",
      floor: e.floor,
    });
  });

  it("jeden obwód z wieloma punktami daje po jednej trasie na punkt", () => {
    const a = el("gniazdko", { x: 10, y: 0 });
    const b = el("gniazdko", { x: 20, y: 5 });
    const routes = buildCableRoutes(panel, [circuit({ elements: [a, b] })], [a, b], [], []);
    expect(routes).toHaveLength(2);
    expect(routes.map((r) => r.id).sort()).toEqual([a.id, b.id].sort());
  });

  it("gdy jest ściana łącząca rozdzielnicę z punktem, trasa idzie WZDŁUŻ niej (viaWalls)", () => {
    const w = { id: "w1", floor: "parter", points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] };
    const e = el("gniazdko", { x: 90, y: 10 });
    const [r] = buildCableRoutes({ x: 10, y: -10 }, [circuit({ elements: [e] })], [e], [w], []);
    expect(r.viaWalls).toBe(true);
  });
});

describe("buildCableRoutes — sterowanie (łącznik -> oprawa)", () => {
  const panel = { x: 0, y: 0 };
  function circuit(over: Partial<Circuit> = {}): Circuit {
    return {
      id: "obwOswietlenie",
      name: "Obwód oświetlenia 1",
      type: "oswietlenie",
      elements: [],
      cable: "YDYp 3x1,5 mm²",
      breaker: "B10",
      rcd: true,
      ...over,
    };
  }

  it("łącznik i oprawa w tej samej grupie dostają trasę sterowania — niezależnie od rozdzielnicy", () => {
    const light = el("oswietlenie", { x: 50, y: 0, lightGroup: [1] });
    const control = el("wlacznik", { x: 0, y: 20, lightGroup: [1] });
    const routes = buildCableRoutes(null, [circuit({ elements: [light] })], [light, control], [], []);
    expect(routes).toHaveLength(1);
    expect(routes[0]).toMatchObject({
      id: `${control.id}->${light.id}`,
      kind: "sterowanie",
      circuitId: "obwOswietlenie",
      circuitName: "Obwód oświetlenia 1",
      cable: "YDYp 3x1,5 mm²",
      breaker: "B10",
    });
  });

  it("łącznik steruje kilkoma oprawami: JEDEN przewód pętli łącznik -> najbliższa oprawa -> kolejna, a NIE osobny kabel z łącznika do każdej", () => {
    // control -- (odl. 53,9) --> lightA -- (odl. 14,1) --> lightB
    // ale control -- (odl. 60,8) --> lightB WPROST byłoby dłuższe niż przez lightA —
    // prawdziwe okablowanie (i nasz routing) idzie więc PĘTLĄ, nie na skróty do każdej z osobna
    const lightA = el("oswietlenie", { x: 50, y: 0, lightGroup: [1] });
    const lightB = el("oswietlenie", { x: 60, y: 10, lightGroup: [1] });
    const control = el("wlacznik", { x: 0, y: 20, lightGroup: [1] });
    const routes = buildCableRoutes(
      panel,
      [circuit({ elements: [lightA] }), circuit({ id: "obwOswietlenie2", elements: [lightB] })],
      [lightA, lightB, control],
      [],
      []
    );
    const control2 = routes.filter((r) => r.kind === "sterowanie");
    // dokładnie DWA odcinki (nie trzy — gwiazda z łącznika do obu opraw jest zła),
    // i żaden z nich NIE łączy łącznika wprost z lightB
    expect(control2).toHaveLength(2);
    expect(control2.map((r) => r.id).sort()).toEqual([`${control.id}->${lightA.id}`, `${lightA.id}->${lightB.id}`].sort());
  });

  it("łącznik sterujący TRZEMA oprawami: do łącznika dochodzi TYLKO JEDEN przewód sterowania, nie trzy", () => {
    // dokładnie scenariusz ze zgłoszenia: jeden łącznik, trzy sterowane punkty
    // świetlne w rzędzie coraz dalej od łącznika — każda kolejna oprawa jest
    // bliżej POPRZEDNIEJ oprawy niż samego łącznika, więc fizycznie to jedna
    // pętla, nie trzy osobne kable z łącznika
    const control = el("wlacznik", { x: 0, y: 0, lightGroup: [1] });
    const lightA = el("oswietlenie", { x: 30, y: 0, lightGroup: [1] }); // 30 od łącznika
    const lightB = el("oswietlenie", { x: 55, y: 0, lightGroup: [1] }); // 55 od łącznika, 25 od lightA
    const lightC = el("oswietlenie", { x: 80, y: 0, lightGroup: [1] }); // 80 od łącznika, 25 od lightB
    const routes = buildCableRoutes(
      null,
      [
        circuit({ elements: [lightA] }),
        circuit({ id: "obw2", elements: [lightB] }),
        circuit({ id: "obw3", elements: [lightC] }),
      ],
      [control, lightA, lightB, lightC],
      [],
      []
    );
    const control2 = routes.filter((r) => r.kind === "sterowanie");
    expect(control2).toHaveLength(3); // trzy oprawy = trzy ODCINKI ŁAŃCUCHA...
    const touchingControl = control2.filter((r) => r.id.startsWith(`${control.id}->`));
    expect(touchingControl).toHaveLength(1); // ...ale TYLKO JEDEN z nich zaczyna się na łączniku
  });

  it("łańcuch NIE rozgałęzia się na żadnej oprawie — to prosta pętla, nie drzewo (każda oprawa ma jedno wejście i co najwyżej jedno wyjście)", () => {
    // Ułożenie, przy którym „najbliższy JUŻ PODŁĄCZONY punkt" (odmiana Prima)
    // dokłada DWIE różne oprawy do TEJ SAMEJ, wcześniej podłączonej oprawy B —
    // robiąc z niej rozgałęźnik, mimo że żadna zwykła oprawa nie ma trzeciego
    // zacisku na trzeci przewód. Łańcuch najbliższego sąsiada (patrz
    // `buildControlRoutes`) musi zamiast tego doczepiać KAŻDĄ kolejną oprawę do
    // KOŃCA dotychczasowego łańcucha, nigdy z powrotem do środkowego ogniwa.
    const control = el("wlacznik", { x: 230, y: 125, lightGroup: [1] });
    const lightB = el("oswietlenie", { x: 172, y: 148, lightGroup: [1] }); // najbliżej łącznika
    const lightC = el("oswietlenie", { x: 132, y: 218, lightGroup: [1] }); // najbliżej B
    const lightA = el("oswietlenie", { x: 46, y: 104, lightGroup: [1] }); // dalej, ale bliżej B niż C
    const lightD = el("oswietlenie", { x: 196, y: 341, lightGroup: [1] }); // dalej, bliżej C niż A
    const routes = buildCableRoutes(
      null,
      [
        circuit({ elements: [lightA] }),
        circuit({ id: "obw2", elements: [lightB] }),
        circuit({ id: "obw3", elements: [lightC] }),
        circuit({ id: "obw4", elements: [lightD] }),
      ],
      [control, lightA, lightB, lightC, lightD],
      [],
      []
    );
    const control2 = routes.filter((r) => r.kind === "sterowanie");
    expect(control2).toHaveLength(4); // cztery oprawy = cztery odcinki łańcucha

    // każdy punkt (łącznik albo oprawa) jest POCZĄTKIEM co najwyżej JEDNEGO
    // odcinka — inaczej miałby DWA wychodzące przewody, czyli byłby rozgałęźnikiem
    const froms = control2.map((r) => r.id.split("->")[0]);
    expect(new Set(froms).size).toBe(froms.length);
    // i każda oprawa jest CELEM dokładnie jednego odcinka — łańcuch odwiedza ją raz
    const tos = control2.map((r) => r.id.split("->")[1]);
    expect(new Set(tos).size).toBe(tos.length);
    expect(tos.sort()).toEqual([lightA.id, lightB.id, lightC.id, lightD.id].sort());
  });

  it("oprawa sterowana łącznikiem dostaje trasę ZASILANIA do ŁĄCZNIKA, nie do siebie — zasilanie idzie najpierw do łącznika, dopiero potem sterowanie do oprawy", () => {
    const light = el("oswietlenie", { x: 50, y: 0, lightGroup: [1] });
    const control = el("wlacznik", { x: 0, y: 20, lightGroup: [1] });
    const routes = buildCableRoutes(panel, [circuit({ elements: [light] })], [light, control], [], []);

    const supply = routes.find((r) => r.kind === "zasilanie")!;
    expect(supply).toBeDefined();
    expect(supply.id).toBe(light.id); // trasa nadal "należy" do oprawy (obwód, kolor, kosztorys)
    expect(supply.points[supply.points.length - 1]).toEqual({ x: control.x, y: control.y }); // ale KOŃCZY się na łączniku

    const ctrl = routes.find((r) => r.kind === "sterowanie")!;
    expect(ctrl).toBeDefined();
    expect(ctrl.points[0]).toEqual({ x: control.x, y: control.y }); // sterowanie ZACZYNA się tam, gdzie skończyło się zasilanie
    expect(ctrl.points[ctrl.points.length - 1]).toEqual({ x: light.x, y: light.y });
  });

  it("KILKA opraw JEDNEGO obwodu, JEDEN łącznik: zasilanie do łącznika jest TYLKO JEDNO, nie po jednym na oprawę", () => {
    // dokładnie zgłoszony problem: cztery oprawy sterowane jednym łącznikiem, ale
    // WSZYSTKIE na tym samym obwodzie (ten sam wyłącznik/bezpiecznik) — to fizycznie
    // JEDEN kabel do puszki łącznika, nie cztery równoległe kreski kończące się w
    // tym samym punkcie
    const lightA = el("oswietlenie", { x: 50, y: 0, lightGroup: [1] });
    const lightB = el("oswietlenie", { x: 60, y: 10, lightGroup: [1] });
    const lightC = el("oswietlenie", { x: 70, y: -10, lightGroup: [1] });
    const lightD = el("oswietlenie", { x: 80, y: 20, lightGroup: [1] });
    const control = el("wlacznik", { x: 0, y: 20, lightGroup: [1] });
    const routes = buildCableRoutes(
      panel,
      [circuit({ elements: [lightA, lightB, lightC, lightD] })],
      [lightA, lightB, lightC, lightD, control],
      [],
      []
    );
    const supplyRoutes = routes.filter((r) => r.kind === "zasilanie");
    expect(supplyRoutes).toHaveLength(1); // NIE cztery
    expect(supplyRoutes[0].points[supplyRoutes[0].points.length - 1]).toEqual({ x: control.x, y: control.y });
    // sterowanie za łącznikiem nadal odwiedza WSZYSTKIE cztery oprawy (łańcuchem)
    expect(routes.filter((r) => r.kind === "sterowanie")).toHaveLength(4);
  });

  it("oprawy sterowane TYM SAMYM łącznikiem, ale z RÓŻNYCH obwodów, dostają OSOBNE trasy zasilania — to naprawdę dwa różne kable", () => {
    const lightA = el("oswietlenie", { x: 50, y: 0, lightGroup: [1] });
    const lightB = el("oswietlenie", { x: 60, y: 10, lightGroup: [1] });
    const control = el("wlacznikGrupowy", { x: 0, y: 20, lightGroup: [1] });
    const routes = buildCableRoutes(
      panel,
      [circuit({ elements: [lightA] }), circuit({ id: "obw2", elements: [lightB] })],
      [lightA, lightB, control],
      [],
      []
    );
    const supplyRoutes = routes.filter((r) => r.kind === "zasilanie");
    expect(supplyRoutes).toHaveLength(2); // dwa RÓŻNE obwody = dwa RÓŻNE kable, mimo wspólnego łącznika
    expect(supplyRoutes.map((r) => r.circuitId).sort()).toEqual(["obw2", "obwOswietlenie"]);
    supplyRoutes.forEach((r) => expect(r.points[r.points.length - 1]).toEqual({ x: control.x, y: control.y }));
  });

  it("łącznik jednobiegunowy: zasilanie do puszki i sterowanie do oprawy są 3-żyłowe", () => {
    const light = el("oswietlenie", { x: 50, y: 0, lightGroup: [1] });
    const control = el("wlacznik", { x: 0, y: 20, lightGroup: [1] });
    const routes = buildCableRoutes(panel, [circuit({ elements: [light] })], [light, control], [], []);
    expect(routes.find((r) => r.kind === "zasilanie")?.cable).toBe("YDYp 3x1,5 mm²");
    expect(routes.find((r) => r.kind === "sterowanie")?.cable).toBe("YDYp 3x1,5 mm²");
  });

  it("łącznik grupowy: zasilanie do JEGO puszki jest 4-żyłowe (dwa niezależne mechanizmy), ale sterowanie do oprawy zostaje 3-żyłowe", () => {
    const light = el("oswietlenie", { x: 50, y: 0, lightGroup: [1] });
    const control = el("wlacznikGrupowy", { x: 0, y: 20, lightGroup: [1] });
    const routes = buildCableRoutes(panel, [circuit({ elements: [light] })], [light, control], [], []);
    expect(routes.find((r) => r.kind === "zasilanie")?.cable).toBe("YDYp 4x1,5 mm²");
    expect(routes.find((r) => r.kind === "sterowanie")?.cable).toBe("YDYp 3x1,5 mm²");
  });

  it("łącznik dwubiegunowy: fazę i neutralny łączy RAZEM, więc 4-żyłowe jest ZARÓWNO zasilanie, jak i sterowanie", () => {
    const light = el("oswietlenie", { x: 50, y: 0, lightGroup: [1] });
    const control = el("wlacznikDwubiegunowy", { x: 0, y: 20, lightGroup: [1] });
    const routes = buildCableRoutes(panel, [circuit({ elements: [light] })], [light, control], [], []);
    expect(routes.find((r) => r.kind === "zasilanie")?.cable).toBe("YDYp 4x1,5 mm²");
    expect(routes.find((r) => r.kind === "sterowanie")?.cable).toBe("YDYp 4x1,5 mm²");
  });

  it("przekrój obwodu zostaje nietknięty — koryguje się WYŁĄCZNIE liczba żył", () => {
    const light = el("oswietlenie", { x: 50, y: 0, lightGroup: [1] });
    const control = el("wlacznikGrupowy", { x: 0, y: 20, lightGroup: [1] });
    const routes = buildCableRoutes(
      panel,
      [circuit({ elements: [light], cable: "YDYp 3x2,5 mm²" })],
      [light, control],
      [],
      []
    );
    expect(routes.find((r) => r.kind === "zasilanie")?.cable).toBe("YDYp 4x2,5 mm²");
  });

  it("oprawa BEZ łącznika w swojej grupie dostaje zasilanie wprost do siebie, jak każdy inny odbiornik", () => {
    const light = el("oswietlenie", { x: 50, y: 0 }); // bez lightGroup — nie steruje nią żaden łącznik
    const routes = buildCableRoutes(panel, [circuit({ elements: [light] })], [light], [], []);
    const supply = routes.find((r) => r.kind === "zasilanie")!;
    expect(supply).toBeDefined();
    expect(supply.points[supply.points.length - 1]).toEqual({ x: light.x, y: light.y });
  });

  it("łącznik schodowy (dwa łączniki, jedna oprawa): zasilanie ląduje na NAJBLIŻSZYM łączniku", () => {
    const light = el("oswietlenie", { x: 100, y: 0, lightGroup: [1] });
    const near = el("wlacznikSchodowy", { x: 90, y: 0, lightGroup: [1] }); // 10 jedn. od oprawy
    const far = el("wlacznikSchodowy", { x: -50, y: 0, lightGroup: [1] }); // 150 jedn. od oprawy
    const routes = buildCableRoutes(panel, [circuit({ elements: [light] })], [light, near, far], [], []);
    const supply = routes.find((r) => r.kind === "zasilanie")!;
    expect(supply).toBeDefined();
    expect(supply.points[supply.points.length - 1]).toEqual({ x: near.x, y: near.y });
  });

  it("łącznik bez oprawy w swojej grupie nie dostaje żadnej trasy", () => {
    const control = el("wlacznik", { x: 0, y: 20, lightGroup: [1] });
    const routes = buildCableRoutes(null, [], [control], [], []);
    expect(routes).toEqual([]);
  });
});

describe("spreadOverlappingRoutes", () => {
  function route(id: string, points: { x: number; y: number }[]): ReturnType<typeof buildCableRoutes>[number] {
    return {
      id,
      circuitId: "obw1",
      circuitName: "Obwód",
      kind: "zasilanie",
      type: "gniazdko",
      cable: "",
      breaker: "",
      room: "Salon",
      floor: "parter",
      points,
      lengthUnits: 0,
      viaWalls: true,
    };
  }

  it("dwie trasy dzielące ten sam odcinek dostają przeciwne przesunięcia (kolejność po id)", () => {
    const a = route("a", [{ x: 0, y: 0 }, { x: 100, y: 0 }]);
    const b = route("b", [{ x: 0, y: 0 }, { x: 100, y: 0 }]);
    const out = spreadOverlappingRoutes([a, b]);
    const pa = out.get("a")!;
    const pb = out.get("b")!;
    expect(pa[0].y).not.toBeCloseTo(pb[0].y, 5);
    expect(pa[0].y).toBeCloseTo(-pb[0].y, 5);
  });

  it("trasa samotna na odcinku nie dostaje żadnego przesunięcia", () => {
    const a = route("a", [{ x: 0, y: 0 }, { x: 100, y: 0 }]);
    const out = spreadOverlappingRoutes([a]);
    expect(out.get("a")).toEqual([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
  });

  it("zerowej długości odcinek nie psuje wyniku (brak NaN)", () => {
    const a = route("a", [{ x: 5, y: 5 }, { x: 5, y: 5 }]);
    const b = route("b", [{ x: 5, y: 5 }, { x: 5, y: 5 }]);
    const out = spreadOverlappingRoutes([a, b]);
    for (const pts of [out.get("a")!, out.get("b")!]) {
      for (const p of pts) {
        expect(Number.isNaN(p.x)).toBe(false);
        expect(Number.isNaN(p.y)).toBe(false);
      }
    }
  });

  it("trasy rozchodzące się po wspólnym odcinku mają niezależne przesunięcia na dalszych segmentach", () => {
    const a = route("a", [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }]);
    const b = route("b", [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: -50 }]);
    const out = spreadOverlappingRoutes([a, b]);
    const pa = out.get("a")!;
    const pb = out.get("b")!;
    // wspólny pierwszy odcinek — przesunięte w Y, przeciwnie
    expect(pa[0].y).toBeCloseTo(-pb[0].y, 5);
    // drugi odcinek każdej trasy jest samotny (nikt inny go nie dzieli) — bez przesunięcia w X
    expect(pa[2].x).toBeCloseTo(50, 1);
    expect(pb[2].x).toBeCloseTo(50, 1);
  });
});

describe("buildCableRoutes — zapasowa trasa Manhattan omija ścianę stojącą na drodze", () => {
  function circuit(over: Partial<Circuit> = {}): Circuit {
    return { id: "obw1", name: "Obwód gniazd ogólnych 1", type: "gniazdko", elements: [], cable: "YDYp 3x2,5 mm²", breaker: "B16", rcd: true, ...over };
  }

  it("gdy domyślne załamanie (przez {to.x, from.y}) przecina ścianę, a DRUGA orientacja jest wolna — wybiera drugą", () => {
    const panel = { x: 0, y: 0 };
    const e = el("gniazdko", { x: 100, y: 100 });
    // trzy ROZŁĄCZONE kawałki ściany (patrz routing.test.ts — dijkstra między nimi
    // zwraca null, więc trasa MUSI spaść na Manhattan): jedna tuż przy rozdzielnicy,
    // jedna tuż przy gniazdku (żeby to one, a nie przeszkoda, były „najbliższe" przy
    // doskoku), i trzecia — przeszkoda — dokładnie na domyślnym załamaniu (100,0).
    const nearPanel = { id: "wp", floor: "parter", points: [{ x: 0, y: -5 }, { x: 0, y: -1 }] };
    const nearPoint = { id: "we", floor: "parter", points: [{ x: 100, y: 105 }, { x: 100, y: 101 }] };
    const obstacle = { id: "wo", floor: "parter", points: [{ x: 50, y: -10 }, { x: 50, y: 10 }] };
    const [r] = buildCableRoutes(panel, [circuit({ elements: [e] })], [e], [nearPanel, nearPoint, obstacle], []);
    expect(r.viaWalls).toBe(false); // nadal szacunek, nie routing po ścianach
    expect(r.points).toEqual([panel, { x: 0, y: 100 }, { x: 100, y: 100 }]);
  });
});

describe("applyRouteOverrides", () => {
  function route(id: string, points: { x: number; y: number }[]): ReturnType<typeof buildCableRoutes>[number] {
    return {
      id,
      circuitId: "obw1",
      circuitName: "Obwód",
      kind: "zasilanie",
      type: "gniazdko",
      cable: "",
      breaker: "",
      room: "Salon",
      floor: "parter",
      points,
      lengthUnits: 0,
      viaWalls: true,
    };
  }

  it("bez poprawki zwraca trasę BEZ zmian", () => {
    const r = route("a", [{ x: 0, y: 0 }, { x: 100, y: 0 }]);
    expect(applyRouteOverrides([r], {})).toEqual([r]);
  });

  it("wstawia środkowe punkty poprawki MIĘDZY aktualny początek i koniec trasy", () => {
    const r = route("a", [{ x: 0, y: 0 }, { x: 100, y: 0 }]);
    const [out] = applyRouteOverrides([r], { a: [{ x: 50, y: 40 }] });
    expect(out.points).toEqual([{ x: 0, y: 0 }, { x: 50, y: 40 }, { x: 100, y: 0 }]);
    expect(out.lengthUnits).toBeCloseTo(Math.hypot(50, 40) * 2, 5);
  });

  it("gdy element (koniec trasy) się przesunął, poprawka trzyma środkowe zagięcie, ale koniec ŚCIGA nową pozycję", () => {
    // symulacja: trasa policzona NA NOWO po ruchu punktu (nowy `to`), poprawka
    // wciąż ta sama — środek zostaje, tylko doczepiony do świeżego końca
    const moved = route("a", [{ x: 0, y: 0 }, { x: 200, y: 0 }]);
    const [out] = applyRouteOverrides([moved], { a: [{ x: 50, y: 40 }] });
    expect(out.points).toEqual([{ x: 0, y: 0 }, { x: 50, y: 40 }, { x: 200, y: 0 }]);
  });

  it("pusta tablica poprawki traktowana jest jak BRAK poprawki (powrót do auto), nie jak prosta linia", () => {
    const r = route("a", [{ x: 0, y: 0 }, { x: 50, y: 40 }, { x: 100, y: 0 }]);
    const [out] = applyRouteOverrides([r], { a: [] });
    expect(out.points).toEqual(r.points);
  });
});

describe("findPanel / kindForElements", () => {
  it("znajduje rozdzielnicę jako punkt odniesienia tras", () => {
    expect(findPanel([el("gniazdko", { x: 5, y: 5 }), el("rozdzielnica", { x: 20, y: 30 })])).toEqual({ x: 20, y: 30 });
    expect(findPanel([el("gniazdko")])).toBeNull();
  });

  it("rozpoznaje rodzaj obwodu po rolach elementów", () => {
    expect(kindForElements([el("oswietlenie")])).toBe("oswietlenie");
    expect(kindForElements([el("gniazdko")])).toBe("gniazda");
    expect(kindForElements([el("ladowarkaEV")])).toBe("dedykowany");
    expect(kindForElements([el("gniazdko400")])).toBe("dedykowany");
    // obwód mieszany z odbiornikiem dedykowanym traktujemy jako dedykowany
    expect(kindForElements([el("gniazdko"), el("wypustAGD")])).toBe("dedykowany");
  });
});

describe("estimateRoutesByFloor", () => {
  /** Jedna rozdzielnica na caly budynek — najczestszy uklad w domu jednorodzinnym. */
  const panel = { poKondygnacji: new Map<string, { x: number; y: number }>(), glowna: { x: 0, y: 0 } };
  // Ten sam punkt planu na dwoch kondygnacjach — rozni je WYLACZNIE skala pietra.
  const naParterze = el("gniazdko", { x: 100, y: 0, floor: "parter" });
  const naPietrze = el("gniazdko", { x: 100, y: 0, floor: "pietro" });

  it("kazda kondygnacja liczy sie wlasna skala", () => {
    // 100 jedn. x 0,05 m = 5 m na parterze; 100 jedn. x 0,01 m = 1 m na pietrze.
    const skale = { parter: 0.05, pietro: 0.01 };
    const sam = (e: InstallationElement, s: Record<string, number>) => estimateRoutesByFloor(panel, [e], s)!.totalM;
    expect(sam(naParterze, skale) - sam(naPietrze, skale)).toBeCloseTo(4, 5);
  });

  /**
   * Sedno bledu, ktory to naprawia: przedtem caly budynek liczyl sie skala kondygnacji
   * AKURAT OTWARTEJ w edytorze, wiec ta sama instalacja dawala inny metraz po samym
   * przelaczeniu zakladki pietra.
   */
  it("wynik nie zalezy od tego, ktora kondygnacja jest otwarta", () => {
    const skale = { parter: 0.05, pietro: 0.01 };
    const razem = estimateRoutesByFloor(panel, [naParterze, naPietrze], skale)!;
    const osobno =
      estimateRoutesByFloor(panel, [naParterze], skale)!.totalM +
      estimateRoutesByFloor(panel, [naPietrze], skale)!.totalM;
    expect(razem.totalM).toBeCloseTo(osobno, 5);
    // Do spadku napiecia liczy sie NAJDLUZSZA pojedyncza trasa, nie suma.
    expect(razem.worstCaseM).toBeCloseTo(estimateRoutesByFloor(panel, [naParterze], skale)!.worstCaseM, 5);
  });

  /**
   * Czesciowy wynik bylby gorszy od braku: skrocona dlugosc zanizylaby spadek napiecia
   * i dobrala za cienki przewod, czyli blad w strone niebezpieczna.
   */
  it("brak skali CHOC JEDNEJ kondygnacji unieważnia caly obwod", () => {
    expect(estimateRoutesByFloor(panel, [naParterze, naPietrze], { parter: 0.05 })).toBeNull();
    expect(estimateRoutesByFloor(panel, [naParterze], { parter: 0.05 })).not.toBeNull();
  });

  it("na jednej kondygnacji daje dokladnie to samo co wersja jednoskalowa", () => {
    const jedno = estimateRoutes(panel.glowna, [naParterze], 0.05);
    expect(estimateRoutesByFloor(panel, [naParterze], { parter: 0.05 })).toEqual(jedno);
  });

  it("bez rozdzielnicy i bez elementow nie ma czego mierzyc", () => {
    expect(estimateRoutesByFloor({ poKondygnacji: new Map(), glowna: null }, [naParterze], { parter: 0.05 })).toBeNull();
    expect(estimateRoutesByFloor(panel, [], { parter: 0.05 })).toBeNull();
  });
});

describe("findPanels / panelDlaKondygnacji", () => {
  const rozdzielnicaParter = el("rozdzielnica", { x: 10, y: 10, floor: "parter" });
  const rozdzielnicaPietro = el("rozdzielnica", { x: 500, y: 500, floor: "pietro" });
  const gniazdko = el("gniazdko", { x: 0, y: 0, floor: "pietro" });

  it("zbiera po jednej rozdzielnicy na kondygnacje i zapamietuje glowna", () => {
    const p = findPanels([gniazdko, rozdzielnicaParter, rozdzielnicaPietro]);
    expect(p.poKondygnacji.get("parter")).toEqual({ x: 10, y: 10 });
    expect(p.poKondygnacji.get("pietro")).toEqual({ x: 500, y: 500 });
    // Glowna to pierwsza znaleziona — od niej licza sie kondygnacje bez wlasnej.
    expect(p.glowna).toEqual({ x: 10, y: 10 });
  });

  /**
   * Sedno bledu: obwod na pietrze mierzyl sie od PIERWSZEJ rozdzielnicy w projekcie,
   * czyli zwykle od tablicy glownej na parterze — nawet gdy pietro ma wlasna
   * podrozdzielnice. O wyniku decydowala kolejnosc elementow w tablicy.
   */
  it("kondygnacja z wlasna podrozdzielnica liczy sie od NIEJ, nie od glownej", () => {
    const p = findPanels([rozdzielnicaParter, rozdzielnicaPietro]);
    expect(panelDlaKondygnacji(p, "pietro")).toEqual({ x: 500, y: 500 });
  });

  /** Typowy dom ma JEDNA tablice na parterze, a obwody na pietrze tez musza sie od
   *  czegos liczyc — bez tego zapasu przestalyby sie mierzyc w ogole. */
  it("kondygnacja bez wlasnej rozdzielnicy spada na glowna", () => {
    const p = findPanels([rozdzielnicaParter]);
    expect(panelDlaKondygnacji(p, "poddasze")).toEqual({ x: 10, y: 10 });
  });

  it("bez zadnej rozdzielnicy nie ma punktu odniesienia", () => {
    const p = findPanels([gniazdko]);
    expect(panelDlaKondygnacji(p, "pietro")).toBeNull();
  });

  it("przy kilku rozdzielnicach na jednej kondygnacji liczy sie pierwsza", () => {
    const druga = el("rozdzielnica", { x: 99, y: 99, floor: "parter" });
    expect(findPanels([rozdzielnicaParter, druga]).poKondygnacji.get("parter")).toEqual({ x: 10, y: 10 });
  });

  it("trasa na pietrze skraca sie, gdy pietro dostaje wlasna podrozdzielnice", () => {
    const skale = { parter: 0.05, pietro: 0.05 };
    const daleko = estimateRoutesByFloor(findPanels([rozdzielnicaParter]), [gniazdko], skale)!;
    const blisko = estimateRoutesByFloor(findPanels([rozdzielnicaParter, rozdzielnicaPietro]), [gniazdko], skale)!;
    // Gniazdko stoi w (0,0): do tablicy na parterze (10,10) jest 20 jedn., do
    // podrozdzielnicy (500,500) — 1000 jedn. Kierunek roznicy jest tu mniej wazny niz
    // to, ze WYNIK W OGOLE zalezy od tego, ktora rozdzielnica zasila to pietro.
    expect(blisko.totalM).not.toBeCloseTo(daleko.totalM, 3);
  });
});

/**
 * Przypadek ze zgloszenia uzytkownika: jeden punkt swietlny i dwa gniazda w pokoju
 * dawaly TRZY linie z rozdzielnicy, choc to dwa obwody i dwa przewody.
 */
describe("buildCableRoutes — lancuch zamiast gwiazdy", () => {
  const panel = { x: 0, y: 0 };

  it("gniazda jednego obwodu dostaja JEDEN kabel wchodzacy po drodze do kazdego", () => {
    const g1 = el("gniazdko", { x: 100, y: 0, id: "g1" });
    const g2 = el("gniazdko", { x: 140, y: 0, id: "g2" });
    const obwod: Circuit = {
      id: "obw1",
      name: "Obwód gniazd ogólnych 1",
      type: "gniazdko",
      elements: [g2, g1], // celowo w kolejnosci odwrotnej niz geograficzna
      cable: "YDYp 3x2,5 mm²",
      breaker: "B16",
      rcd: true,
    };
    const trasy = buildCableRoutes(panel, [obwod], [g1, g2], [], []);

    expect(trasy).toHaveLength(2);
    // Pierwszy odcinek wychodzi z rozdzielnicy do BLIZSZEGO gniazda...
    const doG1 = trasy.find((t) => t.id === "g1")!;
    expect(doG1.points[0]).toEqual(panel);
    expect(doG1.points[doG1.points.length - 1]).toEqual({ x: 100, y: 0 });
    // ...a drugi startuje Z NIEGO, nie z rozdzielnicy. To cala roznica.
    const doG2 = trasy.find((t) => t.id === "g2")!;
    expect(doG2.points[0]).toEqual({ x: 100, y: 0 });
    expect(doG2.points[doG2.points.length - 1]).toEqual({ x: 140, y: 0 });
    // Suma narysowanego przewodu: 140 jednostek zamiast 240 przy gwiezdzie.
    expect(doG1.lengthUnits + doG2.lengthUnits).toBe(140);
  });

  it("odcinki lancucha zostaja przy SWOIM obwodzie i swoim kablu", () => {
    const g1 = el("gniazdko", { x: 50, y: 0, id: "g1" });
    const g2 = el("gniazdko", { x: 60, y: 0, id: "g2" });
    const obwod: Circuit = {
      id: "obw9",
      name: "Obwód gniazd — Kuchnia",
      type: "gniazdko",
      elements: [g1, g2],
      cable: "YDYp 3x2,5 mm²",
      breaker: "B16",
      rcd: true,
    };
    for (const t of buildCableRoutes(panel, [obwod], [g1, g2], [], [])) {
      expect(t.circuitId).toBe("obw9");
      expect(t.cable).toBe("YDYp 3x2,5 mm²");
      expect(t.kind).toBe("zasilanie");
    }
  });

  /** Dwa obwody = dwa niezalezne lancuchy, kazdy od rozdzielnicy. */
  it("kazdy obwod zaczyna wlasny lancuch od rozdzielnicy", () => {
    const g = el("gniazdko", { x: 100, y: 0, id: "g" });
    const l = el("oswietlenie", { x: 100, y: 40, id: "l" });
    const trasy = buildCableRoutes(
      panel,
      [
        { id: "obwG", name: "Gniazda", type: "gniazdko", elements: [g], cable: "YDYp 3x2,5 mm²", breaker: "B16", rcd: true },
        { id: "obwL", name: "Oświetlenie", type: "oswietlenie", elements: [l], cable: "YDYp 3x1,5 mm²", breaker: "B10", rcd: true },
      ],
      [g, l],
      [],
      []
    );
    expect(trasy.filter((t) => t.points[0].x === panel.x && t.points[0].y === panel.y)).toHaveLength(2);
  });
});

/**
 * Zakonczenie trasy przy symbolu: przewod ma dochodzic do jego KRAWEDZI skosem,
 * a nie przebijac go na wylot do srodka.
 */
describe("zakonczSkosem", () => {
  const trasa = (...p: [number, number][]) => p.map(([x, y]) => ({ x, y }));

  it("przycina ogon do krawedzi symbolu i odbija skosem", () => {
    // Trasa biegnie poziomo do (100,0), potem 20 w dol do srodka symbolu o promieniu 6.
    const out = zakonczSkosem(trasa([0, 0], [100, 0], [100, 20]), { x: 100, y: 20 }, 6);
    // Ogon poza symbolem ma 14 jednostek, wiec odbicie wypada 14 przed rogiem...
    expect(out[out.length - 2]).toEqual({ x: 86, y: 0 });
    // ...a koniec siada na krawedzi symbolu, nie w jego srodku.
    expect(out[out.length - 1]).toEqual({ x: 100, y: 14 });
    // Rowne skladowe = 45 stopni.
    const dx = out[out.length - 1].x - out[out.length - 2].x;
    const dy = out[out.length - 1].y - out[out.length - 2].y;
    expect(Math.abs(dx)).toBeCloseTo(Math.abs(dy), 9);
  });

  /** Gdy „odczep" jest dluzszy niz polowa odcinka, ktorym trasa nadchodzi, to nie
   *  jest odczep, tylko cala droga do punktu — zaginanie wykrzywiloby trase. */
  it("przy dlugim dojsciu i krotkim odcinku zostaje samo przyciecie", () => {
    const out = zakonczSkosem(trasa([0, 0], [10, 0], [10, 100]), { x: 10, y: 100 }, 6);
    expect(out).toHaveLength(3);
    expect(out[2]).toEqual({ x: 10, y: 94 });
  });

  it("trasa konczaca sie juz w zasiegu symbolu zostaje nietknieta", () => {
    const wejscie = trasa([0, 0], [100, 0], [100, 4]);
    expect(zakonczSkosem(wejscie, { x: 100, y: 4 }, 6)).toEqual(wejscie);
  });

  it("bez punktu przed rogiem zostaje samo przyciecie", () => {
    const out = zakonczSkosem(trasa([100, 0], [100, 20]), { x: 100, y: 20 }, 6);
    expect(out).toEqual(trasa([100, 0], [100, 14]));
  });
});
