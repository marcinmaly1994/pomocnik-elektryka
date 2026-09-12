import { describe, expect, it } from "vitest";
import type { ElementType, InstallationElement } from "@/types";
import { computeCircuits } from "./circuits";
import { applySizing, assignPhases, computeSizedCircuits, dlugosciDoboru, lowVoltageLengths, panelCapacity, phaseBalance, routeLengths, routeSummaries, sizeProjectCircuits } from "./project";
import type { SizedCircuit } from "./sizing";
import { ZAPAS_MONTAZOWY_M } from "./norms";

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
    aparat: { charakterystyka: "B", In_A: 16, bieguny: "1P" },
    Iz_A: 23,
    wspolczynniki: { k1_temperatura: 1, k2_grupowanie: 1 },
    spadek_napiecia_pct: 1,
    spadek_napiecia_limit_pct: 5,
    spadek_wlz_pct: 0,
    spadek_calkowity_pct: null,
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
    const sized = sizeProjectCircuits(circuits, elements, { scales: { parter: 0.05 } });
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
    const sized = sizeProjectCircuits(circuits, elements, { scales: {} });
    for (const s of sized) {
      expect(s.spadek_napiecia_pct).toBeNull();
      expect(s.ostrzezenia.map((w) => w.code)).toContain("BRAK_DLUGOSCI");
    }
  });

  it("obwód oświetleniowy i gniazdowy dostają różne przekroje i zabezpieczenia", () => {
    const circuits = computeCircuits(elements);
    const sized = sizeProjectCircuits(circuits, elements, { scales: { parter: 0.05 } });
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
    const sized = sizeProjectCircuits(circuits, withEv, { scales: { parter: 0.05 } });
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

    const { circuits } = computeSizedCircuits(elements, { scales: { parter: 0.05 } });
    const blind = circuits.find((c) => /rolet/i.test(c.name))!;
    expect(blind.cable).toBe("YDYp 3x2,5 mm²");
    expect(blind.breaker).toBe("B16");
  });

  it("sufiks 3-faz. przeżywa podmianę — inaczej aparat 3-biegunowy zwęziłby się do 1 modułu", () => {
    const withEv = [...elements, el("ladowarkaEV", { x: 60, y: 60, room: "Garaż" })];
    const { circuits } = computeSizedCircuits(withEv, { scales: { parter: 0.05 } });
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
    const a = computeSizedCircuits(elements, { scales: { parter: 0.05 } });
    const b = computeSizedCircuits(elements, { scales: { parter: 0.05 } });
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

describe("skala per kondygnacja w doborze i kosztorysie", () => {
  const rozdzielnica = el("rozdzielnica", { x: 0, y: 0, floor: "parter" });
  const naParterze = el("gniazdko", { x: 100, y: 0, floor: "parter", room: "Salon" });
  const naPietrze = el("gniazdko", { x: 100, y: 0, floor: "pietro", room: "Salon" });
  const wszystkie = [rozdzielnica, naParterze, naPietrze];

  /**
   * Przedtem caly budynek liczyl sie JEDNA skala — ta z kondygnacji akurat otwartej
   * w edytorze — wiec metry na pozostalych pietrach wychodzily przemnozone przez
   * przypadkowy wspolczynnik. Tu obie kondygnacje maja skale rozne o rzad wielkosci,
   * wiec pomylka byloby widac natychmiast.
   */
  it("routeLengths sumuje trasy liczone skala WLASNEJ kondygnacji", () => {
    const { circuits } = computeSizedCircuits(wszystkie, { scales: { parter: 0.05, pietro: 0.01 } });
    const gestsze = routeLengths(circuits, wszystkie, { parter: 0.05, pietro: 0.01 });
    const rzadsze = routeLengths(circuits, wszystkie, { parter: 0.05, pietro: 0.05 });
    const suma = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);
    // Pietro pieciokrotnie gestsze to 4 m mniej trasy do tego jednego gniazda.
    expect(suma(rzadsze) - suma(gestsze)).toBeCloseTo(4, 5);
  });

  it("obwod siegajacy kondygnacji bez skali wypada z pomiaru, zamiast liczyc sie po czesci", () => {
    const { circuits } = computeSizedCircuits(wszystkie, { scales: { parter: 0.05 } });
    expect(routeLengths(circuits, wszystkie, { parter: 0.05 }).size).toBe(0);
    // Ta sama instalacja z komplet skal juz sie mierzy.
    expect(routeLengths(circuits, wszystkie, { parter: 0.05, pietro: 0.05 }).size).toBeGreaterThan(0);
  });

  /** Dlugosc trasy wchodzi do doboru przez spadek napiecia — i to on jest widocznym
   *  skutkiem tego, czy skala byla znana. Kosztorys i dobor licza z tych samych skal,
   *  wiec nie da sie juz dostac przekroju dobranego pod inny budynek. */
  it("spadek napiecia liczy sie wtedy i tylko wtedy, gdy znane sa skale wszystkich kondygnacji obwodu", () => {
    const zeSkalami = computeSizedCircuits(wszystkie, { scales: { parter: 0.05, pietro: 0.01 } });
    expect(zeSkalami.sized.some((s) => s.spadek_napiecia_pct !== null)).toBe(true);

    const bezPietra = computeSizedCircuits(wszystkie, { scales: { parter: 0.05 } });
    expect(bezPietra.sized.every((s) => s.spadek_napiecia_pct === null)).toBe(true);
  });
});

describe("podrozdzielnica na pietrze", () => {
  const tablicaGlowna = el("rozdzielnica", { x: 0, y: 0, floor: "parter" });
  const podrozdzielnica = el("rozdzielnica", { x: 400, y: 0, floor: "pietro" });
  const naPietrze = el("gniazdko", { x: 420, y: 0, floor: "pietro", room: "Salon" });

  /**
   * Sedno bledu: trasy WSZYSTKICH obwodow mierzyly sie od pierwszej rozdzielnicy
   * znalezionej w projekcie. Gniazdko 20 jedn. od podrozdzielnicy na pietrze dostawalo
   * dlugosc liczona od tablicy glownej na parterze, czyli przez pol budynku — i to
   * zarowno w kosztorysie (ile kabla kupic), jak i w doborze (spadek napiecia).
   */
  it("obwod na pietrze mierzy sie od tamtejszej podrozdzielnicy", () => {
    const skale = { parter: 0.05, pietro: 0.05 };
    const bezPodrozdzielnicy = [tablicaGlowna, naPietrze];
    const zPodrozdzielnica = [tablicaGlowna, podrozdzielnica, naPietrze];

    const suma = (elementy: typeof bezPodrozdzielnicy) => {
      const { circuits } = computeSizedCircuits(elementy, { scales: skale });
      return [...routeLengths(circuits, elementy, skale).values()].reduce((a, b) => a + b, 0);
    };

    // Od tablicy glownej: 420 jedn. = 21 m. Od podrozdzielnicy: 20 jedn. = 1 m.
    expect(suma(bezPodrozdzielnicy) - suma(zPodrozdzielnica)).toBeCloseTo(20, 5);
  });

  it("kolejnosc elementow w tablicy nie zmienia wyniku", () => {
    const skale = { parter: 0.05, pietro: 0.05 };
    const suma = (elementy: InstallationElement[]) => {
      const { circuits } = computeSizedCircuits(elementy, { scales: skale });
      return [...routeLengths(circuits, elementy, skale).values()].reduce((a, b) => a + b, 0);
    };
    // Przedtem wygrywala ta rozdzielnica, ktora stala wczesniej w tablicy.
    expect(suma([podrozdzielnica, tablicaGlowna, naPietrze])).toBeCloseTo(
      suma([tablicaGlowna, podrozdzielnica, naPietrze]),
      5
    );
  });
});

describe("dlugosciDoboru", () => {
  const rozdzielnica = el("rozdzielnica", { x: 0, y: 0, floor: "parter" });
  const bliskie = el("gniazdko", { x: 100, y: 0, floor: "parter", room: "Salon" });
  const dalekie = el("gniazdko", { x: 400, y: 0, floor: "parter", room: "Salon" });
  const skale = { parter: 0.05 };
  const elementy = [rozdzielnica, bliskie, dalekie];

  /**
   * Sedno: karta obliczen ma podac trase, ktora ZDECYDOWALA o spadku napiecia,
   * a nie material do kupienia. To dwie rozne liczby dla tego samego obwodu.
   */
  it("mierzy do punktu najdalszego, a nie sume tras jak routeLengths", () => {
    const { circuits } = computeSizedCircuits(elementy, { scales: skale });
    const doDoboru = dlugosciDoboru(circuits, elementy, skale).get(circuits[0].id)!;
    const naMaterial = routeLengths(circuits, elementy, skale).get(circuits[0].id)!;
    expect(doDoboru).toBeGreaterThan(0);
    expect(doDoboru).toBeLessThan(naMaterial);
  });

  /** Brak wpisu i pusty spadek to ta sama sytuacja opisana dwa razy — gdyby sie
   *  rozjechaly, karta pokazywalaby dlugosc obok kreski w kolumnie ΔU. */
  it("bez skali kondygnacji nie ma wpisu — dokladnie wtedy, gdy spadek zostaje pusty", () => {
    const { circuits, sized } = computeSizedCircuits(elementy, { scales: {} });
    expect(dlugosciDoboru(circuits, elementy, {}).has(circuits[0].id)).toBe(false);
    expect(sized[0].spadek_napiecia_pct).toBeNull();
  });
});

/**
 * Warunki doboru CALEGO projektu.
 *
 * Ten sam silnik (`sizeCircuit`) liczy kalkulator, ktory te nastawy mial od dawna —
 * dobor projektu bral je milczaco: 30 stopni, jeden obwod w wiazce, zero spadku na WLZ.
 * Dwa pierwsze domysly myla sie w strone NIEBEZPIECZNA: wyzsza temperatura i wieksza
 * wiazka OBNIZAJA obciazalnosc, wiec przyjmowanie warunkow najlagodniejszych
 * przepuszcza zbyt cienki przewod.
 */
describe("sizeProjectCircuits — warunki doboru", () => {
  /** Obwod dosc dlugi i obciazony, zeby dobor mial co zaostrzac. */
  const plan = () => {
    const elementy = [
      el("rozdzielnica", { x: 0, y: 0 }),
      ...Array.from({ length: 6 }, (_, i) => el("gniazdko", { x: 300 + i * 40, y: 400 })),
    ];
    return { elementy, opts: { scales: { parter: 0.05 } } };
  };
  const gniazdowy = (wynik: ReturnType<typeof sizeProjectCircuits>) =>
    wynik.find((s2) => s2.typ === "gniazda")!;

  it("wyzsza temperatura otoczenia obniza obciazalnosc dobranego przewodu", () => {
    const { elementy, opts } = plan();
    const obwody = computeCircuits(elementy);
    const w30 = gniazdowy(sizeProjectCircuits(obwody, elementy, opts));
    const w50 = gniazdowy(sizeProjectCircuits(obwody, elementy, { ...opts, temperatura_otoczenia_C: 50 }));
    expect(w50.Iz_A!).toBeLessThan(w30.Iz_A!);
    expect(w50.ostrzezenia.some((o) => o.code === "TEMPERATURA")).toBe(true);
    // Bez podanej temperatury ostrzezenie nie ma prawa sie pojawic — i o to chodzilo:
    // przy domyslnych 30 stopniach ten warunek NIGDY nie zachodzil.
    expect(w30.ostrzezenia.some((o) => o.code === "TEMPERATURA")).toBe(false);
  });

  it("wiecej obwodow w wiazce obniza obciazalnosc i zglasza grupowanie", () => {
    const { elementy, opts } = plan();
    const obwody = computeCircuits(elementy);
    const sam = gniazdowy(sizeProjectCircuits(obwody, elementy, opts));
    const wWiazce = gniazdowy(sizeProjectCircuits(obwody, elementy, { ...opts, obwodow_w_wiazce: 6 }));
    expect(wWiazce.Iz_A!).toBeLessThan(sam.Iz_A!);
    expect(wWiazce.ostrzezenia.some((o) => o.code === "GRUPOWANIE")).toBe(true);
  });

  it("sciana ocieplona jest ostrzejsza od murowanej", () => {
    const { elementy, opts } = plan();
    const obwody = computeCircuits(elementy);
    const mur = gniazdowy(sizeProjectCircuits(obwody, elementy, opts));
    const ocieplona = gniazdowy(sizeProjectCircuits(obwody, elementy, { ...opts, sposob_ulozenia: "w_scianie_ocieplonej" }));
    expect(ocieplona.Iz_A!).toBeLessThan(mur.Iz_A!);
  });

  /** Limit 3/5% dotyczy CALEJ drogi od zlacza. To, co zjadla WLZ, nie jest juz dostepne
   *  dla obwodu — bez tego instalacja poprawna obwod po obwodzie potrafila przekraczac
   *  limit jako calosc. */
  it("spadek na WLZ dolicza sie do spadku obwodu, bo limit dotyczy CALEJ drogi", () => {
    const { elementy, opts } = plan();
    const obwody = computeCircuits(elementy);
    const bezWlz = gniazdowy(sizeProjectCircuits(obwody, elementy, opts));
    const zWlz = gniazdowy(sizeProjectCircuits(obwody, elementy, { ...opts, spadek_wlz_pct: 2 }));
    // Sam obwod jest ten sam — 2% na WLZ jeszcze miesci sie w limicie...
    expect(zWlz.kabel).toBe(bezWlz.kabel);
    // ...ale liczba, ktora porownuje sie z limitem, urosla o tyle, ile zjadla WLZ.
    expect(zWlz.spadek_calkowity_pct).toBeCloseTo(bezWlz.spadek_calkowity_pct! + 2, 1);
  });

  /**
   * Sedno poprawki: gdy WLZ zjadla wiekszosc budzetu, dobor MUSI pogrubic przewod.
   * Bez tej liczby obwod dostawal caly limit dla siebie i przechodzil na 2,5 mm2,
   * mimo ze instalacja jako calosc limit przekraczala.
   */
  it("WLZ zjadajaca wiekszosc budzetu wymusza grubszy przewod", () => {
    const { elementy, opts } = plan();
    const obwody = computeCircuits(elementy);
    const bezWlz = gniazdowy(sizeProjectCircuits(obwody, elementy, opts));
    const zWlz = gniazdowy(sizeProjectCircuits(obwody, elementy, { ...opts, spadek_wlz_pct: 4 }));
    expect(zWlz.kabel).not.toBe(bezWlz.kabel);
    expect(zWlz.spadek_napiecia_pct!).toBeLessThan(bezWlz.spadek_napiecia_pct!);
    // Calosc miesci sie w limicie dopiero dzieki pogrubieniu — i aplikacja mowi o tym wprost.
    expect(zWlz.spadek_calkowity_pct!).toBeLessThanOrEqual(zWlz.spadek_napiecia_limit_pct);
    expect(zWlz.ostrzezenia.some((o) => o.code === "PRZEKROJ_PODNIESIONY_SPADEK")).toBe(true);
  });

  /** Projekty sprzed wprowadzenia warunkow nie moga zmienic ani jednej liczby. */
  it("brak warunkow liczy sie tak samo jak wpisane wartosci domyslne", () => {
    const { elementy, opts } = plan();
    const obwody = computeCircuits(elementy);
    const bez = sizeProjectCircuits(obwody, elementy, opts);
    const zDomyslnymi = sizeProjectCircuits(obwody, elementy, {
      ...opts,
      sposob_ulozenia: "w_scianie",
      temperatura_otoczenia_C: 30,
      obwodow_w_wiazce: 1,
      spadek_wlz_pct: 0,
    });
    expect(bez).toEqual(zDomyslnymi);
  });
});

/**
 * Dlugosc ze SZACUNKU, nie z trasy po scianach.
 *
 * Brak skali aplikacja zglaszala wprost („spadek napiecia NIE zostal sprawdzony"), a
 * brak geometrii — niczego. Tymczasem szacunek Manhattan jest KROTSZY od drogi, ktora
 * przewod naprawde pokona, wiec zaniza spadek napiecia. Cichy blad w strone
 * niebezpieczna.
 */
describe("sizeProjectCircuits — dlugosc ze szacunku", () => {
  const POKOJ = {
    id: "r1",
    floor: "parter",
    name: "Salon",
    color: "#3B8C63",
    points: [
      { x: 0, y: 0 },
      { x: 600, y: 0 },
      { x: 600, y: 500 },
      { x: 0, y: 500 },
    ],
  };
  const elementy = [
    el("rozdzielnica", { x: 20, y: 480 }),
    ...Array.from({ length: 3 }, (_, i) => el("gniazdko", { x: 200 + i * 60, y: 20 })),
  ];
  const opts = { scales: { parter: 0.05 } };
  const gniazdowy = (w: ReturnType<typeof sizeProjectCircuits>) => w.find((s2) => s2.typ === "gniazda")!;

  it("bez narysowanej geometrii dobor MOWI, ze dlugosc jest szacunkiem", () => {
    const obwody = computeCircuits(elementy);
    const bez = gniazdowy(sizeProjectCircuits(obwody, elementy, opts));
    const o = bez.ostrzezenia.find((x) => x.code === "DLUGOSC_SZACOWANA");
    expect(o).toBeTruthy();
    expect(o!.message).toContain("zaniżony");
  });

  it("z narysowanym pomieszczeniem ostrzezenia nie ma, a trasa jest DLUZSZA", () => {
    const obwody = computeCircuits(elementy);
    const bez = gniazdowy(sizeProjectCircuits(obwody, elementy, opts));
    const zGeo = gniazdowy(
      sizeProjectCircuits(obwody, elementy, { ...opts, geometria: { walls: [], roomShapes: [POKOJ], openings: [] } })
    );
    expect(zGeo.ostrzezenia.some((x) => x.code === "DLUGOSC_SZACOWANA")).toBe(false);
    // Sedno ostrzezenia: szacunek byl KROTSZY od trasy po scianach, wiec spadek
    // napiecia policzony z niego jest MNIEJSZY niz prawdziwy.
    expect(zGeo.spadek_napiecia_pct!).toBeGreaterThan(bez.spadek_napiecia_pct!);
  });
});

/**
 * Zapas montazowy — zejscie do puszki i luz na podlaczenie, doliczany do KAZDEGO punktu.
 *
 * Dla doboru to kierunek bezpieczny (dlugosc zawyzona), ale w KOSZTORYSIE przy stu
 * punktach robi sie z niego sto piecdziesiat metrow kabla, ktore dotad nie mialy nazwy
 * i wygladaly jak zmierzona trasa.
 */
describe("zapas montazowy na punkt", () => {
  const elementy = [
    el("rozdzielnica", { x: 20, y: 480 }),
    ...Array.from({ length: 4 }, (_, i) => el("gniazdko", { x: 200 + i * 60, y: 20 })),
  ];
  const opts = { scales: { parter: 0.05 } };

  it("rozbicie mowi, ile z metrazu to zapasy — po jednym na punkt", () => {
    const obwody = computeCircuits(elementy);
    const [trasa] = [...routeSummaries(obwody, elementy, opts.scales).values()];
    // Cztery gniazda, wiec cztery zapasy po 1,5 m.
    expect(trasa.zapasM).toBeCloseTo(4 * ZAPAS_MONTAZOWY_M, 5);
    expect(trasa.zapasM).toBeLessThan(trasa.totalM);
  });

  it("wlasny zapas zmienia metraz dokladnie o roznice razy liczba punktow", () => {
    const obwody = computeCircuits(elementy);
    const domyslny = [...routeSummaries(obwody, elementy, opts.scales).values()][0];
    const wlasny = [...routeSummaries(obwody, elementy, opts.scales, undefined, undefined, 2).values()][0];
    expect(wlasny.zapasM).toBeCloseTo(4 * 2, 5);
    expect(wlasny.totalM - domyslny.totalM).toBeCloseTo(4 * (2 - ZAPAS_MONTAZOWY_M), 1);
  });

  /** Zapas ujemny SKROCILBY przewod, wiec wartosc bezsensowna wraca do domyslnej. */
  it("ujemny zapas wraca do domyslnego, zamiast skracac przewod", () => {
    const obwody = computeCircuits(elementy);
    const domyslny = [...routeSummaries(obwody, elementy, opts.scales).values()][0];
    const bezsens = [...routeSummaries(obwody, elementy, opts.scales, undefined, undefined, -2).values()][0];
    expect(bezsens.totalM).toBeCloseTo(domyslny.totalM, 5);
  });

  /** Zapas wchodzi tez w dlugosc decydujaca o spadku napiecia — ale tylko RAZ,
   *  bo na drodze pradu do najdalszego punktu posrednie zejscia sie nie licza. */
  it("wiekszy zapas wydluza takze dlugosc do doboru, o jedna sztuke", () => {
    const obwody = computeCircuits(elementy);
    const domyslny = sizeProjectCircuits(obwody, elementy, opts).find((s2) => s2.typ === "gniazda")!;
    const duzy = sizeProjectCircuits(obwody, elementy, { ...opts, zapas_na_punkt_m: 2 }).find((s2) => s2.typ === "gniazda")!;
    expect(duzy.spadek_napiecia_pct!).toBeGreaterThan(domyslny.spadek_napiecia_pct!);
  });

  /** `routeLengths` zostaje zgodne z rozbiciem — to ten sam pomiar, inaczej podany. */
  it("routeLengths i routeSummaries daja te sama sume", () => {
    const obwody = computeCircuits(elementy);
    const sumy = routeLengths(obwody, elementy, opts.scales);
    for (const [id, r] of routeSummaries(obwody, elementy, opts.scales)) {
      expect(sumy.get(id)).toBe(r.totalM);
    }
  });
});

/**
 * Niskopradowka: LAN i koncentryk licza sie z PLANU, nie ryczaltem 15 mb na punkt.
 *
 * Gniazdo RJ45 metr od rozdzielnicy i takie na drugim koncu domu dostawaly dotad tyle
 * samo metrow — dokladnie to, co przy zasilaniu nazwalismy zgadywaniem.
 */
describe("lowVoltageLengths", () => {
  const opts = { scales: { parter: 0.05, pietro: 0.05 } };
  const rozdzielnica = el("rozdzielnica", { x: 0, y: 0 });

  it("blizsze gniazdo daje mniej metrow niz dalsze — ryczalt dawal tyle samo", () => {
    const blisko = lowVoltageLengths([rozdzielnica, el("rj45", { x: 40, y: 0 })], opts)!;
    const daleko = lowVoltageLengths([rozdzielnica, el("rj45", { x: 600, y: 0 })], opts)!;
    expect(daleko.lan).toBeGreaterThan(blisko.lan);
  });

  it("LAN i koncentryk ida do osobnych pozycji", () => {
    const r = lowVoltageLengths([rozdzielnica, el("rj45", { x: 200, y: 0 }), el("rtvsat", { x: 200, y: 0 })], opts)!;
    expect(r.lan).toBeGreaterThan(0);
    expect(r.koncentryk).toBeGreaterThan(0);
    // Ten sam punkt, ta sama droga — rozni je tylko rodzaj przewodu.
    expect(r.lan).toBeCloseTo(r.koncentryk, 5);
  });

  /** Domofon jedzie z LAN-em, tak jak w dotychczasowym ryczalcie. */
  it("domofon dolicza sie do LAN-u", () => {
    const bez = lowVoltageLengths([rozdzielnica, el("rj45", { x: 200, y: 0 })], opts)!;
    const z = lowVoltageLengths([rozdzielnica, el("rj45", { x: 200, y: 0 }), el("domofon", { x: 200, y: 0 })], opts)!;
    expect(z.lan).toBeGreaterThan(bez.lan);
  });

  /**
   * SEDNO roznicy wobec zasilania: gwiazda to osobny kabel do kazdego punktu, wiec
   * KAZDY pokonuje pion miedzy pietrami z osobna. Lancuch wchodzi na pietro raz.
   */
  it("kazdy kabel pokonuje pion miedzy pietrami OSOBNO", () => {
    const pietra = [
      { id: "parter", name: "Parter" },
      { id: "pietro", name: "Piętro" },
    ];
    const jedno = lowVoltageLengths([rozdzielnica, el("rj45", { x: 200, y: 0, floor: "pietro" })], { ...opts, kondygnacje: pietra })!;
    const dwa = lowVoltageLengths(
      [rozdzielnica, el("rj45", { x: 200, y: 0, floor: "pietro" }), el("rj45", { x: 200, y: 0, floor: "pietro" })],
      { ...opts, kondygnacje: pietra }
    )!;
    // Drugie gniazdo w tym samym miejscu dokłada CALY swoj kabel razem z pionem 2,8 m.
    expect(dwa.lan - jedno.lan).toBeCloseTo(jedno.lan, 5);
  });

  it("bez rozdzielnicy albo bez skali nie ma od czego mierzyc", () => {
    expect(lowVoltageLengths([el("rj45", { x: 200, y: 0 })], opts)).toBeNull();
    expect(lowVoltageLengths([rozdzielnica, el("rj45", { x: 200, y: 0 })], { scales: {} })).toBeNull();
  });

  /** Bez narysowanych scian trasa spada na szacunek — tak samo jak przy zasilaniu. */
  it("mowi, kiedy trasa jest tylko szacunkiem", () => {
    const bezGeo = lowVoltageLengths([rozdzielnica, el("rj45", { x: 200, y: 0 })], opts)!;
    expect(bezGeo.szacunek).toBe(true);
  });
});
