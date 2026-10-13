import { describe, it, expect } from "vitest";
import config from "../../tailwind.config";

/**
 * Tekst wtórny musi spełniać próg AA (4,5:1) na każdym tle, na którym występuje.
 *
 * Domyślne slate-400/500 Tailwinda dawały 2,3–4,2:1 i audyt axe-core wskazał ok. 540
 * takich miejsc. Kolory przyciemniono w motywie (`tailwind.config.ts`); ten test pilnuje,
 * żeby ich ktoś nie rozjaśnił z powrotem „dla lepszego wyglądu".
 */
function luminancja(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}

function kontrast(a: string, b: string): number {
  const [x, y] = [luminancja(a), luminancja(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

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
