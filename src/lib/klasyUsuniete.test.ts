import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Klasy, które redesign zastąpił komponentami — nie mogą wrócić.
 *
 * Raz już `.pe-btn-copper` zniknęła z arkusza, a osiem surowych <button> dalej jej
 * używało i renderowało się jako goły tekst (patrz e2e/shell-ui.spec.ts). Od PR 2
 * przyciski idą WYŁĄCZNIE przez `Button`, znaczniki przez `Badge` — więc stara klasa
 * w kodzie to zawsze błąd: albo martwa, albo omija komponent.
 */
const USUNIETE: Record<string, RegExp> = {
  "pe-btn-*": /\bpe-btn-(copper|ghost)\b/,
  "pe-chip": /\bpe-chip\b/,
  "pe-tag-*": /\bpe-tag-(blue|green|copper)\b/,
};

function pliki(katalog: string, rozszerzenia: string[]): string[] {
  return readdirSync(katalog).flatMap((n) => {
    const p = join(katalog, n);
    if (statSync(p).isDirectory()) return pliki(p, rozszerzenia);
    return rozszerzenia.some((r) => p.endsWith(r)) ? [p] : [];
  });
}

describe("usunięte klasy interfejsu", () => {
  const zrodla = pliki("src", [".ts", ".tsx", ".css"]).filter((p) => !p.endsWith("klasyUsuniete.test.ts"));

  it("przeszukuje faktyczne źródła (test nie przechodzi na pustym zbiorze)", () => {
    expect(zrodla.length).toBeGreaterThan(50);
  });

  for (const [nazwa, wzor] of Object.entries(USUNIETE)) {
    it(`nikt nie używa ${nazwa}`, () => {
      const trafienia = zrodla.filter((p) => wzor.test(readFileSync(p, "utf8")));
      expect(trafienia).toEqual([]);
    });
  }

  it("tła komunikatów biorą kolor z tokenów, nie z hex z kanałem alfa", () => {
    const RYSUNEK = /DesignCanvas|ElementGlyph|PanelRender|SchemaTab|pdf/i;
    // Każdy dwucyfrowy kanał alfa (dawniej tylko 1x), bez względu na wielkość liter —
    // przeoczone były m.in. #C1793F0D, #C6433A0A i #C6433A40.
    const wzor = /#(C1793F|2D5A8C|3B8C63|C6433A)[0-9A-Fa-f]{2}\b/i;
    const trafienia = zrodla.filter((p) => !RYSUNEK.test(p) && wzor.test(readFileSync(p, "utf8")));
    expect(trafienia).toEqual([]);
  });
});
