import { describe, expect, it } from "vitest";
import { WSP_ROBOCZY_ANNEX_G, rezystywnoscRobocza } from "@/lib/norms/conductors";
import { RHO_CU_70C } from "@/lib/panel/norms";
import { voltageDropPct } from "@/lib/panel/sizing";
import { obliczSpadekNapiecia } from "./voltageDrop";

/**
 * SPÓJNOŚĆ KRZYŻOWA (spec pkt 6.5): ten sam obwód liczony w różnych miejscach
 * aplikacji musi dać ten sam wynik, oparty na tych samych założeniach.
 *
 * Ten plik istnieje, bo aplikacja miała już raz dokładnie ten problem: dobór
 * obwodów (`lib/panel/sizing.ts`, zakładka Rozdzielnica) liczył spadek napięcia
 * stałą 0,0225 wpisaną ręcznie, a nowe kalkulatory inżynierskie — modelem
 * temperaturowym dającym ok. 5% mniej. Na styku limitu wychodziły z tego RÓŻNE
 * przekroje dla tych samych danych, bez żadnego sposobu, żeby użytkownik się
 * zorientował, które miejsce ma rację. Testy poniżej pilnują, żeby te dwie
 * warstwy nie mogły się znów rozjechać.
 */

describe("jedno źródło rezystywności dla całej aplikacji", () => {
  it("RHO_CU_70C jest WYPROWADZONE z uproszczenia zał. G, a nie wpisane osobno", () => {
    expect(RHO_CU_70C).toBeCloseTo(rezystywnoscRobocza("Cu", "annexG", 70), 12);
    // 1,25 · 1/56 = 0,0223214…
    expect(RHO_CU_70C).toBeCloseTo(0.0223214, 6);
    expect(WSP_ROBOCZY_ANNEX_G).toBe(1.25);
  });

  it("uproszczenie zał. G nie zależy od temperatury — to jego cała istota", () => {
    expect(rezystywnoscRobocza("Cu", "annexG", 70)).toBe(rezystywnoscRobocza("Cu", "annexG", 90));
  });

  it("model temperaturowy jest MNIEJ konserwatywny od zał. G przy 70 °C", () => {
    const annexG = rezystywnoscRobocza("Cu", "annexG", 70);
    const temperaturowy = rezystywnoscRobocza("Cu", "temperaturowy", 70);
    expect(temperaturowy).toBeLessThan(annexG);
    // różnica ok. 4,4% — to ona powodowała rozjazd między zakładkami
    expect((annexG - temperaturowy) / annexG).toBeCloseTo(0.044, 2);
  });
});

describe("dobór obwodów i kalkulator spadku napięcia liczą TO SAMO", () => {
  /** Ten sam obwód opisany dla obu silników. */
  const przypadki = [
    { nazwa: "obwód gniazd 1-fazowy", I: 10, L: 25, S: 2.5, fazy: "1" as const },
    { nazwa: "długa trasa 1-fazowa", I: 16, L: 60, S: 4, fazy: "1" as const },
    { nazwa: "obwód 3-fazowy", I: 20, L: 40, S: 6, fazy: "3" as const },
    { nazwa: "gruby przewód 3-fazowy", I: 63, L: 30, S: 25, fazy: "3" as const },
  ];

  for (const p of przypadki) {
    it(`${p.nazwa}: ten sam ΔU% w Rozdzielnicy i w kalkulatorze`, () => {
      const zRozdzielnicy = voltageDropPct(p.L, p.I, p.S, p.fazy);
      const zKalkulatora = obliczSpadekNapiecia({
        uklad: p.fazy === "3" ? "3f" : "1f",
        napiecie_V: p.fazy === "3" ? 400 : 230,
        prad_A: p.I,
        cosfi: 1,
        dlugosc_m: p.L,
        material: "Cu",
        przekroj_mm2: p.S,
        izolacja: "PVC",
        zReaktancja: false,
        limit_pct: 5,
      });
      expect(zKalkulatora.wartosci!.spadek_pct).toBeCloseTo(zRozdzielnicy, 9);
    });
  }

  it("domyślnym modelem kalkulatora jest zał. G — bez tego zgodność by nie zachodziła", () => {
    const domyslny = obliczSpadekNapiecia({
      uklad: "1f",
      napiecie_V: 230,
      prad_A: 10,
      cosfi: 1,
      dlugosc_m: 25,
      material: "Cu",
      przekroj_mm2: 2.5,
      izolacja: "PVC",
      zReaktancja: false,
      limit_pct: 5,
    });
    const temperaturowy = obliczSpadekNapiecia({
      uklad: "1f",
      napiecie_V: 230,
      prad_A: 10,
      cosfi: 1,
      dlugosc_m: 25,
      material: "Cu",
      przekroj_mm2: 2.5,
      izolacja: "PVC",
      zReaktancja: false,
      limit_pct: 5,
      modelRezystywnosci: "temperaturowy",
    });
    expect(domyslny.wartosci!.spadek_pct).toBeCloseTo(voltageDropPct(25, 10, 2.5, "1"), 9);
    expect(temperaturowy.wartosci!.spadek_pct).toBeLessThan(domyslny.wartosci!.spadek_pct);
    // wybrany model musi być widoczny w założeniach, żeby dało się odtworzyć rachunek
    expect(domyslny.zalozenia.join(" ")).toMatch(/zał\. G/);
    expect(temperaturowy.zalozenia.join(" ")).toMatch(/mniej konserwatywne/);
  });

  it("na styku limitu oba silniki wybierają TEN SAM najmniejszy przekrój", () => {
    // 16 A na 60 m przy limicie 3% — to był przypadek, w którym stary rozjazd
    // dawał 6 mm² w kalkulatorze i 10 mm² w Rozdzielnicy.
    const r = obliczSpadekNapiecia({
      uklad: "1f",
      napiecie_V: 230,
      prad_A: 16,
      cosfi: 1,
      dlugosc_m: 60,
      material: "Cu",
      przekroj_mm2: 1.5,
      izolacja: "PVC",
      zReaktancja: false,
      limit_pct: 3,
    });
    expect(r.wartosci!.minPrzekroj_mm2).toBe(10);
    expect(voltageDropPct(60, 16, 6, "1")).toBeGreaterThan(3);
    expect(voltageDropPct(60, 16, 10, "1")).toBeLessThanOrEqual(3);
  });
});
