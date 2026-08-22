import { describe, it, expect } from "vitest";
import { GRUPY_IZOLACJI, PROTOCOL_DEFS, protocolVerdict, type ProtocolRow } from "./protocols";

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
  /** Limit protokołu to teraz dopuszczalne napięcie dotykowe, nie czas. */
  const UB = 50;

  it("prąd w zakresie 0,5-1× IΔn, oba czasy w normie, UB bezpieczne -> pozytywny", () => {
    expect(def.evaluate!({ idn: 30, id: 25, t1: 25, t5: 15, ub: 40 }, UB)).toBe(true);
  });

  it("czas przy IΔn powyżej 300 ms dla wyłącznika zwykłego -> negatywny", () => {
    expect(def.evaluate!({ idn: 30, id: 25, t1: 500, t5: 15, ub: 40 }, UB)).toBe(false);
  });

  it("czas przy 5·IΔn powyżej 40 ms dla wyłącznika zwykłego -> negatywny", () => {
    expect(def.evaluate!({ idn: 30, id: 25, t1: 25, t5: 60, ub: 40 }, UB)).toBe(false);
  });

  it("napięcie dotykowe powyżej progu -> negatywny", () => {
    expect(def.evaluate!({ idn: 30, id: 25, t1: 25, t5: 15, ub: 60 }, UB)).toBe(false);
  });

  it("próg 25 V w warunkach szczególnych odrzuca UB, które przy 50 V byłoby zgodne", () => {
    expect(def.evaluate!({ idn: 30, id: 25, t1: 25, t5: 15, ub: 40 }, 25)).toBe(false);
  });

  it("wyłącznik selektywny: 400 ms przy IΔn jest ZGODNE, choć zwykły by nie przeszedł", () => {
    const wiersz = { idn: 30, id: 25, t1: 400, t5: 100, ub: 40, sel: "tak" };
    expect(def.evaluate!(wiersz, UB)).toBe(true);
    expect(def.evaluate!({ ...wiersz, sel: "nie" }, UB)).toBe(false);
  });

  it("selektywny zbyt SZYBKI też jest niezgodny — zwłoka jest jego cechą, nie wadą", () => {
    expect(def.evaluate!({ idn: 30, id: 25, t1: 20, t5: 100, ub: 40, sel: "tak" }, UB)).toBe(false);
  });

  it("niewpisany czas nie psuje oceny — pomiar mógł jeszcze nie zostać wykonany", () => {
    expect(def.evaluate!({ idn: 30, id: 25, t1: 25, ub: 40 }, UB)).toBe(true);
  });

  it("prąd zadziałania poniżej 0,5·IΔn -> negatywny", () => {
    expect(def.evaluate!({ idn: 30, id: 10, t1: 25, t5: 15, ub: 40 }, UB)).toBe(false);
  });
});

describe("PROTOCOL_DEFS.izolacja — próg zależny od napięcia próby", () => {
  const def = PROTOCOL_DEFS.izolacja;

  it("obwód SELV (250 V) z wynikiem 0,7 MΩ jest ZGODNY — wymagane 0,5 MΩ", () => {
    expect(def.evaluate!({ u: "250", ln: 0.7, lpe: 0.8, npe: 0.9 }, 0)).toBe(true);
  });

  it("ten sam wynik przy 500 V jest NIEZGODNY — wymagane 1,0 MΩ", () => {
    expect(def.evaluate!({ u: "500", ln: 0.7, lpe: 0.8, npe: 0.9 }, 0)).toBe(false);
  });

  it("własny próg zaostrza kryterium ponad wymaganie normy", () => {
    expect(def.evaluate!({ u: "500", ln: 1.5, lpe: 1.5, npe: 1.5 }, 2)).toBe(false);
    expect(def.evaluate!({ u: "500", ln: 1.5, lpe: 1.5, npe: 1.5 }, 0)).toBe(true);
  });

  it("kolumna R min pokazuje próg wynikający z napięcia próby", () => {
    const rmin = def.columns!.find((c) => c.key === "rmin")!;
    expect(rmin.compute!({ u: "250" })).toBe("0.5");
    expect(rmin.compute!({ u: "500" })).toBe("1.0");
    expect(rmin.compute!({ u: "1000" })).toBe("1.0");
  });
});

describe("izolacja — komplety pomiarów zależne od układu sieci", () => {
  const grupa = (id: string) => GRUPY_IZOLACJI.find((g) => g.id === id)!;

  it("TN-S/TT ma 10 par, w tym wszystkie międzyfazowe, do N, do PE i N-PE", () => {
    expect(grupa("tns").pary).toEqual([
      "L1-L2",
      "L2-L3",
      "L1-L3",
      "L1-N",
      "L2-N",
      "L3-N",
      "L1-PE",
      "L2-PE",
      "L3-PE",
      "N-PE",
    ]);
  });

  it("TN-C ma 6 par — bez pomiarów do N, do PE i N-PE, bo tam jest wspólny PEN", () => {
    const pary = grupa("tnc").pary;
    expect(pary).toEqual(["L1-L2", "L2-L3", "L1-L3", "L1-PEN", "L2-PEN", "L3-PEN"]);
    expect(pary.some((p) => p === "N-PE" || p.endsWith("-N") || p.endsWith("-PE"))).toBe(false);
  });

  it("każda para występuje tylko raz — komplet bez duplikatów", () => {
    for (const g of GRUPY_IZOLACJI) expect(new Set(g.pary).size).toBe(g.pary.length);
  });

  it("ocenia pojedynczy pomiar pary wobec progu z napięcia próby", () => {
    const def = PROTOCOL_DEFS.izolacja;
    expect(def.evaluate!({ para: "L1-PE", u: "500", r: 1.2 }, 0)).toBe(true);
    expect(def.evaluate!({ para: "L1-PE", u: "500", r: 0.7 }, 0)).toBe(false);
    // ten sam wynik w obwodzie SELV badanym 250 V jest zgodny
    expect(def.evaluate!({ para: "L1-PE", u: "250", r: 0.7 }, 0)).toBe(true);
  });

  it("pusty pomiar nie jest oceniany — wiersz czeka na wypełnienie", () => {
    expect(PROTOCOL_DEFS.izolacja.evaluate!({ para: "L1-PE", u: "500", r: "" }, 0)).toBeNull();
  });
});

describe("obwody 3-fazowe", () => {
  it("izolacja: pomiar międzyfazowy L-L wchodzi do oceny", () => {
    const def = PROTOCOL_DEFS.izolacja;
    // Same pomiary do N i PE są dobre — dopiero L-L ujawnia usterkę.
    expect(def.evaluate!({ uklad: "3-faz", u: "500", ln: 5, lpe: 5, npe: 5 }, 0)).toBe(true);
    expect(def.evaluate!({ uklad: "3-faz", u: "500", ll: 0.3, ln: 5, lpe: 5, npe: 5 }, 0)).toBe(false);
  });

  it("izolacja: pusta kolumna L-L nie psuje oceny obwodu 1-fazowego", () => {
    const def = PROTOCOL_DEFS.izolacja;
    expect(def.evaluate!({ uklad: "1-faz", u: "500", ll: "", ln: 5, lpe: 5, npe: 5 }, 0)).toBe(true);
  });

  it("pętla zwarcia: o ocenie decyduje NAJGORSZA faza, nie pierwsza", () => {
    const def = PROTOCOL_DEFS.petla;
    // Zs max dla B16 to 2,88 Ω. L1 mieści się z zapasem, L3 nie.
    expect(def.evaluate!({ uklad: "3-faz", curve: "B", in: 16, zs: 1.2, zs2: 1.3, zs3: 1.4 }, 1)).toBe(true);
    expect(def.evaluate!({ uklad: "3-faz", curve: "B", in: 16, zs: 1.2, zs2: 1.3, zs3: 4.5 }, 1)).toBe(false);
  });

  it("pętla zwarcia: obwód 1-fazowy ocenia się po samej L1", () => {
    const def = PROTOCOL_DEFS.petla;
    expect(def.evaluate!({ uklad: "1-faz", curve: "B", in: 16, zs: 1.2, zs2: "", zs3: "" }, 1)).toBe(true);
    expect(def.evaluate!({ uklad: "1-faz", curve: "B", in: 16, zs: 4.5, zs2: "", zs3: "" }, 1)).toBe(false);
  });

  it("pętla zwarcia: brak choćby jednej zmierzonej fazy -> brak oceny", () => {
    const def = PROTOCOL_DEFS.petla;
    expect(def.evaluate!({ uklad: "3-faz", curve: "B", in: 16 }, 1)).toBeNull();
  });
});

describe("PROTOCOL_DEFS.odgromowa.evaluate", () => {
  const def = PROTOCOL_DEFS.odgromowa;

  it("rezystancja w limicie i ciągłość zachowana -> pozytywny", () => {
    expect(def.evaluate!({ r: 8, ciaglosc: 0.4, stan: "dobry" }, 10)).toBe(true);
  });

  it("rezystancja ponad limit -> negatywny", () => {
    expect(def.evaluate!({ r: 14, ciaglosc: 0.4, stan: "dobry" }, 10)).toBe(false);
  });

  it("przerwana ciągłość -> negatywny mimo dobrego uziemienia", () => {
    expect(def.evaluate!({ r: 5, ciaglosc: 6, stan: "dobry" }, 10)).toBe(false);
  });

  it("stan „do naprawy” przesądza o ocenie niezależnie od liczb", () => {
    expect(def.evaluate!({ r: 5, ciaglosc: 0.3, stan: "do naprawy" }, 10)).toBe(false);
  });

  it("brak jakichkolwiek pomiarów -> brak oceny", () => {
    expect(def.evaluate!({ stan: "dobry" }, 10)).toBeNull();
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
