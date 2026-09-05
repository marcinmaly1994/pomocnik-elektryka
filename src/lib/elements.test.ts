import { describe, it, expect } from "vitest";
import { computeSanitaryZones } from "./elements";
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
