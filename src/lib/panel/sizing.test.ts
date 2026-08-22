import { describe, expect, it } from "vitest";
import { baseAmpacity, groupingFactor, temperatureFactor } from "./norms";
import { currentFromPower, sizeCircuit, sizeFeeder, voltageDropPct, zsMaxForBreaker, type CircuitSpec } from "./sizing";

/**
 * Testy doboru sprawdzają LICZBY, nie tylko kształt odpowiedzi — bo cała wartość
 * tego modułu polega na tym, że wynik da się odtworzyć z tablicą normy w ręku.
 * Każde oczekiwanie ma obok rachunek, z którego wyszło.
 */

/** Obwód wzorcowy — pojedyncze pola nadpisujemy w konkretnych testach. */
function spec(over: Partial<CircuitSpec> = {}): CircuitSpec {
  return {
    id: "c1",
    nazwa: "Obwód testowy",
    typ: "oswietlenie",
    liczba_faz: "1",
    sposob_ulozenia: "w_scianie", // metoda B2
    ...over,
  };
}

describe("tablice normatywne", () => {
  it("obciążalność 3 żył obciążonych jest niższa niż 2 — obwód 3F grzeje się mocniej", () => {
    expect(baseAmpacity(2.5, "B2", 2)).toBe(23);
    expect(baseAmpacity(2.5, "B2", 3)).toBe(20);
  });

  it("interpoluje współczynnik temperaturowy między wierszami tablicy", () => {
    expect(temperatureFactor(30)).toBe(1);
    expect(temperatureFactor(45)).toBeCloseTo(0.79, 5);
    // 28 °C leży między 25 (1,06) i 30 (1,00): 1,06 + 0,6·(1,00−1,06) = 1,024
    expect(temperatureFactor(28)).toBeCloseTo(1.024, 5);
  });

  it("poza zakresem tablicy trzyma się wartości skrajnej, nie ekstrapoluje", () => {
    expect(temperatureFactor(-20)).toBe(1.22);
    expect(temperatureFactor(200)).toBe(0.5);
  });

  it("współczynnik grupowania schodzi schodkowo, a nie liniowo", () => {
    expect(groupingFactor(1)).toBe(1);
    expect(groupingFactor(6)).toBe(0.57);
    // dla 10 obwodów obowiązuje wiersz „9", bo następny w tablicy to dopiero 12
    expect(groupingFactor(10)).toBe(0.5);
  });
});

describe("sizeCircuit — obwody typowe", () => {
  it("oświetlenie 800 W na 15 m → 1,5 mm² i B10", () => {
    // Ib = 800/(230·0,95) = 3,66 A; Iz(1,5; B2; 2 żyły) = 16,5 A
    // ΔU = (2·15·3,66·0,0225)/1,5 = 1,65 V = 0,72% ≤ 3%
    const r = sizeCircuit(spec({ moc_W: 800, dlugosc_m: 15 }));
    expect(r.status).toBe("ok");
    expect(r.Ib_A).toBeCloseTo(3.66, 1);
    expect(r.przekroj_mm2).toBe(1.5);
    expect(r.kabel).toBe("YDYp 3x1,5 mm²");
    expect(r.aparat).toEqual({ charakterystyka: "B", In_A: 10, bieguny: "1P+N" });
    expect(r.spadek_napiecia_pct).toBeCloseTo(0.72, 1);
    expect(r.ostrzezenia).toEqual([]);
  });

  it("gniazda 2000 W na 20 m → 2,5 mm² i B16", () => {
    // Ib = 2000/230 = 8,70 A; Iz(2,5; B2) = 23 A; ΔU = 1,36% ≤ 5%
    const r = sizeCircuit(spec({ typ: "gniazda", moc_W: 2000, dlugosc_m: 20 }));
    expect(r.status).toBe("ok");
    expect(r.przekroj_mm2).toBe(2.5);
    expect(r.aparat?.In_A).toBe(16);
    expect(r.spadek_napiecia_pct).toBeCloseTo(1.36, 1);
  });

  it("mały pobór nie zaniża zabezpieczenia poniżej typowego dla rodzaju obwodu", () => {
    // 2 lampki LED po 8 W: Ib = 0,07 A. Gdyby dobierać „pod prąd", wyszłoby B6 —
    // obwód wymiaruje się pod docelową obsadę, więc ma być B10.
    const r = sizeCircuit(spec({ moc_W: 16, dlugosc_m: 10 }));
    expect(r.aparat?.In_A).toBe(10);
    expect(r.przekroj_mm2).toBe(1.5);
  });

  it("płyta indukcyjna 3F 7,4 kW → 5×2,5 mm² i zabezpieczenie 3-biegunowe", () => {
    // Ib = 7400/(√3·400) = 10,68 A; Iz(2,5; B2; 3 żyły) = 20 A
    const r = sizeCircuit(
      spec({ typ: "dedykowany", nazwa: "Płyta indukcyjna", liczba_faz: "3", moc_W: 7400, dlugosc_m: 10 })
    );
    expect(r.status).toBe("ok");
    expect(r.Ib_A).toBeCloseTo(10.68, 1);
    expect(r.przekroj_mm2).toBe(2.5);
    expect(r.kabel).toBe("YDYp 5x2,5 mm²");
    expect(r.aparat?.bieguny).toBe("3P+N");
    expect(r.aparat?.In_A).toBe(16);
  });

  it("warunek zwarciowy: Zs max = U0 / (k · In), krotność wg charakterystyki", () => {
    const b = sizeCircuit(spec({ moc_W: 800, dlugosc_m: 10 }));
    expect(b.Ia_A).toBe(50); // B10 → 5 × 10 A
    expect(b.Zs_max_Ohm).toBeCloseTo(230 / 50, 3);

    const c = sizeCircuit(spec({ typ: "gniazda", moc_W: 800, dlugosc_m: 10, rozruch_silnikowy: true }));
    expect(c.aparat?.charakterystyka).toBe("C");
    expect(c.Ia_A).toBe(160); // C16 → 10 × 16 A
    expect(c.Zs_max_Ohm).toBeCloseTo(230 / 160, 3);
  });
});

describe("sizeCircuit — spadek napięcia decyduje o przekroju", () => {
  it("długa trasa podnosi przekrój ponad wynikający z samej obciążalności", () => {
    // 800 W na 80 m: przy 1,5 mm² ΔU = 3,82% > 3%, przy 2,5 mm² = 2,29% ≤ 3%
    const r = sizeCircuit(spec({ moc_W: 800, dlugosc_m: 80 }));
    expect(r.przekroj_mm2).toBe(2.5);
    expect(r.aparat?.In_A).toBe(10); // zabezpieczenie się NIE zmienia, tylko przewód
    expect(r.spadek_napiecia_pct).toBeLessThanOrEqual(3);
    expect(r.status).toBe("warn");
    expect(r.ostrzezenia.map((w) => w.code)).toContain("PRZEKROJ_PODNIESIONY_SPADEK");
  });

  it("oświetlenie ma ostrzejszy limit spadku (3%) niż gniazda (5%)", () => {
    expect(sizeCircuit(spec({ moc_W: 800, dlugosc_m: 10 })).spadek_napiecia_limit_pct).toBe(3);
    expect(sizeCircuit(spec({ typ: "gniazda", moc_W: 800, dlugosc_m: 10 })).spadek_napiecia_limit_pct).toBe(5);
  });

  it("trasa nie do uratowania żadnym przekrojem kończy się błędem, nie cichym doborem", () => {
    const r = sizeCircuit(spec({ typ: "gniazda", moc_W: 3000, dlugosc_m: 600 }));
    expect(r.status).toBe("error");
    expect(r.przekroj_mm2).toBeNull();
    expect(r.ostrzezenia.map((w) => w.code)).toContain("SPADEK_NAPIECIA_NIE_DO_SPELNIENIA");
  });

  it("spadek 3-fazowy liczony międzyfazowo jest niższy niż 1-fazowy przy tym samym prądzie", () => {
    const jedno = voltageDropPct(30, 10, 2.5, "1");
    const trzy = voltageDropPct(30, 10, 2.5, "3");
    expect(trzy).toBeLessThan(jedno);
    // (√3·30·10·0,0225)/2,5 = 4,68 V na 400 V = 1,17%
    expect(trzy).toBeCloseTo(1.17, 1);
  });
});

describe("sizeCircuit — współczynniki poprawkowe", () => {
  it("wysoka temperatura otoczenia obniża obciążalność i jest zgłaszana", () => {
    const r = sizeCircuit(spec({ moc_W: 800, dlugosc_m: 10, temperatura_otoczenia_C: 45 }));
    // Iz = 16,5 · 0,79 = 13,04 A — B10 nadal się mieści
    expect(r.Iz_A).toBeCloseTo(13.04, 1);
    expect(r.aparat?.In_A).toBe(10);
    expect(r.ostrzezenia.map((w) => w.code)).toContain("TEMPERATURA");
  });

  it("grupowanie obwodów w jednej wiązce potrafi wymusić grubszy przewód", () => {
    // k2 = 0,57 → Iz(1,5) = 9,41 A < 10 A, więc B10 nie mieści się na 1,5 mm²
    const r = sizeCircuit(spec({ moc_W: 800, dlugosc_m: 10, obwodow_w_wiazce: 6 }));
    expect(r.przekroj_mm2).toBe(2.5);
    expect(r.aparat?.In_A).toBe(10);
    expect(r.ostrzezenia.map((w) => w.code)).toContain("GRUPOWANIE");
  });

  it("współczynniki są raportowane, żeby dało się odtworzyć rachunek", () => {
    const r = sizeCircuit(spec({ moc_W: 800, dlugosc_m: 10, temperatura_otoczenia_C: 40, obwodow_w_wiazce: 3 }));
    expect(r.wspolczynniki.k1_temperatura).toBeCloseTo(0.87, 3);
    expect(r.wspolczynniki.k2_grupowanie).toBe(0.7);
  });
});

describe("sizeCircuit — braki danych dają ostrzeżenie, nie zgadywanie", () => {
  it("bez mocy i bez prądu nie dobiera niczego", () => {
    const r = sizeCircuit(spec({ dlugosc_m: 10 }));
    expect(r.status).toBe("error");
    expect(r.przekroj_mm2).toBeNull();
    expect(r.aparat).toBeNull();
    expect(r.ostrzezenia.map((w) => w.code)).toContain("BRAK_MOCY");
  });

  it("bez długości dobiera pod obciążalność, ale mówi, że spadku nie sprawdzono", () => {
    const r = sizeCircuit(spec({ moc_W: 800 }));
    expect(r.przekroj_mm2).toBe(1.5);
    expect(r.spadek_napiecia_pct).toBeNull();
    expect(r.status).toBe("warn");
    expect(r.ostrzezenia.map((w) => w.code)).toContain("BRAK_DLUGOSCI");
  });

  it("prąd podany wprost ma pierwszeństwo przed mocą", () => {
    const r = sizeCircuit(spec({ typ: "gniazda", moc_W: 100, prad_A: 18, dlugosc_m: 10 }));
    expect(r.Ib_A).toBe(18);
    expect(r.aparat?.In_A).toBe(20); // 16 A < Ib, więc następny stopień
  });
});

describe("sizeCircuit — dobór typu RCD", () => {
  it("domyślnie typ A", () => {
    expect(sizeCircuit(spec({ typ: "gniazda", moc_W: 2000, dlugosc_m: 10 })).rcd_typ).toBe("A");
  });

  it("ładowarka EV dostaje typ B (możliwy prąd gładkostały)", () => {
    const r = sizeCircuit(spec({ typ: "dedykowany", nazwa: "Ładowarka EV — garaż", moc_W: 7400, liczba_faz: "3", dlugosc_m: 12 }));
    expect(r.rcd_typ).toBe("B");
  });
});

describe("niezmienniki normy", () => {
  const cases: CircuitSpec[] = [
    spec({ moc_W: 500, dlugosc_m: 12 }),
    spec({ typ: "gniazda", moc_W: 2500, dlugosc_m: 25 }),
    spec({ typ: "dedykowany", moc_W: 3500, dlugosc_m: 8 }),
    spec({ typ: "dedykowany", liczba_faz: "3", moc_W: 7400, dlugosc_m: 15 }),
    spec({ typ: "gniazda", moc_W: 2000, dlugosc_m: 30, temperatura_otoczenia_C: 40, obwodow_w_wiazce: 4 }),
  ];

  it("dla każdego poprawnie dobranego obwodu zachodzi Ib ≤ In ≤ Iz", () => {
    for (const s of cases) {
      const r = sizeCircuit(s);
      expect(r.status, `${r.nazwa}: ${r.ostrzezenia.map((w) => w.message).join("; ")}`).not.toBe("error");
      expect(r.Ib_A!).toBeLessThanOrEqual(r.aparat!.In_A);
      expect(r.aparat!.In_A).toBeLessThanOrEqual(r.Iz_A!);
    }
  });

  it("spadek napięcia nigdy nie przekracza limitu dla swojego rodzaju obwodu", () => {
    for (const s of cases) {
      const r = sizeCircuit(s);
      if (r.spadek_napiecia_pct !== null) {
        expect(r.spadek_napiecia_pct).toBeLessThanOrEqual(r.spadek_napiecia_limit_pct);
      }
    }
  });

  it("prąd z mocy: 1F i 3F liczone różnymi wzorami", () => {
    expect(currentFromPower(2300, "1", 1)).toBeCloseTo(10, 5);
    expect(currentFromPower(2300, "3", 1)).toBeCloseTo(2300 / (Math.sqrt(3) * 400), 5);
  });
});

describe("zsMaxForBreaker", () => {
  it("B16: Ia=80A, Zs max=2,88Ω", () => {
    const r = zsMaxForBreaker("B", 16);
    expect(r.ia).toBe(80);
    expect(r.zsMax).toBeCloseTo(2.875, 2);
  });

  it("C16: Ia=160A, Zs max=1,44Ω", () => {
    const r = zsMaxForBreaker("C", 16);
    expect(r.ia).toBe(160);
    expect(r.zsMax).toBeCloseTo(1.4375, 2);
  });

  it("nieznana charakterystyka -> domyślnie k=5 (jak B)", () => {
    expect(zsMaxForBreaker("X", 16).ia).toBe(80);
  });
});

describe("sizeFeeder — WLZ (linia zasilająca)", () => {
  it("prąd zapotrzebowania z bilansu mocy (16,17 A, 3F) na 15 m -> minimalne 10 mm², In dobrany nad Ib (20 A)", () => {
    // Ib = 11 200 W / (√3·400) ≈ 16,17 A — ten sam scenariusz co „Bilans mocy"
    // w electrical.test.ts (6000+7000+3000 W, ks=0,7). Na 15 m spadek napięcia
    // nawet przy minimalnym przekroju WLZ jest znikomy: ΔU(10 mm²) =
    // (√3·15·16,17·0,0225)/10 / 400 · 100 ≈ 0,24% — więc o przekroju decyduje
    // tu wyłącznie minimum WLZ (10 mm²), nie spadek napięcia.
    const ib = 11200 / (Math.sqrt(3) * 400);
    const r = sizeFeeder({ prad_A: ib, liczba_faz: "3", dlugosc_m: 15, sposob_ulozenia: "w_scianie" });
    expect(r.przekroj_mm2).toBe(10);
    expect(r.kabel).toBe("YDYp 5x10 mm²");
    // 16,17 A mieści się między szczeblami 16 A i 20 A -> pierwszy STOPIEŃ NAD Ib
    expect(r.aparat).toEqual({ charakterystyka: "B", In_A: 20, bieguny: "3P+N" });
    expect(r.spadek_napiecia_pct).toBeLessThanOrEqual(2);
    expect(r.status).toBe("ok");
  });

  it("dłuższa trasa (150 m) wymusza grubszy przekrój niż wynikałoby z samej obciążalności", () => {
    // Ten sam prąd co wyżej, ale przy 150 m ΔU(10 mm²) ≈ 2,36% > 2% (limit WLZ)
    // — przekrój musi wzrosnąć do 16 mm² (ΔU ≈ 1,48%), mimo że obciążalność
    // samego 10 mm² wciąż by wystarczyła.
    const ib = 11200 / (Math.sqrt(3) * 400);
    const r = sizeFeeder({ prad_A: ib, liczba_faz: "3", dlugosc_m: 150, sposob_ulozenia: "w_scianie" });
    expect(r.przekroj_mm2).toBe(16);
    expect(r.spadek_napiecia_pct).toBeLessThanOrEqual(2);
    expect(r.status).toBe("ok");
  });

  it("nigdy nie schodzi poniżej minimalnego przekroju WLZ (10 mm²), nawet przy małym poborze", () => {
    const r = sizeFeeder({ prad_A: 5, liczba_faz: "1", sposob_ulozenia: "w_scianie" });
    expect(r.przekroj_mm2).toBe(10);
    expect(r.aparat?.In_A).toBe(6);
    // bez długości trasy spadek napięcia nie jest sprawdzany
    expect(r.ostrzezenia.map((w) => w.code)).toContain("BRAK_DLUGOSCI");
    expect(r.status).toBe("warn");
  });

  it("bez podanego prądu zwraca błąd, nie zgaduje", () => {
    const r = sizeFeeder({ prad_A: 0, liczba_faz: "3", sposob_ulozenia: "w_scianie" });
    expect(r.status).toBe("error");
    expect(r.przekroj_mm2).toBeNull();
    expect(r.ostrzezenia.map((w) => w.code)).toContain("BRAK_PRADU");
  });

  it("prąd przekraczający obciążalność największego przekroju (25 mm²) kończy się błędem", () => {
    const r = sizeFeeder({ prad_A: 200, liczba_faz: "3", sposob_ulozenia: "w_scianie" });
    expect(r.status).toBe("error");
    expect(r.przekroj_mm2).toBeNull();
    expect(r.ostrzezenia.map((w) => w.code)).toContain("PRZEKROJ_NIE_DO_DOBRANIA");
  });

  it("trasa za długa na jakikolwiek przekrój kończy się błędem spadku napięcia, nie cichym doborem", () => {
    const r = sizeFeeder({ prad_A: 15, liczba_faz: "1", dlugosc_m: 500, sposob_ulozenia: "w_scianie" });
    expect(r.status).toBe("error");
    expect(r.przekroj_mm2).toBeNull();
    expect(r.ostrzezenia.map((w) => w.code)).toContain("SPADEK_NAPIECIA_NIE_DO_SPELNIENIA");
  });

  it("grupowanie i temperatura otoczenia obniżają obciążalność i są zgłaszane", () => {
    const grouped = sizeFeeder({ prad_A: 30, liczba_faz: "3", dlugosc_m: 10, sposob_ulozenia: "w_scianie", obwodow_w_wiazce: 6 });
    expect(grouped.przekroj_mm2).toBe(16); // 10 mm² nie udźwignie 30 A po k2=0,57
    expect(grouped.ostrzezenia.map((w) => w.code)).toContain("GRUPOWANIE");

    const hot = sizeFeeder({ prad_A: 15, liczba_faz: "1", dlugosc_m: 10, sposob_ulozenia: "w_scianie", temperatura_otoczenia_C: 45 });
    expect(hot.ostrzezenia.map((w) => w.code)).toContain("TEMPERATURA");
  });

  it("domyślny limit spadku to 2%, ale da się go nadpisać", () => {
    const domyslny = sizeFeeder({ prad_A: 15, liczba_faz: "3", sposob_ulozenia: "w_scianie" });
    expect(domyslny.spadek_napiecia_limit_pct).toBe(2);

    const nadpisany = sizeFeeder({ prad_A: 15, liczba_faz: "3", sposob_ulozenia: "w_scianie", limit_spadku_pct: 1.5 });
    expect(nadpisany.spadek_napiecia_limit_pct).toBe(1.5);
  });
});
