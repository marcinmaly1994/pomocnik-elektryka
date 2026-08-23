import { describe, it, expect } from "vitest";
import { zawijNaDwieLinie, utnij } from "./tekst";

/**
 * Podpisy pod aparatami kończyły się wielokropkiem — a ucinana była właśnie ta
 * końcówka, która odróżnia jeden obwód od drugiego („Gniazda — Kuchnia" od
 * „Gniazda — Kuchnia (zmywarka)"). Stąd łamanie na dwie linie zamiast ucinania.
 */
describe("zawijNaDwieLinie", () => {
  it("krótki tekst zostaje w jednej linii", () => {
    expect(zawijNaDwieLinie("Gniazda", 20)).toEqual(["Gniazda", ""]);
  });

  it("łamie na granicy słowa, nie w środku wyrazu", () => {
    const [a, b] = zawijNaDwieLinie("Gniazda kuchnia zmywarka", 16);
    expect(a).toBe("Gniazda kuchnia");
    expect(b).toBe("zmywarka");
    expect(a.length).toBeLessThanOrEqual(16);
  });

  it("obie linie mieszczą się w limicie", () => {
    const [a, b] = zawijNaDwieLinie("Obwód dedykowany kuchnia zmywarka i zmywarko-suszarka", 18);
    expect(a.length).toBeLessThanOrEqual(18);
    expect(b.length).toBeLessThanOrEqual(18);
  });

  it("pojedynczy wyraz dłuższy od linii tnie twardo, zamiast zostawiać pustą pierwszą linię", () => {
    // Bez tego cały podpis zjeżdżałby do drugiej linii, a pierwsza świeciła pustką.
    const [a, b] = zawijNaDwieLinie("Zmywarkosuszarkozmywarka", 10);
    expect(a).toBe("Zmywarkosu");
    expect(b.length).toBeGreaterThan(0);
  });

  it("nadmiar ponad dwie linie kończy się wielokropkiem — miejsce naprawdę się kończy", () => {
    const [, b] = zawijNaDwieLinie("jeden dwa trzy cztery pięć sześć siedem osiem dziewięć", 12);
    expect(b.endsWith("…")).toBe(true);
    expect(b.length).toBeLessThanOrEqual(12);
  });

  it("radzi sobie z pustym wejściem", () => {
    expect(zawijNaDwieLinie("", 10)).toEqual(["", ""]);
  });
});

describe("utnij", () => {
  it("nie rusza tekstu, który się mieści", () => {
    expect(utnij("abc", 5)).toBe("abc");
  });

  it("ucięty tekst nie przekracza limitu", () => {
    expect(utnij("abcdefgh", 5).length).toBeLessThanOrEqual(5);
  });
});
