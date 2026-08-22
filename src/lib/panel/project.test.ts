import { describe, expect, it } from "vitest";
import type { ElementType, InstallationElement } from "@/types";
import { computeCircuits } from "./circuits";
import { applySizing, assignPhases, computeSizedCircuits, panelCapacity, phaseBalance, sizeProjectCircuits } from "./project";
import type { SizedCircuit } from "./sizing";

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

/** Skrót do budowania sztucznych wyników doboru na potrzeby bilansu faz. */
function sizedStub(over: Partial<SizedCircuit>): SizedCircuit {
  return {
    id: "x",
    nazwa: "x",
    typ: "gniazda",
    liczba_faz: "1",
    faza: "auto",
    Ib_A: 10,
    przekroj_mm2: 2.5,
    kabel: "YDYp 3x2,5 mm²",
    aparat: { charakterystyka: "B", In_A: 16, bieguny: "1P+N" },
    Iz_A: 23,
    wspolczynniki: { k1_temperatura: 1, k2_grupowanie: 1 },
    spadek_napiecia_pct: 1,
    spadek_napiecia_limit_pct: 5,
    Ia_A: 80,
    Zs_max_Ohm: 2.875,
    rcd_typ: "A",
    status: "ok",
    ostrzezenia: [],
    ...over,
  };
}

describe("sizeProjectCircuits", () => {
  const elements = [
    el("rozdzielnica", { x: 0, y: 0 }),
    ...Array.from({ length: 6 }, (_, i) => el("gniazdko", { x: 20 + i * 5, y: 30 })),
    ...Array.from({ length: 4 }, (_, i) => el("oswietlenie", { x: 15 + i * 5, y: 20 })),
  ];

  it("każdy obwód z planu dostaje policzone liczby, nie stałe z kodu", () => {
    const circuits = computeCircuits(elements);
    const sized = sizeProjectCircuits(circuits, elements, { metersPerUnit: 0.05 });
    expect(sized.length).toBe(circuits.length);
    for (const s of sized) {
      expect(s.Ib_A).toBeGreaterThan(0);
      expect(s.przekroj_mm2).not.toBeNull();
      expect(s.spadek_napiecia_pct).not.toBeNull(); // skala jest skalibrowana
      expect(s.Zs_max_Ohm).toBeGreaterThan(0);
    }
  });

  it("bez kalibracji skali nie ma spadku napięcia, tylko jawne ostrzeżenie", () => {
    const circuits = computeCircuits(elements);
    const sized = sizeProjectCircuits(circuits, elements, { metersPerUnit: null });
    for (const s of sized) {
      expect(s.spadek_napiecia_pct).toBeNull();
      expect(s.ostrzezenia.map((w) => w.code)).toContain("BRAK_DLUGOSCI");
    }
  });

  it("obwód oświetleniowy i gniazdowy dostają różne przekroje i zabezpieczenia", () => {
    const circuits = computeCircuits(elements);
    const sized = sizeProjectCircuits(circuits, elements, { metersPerUnit: 0.05 });
    const light = sized.find((s) => s.typ === "oswietlenie")!;
    const socket = sized.find((s) => s.typ === "gniazda")!;
    expect(light.przekroj_mm2).toBe(1.5);
    expect(light.aparat?.In_A).toBe(10);
    expect(socket.przekroj_mm2).toBe(2.5);
    expect(socket.aparat?.In_A).toBe(16);
  });

  it("ładowarka EV trafia na obwód 3-fazowy i wymaga RCD typu B", () => {
    const withEv = [...elements, el("ladowarkaEV", { x: 40, y: 40, room: "Garaż" })];
    const circuits = computeCircuits(withEv);
    const sized = sizeProjectCircuits(circuits, withEv, { metersPerUnit: 0.05 });
    const ev = sized.find((s) => /EV/i.test(s.nazwa))!;
    expect(ev.liczba_faz).toBe("3");
    expect(ev.rcd_typ).toBe("B");
    expect(ev.kabel).toMatch(/^YDYp 5x/);
  });
});

describe("applySizing / computeSizedCircuits", () => {
  const elements = [
    el("rozdzielnica", { x: 0, y: 0 }),
    ...Array.from({ length: 4 }, (_, i) => el("gniazdko", { x: 20 + i * 5, y: 30 })),
    el("roleta", { x: 40, y: 40 }),
    el("oswietlenie", { x: 15, y: 20 }),
  ];

  it("obwód niesie przekrój i zabezpieczenie z doboru, a nie stałą z computeCircuits", () => {
    // Roleta w `computeCircuits` ma na sztywno „YDYp 3x1,5 mm²" i „B10"; dobór
    // traktuje ją jak obwód odbiorczy, więc musi podnieść przekrój do 2,5 mm².
    const raw = computeCircuits(elements);
    const rawBlind = raw.find((c) => /rolet/i.test(c.name))!;
    expect(rawBlind.cable).toBe("YDYp 3x1,5 mm²");

    const { circuits } = computeSizedCircuits(elements, { metersPerUnit: 0.05 });
    const blind = circuits.find((c) => /rolet/i.test(c.name))!;
    expect(blind.cable).toBe("YDYp 3x2,5 mm²");
    expect(blind.breaker).toBe("B16");
  });

  it("sufiks 3-faz. przeżywa podmianę — inaczej aparat 3-biegunowy zwęziłby się do 1 modułu", () => {
    const withEv = [...elements, el("ladowarkaEV", { x: 60, y: 60, room: "Garaż" })];
    const { circuits } = computeSizedCircuits(withEv, { metersPerUnit: 0.05 });
    const ev = circuits.find((c) => /EV/i.test(c.name))!;
    expect(ev.breaker).toMatch(/3-faz\.$/);
    expect(ev.cable).toMatch(/^YDYp 5x/);
  });

  it("obwód, którego nie udało się dobrać, zachowuje wartości wyjściowe zamiast pustych", () => {
    const raw = computeCircuits(elements);
    // pusty wynik doboru = nic do nadpisania
    const untouched = applySizing(raw, []);
    expect(untouched).toEqual(raw);
  });

  it("wszystkie zakładki dostają tę samą listę obwodów", () => {
    const a = computeSizedCircuits(elements, { metersPerUnit: 0.05 });
    const b = computeSizedCircuits(elements, { metersPerUnit: 0.05 });
    expect(a.circuits.map((c) => [c.id, c.cable, c.breaker])).toEqual(
      b.circuits.map((c) => [c.id, c.cable, c.breaker])
    );
  });
});

describe("assignPhases / phaseBalance", () => {
  it("rozkłada obwody po PRĄDZIE, nie po prądzie znamionowym zabezpieczenia", () => {
    // trzy obwody B16, ale realne prądy 15/3/3 A — bilans po In dałby 1 obwód
    // na fazę i pozorną równowagę; bilans po Ib musi pokazać przewagę L1.
    const sized = [
      sizedStub({ id: "a", Ib_A: 15 }),
      sizedStub({ id: "b", Ib_A: 3 }),
      sizedStub({ id: "c", Ib_A: 3 }),
    ];
    const assigned = assignPhases(sized, true);
    expect(assigned.map((s) => s.faza)).toEqual(["L1", "L2", "L3"]);
    const balance = phaseBalance(assigned);
    expect(balance.amps.L1).toBe(15);
    expect(balance.spreadPct).toBeGreaterThan(0);
  });

  it("wyrównuje obciążenie, dokładając kolejny obwód do najmniej obciążonej fazy", () => {
    const sized = [
      sizedStub({ id: "a", Ib_A: 10 }),
      sizedStub({ id: "b", Ib_A: 10 }),
      sizedStub({ id: "c", Ib_A: 10 }),
      sizedStub({ id: "d", Ib_A: 10 }),
      sizedStub({ id: "e", Ib_A: 10 }),
      sizedStub({ id: "f", Ib_A: 10 }),
    ];
    const balance = phaseBalance(assignPhases(sized, true));
    expect(balance.amps).toEqual({ L1: 20, L2: 20, L3: 20 });
    expect(balance.percent).toEqual({ L1: 33.3, L2: 33.3, L3: 33.3 });
    expect(balance.spreadPct).toBe(0);
  });

  it("obwód 3-fazowy obciąża wszystkie trzy fazy po równo", () => {
    const balance = phaseBalance(assignPhases([sizedStub({ liczba_faz: "3", Ib_A: 12 })], true));
    expect(balance.amps).toEqual({ L1: 4, L2: 4, L3: 4 });
    expect(balance.spreadPct).toBe(0);
  });

  it("ręcznie ustawiona faza jest respektowana, nie nadpisywana przez automat", () => {
    const sized = [sizedStub({ id: "a", Ib_A: 20, faza: "L3" }), sizedStub({ id: "b", Ib_A: 5 })];
    const assigned = assignPhases(sized, true);
    expect(assigned[0].faza).toBe("L3");
    expect(assigned[1].faza).not.toBe("L3"); // automat omija już obciążoną fazę
  });

  it("przy zasilaniu 1-fazowym wszystko ląduje na L1", () => {
    const assigned = assignPhases([sizedStub({ id: "a" }), sizedStub({ id: "b" })], false);
    expect(assigned.every((s) => s.faza === "L1")).toBe(true);
  });
});

describe("panelCapacity", () => {
  it("dokłada rząd, gdy rezerwa spadłaby poniżej 20%", () => {
    // 11 z 12 modułów = 8% rezerwy → za mało, więc drugi rząd
    const c = panelCapacity(11);
    expect(c.rows).toBe(2);
    expect(c.capacity).toBe(24);
    expect(c.reservePct).toBeGreaterThanOrEqual(20);
    expect(c.ok).toBe(true);
  });

  it("nie dokłada rzędu, gdy rezerwa i tak jest wystarczająca", () => {
    const c = panelCapacity(8); // 4 z 12 wolne = 33%
    expect(c.rows).toBe(1);
    expect(c.reservePct).toBeCloseTo(33.3, 1);
    expect(c.ok).toBe(true);
  });

  it("pusta rozdzielnica to nadal jeden rząd, nie zero", () => {
    expect(panelCapacity(0).rows).toBe(1);
  });
});
