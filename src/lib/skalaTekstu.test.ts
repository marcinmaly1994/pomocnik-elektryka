import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Rozmiary tekstu tylko ze skali Tailwinda (xs 12 … 3xl 30), nigdy `text-[11px]`.
 *
 * Przed redesignem było 17 rozmiarów (8,5–23 px) i ok. 120 miejsc z tekstem 10–11 px —
 * nieczytelnym na budowie i w samochodzie. Minimum interfejsu to `text-xs` (12 px).
 * Napisy rysowane na płótnie (Konva, SVG z `fontSize`) tej reguły nie dotyczą —
 * to grafika techniczna i nie używa klas.
 */
function plikiTsx(katalog: string): string[] {
  return readdirSync(katalog).flatMap((n) => {
    const p = join(katalog, n);
    return statSync(p).isDirectory() ? plikiTsx(p) : p.endsWith(".tsx") ? [p] : [];
  });
}

describe("skala tekstu", () => {
  it("żaden komponent nie używa dowolnego rozmiaru text-[Npx]", () => {
    const naruszenia = plikiTsx("src").flatMap((plik) =>
      (readFileSync(plik, "utf8").match(/text-\[\d+(\.\d+)?px\]/g) ?? []).map((m) => `${plik}: ${m}`)
    );
    expect(naruszenia).toEqual([]);
  });

  it("arkusz nie ustawia tekstu poniżej 12 px", () => {
    const css = readFileSync("src/index.css", "utf8");
    const male = [...css.matchAll(/font-size:\s*(\d+(\.\d+)?)px/g)].map((m) => Number(m[1])).filter((v) => v < 12);
    expect(male).toEqual([]);
  });
});
