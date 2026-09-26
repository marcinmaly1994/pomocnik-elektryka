import { describe, it, expect } from "vitest";
import { chunkLightsByGroup, colorForCircuit, kolorObwodu, KOLORY_OBWODOW, computeCircuits, computeLowVoltage, computeRcdGroups, mainBreakerFor, ostrzezeniaObwodow, wchodziDoObwodu, ZALECANE_MAKS } from "./circuits";
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

describe("wchodziDoObwodu — komu w ogóle nadaje się numer obwodu", () => {
  it("odbiorniki zasilane z rozdzielnicy należą do obwodu", () => {
    for (const type of ["gniazdko", "gniazdkoHerm", "oswietlenie", "ladowarkaEV", "wypustAGD"] as const) {
      expect(wchodziDoObwodu(el({ type })), type).toBe(true);
    }
  });

  it("rozdzielnica, łącznik, teletechnika i przybory — nie", () => {
    for (const type of ["rozdzielnica", "wlacznik", "czujnikRuchu", "rj45", "puszka", "wanna"] as const) {
      expect(wchodziDoObwodu(el({ type })), type).toBe(false);
    }
  });

  it("numer zapisany przy rozdzielnicy nie wciąga jej do obwodu", () => {
    const circuits = computeCircuits([
      el({ type: "gniazdko", obwod: 1 }),
      el({ type: "rozdzielnica", obwod: 1 }),
    ]);
    const obwod1 = circuits.find((c) => c.name.startsWith("Obwód 1"))!;
    expect(obwod1.elements.map((e) => e.type)).toEqual(["gniazdko"]);
    expect(circuits.flatMap((c) => c.elements).some((e) => e.type === "rozdzielnica")).toBe(false);
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
    // 6 lamp na parterze i 6 na piętrze, obie oznaczone numerem „1” — numeracja
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

/**
 * Numer obwodu nadany RECZNIE na rzucie (menu pod prawym przyciskiem).
 *
 * Automat dzieli obwody po rodzaju punktu, mokrosci pomieszczenia i kolejnosci —
 * a projektant czesto chce inaczej: kuchnia osobno, dwa pokoje razem, bo blisko
 * pionu. To decyzja projektowa, ktorej z samego rysunku nie da sie odgadnac.
 */
describe("computeCircuits — reczny numer obwodu", () => {
  it("elementy z tym samym numerem trafiaja do JEDNEGO obwodu, niezaleznie od pokoju", () => {
    const obwody = computeCircuits([
      el({ type: "gniazdko", room: "Salon", obwod: 3, id: "a" }),
      el({ type: "gniazdko", room: "Kuchnia", obwod: 3, id: "b" }),
    ]);
    expect(obwody).toHaveLength(1);
    expect(obwody[0].elements.map((e) => e.id).sort()).toEqual(["a", "b"]);
    expect(obwody[0].name).toContain("Obwód 3");
    // Nazwa wymienia pokoje, bo sam numer nie mowi, gdzie ten obwod jest.
    expect(obwody[0].name).toContain("Salon");
  });

  it("rozne numery to rozne obwody, a elementy BEZ numeru zostaja przy automacie", () => {
    const obwody = computeCircuits([
      el({ type: "gniazdko", obwod: 1, id: "a" }),
      el({ type: "gniazdko", obwod: 2, id: "b" }),
      el({ type: "gniazdko", id: "c" }),
    ]);
    expect(obwody).toHaveLength(3);
    const auto = obwody.find((o) => o.elements.some((e) => e.id === "c"))!;
    // „Salon” to pomieszczenie mieszkalne — automat nazywa obwód po ZASTOSOWANIU.
    expect(auto.name).toMatch(/Obwód gniazd — pokoje/);
  });

  it("obwod z choc jedna oprawa dostaje przewod i zabezpieczenie oswietleniowe", () => {
    const [o] = computeCircuits([
      el({ type: "oswietlenie", obwod: 5, id: "l" }),
      el({ type: "kinkiet", obwod: 5, id: "k" }),
    ]);
    expect(o.type).toBe("oswietlenie");
    expect(o.cable).toContain("1,5");
    expect(o.breaker).toBe("B10");
  });

  it("obwod z samych gniazd dostaje 2,5 mm2 i B16", () => {
    const [o] = computeCircuits([el({ type: "gniazdko", obwod: 5 }), el({ type: "gniazdko", obwod: 5 })]);
    expect(o.cable).toContain("2,5");
    expect(o.breaker).toBe("B16");
  });

  /**
   * Odbiornik z wlasnym obwodem z definicji IGNORUJE numer — jego obwod ma inny
   * przewod, inne zabezpieczenie i czesto inna liczbe faz, wiec dolaczenie go do
   * wspolnego dalo by nie „obwod z ladowarka”, tylko obwod z blednym doborem.
   */
  it("ladowarka EV, gniazdo trojfazowe i wypust AGD zostaja przy swoim obwodzie mimo numeru", () => {
    const obwody = computeCircuits([
      el({ type: "gniazdko", obwod: 4, id: "g" }),
      el({ type: "ladowarkaEV", obwod: 4, id: "ev" }),
      el({ type: "gniazdko400", obwod: 4, id: "3f" }),
      el({ type: "wypustAGD", obwod: 4, id: "agd" }),
    ]);
    const reczny = obwody.find((o) => o.name.startsWith("Obwód 4"))!;
    expect(reczny.elements.map((e) => e.id)).toEqual(["g"]);
    expect(obwody.some((o) => o.name.startsWith("Ładowarka EV"))).toBe(true);
    expect(obwody.some((o) => o.name.startsWith("Gniazdo trójfazowe"))).toBe(true);
    expect(obwody.some((o) => o.name.startsWith("Wypust AGD"))).toBe(true);
  });

  it("obwody reczne ida przed automatycznymi i sa uporzadkowane numerem", () => {
    const obwody = computeCircuits([
      el({ type: "gniazdko", obwod: 7 }),
      el({ type: "gniazdko", obwod: 2 }),
      el({ type: "gniazdko" }),
    ]);
    expect(obwody[0].name).toContain("Obwód 2");
    expect(obwody[1].name).toContain("Obwód 7");
  });
});

describe("ostrzezeniaObwodow", () => {
  it("bez recznych numerow nie ma czego zglaszac", () => {
    expect(ostrzezeniaObwodow([el({ type: "gniazdko" }), el({ type: "oswietlenie" })])).toEqual([]);
  });

  it("mieszanka oswietlenia z gniazdami jest zglaszana — dobor potraktuje ja jako oswietleniowa", () => {
    const o = ostrzezeniaObwodow([el({ type: "gniazdko", obwod: 1 }), el({ type: "oswietlenie", obwod: 1 })]);
    expect(o).toHaveLength(1);
    expect(o[0].numer).toBe(1);
    expect(o[0].tresc).toMatch(/1,5 mm²|za mało pod gniazda/);
  });

  it("przekroczenie zalecanej liczby punktow jest zglaszane jako PRAKTYKA, nie zakaz", () => {
    const dziewiec = Array.from({ length: 9 }, () => el({ type: "gniazdko", obwod: 2 }));
    const [o] = ostrzezeniaObwodow(dziewiec);
    expect(o.tresc).toContain("9 punktów");
    expect(o.tresc).toContain(String(ZALECANE_MAKS.gniazda));
    expect(o.tresc).toMatch(/praktyka projektowa, nie zakaz/);
  });

  it("osiem gniazd to jeszcze nie przekroczenie", () => {
    expect(ostrzezeniaObwodow(Array.from({ length: 8 }, () => el({ type: "gniazdko", obwod: 2 })))).toEqual([]);
  });

  it("w pomieszczeniu mokrym limit jest ciasniejszy", () => {
    const siedem = Array.from({ length: 7 }, () => el({ type: "gniazdkoHerm", obwod: 3 }));
    const [o] = ostrzezeniaObwodow(siedem);
    expect(o.tresc).toContain(String(ZALECANE_MAKS.gniazdaMokre));
    expect(o.tresc).toContain("mokre");
  });

  it("obwod oswietleniowy ma wlasny, wyzszy limit", () => {
    expect(ostrzezeniaObwodow(Array.from({ length: 10 }, () => el({ type: "oswietlenie", obwod: 4 })))).toEqual([]);
    expect(ostrzezeniaObwodow(Array.from({ length: 11 }, () => el({ type: "oswietlenie", obwod: 4 })))).toHaveLength(1);
  });
});

/**
 * Rozerwanie grupy sterowania to jedyne ostrzezenie mowiace „tego nie da sie
 * zbudowac". Lacznik siedzi szeregowo w przewodzie fazowym SWOJEGO obwodu, wiec
 * nie przelaczy drugiego — automat pilnuje tego twardo (`chunkLightsByGroup`),
 * a reczny numer omijal ten straznik bez slowa.
 */
describe("ostrzezeniaObwodow — rozerwana grupa sterowania", () => {
  const lacznik = (over: Partial<InstallationElement> = {}) => el({ type: "wlacznik", x: 0, y: 0, ...over });
  const oprawa = (over: Partial<InstallationElement> = {}) => el({ type: "oswietlenie", ...over });

  it("dwa rozne numery w jednej grupie sa zglaszane", () => {
    const o = ostrzezeniaObwodow([
      lacznik({ id: "sw" }),
      oprawa({ id: "l1", x: 20, obwod: 1 }),
      oprawa({ id: "l2", x: 40, obwod: 2 }),
    ]);
    const rozerwane = o.filter((w) => w.tresc.includes("jednym łącznikiem"));
    expect(rozerwane).toHaveLength(1);
    expect(rozerwane[0].tresc).toContain("obwód 1");
    expect(rozerwane[0].tresc).toContain("obwód 2");
    expect(rozerwane[0].tresc).toMatch(/nie da się wykonać/);
  });

  /** „Auto” to tez osobne przypisanie — oprawa z numerem i oprawa bez trafiaja do
   *  dwoch roznych obwodow tak samo skutecznie jak dwa rozne numery. */
  it("numer obok automatu w jednej grupie tez jest rozerwaniem", () => {
    const o = ostrzezeniaObwodow([lacznik({ id: "sw" }), oprawa({ id: "l1", x: 20, obwod: 1 }), oprawa({ id: "l2", x: 40 })]);
    expect(o.some((w) => w.tresc.includes("automat"))).toBe(true);
  });

  it("cala grupa na jednym numerze NIE jest zglaszana", () => {
    const o = ostrzezeniaObwodow([
      lacznik({ id: "sw" }),
      oprawa({ id: "l1", x: 20, obwod: 1 }),
      oprawa({ id: "l2", x: 40, obwod: 1 }),
    ]);
    expect(o.filter((w) => w.tresc.includes("jednym łącznikiem"))).toEqual([]);
  });

  it("grupa BEZ zadnego recznego numeru nie jest nasza sprawa — pilnuje jej automat", () => {
    const o = ostrzezeniaObwodow([lacznik({ id: "sw" }), oprawa({ id: "l1", x: 20 }), oprawa({ id: "l2", x: 40 })]);
    expect(o).toEqual([]);
  });

  /** Numeracja grup zaczyna sie od 1 osobno na kazdej kondygnacji — bez pietra
   *  w kluczu grupa 1 z parteru zlalaby sie z grupa 1 z pietra. */
  it("grupy o tym samym numerze na roznych kondygnacjach nie sa mylone", () => {
    const o = ostrzezeniaObwodow([
      lacznik({ id: "sw1", floor: "parter" }),
      oprawa({ id: "l1", x: 20, floor: "parter", obwod: 1 }),
      lacznik({ id: "sw2", floor: "pietro" }),
      oprawa({ id: "l2", x: 20, floor: "pietro", obwod: 2 }),
    ]);
    expect(o.filter((w) => w.tresc.includes("jednym łącznikiem"))).toEqual([]);
  });
});

/**
 * Kolor trasy na rzucie idzie z OBWODU, nie z pomieszczenia — inaczej obwod gniazd
 * i obwod oswietlenia w tym samym pokoju wychodzily identyczne.
 */
describe("kolorObwodu", () => {
  it("kolejne obwody dostaja ROZNE kolory", () => {
    expect(kolorObwodu(0)).not.toBe(kolorObwodu(1));
    expect(kolorObwodu(1)).not.toBe(kolorObwodu(2));
  });

  it("paleta zawija sie cyklicznie, wiec numer obwodu nigdy nie wyjdzie poza nia", () => {
    expect(kolorObwodu(KOLORY_OBWODOW.length)).toBe(kolorObwodu(0));
    expect(kolorObwodu(KOLORY_OBWODOW.length * 3 + 2)).toBe(kolorObwodu(2));
  });

  it("wszystkie kolory palety sa rozne — inaczej dwa obwody zlalyby sie mimo cyklu", () => {
    expect(new Set(KOLORY_OBWODOW).size).toBe(KOLORY_OBWODOW.length);
  });
});

/**
 * Jeden obwód gniazd wolno dzielić dwóm pokojom — ale tylko o tym samym ZASTOSOWANIU.
 *
 * Wcześniej wszystkie suche punkty szły do jednego worka dzielonego co 8 sztuk, więc o
 * tym, co wyląduje na wspólnym zabezpieczeniu, decydowała KOLEJNOŚĆ stawiania: garaż
 * trafiał na jeden obwód z sypialnią, jeśli tylko postawiono je po sobie.
 */
describe("computeCircuits — obwód gniazd a zastosowanie pomieszczenia", () => {
  const gniazda = (...pokoje: string[]) => pokoje.map((room, i) => el({ type: "gniazdko", room, id: "g" + i }));
  const nazwyGniazd = (obwody: ReturnType<typeof computeCircuits>) =>
    obwody.filter((o) => o.type === "gniazdko").map((o) => o.name);

  it("dwa pokoje mieszkalne dzielą JEDEN obwód", () => {
    const obwody = computeCircuits(gniazda("Sypialnia", "Salon", "Pokój dzienny"));
    expect(nazwyGniazd(obwody)).toEqual(["Obwód gniazd — pokoje 1"]);
    expect(obwody[0].elements).toHaveLength(3);
  });

  it("garaż NIE wchodzi na obwód sypialni — inne zastosowanie, osobne zabezpieczenie", () => {
    const obwody = computeCircuits(gniazda("Sypialnia", "Garaż"));
    expect(obwody).toHaveLength(2);
    const garaz = obwody.find((o) => o.elements.some((e) => e.room === "Garaż"))!;
    const sypialnia = obwody.find((o) => o.elements.some((e) => e.room === "Sypialnia"))!;
    expect(garaz.id).not.toBe(sypialnia.id);
    expect(garaz.name).toContain("gospodarcze");
    expect(sypialnia.name).toContain("pokoje");
  });

  /** Przykład podany wprost przez użytkownika: łazienki z sypialnią łączyć nie wolno. */
  it("łazienka nie dzieli obwodu z sypialnią, choćby postawiono je po sobie", () => {
    const obwody = computeCircuits(gniazda("Sypialnia", "Łazienka", "Sypialnia 2"));
    const zLazienka = obwody.find((o) => o.elements.some((e) => e.room === "Łazienka"))!;
    expect(zLazienka.elements.every((e) => e.room === "Łazienka")).toBe(true);
  });

  /**
   * „WC” to łazienka, choć nie ma w nazwie słowa „łazienka”. Bez tego pomieszczenie
   * sanitarne wypadało z reguł strefy mokrej i szło na wspólny obwód z pokojami.
   */
  it("pokój nazwany „WC” jest traktowany jak łazienka, nie jak pokój", () => {
    const obwody = computeCircuits(gniazda("Sypialnia", "WC"));
    const zWc = obwody.find((o) => o.elements.some((e) => e.room === "WC"))!;
    expect(zWc.elements.every((e) => e.room === "WC")).toBe(true);
    expect(zWc.name).toBe("Obwód gniazd — WC");
  });

  /** Nazwa nie decyduje, gdy obrys ma JAWNY typ — to on jest źródłem prawdy. */
  it("jawny typ obrysu bije nazwę: „Pracownia” oznaczona jako garaż idzie z gospodarczymi", () => {
    const obwody = computeCircuits(gniazda("Sypialnia", "Pracownia"), [
      { id: "r1", floor: "f1", name: "Pracownia", color: "#fff", points: [], type: "garaz" },
    ]);
    const pracownia = obwody.find((o) => o.elements.some((e) => e.room === "Pracownia"))!;
    expect(pracownia.name).toContain("gospodarcze");
  });

  /**
   * Punkt bez rozpoznanego pomieszczenia nie ma z czym dzielić obwodu — o jego
   * zastosowaniu nic nie wiadomo. Zostaje przy nazwie, którą ten obwód nosił od zawsze.
   */
  it("punkty bez pomieszczenia trafiają do obwodu ogólnego, osobno od pokoi", () => {
    const obwody = computeCircuits(gniazda("Sypialnia", "Bez pomieszczenia"));
    expect(nazwyGniazd(obwody).sort()).toEqual(["Obwód gniazd ogólnych 1", "Obwód gniazd — pokoje 1"]);
  });

  /** Limit 8 punktów na obwód działa DALEJ, tyle że w obrębie jednego zastosowania. */
  it("dziewięć gniazd w pokojach to dwa obwody, nie jeden przeciążony", () => {
    const obwody = computeCircuits(gniazda(...Array.from({ length: 9 }, () => "Sypialnia")));
    expect(nazwyGniazd(obwody)).toEqual(["Obwód gniazd — pokoje 1", "Obwód gniazd — pokoje 2"]);
    expect(obwody[0].elements).toHaveLength(8);
    expect(obwody[1].elements).toHaveLength(1);
  });
});

/**
 * Ręczny numer obwodu omija podział po zastosowaniu — jedyne miejsce, w którym
 * łazienka wciąż MOŻE trafić na jeden obwód z sypialnią. Mówimy o tym wprost.
 */
describe("ostrzezeniaObwodow — różne przeznaczenie na jednym obwodzie", () => {
  it("zgłasza łazienkę razem z sypialnią pod jednym numerem", () => {
    const [o] = ostrzezeniaObwodow([
      el({ type: "gniazdko", room: "Sypialnia", obwod: 3 }),
      el({ type: "gniazdko", room: "Łazienka", obwod: 3 }),
    ]);
    expect(o.numer).toBe(3);
    expect(o.tresc).toContain("różnym przeznaczeniu");
    expect(o.tresc).toContain("łazienki");
  });

  it("dwa pokoje mieszkalne pod jednym numerem to NIE ostrzeżenie — to dozwolone", () => {
    const out = ostrzezeniaObwodow([
      el({ type: "gniazdko", room: "Sypialnia", obwod: 3 }),
      el({ type: "gniazdko", room: "Salon", obwod: 3 }),
    ]);
    expect(out).toEqual([]);
  });

  /** Punkt bez pomieszczenia nie jest „innym przeznaczeniem” — jest brakiem danych. */
  it("gniazdo bez pomieszczenia dorzucone do obwodu pokoi nie wywołuje ostrzeżenia", () => {
    const out = ostrzezeniaObwodow([
      el({ type: "gniazdko", room: "Sypialnia", obwod: 3 }),
      el({ type: "gniazdko", room: "Bez pomieszczenia", obwod: 3 }),
    ]);
    expect(out).toEqual([]);
  });
});
