import { describe, expect, it } from "vitest";
import {
  impedancjaTransformatora,
  obliczPradyZwarciowe,
  obliczWytrzymaloscZwarciowa,
  wspolczynnikC,
} from "./shortCircuit";

/** Wartości oczekiwane z przykładów ręcznie policzonych w specyfikacji (pkt 5.4). */

describe("impedancja transformatora", () => {
  it("Sn = 630 kVA, uk = 4%, Un = 400 V → Zt = 10,16 mΩ", () => {
    const r = impedancjaTransformatora({ Sn_VA: 630_000, uk_pct: 4, Un_V: 400 });
    expect(r.bledy).toEqual([]);
    expect(r.wartosci!.Zt_ohm * 1000).toBeCloseTo(10.16, 2);
  });

  it("straty obciążeniowe rozdzielają Zt na Rt i Xt (Xt = √(Zt² − Rt²))", () => {
    const r = impedancjaTransformatora({ Sn_VA: 630_000, uk_pct: 4, Un_V: 400, straty_Cu_W: 6500 });
    const { Zt_ohm, Rt_ohm, Xt_ohm } = r.wartosci!;
    // Rt = 6500·400²/630000² = 2,62 mΩ
    expect(Rt_ohm * 1000).toBeCloseTo(2.62, 2);
    expect(Math.hypot(Rt_ohm, Xt_ohm)).toBeCloseTo(Zt_ohm, 9);
  });

  it("straty dające Rt > Zt to niespójne dane — błąd, nie urojona reaktancja", () => {
    const r = impedancjaTransformatora({ Sn_VA: 630_000, uk_pct: 4, Un_V: 400, straty_Cu_W: 60_000 });
    expect(r.wartosci).toBeNull();
    expect(r.bledy.map((b) => b.code)).toContain("STRATY_NIESPOJNE");
  });

  it("dane niedodatnie są odrzucane zamiast dawać dzielenie przez zero", () => {
    expect(impedancjaTransformatora({ Sn_VA: 0, uk_pct: 4, Un_V: 400 }).bledy.map((b) => b.code)).toContain("SN");
    expect(impedancjaTransformatora({ Sn_VA: 630_000, uk_pct: 0, Un_V: 400 }).bledy.map((b) => b.code)).toContain("UK");
  });
});

describe("prądy zwarciowe", () => {
  it("Zt = 10,16 mΩ, c = 1,05, Un = 400 V → Ik3 ≈ 23,9 kA", () => {
    const r = obliczPradyZwarciowe({ cel: "dobor_aparatu", Un_V: 400, U0_V: 230, Zk_ohm: 0.010159 });
    expect(r.wartosci!.Ik3_A / 1000).toBeCloseTo(23.9, 1);
  });

  it("c zależy od CELU obliczenia i nie da się go pomylić (spec pkt 7)", () => {
    expect(wspolczynnikC("dobor_aparatu")).toBe(1.05);
    expect(wspolczynnikC("ochrona_przeciwporazeniowa")).toBe(0.95);

    const doboru = obliczPradyZwarciowe({ cel: "dobor_aparatu", Un_V: 400, U0_V: 230, Zk_ohm: 0.01 });
    const ochrony = obliczPradyZwarciowe({ cel: "ochrona_przeciwporazeniowa", Un_V: 400, U0_V: 230, Zk_ohm: 0.01 });
    // do ochrony liczymy przypadek NAJMNIEJSZEGO prądu — musi wyjść mniej
    expect(ochrony.wartosci!.Ik3_A).toBeLessThan(doboru.wartosci!.Ik3_A);
    expect(doboru.zalozenia.join(" ")).toMatch(/1,05/);
    expect(ochrony.zalozenia.join(" ")).toMatch(/0,95/);
  });

  it("zwarcie dwufazowe to 0,866 zwarcia trójfazowego", () => {
    const r = obliczPradyZwarciowe({ cel: "dobor_aparatu", Un_V: 400, U0_V: 230, Zk_ohm: 0.02 });
    expect(r.wartosci!.Ik2_A / r.wartosci!.Ik3_A).toBeCloseTo(Math.sqrt(3) / 2, 6);
  });

  it("zwarcie jednofazowe liczy się z impedancji pętli, gdy ją podano", () => {
    const bez = obliczPradyZwarciowe({ cel: "ochrona_przeciwporazeniowa", Un_V: 400, U0_V: 230, Zk_ohm: 0.02 });
    expect(bez.wartosci!.Ik1_A).toBeNull();

    const z = obliczPradyZwarciowe({ cel: "ochrona_przeciwporazeniowa", Un_V: 400, U0_V: 230, Zk_ohm: 0.02, Zs_ohm: 1 });
    expect(z.wartosci!.Ik1_A).toBeCloseTo(0.95 * 230, 6);
  });

  it("prąd udarowy liczy się z κ zależnego od R/X", () => {
    const r = obliczPradyZwarciowe({ cel: "dobor_aparatu", Un_V: 400, U0_V: 230, Zk_ohm: 0.01, R_do_X: 0.1 });
    // κ = 1,02 + 0,98·e^(−0,3) = 1,746
    expect(r.wartosci!.kappa!).toBeCloseTo(1.746, 3);
    // ip liczone z PEŁNEJ precyzji κ, nie z wartości zaokrąglonej do prezentacji
    expect(r.wartosci!.ip_A!).toBeCloseTo(r.wartosci!.kappa! * Math.SQRT2 * r.wartosci!.Ik3_A, 6);
  });
});

describe("wytrzymałość zwarciowa cieplna", () => {
  it("Ik = 3 kA, t = 0,1 s, Cu/PVC (k = 115) → S ≥ 8,25 mm²", () => {
    const r = obliczWytrzymaloscZwarciowa({ Ik_A: 3000, czas_s: 0.1, material: "Cu", izolacja: "PVC" });
    expect(r.wartosci!.k).toBe(115);
    expect(r.wartosci!.minPrzekroj_mm2).toBeCloseTo(8.25, 2);
  });

  it("przekrój 10 mm² spełnia ten warunek, 6 mm² już nie", () => {
    const ok = obliczWytrzymaloscZwarciowa({ Ik_A: 3000, czas_s: 0.1, material: "Cu", izolacja: "PVC", przekroj_mm2: 10 });
    expect(ok.ocena!.verdict).toBe("spelniony");

    const zaMaly = obliczWytrzymaloscZwarciowa({ Ik_A: 3000, czas_s: 0.1, material: "Cu", izolacja: "PVC", przekroj_mm2: 6 });
    expect(zaMaly.ocena!.verdict).toBe("niespelniony");
    expect(zaMaly.ocena!.komunikat).toMatch(/przegrzać/i);
  });

  it("przekrój tuż nad wymaganym jest GRANICZNY, nie „spełniony”", () => {
    // wymagane 8,25 mm² — 8,5 mm² daje zapas ok. 3%
    const r = obliczWytrzymaloscZwarciowa({ Ik_A: 3000, czas_s: 0.1, material: "Cu", izolacja: "PVC", przekroj_mm2: 8.5 });
    expect(r.ocena!.verdict).toBe("graniczny");
  });

  it("aluminium i XLPE mają własne k — nie wolno ich mylić z miedzią", () => {
    expect(obliczWytrzymaloscZwarciowa({ Ik_A: 3000, czas_s: 0.1, material: "Al", izolacja: "PVC" }).wartosci!.k).toBe(76);
    expect(obliczWytrzymaloscZwarciowa({ Ik_A: 3000, czas_s: 0.1, material: "Cu", izolacja: "XLPE" }).wartosci!.k).toBe(143);
    expect(obliczWytrzymaloscZwarciowa({ Ik_A: 3000, czas_s: 0.1, material: "Al", izolacja: "XLPE" }).wartosci!.k).toBe(94);
  });

  it("czas powyżej 5 s wykracza poza wzór adiabatyczny — błąd, nie ekstrapolacja", () => {
    const r = obliczWytrzymaloscZwarciowa({ Ik_A: 3000, czas_s: 6, material: "Cu", izolacja: "PVC" });
    expect(r.wartosci).toBeNull();
    expect(r.bledy.map((b) => b.code)).toContain("CZAS_POZA_ZAKRESEM");
  });

  it("maksymalny czas trwania zwarcia jest odwrotnością tego samego wzoru", () => {
    const r = obliczWytrzymaloscZwarciowa({ Ik_A: 3000, czas_s: 0.1, material: "Cu", izolacja: "PVC", przekroj_mm2: 10 });
    // t_max = (115·10/3000)² = 0,147 s
    expect(r.wartosci!.maksCzas_s!).toBeCloseTo(0.147, 3);
  });
});
