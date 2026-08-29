import { describe, expect, it } from "vitest";
import { obliczImpedancjePrzewodu, obliczPrzewodyRownolegle } from "./conductorImpedance";
import { dobierzN, dobierzPE } from "./protectiveConductor";
import { obliczKoordynacjeSPD, PRZYROST_NA_PRZEWODACH_V_NA_M } from "./spd";

describe("impedancja przewodu", () => {
  it("R = ρ·L/S z poprawką temperaturową — 100 m, 16 mm² Cu przy 70 °C", () => {
    // ρ(70) = (1/56)·(1+0,00393·50) = 0,021366 → R = 0,021366·100/16 = 0,1335 Ω
    const r = obliczImpedancjePrzewodu({ dlugosc_m: 100, przekroj_mm2: 16, material: "Cu", izolacja: "PVC" });
    expect(r.wartosci!.R_ohm).toBeCloseTo(0.1335, 4);
    expect(r.wartosci!.tempZyly_C).toBe(70);
  });

  it("XLPE liczy się przy 90 °C, więc daje wyższą rezystancję niż PVC", () => {
    const pvc = obliczImpedancjePrzewodu({ dlugosc_m: 100, przekroj_mm2: 16, material: "Cu", izolacja: "PVC" });
    const xlpe = obliczImpedancjePrzewodu({ dlugosc_m: 100, przekroj_mm2: 16, material: "Cu", izolacja: "XLPE" });
    expect(xlpe.wartosci!.tempZyly_C).toBe(90);
    expect(xlpe.wartosci!.R_ohm).toBeGreaterThan(pvc.wartosci!.R_ohm);
  });

  it("aluminium ma ok. 1,6× większą rezystancję niż miedź przy tym samym przekroju", () => {
    const cu = obliczImpedancjePrzewodu({ dlugosc_m: 100, przekroj_mm2: 16, material: "Cu", izolacja: "PVC" });
    const al = obliczImpedancjePrzewodu({ dlugosc_m: 100, przekroj_mm2: 16, material: "Al", izolacja: "PVC" });
    expect(al.wartosci!.R_ohm / cu.wartosci!.R_ohm).toBeCloseTo(1.6, 1);
  });

  it("Z = √(R²+X²) i zwraca R/X do obliczeń zwarciowych", () => {
    const r = obliczImpedancjePrzewodu({ dlugosc_m: 100, przekroj_mm2: 16, material: "Cu", izolacja: "PVC" });
    const { R_ohm, X_ohm, Z_ohm, R_do_X } = r.wartosci!;
    expect(Z_ohm).toBeCloseTo(Math.hypot(R_ohm, X_ohm), 9);
    expect(R_do_X).toBeCloseTo(R_ohm / X_ohm, 9);
  });

  it("zerowa długość albo przekrój kończą się błędem", () => {
    expect(
      obliczImpedancjePrzewodu({ dlugosc_m: 0, przekroj_mm2: 16, material: "Cu", izolacja: "PVC" }).bledy.map((b) => b.code)
    ).toContain("DLUGOSC");
    expect(
      obliczImpedancjePrzewodu({ dlugosc_m: 10, przekroj_mm2: 0, material: "Cu", izolacja: "PVC" }).bledy.map((b) => b.code)
    ).toContain("PRZEKROJ");
  });
});

describe("przewody równoległe", () => {
  it("jednakowe długości dzielą prąd po równo", () => {
    const r = obliczPrzewodyRownolegle({
      pradCalkowity_A: 200,
      dlugosci_m: [50, 50],
      przekroj_mm2: 95,
      material: "Cu",
      izolacja: "PVC",
    });
    expect(r.wartosci!.prady_A).toEqual([100, 100]);
    expect(r.wartosci!.odchylenie_pct).toBeCloseTo(0, 9);
  });

  it("różne długości przeciążają KRÓTSZĄ żyłę — prąd dzieli się odwrotnie do impedancji", () => {
    // L = 40 i 60 m: konduktancje 1/40 i 1/60 → udziały 0,6 i 0,4
    const r = obliczPrzewodyRownolegle({
      pradCalkowity_A: 200,
      dlugosci_m: [40, 60],
      przekroj_mm2: 95,
      material: "Cu",
      izolacja: "PVC",
    });
    expect(r.wartosci!.prady_A[0]).toBeCloseTo(120, 6);
    expect(r.wartosci!.prady_A[1]).toBeCloseTo(80, 6);
    expect(r.wartosci!.odchylenie_pct).toBeCloseTo(20, 6);
    expect(r.zalozenia[0]).toMatch(/NIE SĄ równe/);
  });

  it("przeciążenie jednej żyły to werdykt niespełniony — i mówi, czemu zabezpieczenie tego nie widzi", () => {
    const r = obliczPrzewodyRownolegle({
      pradCalkowity_A: 200,
      dlugosci_m: [30, 70],
      przekroj_mm2: 95,
      material: "Cu",
      izolacja: "PVC",
      Iz_jednej_A: 120,
    });
    expect(r.wartosci!.Imax_A).toBeCloseTo(140, 6);
    expect(r.ocena!.verdict).toBe("niespelniony");
    expect(r.ocena!.komunikat).toMatch(/NIE wykryje/);
  });

  it("równy podział mieszczący się w obciążalności daje warunek spełniony", () => {
    const r = obliczPrzewodyRownolegle({
      pradCalkowity_A: 200,
      dlugosci_m: [50, 50],
      przekroj_mm2: 95,
      material: "Cu",
      izolacja: "PVC",
      Iz_jednej_A: 150,
    });
    expect(r.ocena!.verdict).toBe("spelniony");
  });

  it("jedna żyła to nie połączenie równoległe — błąd", () => {
    const r = obliczPrzewodyRownolegle({
      pradCalkowity_A: 100,
      dlugosci_m: [50],
      przekroj_mm2: 95,
      material: "Cu",
      izolacja: "PVC",
    });
    expect(r.bledy.map((b) => b.code)).toContain("ZA_MALO_ZYL");
  });
});

describe("dobór przewodu PE", () => {
  it("reguła tabelaryczna: S ≤ 16 → PE = S; 16 < S ≤ 35 → 16; S > 35 → S/2", () => {
    const male = dobierzPE({ przekrojFazowy_mm2: 10, material: "Cu", izolacja: "PVC" });
    expect(male.wartosci!.zReguly_mm2).toBe(10);

    const srednie = dobierzPE({ przekrojFazowy_mm2: 25, material: "Cu", izolacja: "PVC" });
    expect(srednie.wartosci!.zReguly_mm2).toBe(16);

    const duze = dobierzPE({ przekrojFazowy_mm2: 120, material: "Cu", izolacja: "PVC" });
    expect(duze.wartosci!.zReguly_mm2).toBe(60);
  });

  it("przy dużym prądzie zwarciowym decyduje warunek CIEPLNY, nie reguła", () => {
    // 6 kA przez 0,4 s, Cu/PVC k=115 → S ≥ 6000·0,632/115 = 33 mm²
    const r = dobierzPE({
      przekrojFazowy_mm2: 10,
      material: "Cu",
      izolacja: "PVC",
      pradZwarciowy_A: 6000,
      czasWylaczenia_s: 0.4,
    });
    expect(r.wartosci!.zWarunkuCieplnego_mm2!).toBeCloseTo(33.0, 0);
    expect(r.wartosci!.decyduje).toBe("wytrzymałość zwarciowa cieplna");
    expect(r.wartosci!.wymagany_mm2).toBe(35);
  });

  it("bez danych zwarciowych mówi WPROST, że warunku cieplnego nie sprawdzono", () => {
    const r = dobierzPE({ przekrojFazowy_mm2: 10, material: "Cu", izolacja: "PVC" });
    expect(r.wartosci!.zWarunkuCieplnego_mm2).toBeNull();
    expect(r.zalozenia.join(" ")).toMatch(/NIE został sprawdzony/);
  });

  it("czas wyłączenia ponad 5 s wykracza poza wzór adiabatyczny — błąd", () => {
    const r = dobierzPE({
      przekrojFazowy_mm2: 10,
      material: "Cu",
      izolacja: "PVC",
      pradZwarciowy_A: 1000,
      czasWylaczenia_s: 6,
    });
    expect(r.bledy.map((b) => b.code)).toContain("CZAS_POZA_ZAKRESEM");
  });
});

describe("dobór przewodu neutralnego", () => {
  it("bez harmonicznych prąd w N jest zerowy przy obciążeniu symetrycznym", () => {
    const r = dobierzN({ przekrojFazowy_mm2: 10, pradFazowy_A: 32, udzialH3_pct: 0 });
    expect(r.wartosci!.IN_A).toBe(0);
    expect(r.ocena!.verdict).toBe("spelniony");
  });

  it("udział h3 powyżej 33% daje prąd w N większy od fazowego", () => {
    const ponizej = dobierzN({ przekrojFazowy_mm2: 10, pradFazowy_A: 32, udzialH3_pct: 30 });
    expect(ponizej.wartosci!.Nprzeciazony).toBe(false);

    const powyzej = dobierzN({ przekrojFazowy_mm2: 10, pradFazowy_A: 32, udzialH3_pct: 40 });
    // 3 · 0,4 · 32 = 38,4 A > 32 A
    expect(powyzej.wartosci!.IN_A).toBeCloseTo(38.4, 6);
    expect(powyzej.wartosci!.Nprzeciazony).toBe(true);
    expect(powyzej.ocena!.verdict).toBe("niespelniony");
    expect(powyzej.wartosci!.zalecany_mm2).toBeGreaterThan(10);
  });

  it("nie proponuje przekroju MNIEJSZEGO od fazowego i mówi dlaczego", () => {
    const r = dobierzN({ przekrojFazowy_mm2: 16, pradFazowy_A: 32, udzialH3_pct: 5 });
    expect(r.wartosci!.zalecany_mm2).toBe(16);
    expect(r.zalozenia.join(" ")).toMatch(/NIE ma wbudowanych/);
  });
});

describe("koordynacja SPD", () => {
  it("skuteczny poziom ochrony to Up POWIĘKSZONE o spadek na przewodach", () => {
    const r = obliczKoordynacjeSPD({ typ: "T2", Up_V: 1500, Uw_V: 2500, dlugoscPrzewodow_m: 0.5 });
    expect(r.wartosci!.przyrostNaPrzewodach_V).toBe(500);
    expect(r.wartosci!.UpSkuteczne_V).toBe(2000);
    expect(r.ocena!.verdict).toBe("spelniony");
  });

  it("liczy maksymalną długość przewodów — to jest źródło reguły „≤ 0,5 m”", () => {
    const r = obliczKoordynacjeSPD({ typ: "T2", Up_V: 1500, Uw_V: 2500, dlugoscPrzewodow_m: 0.5 });
    // (2500 − 1500)/1000 = 1,0 m
    expect(r.wartosci!.maksDlugosc_m).toBeCloseTo(1.0, 6);
    expect(r.zalozenia.join(" ")).toMatch(/SUMARYCZNIE/);
  });

  it("za długie przewody wywracają ochronę mimo poprawnego Up", () => {
    const r = obliczKoordynacjeSPD({ typ: "T2", Up_V: 1500, Uw_V: 2500, dlugoscPrzewodow_m: 1.5 });
    expect(r.wartosci!.UpSkuteczne_V).toBe(3000);
    expect(r.ocena!.verdict).toBe("niespelniony");
  });

  it("Up ≥ Uw to zły dobór ogranicznika — skracanie przewodów tego nie naprawi", () => {
    const r = obliczKoordynacjeSPD({ typ: "T2", Up_V: 2500, Uw_V: 2500, dlugoscPrzewodow_m: 0 });
    expect(r.wartosci).toBeNull();
    expect(r.bledy.map((b) => b.code)).toContain("UP_PONAD_UW");
    expect(r.bledy[0].message).toMatch(/Skrócenie przewodów tego nie naprawi/);
  });

  it("Typ 1 dostaje ostrzeżenie o Iimp 10/350 µs — nie jest wymienny z Typem 2", () => {
    const r = obliczKoordynacjeSPD({ typ: "T1", Up_V: 1500, Uw_V: 4000, dlugoscPrzewodow_m: 0.5 });
    expect(r.zalozenia.join(" ")).toMatch(/10\/350/);
    expect(r.zalozenia.join(" ")).toMatch(/NIE są wymienne/i);
  });

  it("przyrost na metr jest parametrem edytowalnym", () => {
    expect(PRZYROST_NA_PRZEWODACH_V_NA_M).toBe(1000);
    const r = obliczKoordynacjeSPD({ typ: "T2", Up_V: 1500, Uw_V: 2500, dlugoscPrzewodow_m: 1, przyrost_V_na_m: 500 });
    expect(r.wartosci!.UpSkuteczne_V).toBe(2000);
  });
});
