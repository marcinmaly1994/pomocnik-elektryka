import { describe, it, expect } from "vitest";
import { calcPowerBalance, calcLighting, maxGroundingResistance } from "./electrical";

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
