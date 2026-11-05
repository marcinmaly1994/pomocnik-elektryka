import { describe, it, expect } from "vitest";
import { bledyBilansuMocy, calcPowerBalance, calcLighting, maxGroundingResistance } from "./electrical";

describe("calcPowerBalance", () => {
  it("domyślne odbiorniki z CalculatorsTab (6000+7000+3000 W, ks=0,7)", () => {
    const devices = [
      { name: "Gniazda i oświetlenie", power: 6000 },
      { name: "Kuchenka elektryczna", power: 7000 },
      { name: "Bojler / pompa ciepła", power: 3000 },
    ];
    const r = calcPowerBalance(devices, 0.7);
    expect(r.sumPower).toBe(16000);
    expect(r.demandPower).toBeCloseTo(11200, 5);
    expect(r.demandCurrent1).toBeCloseTo(48.7, 1);
    expect(r.demandCurrent3).toBeCloseTo(16.17, 1);
  });

  it("brak odbiorników -> zera, nie NaN", () => {
    const r = calcPowerBalance([], 0.7);
    expect(r.sumPower).toBe(0);
    expect(r.demandPower).toBe(0);
  });
});

describe("calcLighting", () => {
  it("20 m², 300 lx, oprawa 1200 lm, MF=0,8, UF=0,6 -> ok. 8 opraw", () => {
    const r = calcLighting({
      roomAreaM2: 20,
      luxRequired: 300,
      lumensPerFixture: 1200,
      maintenanceFactor: 0.8,
      utilizationFactor: 0.6,
    });
    expect(r.requiredLumens).toBeCloseTo(12500, 0);
    expect(Math.ceil(r.fixtureCount)).toBe(11);
  });
});

describe("maxGroundingResistance", () => {
  it("RCD 30 mA -> RA max = 50/0,03 = 1667 Ω", () => {
    expect(maxGroundingResistance(0.03)).toBeCloseTo(1666.67, 1);
  });

  it("RCD 500 mA (typowe dla obwodu rozdzielczego) -> RA max = 100 Ω", () => {
    expect(maxGroundingResistance(0.5)).toBe(100);
  });

  it("brak prądu różnicowego -> zero, nie dzielenie przez zero", () => {
    expect(maxGroundingResistance(0)).toBe(0);
  });
});

describe("calcPowerBalance — cos φ i walidacja (audyt 2026-11-04, B10)", () => {
  const dev = [{ name: "A", power: 9200 }];

  it("cos φ podnosi prąd o 1/cos φ, a domyślne 1 nie zmienia dawnych wyników", () => {
    expect(calcPowerBalance(dev, 1).demandCurrent1).toBeCloseTo(40, 6);
    expect(calcPowerBalance(dev, 1, 0.8).demandCurrent1).toBeCloseTo(50, 6);
  });

  it("dane poprawne — brak błędów", () => {
    expect(bledyBilansuMocy(dev, 0.7, 1)).toEqual([]);
  });

  it("moc ujemna, ks > 1 i cos φ poza (0; 1] są zgłaszane po imieniu", () => {
    const b = bledyBilansuMocy([{ name: "Kuchenka", power: -5000 }], 3, 1.2);
    expect(b).toHaveLength(3);
    expect(b[0]).toMatch(/„Kuchenka” nie może być ujemna/);
    expect(b[1]).toMatch(/ks musi mieścić się/);
    expect(b[2]).toMatch(/cos φ/);
  });

  it("ks = 0 też jest błędem (nic by nie pracowało)", () => {
    expect(bledyBilansuMocy(dev, 0, 1)).toHaveLength(1);
  });
});
