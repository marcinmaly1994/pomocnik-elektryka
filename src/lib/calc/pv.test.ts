import { describe, expect, it } from "vitest";
import { dobierzPrzewodACFalownika, obliczStringPV, WSP_ISC_STRING, type StringPVWejscie } from "./pv";

/** Moduł typowy 400 Wp: Isc 10,5 A, Voc 41,5 V, Vmpp 34,5 V, Impp 9,9 A, β = −0,27 %/°C. */
function string(over: Partial<StringPVWejscie> = {}): StringPVWejscie {
  return {
    Isc_A: 10.5,
    Voc_V: 41.5,
    Vmpp_V: 34.5,
    Impp_A: 9.9,
    liczbaModulowSzeregowo: 12,
    betaNapiecia_pct_na_C: -0.27,
    tempMin_C: -15,
    falownikVocMax_V: 600,
    dlugoscDC_m: 15,
    przekrojDC_mm2: 6,
    materialDC: "Cu",
    limitSpadkuDC_pct: 1,
    ...over,
  };
}

describe("string PV — prąd projektowy i napięcie w zimnie", () => {
  it("prąd projektowy = 1,25 × Isc", () => {
    const r = obliczStringPV(string());
    expect(r.bledy).toEqual([]);
    expect(r.wartosci!.IprojektowyA).toBeCloseTo(1.25 * 10.5, 6);
    expect(WSP_ISC_STRING).toBe(1.25);
  });

  it("Voc w zimnie: 12 modułi × 41,5 V × [1 + (−0,27/100)·(−15−25)] = 553,9 V", () => {
    // 41,5 · [1 + (-0,0027)·(-40)] = 41,5 · 1,108 = 45,982; ×12 = 551,78
    const r = obliczStringPV(string());
    expect(r.wartosci!.VocZimny_V).toBeCloseTo(551.78, 1);
  });

  it("napięcie w zimnie z wystarczającym zapasem daje warunek spełniony", () => {
    // domyślne 600 V daje zapas tylko ~8% (graniczny) — tu sprawdzamy prawdziwe „spełniony"
    const r = obliczStringPV(string({ falownikVocMax_V: 700 }));
    expect(r.ocena!.verdict).toBe("spelniony");
  });

  it("napięcie w zimnie z zapasem poniżej 10% jest GRANICZNE, nie „spełnione”", () => {
    const r = obliczStringPV(string());
    expect(r.ocena!.verdict).toBe("graniczny");
  });

  it("za dużo modułów w szeregu przekracza Voc max falownika — błąd KRYTYCZNY, nie ostrzeżenie", () => {
    const r = obliczStringPV(string({ liczbaModulowSzeregowo: 14 }));
    expect(r.ocena!.verdict).toBe("niespelniony");
    expect(r.ocena!.komunikat).toMatch(/zniszczenia falownika/);
  });

  it("dodatni współczynnik temperaturowy to błąd danych (powinien być ujemny)", () => {
    const r = obliczStringPV(string({ betaNapiecia_pct_na_C: 0.27 }));
    expect(r.bledy.map((b) => b.code)).toContain("BETA_DODATNIE");
  });
});

describe("string PV — dolna granica MPPT w upale (opcjonalne)", () => {
  it("bez temperatury maksymalnej sprawdzenie jest pominięte, nie zgadywane", () => {
    const r = obliczStringPV(string());
    expect(r.wartosci!.VmppGoracy_V).toBeNull();
    expect(r.zalozenia.join(" ")).toMatch(/Nie sprawdzono dolnej granicy/);
  });

  it("zbyt krótki string w upale spada poniżej minimum MPPT", () => {
    const r = obliczStringPV(string({ liczbaModulowSzeregowo: 6, tempMax_C: 70, falownikMpptMin_V: 200 }));
    // Vmpp(70) = 34,5·[1+(-0,0027)·45] = 34,5·0,8785 = 30,31; ×6 = 181,9 V < 200 V
    expect(r.wartosci!.VmppGoracy_V!).toBeCloseTo(181.9, 0);
    expect(r.ocena!.verdict).toBe("niespelniony");
    expect(r.ocena!.komunikat).toMatch(/zakresu MPPT/);
  });

  it("string wystarczająco długi mieści się w zakresie MPPT", () => {
    // falownikVocMax podniesiony, żeby werdykt zależał TYLKO od sprawdzenia MPPT,
    // nie od granicznego zapasu na Voc (patrz test wyżej z domyślnym 600 V)
    const r = obliczStringPV(string({ tempMax_C: 70, falownikMpptMin_V: 200, falownikVocMax_V: 700 }));
    expect(r.wartosci!.VmppGoracy_V!).toBeGreaterThan(200);
    expect(r.ocena!.verdict).toBe("spelniony");
  });
});

describe("string PV — spadek napięcia DC", () => {
  it("liczy się czystym wzorem rezystancyjnym (bez reaktancji)", () => {
    const r = obliczStringPV(string());
    // γ (annexG, Cu) = 56/1,25 = 44,8; ΔU = 2·9,9·15/(44,8·6) = 1,105 V
    expect(r.wartosci!.spadekDC_V).toBeCloseTo(1.105, 2);
  });

  it("bez Impp używa Isc — zawyża wynik na bezpieczną stronę, i mówi o tym", () => {
    const zImpp = obliczStringPV(string());
    const bezImpp = obliczStringPV(string({ Impp_A: undefined }));
    expect(bezImpp.wartosci!.spadekDC_V).toBeGreaterThan(zImpp.wartosci!.spadekDC_V);
    expect(bezImpp.zalozenia.join(" ")).toMatch(/ZAWYŻA/);
  });

  it("przekroczony limit spadku DC to warunek niespełniony", () => {
    const r = obliczStringPV(string({ dlugoscDC_m: 80 }));
    expect(r.ocena!.verdict).toBe("niespelniony");
    expect(r.ocena!.komunikat).toMatch(/Spadek napięcia DC/);
  });
});

describe("string PV — walidacja i strona AC", () => {
  it("brakujące dane wejściowe kończą się błędem", () => {
    expect(obliczStringPV(string({ Isc_A: 0 })).bledy.map((b) => b.code)).toContain("ISC");
    expect(obliczStringPV(string({ liczbaModulowSzeregowo: 0 })).bledy.map((b) => b.code)).toContain("LICZBA_MODULOW");
  });

  it("strona AC korzysta wprost z sizeCircuit — ten sam silnik co reszta aplikacji", () => {
    const r = dobierzPrzewodACFalownika({
      mocAC_W: 5000,
      liczba_faz: "1",
      cos_phi: 1,
      dlugosc_m: 10,
      sposob_ulozenia: "w_scianie",
    });
    expect(r.przekroj_mm2).not.toBeNull();
    expect(r.aparat).not.toBeNull();
  });
});
