import { describe, expect, it } from "vitest";
import { MAKS_SPADEK_ROZRUCHOWY_PCT, obliczSilnik, type SilnikWejscie } from "./motor";

function silnik(over: Partial<SilnikWejscie> = {}): SilnikWejscie {
  return {
    moc_W: 5500,
    Un_V: 400,
    cosfi: 0.85,
    sprawnosc: 0.88,
    krotnoscRozruchu: 6,
    sposobRozruchu: "bezposredni",
    ...over,
  };
}

describe("silnik — prądy", () => {
  it("In = P/(√3·U·cosφ·η) — 5,5 kW przy 400 V daje ok. 10,6 A", () => {
    // 5500/(√3·400·0,85·0,88) = 5500/518,3 = 10,61 A
    const r = obliczSilnik(silnik());
    expect(r.bledy).toEqual([]);
    expect(r.wartosci!.In_A).toBeCloseTo(10.61, 1);
  });

  it("rozruch bezpośredni: Ir = kr · In", () => {
    const r = obliczSilnik(silnik());
    expect(r.wartosci!.Ir_A).toBeCloseTo(6 * r.wartosci!.In_A, 6);
  });

  it("gwiazda–trójkąt obniża prąd rozruchowy I MOMENT do 1/3", () => {
    const dol = obliczSilnik(silnik({ sposobRozruchu: "bezposredni" })).wartosci!;
    const ydelta = obliczSilnik(silnik({ sposobRozruchu: "gwiazda_trojkat" })).wartosci!;
    expect(ydelta.Ir_A).toBeCloseTo(dol.Ir_A / 3, 6);
    expect(ydelta.momentWzgledny).toBeCloseTo(1 / 3, 6);
    // prąd znamionowy się NIE zmienia — zmienia się tylko rozruch
    expect(ydelta.In_A).toBeCloseTo(dol.In_A, 6);
  });

  it("ostrzega, że Y/Δ obniża moment — to jest cena za mniejszy prąd", () => {
    const r = obliczSilnik(silnik({ sposobRozruchu: "gwiazda_trojkat" }));
    expect(r.zalozenia.join(" ")).toMatch(/MOMENT/);
    expect(r.zalozenia.join(" ")).toMatch(/sprężarek/i);
  });

  it("stycznik dobierany w kategorii AC-3 na prąd znamionowy silnika", () => {
    const r = obliczSilnik(silnik());
    expect(r.wartosci!.stycznikAC3_A).toBeCloseTo(r.wartosci!.In_A, 6);
    expect(r.zalozenia.join(" ")).toMatch(/AC-3/);
  });
});

describe("silnik — spadek napięcia przy rozruchu", () => {
  it("liczy spadek i pokazuje skutek dla momentu (M ∝ U²)", () => {
    const r = obliczSilnik(silnik({ impedancjaObwodu_ohm: 0.5 }));
    // ΔU = √3 · 63,7 · 0,5 = 55,2 V → 13,8%
    expect(r.wartosci!.spadekRozruchowy_pct!).toBeCloseTo(13.79, 1);
    expect(r.kroki.some((k) => k.opis.includes("moment"))).toBe(true);
  });

  it("spadek tuż pod granicą 15% jest GRANICZNY, nie „spełniony”", () => {
    const r = obliczSilnik(silnik({ impedancjaObwodu_ohm: 0.5 }));
    expect(r.wartosci!.spadekRozruchowy_pct!).toBeLessThan(MAKS_SPADEK_ROZRUCHOWY_PCT);
    expect(r.ocena!.verdict).toBe("graniczny");
  });

  it("przekroczone 15% to warunek niespełniony", () => {
    const r = obliczSilnik(silnik({ impedancjaObwodu_ohm: 1 }));
    expect(r.ocena!.verdict).toBe("niespelniony");
  });

  it("Y/Δ ratuje spadek napięcia tam, gdzie rozruch bezpośredni go przekracza", () => {
    const dol = obliczSilnik(silnik({ impedancjaObwodu_ohm: 1 }));
    const ydelta = obliczSilnik(silnik({ impedancjaObwodu_ohm: 1, sposobRozruchu: "gwiazda_trojkat" }));
    expect(dol.ocena!.verdict).toBe("niespelniony");
    expect(ydelta.ocena!.verdict).toBe("spelniony");
  });

  it("bez impedancji mówi WPROST, że spadku rozruchowego nie sprawdzono", () => {
    const r = obliczSilnik(silnik());
    expect(r.wartosci!.spadekRozruchowy_pct).toBeNull();
    expect(r.zalozenia.join(" ")).toMatch(/NIE sprawdzono spadku napięcia przy rozruchu/);
  });
});

describe("silnik — klasa wyzwalania i walidacja", () => {
  it("krótki rozruch mieści się w klasie 10A, dłuższy wymaga klasy 20", () => {
    expect(obliczSilnik(silnik({ czasRozruchu_s: 5 })).wartosci!.klasaWyzwalania).toBe("10A");
    expect(obliczSilnik(silnik({ czasRozruchu_s: 12 })).wartosci!.klasaWyzwalania).toBe("20");
    expect(obliczSilnik(silnik({ czasRozruchu_s: 20 })).wartosci!.klasaWyzwalania).toBe("30");
  });

  it("rozruch dłuższy niż wszystkie klasy prowadzi do zalecenia PTC / softstartu", () => {
    const r = obliczSilnik(silnik({ czasRozruchu_s: 40 }));
    expect(r.wartosci!.klasaWyzwalania).toBeNull();
    expect(r.zalozenia.join(" ")).toMatch(/termistory PTC|softstart/i);
  });

  it("krotność rozruchu poza zakresem 3–12 to błąd — odczytaj z tabliczki", () => {
    const r = obliczSilnik(silnik({ krotnoscRozruchu: 25 }));
    expect(r.wartosci).toBeNull();
    expect(r.bledy.map((b) => b.code)).toContain("KROTNOSC_POZA_ZAKRESEM");
  });

  it("sprawność i cosφ poza (0; 1] są odrzucane", () => {
    expect(obliczSilnik(silnik({ sprawnosc: 1.2 })).bledy.map((b) => b.code)).toContain("SPRAWNOSC");
    expect(obliczSilnik(silnik({ cosfi: 0 })).bledy.map((b) => b.code)).toContain("COSFI");
  });
});
