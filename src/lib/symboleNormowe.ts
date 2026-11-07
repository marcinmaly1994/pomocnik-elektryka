import type { ElementType } from "@/types";
import { SOCKET_GLYPH } from "@/lib/glyphs";

/**
 * Symbole graficzne zamiast plakietek z kodem literowym (F9 z audytu 5.11.2026).
 *
 * Teletechnika i automatyka rysowały się dotąd jako ramka z napisem („TV", „LAN",
 * „DIM", „EV"), czyli tak, jak nie wygląda żaden rysunek instalacyjny. Tu stoją ich
 * odpowiedniki w konwencji PN-EN 60617-11: gniazdo teletechniczne jako gniazdo z prostą
 * „szczęką" i oznaczeniem systemu, ściemniacz jako łącznik ze strzałką regulacji, napęd
 * jako koło z literą M, dzwonek jako czasza, domofon jako głośnik.
 *
 * Kształty opisane są RAZ, jako lista prymitywów, i rysują je oba renderery (SVG
 * w bibliotece i legendzie, Konva na planie), więc nie mogą się rozjechać.
 *
 * Każdy symbol mieści się w dotychczasowym pudełku plakietki (26 × 24) i dotyka
 * jego górnej krawędzi (lokalne −Y = −12) tym, czym urządzenie wchodzi w ścianę.
 * Dzięki temu `zasiegPrzyscienny` i `montazPrzyscienny` się nie zmieniają: elementy
 * już postawione w projektach zostają dokładnie przy ścianie, bez migracji zapisu.
 */

export type PrymitywSymbolu =
  | { k: "linia"; p: number[]; w?: number }
  /** Zamknięty wielokąt wypełniony tłem — żeby symbol nie był przezroczysty na kratce. */
  | { k: "wielokat"; p: number[]; w?: number }
  | { k: "kolo"; x: number; y: number; r: number; w?: number; pelne?: boolean }
  /** Łuk w notacji ścieżki SVG (Konva `Path` rozumie tę samą składnię). */
  | { k: "sciezka"; d: string; w?: number; tlo?: boolean }
  /** Napis wyśrodkowany w punkcie (x, y). */
  | { k: "tekst"; x: number; y: number; t: string; size: number };

/** Górna (przyścienna) krawędź pudełka plakietki — patrz `glyphBoxSize`. */
const SCIANA = -12;

/**
 * Gniazdo teletechniczne: trzonek od ściany, poprzeczka i prosta „szczęka" otwarta
 * od strony pomieszczenia. Gniazdo wtykowe 230 V ma w tym miejscu łuk; proste boki
 * odróżniają gniazdo słaboprądowe na pierwszy rzut oka, a litery mówią, jakiego
 * systemu (TV — antenowe RTV/SAT, LAN — gniazdo sieci komputerowej RJ45).
 */
function gniazdoTeletechniczne(oznaczenie: string): PrymitywSymbolu[] {
  const bar = -4;
  return [
    { k: "linia", p: [0, SCIANA, 0, bar] },
    { k: "linia", p: [-10, bar, 10, bar] },
    { k: "linia", p: [-8, bar, -8, 9] },
    { k: "linia", p: [8, bar, 8, 9] },
    // trzy litery („LAN") mniejszym stopniem — szczęka ma 16 jednostek szerokości
    { k: "tekst", x: 0, y: 3.5, t: oznaczenie, size: oznaczenie.length > 2 ? 6 : 8 },
  ];
}

/**
 * Gniazdo wtykowe z oznaczeniem w łuku — geometria `SOCKET_GLYPH`, przesunięta tak,
 * żeby koniec trzonka wypadł na krawędzi pudełka plakietki, a nie na `-half`.
 */
function gniazdoWtykowe(oznaczenie: string): PrymitywSymbolu[] {
  const { r, stemLen } = SOCKET_GLYPH;
  const apex = SCIANA + stemLen;
  const chord = apex + r;
  return [
    { k: "linia", p: [0, SCIANA, 0, apex] },
    { k: "linia", p: [-r, apex, r, apex] },
    { k: "sciezka", d: `M ${-r} ${chord} A ${r} ${r} 0 0 1 ${r} ${chord}` },
    // tuż nad cięciwą, gdzie łuk jest najszerszy — wyżej dwie litery wchodzą na łuk
    { k: "tekst", x: 0, y: chord - 2, t: oznaczenie, size: 7 },
  ];
}

/** Koło dotykające ściany, z literą w środku — napęd (M), termostat (θ), czujnik CO. */
function koloZOznaczeniem(t: string, size = 10): PrymitywSymbolu[] {
  return [
    { k: "kolo", x: 0, y: 0, r: -SCIANA, pelne: true, w: 2 },
    { k: "tekst", x: 0, y: 0.5, t, size },
  ];
}

/**
 * Ściemniacz: łącznik jednobiegunowy (koło z dźwignią i kreską bieguna) przecięty
 * strzałką nastawiania (znak regulacji płynnej z PN-EN 60617-2). Koło dotyka ściany,
 * dźwignia idzie w pomieszczenie — tak jak u łącznika po przyklejeniu.
 */
function sciemniacz(): PrymitywSymbolu[] {
  const r = 6;
  const cy = SCIANA + r;
  const u = Math.SQRT1_2;
  const rod0 = [u * r, cy + u * r];
  const rod1 = [u * (r + 9), cy + u * (r + 9)];
  return [
    { k: "kolo", x: 0, y: cy, r, w: 2 },
    { k: "linia", p: [rod0[0], rod0[1], rod1[0], rod1[1]], w: 2 },
    // kreska bieguna, prostopadła do dźwigni i zawracająca ku poziomowi
    { k: "linia", p: [rod1[0], rod1[1], rod1[0] + u * 4.5, rod1[1] - u * 4.5], w: 2 },
    // strzałka regulacji: przez koło, z lewego dołu w prawą górę
    // (grot zostaje poniżej linii ściany — symbol ma jej dotykać kołem, nie strzałką)
    { k: "linia", p: [-6.5, cy + 6, 7, cy - 5.5], w: 1.4 },
    { k: "linia", p: [7, cy - 5.5, 2.6, cy - 5], w: 1.4 },
    { k: "linia", p: [7, cy - 5.5, 6.6, cy - 1.2], w: 1.4 },
  ];
}

/** Dzwonek: czasza zwrócona w pomieszczenie, na podstawie z dwoma doprowadzeniami. */
function dzwonek(): PrymitywSymbolu[] {
  const baza = SCIANA + 6;
  return [
    { k: "linia", p: [-4, SCIANA, -4, baza] },
    { k: "linia", p: [4, SCIANA, 4, baza] },
    { k: "sciezka", d: `M -10 ${baza} A 10 10 0 0 0 10 ${baza} Z`, tlo: true },
  ];
}

/** Domofon (unifon): głośnik — magnes przy ścianie, membrana rozchylona w pomieszczenie. */
function domofon(): PrymitywSymbolu[] {
  const magnes = SCIANA + 7;
  return [
    { k: "wielokat", p: [-4, SCIANA, 4, SCIANA, 4, magnes, -4, magnes] },
    { k: "wielokat", p: [-4, magnes, 4, magnes, 10, 10, -10, 10] },
  ];
}

const SYMBOLE: Partial<Record<ElementType, () => PrymitywSymbolu[]>> = {
  rtvsat: () => gniazdoTeletechniczne("TV"),
  rj45: () => gniazdoTeletechniczne("LAN"),
  ladowarkaEV: () => gniazdoWtykowe("EV"),
  sciemniacz,
  dzwonek,
  domofon,
  napedBramy: () => koloZOznaczeniem("M"),
  termostat: () => koloZOznaczeniem("θ", 11),
  czujnikCzadu: () => koloZOznaczeniem("CO", 8.5),
};

/** Prymitywy symbolu danego typu albo `null`, gdy typ rysuje się inaczej. */
export function symbolNormowy(type: ElementType): PrymitywSymbolu[] | null {
  const f = SYMBOLE[type];
  return f ? f() : null;
}

/** Typy, które mają symbol graficzny z tego modułu. */
export const TYPY_Z_SYMBOLEM_NORMOWYM = Object.keys(SYMBOLE) as ElementType[];
