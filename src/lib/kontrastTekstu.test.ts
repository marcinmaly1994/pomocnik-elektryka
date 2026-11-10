import { describe, it, expect } from "vitest";
import config from "../../tailwind.config";
import { kontrast, luminancja } from "../test/kontrast";

/**
 * Tekst wtórny musi spełniać próg AA (4,5:1) na każdym tle, na którym występuje.
 *
 * Domyślne slate-400/500 Tailwinda dawały 2,3–4,2:1 i audyt axe-core wskazał ok. 540
 * takich miejsc. Kolory przyciemniono w motywie (`tailwind.config.ts`); ten test pilnuje,
 * żeby ich ktoś nie rozjaśnił z powrotem „dla lepszego wyglądu".
 */
// Najjaśniejsze i najciemniejsze tła, na których stoi tekst wtórny w aplikacji.
const TLA = { biel: "#FFFFFF", paper: "#EEF1F4", szareTlo: "#ECECED" };

describe("kontrast tekstu wtórnego (slate w motywie)", () => {
  const slate = (config.theme?.extend?.colors as { slate: Record<string, string> }).slate;

  for (const stopien of ["400", "500"] as const) {
    for (const [nazwa, tlo] of Object.entries(TLA)) {
      it(`slate-${stopien} na tle „${nazwa}" ma co najmniej 4,5:1`, () => {
        expect(kontrast(slate[stopien], tlo)).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  it("zachowuje kolejność jasności: 400 jaśniejszy od 500", () => {
    expect(luminancja(slate["400"])).toBeGreaterThan(luminancja(slate["500"]));
  });
});

describe("kontrast miedzi marki (copper w motywie)", () => {
  const copper = (config.theme?.extend?.colors as { copper: { DEFAULT: string } }).copper.DEFAULT;

  it("biały tekst na miedzi ma co najmniej 4,5:1 (przyciski)", () => {
    expect(kontrast("#FFFFFF", copper)).toBeGreaterThanOrEqual(4.5);
  });

  for (const [nazwa, tlo] of Object.entries(TLA)) {
    it(`tekst w kolorze miedzi na tle „${nazwa}" ma co najmniej 4,5:1`, () => {
      expect(kontrast(copper, tlo)).toBeGreaterThanOrEqual(4.5);
    });
  }
});
