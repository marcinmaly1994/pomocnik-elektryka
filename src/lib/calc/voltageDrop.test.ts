import { describe, expect, it } from "vitest";
import { konduktywnosc } from "@/lib/norms/conductors";
import { obliczSpadekNapiecia, type SpadekWejscie } from "./voltageDrop";

/**
 * Wartości oczekiwane pochodzą z przykładów ręcznie policzonych w specyfikacji
 * zadania (pkt 5.1 i 6). Tolerancja ±1% zgodnie ze spec pkt 3.6.
 *
 * γ = 55 podane jest w tych przykładach WPROST, więc testy wymuszają temperaturę
 * żyły dającą dokładnie taką konduktywność — inaczej sprawdzałyby model
 * temperaturowy, a nie sam wzór na spadek.
 */

/** Temperatura, w której miedź ma γ = 55 m/(Ω·mm²): z ρ(θ)=ρ₂₀[1+α(θ−20)]. */
const TEMP_DLA_GAMMA_55 = 20 + (56 / 55 - 1) / 0.00393;

function wejscie(over: Partial<SpadekWejscie> = {}): SpadekWejscie {
  return {
    uklad: "1f",
    napiecie_V: 230,
    cosfi: 1,
    material: "Cu",
    izolacja: "PVC",
    tempZyly_C: TEMP_DLA_GAMMA_55,
    zReaktancja: false,
    przekroj_mm2: 2.5,
    limit_pct: 5,
    ...over,
  };
}

describe("spadek napięcia — przykłady ręcznie policzone ze specyfikacji", () => {
  it("γ = 55 odpowiada przyjętej temperaturze żyły (kontrola samego stanowiska testowego)", () => {
    expect(konduktywnosc("Cu", TEMP_DLA_GAMMA_55)).toBeCloseTo(55, 6);
  });

  it("3-fazowy: P = 10 kW, L = 100 m, S = 16 mm² Cu → ΔU = 2,84 V = 0,71%", () => {
    const r = obliczSpadekNapiecia(
      wejscie({ uklad: "3f", napiecie_V: 400, moc_W: 10000, dlugosc_m: 100, przekroj_mm2: 16 })
    );
    expect(r.bledy).toEqual([]);
    expect(r.wartosci!.spadek_V).toBeCloseTo(2.84, 2);
    expect(r.wartosci!.spadek_pct).toBeCloseTo(0.71, 2);
    expect(r.wartosci!.napiecieKoncowe_V).toBeCloseTo(397.16, 2);
  });

  it("1-fazowy: P = 2 kW, L = 30 m, S = 2,5 mm² Cu → ΔU = 3,79 V = 1,65%", () => {
    const r = obliczSpadekNapiecia(wejscie({ moc_W: 2000, dlugosc_m: 30 }));
    expect(r.bledy).toEqual([]);
    expect(r.wartosci!.spadek_V).toBeCloseTo(3.79, 2);
    expect(r.wartosci!.spadek_pct).toBeCloseTo(1.65, 2);
  });
});

describe("spadek napięcia — warunki, granice i błędy", () => {
  it("wynik tuż pod limitem jest GRANICZNY, nie „spełniony”", () => {
    // dobieramy limit tak, żeby zapas wyszedł poniżej 10%
    const r = obliczSpadekNapiecia(wejscie({ moc_W: 2000, dlugosc_m: 30, limit_pct: 1.75 }));
    expect(r.ocena!.verdict).toBe("graniczny");
    expect(r.ocena!.margines_pct!).toBeLessThan(10);
  });

  it("przekroczony limit daje werdykt niespełniony i ujemny margines", () => {
    const r = obliczSpadekNapiecia(wejscie({ moc_W: 2000, dlugosc_m: 30, limit_pct: 1 }));
    expect(r.ocena!.verdict).toBe("niespelniony");
    expect(r.ocena!.margines_pct!).toBeLessThan(0);
    expect(r.ocena!.komunikat).toMatch(/przekracza/i);
  });

  it("podpowiada najmniejszy przekrój z szeregu mieszczący się w limicie", () => {
    const r = obliczSpadekNapiecia(wejscie({ moc_W: 2000, dlugosc_m: 30, przekroj_mm2: 1.5, limit_pct: 1 }));
    // przy 1,5 mm² ΔU = 6,32 V = 2,75% > 1%; potrzebny grubszy przewód
    expect(r.wartosci!.minPrzekroj_mm2).toBe(6);
  });

  it("metoda uproszczona dla S ≥ 35 mm² to BŁĄD, nie ostrzeżenie (spec pkt 7)", () => {
    const r = obliczSpadekNapiecia(wejscie({ moc_W: 20000, dlugosc_m: 50, przekroj_mm2: 50, zReaktancja: false }));
    expect(r.wartosci).toBeNull();
    expect(r.bledy.map((b) => b.code)).toContain("UPROSZCZONA_ZA_DUZY_PRZEKROJ");
  });

  it("brak obciążenia i brak długości kończą się błędem, a nie zerowym wynikiem", () => {
    const bezMocy = obliczSpadekNapiecia(wejscie({ dlugosc_m: 30 }));
    expect(bezMocy.bledy.map((b) => b.code)).toContain("BRAK_OBCIAZENIA");

    const bezDlugosci = obliczSpadekNapiecia(wejscie({ moc_W: 2000 }));
    expect(bezDlugosci.bledy.map((b) => b.code)).toContain("BRAK_DLUGOSCI");
  });

  it("cosφ poza (0; 1] jest odrzucany", () => {
    expect(obliczSpadekNapiecia(wejscie({ moc_W: 2000, dlugosc_m: 30, cosfi: 1.2 })).bledy.map((b) => b.code)).toContain("COSFI");
    expect(obliczSpadekNapiecia(wejscie({ moc_W: 2000, dlugosc_m: 30, cosfi: 0 })).bledy.map((b) => b.code)).toContain("COSFI");
  });
});

describe("spadek napięcia — metoda pełna i obciążenie rozłożone", () => {
  it("reaktancja podnosi spadek przy cosφ < 1, a przy cosφ = 1 nie zmienia nic", () => {
    const bezX = obliczSpadekNapiecia(wejscie({ uklad: "3f", napiecie_V: 400, prad_A: 100, dlugosc_m: 100, przekroj_mm2: 50, cosfi: 0.8, zReaktancja: false, tempZyly_C: TEMP_DLA_GAMMA_55 }));
    // metoda uproszczona przy 50 mm² jest zabroniona — liczymy referencję ręcznie
    expect(bezX.bledy.map((b) => b.code)).toContain("UPROSZCZONA_ZA_DUZY_PRZEKROJ");

    const zX = obliczSpadekNapiecia(
      wejscie({ uklad: "3f", napiecie_V: 400, prad_A: 100, dlugosc_m: 100, przekroj_mm2: 50, cosfi: 0.8, zReaktancja: true })
    );
    // R' = 1/(55·50) = 3,636e-4 Ω/m; X' = 0,08/1000 = 8e-5 Ω/m
    // ΔU = √3·100·100·(3,636e-4·0,8 + 8e-5·0,6) = √3·10000·(2,909e-4 + 4,8e-5) = 5,88 V
    expect(zX.wartosci!.spadek_V).toBeCloseTo(5.88, 1);

    const cosfi1 = obliczSpadekNapiecia(
      wejscie({ uklad: "3f", napiecie_V: 400, prad_A: 100, dlugosc_m: 100, przekroj_mm2: 50, cosfi: 1, zReaktancja: true })
    );
    // przy cosφ = 1 sinφ = 0, więc reaktancja wypada z rachunku
    expect(cosfi1.wartosci!.spadek_V).toBeCloseTo(Math.sqrt(3) * 100 * 100 * (1 / (55 * 50)), 2);
  });

  it("obciążenie rozłożone liczy się z momentów prądowych, nie jako prąd skupiony na końcu", () => {
    // 4 odbiory po 5 A co 25 m na trasie 100 m
    const rozlozone = obliczSpadekNapiecia(
      wejscie({
        uklad: "1f",
        napiecie_V: 230,
        przekroj_mm2: 4,
        odbiory: [
          { dlugosc_m: 25, prad_A: 5 },
          { dlugosc_m: 50, prad_A: 5 },
          { dlugosc_m: 75, prad_A: 5 },
          { dlugosc_m: 100, prad_A: 5 },
        ],
      })
    );
    // Σ(I·L) = 5·(25+50+75+100) = 1250 A·m
    expect(rozlozone.wartosci!.momentPradowy_Am).toBeCloseTo(1250, 6);

    const skupione = obliczSpadekNapiecia(wejscie({ napiecie_V: 230, przekroj_mm2: 4, prad_A: 20, dlugosc_m: 100 }));
    // to samo 20 A na końcu daje moment 2000 A·m, czyli spadek o 60% większy
    expect(skupione.wartosci!.momentPradowy_Am).toBeCloseTo(2000, 6);
    expect(rozlozone.wartosci!.spadek_V).toBeLessThan(skupione.wartosci!.spadek_V);
    expect(skupione.wartosci!.spadek_V / rozlozone.wartosci!.spadek_V).toBeCloseTo(1.6, 2);
  });

  it("przewody równoległe dzielą spadek proporcjonalnie do ich liczby", () => {
    const jeden = obliczSpadekNapiecia(wejscie({ moc_W: 2000, dlugosc_m: 30 }));
    const dwa = obliczSpadekNapiecia(wejscie({ moc_W: 2000, dlugosc_m: 30, rownolegle: 2 }));
    expect(dwa.wartosci!.spadek_V).toBeCloseTo(jeden.wartosci!.spadek_V / 2, 6);
    expect(dwa.zalozenia.join(" ")).toMatch(/równomierny rozdział prądu/i);
  });
});

describe("spadek napięcia — koperta wyniku", () => {
  it("zwraca kroki z podstawionymi wartościami, założenia i źródła", () => {
    const r = obliczSpadekNapiecia(wejscie({ moc_W: 2000, dlugosc_m: 30 }));
    expect(r.kroki.length).toBeGreaterThan(0);
    for (const k of r.kroki) {
      expect(k.wzor.length).toBeGreaterThan(0);
      expect(k.podstawienie.length).toBeGreaterThan(0);
      expect(k.wynik.length).toBeGreaterThan(0);
    }
    expect(r.zalozenia.length).toBeGreaterThan(0);
    expect(r.zrodla.some((z) => z.norma.includes("60364-5-52"))).toBe(true);
  });
});
