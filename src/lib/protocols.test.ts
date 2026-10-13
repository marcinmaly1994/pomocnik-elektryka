import { describe, it, expect } from "vitest";
import { PROTOCOL_DEFS, limitOceny, protocolVerdict, wierszeBezOceny, type ProtocolRow } from "./protocols";

describe("PROTOCOL_DEFS.izolacja.evaluate", () => {
  const def = PROTOCOL_DEFS.izolacja;

  it("wszystkie zmierzone pary powyżej wymaganej rezystancji -> pozytywny", () => {
    expect(def.evaluate!({ l1n: 500, l1pe: 400, npe: 300 }, 500)).toBe(true);
  });

  it("najgorsza para poniżej wymaganej rezystancji -> negatywny", () => {
    expect(def.evaluate!({ l1n: 500, l1pe: 0.5, npe: 300 }, 500)).toBe(false);
  });

  it("brak danych -> null", () => {
    expect(def.evaluate!({}, 500)).toBeNull();
  });

  it("puste pary nieistniejące w danym układzie sieci nie wpływają na ocenę", () => {
    // TN-C: brak osobnych N/PE, tylko międzyfazowe i do PEN
    expect(def.evaluate!({ l1l2: 5, l2l3: 5, l1l3: 5 }, 500)).toBe(true);
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
    // Przecinek dziesietny, bo to wartosc drukowana w polskim protokole — patrz lib/liczby.ts.
    // Cmin = 0,95 — protokol musi wymagac DOKLADNIE tego, co dopuscil dobor.
    expect(zsmax.compute!({ curve: "B", in: 16 })).toBe("2,73");
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

describe("PROTOCOL_DEFS.izolacja — próg zależny od napięcia probierczego (pole ogólne, nie kolumna)", () => {
  const def = PROTOCOL_DEFS.izolacja;

  it("napięcie probiercze 250 V (SELV) z wynikiem 0,7 MΩ jest ZGODNE — wymagane 0,5 MΩ", () => {
    expect(def.evaluate!({ l1n: 0.7, l1pe: 0.8, npe: 0.9 }, 250)).toBe(true);
  });

  it("ten sam wynik przy 500 V jest NIEZGODNY — wymagane 1,0 MΩ", () => {
    expect(def.evaluate!({ l1n: 0.7, l1pe: 0.8, npe: 0.9 }, 500)).toBe(false);
  });

  it("kolumna R wymagana pokazuje próg wynikający z napięcia probierczego", () => {
    const rwym = def.columns!.find((c) => c.key === "rwym")!;
    expect(rwym.compute!({}, 250)).toBe("0,5");
    expect(rwym.compute!({}, 500)).toBe("1,0");
    expect(rwym.compute!({}, 1000)).toBe("1,0");
  });

  it("ocenia komplet zmierzonych par wobec progu z napięcia probierczego", () => {
    expect(def.evaluate!({ l1pe: 1.2 }, 500)).toBe(true);
    expect(def.evaluate!({ l1pe: 0.7 }, 500)).toBe(false);
    // ten sam wynik w obwodzie SELV badanym 250 V jest zgodny
    expect(def.evaluate!({ l1pe: 0.7 }, 250)).toBe(true);
  });

  it("pusty pomiar nie jest oceniany — wiersz czeka na wypełnienie", () => {
    expect(def.evaluate!({ l1pe: "" }, 500)).toBeNull();
  });
});

describe("obwody 3-fazowe", () => {
  it("izolacja: pomiar międzyfazowy L1-L2 wchodzi do oceny", () => {
    const def = PROTOCOL_DEFS.izolacja;
    // Same pomiary do N i PE są dobre — dopiero L1-L2 ujawnia usterkę.
    expect(def.evaluate!({ l1n: 5, l1pe: 5, npe: 5 }, 500)).toBe(true);
    expect(def.evaluate!({ l1l2: 0.3, l1n: 5, l1pe: 5, npe: 5 }, 500)).toBe(false);
  });

  it("izolacja: pusta kolumna L1-L2 nie psuje oceny obwodu 1-fazowego", () => {
    const def = PROTOCOL_DEFS.izolacja;
    expect(def.evaluate!({ l1l2: "", l1n: 5, l1pe: 5, npe: 5 }, 500)).toBe(true);
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

  it("tabelaryczny: wiersz bez wyniku obok pozytywnych -> brak kompletu, a nie pozytywny", () => {
    const rows: ProtocolRow[] = [{ r: 10 }, {}, {}];
    expect(protocolVerdict(PROTOCOL_DEFS.uziemienie, rows, 30)).toBeNull();
    expect(wierszeBezOceny(PROTOCOL_DEFS.uziemienie, rows, 30)).toBe(2);
  });

  it("tabelaryczny: negatywny przesądza, nawet gdy są wiersze bez wyniku", () => {
    const rows: ProtocolRow[] = [{ r: 50 }, {}];
    expect(protocolVerdict(PROTOCOL_DEFS.uziemienie, rows, 30)).toBe(false);
  });

  it("checklist: jedna pozycja zgodna, reszta nieoceniona -> brak kompletu", () => {
    const rows: ProtocolRow[] = [{ text: "x", status: "tak" }, { text: "y", status: "" }, { text: "z", status: "" }];
    expect(protocolVerdict(PROTOCOL_DEFS.ogledziny, rows, 0)).toBeNull();
    expect(wierszeBezOceny(PROTOCOL_DEFS.ogledziny, rows, 0)).toBe(2);
  });

  it("checklist: same n/d to jeszcze nie ocena", () => {
    const rows: ProtocolRow[] = [{ text: "x", status: "nd" }];
    expect(protocolVerdict(PROTOCOL_DEFS.ogledziny, rows, 0)).toBeNull();
  });
});

describe("zapas pomiarowy w protokole pętli zwarcia", () => {
  const def = PROTOCOL_DEFS.petla;
  // B16: Zs max = 2,88 Ω. Pomiar 4,0 Ω NIE spełnia wymagania.
  const zaDuza: ProtocolRow = { curve: "B", in: 16, zs: 4.0 };

  it("współczynnik powyżej 1 nie rozluźnia oceny — pomiar niezgodny zostaje negatywny", () => {
    // Etykieta „współczynnik bezpieczeństwa" sugerowała, że większa liczba = ostrzej,
    // a próg to Zs max × współczynnik, więc 2 przepuszczało 4,0 Ω. Kierunek niebezpieczny.
    expect(def.evaluate!(zaDuza, 2)).toBe(false);
    expect(def.evaluate!(zaDuza, 1.5)).toBe(false);
  });

  it("zapas poniżej 1 zaostrza ocenę", () => {
    const blisko: ProtocolRow = { curve: "B", in: 16, zs: 2.5 };
    expect(def.evaluate!(blisko, 1)).toBe(true);
    expect(def.evaluate!(blisko, 0.8)).toBe(false);
  });

  it("limitOceny przycina wartość do zakresu, a bez zakresu nic nie zmienia", () => {
    expect(limitOceny(def, 2)).toBe(1);
    expect(limitOceny(def, 0)).toBe(0.1);
    expect(limitOceny(def, 0.8)).toBe(0.8);
    expect(limitOceny(def, NaN)).toBe(def.limitDefault);
    // izolacja: napięcie probiercze nie ma zakresu — wartość przechodzi bez zmian
    expect(limitOceny(PROTOCOL_DEFS.izolacja, 1000)).toBe(1000);
  });

  it("werdykt protokołu liczy się z przyciętej wartości, także ze starego zapisu", () => {
    expect(protocolVerdict(def, [zaDuza], limitOceny(def, 2))).toBe(false);
  });
});
