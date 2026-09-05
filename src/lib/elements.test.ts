import { describe, it, expect } from "vitest";
import { computeSanitaryZones, mountingHeightM } from "./elements";
import type { InstallationElement } from "@/types";

const wanna: InstallationElement = {
  id: "w1", type: "wanna", x: 100, y: 100, room: "Łazienka", floor: "f1",
  dedicated: false, note: "", gangs: 1,
};
const gniazdko: InstallationElement = {
  id: "g1", type: "gniazdko", x: 200, y: 200, room: "Salon", floor: "f1",
  dedicated: false, note: "", gangs: 1,
};

describe("computeSanitaryZones", () => {
  it("pomija elementy bez wyznaczonych stref (np. gniazdko)", () => {
    const zones = computeSanitaryZones([gniazdko], "f1", null);
    expect(zones).toHaveLength(0);
  });

  it("wyznacza obrys wanny i zasięg strefy 2 w jednostkach planu", () => {
    const zones = computeSanitaryZones([wanna], "f1", 0.02); // 2 cm / jednostkę
    expect(zones).toHaveLength(1);
    expect(zones[0].calibrated).toBe(true);
    // Strefa 1 to OBRYS przyboru (typowa wanna 1,7 × 0,75 m), nie promień od środka.
    expect(zones[0].w).toBeCloseTo(1.7 / 0.02, 5); // 85 jednostek
    expect(zones[0].h).toBeCloseTo(0.75 / 0.02, 5); // 37,5 jednostki
    expect(zones[0].zone2).toBeCloseTo(0.6 / 0.02, 5); // 30 jednostek poza krawędź
    expect(zones[0].hasZone1).toBe(true);
  });

  it("umywalka nie ma strefy 1 — sam odstęp od krawędzi", () => {
    const umywalka = { ...wanna, id: "u1", type: "umywalka" as const };
    expect(computeSanitaryZones([umywalka], "f1", 0.02)[0].hasZone1).toBe(false);
  });

  it("strefa obraca się razem z przyborem", () => {
    const obrocona = { ...wanna, rotation: 90 };
    expect(computeSanitaryZones([obrocona], "f1", 0.02)[0].rotation).toBe(90);
  });

  it("bez kalibracji używa poglądowego przelicznika, nie zwraca null", () => {
    const zones = computeSanitaryZones([wanna], "f1", null);
    expect(zones[0].calibrated).toBe(false);
    expect(zones[0].w).toBeGreaterThan(0);
  });

  it("pomija elementy z innych kondygnacji", () => {
    const zones = computeSanitaryZones([{ ...wanna, floor: "f2" }], "f1", null);
    expect(zones).toHaveLength(0);
  });
});

describe("mountingHeightM", () => {
  const e = (type: Parameters<typeof mountingHeightM>[0]["type"], heightM?: number) => ({ type, heightM });

  it("bierze wartość typową dla typu", () => {
    expect(mountingHeightM(e("gniazdko"))).toBe(0.3);
    expect(mountingHeightM(e("wlacznik"))).toBe(1.1);
    expect(mountingHeightM(e("oswietlenie"))).toBe(2.8);
  });

  it("wartość wpisana ręcznie wygrywa", () => {
    expect(mountingHeightM(e("gniazdko", 1.15))).toBe(1.15);
  });

  it("zero jest poprawną wysokością (gniazdo podłogowe), nie brakiem wartości", () => {
    expect(mountingHeightM(e("gniazdko", 0))).toBe(0);
  });

  it("wartość ujemna jest ignorowana — wraca typowa", () => {
    expect(mountingHeightM(e("gniazdko", -1))).toBe(0.3);
  });

  it("typ bez wpisu (przybór sanitarny) dostaje wartość zapasową", () => {
    expect(mountingHeightM(e("wanna"))).toBe(0.3);
  });
});
