import { describe, it, expect } from "vitest";
import { socketGridMetrics, glyphBoxSize, montazPrzyscienny, SOCKET_GLYPH, switchGlyph, SWITCH_TYPES, zasiegPrzyscienny } from "./glyphs";

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

/**
 * Czym symbol dotyka ściany. Liczby są tu wypisane wprost, bo to one decydują, czy
 * gniazdko stanie NA ścianie, czy ją przetnie — a różnicę widać wyłącznie na rysunku.
 */
describe("zasiegPrzyscienny / montazPrzyscienny", () => {
  it("gniazdko dotyka ściany końcem trzonka, nie krawędzią pudełka", () => {
    expect(zasiegPrzyscienny("gniazdko")).toBe(SOCKET_GLYPH.half);
    expect(zasiegPrzyscienny("gniazdko")).toBe(10.5);
    // Pudełko jest wyższe od symbolu (22 wobec 21) — gdyby zasięg brał się z niego,
    // gniazdko wisiałoby pół jednostki nad ścianą.
    expect(zasiegPrzyscienny("gniazdko")).toBeLessThan(glyphBoxSize("gniazdko").h / 2);
  });

  it("wszystkie warianty gniazda mają ten sam trzonek", () => {
    (["gniazdko", "gniazdkoHerm", "gniazdko400", "wypustAGD"] as const).forEach((t) =>
      expect(zasiegPrzyscienny(t)).toBe(SOCKET_GLYPH.half)
    );
    // Mimo że gniazdo 400 V ma wyższe pudełko — dopisek „3F" siedzi POD łukiem,
    // czyli po stronie pomieszczenia, i do ściany nic mu nie jest.
    expect(glyphBoxSize("gniazdko400").h).toBeGreaterThan(glyphBoxSize("gniazdko").h);
  });

  it("łącznik dotyka ściany kołem — to ono odpowiada puszce w murze", () => {
    SWITCH_TYPES.forEach((t) => {
      expect(zasiegPrzyscienny(t)).toBe(switchGlyph(t).r);
      expect(montazPrzyscienny(t)).toBe(180);
      // Połowa pudełka (18) oderwałaby koło od muru o jedenaście jednostek — pudełko
      // obejmuje dźwignie we wszystkie strony, więc nie mówi nic o styku ze ścianą.
      expect(zasiegPrzyscienny(t)).toBeLessThan(glyphBoxSize(t).h / 2);
    });
  });

  /**
   * Po obrocie montażowym dźwignie mają iść W POMIESZCZENIE. Sprawdzamy to na
   * geometrii po obrocie, bo to jedyny sposób odróżnić „dźwignie w dół" od „w górę"
   * bez patrzenia na rysunek.
   */
  it("po obrocie dźwignie odchodzą od ściany, nie w nią", () => {
    const poObrocie = (t: (typeof SWITCH_TYPES)[number]) =>
      // Obrót o 180 stopni to zmiana znaku obu współrzędnych.
      switchGlyph(t).segments.map((s) => ({ y1: -s.y1, y2: -s.y2 }));
    (["wlacznik", "wlacznikDwubiegunowy", "wlacznikGrupowy"] as const).forEach((t) => {
      // Dodatnie y to strona pomieszczenia (ściana jest na -y).
      poObrocie(t).forEach((s) => {
        expect(s.y1).toBeGreaterThanOrEqual(-1e-9);
        expect(s.y2).toBeGreaterThanOrEqual(-1e-9);
      });
    });
    // Schodowy i krzyżowy mają dźwignie na obie strony z definicji symbolu, więc
    // jedna zawsze musnie ścianę — obrót niczego tu nie zmienia i nie ma czego udawać.
    (["wlacznikSchodowy", "wlacznikKrzyzowy"] as const).forEach((t) => {
      expect(poObrocie(t).some((s) => s.y2 < 0)).toBe(true);
    });
  });

  it("plakietka z kodem dotyka ściany krawędzią pudełka", () => {
    expect(zasiegPrzyscienny("rj45")).toBe(glyphBoxSize("rj45").h / 2);
  });

  it("oprawa zewnętrzna liczy się z promyków, które wystają poza pudełko", () => {
    expect(zasiegPrzyscienny("oswietlenieZewn")).toBeGreaterThan(glyphBoxSize("oswietlenieZewn").h / 2);
  });

  it("kinkiet ma własny obrót montażowy — jest narysowany bokiem", () => {
    expect(montazPrzyscienny("kinkiet")).toBe(90);
    expect(zasiegPrzyscienny("kinkiet")).toBe(11);
    (["gniazdko", "rj45", "rozdzielnica"] as const).forEach((t) =>
      expect(montazPrzyscienny(t)).toBe(0)
    );
  });
});
