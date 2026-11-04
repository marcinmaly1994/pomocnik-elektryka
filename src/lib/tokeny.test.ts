import { describe, it, expect } from "vitest";
import { KOLORY } from "./tokeny";
import config from "../../tailwind.config";
import { kontrast } from "../test/kontrast";

/**
 * Każda para „tekst stanu na tle stanu” i każdy kolor tekstu na tłach aplikacji
 * musi spełniać AA. Tokeny są jedynym źródłem kolorów interfejsu, więc tu pilnujemy,
 * żeby nikt nie rozjaśnił ich „dla wyglądu”.
 */
describe("tokeny kolorów", () => {
  const TLA_APLIKACJI = [KOLORY.surface, KOLORY.paper, KOLORY.surface2];

  for (const [nazwa, tekst] of Object.entries({
    ink: KOLORY.ink,
    blueprint: KOLORY.blueprint,
    copper: KOLORY.copper,
    success: KOLORY.success,
    caution: KOLORY.caution,
    danger: KOLORY.danger,
  })) {
    for (const tlo of TLA_APLIKACJI) {
      it(`${nazwa} na ${tlo} ≥ 4,5:1`, () => expect(kontrast(tekst, tlo)).toBeGreaterThanOrEqual(4.5));
    }
  }

  for (const stan of ["success", "caution", "danger"] as const) {
    it(`${stan} na własnym tle ≥ 4,5:1`, () => {
      expect(kontrast(KOLORY[stan], KOLORY[`${stan}Tlo`])).toBeGreaterThanOrEqual(4.5);
    });
  }

  it("biały tekst na przyciskach głównych (copper i jego hover) ≥ 4,5:1", () => {
    expect(kontrast("#FFFFFF", KOLORY.copper)).toBeGreaterThanOrEqual(4.5);
    expect(kontrast("#FFFFFF", KOLORY.copperHover)).toBeGreaterThanOrEqual(4.5);
  });

  it("grafika stanów (ikony, paski) ≥ 3:1 na bieli", () => {
    expect(kontrast(KOLORY.successGrafika, "#FFFFFF")).toBeGreaterThanOrEqual(3);
    expect(kontrast(KOLORY.dangerGrafika, "#FFFFFF")).toBeGreaterThanOrEqual(3);
  });

  it("motyw Tailwinda bierze kolory z tokenów, a stare nazwy są aliasami", () => {
    const c = config.theme?.extend?.colors as Record<string, unknown>;
    expect((c.copper as { DEFAULT: string }).DEFAULT).toBe(KOLORY.copper);
    expect(c.ok).toBe(KOLORY.successGrafika);
    expect(c.warn).toBe(KOLORY.dangerGrafika);
    expect(c["surface-2"]).toBe(KOLORY.surface2);
  });
});
