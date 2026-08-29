import { describe, expect, it } from "vitest";
import { obliczKompensacje, tgFi, type KompensacjaWejscie } from "./powerFactor";

function wejscie(over: Partial<KompensacjaWejscie> = {}): KompensacjaWejscie {
  return { P_W: 100_000, cosfi1: 0.8, cosfi2: 0.95, napiecie_V: 400, czestotliwosc_Hz: 50, uklad: "trojkat", ...over };
}

describe("kompensacja mocy biernej — przykład ręcznie policzony ze specyfikacji", () => {
  it("P = 100 kW, cosφ 0,80 → 0,95 → Qc = 42,1 kvar", () => {
    const r = obliczKompensacje(wejscie());
    expect(r.bledy).toEqual([]);
    expect(r.wartosci!.tgfi1).toBeCloseTo(0.75, 4);
    expect(r.wartosci!.tgfi2).toBeCloseTo(0.3287, 4);
    expect(r.wartosci!.Qc_var / 1000).toBeCloseTo(42.13, 2);
  });

  it("tgφ liczy się z cosφ wzorem √(1/cos²φ − 1)", () => {
    expect(tgFi(0.8)).toBeCloseTo(0.75, 6);
    expect(tgFi(1)).toBeCloseTo(0, 9);
  });
});

describe("kompensacja — pojemność zależy od układu połączeń baterii", () => {
  it("trójkąt wymaga trzy razy mniejszej pojemności na gałąź niż gwiazda", () => {
    const delta = obliczKompensacje(wejscie({ uklad: "trojkat" }));
    const gwiazda = obliczKompensacje(wejscie({ uklad: "gwiazda" }));
    expect(gwiazda.wartosci!.C_F / delta.wartosci!.C_F).toBeCloseTo(3, 6);
  });

  it("pojemność w trójkącie: C = Qc/(3·ω·U²)", () => {
    const r = obliczKompensacje(wejscie());
    const oczekiwane = r.wartosci!.Qc_var / (3 * 2 * Math.PI * 50 * 400 * 400);
    expect(r.wartosci!.C_F).toBeCloseTo(oczekiwane, 12);
  });
});

describe("kompensacja — rezonans z harmonicznymi", () => {
  it("liczy rząd rezonansu n_r = √(Sk/Qc) i ostrzega, gdy wypada przy harmonicznej", () => {
    // Qc ≈ 42,13 kvar; dobieramy Sk tak, żeby n_r wypadło ok. 5
    const Sk = 25 * 42_130;
    const r = obliczKompensacje(wejscie({ Sk_VA: Sk }));
    expect(r.wartosci!.rzadRezonansu!).toBeCloseTo(5, 1);
    expect(r.wartosci!.czestotliwoscRezonansu_Hz!).toBeCloseTo(250, 1);
    expect(r.zalozenia.join(" ")).toMatch(/5\. harmonicznej/);
    expect(r.zalozenia.join(" ")).toMatch(/dławik/i);
  });

  it("rezonans z dala od dominujących harmonicznych nie straszy bez powodu", () => {
    const Sk = 400 * 42_130; // n_r ≈ 20
    const r = obliczKompensacje(wejscie({ Sk_VA: Sk }));
    expect(r.zalozenia.join(" ")).toMatch(/z dala od dominujących/i);
  });

  it("bez podanej mocy zwarciowej mówi WPROST, że rezonansu nie sprawdzono", () => {
    const r = obliczKompensacje(wejscie());
    expect(r.wartosci!.rzadRezonansu).toBeNull();
    expect(r.zalozenia.join(" ")).toMatch(/NIE sprawdzono ryzyka rezonansu/);
  });
});

describe("kompensacja — walidacja", () => {
  it("docelowy cosφ niższy od początkowego to błąd danych, nie ujemna bateria", () => {
    const r = obliczKompensacje(wejscie({ cosfi1: 0.95, cosfi2: 0.8 }));
    expect(r.wartosci).toBeNull();
    expect(r.bledy.map((b) => b.code)).toContain("COSFI_MALEJE");
  });

  it("cosφ poza (0; 1] i moc niedodatnia są odrzucane", () => {
    expect(obliczKompensacje(wejscie({ cosfi1: 1.5 })).bledy.map((b) => b.code)).toContain("COSFI1");
    expect(obliczKompensacje(wejscie({ cosfi2: 0 })).bledy.map((b) => b.code)).toContain("COSFI2");
    expect(obliczKompensacje(wejscie({ P_W: 0 })).bledy.map((b) => b.code)).toContain("MOC");
  });

  it("kompensacja do cosφ = 1 jest dopuszczalna i daje Qc = P·tgφ₁", () => {
    const r = obliczKompensacje(wejscie({ cosfi2: 1 }));
    expect(r.wartosci!.Qc_var / 1000).toBeCloseTo(75, 4);
  });
});
