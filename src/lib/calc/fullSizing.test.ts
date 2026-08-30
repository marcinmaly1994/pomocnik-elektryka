import { describe, expect, it } from "vitest";
import { pelnyDoborPrzekroju, type PelnyDoborWejscie } from "./fullSizing";

function wejscie(over: Partial<PelnyDoborWejscie> = {}): PelnyDoborWejscie {
  return {
    Ib_A: 40,
    napiecie_V: 400,
    material: "Cu",
    izolacja: "PVC",
    metoda: "B2",
    dlugosc_m: 30,
    cosfi: 0.9,
    limitSpadku_pct: 3,
    ...over,
  };
}

describe("pełny dobór — kryterium 1 (obciążalność) samo w sobie", () => {
  it("dla krótkiej trasy obciążalność decyduje o przekroju", () => {
    // Ib=40A, B2/Cu/PVC: 10mm²→Iz=46A mieści B40; krótka trasa (5m) nie wymusi więcej
    const r = pelnyDoborPrzekroju(wejscie({ dlugosc_m: 5 }));
    expect(r.bledy).toEqual([]);
    expect(r.wartosci!.przekroj_mm2).toBe(10);
    expect(r.wartosci!.decydujace).toEqual(["obciazalnosc"]);
    expect(r.wartosci!.In_A).toBe(40);
  });

  it("prąd większy niż obciążalność największego dostępnego przekroju to błąd, nie cichy dobór", () => {
    const r = pelnyDoborPrzekroju(wejscie({ Ib_A: 10000 }));
    expect(r.wartosci).toBeNull();
    expect(r.bledy.map((b) => b.code)).toContain("OBCIAZALNOSC_NIE_DO_SPELNIENIA");
  });
});

describe("pełny dobór — kryterium 2 (spadek napięcia) potrafi zdecydować", () => {
  it("długa trasa podnosi wymagany przekrój ponad to, co dałaby sama obciążalność", () => {
    const krotka = pelnyDoborPrzekroju(wejscie({ dlugosc_m: 5 }));
    const dluga = pelnyDoborPrzekroju(wejscie({ dlugosc_m: 200 }));
    expect(dluga.wartosci!.przekroj_mm2).toBeGreaterThan(krotka.wartosci!.przekroj_mm2);
    expect(dluga.wartosci!.decydujace).toContain("spadek_napiecia");
  });
});

describe("pełny dobór — kryterium 3 (ochrona przeciwporażeniowa), opcjonalne", () => {
  it("bez podanej impedancji źródła kryterium jest pominięte z jawnym komunikatem", () => {
    const r = pelnyDoborPrzekroju(wejscie());
    expect(r.wartosci!.kryteria.ochrona_przeciwporazeniowa.ocenione).toBe(false);
    expect(r.wartosci!.kryteria.ochrona_przeciwporazeniowa.powod_pominiecia).toMatch(/NIE zostało sprawdzone/);
    expect(r.zalozenia.join(" ")).toMatch(/NIE jest zweryfikowany względem wszystkich/);
  });

  it("duża impedancja źródła może wymusić większy przekrój niż obciążalność", () => {
    const bezOchrony = pelnyDoborPrzekroju(wejscie({ dlugosc_m: 5 }));
    const zOchrona = pelnyDoborPrzekroju(wejscie({ dlugosc_m: 5, impedancjaZrodla_ohm: 0.8 }));
    expect(zOchrona.wartosci!.kryteria.ochrona_przeciwporazeniowa.ocenione).toBe(true);
    expect(zOchrona.wartosci!.przekroj_mm2).toBeGreaterThanOrEqual(bezOchrony.wartosci!.przekroj_mm2);
  });

  it("rozruch silnikowy (charakterystyka C) ZAOSTRZA warunek ochrony — wyższe Ia niż B", () => {
    // Z = 0,56 Ω: dla B (Ia=5×In) wciąż wystarcza najmniejszy przekrój (10 mm²),
    // ale C (Ia=10×In, dwa razy ostrzejsze Zs max) wymusza już 16 mm²
    const B = pelnyDoborPrzekroju(wejscie({ dlugosc_m: 5, impedancjaZrodla_ohm: 0.56 }));
    const C = pelnyDoborPrzekroju(wejscie({ dlugosc_m: 5, impedancjaZrodla_ohm: 0.56, rozruch_silnikowy: true }));
    expect(B.wartosci!.przekroj_mm2).toBe(10);
    expect(C.wartosci!.przekroj_mm2).toBe(16);
    expect(C.wartosci!.decydujace).toContain("ochrona_przeciwporazeniowa");
  });

  it("zbyt duża impedancja źródła nie ma prawa się zdarzyć — błąd zamiast cichego pominięcia", () => {
    const r = pelnyDoborPrzekroju(wejscie({ dlugosc_m: 5, impedancjaZrodla_ohm: 0.6, rozruch_silnikowy: true }));
    expect(r.wartosci).toBeNull();
    expect(r.bledy.map((b) => b.code)).toContain("KRYTERIUM_NIE_DO_SPELNIENIA");
    expect(r.bledy[0].message).toMatch(/ochrona przeciwporażeniowa/);
  });
});

describe("pełny dobór — kryterium 4 (wytrzymałość zwarciowa), opcjonalne", () => {
  it("bez podanego prądu zwarciowego kryterium jest pominięte z jawnym komunikatem", () => {
    const r = pelnyDoborPrzekroju(wejscie());
    expect(r.wartosci!.kryteria.wytrzymalosc_zwarciowa.ocenione).toBe(false);
    expect(r.wartosci!.kryteria.wytrzymalosc_zwarciowa.powod_pominiecia).toMatch(/NIE zostało sprawdzone/);
  });

  it("duży prąd zwarciowy może wymusić większy przekrój", () => {
    const bez = pelnyDoborPrzekroju(wejscie({ dlugosc_m: 5 }));
    const z = pelnyDoborPrzekroju(wejscie({ dlugosc_m: 5, Ik_A: 8000 }));
    expect(z.wartosci!.kryteria.wytrzymalosc_zwarciowa.ocenione).toBe(true);
    expect(z.wartosci!.przekroj_mm2).toBeGreaterThanOrEqual(bez.wartosci!.przekroj_mm2);
  });

  it("czas przyjęty do sprawdzenia to MAKSYMALNY dopuszczalny czas wg tabl. 41.1, nie realny czas wyłącznika", () => {
    const r = pelnyDoborPrzekroju(wejscie({ dlugosc_m: 5, Ik_A: 3000 }));
    expect(r.zalozenia.join(" ")).toMatch(/MAKSYMALNY dopuszczalny czas/);
  });
});

describe("pełny dobór — metody gruntowe D1/D2 pomijają korektę powietrza", () => {
  it("dla D1/D2 nie stosuje k1/k2 (mówi to wprost w założeniach)", () => {
    const r = pelnyDoborPrzekroju(wejscie({ metoda: "D1", dlugosc_m: 5 }));
    expect(r.bledy).toEqual([]);
    expect(r.zalozenia.join(" ")).toMatch(/BEZ korekty temperatury gruntu/);
  });

  it("D2 (bezpośrednio w gruncie) daje mniejszy lub równy przekrój niż D1 przy tych samych danych — lepsze chłodzenie", () => {
    const d1 = pelnyDoborPrzekroju(wejscie({ metoda: "D1", dlugosc_m: 5, Ib_A: 90 }));
    const d2 = pelnyDoborPrzekroju(wejscie({ metoda: "D2", dlugosc_m: 5, Ib_A: 90 }));
    expect(d1.wartosci!.przekroj_mm2).toBe(50);
    expect(d2.wartosci!.przekroj_mm2).toBe(35);
  });
});

describe("pełny dobór — aluminium respektuje lukę D2 poniżej 16 mm²", () => {
  it("mały prąd na Al/D2 pomija przekroje 2,5-10mm² (brak danych) i ląduje na 16mm² albo wyżej", () => {
    const r = pelnyDoborPrzekroju(wejscie({ material: "Al", metoda: "D2", dlugosc_m: 5, Ib_A: 15 }));
    expect(r.bledy).toEqual([]);
    expect(r.wartosci!.przekroj_mm2).toBeGreaterThanOrEqual(16);
  });
});

describe("pełny dobór — walidacja i koperta wyniku", () => {
  it("dane niedodatnie są odrzucane", () => {
    expect(pelnyDoborPrzekroju(wejscie({ Ib_A: 0 })).bledy.map((b) => b.code)).toContain("IB");
    expect(pelnyDoborPrzekroju(wejscie({ cosfi: 1.5 })).bledy.map((b) => b.code)).toContain("COSFI");
  });

  it("zwraca kroki z podstawionymi wartościami i źródła obu tablic normy", () => {
    const r = pelnyDoborPrzekroju(wejscie({ dlugosc_m: 5 }));
    expect(r.kroki.length).toBeGreaterThan(0);
    expect(r.zrodla.some((z) => z.norma.includes("60364-5-52"))).toBe(true);
    expect(r.zrodla.some((z) => z.norma.includes("60364-4-41"))).toBe(true);
  });

  it("kabel opisany materiałem i wynikowym przekrojem", () => {
    const r = pelnyDoborPrzekroju(wejscie({ dlugosc_m: 5 }));
    expect(r.wartosci!.kabel).toContain("Cu");
    expect(r.wartosci!.kabel).toContain(String(r.wartosci!.przekroj_mm2));
  });
});
