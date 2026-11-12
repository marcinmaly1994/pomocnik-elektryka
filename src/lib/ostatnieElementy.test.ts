import { describe, expect, it } from "vitest";
import { czytajOstatnie, dodajOstatni, ILE_OSTATNICH, KLUCZ_OSTATNICH, zapiszOstatnie } from "./ostatnieElementy";

function magazyn(start: Record<string, string> = {}) {
  const m = new Map(Object.entries(start));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}

describe("ostatnio używane elementy (R13)", () => {
  it("najświeższy na początku, bez powtórzeń, najwyżej ILE_OSTATNICH", () => {
    let l = dodajOstatni([], "gniazdko");
    l = dodajOstatni(l, "oswietlenie");
    l = dodajOstatni(l, "gniazdko");
    expect(l).toEqual(["gniazdko", "oswietlenie"]);
    for (const t of ["wlacznik", "rj45", "rtvsat", "czujnikDymu"] as const) l = dodajOstatni(l, t);
    expect(l).toHaveLength(ILE_OSTATNICH);
    expect(l[0]).toBe("czujnikDymu");
  });

  it("zapis i odczyt przez magazyn; śmieci i nieznane typy odpadają", () => {
    const m = magazyn();
    zapiszOstatnie(m, ["gniazdko", "wlacznik"]);
    expect(czytajOstatnie(m)).toEqual(["gniazdko", "wlacznik"]);
    expect(czytajOstatnie(magazyn({ [KLUCZ_OSTATNICH]: '["gniazdko","nieistnieje",3]' }))).toEqual(["gniazdko"]);
    expect(czytajOstatnie(magazyn({ [KLUCZ_OSTATNICH]: "{zepsute" }))).toEqual([]);
    expect(czytajOstatnie(null)).toEqual([]);
  });

  it("magazyn, który rzuca, nie psuje niczego", () => {
    const zly = { getItem: () => { throw new Error("x"); }, setItem: () => { throw new Error("x"); } };
    expect(czytajOstatnie(zly)).toEqual([]);
    expect(() => zapiszOstatnie(zly, ["gniazdko"])).not.toThrow();
  });
});
