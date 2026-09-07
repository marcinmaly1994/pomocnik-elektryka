import { describe, expect, it } from "vitest";
import { obliczMaksymalnaDlugosc, type DlugoscWejscie } from "./maxLength";
import { zsMaxDlaIa } from "@/lib/panel/sizing";

/**
 * Obwod gniazdowy 1-fazowy: 2,5 mm2 Cu/PVC, PE tego samego przekroju, B16,
 * 16 A obciazenia, limit spadku 5%, rozdzielnica o impedancji 0,4 Om.
 * To najczestszy przypadek w domu jednorodzinnym i punkt odniesienia tych testow.
 */
function wejscie(over: Partial<DlugoscWejscie> = {}): DlugoscWejscie {
  return {
    uklad: "1f",
    napiecie_V: 230,
    prad_A: 16,
    material: "Cu",
    izolacja: "PVC",
    przekroj_mm2: 2.5,
    przekrojPE_mm2: 2.5,
    charakterystyka: "B",
    In_A: 16,
    Zs_przed_Ohm: 0.4,
    limitSpadku_pct: 5,
    dlugoscPlanowana_m: 20,
    ...over,
  };
}

describe("obliczMaksymalnaDlugosc", () => {
  it("liczy obie granice recznie sprawdzalnym rachunkiem", () => {
    const w = obliczMaksymalnaDlugosc(wejscie()).wartosci!;

    // rho = 1,25/56 = 0,0223214 Om*mm2/m
    // Spadek: dU_dop = 5% * 230 = 11,5 V; L = 11,5 * 2,5 / (2 * 16 * 0,0223214) = 40,25 m
    expect(w.spadekDopuszczalny_V).toBeCloseTo(11.5, 3);
    expect(w.L_spadek_m).toBeCloseTo(40.25, 1);

    // Ochrona: Ia = 5*16 = 80 A; Zs_max = 0,95*230/80 = 2,73 Om (kryterium akceptacji spec)
    expect(w.Ia_A).toBe(80);
    expect(w.Zs_max_Ohm).toBeCloseTo(2.73, 2);
    // r = 0,0223214 * (1/2,5 + 1/2,5) = 0,0178571 Om/m
    expect(w.rPetli_ohm_m).toBeCloseTo(0.0178571, 6);
    // L = (2,73125 - 0,4) / 0,0178571 = 130,55 m
    expect(w.L_ochrona_m).toBeCloseTo(130.55, 1);
  });

  it("wiaze granica MNIEJSZA i mowi, ktora to", () => {
    const w = obliczMaksymalnaDlugosc(wejscie()).wartosci!;
    expect(w.wiazace).toBe("spadek");
    expect(w.L_max_m).toBeCloseTo(w.L_spadek_m, 6);
  });

  /**
   * Ciasny budzet spadku (WLZ) odwraca sytuacje: granice wyznacza wtedy spadek
   * jeszcze mocniej, ale przy DUZYM zapasie spadku i slabym zasilaniu wiaze ochrona.
   */
  it("przy duzym zapasie spadku granice wyznacza ochrona przeciwporazeniowa", () => {
    const w = obliczMaksymalnaDlugosc(wejscie({ prad_A: 2, Zs_przed_Ohm: 1.5 })).wartosci!;
    expect(w.wiazace).toBe("ochrona");
    expect(w.L_max_m).toBeCloseTo(w.L_ochrona_m, 6);
  });

  /** Cieńszy PE wydluza petle, wiec skraca dopuszczalna trase — i to znacznie. */
  it("PE o polowie przekroju fazy skraca granice ochrony", () => {
    const pelny = obliczMaksymalnaDlugosc(wejscie()).wartosci!;
    const polowa = obliczMaksymalnaDlugosc(wejscie({ przekroj_mm2: 4, przekrojPE_mm2: 2 })).wartosci!;
    // r rosnie z 2/S do (1/4 + 1/2) = 0,75 na jednostke rho — petla dluzsza mimo grubszej fazy
    expect(polowa.rPetli_ohm_m).toBeGreaterThan(pelny.rPetli_ohm_m * 0.9);
    expect(polowa.L_ochrona_m).toBeLessThan(pelny.L_ochrona_m * 1.4);
  });

  it("charakterystyka C skraca granice ochrony dwukrotnie wzgledem B", () => {
    const b = obliczMaksymalnaDlugosc(wejscie()).wartosci!;
    const c = obliczMaksymalnaDlugosc(wejscie({ charakterystyka: "C" })).wartosci!;
    // Ia rosnie z 5*In na 10*In, wiec Zs_max spada o polowe
    expect(c.Zs_max_Ohm).toBeCloseTo(b.Zs_max_Ohm / 2, 3);
    expect(c.L_ochrona_m).toBeLessThan(b.L_ochrona_m / 2);
  });

  it("uklad 3-fazowy: mnoznik √3 zamiast 2 i napiecie miedzyfazowe", () => {
    const w = obliczMaksymalnaDlugosc(wejscie({ uklad: "3f", napiecie_V: 400 })).wartosci!;
    // dU_dop = 20 V; L = 20 * 2,5 / (√3 * 16 * 0,0223214) = 80,83 m
    expect(w.spadekDopuszczalny_V).toBeCloseTo(20, 3);
    expect(w.L_spadek_m).toBeCloseTo(80.83, 1);
    // Zs_max liczone od U0 = 230 V (zwarcie faza-PE), a nie od napiecia miedzyfazowego
    expect(w.Zs_max_Ohm).toBeCloseTo(zsMaxDlaIa(80), 6);
  });

  describe("ocena planowanej trasy", () => {
    it("trasa z zapasem jest spelniona, a margines liczy sie od granicy", () => {
      const r = obliczMaksymalnaDlugosc(wejscie({ dlugoscPlanowana_m: 20 }));
      expect(r.ocena!.verdict).toBe("spelniony");
      // 1 - 20/40,25 = 50,3%
      expect(r.ocena!.margines_pct).toBeCloseTo(50.3, 1);
      expect(r.ocena!.komunikat).toContain("spadek napięcia");
    });

    it("trasa tuz pod granica jest GRANICZNA, nie zielona", () => {
      expect(obliczMaksymalnaDlugosc(wejscie({ dlugoscPlanowana_m: 38 })).ocena!.verdict).toBe("graniczny");
    });

    it("trasa ponad granica jest niespelniona", () => {
      expect(obliczMaksymalnaDlugosc(wejscie({ dlugoscPlanowana_m: 45 })).ocena!.verdict).toBe("niespelniony");
    });

    /**
     * Impedancja przed odcinkiem juz ponad limitem: zadna dlugosc nie pomoze.
     * Bez tego przypadku margines liczylby sie przez zero i pokazywal bzdure.
     */
    it("gdy sama rozdzielnica jest poza limitem, granica wynosi zero i nie ma marginesu", () => {
      const r = obliczMaksymalnaDlugosc(wejscie({ Zs_przed_Ohm: 3 }));
      expect(r.wartosci!.L_ochrona_m).toBe(0);
      expect(r.wartosci!.L_max_m).toBe(0);
      expect(r.ocena!.verdict).toBe("niespelniony");
      expect(r.ocena!.margines_pct).toBeNull();
    });
  });

  describe("walidacja", () => {
    it("brak pradu obliczeniowego to twardy blad, a nie wynik zerowy", () => {
      const r = obliczMaksymalnaDlugosc(wejscie({ prad_A: 0 }));
      expect(r.wartosci).toBeNull();
      expect(r.bledy.map((b) => b.code)).toContain("PRAD");
    });

    it("przekroj od 35 mm2 jest odrzucany — metoda uproszczona tam nie obowiazuje", () => {
      const r = obliczMaksymalnaDlugosc(wejscie({ przekroj_mm2: 35 }));
      expect(r.wartosci).toBeNull();
      expect(r.bledy.map((b) => b.code)).toContain("ZA_DUZY_PRZEKROJ");
    });

    it("zerowy przekroj PE nie przechodzi — dzielenie przez zero w rezystancji petli", () => {
      expect(obliczMaksymalnaDlugosc(wejscie({ przekrojPE_mm2: 0 })).bledy.map((b) => b.code)).toContain("PRZEKROJ_PE");
    });
  });

  /**
   * Kryterium akceptacji ze specyfikacji: B16, 1-fazowy, 2,5 mm2 → Zs_max = 2,73 Om.
   * Ta sama liczba musi wychodzic tu i w doborze obwodu — inaczej ten sam obwod
   * przechodzilby jeden kalkulator, a oblewal drugi.
   */
  it("Zs_max zgadza sie z silnikiem doboru obwodu", () => {
    const w = obliczMaksymalnaDlugosc(wejscie()).wartosci!;
    expect(w.Zs_max_Ohm).toBeCloseTo(zsMaxDlaIa(80), 9);
  });
});
