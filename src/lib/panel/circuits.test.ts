import { describe, it, expect } from "vitest";
import { chunkLightsByGroup, colorForCircuit, computeCircuits, computeLowVoltage, computeRcdGroups, mainBreakerFor } from "./circuits";
import type { InstallationElement } from "@/types";

function el(partial: Partial<InstallationElement> & { type: InstallationElement["type"] }): InstallationElement {
  return {
    id: partial.id ?? Math.random().toString(36).slice(2),
    x: 0, y: 0, room: "Salon", floor: "f1", dedicated: false, note: "", gangs: 1,
    ...partial,
  };
}

describe("computeCircuits", () => {
  it("brak elementów -> brak obwodów", () => {
    expect(computeCircuits([])).toEqual([]);
  });

  it("ładowarka EV dostaje własny obwód 3-fazowy", () => {
    const circuits = computeCircuits([el({ type: "ladowarkaEV", room: "Garaż" })]);
    expect(circuits).toHaveLength(1);
    expect(circuits[0].breaker).toBe("C25 3-faz.");
    expect(circuits[0].cable).toBe("YDYp 5x4 mm²");
  });

  it("elementy sterujące (włącznik) nie generują obwodów", () => {
    expect(computeCircuits([el({ type: "wlacznik" })])).toEqual([]);
  });

  it("zwykłe gniazda spoza mokrych pomieszczeń grupowane po 8", () => {
    const elements = Array.from({ length: 9 }, () => el({ type: "gniazdko", room: "Salon" }));
    const circuits = computeCircuits(elements);
    expect(circuits).toHaveLength(2);
    expect(circuits[0].elements).toHaveLength(8);
    expect(circuits[1].elements).toHaveLength(1);
  });

  it("gniazda w mokrym pomieszczeniu (Kuchnia) grupowane osobno wg pomieszczenia", () => {
    const elements = [
      ...Array.from({ length: 3 }, () => el({ type: "gniazdko", room: "Kuchnia" })),
      ...Array.from({ length: 2 }, () => el({ type: "gniazdko", room: "Salon" })),
    ];
    const circuits = computeCircuits(elements);
    const kuchnia = circuits.find((c) => c.name.includes("Kuchnia"));
    expect(kuchnia?.elements).toHaveLength(3);
  });

  it("obwód dedykowany dla gniazdka z flagą dedicated", () => {
    const circuits = computeCircuits([el({ type: "gniazdko", dedicated: true, note: "Piekarnik", room: "Kuchnia" })]);
    expect(circuits).toHaveLength(1);
    expect(circuits[0].name).toContain("Piekarnik");
  });
});

describe("chunkLightsByGroup", () => {
  // Mapa grup jest tu podana wprost (jak z computeLightGroups), żeby testować
  // sam algorytm pakowania w izolacji od geometrii najbliższego łącznika.
  function withGroups(
    ids: string[],
    grupy: Record<string, number>
  ): { lights: InstallationElement[]; groups: Map<string, (number | undefined)[]> } {
    const lights = ids.map((id) => el({ id, type: "oswietlenie" }));
    const groups = new Map(Object.entries(grupy).map(([id, g]) => [id, [g] as (number | undefined)[]]));
    return { lights, groups };
  }

  it("NIE rozrywa grupy między dwa obwody, nawet gdy zmieściłaby się częściowo", () => {
    // grupa A: 6 lamp, grupa B: 6 lamp, limit 10 — stare chunk(lights,10) wzięłoby
    // pierwsze 10 z rzędu i rozerwałoby jedną z grup dokładnie w połowie
    const idsA = Array.from({ length: 6 }, (_, i) => `a${i}`);
    const idsB = Array.from({ length: 6 }, (_, i) => `b${i}`);
    const grupy: Record<string, number> = {};
    idsA.forEach((id) => (grupy[id] = 1));
    idsB.forEach((id) => (grupy[id] = 2));
    const { lights, groups } = withGroups([...idsA, ...idsB], grupy);

    const circuits = chunkLightsByGroup(lights, groups, 10);
    expect(circuits).toHaveLength(2);
    // każdy obwód to CAŁA grupa, żadna nie jest podzielona
    expect(circuits[0]).toHaveLength(6);
    expect(circuits[1]).toHaveLength(6);
    expect(new Set(circuits[0].map((l) => l.id))).toEqual(new Set(idsA));
    expect(new Set(circuits[1].map((l) => l.id))).toEqual(new Set(idsB));
  });

  it("łączy małe grupy na jednym obwodzie, gdy się mieszczą razem", () => {
    const { lights, groups } = withGroups(
      ["a1", "a2", "a3", "b1", "b2"],
      { a1: 1, a2: 1, a3: 1, b1: 2, b2: 2 }
    );
    const circuits = chunkLightsByGroup(lights, groups, 10);
    expect(circuits).toHaveLength(1);
    expect(circuits[0]).toHaveLength(5);
  });

  it("grupa większa niż limit trafia sama, w jednym przekroczonym obwodzie", () => {
    const ids = Array.from({ length: 14 }, (_, i) => `x${i}`);
    const grupy = Object.fromEntries(ids.map((id) => [id, 1]));
    const { lights, groups } = withGroups(ids, grupy);

    const circuits = chunkLightsByGroup(lights, groups, 10);
    // lepiej przekroczyć limit modułowy niż rozerwać grupę na dwa obwody
    expect(circuits).toHaveLength(1);
    expect(circuits[0]).toHaveLength(14);
  });

  it("światła bez grupy zachowują się jak dawny chunk(lights, N)", () => {
    const ids = Array.from({ length: 12 }, (_, i) => `l${i}`);
    const { lights, groups } = withGroups(ids, {}); // żadnych grup
    const circuits = chunkLightsByGroup(lights, groups, 10);
    expect(circuits.map((c) => c.length)).toEqual([10, 2]);
  });

  it("grupy z RÓŻNYCH kondygnacji o tym samym numerze nie scalają się w jedną grupę", () => {
    // 6 lamp na parterze i 6 na piętrze, obie oznaczone numerem „1" — numeracja
    // w computeLightGroups liczy się OSOBNO na każdej kondygnacji, więc te same
    // cyfry na dwóch piętrach to w rzeczywistości dwie różne grupy. Gdyby klucz
    // pakowania ignorował piętro, wyszłaby JEDNA gałąź 12 lamp (grupa „większa niż
    // limit" trafia sama, w jednym przekroczonym obwodzie); z rozróżnieniem piętra
    // wychodzą DWA obwody po 6 — bo 6+6 już nie mieści się w limicie 10.
    const idsParter = Array.from({ length: 6 }, (_, i) => `p${i}`);
    const idsPietro = Array.from({ length: 6 }, (_, i) => `e${i}`);
    const lights = [
      ...idsParter.map((id) => el({ id, type: "oswietlenie", floor: "parter" })),
      ...idsPietro.map((id) => el({ id, type: "oswietlenie", floor: "pietro" })),
    ];
    const groups = new Map<string, (number | undefined)[]>([
      ...idsParter.map((id): [string, (number | undefined)[]] => [id, [1]]),
      ...idsPietro.map((id): [string, (number | undefined)[]] => [id, [1]]),
    ]);

    const circuits = chunkLightsByGroup(lights, groups, 10);
    expect(circuits).toHaveLength(2);
    expect(circuits[0]).toHaveLength(6);
    expect(circuits[1]).toHaveLength(6);
  });

  it("pusta lista świateł daje pustą listę obwodów", () => {
    expect(chunkLightsByGroup([], new Map(), 10)).toEqual([]);
  });
});

describe("computeCircuits — grupy sterowania oświetleniem", () => {
  /** Łącznik i jego lampy blisko siebie w jednym pomieszczeniu — computeLightGroups
   *  łączy je w jedną grupę po najbliższym łączniku (patrz lib/lightGroups.ts). */
  function pokojZLampami(room: string, floor: string, switchXY: [number, number], n: number, ox: number) {
    const [sx, sy] = switchXY;
    return [
      el({ type: "wlacznik", room, floor, x: sx, y: sy }),
      ...Array.from({ length: n }, (_, i) => el({ type: "oswietlenie", room, floor, x: sx + ox + i, y: sy })),
    ];
  }

  it("dwa łączniki w osobnych pomieszczeniach, po 6 lamp — NIE łączą się w jeden obwód mimo limitu 10", () => {
    const elements = [
      ...pokojZLampami("Salon", "f1", [0, 0], 6, 5),
      ...pokojZLampami("Sypialnia", "f1", [1000, 1000], 6, 5),
    ];
    const circuits = computeCircuits(elements);
    const oswietlenie = circuits.filter((c) => c.type === "oswietlenie");

    expect(oswietlenie).toHaveLength(2);
    for (const c of oswietlenie) {
      // każdy obwód oświetlenia zawiera WYŁĄCZNIE lampy z jednego pomieszczenia —
      // gdyby grupy nie były respektowane, jeden obwód dostałby 10 lamp z obu
      // pokoi, a drugi resztę, co nie dałoby się fizycznie okablować
      const pokoje = new Set(c.elements.map((e) => e.room));
      expect(pokoje.size).toBe(1);
      expect(c.elements).toHaveLength(6);
    }
  });

  it("mały pokój z dwiema lampami na jednym łączniku trafia na wspólny obwód", () => {
    const elements = pokojZLampami("Kuchnia", "f1", [0, 0], 2, 5);
    const circuits = computeCircuits(elements);
    const oswietlenie = circuits.filter((c) => c.type === "oswietlenie");
    expect(oswietlenie).toHaveLength(1);
    expect(oswietlenie[0].elements).toHaveLength(2);
  });
});

describe("computeLowVoltage", () => {
  it("zlicza elementy niskoprądowe wg typu", () => {
    const elements = [el({ type: "rj45" }), el({ type: "rj45" }), el({ type: "rtvsat" })];
    const result = computeLowVoltage(elements);
    const rj45 = result.find((r) => r.type === "rj45");
    expect(rj45?.count).toBe(2);
  });

  it("pomija elementy niebędące niskoprądowymi", () => {
    expect(computeLowVoltage([el({ type: "gniazdko" })])).toEqual([]);
  });
});

describe("computeRcdGroups", () => {
  it("grupuje obwody po maks. 6 na jeden RCD", () => {
    const circuits = Array.from({ length: 7 }, (_, i) => ({
      id: `obw${i}`, name: `Obwód ${i}`, type: "gniazdko" as const, elements: [], cable: "", breaker: "B16", rcd: true,
    }));
    const groups = computeRcdGroups(circuits);
    expect(groups).toHaveLength(2);
    expect(groups[0].circuits).toHaveLength(6);
    expect(groups[1].circuits).toHaveLength(1);
  });
});

describe("mainBreakerFor", () => {
  it("dobiera rozłącznik wg progów liczby obwodów", () => {
    expect(mainBreakerFor(3)).toBe("B25");
    expect(mainBreakerFor(6)).toBe("B25");
    expect(mainBreakerFor(7)).toBe("B32");
    expect(mainBreakerFor(12)).toBe("B32");
    expect(mainBreakerFor(13)).toBe("B40");
  });
});

describe("colorForCircuit", () => {
  it("zwraca kolor dla znanych typów obwodów", () => {
    expect(colorForCircuit("gniazdko")).toBe("#2D5A8C");
    expect(colorForCircuit("oswietlenie")).toBe("#C1793F");
    expect(colorForCircuit("roleta")).toBe("#7C5CBF");
  });

  it("nieznany typ -> domyślny kolor gniazdka", () => {
    expect(colorForCircuit("cokolwiek")).toBe("#2D5A8C");
  });
});
