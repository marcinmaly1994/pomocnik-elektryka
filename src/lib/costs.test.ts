import { describe, it, expect } from "vitest";
import { computeCosts, parsePriceCsv } from "./costs";
import type { Circuit, InstallationElement, RcdGroup } from "@/types";

function el(partial: Partial<InstallationElement> & { type: InstallationElement["type"] }): InstallationElement {
  return {
    id: partial.id ?? Math.random().toString(36).slice(2),
    x: 0, y: 0, room: "Salon", floor: "f1", dedicated: false, note: "", gangs: 1,
    ...partial,
  };
}

describe("computeCosts — długość kabla", () => {
  const circuit: Circuit = {
    id: "obw1",
    name: "Obwód gniazd",
    type: "gniazdko",
    elements: [el({ type: "gniazdko" }), el({ type: "gniazdko" })],
    cable: "YDYp 3x2,5 mm²",
    breaker: "B16",
    rcd: true,
  };

  it("bez policzonych tras wraca do ryczałtu i mówi o tym wprost", () => {
    const { quantities, cableLengthSource } = computeCosts([], [circuit], []);
    expect(cableLengthSource).toBe("ryczalt");
    expect(quantities.kabel25).toBe(2 * 5 + 10); // 2 punkty × 5 mb + 10 mb
  });

  it("z policzonymi trasami bierze metraż z planu, nie z ryczałtu", () => {
    const { quantities, cableLengthSource } = computeCosts([], [circuit], [], {
      routeLengthsM: new Map([["obw1", 42.5]]),
    });
    expect(cableLengthSource).toBe("plan");
    expect(quantities.kabel25).toBe(43); // zaokrąglone 42,5
  });

  it("pusta mapa tras to nadal ryczałt — nie zerowy metraż", () => {
    const { quantities, cableLengthSource } = computeCosts([], [circuit], [], { routeLengthsM: new Map() });
    expect(cableLengthSource).toBe("ryczalt");
    expect(quantities.kabel25).toBe(20);
  });

  it("dwa identyczne obwody w różnych miejscach domu dostają RÓŻNY metraż", () => {
    const far: Circuit = { ...circuit, id: "obw2" };
    const { quantities } = computeCosts([], [circuit, far], [], {
      routeLengthsM: new Map([
        ["obw1", 12],
        ["obw2", 60],
      ]),
    });
    expect(quantities.kabel25).toBe(72); // ryczałt dałby 2 × 20 = 40 dla obu
  });
});

describe("computeCosts", () => {
  it("brak elementów -> same zera poza minimum jednej puszki rozgałęźnej", () => {
    // tak jak w oryginale: dom ma co najmniej jedno pomieszczenie, więc co najmniej
    // jedną puszkę rozgałęźną, nawet zanim cokolwiek postawiono na planie
    const { quantities } = computeCosts([], [], []);
    const { puszkaRozgalezna, ...rest } = quantities;
    expect(puszkaRozgalezna).toBe(1);
    expect(Object.values(rest).every((v) => v === 0)).toBe(true);
  });

  it("gniazdko wielokrotne liczy się wg liczby gangów", () => {
    const { quantities } = computeCosts([el({ type: "gniazdko", gangs: 3 })], [], []);
    expect(quantities.gniazdko).toBe(3);
  });

  it("punkt instalacyjny generuje puszkę podtynkową i robociznę, ale pomija rozdzielnicę/puszkę/sanitarne", () => {
    const elements = [
      el({ type: "gniazdko" }),
      el({ type: "rozdzielnica" }),
      el({ type: "puszka" }),
      el({ type: "wanna" }),
    ];
    const { quantities } = computeCosts(elements, [], []);
    expect(quantities.puszkaPodtynkowa).toBe(1);
    expect(quantities.robocizna).toBe(1);
  });

  it("puszka rozgałęźna to co najmniej liczba pomieszczeń", () => {
    const elements = [el({ type: "gniazdko", room: "Salon" }), el({ type: "gniazdko", room: "Kuchnia" })];
    const { quantities } = computeCosts(elements, [], []);
    expect(quantities.puszkaRozgalezna).toBeGreaterThanOrEqual(2);
  });

  it("długość kabla szacowana z liczby punktów w obwodzie (5 mb/pkt + 10 mb)", () => {
    const circuits: Circuit[] = [
      { id: "obw1", name: "Gniazda", type: "gniazdko", elements: [el({ type: "gniazdko" }), el({ type: "gniazdko" })], cable: "YDYp 3x2,5 mm²", breaker: "B16", rcd: true },
    ];
    const { quantities } = computeCosts([], circuits, []);
    expect(quantities.kabel25).toBe(2 * 5 + 10);
  });

  it("obwody 3-fazowe liczone osobno do mcb3f", () => {
    const circuits: Circuit[] = [
      { id: "obw1", name: "EV", type: "gniazdko", elements: [], cable: "YDYp 5x4 mm²", breaker: "C25 3-faz.", rcd: true },
      { id: "obw2", name: "Gniazda", type: "gniazdko", elements: [], cable: "YDYp 3x2,5 mm²", breaker: "B16", rcd: true },
    ];
    const { quantities } = computeCosts([], circuits, []);
    expect(quantities.mcb3f).toBe(1);
    expect(quantities.mcb).toBe(1);
  });

  it("rozdzielnica i wyłącznik główny liczone raz, gdy są jakiekolwiek obwody", () => {
    const circuits: Circuit[] = [{ id: "obw1", name: "x", type: "gniazdko", elements: [], cable: "YDYp 3x2,5 mm²", breaker: "B16", rcd: true }];
    const rcdGroups: RcdGroup[] = [{ id: "rcd1", rating: "40A/30mA", circuits }];
    const { quantities } = computeCosts([], circuits, rcdGroups);
    expect(quantities.glowny).toBe(1);
    expect(quantities.rozdzielnica).toBe(1);
    expect(quantities.rcd).toBe(1);
  });
});

describe("parsePriceCsv", () => {
  it("dopasowuje pozycje po słowach kluczowych", () => {
    // "RCD" celowo bez przedrostka "Wyłącznik" — inaczej dopasowałoby się najpierw
    // do słowa kluczowego "łącznik" (patrz test niżej o kolejności dopasowań)
    const csv = "Gniazdko podtynkowe 230V;18.50\nRCD 30mA;95";
    const updates = parsePriceCsv(csv);
    expect(updates.gniazdko).toBe(18.5);
    expect(updates.rcd).toBe(95);
  });

  it("odziedziczona z oryginału usterka: dopasowanie po pierwszym pasującym słowie kluczowym w kolejności deklaracji może przechwycić niewłaściwą pozycję (\"Wyłącznik różnicowoprądowy\" trafia w \"włącznik\", bo zawiera podciąg „łącznik”, zanim dotrze do „różnicowoprądowy”)", () => {
    const csv = "Wyłącznik różnicowoprądowy 30mA;95";
    expect(parsePriceCsv(csv).wlacznik).toBe(95);
    expect(parsePriceCsv(csv).rcd).toBeUndefined();
  });

  it("odziedziczona z oryginału usterka: przecinek jako separator pól rozbija też przecinek dziesiętny w cenie — port jest celowo wierny źródłu", () => {
    // separator pól to [,;\t] łącznie, więc "Gniazdko;18,50" dzieli się na 3 pola
    // (["Gniazdko","18","50"]) i jako cena brany jest tylko ostatni fragment ("50")
    const csv = "Gniazdko;18,50";
    expect(parsePriceCsv(csv).gniazdko).toBe(50);
  });

  it("pomija linie bez rozpoznanego słowa kluczowego lub ceny", () => {
    const csv = "Coś nieznanego;10\nGniazdko;abc";
    const updates = parsePriceCsv(csv);
    expect(updates.gniazdko).toBeUndefined();
  });

  it("pusty plik -> brak aktualizacji", () => {
    expect(parsePriceCsv("")).toEqual({});
  });
});
