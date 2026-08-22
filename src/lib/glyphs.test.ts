import { describe, it, expect } from "vitest";
import { socketGridMetrics, glyphBoxSize, switchGlyph, SWITCH_TYPES } from "./glyphs";

describe("socketGridMetrics", () => {
  it("układa 1-2 gniazda w kolumnie, 3+ w rzędzie", () => {
    expect(socketGridMetrics(1)).toMatchObject({ cols: 1, rows: 1 });
    expect(socketGridMetrics(2)).toMatchObject({ cols: 1, rows: 2 });
    expect(socketGridMetrics(3)).toMatchObject({ cols: 3, rows: 1 });
    expect(socketGridMetrics(6)).toMatchObject({ cols: 6, rows: 1 });
  });

  it("ogranicza liczbę gniazd do zakresu 1-6", () => {
    expect(socketGridMetrics(0).g).toBe(1);
    expect(socketGridMetrics(9).g).toBe(6);
  });
});

describe("glyphBoxSize", () => {
  it("łączniki: wszystkie warianty mają tę samą kwadratową płytkę", () => {
    const box = { w: 36, h: 36 };
    SWITCH_TYPES.forEach((t) => expect(glyphBoxSize(t)).toEqual(box));
  });

  it("gniazdko: zawsze ta sama płytka — liczba gniazd rysuje się wewnątrz łuku, nie poszerza symbolu", () => {
    expect(glyphBoxSize("gniazdko")).toEqual({ w: 18, h: 22 });
    expect(glyphBoxSize("gniazdkoHerm")).toEqual({ w: 18, h: 22 });
  });

  it("typy z okrągłym symbolem dostają kwadratową płytkę 26x26", () => {
    expect(glyphBoxSize("oswietlenie")).toEqual({ w: 26, h: 26 });
    expect(glyphBoxSize("czujnikDymu")).toEqual({ w: 26, h: 26 });
  });

  it("nierozpoznany typ dostaje domyślną plakietkę z kodem", () => {
    expect(glyphBoxSize("rj45")).toEqual({ w: 26, h: 24 });
  });
});

describe("switchGlyph", () => {
  /** Dźwignia to odcinek zaczynający się na krawędzi koła; kreski biegunów są krótsze. */
  const rods = (t: Parameters<typeof switchGlyph>[0]) => {
    const { r, segments } = switchGlyph(t);
    return segments.filter((s) => Math.hypot(s.x1, s.y1) - r < 0.001);
  };

  it("każdy typ ma tyle dźwigni, ile wynika z jego funkcji", () => {
    expect(rods("wlacznik")).toHaveLength(1);
    expect(rods("wlacznikDwubiegunowy")).toHaveLength(1);
    expect(rods("wlacznikGrupowy")).toHaveLength(2);
    expect(rods("wlacznikSchodowy")).toHaveLength(2);
    expect(rods("wlacznikKrzyzowy")).toHaveLength(4);
  });

  it("dwubiegunowy różni się od jednobiegunowego liczbą kresek, nie liczbą dźwigni", () => {
    const one = switchGlyph("wlacznik");
    const two = switchGlyph("wlacznikDwubiegunowy");
    expect(rods("wlacznikDwubiegunowy")).toHaveLength(rods("wlacznik").length);
    expect(two.segments.length).toBe(one.segments.length + 1);
  });

  // Grupowy i schodowy mają po dwie dźwignie, więc po usunięciu kropki odróżnia je
  // wyłącznie ich układ: grupowy steruje dwoma obwodami „w bok" (obie dźwignie w górę),
  // schodowy przełącza między dwoma torami (jedna w górę, jedna w dół).
  it("grupowy ma obie dźwignie w górę, schodowy jedną w górę i jedną w dół", () => {
    const grupowy = rods("wlacznikGrupowy");
    expect(grupowy.every((s) => s.y2 < 0)).toBe(true);

    const schodowy = rods("wlacznikSchodowy");
    expect(schodowy.filter((s) => s.y2 < 0)).toHaveLength(1);
    expect(schodowy.filter((s) => s.y2 > 0)).toHaveLength(1);
  });

  it("dźwignie wychodzą dokładnie z krawędzi koła i biegną na zewnątrz", () => {
    SWITCH_TYPES.forEach((t) => {
      const { r } = switchGlyph(t);
      rods(t).forEach((s) => {
        expect(Math.hypot(s.x1, s.y1)).toBeCloseTo(r, 6);
        expect(Math.hypot(s.x2, s.y2)).toBeGreaterThan(r);
      });
    });
  });

  it("kreska bieguna jest prostopadła do swojej dźwigni", () => {
    const { segments } = switchGlyph("wlacznik");
    const [rod, tick] = segments;
    const dot =
      (rod.x2 - rod.x1) * (tick.x2 - tick.x1) + (rod.y2 - rod.y1) * (tick.y2 - tick.y1);
    expect(dot).toBeCloseTo(0, 6);
  });

  it("kreska bieguna odchyla się przeciwnie do pionowego zwrotu swojej dźwigni", () => {
    SWITCH_TYPES.forEach((t) => {
      const { r, segments } = switchGlyph(t);
      // kreski są doczepione do końca dźwigni, więc każdą łączymy z dźwignią o tym samym
      // kierunku od środka — inaczej nie da się sprawdzić ich wzajemnego zwrotu
      const rodSegs = segments.filter((s) => Math.hypot(s.x1, s.y1) - r < 0.001);
      const tickSegs = segments.filter((s) => Math.hypot(s.x1, s.y1) - r > 0.001);
      expect(tickSegs.length).toBeGreaterThan(0);

      tickSegs.forEach((tick) => {
        const rod = rodSegs.find(
          (rd) => Math.abs(Math.atan2(rd.y2, rd.x2) - Math.atan2(tick.y1, tick.x1)) < 0.001
        )!;
        expect(rod).toBeDefined();
        const rodGoesDown = rod.y2 > rod.y1;
        const tickGoesDown = tick.y2 > tick.y1;
        expect(tickGoesDown).toBe(!rodGoesDown);
      });
    });
  });

  it("dolne dźwignie schodowego i krzyżowego mają kreski skierowane w górę", () => {
    (["wlacznikSchodowy", "wlacznikKrzyzowy"] as const).forEach((t) => {
      const { r, segments } = switchGlyph(t);
      const ticks = segments.filter((s) => Math.hypot(s.x1, s.y1) - r > 0.001);
      const lower = ticks.filter((s) => s.y1 > 0); // kreski przy dźwigniach schodzących w dół
      expect(lower.length).toBeGreaterThan(0);
      lower.forEach((s) => expect(s.y2).toBeLessThan(s.y1));
    });
  });

  it("symbol mieści się w swojej płytce", () => {
    SWITCH_TYPES.forEach((t) => {
      const { w, h } = glyphBoxSize(t);
      switchGlyph(t).segments.forEach((s) => {
        [s.x1, s.x2].forEach((x) => expect(Math.abs(x)).toBeLessThanOrEqual(w / 2));
        [s.y1, s.y2].forEach((y) => expect(Math.abs(y)).toBeLessThanOrEqual(h / 2));
      });
    });
  });
});
