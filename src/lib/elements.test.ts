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

  it("wyznacza strefy dla wanny z kalibracją skali", () => {
    const zones = computeSanitaryZones([wanna], "f1", 0.02); // 2 cm / jednostkę
    expect(zones).toHaveLength(1);
    expect(zones[0].calibrated).toBe(true);
    expect(zones[0].r1).toBeCloseTo(0.65 / 0.02, 5); // 32.5 jednostki
    expect(zones[0].r2).toBeCloseTo(1.25 / 0.02, 5); // 62.5 jednostki
  });

  it("bez kalibracji używa poglądowego przelicznika, nie zwraca null", () => {
    const zones = computeSanitaryZones([wanna], "f1", null);
    expect(zones[0].calibrated).toBe(false);
    expect(zones[0].r1).toBeGreaterThan(0);
  });

  it("pomija elementy z innych kondygnacji", () => {
    const zones = computeSanitaryZones([{ ...wanna, floor: "f2" }], "f1", null);
    expect(zones).toHaveLength(0);
  });
});
