import { describe, expect, it } from "vitest";
import { ZAPAS_MONTAZOWY_M } from "./norms";
import type { CableRoute, Circuit, ElementType, Floor, InstallationElement, RoomShape, Point } from "@/types";
import { applyRouteOverrides, buildCableRoutes, circuitDemand, estimateRoutes, estimateRoutesByFloor, findPanel, findPanels, kindForElements, panelDlaKondygnacji, spreadOverlappingRoutes, przytnijDoKrawedzi, zakonczPrzyNozce } from "./loads";

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

  it("gniazdo podwójne wnosi moc DWÓCH odbiorników, choć jest jedną sztuką osprzętu", () => {
    // Kupuje się je raz, ale wpiąć można w nie dwie wtyczki — i to decyduje o obwodzie.
    const d = circuitDemand([el("gniazdko", { gangs: 2 })], "gniazda");
    expect(d.installedW).toBe(600); // 2 × 300 W
  });

  it("stary zapis `gangs: 3` nie zawyża mocy — czyta się jako podwójne", () => {
    const d = circuitDemand([el("gniazdko", { gangs: 3 })], "gniazda");
    expect(d.installedW).toBe(600);
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
   *  podejście (2,8 − 1,5) + zejście (2,8 − 0,3) + zapas 0,5 = 4,3 m. */
  const NADDATEK_GNIAZDO = 4.3;
  /** Sam zapas montazowy w puszce — tyle dokłada kolejne gniazdo na tej samej
   *  wysokosci, bo miedzy puszkami przewod nie wraca pod strop. */
  const ZAPAS = ZAPAS_MONTAZOWY_M;

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

  /**
   * Oprawa sterowana łącznikiem z INNEJ kondygnacji nie dostaje trasy zasilania na
   * swoim piętrze, bo jej zasilanie przychodzi przez strop — a tego rzut 2D nie umie
   * narysować. Rysunek pokazuje wtedy MNIEJ, zamiast pokazywać kabel z rozdzielnicy
   * do oprawy, którego kosztorys od tej pory nie kupuje (patrz
   * `estimateRoutesByFloor`: zasilanie idzie do łącznika, także przez strop).
   *
   * Zgodność rysunku z szacunkiem jest w tym module własnością pierwszej kategorii —
   * po to `ogniwaSterowania` zostało w ogóle wydzielone.
   */
  it("oprawa sterowana z INNEJ kondygnacji nie dostaje trasy zasilania na swoim piętrze", () => {
    const lampaG = el("oswietlenie", { x: 100, y: 100, floor: "pietro", room: "Klatka g", lightGroup: [7] });
    const lacznikP = el("wlacznikSchodowy", { x: 40, y: 100, floor: "parter", room: "Klatka", lightGroup: [7] });
    // Rysunek dostaje elementy JEDNEJ kondygnacji — i o łączniku piętro niżej wie
    // wyłącznie z listy całego budynku.
    const routes = buildCableRoutes(panel, [circuit({ elements: [lampaG] })], [lampaG], [], [], [], 1, [lampaG, lacznikP]);
    expect(routes.filter((r) => r.kind === "zasilanie")).toEqual([]);
  });

  /** Kontrola założenia: bez wiedzy o całym budynku (czyli tak, jak wołają tę funkcję
   *  testy wyżej) oprawa dostaje trasę zasilania jak każdy inny punkt obwodu. */
  it("ta sama oprawa BEZ listy całego budynku rysuje się jak dotąd", () => {
    const lampaG = el("oswietlenie", { x: 100, y: 100, floor: "pietro", room: "Klatka g", lightGroup: [7] });
    const routes = buildCableRoutes(panel, [circuit({ elements: [lampaG] })], [lampaG], [], []);
    expect(routes.filter((r) => r.kind === "zasilanie")).toHaveLength(1);
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

/**
 * Rozsuwanie tras w rownolegle pasy. Zgloszenie uzytkownika: kilka obwodow biegnacych
 * ta sama sciana naklada sie na siebie i nie wiadomo, ile przewodow jest tam
 * prowadzonych. Obwod gniazdowy ma zostac NAJBLIZEJ sciany.
 *
 * Trasy w testach maja ksztalt prawdziwych: koncowe odcinki to przylaczenia do
 * urzadzen (obudowa rozdzielnicy, nozka gniazda), a rozsuwaniu podlega tylko przebieg
 * MIEDZY nimi.
 */
describe("spreadOverlappingRoutes", () => {
  /** Pokoj 200 x 200 — dolna sciana na y = 200, wiec korytarz tras wypada y = 195. */
  const POKOJ_SPREAD: RoomShape = {
    id: "r1",
    floor: "parter",
    name: "Salon",
    color: "#3B8C63",
    points: [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 200 },
      { x: 0, y: 200 },
    ],
  };

  function route(
    id: string,
    points: { x: number; y: number }[],
    over: Partial<ReturnType<typeof buildCableRoutes>[number]> = {}
  ): ReturnType<typeof buildCableRoutes>[number] {
    return {
      id,
      circuitId: id, // domyslnie kazda trasa to osobny obwod — osobny kabel, osobny pas
      circuitName: "Obwód",
      color: "#1F6FB2",
      kind: "zasilanie",
      type: "gniazdko",
      cable: "",
      breaker: "",
      room: "Salon",
      floor: "parter",
      points,
      lengthUnits: 0,
      viaWalls: true,
      ...over,
    };
  }

  /** Trasa biegnaca korytarzem y = `y` od `x0` do `x1`, z krotkimi przylaczami na obu
   *  koncach — czyli dokladnie tak, jak wychodzi z `buildCableRoutes`. */
  const korytarz = (id: string, x0: number, x1: number, y: number, over = {}) =>
    route(id, [{ x: x0, y: y + 5 }, { x: x0, y }, { x: x1, y }, { x: x1, y: y + 5 }], over);

  it("dwa obwody na tym samym odcinku dostaja OSOBNE pasy", () => {
    const out = spreadOverlappingRoutes([korytarz("a", 0, 100, 0), korytarz("b", 0, 100, 0)]);
    expect(out.get("a")![1].y).not.toBeCloseTo(out.get("b")![1].y, 5);
  });

  /**
   * Sedno zgloszenia. Wczesniej kluczem byla PARA KONCOW odcinka, wiec trasa biegnaca
   * pol sciany i druga biegnaca cala mialy rozne klucze i rysowaly sie jedna na
   * drugiej — a to najczestszy uklad, bo obwody wychodza z jednej rozdzielnicy
   * i rozchodza sie w roznych miejscach.
   */
  it("odcinek ZAWIERAJACY SIE w dluzszym tez jest rozsuwany", () => {
    const out = spreadOverlappingRoutes([korytarz("dlugi", 0, 100, 0), korytarz("krotki", 20, 60, 0)]);
    expect(out.get("dlugi")![1].y).not.toBeCloseTo(out.get("krotki")![1].y, 5);
  });

  it("ODLEGLE kawalki tej samej sciany nie rozsuwaja sie — nic sie tam nie zaslania", () => {
    const out = spreadOverlappingRoutes([korytarz("a", 0, 40, 0), korytarz("b", 120, 160, 0)]);
    expect(out.get("a")![1].y).toBeCloseTo(0, 5);
    expect(out.get("b")![1].y).toBeCloseTo(0, 5);
  });

  /**
   * Koniec przewodu siedzi na urzadzeniu — na obudowie rozdzielnicy albo na nozce
   * gniazda. Przesuniecie go w bok byloby klamstwem o tym, gdzie kabel wchodzi;
   * zdarzalo sie przy tym, ze trasa zaczynala sie POZA budynkiem.
   */
  it("KONCE tras zostaja przypiete do urzadzen, mimo rozsuwania", () => {
    const a = korytarz("a", 0, 100, 0);
    const b = korytarz("b", 0, 100, 0);
    const out = spreadOverlappingRoutes([a, b]);
    for (const [id, r] of [["a", a], ["b", b]] as const) {
      const pts = out.get(id)!;
      expect(pts[0]).toEqual(r.points[0]);
      expect(pts[pts.length - 1]).toEqual(r.points[r.points.length - 1]);
    }
  });

  /** Jeden obwod to JEDEN kabel — kolejne ogniwa lancucha trzymaja sie jednej linii,
   *  nawet gdy sa osobnymi trasami (odcinek rozdzielnica→gniazdo, gniazdo→gniazdo). */
  it("dwie trasy TEGO SAMEGO obwodu dziela pas", () => {
    const out = spreadOverlappingRoutes([
      korytarz("a", 0, 100, 0, { circuitId: "obw1" }),
      korytarz("b", 0, 100, 0, { circuitId: "obw1" }),
    ]);
    expect(out.get("a")).toEqual(out.get("b"));
  });

  /**
   * Przebieg wzdluz JEDNEJ sciany prawie nigdy nie jest jednym odcinkiem: trasa idzie po
   * obrysach sasiadujacych pomieszczen i po brzegach przejscia w drzwiach, wiec dzieli sie
   * na kawalki stykajace sie koncami. Grupy nakladania pekaja dokladnie na stykach (patrz
   * MIN_NAKLADANIE), wiec jeden kabel dostawal pas 0 na pierwszym kawalku sciany i pas 1 na
   * drugim — gdy dopiero w polowie jej dlugosci dolaczal do niej inny obwod.
   *
   * Odcinki wspolliniowe nie maja przeciecia, wiec wierzchołek na styku spadal na pas dalszy,
   * a drugi koniec zostawal na swoim — i CALY odcinek miedzy nimi kladl sie ukosem przez pol
   * pomieszczenia. Na rzucie projektu przykladowego bylo to 2 m skosu wzdluz wspolnej sciany
   * salonu i kuchni.
   */
  it("jeden kabel trzyma JEDEN pas na calej scianie, tez gdy inny obwod dolacza w jej polowie", () => {
    // Dwa odcinki wspolliniowe stykajace sie w x = 50 — tak, jak trasa przechodzaca
    // z obrysu jednego pokoju na obrys drugiego.
    const dlugi = route(
      "dlugi",
      [
        { x: 0, y: 5 },
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 5 },
      ],
      { circuitId: "obw2" }
    );
    // Drugi obwod zajmuje TYLKO druga polowe tej sciany i ma pierwszenstwo do pasa przy murze.
    const out = spreadOverlappingRoutes([dlugi, korytarz("inny", 50, 100, 0, { circuitId: "obw1" })]);
    const pts = out.get("dlugi")!;
    expect(pts[1].y).toBeCloseTo(pts[2].y, 5);
    expect(pts[2].y).toBeCloseTo(pts[3].y, 5);
    // ...i rozsuniecie naprawde zaszlo, a nie „zgodzilo sie" przez to, ze nic nikogo nie ruszylo.
    expect(out.get("inny")![1].y).not.toBeCloseTo(pts[2].y, 5);
  });

  it("obwod GNIAZDOWY zostaje przy scianie, oswietlenie odsuwa sie w glab pokoju", () => {
    const out = spreadOverlappingRoutes(
      [korytarz("g", 20, 180, 195), korytarz("s", 20, 180, 195, { type: "oswietlenie" })],
      [POKOJ_SPREAD]
    );
    // Sciana jest na y = 200, wiec „dalej od niej" znaczy MNIEJSZE y.
    expect(out.get("g")![1].y).toBeCloseTo(195, 5); // pas zerowy zostaje na trasie
    expect(out.get("s")![1].y).toBeLessThan(195);
  });

  it("kolejnosc pasow NIE zalezy od kolejnosci tras na wejsciu", () => {
    const g = korytarz("g", 20, 180, 195);
    const s = korytarz("s", 20, 180, 195, { type: "oswietlenie" });
    const wPrzod = spreadOverlappingRoutes([g, s], [POKOJ_SPREAD]);
    const wTyl = spreadOverlappingRoutes([s, g], [POKOJ_SPREAD]);
    expect(wPrzod.get("g")).toEqual(wTyl.get("g"));
    expect(wPrzod.get("s")).toEqual(wTyl.get("s"));
  });

  it("trasa samotna na odcinku nie dostaje zadnego przesuniecia", () => {
    const a = korytarz("a", 0, 100, 0);
    expect(spreadOverlappingRoutes([a])).toEqual(new Map([["a", a.points]]));
  });

  it("zerowej dlugosci odcinek nie psuje wyniku (brak NaN)", () => {
    const a = route("a", [{ x: 5, y: 5 }, { x: 5, y: 5 }, { x: 5, y: 5 }]);
    const b = route("b", [{ x: 5, y: 5 }, { x: 5, y: 5 }, { x: 5, y: 5 }]);
    const out = spreadOverlappingRoutes([a, b]);
    for (const pts of [out.get("a")!, out.get("b")!]) {
      for (const p of pts) {
        expect(Number.isNaN(p.x)).toBe(false);
        expect(Number.isNaN(p.y)).toBe(false);
      }
    }
  });

  it("trasy rozchodzace sie po wspolnym odcinku maja niezalezne przesuniecia na dalszych segmentach", () => {
    const a = route("a", [{ x: 0, y: -5 }, { x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }, { x: 50, y: 55 }]);
    const b = route("b", [{ x: 0, y: -5 }, { x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: -50 }, { x: 50, y: -55 }]);
    const out = spreadOverlappingRoutes([a, b]);
    // wspolny korytarz — rozsuniety
    expect(out.get("a")![1].y).not.toBeCloseTo(out.get("b")![1].y, 5);
    // pionowe czesci ida w PRZECIWNE strony, wiec dziela tylko jeden punkt
    // (narozny styk to nie nakladanie) — zostaja na swoim x
    expect(out.get("a")![3].x).toBeCloseTo(50, 1);
    expect(out.get("b")![3].x).toBeCloseTo(50, 1);
  });

  /** Trasy biegnace tym samym korytarzem w PRZECIWNE strony to nadal jeden korytarz —
   *  bez sprowadzenia kierunku do jednej polplaszczyzny trafialyby na osobne proste
   *  i rysowaly sie jedna na drugiej. */
  it("przeciwne zwroty na tej samej prostej tez sie rozsuwaja", () => {
    const a = korytarz("a", 0, 100, 0);
    const b = route("b", [{ x: 100, y: 5 }, { x: 100, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 5 }]);
    const out = spreadOverlappingRoutes([a, b]);
    expect(out.get("a")![1].y).not.toBeCloseTo(out.get("b")![2].y, 5);
  });
});

describe("applyRouteOverrides", () => {
  function route(id: string, points: { x: number; y: number }[]): ReturnType<typeof buildCableRoutes>[number] {
    return {
      id,
      circuitId: "obw1",
      circuitName: "Obwód",
      color: "#1F6FB2",
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
  const panel = { poKondygnacji: new Map<string, { x: number; y: number }>(), glowna: { x: 0, y: 0 }, glownaKondygnacja: "parter" };
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

  /**
   * STEROWANIE PRZEZ STROP. Grupa rozpieta miedzy kondygnacje rozpadala sie tu na dwa
   * kawalki — na parterze lacznik bez lampy, na pietrze lampa bez lacznika — wiec
   * ogniwo miedzy nimi nie istnialo i nie kosztowalo NIC. Zmierzone przed poprawka:
   * lampa na pietrze zwiazana recznym numerem z lacznikiem na parterze dawala
   * dokladnie tyle samo metrow, co ta sama lampa BEZ zadnej grupy.
   *
   * `pionMiedzyKondygnacjami` tego nie ratowal: dolicza jedno przejscie przez strop
   * na kondygnacje dla ZASILANIA, a przewod sterowniczy to osobny kabel i osobne
   * przejscie.
   */
  describe("ogniwo sterowania przez strop", () => {
    const kondygnacje: Floor[] = [
      { id: "parter", name: "Parter", heightM: 2.8 },
      { id: "pietro", name: "Pietro", heightM: 2.6 },
    ];
    const skale = { parter: 0.05, pietro: 0.05 };
    /** Lacznik na parterze i lampa na pietrze, zwiazane RECZNYM numerem 7 — jedyny
     *  sposob, w jaki taka grupa daje sie w tym modelu w ogole wyrazic. */
    const lacznik = el("wlacznikSchodowy", { id: "sw-dol", x: 40, y: 100, room: "Klatka", floor: "parter", lightGroup: [7] });
    const lampaG = el("oswietlenie", { id: "lampa-gora", x: 100, y: 100, room: "Klatka g", floor: "pietro", lightGroup: [7] });
    const bezNumeru = (e: InstallationElement) => ({ ...e, lightGroup: undefined });

    it("kosztuje metry — sama grupa przez strop nie jest darmowa", () => {
      const zGrupa = estimateRoutesByFloor(panel, [lampaG], skale, 1.5, {
        wszystkieElementy: [lacznik, lampaG],
        kondygnacje,
      })!;
      const bezGrupy = estimateRoutesByFloor(panel, [bezNumeru(lampaG)], skale, 1.5, {
        wszystkieElementy: [bezNumeru(lacznik), bezNumeru(lampaG)],
        kondygnacje,
      })!;
      expect(zGrupa.totalM).toBeGreaterThan(bezGrupy.totalM);
      // Przejscie przez strop to wysokosc DOLNEJ kondygnacji z pary — samo w sobie
      // wiecej niz 2,5 m, wiec roznica nie moze byc symboliczna.
      expect(zGrupa.totalM - bezGrupy.totalM).toBeGreaterThan(2.8);
    });

    it("wydluza trase do spadku napiecia, nie tylko rachunek", () => {
      const zGrupa = estimateRoutesByFloor(panel, [lampaG], skale, 1.5, {
        wszystkieElementy: [lacznik, lampaG],
        kondygnacje,
      })!;
      const bezGrupy = estimateRoutesByFloor(panel, [bezNumeru(lampaG)], skale, 1.5, {
        wszystkieElementy: [bezNumeru(lacznik), bezNumeru(lampaG)],
        kondygnacje,
      })!;
      // Zanizony worstCaseM to za cienki przewod — blad w strone niebezpieczna.
      expect(zGrupa.worstCaseM).toBeGreaterThan(bezGrupy.worstCaseM);
    });

    /** Wynik oznaczony jako szacunek nie jest formalnoscia — to informacja, ze trasa
     *  moze byc dluzsza, niz policzono, czyli ze spadek napiecia jest zanizony.
     *  Test ma sens tylko z geometria, po ktorej trasy W OBREBIE pieter licza sie
     *  dokladnie: wtedy widac, ze to ogniwo PRZEZ STROP przestawia flage. */
    it("liczy sie SZACUNKIEM, bo geometrii dwoch pieter nie da sie skleic w jedna trase", () => {
      const pokoj = (id: string, floor: string): RoomShape => ({
        id,
        floor,
        name: "Klatka",
        color: "#3B8C63",
        points: [
          { x: 0, y: 0 },
          { x: 400, y: 0 },
          { x: 400, y: 300 },
          { x: 0, y: 300 },
        ],
      });
      const geometria = { walls: [], roomShapes: [pokoj("r-p", "parter"), pokoj("r-g", "pietro")], openings: [] };
      const bezGrupy = estimateRoutesByFloor(panel, [bezNumeru(lampaG)], skale, 1.5, {
        wszystkieElementy: [bezNumeru(lacznik), bezNumeru(lampaG)],
        kondygnacje,
        geometria,
      })!;
      // Kontrola zalozenia: bez ogniwa przez strop ta sama scena NIE jest szacunkiem.
      expect(bezGrupy.szacunek).toBe(false);
      const zGrupa = estimateRoutesByFloor(panel, [lampaG], skale, 1.5, {
        wszystkieElementy: [lacznik, lampaG],
        kondygnacje,
        geometria,
      })!;
      expect(zGrupa.szacunek).toBe(true);
    });

    /**
     * Numery grup nadaje sie w zasiegu kondygnacji, wiec AUTOMATYCZNA grupa 1 na
     * parterze i automatyczna 1 na pietrze to dwie rozne grupy o tym samym numerze.
     * Sklejenie ich wyhodowaloby kabel miedzy pokojami, ktorych nic nie laczy — stad
     * ogniwo przez strop liczy sie TYLKO przy numerze wpisanym recznie po obu stronach.
     */
    it("nie skleja dwoch AUTOMATYCZNYCH grup o tym samym numerze z roznych pieter", () => {
      const swDol = el("wlacznik", { id: "auto-sw", x: 40, y: 100, room: "Pokoj dol", floor: "parter" });
      const lampaDol = el("oswietlenie", { id: "auto-lampa-dol", x: 60, y: 100, room: "Pokoj dol", floor: "parter" });
      const swGora = el("wlacznik", { id: "auto-sw-g", x: 40, y: 100, room: "Pokoj gora", floor: "pietro" });
      const lampaGora = el("oswietlenie", { id: "auto-lampa-g", x: 60, y: 100, room: "Pokoj gora", floor: "pietro" });
      const wszystkie = [swDol, lampaDol, swGora, lampaGora];
      const razem = estimateRoutesByFloor(panel, [lampaDol, lampaGora], skale, 1.5, { wszystkieElementy: wszystkie, kondygnacje })!;
      const osobno =
        estimateRoutesByFloor(panel, [lampaDol], skale, 1.5, { wszystkieElementy: [swDol, lampaDol], kondygnacje })!.totalM +
        estimateRoutesByFloor(panel, [lampaGora], skale, 1.5, { wszystkieElementy: [swGora, lampaGora], kondygnacje })!.totalM;
      expect(razem.totalM).toBeCloseTo(osobno, 5);
    });

    /**
     * ZASILANIE IDZIE DO LACZNIKA, TAKZE PRZEZ STROP. Dla grupy w obrebie pietra
     * oprawa nie trafia do lancucha zasilania w ogole — trafia tam LACZNIK, a oprawa
     * wisi za nim na ogniwie sterowania. Przy grupie przez strop
     * `findControllingSwitch` nie widzial lacznika pietro nizej, wiec oprawa wpadala
     * do lancucha jako punkt zasilany wprost i dostawala JESZCZE ogniwo. Do jednej
     * oprawy dochodzil w modelu drugi kabel, ktorego nikt nie polozy.
     *
     * Test jest na tym, ze POZYCJA oprawy rusza juz tylko ogniwem sterowania: przy
     * wlasnym lancuchu zasilania odsuniecie jej o 200 jedn. (10 m w tej skali)
     * wydluzyloby OBIE trasy, czyli okolo 20 m zamiast 10.
     */
    it("oprawa sterowana z innego pietra nie ma wlasnego lancucha zasilania", () => {
      const daleko = { ...lampaG, x: 300 };
      const metry = (lampa: InstallationElement) =>
        estimateRoutesByFloor(panel, [lampa], skale, 1.5, { wszystkieElementy: [lacznik, lampa], kondygnacje })!.totalM;
      expect(metry(daleko) - metry(lampaG)).toBeCloseTo(10, 1);
    });

    /**
     * Druga polowa tej samej reguly: skoro zasilanie idzie do lacznika, to lacznik
     * musi byc w lancuchu SWOJEJ kondygnacji. Sprawdzane na dwoch pozycjach o tej
     * samej dlugosci ogniwa (obie 60 jedn. od oprawy), a roznej odleglosci od
     * rozdzielnicy — rusza sie wiec wylacznie lancuch zasilania, o 120 jedn. = 6 m.
     * Gdyby lacznika w lancuchu nie bylo, wynik nie zmienilby sie wcale.
     */
    it("lacznik wchodzi do lancucha zasilania SWOJEJ kondygnacji", () => {
      const blisko = { ...lacznik, x: 40, y: 100 };
      const dalej = { ...lacznik, x: 160, y: 100 };
      const metry = (sw: InstallationElement) =>
        estimateRoutesByFloor(panel, [lampaG], skale, 1.5, { wszystkieElementy: [sw, lampaG], kondygnacje })!.totalM;
      expect(metry(dalej) - metry(blisko)).toBeCloseTo(6, 1);
    });

    /** Obwod, z ktorego po wyjeciu oprawy nie zostaje na jej pietrze NIC, nadal ma
     *  wynik — liczy sie od lacznika na kondygnacji nizej. Wczesniej pusta lista
     *  elementow konczyla sie `null`, czyli uniewaznieniem calego obwodu. */
    it("obwod nie znika, gdy jedyna oprawa wypada z lancucha swojego pietra", () => {
      const r = estimateRoutesByFloor(panel, [lampaG], skale, 1.5, { wszystkieElementy: [lacznik, lampaG], kondygnacje });
      expect(r).not.toBeNull();
      expect(r!.totalM).toBeGreaterThan(0);
    });

    it("grupa w obrebie JEDNEJ kondygnacji liczy sie tak jak dotad", () => {
      const sw = el("wlacznik", { id: "sw-1", x: 40, y: 100, room: "Klatka", floor: "parter", lightGroup: [7] });
      const lampa = el("oswietlenie", { id: "lampa-1", x: 100, y: 100, room: "Klatka", floor: "parter", lightGroup: [7] });
      const wielopietrowo = estimateRoutesByFloor(panel, [lampa], skale, 1.5, { wszystkieElementy: [sw, lampa], kondygnacje })!;
      const jednopietrowo = estimateRoutes(panel.glowna, [lampa], 0.05, 1.5, { wszystkieElementy: [sw, lampa], wysokoscKondygnacjiM: 2.8 })!;
      expect(wielopietrowo.totalM).toBeCloseTo(jednopietrowo.totalM, 5);
    });
  });

  it("bez rozdzielnicy i bez elementow nie ma czego mierzyc", () => {
    expect(estimateRoutesByFloor({ poKondygnacji: new Map(), glowna: null, glownaKondygnacja: null }, [naParterze], { parter: 0.05 })).toBeNull();
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
 * Zakonczenie trasy przy oprawie sufitowej: przewod ma dochodzic do KRAWEDZI symbolu
 * pod katem PROSTYM, a nie przebijac go na wylot do srodka ani wchodzic ukosem.
 */
describe("przytnijDoKrawedzi", () => {
  const trasa = (...p: [number, number][]) => p.map(([x, y]) => ({ x, y }));

  /**
   * Przyciecie liczone WZDLUZ LAMANEJ, nie w linii prostej do srodka: skracamy droge
   * dokladnie o tyle, ile zajmuje symbol, niezaleznie od tego, pod jakim katem przewod
   * nadchodzi.
   */
  it("skraca trase o promien symbolu, mierzac wzdluz niej", () => {
    const out = przytnijDoKrawedzi(trasa([100, 20], [100, 90]), 7);
    expect(out).toEqual(trasa([100, 20], [100, 83]));
  });

  it("nie dokłada zadnego zalamania — trasa po prostu konczy sie wczesniej", () => {
    const out = przytnijDoKrawedzi(trasa([0, 0], [100, 0], [100, 60]), 6);
    expect(out).toEqual(trasa([0, 0], [100, 0], [100, 54]));
  });

  /**
   * Sedno zmiany: do oprawy wchodzi sie POD KATEM PROSTYM. Wczesniej, gdy przyciecie
   * przekraczalo zalamanie, ostatni odcinek scinal zakret i wchodzil ukosem — a oprawa
   * wisi pod stropem i przewod schodzi do niej prosto od strony, z ktorej nadszedl.
   */
  it("przyciecie siegajace ZA zalamanie nie robi ukosu — konczy na odcinku sprzed niego", () => {
    // Ogon za zakretem ma 8 jednostek, promien 6 — przyciecie zostaje na nim.
    const out = przytnijDoKrawedzi(trasa([0, 0], [100, 0], [100, 8]), 6);
    expect(out).toEqual(trasa([0, 0], [100, 0], [100, 2]));
    // Kazdy odcinek jest pionowy albo poziomy — zaden ukos.
    for (let i = 1; i < out.length; i++) {
      expect(Math.min(Math.abs(out[i].x - out[i - 1].x), Math.abs(out[i].y - out[i - 1].y))).toBeCloseTo(0, 6);
    }
  });

  it("trasa krotsza niz zasieg symbolu zostaje nietknieta — nie ma czego przycinac", () => {
    const wejscie = trasa([100, 0], [100, 4]);
    expect(przytnijDoKrawedzi(wejscie, 6)).toEqual(wejscie);
  });

  it("zerowy promien nic nie zmienia", () => {
    const wejscie = trasa([0, 0], [100, 0], [100, 60]);
    expect(przytnijDoKrawedzi(wejscie, 0)).toEqual(wejscie);
  });
});

/**
 * Odczep do NOZKI osprzetu przysciennego. Gniazdo stoi trzonkiem w sciane, a trasa
 * biegnie rownolegle do niej kilka jednostek dalej — przewod ma trafic w koniec
 * trzonka (tam siedzi puszka), a nie w srodek symbolu narysowany w pomieszczeniu.
 */
describe("zakonczPrzyNozce", () => {
  const trasa = (...p: [number, number][]) => p.map(([x, y]) => ({ x, y }));

  it("odbija pod 45 stopni: tyle wzdluz trasy, ile w poprzek do celu", () => {
    // Trasa w dol po x = 100, cel szesc jednostek w bok, na wysokosci jej konca.
    const out = zakonczPrzyNozce(trasa([100, 0], [100, 60]), { x: 106, y: 60 });
    expect(out).toEqual(trasa([100, 0], [100, 54], [106, 60]));
    // Skos ma rowne skladowe — to jest definicja 45 stopni, wiec sprawdzamy ja wprost.
    expect(out[2].x - out[1].x).toBeCloseTo(out[2].y - out[1].y, 6);
  });

  it("cel LEZACY NA PRZEDLUZENIU trasy — przewod dochodzi wprost, bez zalamania", () => {
    // Gniazdo na koncu ciagu przy tej samej scianie: skos wypadlby za elementem.
    // Dotychczasowy koniec lezy POSRODKU prostej, wiec znika — zostawiony dzielilby
    // odcinek na dwa, a te przy rozsuwaniu wiazki dostaja osobne przesuniecia
    // i przy elemencie robi sie mikroschodek.
    const out = zakonczPrzyNozce(trasa([0, 0], [100, 0]), { x: 110, y: 0 });
    expect(out).toEqual(trasa([0, 0], [110, 0]));
  });

  /**
   * Sedno zgloszenia: linia ma isc ROWNOLEGLE do sciany i odbijac dopiero przy
   * elemencie. Skos rozlozony na cala dlugosc sciany jest bledem, nawet jesli
   * konczy sie we wlasciwym punkcie.
   */
  it("odcinek biegnacy wzdluz sciany zostaje PROSTY — skos tylko na koncu", () => {
    const out = zakonczPrzyNozce(trasa([514, 40], [514, 240]), { x: 520, y: 240 });
    expect(out).toEqual(trasa([514, 40], [514, 234], [520, 240]));
    // wszystko poza ostatnim odcinkiem trzyma sie jednej prostej x = 514
    expect(out.slice(0, -1).every((p) => p.x === 514)).toBe(true);
  });

  it("trasa krotsza niz potrzebne cofniecie zostaje cala, z doprowadzeniem do celu", () => {
    const out = zakonczPrzyNozce(trasa([100, 0], [100, 2]), { x: 108, y: 2 });
    expect(out).toEqual(trasa([100, 0], [100, 2], [108, 2]));
  });
});

/**
 * Rozdzielnica tez jest osprzetem przysciennym: przewody wychodza z jej OBUDOWY,
 * nie ze srodka symbolu. Dopoki startowaly ze srodka, przy kilku obwodach robila
 * sie wiazka linii zbiegajaca sie w jednym punkcie NA symbolu — czyli dokladnie
 * tam, gdzie rysunek pokazuje aparaty.
 */
describe("buildCableRoutes — poczatek przy rozdzielnicy", () => {
  const POKOJ = {
    id: "r1",
    floor: "parter",
    name: "Salon",
    color: "#3B8C63",
    points: [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 200 },
      { x: 0, y: 200 },
    ],
  };
  /** Polowa wysokosci pudelka rozdzielnicy (26) — o tyle jej srodek stoi od sciany. */
  const ZASIEG = 13;
  // Rozdzielnica przyklejona do DOLNEJ sciany pokoju: obrot 180 kieruje jej strone
  // montazowa w +y, wiec obudowa dotyka linii y = 200.
  const rozdzielnica = el("rozdzielnica", { x: 100, y: 200 - ZASIEG, rotation: 180 });
  const panel = { x: rozdzielnica.x, y: rozdzielnica.y };

  function trasyZ(punkty: InstallationElement[]) {
    return buildCableRoutes(
      panel,
      punkty.map((p, i) => ({
        id: `obw${i}`,
        name: `Obwód ${i}`,
        type: "gniazdko" as ElementType,
        elements: [p],
        cable: "YDYp 3x2,5 mm²",
        breaker: "B16",
        rcd: true,
      })),
      [rozdzielnica, ...punkty],
      [],
      [POKOJ]
    );
  }

  it("przewod wychodzi z KRAWEDZI rozdzielnicy przy scianie, nie z jej srodka", () => {
    const [r] = trasyZ([el("gniazdko", { x: 193, y: 60, rotation: 90 })]);
    expect(r.viaWalls).toBe(true); // inaczej test nie sprawdzalby tego, co mysli
    expect(r.points[0]).toEqual({ x: 100, y: 200 });
    expect(r.points[0]).not.toEqual(panel);
  });

  it("kilka obwodow startuje z TEGO SAMEGO punktu na obudowie — nie kazdy ze srodka", () => {
    const trasy = trasyZ([
      el("gniazdko", { x: 193, y: 60, rotation: 90 }),
      el("gniazdko", { x: 7, y: 60, rotation: 270 }),
    ]);
    expect(trasy).toHaveLength(2);
    for (const r of trasy) expect(r.points[0]).toEqual({ x: 100, y: 200 });
  });
});

/**
 * Szacunek dlugosci a NARYSOWANA trasa.
 *
 * Kolejnosc punktow byla wspolna od dawna (`kolejnoscLancucha`), ale DLUGOSC kazdego
 * ogniwa liczyly inaczej: szacunek w linii lamanej miedzy punktami, rysunek naokolo
 * wzdluz scian. Roznica zalezy od ulozenia i wlasnie dlatego jest zdradliwa —
 * zmierzone na pokoju 400 x 300: 3-5% przy gniazdach wzdluz jednej sciany, ale 22%,
 * gdy lancuch przechodzi miedzy scianami PRZECIWLEGLYMI. Manhattan tnie wtedy przez
 * srodek pokoju, a kabel musi obejsc.
 *
 * Blad szedl w strone NIEBEZPIECZNA: `worstCaseM` idzie wprost do spadku napiecia,
 * wiec krotsza trasa to mniejszy spadek i zgoda na cienszy przewod, niz trzeba.
 */
describe("estimateRoutes — zgodnosc z narysowana trasa", () => {
  const POKOJ: RoomShape = {
    id: "r1",
    floor: "parter",
    name: "Salon",
    color: "#3B8C63",
    points: [
      { x: 0, y: 0 },
      { x: 400, y: 0 },
      { x: 400, y: 300 },
      { x: 0, y: 300 },
    ],
  };
  const geo = { walls: [], roomShapes: [POKOJ], openings: [] };
  const rozdzielnica = el("rozdzielnica", { x: 20, y: 287, rotation: 180 });
  const punkt = { x: rozdzielnica.x, y: rozdzielnica.y };
  /** Pion i zapas dla gniazda przy rozdzielnicy na 1,5 m: (2,8−1,5) + (2,8−0,3) + 1,5. */
  const NADDATEK = 4.3;

  /** Suma dlugosci odcinkow NARYSOWANYCH na rzucie [jednostki planu]. */
  function dlugoscRysunku(gniazda: InstallationElement[]): number {
    const c: Circuit = { id: "o1", name: "Obwód", type: "gniazdko", elements: gniazda, cable: "", breaker: "", rcd: true };
    return buildCableRoutes(punkt, [c], [rozdzielnica, ...gniazda], geo.walls, geo.roomShapes, geo.openings).reduce(
      (s, t) => s + t.lengthUnits,
      0
    );
  }

  const wzdluzJednejSciany = [
    el("gniazdko", { x: 393, y: 60, rotation: 90 }),
    el("gniazdko", { x: 393, y: 150, rotation: 90 }),
    el("gniazdko", { x: 393, y: 240, rotation: 90 }),
  ];
  /** Uklad, w ktorym Manhattan tnie przez srodek pokoju, a kabel musi obejsc scianami. */
  const scianyPrzeciwlegle = [
    el("gniazdko", { x: 7, y: 60, rotation: 270 }),
    el("gniazdko", { x: 393, y: 60, rotation: 90 }),
  ];

  /**
   * Sedno poprawki. `metersPerUnit` = 1, wiec metry sa jednostkami planu i da sie
   * porownac wprost; od `worstCaseM` odejmujemy naddatek pionowy, ktorego na rzucie
   * nie widac.
   *
   * Zostaje kilka procent roznicy i to jest zrozumiale: rysunek dokłada na obu koncach
   * dojscia do obudowy rozdzielnicy i do nozki gniazda (patrz `zakonczPrzyNozce`),
   * a szacunek liczy od srodka do srodka i pokrywa to ryczaltem `SLACK_M`. Pilnujemy
   * wiec ZGODNOSCI, nie identycznosci.
   */
  it("bieg poziomy zgadza sie z dlugoscia narysowanej trasy", () => {
    for (const gniazda of [wzdluzJednejSciany, scianyPrzeciwlegle]) {
      const poziom = estimateRoutes(punkt, gniazda, 1, undefined, { geometria: geo })!.worstCaseM - NADDATEK;
      const rysunek = dlugoscRysunku(gniazda);
      expect(Math.abs(poziom - rysunek)).toBeLessThan(rysunek * 0.1);
    }
  });

  it("z geometria szacunek NIGDY nie jest krotszy niz bez niej", () => {
    for (const gniazda of [wzdluzJednejSciany, scianyPrzeciwlegle]) {
      const bez = estimateRoutes(punkt, gniazda, 1)!;
      const zGeo = estimateRoutes(punkt, gniazda, 1, undefined, { geometria: geo })!;
      expect(zGeo.worstCaseM).toBeGreaterThanOrEqual(bez.worstCaseM);
      expect(zGeo.totalM).toBeGreaterThanOrEqual(bez.totalM);
    }
  });

  /** Uklad, dla ktorego cala poprawka powstala: Manhattan zaniza tu o jedna piata. */
  it("przy scianach PRZECIWLEGLYCH roznica jest istotna, nie kosmetyczna", () => {
    const bez = estimateRoutes(punkt, scianyPrzeciwlegle, 1)!;
    const zGeo = estimateRoutes(punkt, scianyPrzeciwlegle, 1, undefined, { geometria: geo })!;
    expect(zGeo.worstCaseM - NADDATEK).toBeGreaterThan((bez.worstCaseM - NADDATEK) * 1.15);
  });

  /** Bez geometrii (brak rysunku, stare zapisy, testy doboru) zostaje dokladnie to,
   *  co bylo — zeby wpiecie tras nie zmienilo po cichu wynikow tam, gdzie ich nie ma. */
  it("bez geometrii zachowanie zostaje takie jak dotad (Manhattan)", () => {
    const r = estimateRoutes({ x: 0, y: 0 }, [el("gniazdko", { x: 30, y: 40 })], 0.1)!;
    expect(r.worstCaseM).toBeCloseTo(7 + NADDATEK, 1); // (30+40) * 0,1 = 7 m
  });

  /**
   * Szacunek Manhattan jest KROTSZY od drogi, ktora przewod naprawde pokona, wiec zaniza
   * spadek napiecia. Zaniżenie to jedyny kierunek bledu, ktory w tej aplikacji jest
   * niebezpieczny — i dotad dzialo sie po cichu. Teraz wynik NIESIE te informacje.
   */
  it("bez geometrii wynik jest oznaczony jako SZACUNEK", () => {
    expect(estimateRoutes(punkt, [el("gniazdko", { x: 300, y: 50 })], 0.05)!.szacunek).toBe(true);
  });

  it("z geometria, po ktorej da sie poprowadzic trase, wynik NIE jest szacunkiem", () => {
    const r = estimateRoutes(punkt, [el("gniazdko", { x: 300, y: 50 })], 0.05, undefined, { geometria: geo })!;
    expect(r.szacunek).toBe(false);
  });

  /** Geometria JEST, ale pusta — routing nie ma po czym prowadzic, wiec wynik jest
   *  szacunkiem tak samo jak przy jej calkowitym braku. */
  it("pusta geometria liczy sie jako szacunek", () => {
    const pusta = { walls: [], roomShapes: [], openings: [] };
    const r = estimateRoutes(punkt, [el("gniazdko", { x: 300, y: 50 })], 0.05, undefined, { geometria: pusta })!;
    expect(r.szacunek).toBe(true);
  });

  /** Gdy routing nie ma po czym prowadzic trasy, szacunek nie moze zwrocic zera ani
   *  wyjatku — spada na Manhattan, dokladnie tak jak rysunek spada na przerywana. */
  it("geometria bez scian i obrysow nie psuje wyniku — zostaje Manhattan", () => {
    const pusta = { walls: [], roomShapes: [], openings: [] };
    const zPusta = estimateRoutes({ x: 0, y: 0 }, [el("gniazdko", { x: 30, y: 40 })], 0.1, undefined, { geometria: pusta })!;
    const bez = estimateRoutes({ x: 0, y: 0 }, [el("gniazdko", { x: 30, y: 40 })], 0.1)!;
    expect(zPusta).toEqual(bez);
  });
});
/**
 * PION MIEDZY KONDYGNACJAMI.
 *
 * Trasa z rozdzielnicy na parterze do gniazda na pietrze dostawala sam rzut poziomy —
 * plan nie wiedzial, ze po drodze jest strop. Przy typowej kondygnacji to kilka metrow
 * na obwod, znowu zaniżonych, czyli w strone zbyt cienkiego przewodu.
 *
 * Kolejnosc w `floors` jest kolejnoscia kondygnacji (nowe dokladaja sie na koncu listy)
 * i to jedyna informacja o ich ukladzie, jaka projekt niesie.
 */
describe("estimateRoutesByFloor — pion miedzy kondygnacjami", () => {
  const FLOORS: Floor[] = [
    { id: "parter", name: "Parter" },
    { id: "pietro", name: "Piętro" },
    { id: "poddasze", name: "Poddasze" },
  ];
  /** Domyslna wysokosc kondygnacji (WYSOKOSC_KONDYGNACJI_M) — obowiazuje, dopoki
   *  projekt nie poda wlasnej w `Floor.heightM`. */
  const WYSOKOSC = 2.8;
  const skale = { parter: 0.05, pietro: 0.05, poddasze: 0.05 };
  /** Jedna rozdzielnica, na parterze — typowy dom. */
  const tylkoParter = {
    poKondygnacji: new Map([["parter", { x: 0, y: 0 }]]),
    glowna: { x: 0, y: 0 },
    glownaKondygnacja: "parter",
  };
  const naPietrze = el("gniazdko", { x: 100, y: 0, floor: "pietro" });

  it("obwod siegajacy pietra dostaje pion o wysokosc kondygnacji", () => {
    const bez = estimateRoutesByFloor(tylkoParter, [naPietrze], skale)!;
    const zPionem = estimateRoutesByFloor(tylkoParter, [naPietrze], skale, undefined, { kondygnacje: FLOORS })!;
    expect(zPionem.worstCaseM - bez.worstCaseM).toBeCloseTo(WYSOKOSC, 5);
    expect(zPionem.totalM - bez.totalM).toBeCloseTo(WYSOKOSC, 5);
  });

  it("dwie kondygnacje wyzej to dwie wysokosci", () => {
    const naPoddaszu = el("gniazdko", { x: 100, y: 0, floor: "poddasze" });
    const bez = estimateRoutesByFloor(tylkoParter, [naPoddaszu], skale)!;
    const zPionem = estimateRoutesByFloor(tylkoParter, [naPoddaszu], skale, undefined, { kondygnacje: FLOORS })!;
    expect(zPionem.worstCaseM - bez.worstCaseM).toBeCloseTo(2 * WYSOKOSC, 5);
  });

  /** Pietro z WLASNA podrozdzielnica liczy sie od niej — pionu nie ma, bo obwod nigdzie
   *  nie przechodzi przez strop. Zasilanie samej podrozdzielnicy to osobna sprawa (WLZ). */
  it("pietro z wlasna podrozdzielnica nie dostaje pionu", () => {
    const zPodrozdzielnica = {
      poKondygnacji: new Map([
        ["parter", { x: 0, y: 0 }],
        ["pietro", { x: 0, y: 0 }],
      ]),
      glowna: { x: 0, y: 0 },
      glownaKondygnacja: "parter",
    };
    const bez = estimateRoutesByFloor(zPodrozdzielnica, [naPietrze], skale)!;
    const zPionem = estimateRoutesByFloor(zPodrozdzielnica, [naPietrze], skale, undefined, { kondygnacje: FLOORS })!;
    expect(zPionem.worstCaseM).toBeCloseTo(bez.worstCaseM, 5);
  });

  /** Pion doliczany RAZ na kondygnacje, nie na punkt: kabel wchodzi na pietro jeden raz
   *  i dopiero tam rozchodzi sie lancuchem. */
  it("pion liczy sie raz na kondygnacje, a nie po razie na kazde gniazdo", () => {
    const troje = [
      el("gniazdko", { x: 100, y: 0, floor: "pietro" }),
      el("gniazdko", { x: 120, y: 0, floor: "pietro" }),
      el("gniazdko", { x: 140, y: 0, floor: "pietro" }),
    ];
    const bez = estimateRoutesByFloor(tylkoParter, troje, skale)!;
    const zPionem = estimateRoutesByFloor(tylkoParter, troje, skale, undefined, { kondygnacje: FLOORS })!;
    expect(zPionem.totalM - bez.totalM).toBeCloseTo(WYSOKOSC, 5);
  });

  /** Kondygnacja spoza listy: lepiej nie doliczyc nic, niz doliczyc z pozycji zgadywanej. */
  it("kondygnacja nieznana na liscie nie dostaje zadnego pionu", () => {
    const gdzieIndziej = el("gniazdko", { x: 100, y: 0, floor: "piwnica" });
    const skaleZPiwnica = { ...skale, piwnica: 0.05 };
    const bez = estimateRoutesByFloor(tylkoParter, [gdzieIndziej], skaleZPiwnica)!;
    const zPionem = estimateRoutesByFloor(tylkoParter, [gdzieIndziej], skaleZPiwnica, undefined, { kondygnacje: FLOORS })!;
    expect(zPionem.worstCaseM).toBeCloseTo(bez.worstCaseM, 5);
  });

  /** Bez listy kondygnacji zostaje dokladnie to, co bylo — zeby wpiecie pionow nie
   *  zmienilo po cichu wynikow tam, gdzie tej informacji nie ma. */
  it("bez listy kondygnacji zachowanie zostaje takie jak dotad", () => {
    const a = estimateRoutesByFloor(tylkoParter, [naPietrze], skale)!;
    const b = estimateRoutesByFloor(tylkoParter, [naPietrze], skale, undefined, {})!;
    expect(a).toEqual(b);
  });
});
/**
 * OBWOD OSWIETLENIOWY ZE STEROWANIEM.
 *
 * Zasilanie idzie do LACZNIKA, a dopiero stamtad przewod rozchodzi sie do opraw —
 * rysunek robil tak od dawna, szacunek nie. Pchal lancuch z rozdzielnicy wprost do
 * opraw i wychodzil krotszy. Zmierzone na pokoju z lacznikiem przy przeciwleglej
 * scianie: rysunek 1000 jednostek, szacunek 677, czyli o jedna trzecia mniej.
 * Znowu w strone niebezpieczna, bo `worstCaseM` idzie do spadku napiecia.
 */
describe("estimateRoutes — obwod oswietleniowy sterowany lacznikiem", () => {
  const POKOJ: RoomShape = {
    id: "r1",
    floor: "parter",
    name: "Salon",
    color: "#3B8C63",
    points: [
      { x: 0, y: 0 },
      { x: 400, y: 0 },
      { x: 400, y: 300 },
      { x: 0, y: 300 },
    ],
  };
  const geometria = { walls: [], roomShapes: [POKOJ], openings: [] };
  const rozdzielnica = el("rozdzielnica", { x: 20, y: 287, rotation: 180 });
  const punkt = { x: rozdzielnica.x, y: rozdzielnica.y };
  /** Lacznik przy PRZECIWLEGLEJ scianie — zeby objazd przez niego byl wyrazny. */
  const lacznik = el("wlacznik", { x: 380, y: 287, rotation: 180 });
  const oprawy = [el("oswietlenie", { x: 150, y: 100 }), el("oswietlenie", { x: 300, y: 100 })];
  const wszystkieElementy = [rozdzielnica, lacznik, ...oprawy];

  /** Suma WSZYSTKICH odcinkow narysowanych na rzucie — zasilania i sterowania. */
  function dlugoscRysunku(): number {
    const c: Circuit = { id: "o1", name: "Obwód", type: "oswietlenie", elements: oprawy, cable: "", breaker: "", rcd: true };
    return buildCableRoutes(punkt, [c], wszystkieElementy, [], [POKOJ], []).reduce((s, t) => s + t.lengthUnits, 0);
  }

  it("szacunek materialu zgadza sie z tym, co widac na rzucie", () => {
    const r = estimateRoutes(punkt, oprawy, 1, undefined, { geometria, wszystkieElementy })!;
    const rysunek = dlugoscRysunku();
    expect(Math.abs(r.totalM - rysunek)).toBeLessThan(rysunek * 0.1);
  });

  it("bez wiedzy o laczniku szacunek jest ISTOTNIE krotszy — to jest naprawiany blad", () => {
    const bez = estimateRoutes(punkt, oprawy, 1, undefined, { geometria })!;
    const zLacznikiem = estimateRoutes(punkt, oprawy, 1, undefined, { geometria, wszystkieElementy })!;
    expect(zLacznikiem.totalM).toBeGreaterThan(bez.totalM * 1.2);
    expect(zLacznikiem.worstCaseM).toBeGreaterThan(bez.worstCaseM);
  });

  /** Gniazda nie maja sterowania, wiec podanie wszystkich elementow nie moze ich ruszyc. */
  it("obwod gniazdowy nie zmienia sie od podania wszystkich elementow", () => {
    const gniazda = [el("gniazdko", { x: 393, y: 60, rotation: 90 }), el("gniazdko", { x: 393, y: 150, rotation: 90 })];
    const wszystko = [rozdzielnica, lacznik, ...gniazda];
    const bez = estimateRoutes(punkt, gniazda, 1, undefined, { geometria })!;
    const ze = estimateRoutes(punkt, gniazda, 1, undefined, { geometria, wszystkieElementy: wszystko })!;
    expect(ze).toEqual(bez);
  });

  /** Oprawa BEZ lacznika na planie zasila sie wprost — nie ma czego przekierowywac. */
  it("oprawa bez lacznika liczy sie jak dotad", () => {
    const bezLacznika = [rozdzielnica, ...oprawy];
    const a = estimateRoutes(punkt, oprawy, 1, undefined, { geometria })!;
    const b = estimateRoutes(punkt, oprawy, 1, undefined, { geometria, wszystkieElementy: bezLacznika })!;
    expect(b).toEqual(a);
  });
});

/**
 * Ukos a TRZONEK gniazda — sprawdzenie tego, co przy poprzedniej zmianie zostalo
 * przyjete na oko i okazalo sie nieprawda.
 *
 * Rozumowanie bylo takie: korytarz biegnie 5 jednostek od sciany, symbol siega 10,5,
 * wiec ukos musi przeciac trzonek. Nie musi i nie przecina. Trzonek stoi PROSTOPADLE
 * do sciany dokladnie na wysokosci gniazda, a ukos dochodzi do jego konca od BOKU —
 * spotykaja sie w jednym punkcie, ktorym jest sam koniec trzonka.
 */
describe("zakonczPrzyNozce — ukos kontra trzonek", () => {
  /** Czy odcinki maja punkt wspolny INNY niz podany (z tolerancja na zaokraglenia). */
  function przecinaPozaPunktem(a1: Point, a2: Point, b1: Point, b2: Point, wspolny: Point): boolean {
    const kier = (p: Point, q: Point, r: Point) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
    // Probkujemy ukos gesto i sprawdzamy, czy ktorykolwiek punkt POZA `wspolny`
    // lezy na drugim odcinku — prosciej i czytelniej niz analiza przypadkow.
    for (let t = 0; t <= 1; t += 0.001) {
      const p = { x: a1.x + (a2.x - a1.x) * t, y: a1.y + (a2.y - a1.y) * t };
      if (Math.hypot(p.x - wspolny.x, p.y - wspolny.y) < 0.2) continue;
      const naProstej = Math.abs(kier(b1, b2, p)) < 0.05;
      const wZakresie = p.x >= Math.min(b1.x, b2.x) - 0.05 && p.x <= Math.max(b1.x, b2.x) + 0.05;
      if (naProstej && wZakresie) return true;
    }
    return false;
  }

  it("ukos dotyka trzonka WYLACZNIE w jego koncu, nie przecina go po drodze", () => {
    // Gniazdo przy lewej scianie x = 60, srodek 7,35 od niej; korytarz na x = 65.
    const koniecTrzonka = { x: 59.65, y: 182 };
    const trasa = zakonczPrzyNozce(
      [
        { x: 65, y: 255 },
        { x: 65, y: 182 },
      ],
      koniecTrzonka
    );
    const ukos = trasa.slice(-2) as [Point, Point];
    // Trzonek: od konca przy scianie w glab pokoju, na wysokosci gniazda.
    const trzonek: [Point, Point] = [koniecTrzonka, { x: 59.65 + 8.4, y: 182 }];
    expect(przecinaPozaPunktem(ukos[0], ukos[1], trzonek[0], trzonek[1], koniecTrzonka)).toBe(false);
  });

  it("ukos ma rowne skladowe — to jest definicja 45 stopni", () => {
    const trasa = zakonczPrzyNozce(
      [
        { x: 65, y: 255 },
        { x: 65, y: 182 },
      ],
      { x: 59.65, y: 182 }
    );
    const [a, b] = trasa.slice(-2);
    expect(Math.abs(b.x - a.x)).toBeCloseTo(Math.abs(b.y - a.y), 5);
  });
});

/**
 * Wysokosc kondygnacji podana w projekcie (`Floor.heightM`).
 *
 * Pion miedzy pietrami liczyl sie dotad jako roznica poziomow razy jedna stala 2,8 m.
 * Przy wysokim parterze albo poddaszu dawalo to przewod KROTSZY od rzeczywistego — a za
 * krotki przewod to za maly policzony spadek napiecia, czyli dobor przepuszczajacy zbyt
 * cienki kabel. To jedyny kierunek bledu, ktory w tej aplikacji jest niebezpieczny.
 */
describe("estimateRoutesByFloor — wlasna wysokosc kondygnacji", () => {
  const skale = { parter: 0.05, pietro: 0.05, poddasze: 0.05 };
  const tylkoParter = {
    poKondygnacji: new Map([["parter", { x: 0, y: 0 }]]),
    glowna: { x: 0, y: 0 },
    glownaKondygnacja: "parter",
  };
  const naPietrze = el("gniazdko", { x: 100, y: 0, floor: "pietro" });
  const pietra = (parterH?: number, pietroH?: number): Floor[] => [
    { id: "parter", name: "Parter", ...(parterH === undefined ? {} : { heightM: parterH }) },
    { id: "pietro", name: "Piętro", ...(pietroH === undefined ? {} : { heightM: pietroH }) },
    { id: "poddasze", name: "Poddasze" },
  ];

  it("wysoki parter wydluza pion o roznice wysokosci", () => {
    const typowy = estimateRoutesByFloor(tylkoParter, [naPietrze], skale, undefined, { kondygnacje: pietra() })!;
    const wysoki = estimateRoutesByFloor(tylkoParter, [naPietrze], skale, undefined, { kondygnacje: pietra(3.6) })!;
    expect(wysoki.worstCaseM - typowy.worstCaseM).toBeCloseTo(3.6 - 2.8, 5);
  });

  /**
   * Sumowane sa wysokosci pieter PO DRODZE i tylko one. Poddasze lezy nad pietrem, na
   * ktorym konczy sie obwod, wiec jego wysokosc nie ma prawa niczego zmienic.
   */
  it("wysokosc kondygnacji SPOZA drogi przewodu nic nie zmienia", () => {
    const zwykle = pietra();
    const wysokiePoddasze: Floor[] = [zwykle[0], zwykle[1], { ...zwykle[2], heightM: 4.5 }];
    const a = estimateRoutesByFloor(tylkoParter, [naPietrze], skale, undefined, { kondygnacje: zwykle })!;
    const b = estimateRoutesByFloor(tylkoParter, [naPietrze], skale, undefined, { kondygnacje: wysokiePoddasze })!;
    expect(b).toEqual(a);
  });

  /**
   * Wysokosc pietra DOCELOWEGO wazy wiecej niz wysokosc tego, przez ktore przewod tylko
   * przechodzi — i tak ma byc. Przez strop przewod przechodzi RAZ (jedna wysokosc
   * parteru), a na pietrze docelowym idzie pod strop I schodzi do puszki, czyli jego
   * wysokosc liczy sie dwa razy.
   */
  it("wyzsze pietro DOCELOWE wydluza trase bardziej niz wyzszy parter po drodze", () => {
    const wysokiParter = estimateRoutesByFloor(tylkoParter, [naPietrze], skale, undefined, { kondygnacje: pietra(3.6) })!;
    const wysokiePietro = estimateRoutesByFloor(tylkoParter, [naPietrze], skale, undefined, { kondygnacje: pietra(undefined, 3.6) })!;
    const typowe = estimateRoutesByFloor(tylkoParter, [naPietrze], skale, undefined, { kondygnacje: pietra() })!;
    expect(wysokiParter.worstCaseM - typowe.worstCaseM).toBeCloseTo(3.6 - 2.8, 5);
    expect(wysokiePietro.worstCaseM - typowe.worstCaseM).toBeCloseTo(2 * (3.6 - 2.8), 5);
  });

  it("droga na poddasze to SUMA wysokosci pieter po drodze, a nie wielokrotnosc jednej", () => {
    const naPoddaszu = el("gniazdko", { x: 100, y: 0, floor: "poddasze" });
    const rozne = estimateRoutesByFloor(tylkoParter, [naPoddaszu], skale, undefined, { kondygnacje: pietra(3.6, 2.5) })!;
    const typowe = estimateRoutesByFloor(tylkoParter, [naPoddaszu], skale, undefined, { kondygnacje: pietra() })!;
    // 3,6 + 2,5 zamiast 2,8 + 2,8.
    expect(rozne.worstCaseM - typowe.worstCaseM).toBeCloseTo(3.6 + 2.5 - 2 * 2.8, 5);
  });

  /** Projekty sprzed dodania tego pola nie moga zmienic ani jednej liczby. */
  it("brak wysokosci w projekcie liczy sie tak samo jak wpisana wartosc typowa", () => {
    const bezPola = estimateRoutesByFloor(tylkoParter, [naPietrze], skale, undefined, { kondygnacje: pietra() })!;
    const zTypowa = estimateRoutesByFloor(tylkoParter, [naPietrze], skale, undefined, { kondygnacje: pietra(2.8, 2.8) })!;
    expect(bezPola).toEqual(zTypowa);
  });

  /** Wysokosc bezsensowna nie moze SKROCIC przewodu — zaniżona dlugosc to zanizony
   *  spadek napiecia. Zero i wartosci ujemne wracaja do wartosci typowej. */
  it("zerowa i ujemna wysokosc wraca do typowej, zamiast skracac przewod", () => {
    const typowa = estimateRoutesByFloor(tylkoParter, [naPietrze], skale, undefined, { kondygnacje: pietra() })!;
    for (const bezsens of [0, -3]) {
      const wynik = estimateRoutesByFloor(tylkoParter, [naPietrze], skale, undefined, { kondygnacje: pietra(bezsens) })!;
      expect(wynik.worstCaseM).toBeCloseTo(typowa.worstCaseM, 5);
    }
  });

  /** Wysokosc kondygnacji to nie tylko przejscie przez strop: na wlasnym pietrze przewod
   *  idzie pod strop i schodzi do puszki, wiec wyzsza kondygnacja wydluza takze trase,
   *  ktora nigdzie nie przechodzi. */
  it("wyzsza kondygnacja wydluza trase takze BEZ przechodzenia miedzy pietrami", () => {
    const naParterze = el("gniazdko", { x: 100, y: 0, floor: "parter" });
    const typowa = estimateRoutesByFloor(tylkoParter, [naParterze], skale, undefined, { kondygnacje: pietra() })!;
    const wysoka = estimateRoutesByFloor(tylkoParter, [naParterze], skale, undefined, { kondygnacje: pietra(3.6) })!;
    expect(wysoka.worstCaseM).toBeGreaterThan(typowa.worstCaseM);
  });
});

/**
 * Wyzsza kondygnacja a punkt SUFITOWY.
 *
 * Do oprawy pod stropem przewod nie schodzi wcale — ona JEST pod stropem. Dopoki
 * wysokosc montazu byla stala 2,8 m, kondygnacja 3,6 m dokladala 0,8 m zejscia,
 * ktorego nie ma. Blad szedl w strone bezpieczna (dlugosc zawyzona), ale byl bledem.
 */
describe("estimateRoutesByFloor — punkt sufitowy a wysokosc kondygnacji", () => {
  const skale = { parter: 0.05 };
  const panele = {
    poKondygnacji: new Map([["parter", { x: 0, y: 0 }]]),
    glowna: { x: 0, y: 0 },
    glownaKondygnacja: "parter",
  };
  const pietra = (h?: number): Floor[] => [{ id: "parter", name: "Parter", ...(h === undefined ? {} : { heightM: h }) }];

  it("oprawa sufitowa nie dostaje zejscia, ktorego nie ma", () => {
    const lampa = [el("oswietlenie", { x: 100, y: 0, floor: "parter" })];
    const typowa = estimateRoutesByFloor(panele, lampa, skale, undefined, { kondygnacje: pietra() })!;
    const wysoka = estimateRoutesByFloor(panele, lampa, skale, undefined, { kondygnacje: pietra(3.6) })!;
    // Rosnie TYLKO podejscie od rozdzielnicy pod strop (3,6 − 2,8), a nie ono i zejscie.
    expect(wysoka.worstCaseM - typowa.worstCaseM).toBeCloseTo(3.6 - 2.8, 5);
  });

  /** Dla gniazdka przy podlodze wyzszy strop wydluza OBA odcinki — podejscie i zejscie. */
  it("gniazdko przy podlodze dostaje podwojna roznice, bo przewod i wchodzi, i schodzi", () => {
    const gniazdo = [el("gniazdko", { x: 100, y: 0, floor: "parter" })];
    const typowa = estimateRoutesByFloor(panele, gniazdo, skale, undefined, { kondygnacje: pietra() })!;
    const wysoka = estimateRoutesByFloor(panele, gniazdo, skale, undefined, { kondygnacje: pietra(3.6) })!;
    expect(wysoka.worstCaseM - typowa.worstCaseM).toBeCloseTo(2 * (3.6 - 2.8), 5);
  });
});

describe("spreadOverlappingRoutes — rozsuniecie nie przekrzywia tras", () => {
  /**
   * Sedno zgloszenia „przewody nie ida prostopadle do scian": pas byl doliczany do
   * WIERZCHOLKA, a wierzcholek bral przesuniecie tego sasiada, ktory lezal w dalszym
   * pasie. Odcinek miedzy wierzcholkiem odsunietym a nieodsunietym przestawal byc
   * rownolegly do swojego pierwowzoru — i tym samym do sciany, wzdluz ktorej mial
   * biec. Przy dlugiej scianie drobna roznica pasow rozciagala sie na kilkadziesiat
   * jednostek i wychodzil przewod ciety ukosem przez cale pomieszczenie.
   */
  const POKOJ: RoomShape = {
    id: "r1",
    floor: "parter",
    name: "Salon",
    color: "#3B8C63",
    points: [
      { x: 0, y: 0 },
      { x: 300, y: 0 },
      { x: 300, y: 300 },
      { x: 0, y: 300 },
    ],
  };

  function trasa(id: string, points: Point[], over: Partial<CableRoute> = {}): CableRoute {
    return {
      id,
      circuitId: id,
      circuitName: "Obwód",
      color: "#1F6FB2",
      kind: "zasilanie",
      type: "gniazdko",
      cable: "",
      breaker: "",
      room: "Salon",
      floor: "parter",
      points,
      lengthUnits: 0,
      viaWalls: true,
      ...over,
    };
  }

  /** Kierunek odcinka z dokladnoscia do zwrotu — do porownania „rownolegle czy nie". */
  function kierunek(a: Point, b: Point): string {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.hypot(dx, dy);
    if (d < 1e-9) return "0";
    const ux = Math.abs(dx / d);
    const uy = Math.abs(dy / d);
    return `${ux.toFixed(3)},${uy.toFixed(3)}`;
  }

  /** Trasa po literze L: korytarzem przy dolnej scianie, potem w gore przy prawej. */
  const el = (id: string, over = {}) =>
    trasa(
      id,
      [
        { x: 20, y: 300 },
        { x: 20, y: 295 },
        { x: 295, y: 295 },
        { x: 295, y: 40 },
        { x: 300, y: 40 },
      ],
      over
    );

  it("kazdy odcinek narysowany jest ROWNOLEGLY do swojego pierwowzoru", () => {
    // Dwie trasy tym samym korytarzem — druga musi dostac dalszy pas, wiec jest co
    // przekrzywic. Rozne obwody, zeby pasy naprawde sie rozjechaly.
    const a = el("a");
    const b = el("b");
    const out = spreadOverlappingRoutes([a, b], [POKOJ]);
    for (const r of [a, b]) {
      const rysowane = out.get(r.id)!;
      expect(rysowane).toHaveLength(r.points.length);
      for (let i = 1; i < r.points.length; i++) {
        expect(kierunek(rysowane[i - 1], rysowane[i]), `${r.id} odcinek ${i - 1}`).toBe(
          kierunek(r.points[i - 1], r.points[i])
        );
      }
    }
  });

  it("dalsza trasa naprawde dostaje inny pas — inaczej test wyzej nic nie sprawdza", () => {
    const out = spreadOverlappingRoutes([el("a"), el("b")], [POKOJ]);
    expect(out.get("a")![2].y).not.toBeCloseTo(out.get("b")![2].y, 5);
  });
});

/**
 * Wejście do rozdzielnicy pod KĄTEM PROSTYM.
 *
 * Reszta osprzętu przyściennego dostaje odczep pod 45° do nóżki (`zakonczPrzyNozce`):
 * gniazdo ma jedną puszkę i kabel wchodzi do niej z boku. Rozdzielnica to inny
 * przypadek — schodzi się do niej kilkanaście obwodów i wchodzą w ścianę PIONEM nad
 * (albo pod) obudową, a nie ukosem przez pokój. Ustalenie produktowe: przy rozdzielnicy
 * przewód wchodzi prostopadle do ściany.
 *
 * Skutek uboczny jest tu ważniejszy od samej konwencji: dopóki pierwszy odcinek szedł
 * pod 45°, rozsuwanie wiązki (`spreadOverlappingRoutes`) wydłużało go proporcjonalnie
 * do numeru pasa — przy czwartym obwodzie robił się z tego skos na 28 jedn. wchodzący
 * w głąb pokoju. Odcinek prostopadły przy tym samym rozsunięciu tylko się wydłuża,
 * zostając prostopadłym.
 */
describe("buildCableRoutes — wejście do rozdzielnicy", () => {
  const POKOJ: RoomShape = {
    id: "r1",
    floor: "parter",
    name: "Salon",
    color: "#3B8C63",
    points: [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 200 },
      { x: 0, y: 200 },
    ],
  };
  /** Polowa wysokosci pudelka rozdzielnicy (26) — o tyle jej srodek stoi od sciany. */
  const ZASIEG = 13;
  // Rozdzielnica przy DOLNEJ scianie: obrot 180 kieruje strone montazowa w +y,
  // wiec obudowa dotyka y = 200 i przewod ma z niej wychodzic PIONOWO.
  const rozdzielnica = el("rozdzielnica", { x: 100, y: 200 - ZASIEG, rotation: 180 });
  const panel = { x: rozdzielnica.x, y: rozdzielnica.y };

  function trasyZ(punkty: InstallationElement[]) {
    return buildCableRoutes(
      panel,
      punkty.map((p, i) => ({
        id: `obw${i}`,
        name: `Obwód ${i}`,
        type: "gniazdko" as ElementType,
        elements: [p],
        cable: "YDYp 3x2,5 mm²",
        breaker: "B16",
        rcd: true,
      })),
      [rozdzielnica, ...punkty],
      [],
      [POKOJ]
    );
  }

  it("pierwszy odcinek jest PROSTOPADLY do ściany rozdzielnicy, nie pod 45°", () => {
    const [r] = trasyZ([el("gniazdko", { x: 193, y: 60, rotation: 90 })]);
    expect(r.viaWalls).toBe(true); // inaczej test nie sprawdza tego, co myśli
    const [a, b] = r.points;
    expect(a).toEqual({ x: 100, y: 200 });
    // Ściana jest pozioma, więc odejście od niej ma nie mieć składowej X.
    expect(Math.abs(b.x - a.x)).toBeLessThan(0.01);
    expect(Math.abs(b.y - a.y)).toBeGreaterThan(0.01);
  });

  it("prostopadłość trzyma się także po rozsunięciu wiązki na pasy", () => {
    // Cztery obwody tym samym korytarzem — czwarty ląduje w najdalszym pasie, czyli
    // tam, gdzie skos przy rozdzielnicy był najdłuższy.
    const trasy = trasyZ([
      el("gniazdko", { x: 193, y: 60, rotation: 90 }),
      el("gniazdko", { x: 193, y: 90, rotation: 90 }),
      el("gniazdko", { x: 193, y: 120, rotation: 90 }),
      el("gniazdko", { x: 193, y: 150, rotation: 90 }),
    ]);
    const rysowane = spreadOverlappingRoutes(trasy, [POKOJ]);
    for (const r of trasy) {
      const pts = rysowane.get(r.id)!;
      expect(pts[0]).toEqual({ x: 100, y: 200 });
      expect(Math.abs(pts[1].x - pts[0].x), `trasa ${r.id}`).toBeLessThan(0.01);
    }
  });
});
