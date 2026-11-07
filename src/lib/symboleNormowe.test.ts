import { describe, expect, it } from "vitest";
import { glyphBoxSize, montazPrzyscienny, zasiegPrzyscienny } from "./glyphs";
import { symbolNormowy, TYPY_Z_SYMBOLEM_NORMOWYM, type PrymitywSymbolu } from "./symboleNormowe";

/** Skrajne Y narysowanej kreski — napisy pomijamy, bo nie dotykają ściany. */
function zakresY(prymitywy: PrymitywSymbolu[]): { min: number; max: number; maxX: number } {
  const ys: number[] = [];
  const xs: number[] = [];
  for (const p of prymitywy) {
    if (p.k === "linia" || p.k === "wielokat") {
      p.p.forEach((v, i) => (i % 2 ? ys : xs).push(v));
    } else if (p.k === "kolo") {
      ys.push(p.y - p.r, p.y + p.r);
      xs.push(Math.abs(p.x) + p.r);
    } else if (p.k === "sciezka") {
      const liczby = p.d.match(/-?\d+(\.\d+)?/g)!.map(Number);
      // „M x y A r r rot large sweep x y" — punkty końcowe łuku i jego promień
      const [x0, y0, r] = [liczby[0], liczby[1], liczby[2]];
      ys.push(y0, y0 + (p.d.includes(" 0 0 0 ") ? r : -r));
      xs.push(Math.abs(x0));
    }
  }
  return { min: Math.min(...ys), max: Math.max(...ys), maxX: Math.max(...xs.map(Math.abs)) };
}

describe("symbole normowe zamiast plakietek z kodem", () => {
  it("obejmują typy wskazane w audycie: TV, LAN, DIM, EV", () => {
    for (const t of ["rtvsat", "rj45", "sciemniacz", "ladowarkaEV"] as const) {
      expect(symbolNormowy(t), t).not.toBeNull();
    }
  });

  it("gniazdo RTV i RJ45 różnią się oznaczeniem systemu", () => {
    const napis = (t: "rtvsat" | "rj45") => symbolNormowy(t)!.find((p) => p.k === "tekst");
    expect(napis("rtvsat")).toMatchObject({ t: "TV" });
    expect(napis("rj45")).toMatchObject({ t: "LAN" });
  });

  it.each(TYPY_Z_SYMBOLEM_NORMOWYM)("%s dotyka ściany krawędzią pudełka i z niego nie wystaje", (t) => {
    const { w, h } = glyphBoxSize(t);
    const { min, max, maxX } = zakresY(symbolNormowy(t)!);
    // strona przyścienna to lokalne −Y; odsunięcie od ściany się nie zmieniło,
    // więc elementy już postawione w projektach nadal dotykają muru
    expect(min).toBeCloseTo(-zasiegPrzyscienny(t), 5);
    expect(montazPrzyscienny(t)).toBe(0);
    expect(max).toBeLessThanOrEqual(h / 2 + 0.01);
    expect(maxX).toBeLessThanOrEqual(w / 2 + 1);
  });

  it("typy bez symbolu normowego dostają null", () => {
    expect(symbolNormowy("gniazdko")).toBeNull();
    expect(symbolNormowy("wlacznik")).toBeNull();
  });
});
