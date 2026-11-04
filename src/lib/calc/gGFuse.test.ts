import { describe, expect, it } from "vitest";
import { dobierzWkladkeGGOchrona, type WkladkaGGWejscie } from "./gGFuse";

function wejscie(over: Partial<WkladkaGGWejscie> = {}): WkladkaGGWejscie {
  return { typ: "D0gG", Ib_A: 16, uklad: "TN", obwodOdbiorczy: true, ...over };
}

describe("dobierzWkladkeGGOchrona", () => {
  it("dobiera wkładkę i podaje Imax/Zs max dla czasu TN-odbiorczego (0,4s)", () => {
    const r = dobierzWkladkeGGOchrona(wejscie());
    expect(r.bledy).toEqual([]);
    expect(r.wartosci!.In_A).toBe(16);
    expect(r.wartosci!.czas_s).toBe(0.4);
    expect(r.wartosci!.Imax_A).toBe(120.0);
    // Cmin·U₀/Imax = 0,95·230/120 — ta sama miara co dla wyłączników (audyt, B8)
    expect(r.wartosci!.ZsMax_ohm).toBeCloseTo(1.821, 3);
    expect(r.ocena).toBeNull();
  });

  it("TN-rozdzielczy używa czasu 5s", () => {
    const r = dobierzWkladkeGGOchrona(wejscie({ obwodOdbiorczy: false }));
    expect(r.wartosci!.czas_s).toBe(5);
    expect(r.wartosci!.Imax_A).toBe(70.4);
  });

  it("TT-odbiorczy używa czasu 0,2s", () => {
    const r = dobierzWkladkeGGOchrona(wejscie({ uklad: "TT", obwodOdbiorczy: true }));
    expect(r.wartosci!.czas_s).toBe(0.2);
    expect(r.wartosci!.Imax_A).toBe(132.8);
  });

  it("TT-rozdzielczy (1s) nie ma pokrycia w tablicy — błąd, nie interpolacja", () => {
    const r = dobierzWkladkeGGOchrona(wejscie({ uklad: "TT", obwodOdbiorczy: false }));
    expect(r.wartosci).toBeNull();
    expect(r.bledy.map((b) => b.code)).toContain("CZAS_BRAK_W_TABLICY");
  });

  it("prąd poza zakresem tablicy zwraca błąd", () => {
    const r = dobierzWkladkeGGOchrona(wejscie({ Ib_A: 10000 }));
    expect(r.wartosci).toBeNull();
    expect(r.bledy.map((b) => b.code)).toContain("IN_POZA_ZAKRESEM");
  });

  it("D0gG i WT00gG/WT1gG dają różny Zs max dla tego samego In i czasu", () => {
    const d0 = dobierzWkladkeGGOchrona(wejscie({ typ: "D0gG" }));
    const wt = dobierzWkladkeGGOchrona(wejscie({ typ: "WT00gG_WT1gG" }));
    expect(d0.wartosci!.ZsMax_ohm).not.toBe(wt.wartosci!.ZsMax_ohm);
  });

  it("ocenia warunek ochronny, gdy podano zmierzoną Zs — spełniony z zapasem", () => {
    const r = dobierzWkladkeGGOchrona(wejscie({ zmierzonaZs_ohm: 1.0 }));
    expect(r.ocena!.verdict).toBe("spelniony");
  });

  it("ocenia warunek ochronny — niespełniony, gdy Zs przekracza Zs max", () => {
    const r = dobierzWkladkeGGOchrona(wejscie({ zmierzonaZs_ohm: 3.0 }));
    expect(r.ocena!.verdict).toBe("niespelniony");
  });

  it("walidacja: Ib i Zs muszą być dodatnie", () => {
    expect(dobierzWkladkeGGOchrona(wejscie({ Ib_A: 0 })).bledy.map((b) => b.code)).toContain("IB");
    expect(dobierzWkladkeGGOchrona(wejscie({ zmierzonaZs_ohm: -1 })).bledy.map((b) => b.code)).toContain("ZS");
  });

  it("zwraca kroki i źródła", () => {
    const r = dobierzWkladkeGGOchrona(wejscie());
    expect(r.kroki.length).toBeGreaterThan(0);
    expect(r.zrodla.some((z) => z.norma.includes("Poradnik"))).toBe(true);
    expect(r.zrodla.some((z) => z.norma.includes("60364-4-41"))).toBe(true);
  });
});

describe("dobierzWkladkeGGOchrona — warunek przeciążeniowy I₂ ≤ 1,45·Iz (audyt 2026-11-04, B9)", () => {
  it("bez Iz warunek nie jest sprawdzany i wynik to mówi, podając wymagane Iz", () => {
    const r = dobierzWkladkeGGOchrona(wejscie());
    expect(r.zalozenia.join(" ")).toMatch(/I₂ ≤ 1,45·Iz NIE został sprawdzony/);
    expect(r.zalozenia.join(" ")).toMatch(/Iz ≥ 17,7 A/); // 25,6 / 1,45
  });

  it("wkładka 25 A na przewodzie Iz 24 A nie przechodzi: 40 A > 1,45·24 = 34,8 A", () => {
    const r = dobierzWkladkeGGOchrona(wejscie({ Ib_A: 25, Iz_A: 24 }));
    expect(r.wartosci!.In_A).toBe(25);
    expect(r.ocena!.verdict).toBe("niespelniony");
    expect(r.ocena!.komunikat).toMatch(/przewód o większej obciążalności/);
  });

  it("wkładka 16 A na 2,5 mm² (Iz 23 A) przechodzi: 25,6 A ≤ 33,35 A", () => {
    const r = dobierzWkladkeGGOchrona(wejscie({ Iz_A: 23 }));
    expect(r.ocena!.verdict).toBe("spelniony");
  });

  it("dwa warunki naraz — decyduje gorszy", () => {
    const r = dobierzWkladkeGGOchrona(wejscie({ Iz_A: 23, zmierzonaZs_ohm: 3.0 }));
    expect(r.ocena!.verdict).toBe("niespelniony");
    expect(r.ocena!.komunikat).toMatch(/Impedancja pętli/);
  });

  it("Iz ≤ 0 to błąd danych", () => {
    expect(dobierzWkladkeGGOchrona(wejscie({ Iz_A: 0 })).bledy.map((b) => b.code)).toContain("IZ");
  });
});
