import { describe, expect, it } from "vitest";
import { minPrzekrojZwarciowy, ocenKryteria, werdyktObwodu, type WejscieKryteriow } from "./kryteriaObwodu";

/** Obwod gniazdowy 1-fazowy 2,5 mm2 / B16, ktory spelnia wszystko, co da sie ocenic. */
function wejscie(over: Partial<WejscieKryteriow> = {}): WejscieKryteriow {
  return {
    Ib_A: 15.2,
    In_A: 16,
    Iz_A: 23,
    spadek_pct: 2.36,
    spadek_limit_pct: 5,
    Zs_max_Ohm: 2.73,
    przekroj_mm2: 2.5,
    material: "Cu",
    izolacja: "PVC",
    ...over,
  };
}

const stan = (oceny: ReturnType<typeof ocenKryteria>, k: string) => oceny.find((o) => o.kryterium === k)!;

describe("ocenKryteria", () => {
  it("zawsze zwraca komplet czterech kryteriow", () => {
    expect(ocenKryteria(wejscie()).map((o) => o.kryterium)).toEqual([
      "obciazalnosc",
      "spadek_napiecia",
      "ochrona_przeciwporazeniowa",
      "wytrzymalosc_zwarciowa",
    ]);
  });

  it("obciazalnosc: Ib <= In <= Iz", () => {
    expect(stan(ocenKryteria(wejscie()), "obciazalnosc").stan).toBe("ok");
    // Aparat wiekszy niz obciazalnosc przewodu — przewod grzeje sie, zanim cokolwiek zadziala.
    expect(stan(ocenKryteria(wejscie({ In_A: 25 })), "obciazalnosc").stan).toBe("blad");
    // Aparat mniejszy od pradu obliczeniowego — wylaczy sie przy normalnej pracy.
    expect(stan(ocenKryteria(wejscie({ Ib_A: 20 })), "obciazalnosc").stan).toBe("blad");
  });

  it("spadek napiecia: porownanie z limitem, z zapasem w procentach", () => {
    const ok = stan(ocenKryteria(wejscie()), "spadek_napiecia");
    expect(ok.stan).toBe("ok");
    expect(ok.margines_pct).toBeCloseTo((1 - 2.36 / 5) * 100, 6);
    expect(stan(ocenKryteria(wejscie({ spadek_pct: 6 })), "spadek_napiecia").stan).toBe("blad");
  });

  /**
   * Sedno calego modulu: kryterium bez danych jest NIEOCENIONE, nigdy „spelnione".
   * Zielony ptaszek przy warunku, ktorego nikt nie sprawdzil, jest gorszy niz jego brak.
   */
  it("ochrona przeciwporazeniowa bez podanej Zs zostaje nieoceniona, ale podaje wymog", () => {
    const o = stan(ocenKryteria(wejscie()), "ochrona_przeciwporazeniowa");
    expect(o.stan).toBe("nieoceniono");
    expect(o.opis).toMatch(/2,73/);
  });

  it("ochrona przeciwporazeniowa z podana Zs jest oceniana", () => {
    expect(stan(ocenKryteria(wejscie({ Zs_Ohm: 2 })), "ochrona_przeciwporazeniowa").stan).toBe("ok");
    expect(stan(ocenKryteria(wejscie({ Zs_Ohm: 3 })), "ochrona_przeciwporazeniowa").stan).toBe("blad");
  });

  it("wytrzymalosc zwarciowa bez pradu zwarcia i czasu zostaje nieoceniona", () => {
    expect(stan(ocenKryteria(wejscie()), "wytrzymalosc_zwarciowa").stan).toBe("nieoceniono");
  });

  it("wytrzymalosc zwarciowa: S >= Ik*sqrt(t)/k", () => {
    // 1 kA przez 0,1 s przy k=115 (Cu/PVC) wymaga 2,75 mm2 — 2,5 nie wystarcza.
    expect(minPrzekrojZwarciowy(1000, 0.1, "Cu", "PVC")).toBeCloseTo(2.75, 2);
    expect(stan(ocenKryteria(wejscie({ Ik_A: 1000, czas_s: 0.1 })), "wytrzymalosc_zwarciowa").stan).toBe("blad");
    expect(stan(ocenKryteria(wejscie({ Ik_A: 1000, czas_s: 0.1, przekroj_mm2: 4 })), "wytrzymalosc_zwarciowa").stan).toBe("ok");
  });

  /** XLPE znosi wyzsza temperature zwarciowa, wiec ten sam prad wymaga cienszej zyly. */
  it("izolacja wplywa na warunek cieplny", () => {
    expect(minPrzekrojZwarciowy(1000, 0.1, "Cu", "XLPE")).toBeLessThan(minPrzekrojZwarciowy(1000, 0.1, "Cu", "PVC"));
  });
});

describe("werdyktObwodu", () => {
  it("blad wygrywa ze wszystkim", () => {
    expect(werdyktObwodu(ocenKryteria(wejscie({ spadek_pct: 9, Zs_Ohm: 1, Ik_A: 500, czas_s: 0.1 })))).toBe("blad");
  });

  it("brak oceny wygrywa z sukcesem — komplet zielonych musi znaczyc komplet sprawdzonych", () => {
    expect(werdyktObwodu(ocenKryteria(wejscie()))).toBe("nieoceniono");
  });

  it("wszystko sprawdzone i spelnione", () => {
    expect(werdyktObwodu(ocenKryteria(wejscie({ Zs_Ohm: 1, Ik_A: 500, czas_s: 0.1 })))).toBe("ok");
  });
});
