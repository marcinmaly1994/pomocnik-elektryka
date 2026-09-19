import { describe, it, expect } from "vitest";
import { dobierzPE, dobierzN, PROG_H3_N_ROWNY_FAZIE_PCT } from "./protectiveConductor";

/**
 * Dobór przewodu ochronnego PE i neutralnego N.
 *
 * Sedno modułu — i powód, dla którego warto go testować osobno od interfejsu — jest
 * takie: reguła tabelaryczna („PE = połowa fazowego") NIE gwarantuje wytrzymałości
 * zwarciowej cieplnej. Przy dużym prądzie zwarcia i wolnym zabezpieczeniu decyduje
 * warunek S ≥ I·√t / k, a PE dobrany z samej tabeli spali się, zanim zabezpieczenie
 * zadziała. Testy sprawdzają oba kryteria osobno i to, że wygrywa ostrzejsze.
 *
 * Kotwice liczbowe policzone ręcznie ze wzorów normy, nie odczytane z kodu.
 */

const CU_PVC = { material: "Cu" as const, izolacja: "PVC" as const };

describe("dobierzPE — reguła tabelaryczna", () => {
  it("do 16 mm² PE równy fazowemu", () => {
    expect(dobierzPE({ przekrojFazowy_mm2: 10, ...CU_PVC }).wartosci!.zReguly_mm2).toBe(10);
    expect(dobierzPE({ przekrojFazowy_mm2: 16, ...CU_PVC }).wartosci!.zReguly_mm2).toBe(16);
  });

  it("od 16 do 35 mm² PE wynosi 16 mm²", () => {
    expect(dobierzPE({ przekrojFazowy_mm2: 25, ...CU_PVC }).wartosci!.zReguly_mm2).toBe(16);
    expect(dobierzPE({ przekrojFazowy_mm2: 35, ...CU_PVC }).wartosci!.zReguly_mm2).toBe(16);
  });

  it("powyżej 35 mm² PE to połowa fazowego", () => {
    expect(dobierzPE({ przekrojFazowy_mm2: 50, ...CU_PVC }).wartosci!.zReguly_mm2).toBe(25);
    expect(dobierzPE({ przekrojFazowy_mm2: 120, ...CU_PVC }).wartosci!.zReguly_mm2).toBe(60);
  });

  it("wynik zaokrągla się W GÓRĘ do przekroju z szeregu handlowego", () => {
    // Połowa ze 120 to 60 mm² — takiego przekroju NIE MA w szeregu, więc wymagany
    // jest 70. Zaokrąglenie w dół dałoby przewód cieńszy, niż wymaga norma.
    const r = dobierzPE({ przekrojFazowy_mm2: 120, ...CU_PVC }).wartosci!;
    expect(r.zReguly_mm2).toBe(60);
    expect(r.wymagany_mm2).toBe(70);
  });

  it("bez danych zwarciowych decyduje sama reguła", () => {
    const r = dobierzPE({ przekrojFazowy_mm2: 50, ...CU_PVC }).wartosci!;
    expect(r.zWarunkuCieplnego_mm2).toBeNull();
    expect(r.decyduje).toBe("reguła tabelaryczna");
    expect(r.wymagany_mm2).toBe(25);
  });
});

describe("dobierzPE — wytrzymałość zwarciowa cieplna", () => {
  it("liczy S = I·√t / k zgodnie z ręcznym rachunkiem", () => {
    // k dla Cu/PVC = 115. S = 3000 · √0,4 / 115 = 3000 · 0,63246 / 115 = 16,499 mm²
    const r = dobierzPE({ przekrojFazowy_mm2: 35, ...CU_PVC, pradZwarciowy_A: 3000, czasWylaczenia_s: 0.4 }).wartosci!;

    expect(r.k).toBe(115);
    expect(r.zWarunkuCieplnego_mm2).toBeCloseTo(16.499, 2);
  });

  it("warunek cieplny WYGRYWA z regułą, gdy jest ostrzejszy", () => {
    // To jest cała racja bytu tego kalkulatora: reguła mówi 16 mm², a warunek
    // cieplny 16,5 mm². PE dobrany z samej tabeli byłby za cienki.
    const r = dobierzPE({ przekrojFazowy_mm2: 35, ...CU_PVC, pradZwarciowy_A: 3000, czasWylaczenia_s: 0.4 }).wartosci!;

    expect(r.zReguly_mm2).toBe(16);
    expect(r.decyduje).toBe("wytrzymałość zwarciowa cieplna");
    expect(r.wymagany_mm2).toBe(25);
  });

  it("mały prąd zwarciowy zostawia decyzję regule", () => {
    const r = dobierzPE({ przekrojFazowy_mm2: 35, ...CU_PVC, pradZwarciowy_A: 500, czasWylaczenia_s: 0.2 }).wartosci!;
    // 500 · 0,4472 / 115 = 1,94 mm² — dużo mniej niż 16 z reguły.
    expect(r.zWarunkuCieplnego_mm2).toBeCloseTo(1.944, 2);
    expect(r.decyduje).toBe("reguła tabelaryczna");
  });

  it("izolacja i materiał zmieniają k, a więc i wymagany przekrój", () => {
    const wspolne = { przekrojFazowy_mm2: 35, pradZwarciowy_A: 3000, czasWylaczenia_s: 0.4 };
    const cuPvc = dobierzPE({ ...wspolne, material: "Cu", izolacja: "PVC" }).wartosci!;
    const cuXlpe = dobierzPE({ ...wspolne, material: "Cu", izolacja: "XLPE" }).wartosci!;
    const alPvc = dobierzPE({ ...wspolne, material: "Al", izolacja: "PVC" }).wartosci!;

    expect(cuPvc.k).toBe(115);
    expect(cuXlpe.k).toBe(143);
    expect(alPvc.k).toBe(76);
    // Wyższe k = większa dopuszczalna gęstość prądu = cieńszy przewód wystarczy.
    expect(cuXlpe.zWarunkuCieplnego_mm2!).toBeLessThan(cuPvc.zWarunkuCieplnego_mm2!);
    // Aluminium znosi mniej, więc potrzebuje grubszego przewodu niż miedź.
    expect(alPvc.zWarunkuCieplnego_mm2!).toBeGreaterThan(cuPvc.zWarunkuCieplnego_mm2!);
  });

  it("odrzuca czas wyłączenia powyżej 5 s, bo wzór adiabatyczny tam nie obowiązuje", () => {
    // Powyżej 5 s przewód zdąży oddać część ciepła i wzór zawyża temperaturę —
    // wynik byłby liczbą bez pokrycia w normie.
    const r = dobierzPE({ przekrojFazowy_mm2: 35, ...CU_PVC, pradZwarciowy_A: 3000, czasWylaczenia_s: 6 });
    expect(r.bledy.map((b) => b.code)).toContain("CZAS_POZA_ZAKRESEM");
    expect(r.wartosci).toBeNull();
  });

  it("odrzuca przekrój fazowy niedodatni", () => {
    expect(dobierzPE({ przekrojFazowy_mm2: 0, ...CU_PVC }).bledy.map((b) => b.code)).toContain("PRZEKROJ");
  });
});

describe("dobierzN", () => {
  it("liczy prąd w N jako potrojony udział 3. harmonicznej", () => {
    // I_N = 3 · 0,20 · 100 A = 60 A
    const r = dobierzN({ przekrojFazowy_mm2: 16, pradFazowy_A: 100, udzialH3_pct: 20 }).wartosci!;
    expect(r.IN_A).toBeCloseTo(60, 9);
    expect(r.Nprzeciazony).toBe(false);
    expect(r.zalecany_mm2).toBe(16);
  });

  it("powyżej jednej trzeciej udziału N jest obciążony bardziej niż faza", () => {
    // Próg wynika z arytmetyki, nie z tablicy: 3 · 1/3 = 1.
    const przy33 = dobierzN({ przekrojFazowy_mm2: 16, pradFazowy_A: 100, udzialH3_pct: PROG_H3_N_ROWNY_FAZIE_PCT }).wartosci!;
    const przy40 = dobierzN({ przekrojFazowy_mm2: 16, pradFazowy_A: 100, udzialH3_pct: 40 }).wartosci!;

    expect(przy33.Nprzeciazony).toBe(false);
    expect(przy40.IN_A).toBeCloseTo(120, 9);
    expect(przy40.Nprzeciazony).toBe(true);
  });

  it("przeciążony N dostaje grubszy przekrój z szeregu i werdykt negatywny", () => {
    // I_N/I_faz = 1,2, więc 16 · 1,2 = 19,2 mm² → najbliższy z szeregu w górę to 25.
    const r = dobierzN({ przekrojFazowy_mm2: 16, pradFazowy_A: 100, udzialH3_pct: 40 });

    expect(r.wartosci!.zalecany_mm2).toBe(25);
    expect(r.ocena!.verdict).toBe("niespelniony");
    expect(r.ocena!.komunikat).toMatch(/przekracza prąd fazowy/);
  });

  it("nie proponuje przekroju MNIEJSZEGO od fazowego, nawet przy zerowych harmonicznych", () => {
    // Redukcja N poniżej fazowego wymaga tablicy współczynników, której moduł nie ma.
    // Zgadywanie jej dałoby przewód cieńszy, niż ktokolwiek policzył.
    const r = dobierzN({ przekrojFazowy_mm2: 35, pradFazowy_A: 100, udzialH3_pct: 0 }).wartosci!;
    expect(r.IN_A).toBe(0);
    expect(r.zalecany_mm2).toBe(35);
  });

  it("odrzuca udział harmonicznej spoza zakresu 0–100% oraz wejścia niedodatnie", () => {
    const zaDuzo = dobierzN({ przekrojFazowy_mm2: 16, pradFazowy_A: 100, udzialH3_pct: 120 });
    const ujemny = dobierzN({ przekrojFazowy_mm2: 16, pradFazowy_A: 100, udzialH3_pct: -5 });
    const bezPradu = dobierzN({ przekrojFazowy_mm2: 16, pradFazowy_A: 0, udzialH3_pct: 20 });

    expect(zaDuzo.bledy.map((b) => b.code)).toContain("H3");
    expect(ujemny.bledy.map((b) => b.code)).toContain("H3");
    expect(bezPradu.bledy.map((b) => b.code)).toContain("PRAD");
  });
});
