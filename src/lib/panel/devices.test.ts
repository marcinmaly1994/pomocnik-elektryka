import { describe, it, expect } from "vitest";
import {
  aparatyDoWidoku,
  balancePhases,
  buildPanelDevices,
  computePhaseLoad,
  computeSelectivity,
  czuloscITypRcd,
  daSieSkasowac,
  dolozAparatReczny,
  dzieciAparatu,
  jestJednofazowymZabezpieczeniem,
  klamryRcdWRzedzie,
  plakietkaRcd,
  rezerwaModulow,
  nastepneOznaczenie,
  ujednolicOznaczenia,
  zachowajKolejnosc,
  przemianujAparat,
  rodzicAparatu,
  layoutPanel,
  MANUAL_DEVICE_TYPES,
  podpisPrzewoduNaFroncie,
  przeniesAparat,
  ratedCurrent,
} from "./devices";
import type { Circuit, PanelDevice, RcdGroup } from "@/types";

describe("podpisPrzewoduNaFroncie", () => {
  it("wąski aparat (1 moduł) dostaje sam przekrój — pełny podpis zlewał się z sąsiednimi", () => {
    expect(podpisPrzewoduNaFroncie("YDYp 3x2,5 mm²", 1)).toBe("2,5");
    expect(podpisPrzewoduNaFroncie("YDYp 3x1,5 mm²", 1)).toBe("1,5");
  });

  it("szerszy aparat ma miejsce na pełny podpis (bez nazwy typu przewodu)", () => {
    expect(podpisPrzewoduNaFroncie("YDYp 5x2,5 mm²", 3)).toBe("5x2,5 mm²");
    expect(podpisPrzewoduNaFroncie("YDYp 5x4 mm²", 4)).toBe("5x4 mm²");
  });

  it("podpis w innym formacie zostaje taki, jaki jest", () => {
    expect(podpisPrzewoduNaFroncie("przewód własny", 1)).toBe("przewód własny");
  });
});

describe("ratedCurrent", () => {
  it("wyciąga liczbę z etykiety", () => {
    expect(ratedCurrent("B16")).toBe(16);
    expect(ratedCurrent("C25 3-faz.")).toBe(25);
  });

  it("brak liczby -> 0", () => {
    expect(ratedCurrent("")).toBe(0);
  });
});

describe("czuloscITypRcd", () => {
  it("czyta czułość i typ z podpisu aparatu z automatu", () => {
    expect(czuloscITypRcd({ label: "63A", caption: "Wyłącznik różnicowoprądowy 63A/30mA typ B" })).toBe("30 mA · typ B");
  });
  it("dla aparatu dołożonego ręcznie bierze czułość z etykiety, bez zgadywania typu", () => {
    expect(czuloscITypRcd({ label: "40A/300mA", caption: "Wyłącznik różnicowoprądowy" })).toBe("300 mA");
  });
  it("bez danych — nic, zamiast pustej linii", () => {
    expect(czuloscITypRcd({ label: "63A", caption: "" })).toBeNull();
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

  it("waży prądem obliczeniowym, gdy go zna — dwa B16 po 15 A i 3 A to nie to samo", () => {
    const mcb = (n: number, label: string): PanelDevice => ({
      uid: String(n), kind: "mcb", tag: `F${n}`, modules: 1, label, caption: String(n), poles: "1P", key: `mcb-${n}`,
    });
    // Po samym In (16/16/16/10) czwarty trafiłby na L1. Po Ib (15/3/3/2) L1 jest
    // już najcięższa, więc czwarty musi pójść na lżejszą fazę.
    const prady = new Map([["mcb-1", 15], ["mcb-2", 3], ["mcb-3", 3], ["mcb-4", 2]]);
    const fazy = balancePhases([mcb(1, "B16"), mcb(2, "B16"), mcb(3, "B16"), mcb(4, "B10")], prady).map((d) => d.phase);
    expect(fazy).toEqual(["L1", "L2", "L3", "L2"]);
    // bez mapy — po In, jak dla aparatów dołożonych ręcznie
    expect(balancePhases([mcb(1, "B16"), mcb(2, "B16"), mcb(3, "B16"), mcb(4, "B10")]).map((d) => d.phase)[3]).toBe("L1");
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
    expect(rcd.caption).toBe("Wyłącznik różnicowoprądowy 63A/30mA typ A");

    // ...i tak samo, gdy rozłącznik główny podnosi dobór wyżej
    const wiekszy = buildPanelDevices(rcdGroups, { supply3f: true, mainRating: 80 }).find((d) => d.kind === "rcd")!;
    expect(wiekszy.caption).toBe(`Wyłącznik różnicowoprądowy ${wiekszy.label}/30mA typ A`);
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

  /*
   * Aparatem nadrzędnym jest zabezpieczenie PRZEDLICZNIKOWE — rozłącznik główny nie ma
   * wyzwalaczy (audyt rozdzielnicy 15.11.2026, błąd 1). Domyślnie 25 A.
   */
  const glowny: PanelDevice = { uid: "q1", kind: "main", tag: "Q1", modules: 2, label: "40A", caption: "główny", poles: "2P" };

  it("rozłącznik główny słabszy niż przedlicznikowe -> error; równy lub mocniejszy -> nic", () => {
    const tytul = "Rozłącznik główny słabszy niż zabezpieczenie przedlicznikowe";
    const przy = (main: number, przedl: number) =>
      computeSelectivity([glowny, okMcb, okRcd], main, false, true, undefined, { przedlicznikowe: przedl }).some(
        (f) => f.level === "error" && f.title === tytul
      );
    expect(przy(32, 40)).toBe(true);
    expect(przy(40, 40)).toBe(false);
    expect(przy(63, 25)).toBe(false);
  });

  it("zabezpieczenie obwodu nie mniejsze niż przedlicznikowe -> warn, niezależnie od rozłącznika", () => {
    const tytul = "Zabezpieczenie obwodu nie mniejsze niż przedlicznikowe";
    const przy = (mcb: string, przedl: number) =>
      computeSelectivity([{ ...okMcb, label: mcb }, okRcd], 80, false, true, undefined, { przedlicznikowe: przedl }).some(
        (f) => f.level === "warn" && f.title === tytul
      );
    expect(przy("B25", 25)).toBe(true);
    expect(przy("C32", 25)).toBe(true);
    expect(przy("B20", 25)).toBe(false);
  });

  it("dawne reguły względem rozłącznika zniknęły — B32 przy rozłączniku 40 A i przedlicznikowym 50 A jest w porządku", () => {
    const findings = computeSelectivity([{ ...okMcb, label: "B32" }, { ...okRcd, label: "63A/30mA" }], 40, false, true, undefined, { przedlicznikowe: 50 });
    expect(findings.filter((f) => f.level === "error" || f.level === "warn")).toEqual([]);
  });

  it("różnicówka słabsza od przedlicznikowego -> error; słabsza tylko od rozłącznika -> nic", () => {
    const tytul = "Różnicówka niezabezpieczona przed przeciążeniem";
    const rcd25: PanelDevice = { ...okRcd, label: "25A/30mA" };
    const zle = computeSelectivity([okMcb, rcd25], 40, false, true, undefined, { przedlicznikowe: 32 });
    expect(zle.some((f) => f.level === "error" && f.title === tytul)).toBe(true);
    const dobrze = computeSelectivity([okMcb, rcd25], 63, false, true, undefined, { przedlicznikowe: 25 });
    expect(dobrze.some((f) => f.title === tytul)).toBe(false);
  });

  describe("obwody bez ochrony różnicowoprądowej 30 mA", () => {
    const tytul = "Obwody bez ochrony różnicowoprądowej 30 mA";
    const znajdz = (devices: PanelDevice[], uklad?: "TN-C-S" | "TT") =>
      computeSelectivity(devices, 40, false, true, undefined, { ukladSieci: uklad }).find((f) => f.title === tytul);

    it("MCB bez różnicówki -> warn z nazwą obwodu", () => {
      const f = znajdz([{ ...okMcb, rcdTag: undefined, caption: "Gniazda — garaż" }, okRcd]);
      expect(f?.level).toBe("warn");
      expect(f?.detail).toContain("F1 (Gniazda — garaż)");
    });

    it("MCB wskazujący nieistniejącą różnicówkę (skasowaną) liczy się jako bez RCD", () => {
      expect(znajdz([{ ...okMcb, rcdTag: "FI9" }, okRcd])).toBeDefined();
    });

    it("MCB pod różnicówką 300 mA nie ma ochrony 30 mA", () => {
      expect(znajdz([okMcb, { ...okRcd, label: "40A/300mA" }])).toBeDefined();
    });

    it("MCB pod różnicówką 30 mA (także starym opisem bez czułości) -> nic", () => {
      expect(znajdz([okMcb, okRcd])).toBeUndefined();
      expect(znajdz([okMcb, { ...okRcd, label: "63A", caption: "Wyłącznik różnicowoprądowy" }])).toBeUndefined();
    });

    it("w układzie TT brak RCD to błąd, nie ostrzeżenie", () => {
      expect(znajdz([{ ...okMcb, rcdTag: undefined }], "TT")?.level).toBe("error");
    });
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

  it("liczba różnicówek w komunikacie jest poprawnie odmieniona (przegląd 12.11.2026, pkt 3)", () => {
    const rcd = (n: number) => ({ ...okRcd, uid: `rcd${n}`, tag: `FI${n}` });
    const tekst = (ile: number) =>
      computeSelectivity([okMcb, ...Array.from({ length: ile }, (_, i) => rcd(i + 1))], 40, false, true).find((f) =>
        f.title.includes("Selektywność różnicowoprądowa")
      )!.detail;
    expect(tekst(4)).toContain("4 wyłączniki różnicowoprądowe");
    expect(tekst(5)).toContain("5 wyłączników różnicowoprądowych");
    expect(tekst(4)).not.toContain("jest 4");
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

describe("daSieSkasowac", () => {
  /** Ta sama odpowiedź musi iść do kółka „×" na licu i do przycisku w oknie edycji. */
  it("zwykły aparat wolno skasować", () => {
    expect(daSieSkasowac({ kind: "mcb" })).toBe(true);
    expect(daSieSkasowac({ kind: "rcd" })).toBe(true);
    expect(daSieSkasowac({ kind: "spd" })).toBe(true);
  });

  it("rozłącznika głównego NIE — rozdzielnica bez niego nie jest rozdzielnicą", () => {
    expect(daSieSkasowac({ kind: "main" })).toBe(false);
  });

  it("zaślepki NIE — to puste miejsce na szynie, nie aparat", () => {
    expect(daSieSkasowac({ kind: "blank" })).toBe(false);
  });
});

/**
 * Aparaty do Schematu i Kosztorysu, zanim Rozdzielnica zdążyła się odbudować (przegląd
 * 12.11.2026). W trybie „z rzutu" zapisana lista z SAMYMI ręcznymi aparatami (np. SPD)
 * dawała pusty schemat — brakowało rozłącznika i wyłączników, które Rozdzielnica
 * dobudowuje dopiero przy otwarciu.
 */
describe("aparatyDoWidoku", () => {
  const spd = { uid: "manual-1", kind: "spd", manual: true, tag: "F0", modules: 4, label: "T2", caption: "SPD", poles: "4P" } as const;
  const zbudowane = [{ uid: "Q1-0", kind: "main", tag: "Q1", modules: 4, label: "40A", caption: "Rozłącznik", poles: "4P" }];

  it("pusta lista → aparaty z obwodów", () => {
    expect(aparatyDoWidoku([], "zRzutu", () => zbudowane)).toEqual(zbudowane);
  });

  it("z rzutu i same ręczne → z obwodów PLUS ręczne, jak po odbudowie w Rozdzielnicy", () => {
    expect(aparatyDoWidoku([spd], "zRzutu", () => zbudowane)).toEqual([...zbudowane, spd]);
  });

  it("lista już odbudowana albo tryb ręczny → bez zmian", () => {
    expect(aparatyDoWidoku([...zbudowane, spd], "zRzutu", () => [])).toEqual([...zbudowane, spd]);
    expect(aparatyDoWidoku([spd], "reczny", () => zbudowane)).toEqual([spd]);
  });
});

/*
 * Aparaty zasilane szeregowo (audyt rozdzielnicy 15.11.2026, pakiet 2): SPD za
 * bezpiecznikiem, lampka/CZF/zasilacz za własnym wyłącznikiem, stycznik za wyłącznikiem
 * obwodu, rozłącznik ppoż. na dopływie.
 */
describe("aparaty zasilane szeregowo", () => {
  const ap = (p: Partial<PanelDevice> & Pick<PanelDevice, "kind" | "tag">): PanelDevice => ({
    uid: p.tag,
    modules: 1,
    label: "",
    caption: p.tag,
    poles: "1P",
    ...p,
  });
  const q1 = ap({ kind: "main", tag: "Q1", label: "40A", poles: "4P" });
  const f0 = ap({ kind: "mcb", tag: "F0", label: "B6" });
  const lampka = ap({ kind: "lampka", tag: "P1", zasilanyZ: "F0" });
  const czf = ap({ kind: "ovr", tag: "K1", zasilanyZ: "F0" });
  const bezp = ap({ kind: "spdFuse", tag: "F01", label: "gG 63A", poles: "3P" });
  const spd = ap({ kind: "spd", tag: "F02", poles: "4P", zasilanyZ: "F01" });
  const def = (key: string) => MANUAL_DEVICE_TYPES.find((t) => t.key === key)!;

  describe("rodzicAparatu / dzieciAparatu", () => {
    it("aparat pomocniczy wskazuje swoje zabezpieczenie; zabezpieczenie zna swoje dzieci", () => {
      const lista = [q1, f0, lampka, czf, bezp, spd];
      expect(rodzicAparatu(lampka, lista)).toBe(f0);
      expect(rodzicAparatu(spd, lista)).toBe(bezp);
      expect(dzieciAparatu(f0, lista)).toEqual([lampka, czf]);
    });

    it("wskazanie skasowanego aparatu albo aparatu bez członu zabezpieczającego liczy się jak brak", () => {
      expect(rodzicAparatu(lampka, [q1, lampka])).toBeUndefined();
      expect(rodzicAparatu({ ...lampka, zasilanyZ: "Q1" }, [q1, lampka])).toBeUndefined();
    });

    it("zwykły wyłącznik obwodu nie bywa „zasilany z” — pole dotyczy tylko aparatów pomocniczych", () => {
      const zwyklyObwod: PanelDevice = { ...f0, tag: "F5", zasilanyZ: "F0" };
      expect(rodzicAparatu(zwyklyObwod, [f0])).toBeUndefined();
    });
  });

  describe("dolozAparatReczny", () => {
    const z3f = { supply3f: true, uklad: "TN-C-S" as const };

    it("bezpiecznik pod SPD przy 3 fazach ma 3 tory i od razu łączy się z SPD bez pary", () => {
      const bezSpd = { ...spd, zasilanyZ: undefined };
      const wynik = dolozAparatReczny([q1, bezSpd], def("spdFuse"), { uid: "m1" }, z3f);
      const nowy = wynik[wynik.length - 1];
      expect(nowy).toMatchObject({ kind: "spdFuse", poles: "3P", modules: 3, phase: "3F" });
      expect(wynik.find((d) => d.kind === "spd")!.zasilanyZ).toBe(nowy.tag);
    });

    it("SPD dokładany przy wolnym bezpieczniku łączy się z nim", () => {
      const wynik = dolozAparatReczny([q1, bezp], def("spd"), { uid: "m1" }, z3f);
      expect(wynik[wynik.length - 1].zasilanyZ).toBe("F01");
    });

    it("rozłącznik ppoż. przy TN-C-S nie rozłącza PEN (3P/1P), przy TN-S i TT rozłącza też N", () => {
      const bieguny = (supply3f: boolean, uklad: "TN-C-S" | "TN-S" | "TT") =>
        dolozAparatReczny([q1], def("ppoz"), { uid: "m1" }, { supply3f, uklad }).slice(-1)[0].poles;
      expect(bieguny(true, "TN-C-S")).toBe("3P");
      expect(bieguny(false, "TN-C-S")).toBe("1P");
      expect(bieguny(true, "TN-S")).toBe("4P");
      expect(bieguny(false, "TT")).toBe("2P");
    });
  });

  it("przemianujAparat przenosi na nowe oznaczenie odwołania „zasilany z” i „za różnicówką”", () => {
    const rcd = ap({ kind: "rcd", tag: "FI1", poles: "4P" });
    const obwod = ap({ kind: "mcb", tag: "F3", label: "B16", rcdTag: "FI1" });
    const wynik = przemianujAparat([f0, lampka, rcd, obwod], "F0", { tag: "F00" });
    expect(wynik.find((d) => d.tag === "P1")!.zasilanyZ).toBe("F00");
    const wynik2 = przemianujAparat([rcd, obwod], "FI1", { tag: "FI-A" });
    expect(wynik2.find((d) => d.tag === "F3")!.rcdTag).toBe("FI-A");
  });

  describe("reguły", () => {
    const tytuly = (lista: PanelDevice[], uklad: "TN-C-S" | "TN-S" = "TN-C-S") =>
      computeSelectivity(lista, 40, true, true, undefined, { ukladSieci: uklad }).map((f) => f.title);

    it("aparat pomocniczy bez zabezpieczenia -> ostrzeżenie; z zabezpieczeniem -> nic", () => {
      expect(tytuly([q1, { ...lampka, zasilanyZ: undefined }])).toContain("Aparaty pomocnicze bez zabezpieczenia");
      expect(tytuly([q1, f0, lampka])).not.toContain("Aparaty pomocnicze bez zabezpieczenia");
    });

    it("wyłącznik zasilający tylko lampkę i CZF nie potrzebuje 30 mA; zasilający stycznik — tak", () => {
      expect(tytuly([q1, f0, lampka, czf])).not.toContain("Obwody bez ochrony różnicowoprądowej 30 mA");
      const stycznik = ap({ kind: "stycznik", tag: "K2", zasilanyZ: "F0" });
      expect(tytuly([q1, f0, stycznik])).toContain("Obwody bez ochrony różnicowoprądowej 30 mA");
    });

    it("bezpiecznik pod SPD niepołączony z ogranicznikiem -> ostrzeżenie", () => {
      expect(tytuly([q1, bezp, { ...spd, zasilanyZ: undefined }])).toContain("Bezpiecznik pod SPD nie jest połączony z ogranicznikiem");
      expect(tytuly([q1, bezp, spd])).not.toContain("Bezpiecznik pod SPD nie jest połączony z ogranicznikiem");
    });

    it("CZF bez stycznika -> informacja", () => {
      expect(tytuly([q1, f0, czf])).toContain("Czujnik zaniku fazy bez stycznika");
      expect(tytuly([q1, f0, czf, ap({ kind: "stycznik", tag: "K2", zasilanyZ: "F0" })])).not.toContain("Czujnik zaniku fazy bez stycznika");
    });

    it("ppoż. 4P przy TN-C-S rozłączałby PEN -> ostrzeżenie; przy TN-S nie", () => {
      const ppoz = ap({ kind: "ppoz", tag: "Q2", poles: "4P" });
      expect(tytuly([q1, ppoz])).toContain("Rozłącznik przeciwpożarowy rozłączałby PEN");
      expect(tytuly([q1, ppoz], "TN-S")).not.toContain("Rozłącznik przeciwpożarowy rozłączałby PEN");
    });
  });
});

/* Pakiet 3 audytu rozdzielnicy (15.11.2026): oznaczenia, RCBO, kolejność. */
describe("oznaczenia aparatów", () => {
  const a = (tag: string, p: Partial<PanelDevice> = {}): PanelDevice => ({ uid: tag, kind: "mcb", tag, modules: 1, label: "B16", caption: tag, poles: "1P", ...p });

  it("następne oznaczenie = największy numer + 1, z dokładnym prefiksem (FI nie liczy się do F)", () => {
    expect(nastepneOznaczenie([a("F1"), a("F7"), a("FI1"), a("FI2")], "F")).toBe("F8");
    expect(nastepneOznaczenie([a("F1"), a("FI1")], "FI")).toBe("FI2");
    expect(nastepneOznaczenie([a("F3")], "F0.")).toBe("F0.1");
    expect(nastepneOznaczenie([a("F0.1"), a("F0.2")], "F0.")).toBe("F0.3");
  });

  it("po skasowaniu aparatu numer się nie powtarza (wcześniej liczono aparaty, nie numery)", () => {
    // F1, F3 — F2 skasowany; stary licznik dawał „F3" po raz drugi.
    expect(nastepneOznaczenie([a("F1"), a("F3")], "F")).toBe("F4");
  });

  it("SPD i jego bezpiecznik dostają serię F0.x i stają za rozłącznikiem głównym; CZF — K", () => {
    const q1 = a("Q1", { kind: "main", poles: "4P" });
    const z = { supply3f: true, uklad: "TN-C-S" as const };
    const def = (key: string) => MANUAL_DEVICE_TYPES.find((t) => t.key === key)!;
    let lista = [q1, a("FI1", { kind: "rcd" }), a("F1", { rcdTag: "FI1" })];
    lista = dolozAparatReczny(lista, def("spd"), { uid: "m1" }, z);
    lista = dolozAparatReczny(lista, def("spdFuse"), { uid: "m2" }, z);
    lista = dolozAparatReczny(lista, def("ovr"), { uid: "m3" }, z);
    expect(lista.map((d) => d.tag)).toEqual(["Q1", "F0.1", "F0.2", "FI1", "F1", "K1"]);
    expect(lista[1].zasilanyZ).toBe("F0.2");
  });

  it("ujednolicOznaczenia: automat zachowuje swoje, ręczny dostaje następne wolne, a odwołania idą za nim", () => {
    const auto = [a("F1", { key: "mcb-1" }), a("F2", { key: "mcb-2" })];
    const reczne = [a("F2", { uid: "manual-1", manual: true, label: "B6" }), a("P1", { uid: "manual-2", manual: true, kind: "lampka", zasilanyZ: "F2" })];
    const wynik = ujednolicOznaczenia([...auto, ...reczne]);
    expect(wynik.map((d) => d.tag)).toEqual(["F1", "F2", "F3", "P1"]);
    expect(wynik[3].zasilanyZ).toBe("F3");
    expect(ujednolicOznaczenia(auto)).toBe(auto);
  });

  it("zachowajKolejnosc: ułożenie użytkownika przeżywa odbudowę, nowe aparaty wchodzą za poprzednikiem", () => {
    const q1 = a("Q1", { key: "main", kind: "main" });
    const f1 = a("F1", { key: "mcb-1" });
    const f2 = a("F2", { key: "mcb-2" });
    const f3 = a("F3", { key: "mcb-3" });
    const spd = a("F0.1", { uid: "manual-1", manual: true, kind: "spd" });
    // Użytkownik przestawił SPD za Q1 i F2 przed F1.
    const poprzednie = [q1, spd, f2, f1];
    // Po zmianie rzutu automat liczy od nowa (doszedł F3), ręczne doklejone na koniec.
    const swieze = [q1, f1, f2, f3, spd];
    // F3 wchodzi zaraz za F2 — tak jak stoi za nim w świeżo policzonej liście.
    expect(zachowajKolejnosc(poprzednie, swieze).map((d) => d.tag)).toEqual(["Q1", "F0.1", "F2", "F3", "F1"]);
  });
});

describe("RCBO", () => {
  const rcbo: PanelDevice = { uid: "r", kind: "rcbo", tag: "F5", modules: 2, label: "B16/30mA", caption: "Lodówka", poles: "1P+N" };

  it("jest zabezpieczeniem jednofazowym — dostaje fazę z bilansu, nie „3F”", () => {
    expect(jestJednofazowymZabezpieczeniem(rcbo)).toBe(true);
    expect(["L1", "L2", "L3"]).toContain(balancePhases([rcbo])[0].phase);
  });

  it("dokładany ręcznie przy 3 fazach dostaje L1, nie 3F", () => {
    const def = MANUAL_DEVICE_TYPES.find((t) => t.key === "rcbo")!;
    const wynik = dolozAparatReczny([], def, { uid: "m1" }, { supply3f: true, uklad: "TN-C-S" });
    expect(wynik[0].phase).toBe("L1");
  });

  it("liczy się do bilansu faz", () => {
    expect(computePhaseLoad([{ ...rcbo, phase: "L2" }])).toEqual({ L1: 0, L2: 16, L3: 0 });
  });

  it("RCBO 300 mA nie daje ochrony 30 mA — reguła to zgłasza; 30 mA nie", () => {
    const tytul = "Obwody bez ochrony różnicowoprądowej 30 mA";
    expect(computeSelectivity([{ ...rcbo, label: "B16/300mA" }], 40, false, true).some((f) => f.title === tytul)).toBe(true);
    expect(computeSelectivity([rcbo], 40, false, true).some((f) => f.title === tytul)).toBe(false);
  });
});

/* Pakiet 4 audytu rozdzielnicy (15.11.2026): czytelność frontu i tabliczka. */
describe("plakietkaRcd", () => {
  it("prawdziwa czułość zamiast stałego „30 mA”; typ tylko, gdy inny niż A", () => {
    expect(plakietkaRcd({ tag: "FI1", label: "63A", caption: "Wyłącznik różnicowoprądowy 63A/30mA typ A" })).toBe("FI1 · 30 mA");
    expect(plakietkaRcd({ tag: "FI2", label: "40A/300mA", caption: "Wyłącznik różnicowoprądowy" })).toBe("FI2 · 300 mA");
    expect(plakietkaRcd({ tag: "FI4", label: "63A/30mA", caption: "Wyłącznik różnicowoprądowy 63A/30mA typ B" })).toBe("FI4 · 30 mA · B");
  });
});

describe("klamryRcdWRzedzie", () => {
  const slot = (tag: string, s: number, p: Partial<PanelDevice> = {}) =>
    ({ uid: tag, kind: "mcb", tag, modules: 1, label: "B16", caption: tag, poles: "1P", index: s, slot: s, ...p }) as PanelDevice & { index: number; slot: number };

  it("różnicówka i jej obwody w jednym rzędzie — jedna klamra od różnicówki do ostatniego obwodu", () => {
    const rzad = [slot("FI1", 0, { kind: "rcd", modules: 4 }), slot("F1", 4, { rcdTag: "FI1" }), slot("F2", 5, { rcdTag: "FI1" })];
    expect(klamryRcdWRzedzie(rzad)).toEqual([expect.objectContaining({ tag: "FI1", startSlot: 0, endSlot: 6, rcd: rzad[0] })]);
  });

  it("obwody różnicówki z rzędu wyżej dostają klamrę-kontynuację (bez różnicówki w rzędzie)", () => {
    const rzad = [slot("F7", 0, { rcdTag: "FI2" }), slot("F8", 1, { rcdTag: "FI2" }), slot("F9", 2)];
    const [k] = klamryRcdWRzedzie(rzad);
    expect(k).toMatchObject({ tag: "FI2", startSlot: 0, endSlot: 2 });
    expect(k.rcd).toBeUndefined();
  });

  it("różnicówka na końcu rzędu bez obwodów w nim — bez klamry (oznaczenie zostaje nad aparatem)", () => {
    expect(klamryRcdWRzedzie([slot("F1", 0), slot("FI2", 1, { kind: "rcd", modules: 4 })])).toEqual([]);
  });
});

describe("rezerwaModulow", () => {
  it("liczy wolne miejsce i obudowę z ok. 20% rezerwy", () => {
    expect(rezerwaModulow(34, 36, 18)).toEqual({ wolne: 2, procent: 6, zalecaneRzedy: 3 });
    expect(rezerwaModulow(20, 36, 18)).toEqual({ wolne: 16, procent: 44, zalecaneRzedy: 2 });
  });
});
