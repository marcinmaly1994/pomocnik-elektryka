import type { ElementType } from "@/types";

/** Geometria siatki gniazd w ramce (1–6 gniazd: do 2 w kolumnie, więcej w rzędzie). Przeniesione 1:1 z `socketGridMetrics`. */
export interface SocketGridMetrics {
  g: number;
  cols: number;
  rows: number;
  cell: number;
  gap: number;
  pad: number;
  w: number;
  h: number;
}

export function socketGridMetrics(gangs: number): SocketGridMetrics {
  const g = Math.max(1, Math.min(6, gangs || 1));
  const cols = g <= 2 ? 1 : g;
  const rows = g <= 2 ? g : 1;
  const cell = 17;
  const gap = 1.5;
  const pad = 4;
  const w = cols * cell + (cols - 1) * gap + pad * 2;
  const h = rows * cell + (rows - 1) * gap + pad * 2;
  return { g, cols, rows, cell, gap, pad, w, h };
}

/** Łączniki rysowane symbolem instalacyjnym (koło + dźwignie) wg zestawu symboli
 *  przesłanego przez użytkownika. Kolejność jak w bibliotece elementów. */
export const SWITCH_TYPES = [
  "wlacznik",
  "wlacznikDwubiegunowy",
  "wlacznikGrupowy",
  "wlacznikSchodowy",
  "wlacznikKrzyzowy",
] as const satisfies readonly ElementType[];

export function isSwitchType(type: ElementType): boolean {
  return (SWITCH_TYPES as readonly ElementType[]).includes(type);
}

const SW_R = 7; // promień koła łącznika
const SW_ROD = 12; // długość dźwigni, licząc od krawędzi koła
const SW_TICK = 5; // kreska oznaczająca biegun

/** Kąty dźwigni w stopniach (układ ekranowy: y rośnie w dół, więc −45 to skos w górę-prawo). */
const SW_RODS: Record<string, number[]> = {
  wlacznik: [-45],
  wlacznikDwubiegunowy: [-45],
  wlacznikGrupowy: [-135, -45],
  wlacznikSchodowy: [-45, 135],
  wlacznikKrzyzowy: [-135, -45, 45, 135],
};

export interface GlyphSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface SwitchGlyph {
  r: number;
  segments: GlyphSegment[];
}

/**
 * Geometria symbolu łącznika: koło i odchodzące od niego dźwignie zakończone kreskami
 * biegunów. Liczona w jednym miejscu, bo rysują ją dwa niezależne renderery (SVG w
 * bibliotece i Konva na planie) — trzymanie współrzędnych osobno w każdym z nich
 * gwarantowałoby, że prędzej czy później zaczną pokazywać różne symbole.
 *
 * Liczba biegunów jest cechą TYPU, nie osobnym licznikiem: „dwubiegunowy" dostaje dwie
 * kreski na jednej dźwigni, „grupowy" dwie dźwignie z jedną kreską każda.
 */
export function switchGlyph(type: ElementType): SwitchGlyph {
  const angles = SW_RODS[type] ?? SW_RODS.wlacznik;
  const poles = type === "wlacznikDwubiegunowy" ? 2 : 1;
  const segments: GlyphSegment[] = [];

  angles.forEach((deg) => {
    const a = (deg * Math.PI) / 180;
    const ux = Math.cos(a);
    const uy = Math.sin(a);
    segments.push({ x1: ux * SW_R, y1: uy * SW_R, x2: ux * (SW_R + SW_ROD), y2: uy * (SW_R + SW_ROD) });
    // Kreska bieguna jest prostopadła do dźwigni, a z dwóch możliwych prostopadłych
    // bierzemy tę odchyloną PRZECIWNIE do pionowego zwrotu dźwigni: przy dźwigni idącej
    // w górę kreska schodzi w dół, przy idącej w dół — podnosi się. Haczyk zawsze
    // „zawraca" więc ku poziomowi, zamiast przedłużać dźwignię w jej własną stronę.
    // Sam znak `ux` nie wystarcza: dawał zwrot zależny od tego, czy dźwignia idzie w
    // lewo czy w prawo, przez co dolne dźwignie (schodowy, krzyżowy) dostawały kreski
    // skierowane w dół zamiast w górę.
    const vertical = Math.sign(ux * uy);
    // dla dźwigni poziomej/pionowej (iloczyn 0) „przeciwnie do pionu" nie jest
    // zdefiniowane — wtedy dowolna prostopadła jest równie dobra
    const tilt = vertical === 0 ? 1 : -vertical;
    const perpX = -uy * tilt;
    const perpY = ux * tilt;
    for (let i = 0; i < poles; i++) {
      const d = SW_R + SW_ROD - i * 4;
      const px = ux * d;
      const py = uy * d;
      segments.push({ x1: px, y1: py, x2: px + perpX * SW_TICK, y2: py + perpY * SW_TICK });
    }
  });

  return { r: SW_R, segments };
}

/**
 * Gdzie postawić etykiety numerów grup sterowania oświetleniem — POZA obrysem symbolu,
 * żeby cyfra na niego nie nachodziła.
 *
 * Łącznik grupowy dostaje dwie pozycje, po jednej przy każdej dźwigni, bo ma dwa
 * niezależne obwody i każdy może sterować inną lampą. Kolejność odpowiada kolejności
 * numerów zwracanych przez `computeLightGroups` (lewa dźwignia, potem prawa).
 */
export function groupLabelAnchors(type: ElementType): { x: number; y: number }[] {
  if (type === "wlacznikGrupowy") {
    return SW_RODS.wlacznikGrupowy.map((deg) => {
      const a = (deg * Math.PI) / 180;
      const d = SW_R + SW_ROD + 8;
      return { x: Math.cos(a) * d, y: Math.sin(a) * d };
    });
  }
  const { w } = glyphBoxSize(type);
  return [{ x: w / 2 + 8, y: 0 }];
}

/** Rozmiar „płytki” danego typu — używany zarówno do rysowania symbolu, jak i obwódki
 *  zaznaczenia. Rozmiar zależy już wyłącznie od typu: gniazda wielokrotne rysują się jak
 *  pojedyncze (liczba w łuku), a łączniki mają jedno pudełko dla wszystkich wariantów. */
export function glyphBoxSize(type: ElementType): { w: number; h: number } {
  // Wszystkie łączniki mają jedno pudełko: dźwignie odchodzą w różne strony zależnie od
  // typu, więc symetryczny obrys jest jedynym, który obejmuje każdy z nich tak samo.
  if (isSwitchType(type)) return { w: 36, h: 36 };
  if (type === "gniazdko" || type === "gniazdkoHerm") {
    // Gniazdko wielokrotne rysuje się jak pojedyncze, z liczbą gniazd wyśrodkowaną wewnątrz
    // łuku (konwencja rysunku instalacyjnego) — płytka jest więc zawsze tej samej wielkości,
    // niezależnie od liczby gniazd. Rozmiar symbolu (trzon+łuk) dobrany pod obrazek
    // referencyjny — promień łuku 9, trzon 12 (patrz ElementGlyphSvg/Konva).
    return { w: 18, h: 22 };
  }
  if (type === "roleta") return { w: 24, h: 20 };
  if (type === "tasmaLed") return { w: 28, h: 14 };
  if (type === "rozdzielnica") return { w: 28, h: 26 };
  if (type === "wanna") return { w: 52, h: 26 };
  if (type === "prysznic") return { w: 30, h: 30 };
  if (type === "umywalka") return { w: 26, h: 20 };
  if ((["oswietlenie", "kinkiet", "oswietlenieZewn", "puszka", "czujnikRuchu", "czujnikDymu", "wentylator"] as ElementType[]).includes(type)) {
    return { w: 26, h: 26 };
  }
  return { w: 26, h: 24 }; // plakietki z kodem
}
