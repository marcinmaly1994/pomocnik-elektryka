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
    // Z = 0,53 Ω: dla B (Ia=5×In) wciąż wystarcza najmniejszy przekrój (10 mm²),
    // ale C (Ia=10×In, Zs max = 0,95·231/400 ≈ 0,548 Ω) wymusza już 16 mm²
    const B = pelnyDoborPrzekroju(wejscie({ dlugosc_m: 5, impedancjaZrodla_ohm: 0.53 }));
    const C = pelnyDoborPrzekroju(wejscie({ dlugosc_m: 5, impedancjaZrodla_ohm: 0.53, rozruch_silnikowy: true }));
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

/*
 * Audyt Kalkulatorów 16.11.2026, pakiet A. K1: Zs max bez Cmin = 0,95 było o 5% łagodniejsze
 * niż w kalkulatorze pętli i w protokole. K2: spadek napięcia bez cosφ i reaktancji — wejście
 * cosφ było martwe, a przy dużych przekrojach spadek wychodził zaniżony.
 */
describe("pełny dobór — pakiet A audytu Kalkulatorów", () => {
  it("K1: Zs max z Cmin = 0,95 — impedancja tuż pod U0/Ia, ale ponad 0,95·U0/Ia, nie przechodzi", () => {
    // B40: Ia = 200 A; U0/Ia ≈ 1,155 Ω, 0,95·U0/Ia ≈ 1,097 Ω. Źródło 1,12 Ω mieściło się dotąd w progu.
    const r = pelnyDoborPrzekroju(wejscie({ dlugosc_m: 1, impedancjaZrodla_ohm: 1.12 }));
    expect(r.wartosci).toBeNull();
    expect(r.bledy[0].message).toMatch(/ochrona przeciwporażeniowa/);
    const ok = pelnyDoborPrzekroju(wejscie({ dlugosc_m: 1, impedancjaZrodla_ohm: 1.05 }));
    expect(ok.wartosci).not.toBeNull();
    expect(ok.kroki.find((k) => k.opis.startsWith("Kryterium 3"))!.podstawienie).toContain("0,95 ·");
  });

  it("K2: cosφ wpływa na spadek napięcia (dotąd wejście było martwe)", () => {
    const krok = (cosfi: number) =>
      pelnyDoborPrzekroju(wejscie({ cosfi, dlugosc_m: 60 })).kroki.find((k) => k.opis.startsWith("Kryterium 2"))!.wynik;
    expect(krok(1)).not.toBe(krok(0.6));
  });

  it("K2: przy dużym przekroju i niskim cosφ reaktancja podnosi przekrój ponad wynik samej rezystancji", () => {
    // Ib 300 A, 200 m, Cu XLPE, metoda C, cosφ 0,7, limit 3% (12 V).
    // Sama rezystancja (dawny wzór): ΔU = 2319/S V → 240 mm² (9,7 V).
    // Z reaktancją 0,08 Ω/km: ΔU = 1624/S + 5,94 V → 240 mm² daje 12,7 V (3,2%) → 300 mm².
    const r = pelnyDoborPrzekroju(
      wejscie({ Ib_A: 300, dlugosc_m: 200, izolacja: "XLPE", metoda: "C", cosfi: 0.7, limitSpadku_pct: 3 })
    );
    expect(r.wartosci!.kryteria.spadek_napiecia.minPrzekroj_mm2).toBe(300);
    expect(r.zalozenia.some((z) => z.includes("reaktancją"))).toBe(true);
  });
});

describe("pełny dobór — pakiet B audytu Kalkulatorów", () => {
  it("K3: czas do warunku cieplnego zależy od rodzaju obwodu i In (gniazda ≤ 63 A → 0,4 s)", () => {
    // Ib 50 A → B50, Ia = 250 A. Ik 240 A < Ia — strefa przeciążeniowa, więc kryterium liczy
    // się wzorem z czasem dopuszczalnym, a ten zależy od rodzaju obwodu i In.
    const czas = (rodzajObwodu: "gniazda" | "stale" | "rozdzielczy") =>
      pelnyDoborPrzekroju(wejscie({ Ib_A: 50, dlugosc_m: 5, Ik_A: 240, rodzajObwodu })).kroki.find((k) => k.opis.startsWith("Kryterium 4"))!.podstawienie;
    expect(czas("gniazda")).toContain("√0,4");
    expect(czas("stale")).toContain("√5");
    expect(czas("rozdzielczy")).toContain("√5");
  });

  it("K4: In > 125 A — bez krotności B/C: kryterium ochrony nieocenione z powodem, etykieta bez „B”", () => {
    const r = pelnyDoborPrzekroju(wejscie({ Ib_A: 180, dlugosc_m: 10, metoda: "C", impedancjaZrodla_ohm: 0.05 }));
    expect(r.wartosci!.In_A).toBeGreaterThan(125);
    expect(r.wartosci!.kryteria.ochrona_przeciwporazeniowa.ocenione).toBe(false);
    expect(r.wartosci!.kryteria.ochrona_przeciwporazeniowa.powod_pominiecia).toMatch(/kompaktowy/);
    const krok1 = r.kroki.find((k) => k.opis.startsWith("Kryterium 1"))!.wynik;
    expect(krok1).not.toMatch(/In = [BC]\d/);
    expect(r.zalozenia.join(" ")).toMatch(/60947-2/);
  });

  it("K4: do 125 A bez zmian — krotność B/C i kryterium ochrony liczone", () => {
    const r = pelnyDoborPrzekroju(wejscie({ Ib_A: 100, dlugosc_m: 10, metoda: "C", impedancjaZrodla_ohm: 0.05 }));
    expect(r.wartosci!.In_A).toBeLessThanOrEqual(125);
    expect(r.wartosci!.kryteria.ochrona_przeciwporazeniowa.ocenione).toBe(true);
    expect(r.kroki.find((k) => k.opis.startsWith("Kryterium 1"))!.wynik).toMatch(/In = B\d/);
  });
});

describe("pełny dobór — K8 (przekrój PE)", () => {
  it("kroki pokazują przyjęty PE, a założenia mówią, że to minimum z tabl. 54.2", () => {
    const r = pelnyDoborPrzekroju(wejscie({ Ib_A: 80, dlugosc_m: 10, metoda: "C", impedancjaZrodla_ohm: 0.1 }));
    const k3 = r.kroki.find((k) => k.opis.startsWith("Kryterium 3"))!.wynik;
    expect(k3).toMatch(/PE przyjęty \d/);
    expect(r.zalozenia.join(" ")).toContain("MINIMUM wg PN-HD 60364-5-54 tabl. 54.2");
  });
});

describe("pełny dobór — kryterium 4 (wytrzymałość zwarciowa), opcjonalne", () => {
  it("bez podanego prądu zwarciowego kryterium jest pominięte z jawnym komunikatem", () => {
    const r = pelnyDoborPrzekroju(wejscie());
    expect(r.wartosci!.kryteria.wytrzymalosc_zwarciowa.ocenione).toBe(false);
    expect(r.wartosci!.kryteria.wytrzymalosc_zwarciowa.powod_pominiecia).toMatch(/NIE zostało sprawdzone/);
  });

  it("Ik ≥ Ia (wyzwalacz elektromagnetyczny, < 0,1 s) NIE podnosi przekroju wzorem z czasem dopuszczalnym", () => {
    // Regresja z audytu: 8 kA liczone z t = 0,4 s wymuszało przekrój kilkukrotnie za duży,
    // choć wyłącznik przy takim prądzie zadziała w milisekundach.
    const bez = pelnyDoborPrzekroju(wejscie({ dlugosc_m: 5 }));
    const z = pelnyDoborPrzekroju(wejscie({ dlugosc_m: 5, Ik_A: 8000 }));
    expect(z.wartosci!.kryteria.wytrzymalosc_zwarciowa.ocenione).toBe(false);
    expect(z.wartosci!.kryteria.wytrzymalosc_zwarciowa.powod_pominiecia).toMatch(/I²t/);
    expect(z.wartosci!.przekroj_mm2).toBe(bez.wartosci!.przekroj_mm2);
  });

  it("Ik < Ia (strefa przeciążeniowa) liczy się wzorem z MAKSYMALNYM dopuszczalnym czasem wg tabl. 41.1", () => {
    const bez = pelnyDoborPrzekroju(wejscie({ dlugosc_m: 5 }));
    const Ia = 5 * bez.wartosci!.In_A; // charakterystyka B
    const r = pelnyDoborPrzekroju(wejscie({ dlugosc_m: 5, Ik_A: Ia - 1 }));
    expect(r.wartosci!.kryteria.wytrzymalosc_zwarciowa.ocenione).toBe(true);
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
