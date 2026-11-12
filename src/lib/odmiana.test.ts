import { describe, expect, it } from "vitest";
import { slowoLiczby, zLiczba } from "./liczby";

describe("odmiana po liczebniku (R8 z audytu Instalacji 11.11.2026)", () => {
  it("jeden / kilka / wiele, z wyjątkiem 12–14", () => {
    const f = (n: number) => slowoLiczby(n, "uwaga", "uwagi", "uwag");
    expect([0, 1, 2, 4, 5, 11, 12, 14, 21, 22, 24, 25, 102, 112].map(f)).toEqual([
      "uwag",
      "uwaga",
      "uwagi",
      "uwagi",
      "uwag",
      "uwag",
      "uwag",
      "uwag",
      "uwag",
      "uwagi",
      "uwagi",
      "uwag",
      "uwagi",
      "uwag",
    ]);
  });

  it("zLiczba skleja liczbę i słowo", () => {
    expect(zLiczba(22, "element", "elementy", "elementów")).toBe("22 elementy");
  });
});
