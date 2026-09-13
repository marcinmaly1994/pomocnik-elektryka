import { describe, it, expect } from "vitest";
import type { InstallationElement, RoomShape } from "@/types";
import { NO_ROOM } from "./elements";
import { gruboscObrysuPokoju, MANUAL_DRAW_SCALE_MPU, rozpietoscRysunku,
  ROOM_COLORS,
  roomColorForIndex,
  nextRoomName,
  nextRoomColor,
  colorForRoomName,
  NO_ROOM_COLOR,
  scaleOf,
  planSizeForImage,
  DEFAULT_PLAN_SIZE,
  GRID,
  defaultOpeningWidth,
  DEFAULT_DOOR_WIDTH_CM,
  DEFAULT_OPENING_WIDTH_UNITS,
  contentBounds,
  MARGINES_KADROWANIA,
  ZAPAS_ETYKIET,
  wysokoscPlotna,
  PASMO_NAWIGACJI_PX,
  MIN_WYS_PLOTNA,
  MAX_WYS_PLOTNA,
  detectRoomName,
  reassignRoomsOnFloor,
  reconcileRoomsOnLoad,
  roomNameAfterMove,
} from "./design";
import { rogiSymbolu } from "@/lib/glyphs";

describe("roomColorForIndex", () => {
  it("cykluje przez paletę", () => {
    expect(roomColorForIndex(0)).toBe(ROOM_COLORS[0]);
    expect(roomColorForIndex(ROOM_COLORS.length)).toBe(ROOM_COLORS[0]);
    expect(roomColorForIndex(ROOM_COLORS.length + 2)).toBe(ROOM_COLORS[2]);
  });
});

describe("nextRoomName", () => {
  it("numeruje od 1", () => {
    expect(nextRoomName(0)).toBe("Pomieszczenie 1");
    expect(nextRoomName(4)).toBe("Pomieszczenie 5");
  });
});

describe("nextRoomColor", () => {
  it("przechodzi do kolejnego koloru w palecie", () => {
    expect(nextRoomColor(ROOM_COLORS[0])).toBe(ROOM_COLORS[1]);
  });

  it("zawija się na koniec palety", () => {
    expect(nextRoomColor(ROOM_COLORS[ROOM_COLORS.length - 1])).toBe(ROOM_COLORS[0]);
  });

  it("nieznany kolor -> pierwszy z palety", () => {
    expect(nextRoomColor("#000000")).toBe(ROOM_COLORS[0]);
  });
});

describe("colorForRoomName", () => {
  const salon: RoomShape = { id: "r1", floor: "f1", name: "Salon", color: "#3B8C63", points: [] };
  const kuchnia: RoomShape = { id: "r2", floor: "f1", name: "Kuchnia", color: "#C1793F", points: [] };

  it("dopasowuje po NAZWIE, nie po id", () => {
    expect(colorForRoomName("Salon", [salon, kuchnia])).toBe("#3B8C63");
    expect(colorForRoomName("Kuchnia", [salon, kuchnia])).toBe("#C1793F");
  });

  it("nazwa bez odpowiadającego obrysu (np. „Bez pomieszczenia”) dostaje neutralny szary", () => {
    expect(colorForRoomName("Bez pomieszczenia", [salon, kuchnia])).toBe(NO_ROOM_COLOR);
    expect(colorForRoomName("Sypialnia", [])).toBe(NO_ROOM_COLOR);
  });
});

describe("scaleOf", () => {
  it("zwraca skalę skalibrowanej kondygnacji", () => {
    expect(scaleOf({ f1: 0.02 }, "f1")).toBe(0.02);
  });

  it("brak wpisu -> null", () => {
    expect(scaleOf({}, "f1")).toBeNull();
  });

  it("nieprawidłowa wartość (0 lub ujemna) -> null", () => {
    expect(scaleOf({ f1: 0 }, "f1")).toBeNull();
    expect(scaleOf({ f1: -1 }, "f1")).toBeNull();
  });
});

describe("planSizeForImage", () => {
  it("zachowuje proporcje wgranego obrazu", () => {
    const s = planSizeForImage(1600, 900);
    expect(s.w / s.h).toBeCloseTo(16 / 9, 1);
  });

  it("trzyma pole powierzchni blisko domyślnego, żeby nie zmieniać gęstości siatki", () => {
    const base = DEFAULT_PLAN_SIZE.w * DEFAULT_PLAN_SIZE.h;
    [
      [1600, 900],
      [3, 4],
      [1000, 1000],
    ].forEach(([w, h]) => {
      const s = planSizeForImage(w, h);
      expect(s.w * s.h).toBeGreaterThan(base * 0.9);
      expect(s.w * s.h).toBeLessThan(base * 1.1);
    });
  });

  it("wymiary są wielokrotnością siatki, żeby kończyła się równo na krawędzi", () => {
    const s = planSizeForImage(1234, 567);
    expect(s.w % GRID).toBe(0);
    expect(s.h % GRID).toBe(0);
  });

  it("obraz kwadratowy daje kwadratowy plan", () => {
    const s = planSizeForImage(800, 800);
    expect(s.w).toBe(s.h);
  });

  it("bezsensowne wymiary cofają do domyślnego rozmiaru", () => {
    expect(planSizeForImage(0, 100)).toEqual(DEFAULT_PLAN_SIZE);
    expect(planSizeForImage(100, NaN)).toEqual(DEFAULT_PLAN_SIZE);
  });
});

describe("defaultOpeningWidth", () => {
  it("bez skali spada na stały fallback w jednostkach planu", () => {
    expect(defaultOpeningWidth(null)).toBe(DEFAULT_OPENING_WIDTH_UNITS);
  });

  it("ze skalą przelicza realne centymetry na jednostki planu", () => {
    const mpu = 0.05; // 1 jedn. = 5 cm — MANUAL_DRAW_SCALE_MPU
    expect(defaultOpeningWidth(mpu)).toBeCloseTo(DEFAULT_DOOR_WIDTH_CM / 100 / mpu, 6);
  });

  it("nieprawidłowa skala (0 lub ujemna) też spada na fallback", () => {
    expect(defaultOpeningWidth(0)).toBe(DEFAULT_OPENING_WIDTH_UNITS);
    expect(defaultOpeningWidth(-1)).toBe(DEFAULT_OPENING_WIDTH_UNITS);
  });
});

/** Dwa sąsiadujące pokoje 100×100 jedn.: kuchnia po lewej, łazienka po prawej.
 *  Skala jak przy rysowaniu od zera (1 jedn. = 5 cm), więc próg przyciągania do
 *  krawędzi (ROOM_SNAP_TOLERANCE_M = 0,4 m) wypada na 8 jedn. */
const MPU = 0.05;
const kuchniaObrys: RoomShape = {
  id: "r1",
  floor: "f1",
  name: "Kuchnia",
  color: "#C1793F",
  points: [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ],
};
const lazienkaObrys: RoomShape = {
  id: "r2",
  floor: "f1",
  name: "Łazienka",
  color: "#2D5A8C",
  points: [
    { x: 200, y: 0 },
    { x: 300, y: 0 },
    { x: 300, y: 100 },
    { x: 200, y: 100 },
  ],
};
const OBRYSY = [kuchniaObrys, lazienkaObrys];

function el(over: Partial<InstallationElement>): InstallationElement {
  return {
    id: "e1",
    type: "gniazdko",
    x: 50,
    y: 50,
    room: "Kuchnia",
    floor: "f1",
    dedicated: false,
    note: "",
    gangs: 1,
    ...over,
  };
}

describe("detectRoomName", () => {
  it("punkt wewnątrz obrysu dostaje jego nazwę", () => {
    expect(detectRoomName({ x: 50, y: 50 }, OBRYSY, MPU)).toBe("Kuchnia");
    expect(detectRoomName({ x: 250, y: 50 }, OBRYSY, MPU)).toBe("Łazienka");
  });

  it("punkt tuż za krawędzią przyciąga się do pomieszczenia (osprzęt w ścianie)", () => {
    expect(detectRoomName({ x: 105, y: 50 }, OBRYSY, MPU)).toBe("Kuchnia");
  });

  it("punkt dalej niż próg tolerancji jest niczyj", () => {
    expect(detectRoomName({ x: 150, y: 50 }, OBRYSY, MPU)).toBe(NO_ROOM);
  });

  it("bez obrysów wszystko jest niczyje", () => {
    expect(detectRoomName({ x: 50, y: 50 }, [], MPU)).toBe(NO_ROOM);
  });
});

describe("roomNameAfterMove", () => {
  it("element przeciągnięty do innego pomieszczenia zmienia przypisanie", () => {
    expect(roomNameAfterMove({ x: 250, y: 50 }, "Kuchnia", OBRYSY, MPU)).toBe("Łazienka");
  });

  it("element wyprowadzony poza wszystkie obrysy traci przypisanie", () => {
    expect(roomNameAfterMove({ x: 150, y: 50 }, "Kuchnia", OBRYSY, MPU)).toBe(NO_ROOM);
  });

  it("nazwa wpisana ręcznie (bez obrysu na planie) przeżywa przesunięcie", () => {
    // „Garderoba" nie ma obrysu, więc nic na rysunku jej nie zaprzecza — samo
    // drgnięcie elementu nie ma prawa skasować tego, co użytkownik wpisał.
    expect(roomNameAfterMove({ x: 150, y: 50 }, "Garderoba", OBRYSY, MPU)).toBe("Garderoba");
  });

  it("ale wjazd w narysowany obrys wygrywa nawet z nazwą wpisaną ręcznie", () => {
    expect(roomNameAfterMove({ x: 250, y: 50 }, "Garderoba", OBRYSY, MPU)).toBe("Łazienka");
  });
});

describe("reassignRoomsOnFloor", () => {
  it("dorysowane pomieszczenie przygarnia elementy niczyje", () => {
    const elements = [el({ id: "a", x: 50, y: 50, room: NO_ROOM })];
    const out = reassignRoomsOnFloor(elements, OBRYSY, "f1", MPU, []);
    expect(out[0].room).toBe("Kuchnia");
  });

  it("nie rusza elementów spoza zasięgu zmiany", () => {
    // Łazienkowe gniazdko zostaje łazienkowe, choć przeliczamy po edycji kuchni.
    const elements = [el({ id: "a", x: 250, y: 50, room: "Łazienka" })];
    expect(reassignRoomsOnFloor(elements, OBRYSY, "f1", MPU, ["Kuchnia"])).toBe(elements);
  });

  it("po usunięciu obrysu elementy tracą nazwę nieistniejącego pokoju", () => {
    const elements = [el({ id: "a", x: 50, y: 50, room: "Kuchnia" })];
    const out = reassignRoomsOnFloor(elements, [lazienkaObrys], "f1", MPU, ["Kuchnia"]);
    expect(out[0].room).toBe(NO_ROOM);
  });

  it("nie dotyka innych kondygnacji", () => {
    const elements = [el({ id: "a", x: 50, y: 50, room: NO_ROOM, floor: "f2" })];
    expect(reassignRoomsOnFloor(elements, OBRYSY, "f1", MPU, [])).toBe(elements);
  });

  it("zwraca tę samą tablicę, gdy nic się nie zmieniło", () => {
    const elements = [el({ id: "a", x: 50, y: 50, room: "Kuchnia" })];
    expect(reassignRoomsOnFloor(elements, OBRYSY, "f1", MPU, ["Kuchnia"])).toBe(elements);
  });
});

describe("reconcileRoomsOnLoad", () => {
  const SKALE = { f1: MPU };

  it("prostuje element, który został w starym pokoju po przeniesieniu", () => {
    // Zapis sprzed poprawki: gniazdko fizycznie w łazience, opisane jako kuchenne.
    const elements = [el({ id: "a", x: 250, y: 50, room: "Kuchnia" })];
    const out = reconcileRoomsOnLoad(elements, OBRYSY, SKALE);
    expect(out.poprawione).toBe(1);
    expect(out.elements[0].room).toBe("Łazienka");
  });

  it("element wyprowadzony poza wszystkie obrysy traci nieaktualne przypisanie", () => {
    const elements = [el({ id: "a", x: 150, y: 50, room: "Kuchnia" })];
    expect(reconcileRoomsOnLoad(elements, OBRYSY, SKALE).elements[0].room).toBe(NO_ROOM);
  });

  it("nie rusza nazw wpisanych ręcznie, dla których nie ma obrysu", () => {
    const elements = [el({ id: "a", x: 150, y: 50, room: "Garderoba" })];
    const out = reconcileRoomsOnLoad(elements, OBRYSY, SKALE);
    expect(out.poprawione).toBe(0);
    expect(out.elements[0].room).toBe("Garderoba");
  });

  it("liczy skalę i obrysy OSOBNO dla każdej kondygnacji", () => {
    // Ta sama nazwa („Kuchnia") na dwóch piętrach to dwa różne pokoje — element
    // z piętra nie ma prawa dopasować się do obrysu z parteru.
    const kuchniaNaPietrze: RoomShape = { ...kuchniaObrys, id: "r3", floor: "f2" };
    const elements = [
      el({ id: "a", x: 50, y: 50, room: "Kuchnia", floor: "f1" }),
      el({ id: "b", x: 250, y: 50, room: NO_ROOM, floor: "f2" }),
    ];
    const out = reconcileRoomsOnLoad(elements, [...OBRYSY, kuchniaNaPietrze], { f1: MPU, f2: MPU });
    expect(out.poprawione).toBe(0);
    expect(out.elements[1].room).toBe(NO_ROOM);
  });

  it("spójny zapis zwraca tę samą tablicę i zero poprawek", () => {
    const elements = [el({ id: "a", x: 50, y: 50, room: "Kuchnia" })];
    const out = reconcileRoomsOnLoad(elements, OBRYSY, SKALE);
    expect(out.poprawione).toBe(0);
    expect(out.elements).toBe(elements);
  });

  it("jest idempotentne — drugie wczytanie już nic nie poprawia", () => {
    const elements = [el({ id: "a", x: 250, y: 50, room: "Kuchnia" })];
    const raz = reconcileRoomsOnLoad(elements, OBRYSY, SKALE);
    expect(reconcileRoomsOnLoad(raz.elements, OBRYSY, SKALE).poprawione).toBe(0);
  });
});

describe("defaultOpeningWidth — rodzaj otworu", () => {
  const mpu = 0.05;

  it("okno jest szersze od drzwi", () => {
    expect(defaultOpeningWidth(mpu, "okno")).toBeGreaterThan(defaultOpeningWidth(mpu, "drzwi"));
  });

  it("bez podania rodzaju stawiamy drzwi — zachowanie sprzed dodania okien", () => {
    expect(defaultOpeningWidth(mpu)).toBe(defaultOpeningWidth(mpu, "drzwi"));
  });

  it("bez skali oba rodzaje spadają na ten sam fallback — nie ma z czego liczyć cm", () => {
    expect(defaultOpeningWidth(null, "okno")).toBe(DEFAULT_OPENING_WIDTH_UNITS);
    expect(defaultOpeningWidth(null, "drzwi")).toBe(DEFAULT_OPENING_WIDTH_UNITS);
  });
});

describe("contentBounds", () => {
  const PLAN = { w: 1000, h: 700 };
  const sciana = { points: [{ x: 200, y: 200 }, { x: 400, y: 200 }, { x: 400, y: 300 }] };

  it("obejmuje całą geometrię z marginesem", () => {
    const b = contentBounds(PLAN, [sciana], [], [], [])!;
    expect(b.x).toBe(200 - MARGINES_KADROWANIA);
    expect(b.y).toBe(200 - MARGINES_KADROWANIA);
    expect(b.x + b.w).toBe(400 + MARGINES_KADROWANIA);
    expect(b.y + b.h).toBe(300 + MARGINES_KADROWANIA);
  });

  it("bierze pod uwagę wszystkie rodzaje treści, nie tylko ściany", () => {
    const b = contentBounds(PLAN, [sciana], [], [{ x: 700, y: 500 }], [])!;
    expect(b.x + b.w).toBe(700 + MARGINES_KADROWANIA);
    expect(b.y + b.h).toBe(500 + MARGINES_KADROWANIA);
  });

  it("nie wychodzi poza obszar planu — inaczej eksport złapałby pas pustki", () => {
    const przyKrawedzi = { points: [{ x: 5, y: 5 }, { x: 995, y: 695 }] };
    const b = contentBounds(PLAN, [przyKrawedzi], [], [], [])!;
    expect(b.x).toBe(0);
    expect(b.y).toBe(0);
    expect(b.x + b.w).toBe(PLAN.w);
    expect(b.y + b.h).toBe(PLAN.h);
  });

  it("pusta kondygnacja nie ma czego kadrować", () => {
    expect(contentBounds(PLAN, [], [], [], [])).toBeNull();
  });

  it("pojedynczy punkt daje kadr o rozmiarze marginesu, nie zerowy", () => {
    const b = contentBounds(PLAN, [], [], [{ x: 500, y: 350 }], [])!;
    expect(b.w).toBe(MARGINES_KADROWANIA * 2);
    expect(b.h).toBe(MARGINES_KADROWANIA * 2);
  });

  /** Symbole rosną w jednostkach planu razem z gęstością kalibracji (patrz
   *  `autoSymbolScale`), więc margines musi dać się powiększyć — inaczej wanna
   *  na gęsto skalibrowanym rzucie wychodzi z kadru obcięta w połowie. */
  it("margines da się podać z zewnątrz, żeby zmieścić powiększone symbole", () => {
    const b = contentBounds(PLAN, [], [], [{ x: 500, y: 350 }], [], 300)!;
    expect(b.w).toBe(600);
    expect(b.x).toBe(200);
  });
});

describe("gruboscObrysuPokoju", () => {
  it("odpowiada 8 cm w skali rzutu", () => {
    expect(gruboscObrysuPokoju(0.05)).toBeCloseTo(1.6, 6); // 1 jedn. = 5 cm
    expect(gruboscObrysuPokoju(0.01)).toBeCloseTo(8, 6); // 1 jedn. = 1 cm
  });

  /** Bez kalibracji obowiazuje skala rysunku odrecznego — to ona jest wtedy prawda. */
  it("bez skali bierze skale rysunku odrecznego", () => {
    expect(gruboscObrysuPokoju(null)).toBeCloseTo(gruboscObrysuPokoju(MANUAL_DRAW_SCALE_MPU), 6);
    expect(gruboscObrysuPokoju(0)).toBeCloseTo(gruboscObrysuPokoju(MANUAL_DRAW_SCALE_MPU), 6);
  });

  /** Im drobniejsza jednostka planu, tym WIECEJ jednostek na te same 8 cm. */
  it("gestszy rzut daje grubszy obrys w jednostkach", () => {
    expect(gruboscObrysuPokoju(0.01)).toBeGreaterThan(gruboscObrysuPokoju(0.05));
  });
});

/**
 * Kadrowanie liczone z ROGOW symboli, nie z ich srodkow.
 *
 * Wczesniej brало srodki i doklada­lo staly MARGINES_KADROWANIA (60 jedn.) — zapas
 * na najgorszy przypadek, czyli wanne ze strefa. Przy rzucie mieszkania szerokim na
 * 420 jednostek zjadal prawie cwierc obrazu, choc na planie staly same gniazda.
 */
describe("rogiSymbolu", () => {
  const el = (type: InstallationElement["type"], over: Partial<InstallationElement> = {}): InstallationElement => ({
    id: "x",
    type,
    x: 100,
    y: 100,
    room: "Salon",
    floor: "parter",
    dedicated: false,
    note: "",
    gangs: 1,
    ...over,
  });

  it("obejmuje CALY symbol, nie tylko jego srodek", () => {
    const [a, b] = rogiSymbolu(el("gniazdko"), 1);
    expect(a.x).toBeLessThan(100);
    expect(b.x).toBeGreaterThan(100);
    // Promien to polowa przekatnej pudelka gniazdka (18 x 22).
    expect(b.x - a.x).toBeCloseTo(Math.hypot(18, 22), 5);
  });

  it("PRZYBOR sanitarny zajmuje wyraznie wiecej niz gniazdko", () => {
    const [ga, gb] = rogiSymbolu(el("gniazdko"), 1);
    const [wa, wb] = rogiSymbolu(el("wanna"), 1);
    expect(wb.x - wa.x).toBeGreaterThan((gb.x - ga.x) * 1.5);
  });

  it("skaluje sie razem z symbolami — suwak rozmiaru nie obcina rysunku", () => {
    const [a1, b1] = rogiSymbolu(el("gniazdko"), 1);
    const [a2, b2] = rogiSymbolu(el("gniazdko"), 2);
    expect(b2.x - a2.x).toBeCloseTo((b1.x - a1.x) * 2, 5);
  });

  /** Sedno: kadr wokol samych gniazd ma byc CIASNY, a nie liczony jak dla wanny. */
  it("kadr wokol samych gniazd jest ciasniejszy niz stary staly margines", () => {
    const gniazda = [el("gniazdko", { x: 100, y: 100 }), el("gniazdko", { x: 300, y: 100 })];
    const zRogow = contentBounds(
      { w: 1000, h: 700 },
      [],
      [],
      gniazda.flatMap((e) => rogiSymbolu(e, 1)),
      [],
      ZAPAS_ETYKIET
    )!;
    const poStaremu = contentBounds({ w: 1000, h: 700 }, [], [], gniazda, [], MARGINES_KADROWANIA)!;
    expect(zRogow.w).toBeLessThan(poStaremu.w);
  });
});

describe("rozpietoscRysunku", () => {
  const sciana = (pts: { x: number; y: number }[]) => ({ points: pts });

  it("bez scian i pomieszczen nie ma czego mierzyc", () => {
    expect(rozpietoscRysunku([], [])).toBeNull();
  });

  it("mierzy DLUZSZY bok obrysu, nie przekatna", () => {
    expect(rozpietoscRysunku([sciana([{ x: 100, y: 50 }, { x: 400, y: 250 }])], [])).toBe(300);
  });

  it("laczy sciany z pomieszczeniami w jeden obrys", () => {
    const r = rozpietoscRysunku(
      [sciana([{ x: 0, y: 0 }, { x: 100, y: 0 }])],
      [{ points: [{ x: 0, y: 0 }, { x: 0, y: 900 }] }]
    );
    expect(r).toBe(900);
  });
});

describe("wysokoscPlotna", () => {
  // Wszystkie liczby „ile stoi nad płótnem" (312 px) są zmierzone w przeglądarce na
  // zakładce Instalacja: nagłówek strony, pasek etapów, pasek kondygnacji i pasek
  // narzędzi. To ta wartość, którą kod przez długi czas ZGADYWAŁ jako 260.
  const GORA = 312;

  it("kończy płótno nad pasmem pigułek nawigacji, nie pod dolną krawędzią okna", () => {
    const h = wysokoscPlotna(GORA, 900);
    // Dół płótna musi wypaść nad górną krawędzią pigułki „Dalej", inaczej pigułka
    // leży NA rysunku i zjada tam kliknięcia.
    expect(GORA + h).toBeLessThanOrEqual(900 - PASMO_NAWIGACJI_PX);
  });

  it("rośnie razem z oknem", () => {
    expect(wysokoscPlotna(GORA, 1200)).toBeGreaterThan(wysokoscPlotna(GORA, 900));
  });

  it("kurczy się, gdy nad płótnem przybywa banerów", () => {
    // Baner „Zacznij od wgrania rzutu" spycha płótno o kilkadziesiąt pikseli w dół;
    // gdyby wysokość go nie uwzględniała, dół rysunku wychodziłby poza okno.
    const zBanerem = wysokoscPlotna(GORA + 48, 900);
    expect(zBanerem).toBe(wysokoscPlotna(GORA, 900) - 48);
  });

  it("nie schodzi poniżej minimum, choćby nad płótnem stało całe okno", () => {
    // Telefon: nagłówek, banery i biblioteka elementów potrafią zająć więcej niż
    // wysokość ekranu. Ujemne płótno nie jest odpowiedzią.
    expect(wysokoscPlotna(1500, 812)).toBe(MIN_WYS_PLOTNA);
  });

  it("nie przekracza maksimum na bardzo wysokim oknie", () => {
    expect(wysokoscPlotna(GORA, 4000)).toBe(MAX_WYS_PLOTNA);
  });

  it("bez pomiaru wraca do dawnego szacunku — to tylko wartość startowa", () => {
    // `null` znaczy „kolumna płótna jeszcze nie istnieje" (ekran wejściowy,
    // przycinanie podkładu). Ma dać cokolwiek sensownego, a nie zero.
    expect(wysokoscPlotna(null, 900)).toBe(640);
    expect(wysokoscPlotna(null, 1400)).toBe(1100);
  });
});
