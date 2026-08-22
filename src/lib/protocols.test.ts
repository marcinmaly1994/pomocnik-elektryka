import { describe, it, expect } from "vitest";
import { PROTOCOL_DEFS, protocolVerdict, type ProtocolRow } from "./protocols";

describe("PROTOCOL_DEFS.izolacja.evaluate", () => {
  const def = PROTOCOL_DEFS.izolacja;

  it("rezystancja powyżej progu -> pozytywny", () => {
    expect(def.evaluate!({ ln: 500, lpe: 400, npe: 300 }, 1.0)).toBe(true);
  });

  it("najgorszy pomiar poniżej progu -> negatywny", () => {
    expect(def.evaluate!({ ln: 500, lpe: 0.5, npe: 300 }, 1.0)).toBe(false);
  });

  it("brak danych -> null", () => {
    expect(def.evaluate!({}, 1.0)).toBeNull();
  });
});

describe("PROTOCOL_DEFS.petla.evaluate", () => {
  const def = PROTOCOL_DEFS.petla;

  it("B16, Zs zmierzona poniżej Zs max (2,88Ω) -> pozytywny", () => {
    expect(def.evaluate!({ curve: "B", in: 16, zs: 2.0 }, 1.0)).toBe(true);
  });

  it("B16, Zs zmierzona powyżej Zs max -> negatywny", () => {
    expect(def.evaluate!({ curve: "B", in: 16, zs: 3.5 }, 1.0)).toBe(false);
  });

  it("kolumny computed liczą Ia i Zs max zgodnie z charakterystyką", () => {
    const ia = def.columns!.find((c) => c.key === "ia")!;
    const zsmax = def.columns!.find((c) => c.key === "zsmax")!;
    expect(ia.compute!({ curve: "B", in: 16 })).toBe("80");
    expect(zsmax.compute!({ curve: "B", in: 16 })).toBe("2.88");
  });
});

describe("PROTOCOL_DEFS.rcd.evaluate", () => {
  const def = PROTOCOL_DEFS.rcd;

  it("prąd w zakresie 0,5-1× IΔn, czas w limicie, UB bezpieczne -> pozytywny", () => {
    expect(def.evaluate!({ idn: 30, id: 25, t: 25, ub: 40 }, 300)).toBe(true);
  });

  it("czas zadziałania powyżej limitu -> negatywny", () => {
    expect(def.evaluate!({ idn: 30, id: 25, t: 500, ub: 40 }, 300)).toBe(false);
  });

  it("napięcie dotykowe powyżej 50V -> negatywny", () => {
    expect(def.evaluate!({ idn: 30, id: 25, t: 25, ub: 60 }, 300)).toBe(false);
  });
});

describe("protocolVerdict", () => {
  it("checklist: brak ocenionych pozycji -> null", () => {
    const rows: ProtocolRow[] = [{ text: "x", status: "" }];
    expect(protocolVerdict(PROTOCOL_DEFS.ogledziny, rows, 0)).toBeNull();
  });

  it("checklist: wszystko zgodne -> pozytywny", () => {
    const rows: ProtocolRow[] = [{ text: "x", status: "tak" }, { text: "y", status: "nd" }];
    expect(protocolVerdict(PROTOCOL_DEFS.ogledziny, rows, 0)).toBe(true);
  });

  it("checklist: choć jedna niezgodność -> negatywny", () => {
    const rows: ProtocolRow[] = [{ text: "x", status: "tak" }, { text: "y", status: "nie" }];
    expect(protocolVerdict(PROTOCOL_DEFS.ogledziny, rows, 0)).toBe(false);
  });

  it("tabelaryczny: brak wierszy z wynikiem -> null", () => {
    expect(protocolVerdict(PROTOCOL_DEFS.uziemienie, [{}], 30)).toBeNull();
  });

  it("tabelaryczny: wszystkie wiersze pozytywne -> pozytywny", () => {
    const rows: ProtocolRow[] = [{ r: 10 }, { r: 20 }];
    expect(protocolVerdict(PROTOCOL_DEFS.uziemienie, rows, 30)).toBe(true);
  });
});
