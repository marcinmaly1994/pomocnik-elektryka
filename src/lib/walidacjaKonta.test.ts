import { describe, it, expect } from "vitest";
import { MIN_DLUGOSC_HASLA, bladEmaila, bladNowegoHasla } from "./walidacjaKonta";

describe("bladEmaila", () => {
  it("pusty albo z samych spacji → prośba o adres", () => {
    expect(bladEmaila("")).toBe("Podaj adres e-mail.");
    expect(bladEmaila("   ")).toBe("Podaj adres e-mail.");
  });

  it("odrzuca oczywiste nie-adresy", () => {
    for (const zly of ["to-nie-email", "a@b", "a b@example.com", "@example.com", "jan@"]) {
      expect(bladEmaila(zly), zly).toMatch(/nie wygląda na adres/);
    }
  });

  it("przyjmuje zwykłe adresy, także z plusem i spacjami na brzegach", () => {
    for (const dobry of ["jan@example.com", "jan.kowalski+test@poczta.example.pl", "  jan@example.com  "]) {
      expect(bladEmaila(dobry), dobry).toBeNull();
    }
  });
});

describe("bladNowegoHasla", () => {
  it(`wymaga co najmniej ${MIN_DLUGOSC_HASLA} znaków`, () => {
    expect(bladNowegoHasla("a".repeat(MIN_DLUGOSC_HASLA - 1), "a".repeat(MIN_DLUGOSC_HASLA - 1))).toMatch(/co najmniej/);
    expect(bladNowegoHasla("a".repeat(MIN_DLUGOSC_HASLA), "a".repeat(MIN_DLUGOSC_HASLA))).toBeNull();
  });

  it("długość sprawdza przed zgodnością — najpierw to, co da się poprawić w pierwszym polu", () => {
    expect(bladNowegoHasla("abc", "xyz")).toMatch(/co najmniej/);
  });

  it("różne hasła → błąd zgodności", () => {
    expect(bladNowegoHasla("abcdefgh", "abcdefgX")).toBe("Hasła nie są takie same.");
  });
});
