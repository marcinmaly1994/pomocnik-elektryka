import type { GlyphSpec } from "./deviceGlyphs";

/**
 * Wstawia symbol na oś `x`, rozciągnięty dokładnie od `top` do `bottom`. Skala wynika
 * z wysokości symbolu w pliku źródłowym, więc proporcje nigdy się nie zniekształcają,
 * a końce przewodu trafiają co do piksela na wskazane poziomy siatki schematu.
 */
export function CadGlyph({ spec, x, top, bottom }: { spec: GlyphSpec; x: number; top: number; bottom: number }) {
  const scale = (bottom - top) / (spec.bottomY - spec.topY);
  return (
    <g transform={`translate(${x} ${top}) scale(${scale}) translate(${-spec.axisX} ${-spec.topY})`}>
      <spec.Paths />
    </g>
  );
}
