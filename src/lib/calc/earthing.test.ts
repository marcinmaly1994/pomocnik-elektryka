import { describe, expect, it } from "vitest";
import { maksRezystancjaTT, obliczUziom, type UziomWejscie } from "./earthing";

function pionowy(over: Partial<UziomWejscie> = {}): UziomWejscie {
  return { typ: "pionowy", rho_ohm_m: 100, dlugosc_m: 3, srednica_m: 0.016, ...over };
}

describe("uziom pionowy", () => {
  it("R = ρ/(2πL)·ln(4L/d) — wynik odtwarzalny z kalkulatorem w ręku", () => {
    // 100/(2π·3)·ln(4·3/0,016) = 5,3052·ln(750) = 5,3052·6,6201 = 35,12 Ω
    const r = obliczUziom(pionowy());
    expect(r.bledy).toEqual([]);
    expect(r.wartosci!.R_pojedynczy_ohm).toBeCloseTo(35.12, 1);
  });

  it("dwa razy dłuższy pręt daje wyraźnie mniejszą rezystancję", () => {
    const krotki = obliczUziom(pionowy({ dlugosc_m: 3 })).wartosci!.R_pojedynczy_ohm;
    const dlugi = obliczUziom(pionowy({ dlugosc_m: 6 })).wartosci!.R_pojedynczy_ohm;
    expect(dlugi).toBeLessThan(krotki);
    // spadek jest wolniejszy niż liniowy (długość siedzi też pod logarytmem)
    expect(dlugi).toBeGreaterThan(krotki / 2);
  });

  it("kilka uziomów równolegle liczy się ze współczynnikiem wykorzystania", () => {
    const jeden = obliczUziom(pionowy()).wartosci!.R_wypadkowa_ohm;
    const trzy = obliczUziom(pionowy({ liczba: 3, wspWykorzystania: 0.8 })).wartosci!;
    expect(trzy.R_wypadkowa_ohm).toBeCloseTo(jeden / (3 * 0.8), 6);
    // bez η wynik byłby zbyt optymistyczny — sprawdzamy, że η realnie działa
    expect(trzy.R_wypadkowa_ohm).toBeGreaterThan(jeden / 3);
  });

  it("liczy potrzebną długość pręta dla zadanej wartości docelowej", () => {
    const r = obliczUziom(pionowy({ wymagana_ohm: 20 }));
    expect(r.wartosci!.potrzebnaDlugosc_m).not.toBeNull();
    // sprawdzamy wprost: przy tej długości rezystancja faktycznie schodzi do 20 Ω
    const kontrola = obliczUziom(pionowy({ dlugosc_m: r.wartosci!.potrzebnaDlugosc_m! }));
    expect(kontrola.wartosci!.R_pojedynczy_ohm).toBeCloseTo(20, 1);
  });

  it("przy jednym uziomie η nie wchodzi do potrzebnej długości (formularz trzyma je ukryte)", () => {
    // Regresja z audytu: ρ 100, d 16 mm, 30 Ω — wychodziło 4,7 m przez ukryte η = 0,8.
    const r = obliczUziom(pionowy({ wymagana_ohm: 30, liczba: 1, wspWykorzystania: 0.8 }));
    expect(r.wartosci!.potrzebnaDlugosc_m!).toBeCloseTo(3.61, 1);
    const kontrola = obliczUziom(pionowy({ dlugosc_m: r.wartosci!.potrzebnaDlugosc_m! }));
    expect(kontrola.wartosci!.R_pojedynczy_ohm).toBeCloseTo(30, 1);
    // otok tak samo: L = 2ρ/R bez η
    const otok = obliczUziom({ typ: "otokowy", rho_ohm_m: 100, dlugosc_m: 40, wymagana_ohm: 10, liczba: 1, wspWykorzystania: 0.8 });
    expect(otok.wartosci!.potrzebnaDlugosc_m).toBeCloseTo(20, 6);
  });

  it("brak średnicy i absurdalna geometria kończą się błędem, nie liczbą", () => {
    expect(obliczUziom({ typ: "pionowy", rho_ohm_m: 100, dlugosc_m: 3 }).bledy.map((b) => b.code)).toContain("SREDNICA");
    // średnica podana w milimetrach zamiast metrach — 4L/d < 1, logarytm ujemny
    const zleJednostki = obliczUziom(pionowy({ dlugosc_m: 3, srednica_m: 16 }));
    expect(zleJednostki.wartosci).toBeNull();
    expect(zleJednostki.bledy.map((b) => b.code)).toContain("GEOMETRIA_POZA_ZAKRESEM");
  });
});

describe("uziom poziomy i otokowy", () => {
  it("bednarka: R = ρ/(πL)·ln(2L²/(b·h))", () => {
    // 100/(π·20)·ln(2·400/(0,03·0,8)) = 1,5915·ln(33333) = 1,5915·10,414 = 16,58 Ω
    const r = obliczUziom({ typ: "poziomy", rho_ohm_m: 100, dlugosc_m: 20, szerokosc_m: 0.03, glebokosc_m: 0.8 });
    expect(r.wartosci!.R_pojedynczy_ohm).toBeCloseTo(16.58, 1);
  });

  it("otok: R ≈ 2ρ/L, a potrzebna długość wynika wprost z odwrócenia wzoru", () => {
    const r = obliczUziom({ typ: "otokowy", rho_ohm_m: 100, dlugosc_m: 40, wymagana_ohm: 10 });
    expect(r.wartosci!.R_pojedynczy_ohm).toBeCloseTo(5, 6);
    expect(r.wartosci!.potrzebnaDlugosc_m).toBeCloseTo(20, 6);
    expect(r.ocena!.verdict).toBe("spelniony");
    expect(r.zalozenia.join(" ")).toMatch(/przybliżenie/i);
  });

  it("brak szerokości albo głębokości bednarki to błąd", () => {
    const r = obliczUziom({ typ: "poziomy", rho_ohm_m: 100, dlugosc_m: 20 });
    expect(r.bledy.map((b) => b.code)).toEqual(expect.arrayContaining(["SZEROKOSC", "GLEBOKOSC"]));
  });
});

describe("ocena względem wymagania i układ TT", () => {
  it("przekroczone wymaganie daje werdykt niespełniony", () => {
    const r = obliczUziom(pionowy({ wymagana_ohm: 10 }));
    expect(r.ocena!.verdict).toBe("niespelniony");
    expect(r.wartosci!.potrzebnaDlugosc_m!).toBeGreaterThan(3);
  });

  it("wynik tuż pod wymaganiem jest GRANICZNY", () => {
    // R ≈ 35,12 Ω — wymaganie 37 Ω daje zapas ok. 5%
    const r = obliczUziom(pionowy({ wymagana_ohm: 37 }));
    expect(r.ocena!.verdict).toBe("graniczny");
  });

  it("kryterium TT: RA ≤ 50/IΔn (30 mA → 1667 Ω)", () => {
    expect(maksRezystancjaTT(0.03)).toBeCloseTo(1666.67, 1);
    expect(maksRezystancjaTT(0.3)).toBeCloseTo(166.67, 1);
    expect(maksRezystancjaTT(0)).toBe(0);
  });

  it("zawsze mówi wprost, że tablica rezystywności to wartości orientacyjne", () => {
    const r = obliczUziom(pionowy());
    expect(r.zalozenia.join(" ")).toMatch(/POMIAR/);
    expect(r.zalozenia.join(" ")).toMatch(/ORIENTACYJNYCH/);
  });
});
