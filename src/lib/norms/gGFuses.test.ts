import { describe, expect, it } from "vitest";
import { dobierzWkladkeGG, dostepneInGG, punktCzasowy, wierszGG, type TypWkladkiGG } from "./gGFuses";

const TYPY: TypWkladkiGG[] = ["D0gG", "WT00gG_WT1gG"];

describe("tablice gG — spójność fizyczna (łapie literówki przy przepisywaniu)", () => {
  for (const typ of TYPY) {
    for (const In of dostepneInGG(typ)) {
      const w = wierszGG(typ, In)!;

      it(`${typ} In=${In}A: k2 = I2/In`, () => {
        expect(w.I2_A / w.In_A).toBeCloseTo(w.k2, 1);
      });

      for (const [nazwa, punkt] of [
        ["0,2s", w.t02],
        ["0,4s", w.t04],
        ["5s", w.t5],
      ] as const) {
        it(`${typ} In=${In}A @ ${nazwa}: Zkdop = 230/Imax`, () => {
          // Zkdop w tablicy jest zaokrąglone do 2 miejsc po przecinku — przy
          // małych wartościach Zkdop (duże In) samo to zaokrąglenie daje kilka
          // procent błędu względnego, więc tolerancja jest BEZWZGLĘDNA (0,01 Ω:
          // maks. błąd zaokrąglenia w źródle), nie względna.
          const oczekiwane = 230 / punkt.Imax_A;
          expect(Math.abs(oczekiwane - punkt.Zkdop_ohm)).toBeLessThan(0.01);
        });
        it(`${typ} In=${In}A @ ${nazwa}: k = Imax/In`, () => {
          expect(punkt.Imax_A / w.In_A).toBeCloseTo(punkt.k, 1);
        });
      }

      it(`${typ} In=${In}A: Imax rośnie, gdy czas maleje (0,2s ≥ 0,4s ≥ 5s)`, () => {
        expect(w.t02.Imax_A).toBeGreaterThanOrEqual(w.t04.Imax_A);
        expect(w.t04.Imax_A).toBeGreaterThanOrEqual(w.t5.Imax_A);
      });
    }
  }
});

describe("gGFuses — dobór i odczyt", () => {
  it("dobierzWkladkeGG wybiera najmniejsze In ≥ Ib", () => {
    expect(dobierzWkladkeGG("D0gG", 30)?.In_A).toBe(35);
    expect(dobierzWkladkeGG("D0gG", 35)?.In_A).toBe(35);
  });

  it("dobierzWkladkeGG zwraca undefined poza zakresem tablicy", () => {
    expect(dobierzWkladkeGG("D0gG", 1000)).toBeUndefined();
  });

  it("D0gG i WT00gG/WT1gG mają RÓŻNE charakterystyki przy tym samym In", () => {
    const d0 = wierszGG("D0gG", 16)!;
    const wt = wierszGG("WT00gG_WT1gG", 16)!;
    expect(d0.t02.Imax_A).not.toBe(wt.t02.Imax_A);
  });

  it("punktCzasowy zwraca właściwy punkt dla każdego czasu", () => {
    const w = wierszGG("D0gG", 16)!;
    expect(punktCzasowy(w, "0.2").Imax_A).toBe(132.8);
    expect(punktCzasowy(w, "0.4").Imax_A).toBe(120.0);
    expect(punktCzasowy(w, "5").Imax_A).toBe(70.4);
  });
});
