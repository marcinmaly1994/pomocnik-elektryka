import { describe, expect, it } from "vitest";
import { obliczBilans, type BilansWejscie, type Odbior } from "./loadBalance";

function odbior(over: Partial<Odbior> = {}): Odbior {
  return { nazwa: "Odbiór", moc_W: 2300, cosfi: 1, faza: "L1", ...over };
}

function wejscie(odbiory: Odbior[], over: Partial<BilansWejscie> = {}): BilansWejscie {
  return { odbiory, U0_V: 230, Un_V: 400, udzialH3_pct: 0, ...over };
}

describe("bilans — prądy fazowe", () => {
  it("odbiór 1-fazowy 2300 W przy cosφ = 1 daje 10 A w swojej fazie", () => {
    const r = obliczBilans(wejscie([odbior()]));
    expect(r.bledy).toEqual([]);
    expect(r.wartosci!.prady.L1).toBeCloseTo(10, 6);
    expect(r.wartosci!.prady.L2).toBe(0);
  });

  it("odbiór 3-fazowy obciąża wszystkie fazy równo: I = P/(√3·U·cosφ·η)", () => {
    const r = obliczBilans(wejscie([odbior({ moc_W: 7000, faza: null })]));
    const I = 7000 / (Math.sqrt(3) * 400);
    expect(r.wartosci!.prady.L1).toBeCloseTo(I, 6);
    expect(r.wartosci!.prady.L2).toBeCloseTo(I, 6);
    expect(r.wartosci!.prady.L3).toBeCloseTo(I, 6);
    expect(r.wartosci!.asymetria_pct).toBeCloseTo(0, 6);
  });

  it("sprawność i cosφ podnoszą prąd — silnik pobiera więcej niż moc na wale", () => {
    const rezystancyjny = obliczBilans(wejscie([odbior({ moc_W: 2300 })])).wartosci!.prady.L1;
    const silnik = obliczBilans(wejscie([odbior({ moc_W: 2300, cosfi: 0.8, sprawnosc: 0.85 })])).wartosci!.prady.L1;
    expect(silnik).toBeCloseTo(2300 / (230 * 0.8 * 0.85), 6);
    expect(silnik).toBeGreaterThan(rezystancyjny);
  });

  it("współczynnik jednoczesności obniża moc szczytową, ale nie zainstalowaną", () => {
    const r = obliczBilans(wejscie([odbior({ moc_W: 10000, wspJednoczesnosci: 0.6 })]));
    expect(r.wartosci!.Pi_W).toBe(10000);
    expect(r.wartosci!.Ps_W).toBeCloseTo(6000, 6);
  });
});

describe("bilans — prąd w przewodzie neutralnym", () => {
  it("obciążenie SYMETRYCZNE i liniowe daje zerowy prąd w N", () => {
    const r = obliczBilans(
      wejscie([odbior({ faza: "L1" }), odbior({ faza: "L2" }), odbior({ faza: "L3" })])
    );
    expect(r.wartosci!.IN_calkowity_A).toBeCloseTo(0, 6);
    expect(r.ocena!.verdict).toBe("spelniony");
  });

  it("jedna obciążona faza: prąd w N równa się prądowi fazowemu", () => {
    const r = obliczBilans(wejscie([odbior({ faza: "L1" })]));
    expect(r.wartosci!.IN_asymetria_A).toBeCloseTo(10, 6);
    expect(r.wartosci!.asymetria_pct).toBeCloseTo(100, 6);
  });

  it("dwie równe fazy: I_N = I (ze wzoru √(I²+I²−I·I) = I)", () => {
    const r = obliczBilans(wejscie([odbior({ faza: "L1" }), odbior({ faza: "L2" })]));
    expect(r.wartosci!.IN_asymetria_A).toBeCloseTo(10, 6);
  });

  it("3. harmoniczna sumuje się w N ARYTMETYCZNIE — przy symetrii prąd w N ≠ 0", () => {
    const bezH3 = obliczBilans(wejscie([odbior({ faza: "L1" }), odbior({ faza: "L2" }), odbior({ faza: "L3" })]));
    expect(bezH3.wartosci!.IN_calkowity_A).toBeCloseTo(0, 6);

    const zH3 = obliczBilans(
      wejscie([odbior({ faza: "L1" }), odbior({ faza: "L2" }), odbior({ faza: "L3" })], { udzialH3_pct: 40 })
    );
    // 3 · 0,4 · 10 A = 12 A mimo idealnej symetrii
    expect(zH3.wartosci!.IN_calkowity_A).toBeCloseTo(12, 6);
  });

  it("prąd w N przekraczający prąd fazowy to WERDYKT NIESPEŁNIONY, nie ciekawostka", () => {
    const r = obliczBilans(
      wejscie([odbior({ faza: "L1" }), odbior({ faza: "L2" }), odbior({ faza: "L3" })], { udzialH3_pct: 50 })
    );
    // 3 · 0,5 · 10 = 15 A > 10 A prądu fazowego
    expect(r.wartosci!.IN_calkowity_A).toBeGreaterThan(r.wartosci!.Imax_faza_A);
    expect(r.ocena!.verdict).toBe("niespelniony");
    expect(r.ocena!.komunikat).toMatch(/nie mniejszy niż fazowy/i);
  });

  it("bez podanego udziału h3 mówi wprost, że przyjęto odbiory liniowe", () => {
    const r = obliczBilans(wejscie([odbior()]));
    expect(r.zalozenia.join(" ")).toMatch(/odbiory LINIOWE/);
  });
});

describe("bilans — asymetria i walidacja", () => {
  it("asymetria powyżej 15% jest zgłaszana jako wynik graniczny", () => {
    const r = obliczBilans(
      wejscie([odbior({ moc_W: 2300, faza: "L1" }), odbior({ moc_W: 1800, faza: "L2" }), odbior({ moc_W: 2300, faza: "L3" })])
    );
    expect(r.wartosci!.asymetria_pct).toBeGreaterThan(15);
    expect(r.ocena!.verdict).toBe("graniczny");
  });

  it("moc pozorna i wypadkowy cosφ liczą się z sumy P i Q", () => {
    const r = obliczBilans(wejscie([odbior({ moc_W: 8000, cosfi: 0.8, faza: null })]));
    // Q = P·tgφ = 8000·0,75 = 6000 var; S = √(8000²+6000²) = 10000 VA
    expect(r.wartosci!.Q_var).toBeCloseTo(6000, 3);
    expect(r.wartosci!.S_VA).toBeCloseTo(10000, 3);
    expect(r.wartosci!.cosfi).toBeCloseTo(0.8, 6);
  });

  it("pusta lista odbiorów i błędne cosφ kończą się błędem", () => {
    expect(obliczBilans(wejscie([])).bledy.map((b) => b.code)).toContain("BRAK_ODBIOROW");
    expect(obliczBilans(wejscie([odbior({ cosfi: 0 })])).bledy.map((b) => b.code)).toContain("COSFI");
    expect(obliczBilans(wejscie([odbior()], { udzialH3_pct: 150 })).bledy.map((b) => b.code)).toContain("H3");
  });
});
