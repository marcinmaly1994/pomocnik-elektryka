import { describe, it, expect } from "vitest";
import {
  balancePhases,
  buildPanelDevices,
  computePhaseLoad,
  computeSelectivity,
  layoutPanel,
  MANUAL_DEVICE_TYPES,
  przeniesAparat,
  ratedCurrent,
} from "./devices";
import type { Circuit, PanelDevice, RcdGroup } from "@/types";

describe("ratedCurrent", () => {
  it("wyciąga liczbę z etykiety", () => {
    expect(ratedCurrent("B16")).toBe(16);
    expect(ratedCurrent("C25 3-faz.")).toBe(25);
  });

  it("brak liczby -> 0", () => {
    expect(ratedCurrent("")).toBe(0);
  });
});

describe("balancePhases", () => {
  it("rozdziela obwody 1-fazowe na fazę najmniej obciążoną", () => {
    const devices: PanelDevice[] = [
      { uid: "1", kind: "mcb", tag: "F1", modules: 1, label: "B16", caption: "a", poles: "1P" },
      { uid: "2", kind: "mcb", tag: "F2", modules: 1, label: "B16", caption: "b", poles: "1P" },
      { uid: "3", kind: "mcb", tag: "F3", modules: 1, label: "B10", caption: "c", poles: "1P" },
    ];
    const balanced = balancePhases(devices);
    const phases = balanced.map((d) => d.phase);
    // pierwsze dwa idą na różne (najmniej obciążone) fazy, trzeci na najmniej obciążoną z pozostałych
    expect(new Set(phases).size).toBeGreaterThan(1);
  });

  it("pomija aparaty 3-fazowe i nie-mcb", () => {
    const devices: PanelDevice[] = [{ uid: "1", kind: "main", tag: "Q1", modules: 4, label: "40A", caption: "główny", poles: "4P", phase: "3F" }];
    expect(balancePhases(devices)[0].phase).toBe("3F");
  });
});

describe("buildPanelDevices", () => {
  const circuits: Circuit[] = [
    { id: "obw1", name: "Gniazda salon", type: "gniazdko", elements: [], cable: "YDYp 3x2,5 mm²", breaker: "B16", rcd: true },
  ];
  const rcdGroups: RcdGroup[] = [{ id: "rcd1", rating: "30mA", circuits }];

  it("zawsze zawiera rozłącznik główny", () => {
    const devices = buildPanelDevices(rcdGroups);
    expect(devices[0].kind).toBe("main");
    expect(devices[0].tag).toBe("Q1");
  });

  it("podpis różnicówki podaje TEN SAM prąd znamionowy co jej etykieta", () => {
    // Regresja: `RcdGroup.rating` niósł kiedyś pełne „40A/30mA", a etykietę aparatu
    // liczyło `rcdRatingFor` z rozłącznika głównego — przy zasilaniu 3-fazowym
    // wychodziło 63 A i aparat pokazywał się jako „63A" z podpisem „…40A/30mA".
    // Podpis jest tym, z czym idzie się do sklepu, więc nie może przeczyć etykiecie.
    const rcd = buildPanelDevices(rcdGroups, { supply3f: true, mainRating: 40 }).find((d) => d.kind === "rcd")!;
    expect(rcd.label).toBe("63A");
    expect(rcd.caption).toBe("Wyłącznik różnicowoprądowy 63A/30mA");

    // ...i tak samo, gdy rozłącznik główny podnosi dobór wyżej
    const wiekszy = buildPanelDevices(rcdGroups, { supply3f: true, mainRating: 80 }).find((d) => d.kind === "rcd")!;
    expect(wiekszy.caption).toBe(`Wyłącznik różnicowoprądowy ${wiekszy.label}/30mA`);
  });

  it("NIE dokłada bezpiecznika przedlicznikowego — to szafka operatora, nie rozdzielnica", () => {
    // Bezpiecznik pod SPD jest potrzebny tylko przy konkretnej wytrzymałości
    // zwarciowej ogranicznika, a „przedlicznikowy" leży PRZED licznikiem, czyli
    // poza zakresem tego rysunku. Dokłada się go ręcznie, gdy karta katalogowa
    // ogranicznika tego wymaga.
    expect(buildPanelDevices(rcdGroups).some((d) => d.kind === "spdFuse")).toBe(false);
    // ...ale nadal da się go dołożyć z katalogu ręcznego
    expect(MANUAL_DEVICE_TYPES.some((t) => t.key === "spdFuse")).toBe(true);
  });

  it("NIE dokłada ogranicznika przepięć automatycznie", () => {
    // Wcześniej SPD pojawiał się z automatu, sterowany osobną flagą konfiguracji —
    // więc każda nowa rozdzielnica dostawała go, nawet gdy instalacja go nie
    // potrzebuje. Teraz jest zwykłą pozycją katalogu (patrz test niżej), dokładaną
    // świadomie tak samo jak każde inne zabezpieczenie — bez żadnej opcji, którą
    // dałoby się przekazać do `buildPanelDevices`, żeby go z powrotem wymusić.
    expect(buildPanelDevices(rcdGroups).some((d) => d.kind === "spd")).toBe(false);
  });

  it("ogranicznik przepięć da się dołożyć z katalogu ręcznego", () => {
    const spd = MANUAL_DEVICE_TYPES.find((t) => t.key === "spd");
    expect(spd).toBeDefined();
    expect(spd!.ratings).toEqual(expect.arrayContaining(["T1", "T2", "T1+T2"]));
  });

  it("generuje RCD i MCB dla każdego obwodu w grupie", () => {
    const devices = buildPanelDevices(rcdGroups);
    expect(devices.some((d) => d.kind === "rcd")).toBe(true);
    const mcb = devices.find((d) => d.kind === "mcb");
    expect(mcb?.caption).toBe("Gniazda salon");
    expect(mcb?.rcdTag).toBe("FI1");
  });

  it("każdy aparat ma unikalny uid", () => {
    const devices = buildPanelDevices(rcdGroups);
    const uids = new Set(devices.map((d) => d.uid));
    expect(uids.size).toBe(devices.length);
  });

  it("prąd znamionowy różnicówki rośnie razem z rozłącznikiem głównym", () => {
    // Wcześniej różnicówka miała rating na sztywno 63A (3-fazowe) / 40A (1-fazowe),
    // niezależnie od wybranego rozłącznika głównego — przy 80 A dawało to różnicówkę
    // słabszą niż aparat nadrzędny, czyli dokładnie błąd, który wykrywa reguła 3
    // w `computeSelectivity` („Różnicówka niezabezpieczona przed przeciążeniem").
    const rcd80 = buildPanelDevices(rcdGroups, { supply3f: true, mainRating: 80 }).find((d) => d.kind === "rcd");
    expect(rcd80?.label).toBe("80A");

    const rcd40main = buildPanelDevices(rcdGroups, { supply3f: true, mainRating: 40 }).find((d) => d.kind === "rcd");
    expect(rcd40main?.label).toBe("63A"); // nie schodzi poniżej typowego minimum dla 3-fazowej

    const rcd1f80 = buildPanelDevices(rcdGroups, { supply3f: false, mainRating: 80 }).find((d) => d.kind === "rcd");
    expect(rcd1f80?.label).toBe("80A");
  });
});

describe("computePhaseLoad", () => {
  it("sumuje prądy aparatów 1-biegunowych wg przypisanej fazy", () => {
    const devices: PanelDevice[] = [
      { uid: "1", kind: "mcb", tag: "F1", modules: 1, label: "B16", caption: "a", poles: "1P", phase: "L1" },
      { uid: "2", kind: "mcb", tag: "F2", modules: 1, label: "B10", caption: "b", poles: "1P", phase: "L1" },
      { uid: "3", kind: "mcb", tag: "F3", modules: 1, label: "B20", caption: "c", poles: "1P", phase: "L2" },
    ];
    expect(computePhaseLoad(devices)).toEqual({ L1: 26, L2: 20, L3: 0 });
  });

  it("dolicza aparaty 3-biegunowe do wszystkich trzech faz", () => {
    const devices: PanelDevice[] = [{ uid: "1", kind: "mcb", tag: "F1", modules: 3, label: "B25", caption: "EV", poles: "3P" }];
    expect(computePhaseLoad(devices)).toEqual({ L1: 25, L2: 25, L3: 25 });
  });

  it("pomija aparaty inne niż mcb", () => {
    const devices: PanelDevice[] = [{ uid: "1", kind: "main", tag: "Q1", modules: 4, label: "40A", caption: "główny", poles: "4P", phase: "3F" }];
    expect(computePhaseLoad(devices)).toEqual({ L1: 0, L2: 0, L3: 0 });
  });
});

describe("computeSelectivity", () => {
  const okMcb: PanelDevice = { uid: "1", kind: "mcb", tag: "F1", modules: 1, label: "B16", caption: "a", poles: "1P", phase: "L1", rcdTag: "FI1" };
  const okRcd: PanelDevice = { uid: "rcd1", kind: "rcd", tag: "FI1", modules: 2, label: "40A/30mA", caption: "RCD", poles: "2P" };

  it("brak problemów -> jeden wpis 'ok'", () => {
    const findings = computeSelectivity([okMcb, okRcd], 40, false, true);
    expect(findings).toEqual([{ level: "ok", title: "Nie wykryto problemów", detail: expect.any(String) }]);
  });

  it("zabezpieczenie obwodu większe niż główne -> error", () => {
    const bigMcb: PanelDevice = { ...okMcb, label: "B63" };
    const findings = computeSelectivity([bigMcb, okRcd], 40, false, true);
    expect(findings.some((f) => f.level === "error" && f.title.includes("większe niż rozłącznik"))).toBe(true);
  });

  it("zbyt małe stopniowanie (krotność < 1,6) -> warn", () => {
    // 40/32 = 1.25 < 1.6
    const findings = computeSelectivity([{ ...okMcb, label: "B32" }, okRcd], 40, false, true);
    expect(findings.some((f) => f.level === "warn" && f.title.includes("stopniowanie"))).toBe(true);
  });

  it("różnicówka o prądzie mniejszym niż główny -> error", () => {
    const weakRcd: PanelDevice = { ...okRcd, label: "25A/30mA" };
    const findings = computeSelectivity([okMcb, weakRcd], 40, false, true);
    expect(findings.some((f) => f.level === "error" && f.title.includes("Różnicówka niezabezpieczona"))).toBe(true);
  });

  it("więcej niż 6 obwodów pod jednym RCD -> warn", () => {
    const mcbs = Array.from({ length: 7 }, (_, i) => ({ ...okMcb, uid: String(i), tag: `F${i}` }));
    const findings = computeSelectivity([...mcbs, okRcd], 40, false, true);
    expect(findings.some((f) => f.level === "warn" && f.title.includes("Dużo obwodów"))).toBe(true);
  });

  it("więcej niż jeden RCD -> info o selektywności różnicowoprądowej", () => {
    const findings = computeSelectivity([okMcb, okRcd, { ...okRcd, uid: "rcd2", tag: "FI2" }], 40, false, true);
    expect(findings.some((f) => f.level === "info" && f.title.includes("Selektywność różnicowoprądowa"))).toBe(true);
  });

  it("brak SPD -> warn", () => {
    const findings = computeSelectivity([okMcb, okRcd], 40, false, false);
    expect(findings.some((f) => f.level === "warn" && f.title.includes("ogranicznika przepięć"))).toBe(true);
  });

  it("nierównomierne obciążenie faz (rozrzut > 32A) przy zasilaniu 3-fazowym -> warn", () => {
    const devices: PanelDevice[] = [
      { uid: "1", kind: "mcb", tag: "F1", modules: 1, label: "B40", caption: "a", poles: "1P", phase: "L1" },
      { uid: "2", kind: "mcb", tag: "F2", modules: 1, label: "B6", caption: "b", poles: "1P", phase: "L2" },
    ];
    const findings = computeSelectivity(devices, 63, true, true);
    expect(findings.some((f) => f.level === "warn" && f.title.includes("Nierównomierne obciążenie faz"))).toBe(true);
  });

  it("rozrzut faz pomijany, gdy zasilanie jednofazowe", () => {
    const devices: PanelDevice[] = [
      { uid: "1", kind: "mcb", tag: "F1", modules: 1, label: "B40", caption: "a", poles: "1P", phase: "L1" },
      { uid: "2", kind: "mcb", tag: "F2", modules: 1, label: "B6", caption: "b", poles: "1P", phase: "L2" },
    ];
    const findings = computeSelectivity(devices, 63, false, true);
    expect(findings.some((f) => f.title.includes("Nierównomierne obciążenie faz"))).toBe(false);
  });
});

describe("layoutPanel", () => {
  it("rozkłada aparaty na kolejne rzędy bez przecinania", () => {
    const devices: PanelDevice[] = Array.from({ length: 5 }, (_, i) => ({
      uid: String(i), kind: "mcb", tag: `F${i}`, modules: 3, label: "B16", caption: "x", poles: "1P",
    }));
    const rows = layoutPanel(devices, 10); // 3 mieszczą się 3 na rząd (9), 4. nie mieści się (12>10)
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveLength(3);
    expect(rows[1]).toHaveLength(2);
  });

  it("pusta lista aparatów -> brak rzędów", () => {
    expect(layoutPanel([], 12)).toEqual([]);
  });
});

/**
 * Przenoszenie aparatów na widoku czołowym. `layoutPanel` wypełnia szyny po kolei,
 * więc pozycja aparatu to jego miejsce w tablicy — a przeciąganie sprowadza się do
 * przestawienia elementu. Tu sprawdzamy tę czystą część; resztę (chwytanie myszą)
 * pokrywa test e2e.
 */
describe("przeniesAparat", () => {
  const ap = (uid: string, kind = "mcb"): PanelDevice => ({
    uid, kind, tag: uid, modules: 1, label: "B16", caption: uid, poles: "1P",
  });
  const lista = [ap("Q1", "main"), ap("F1"), ap("F2"), ap("F3")];

  it("przestawia aparat na wskazane miejsce", () => {
    expect(przeniesAparat(lista, 3, 1).map((d) => d.uid)).toEqual(["Q1", "F3", "F1", "F2"]);
  });

  it("przesuwa też w drugą stronę", () => {
    expect(przeniesAparat(lista, 1, 3).map((d) => d.uid)).toEqual(["Q1", "F2", "F3", "F1"]);
  });

  it("rozłącznik główny zostaje pierwszy", () => {
    // W realnej rozdzielnicy zasilanie wchodzi na pierwszy aparat szyny; rysunek
    // z głównym w środku nie odpowiadałby niczemu, co da się zmontować.
    expect(przeniesAparat(lista, 0, 2)).toBe(lista);
    expect(przeniesAparat(lista, 2, 0)).toBe(lista);
  });

  it("bez rozłącznika głównego pierwsza pozycja jest normalnym miejscem", () => {
    const bezGlownego = [ap("F1"), ap("F2"), ap("F3")];
    expect(przeniesAparat(bezGlownego, 2, 0).map((d) => d.uid)).toEqual(["F3", "F1", "F2"]);
  });

  it("ruch donikąd i indeksy poza zakresem nie zmieniają listy", () => {
    expect(przeniesAparat(lista, 2, 2)).toBe(lista);
    expect(przeniesAparat(lista, 9, 1)).toBe(lista);
    expect(przeniesAparat(lista, 1, -1)).toBe(lista);
  });

  it("nie modyfikuje oryginału", () => {
    const kopia = [...lista];
    przeniesAparat(lista, 3, 1);
    expect(lista).toEqual(kopia);
  });
});
