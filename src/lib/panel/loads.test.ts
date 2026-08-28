import { describe, expect, it } from "vitest";
import type { Circuit, ElementType, InstallationElement } from "@/types";
import { buildCableRoutes, circuitDemand, estimateRoutes, findPanel, kindForElements } from "./loads";

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

  it("liczy trasę po obrysie (Manhattan), nie po przekątnej", () => {
    // punkt (30,40) przy skali 0,1 m/jedn.: (30+40)·0,1 = 7 m + 2,8 + 1,5 = 11,3 m
    // po przekątnej byłoby 50·0,1 = 5 m — zaniżenie o 40%
    const r = estimateRoutes(panel, [el("gniazdko", { x: 30, y: 40 })], 0.1);
    expect(r!.worstCaseM).toBeCloseTo(11.3, 1);
  });

  it("o spadku napięcia decyduje punkt najdalszy, a nie suma tras", () => {
    const r = estimateRoutes(
      panel,
      [el("gniazdko", { x: 10, y: 0 }), el("gniazdko", { x: 100, y: 0 })],
      0.1
    );
    expect(r!.worstCaseM).toBeCloseTo(10 + 4.3, 1); // 100·0,1 + 2,8 + 1,5
    expect(r!.totalM).toBeCloseTo(1 + 4.3 + 10 + 4.3, 1); // suma obu tras
    expect(r!.totalM).toBeGreaterThan(r!.worstCaseM);
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
    expect(buildCableRoutes(null, [circuit({ elements: [el("gniazdko", { x: 30, y: 40 })] })], [], [])).toEqual([]);
  });

  // Wszystkie poniższe testy wołają BEZ ścian/pomieszczeń ([], []) — `routeAlongWalls`
  // nie ma wtedy po czym routować i celowo spada na zapasową łamaną Manhattan
  // (patrz `manhattanFallback`); routing po ścianach ma OSOBNE testy w routing.test.ts.

  it("punkt NIE leżący na osi rozdzielnicy dostaje złamaną (Manhattan) trasę z jednym narożnikiem", () => {
    const e = el("gniazdko", { x: 30, y: 40 });
    const [r] = buildCableRoutes(panel, [circuit({ elements: [e] })], [], []);
    expect(r.points).toEqual([panel, { x: 30, y: 0 }, { x: 30, y: 40 }]);
    expect(r.lengthUnits).toBe(70); // |30-0| + |40-0|
    expect(r.viaWalls).toBe(false);
  });

  it("punkt leżący na tej samej osi co rozdzielnica dostaje prostą trasę bez narożnika", () => {
    const [r] = buildCableRoutes(panel, [circuit({ elements: [el("gniazdko", { x: 50, y: 0 })] })], [], []);
    expect(r.points).toEqual([panel, { x: 50, y: 0 }]);
  });

  it("niesie dalej tożsamość obwodu (id, nazwa, kabel, zabezpieczenie) — do kolorowania i etykiet", () => {
    const e = el("oswietlenie", { x: 10, y: 10 });
    const [r] = buildCableRoutes(
      panel,
      [circuit({ id: "obw7", name: "Obwód oświetlenia 1", type: "oswietlenie", cable: "YDYp 3x1,5 mm²", breaker: "B10", elements: [e] })],
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
    const routes = buildCableRoutes(panel, [circuit({ elements: [a, b] })], [], []);
    expect(routes).toHaveLength(2);
    expect(routes.map((r) => r.id).sort()).toEqual([a.id, b.id].sort());
  });

  it("gdy jest ściana łącząca rozdzielnicę z punktem, trasa idzie WZDŁUŻ niej (viaWalls)", () => {
    const w = { id: "w1", floor: "parter", points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] };
    const e = el("gniazdko", { x: 90, y: 10 });
    const [r] = buildCableRoutes({ x: 10, y: -10 }, [circuit({ elements: [e] })], [w], []);
    expect(r.viaWalls).toBe(true);
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
