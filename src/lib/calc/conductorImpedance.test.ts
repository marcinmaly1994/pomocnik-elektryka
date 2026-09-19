import { describe, it, expect } from "vitest";
import { obliczImpedancjePrzewodu, obliczPrzewodyRownolegle } from "./conductorImpedance";

/**
 * Impedancja przewodu i podział prądu między żyły równoległe.
 *
 * Moduł miał dotąd pokrycie WYŁĄCZNIE przez e2e kalkulatorów — czyli przez to, co da
 * się wyklikać w interfejsie. Tutaj sprawdzane są rzeczy, do których interfejs nie
 * daje dojść: zależności fizyczne (co ma się stać z wynikiem, gdy podwoić długość),
 * wartości policzone RĘCZNIE z normy oraz wejścia odrzucane jako bezsensowne.
 *
 * Kotwice liczbowe są wyliczone niezależnie od kodu, z wzorów normy. To celowe:
 * test, który porównuje wynik z tym, co funkcja akurat zwraca, zabetonowałby błąd
 * zamiast go znaleźć.
 */

const CU_PVC = { material: "Cu" as const, izolacja: "PVC" as const };

describe("obliczImpedancjePrzewodu", () => {
  it("liczy R, X i Z zgodnie z ręcznym rachunkiem wg normy", () => {
    // ρ₂₀(Cu) = 1/56 = 0,0178571 Ω·mm²/m
    // ρ₇₀ = 0,0178571 · [1 + 0,00393 · (70 − 20)] = 0,0178571 · 1,1965 = 0,0213661
    // R = ρ · L / S = 0,0213661 · 100 / 4 = 0,534153 Ω
    // X = 0,08 Ω/km · 0,1 km = 0,008 Ω
    // Z = √(0,534153² + 0,008²) = 0,534213 Ω
    const r = obliczImpedancjePrzewodu({ dlugosc_m: 100, przekroj_mm2: 4, ...CU_PVC });

    expect(r.bledy).toEqual([]);
    expect(r.wartosci!.tempZyly_C).toBe(70);
    expect(r.wartosci!.rho).toBeCloseTo(0.0213661, 6);
    expect(r.wartosci!.R_ohm).toBeCloseTo(0.534153, 5);
    expect(r.wartosci!.X_ohm).toBeCloseTo(0.008, 6);
    expect(r.wartosci!.Z_ohm).toBeCloseTo(0.534213, 5);
    expect(r.wartosci!.R_do_X).toBeCloseTo(0.534153 / 0.008, 2);
  });

  it("rezystancja rośnie wprost z długością, a maleje odwrotnie z przekrojem", () => {
    const bazowy = obliczImpedancjePrzewodu({ dlugosc_m: 50, przekroj_mm2: 2.5, ...CU_PVC }).wartosci!;
    const dluzszy = obliczImpedancjePrzewodu({ dlugosc_m: 100, przekroj_mm2: 2.5, ...CU_PVC }).wartosci!;
    const grubszy = obliczImpedancjePrzewodu({ dlugosc_m: 50, przekroj_mm2: 5, ...CU_PVC }).wartosci!;

    expect(dluzszy.R_ohm).toBeCloseTo(bazowy.R_ohm * 2, 9);
    expect(grubszy.R_ohm).toBeCloseTo(bazowy.R_ohm / 2, 9);
    // Reaktancja zależy od DŁUGOŚCI, nie od przekroju — grubszy przewód ma ją tę samą.
    expect(dluzszy.X_ohm).toBeCloseTo(bazowy.X_ohm * 2, 9);
    expect(grubszy.X_ohm).toBeCloseTo(bazowy.X_ohm, 9);
  });

  it("XLPE liczy się przy wyższej temperaturze żyły niż PVC, więc daje większą rezystancję", () => {
    const pvc = obliczImpedancjePrzewodu({ dlugosc_m: 100, przekroj_mm2: 4, material: "Cu", izolacja: "PVC" }).wartosci!;
    const xlpe = obliczImpedancjePrzewodu({ dlugosc_m: 100, przekroj_mm2: 4, material: "Cu", izolacja: "XLPE" }).wartosci!;

    expect(pvc.tempZyly_C).toBe(70);
    expect(xlpe.tempZyly_C).toBe(90);
    expect(xlpe.R_ohm).toBeGreaterThan(pvc.R_ohm);
  });

  it("aluminium ma większą rezystancję niż miedź w tych samych warunkach", () => {
    const cu = obliczImpedancjePrzewodu({ dlugosc_m: 100, przekroj_mm2: 16, material: "Cu", izolacja: "PVC" }).wartosci!;
    const al = obliczImpedancjePrzewodu({ dlugosc_m: 100, przekroj_mm2: 16, material: "Al", izolacja: "PVC" }).wartosci!;

    // γ: Cu 56, Al 35 — stosunek rezystancji w 20 °C to 56/35 = 1,6.
    expect(al.R_ohm).toBeGreaterThan(cu.R_ohm * 1.5);
  });

  it("podana wprost temperatura żyły ma pierwszeństwo nad domyślną dla izolacji", () => {
    const r = obliczImpedancjePrzewodu({ dlugosc_m: 100, przekroj_mm2: 4, ...CU_PVC, tempZyly_C: 20 }).wartosci!;
    expect(r.tempZyly_C).toBe(20);
    // W 20 °C rezystywność to dokładnie 1/56.
    expect(r.rho).toBeCloseTo(1 / 56, 9);
  });

  it("rodzaj linii zmienia reaktancję, bo zależy ona od rozstawu żył", () => {
    const kabel = obliczImpedancjePrzewodu({ dlugosc_m: 1000, przekroj_mm2: 16, ...CU_PVC }).wartosci!;
    const gola = obliczImpedancjePrzewodu({
      dlugosc_m: 1000,
      przekroj_mm2: 16,
      ...CU_PVC,
      rodzajLinii: "napowietrzna_gola",
    }).wartosci!;

    expect(kabel.X_ohm).toBeCloseTo(0.08, 6);
    expect(gola.X_ohm).toBeCloseTo(0.35, 6);
  });

  it("odrzuca długość i przekrój niedodatnie, zamiast zwracać nieskończoność", () => {
    // R = ρ·L/S przy S = 0 dałoby Infinity, a taki wynik wyglądałby na liczbę
    // i poszedłby dalej do doboru zabezpieczeń.
    const bezPrzekroju = obliczImpedancjePrzewodu({ dlugosc_m: 100, przekroj_mm2: 0, ...CU_PVC });
    const bezDlugosci = obliczImpedancjePrzewodu({ dlugosc_m: 0, przekroj_mm2: 4, ...CU_PVC });

    expect(bezPrzekroju.bledy.map((b) => b.code)).toContain("PRZEKROJ");
    expect(bezDlugosci.bledy.map((b) => b.code)).toContain("DLUGOSC");
    expect(bezPrzekroju.wartosci).toBeNull();
  });
});

describe("obliczPrzewodyRownolegle", () => {
  const WSPOLNE = { przekroj_mm2: 95, material: "Cu" as const, izolacja: "PVC" as const };

  it("równe długości dzielą prąd po równo", () => {
    const r = obliczPrzewodyRownolegle({ pradCalkowity_A: 300, dlugosci_m: [50, 50, 50], ...WSPOLNE });

    // `toBeCloseTo`, a nie `toEqual`: podział przez sumę konduktancji daje
    // 100.00000000000001 — arytmetyka zmiennoprzecinkowa, nie błąd rachunku.
    for (const I of r.wartosci!.prady_A) expect(I).toBeCloseTo(100, 9);
    expect(r.wartosci!.odchylenie_pct).toBeCloseTo(0, 9);
  });

  it("krótsza żyła bierze WIĘCEJ prądu — odwrotnie proporcjonalnie do długości", () => {
    // Konduktancje 1/50 i 1/100 mają się jak 2:1, więc prądy jak 2:1 → 200 A i 100 A.
    // To jest sedno całego kalkulatora: suma (300 A) mieści się w normie, a jedna
    // żyła prowadzi dwa razy tyle, co druga.
    const r = obliczPrzewodyRownolegle({ pradCalkowity_A: 300, dlugosci_m: [50, 100], ...WSPOLNE });

    expect(r.wartosci!.prady_A[0]).toBeCloseTo(200, 9);
    expect(r.wartosci!.prady_A[1]).toBeCloseTo(100, 9);
    expect(r.wartosci!.pradRowny_A).toBe(150);
    // (200 − 150) / 150 = 33,3%
    expect(r.wartosci!.odchylenie_pct).toBeCloseTo(33.333, 2);
  });

  it("suma prądów w żyłach równa się prądowi obwodu — nic nie ginie po drodze", () => {
    const r = obliczPrzewodyRownolegle({ pradCalkowity_A: 437, dlugosci_m: [30, 41, 57], ...WSPOLNE });
    const suma = r.wartosci!.prady_A.reduce((a, b) => a + b, 0);
    expect(suma).toBeCloseTo(437, 9);
  });

  it("przeciążenie NAJBARDZIEJ obciążonej żyły jest orzekane mimo mieszczącej się sumy", () => {
    // 300 A na dwie żyły o Iz = 160 A każda: po równo byłoby 150 A i wszystko grałoby.
    // Przy długościach 50 i 100 jedna żyła prowadzi 200 A — i to ma być werdykt.
    const r = obliczPrzewodyRownolegle({
      pradCalkowity_A: 300,
      dlugosci_m: [50, 100],
      ...WSPOLNE,
      Iz_jednej_A: 160,
    });

    expect(r.ocena!.verdict).toBe("niespelniony");
    expect(r.ocena!.komunikat).toMatch(/nie wykryje/i);
  });

  it("zapas poniżej 10% to werdykt graniczny, a nie spełniony", () => {
    // Równe żyły, 300 A na dwie → 150 A każda. Iz = 160 A daje zapas 6,25%.
    const r = obliczPrzewodyRownolegle({
      pradCalkowity_A: 300,
      dlugosci_m: [50, 50],
      ...WSPOLNE,
      Iz_jednej_A: 160,
    });

    expect(r.ocena!.verdict).toBe("graniczny");
    expect(r.ocena!.margines_pct).toBeCloseTo(6.25, 2);
  });

  it("wyraźny zapas to werdykt spełniony", () => {
    const r = obliczPrzewodyRownolegle({
      pradCalkowity_A: 200,
      dlugosci_m: [50, 50],
      ...WSPOLNE,
      Iz_jednej_A: 160,
    });

    expect(r.ocena!.verdict).toBe("spelniony");
    expect(r.ocena!.margines_pct).toBeCloseTo(37.5, 2);
  });

  it("nierówne długości dokładają ostrzeżenie na POCZĄTEK założeń", () => {
    const rowne = obliczPrzewodyRownolegle({ pradCalkowity_A: 300, dlugosci_m: [50, 50], ...WSPOLNE });
    const nierowne = obliczPrzewodyRownolegle({ pradCalkowity_A: 300, dlugosci_m: [50, 100], ...WSPOLNE });

    expect(rowne.zalozenia[0]).not.toMatch(/UWAGA/);
    // Na początku, bo to jest powód, dla którego wynik w ogóle wygląda dziwnie.
    expect(nierowne.zalozenia[0]).toMatch(/UWAGA/);
  });

  it("odrzuca jedną żyłę, zerową długość i zerowy prąd", () => {
    const jedna = obliczPrzewodyRownolegle({ pradCalkowity_A: 300, dlugosci_m: [50], ...WSPOLNE });
    const zerowa = obliczPrzewodyRownolegle({ pradCalkowity_A: 300, dlugosci_m: [50, 0], ...WSPOLNE });
    const bezPradu = obliczPrzewodyRownolegle({ pradCalkowity_A: 0, dlugosci_m: [50, 50], ...WSPOLNE });

    expect(jedna.bledy.map((b) => b.code)).toContain("ZA_MALO_ZYL");
    // Zerowa długość dałaby konduktancję Infinity i cały prąd w jednej żyle —
    // liczbowo „poprawny" wynik, który nie znaczy nic.
    expect(zerowa.bledy.map((b) => b.code)).toContain("DLUGOSC");
    expect(bezPradu.bledy.map((b) => b.code)).toContain("PRAD");
  });
});
