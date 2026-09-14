import type { ElementType, InstallationElement, Point } from "@/types";
import { fixtureSizeM, SANITARY_FIXTURES } from "@/lib/elements";
import { JEDNOSTKI_NA_METR } from "@/lib/symbolScale";

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

/**
 * Geometria symbolu gniazda: trzonek i łuk. Trzymana tu, bo rysują ją DWA niezależne
 * renderery (SVG w bibliotece i Konva na planie), a od niej zależy jeszcze trzecia
 * rzecz — punkt, którym gniazdko dotyka ściany (`zasiegPrzyscienny`). Trzy kopie tych
 * samych liczb rozjechałyby się przy pierwszej zmianie rozmiaru symbolu.
 */
export const SOCKET_GLYPH = {
  /** Promień łuku. */
  r: 9,
  /** Długość trzonka, od końca do cięciwy łuku. */
  stemLen: 12,
  /** Połowa wysokości symbolu — trzonek zaczyna się na `-half`, łuk kończy na `+half`. */
  get half() {
    return (this.stemLen + this.r) / 2;
  },
} as const;

/** Typy rysowane symbolem gniazda (łuk + trzonek), niezależnie od tego, co jest w łuku. */
const SOCKET_TYPES: readonly ElementType[] = ["gniazdko", "gniazdkoHerm", "gniazdko400", "wypustAGD"];

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
export function glyphBoxSize(type: ElementType, wymiaryM?: { widthM: number; depthM: number }): { w: number; h: number } {
  // Wszystkie łączniki mają jedno pudełko: dźwignie odchodzą w różne strony zależnie od
  // typu, więc symetryczny obrys jest jedynym, który obejmuje każdy z nich tak samo.
  if (isSwitchType(type)) return { w: 36, h: 36 };
  if (type === "gniazdko" || type === "gniazdkoHerm" || type === "wypustAGD" || type === "gniazdko400") {
    // Gniazdko wielokrotne rysuje się jak pojedyncze, z liczbą gniazd wyśrodkowaną wewnątrz
    // łuku (konwencja rysunku instalacyjnego) — płytka jest więc zawsze tej samej wielkości,
    // niezależnie od liczby gniazd. Rozmiar symbolu (trzon+łuk) dobrany pod obrazek
    // referencyjny — promień łuku 9, trzon 12 (patrz ElementGlyphSvg/Konva).
    // Wypust AGD to TEN SAM symbol gniazda, z literą odbiornika w miejscu liczby gniazd,
    // a gniazdo 400 V — z dopiskiem „3F" w tym samym miejscu. Wszystkie cztery mają więc
    // to samo pudełko.
    return { w: 18, h: 22 };
  }
  if (type === "roleta") return { w: 24, h: 20 };
  if (type === "tasmaLed") return { w: 28, h: 14 };
  if (type === "rozdzielnica") return { w: 28, h: 26 };
  if (type === "szafkaTeletech") return { w: 28, h: 26 };
  // Przybory sanitarne NIE mają rozmiaru umownego — rysujemy je w ich prawdziwych
  // wymiarach (`SANITARY_FIXTURES`), bo obrys wanny i brodzika JEST strefą 1 wg
  // PN-HD 60364-7-701 i walidator mierzy odległości dokładnie od niego. Dobrane
  // wcześniej „na oko” pudełka rozjeżdżały się ze strefą nawet o jedną piątą
  // (wanna 52 × 26 jedn. to 1,82 × 0,91 m zamiast 1,70 × 0,75 m), więc rysunek
  // pokazywał inny obrys niż ten, który aplikacja sprawdza.
  // `wymiaryM` to wymiary KONKRETNEGO przyboru (uzytkownik moze je poprawic, patrz
  // `fixtureSizeM`); bez nich zostaja typowe z katalogu — tak rysuje sie legenda
  // i podglad w bibliotece, gdzie nie ma zadnego konkretnego elementu.
  // O tym, czy to w ogóle przybór, decyduje TYP — `wymiaryM` tylko podmienia liczby.
  // Inaczej podanie ich przez pomyłkę przy gniazdku zamieniłoby je w prostokąt.
  const katalogowy = SANITARY_FIXTURES[type];
  const przybor = katalogowy ? wymiaryM ?? katalogowy : undefined;
  if (przybor) return { w: przybor.widthM * JEDNOSTKI_NA_METR, h: przybor.depthM * JEDNOSTKI_NA_METR };
  if ((["oswietlenie", "kinkiet", "oswietlenieZewn", "puszka", "czujnikRuchu", "czujnikDymu", "wentylator"] as ElementType[]).includes(type)) {
    return { w: 26, h: 26 };
  }
  return { w: 26, h: 24 }; // plakietki z kodem
}

/**
 * Osprzęt przyścienny: czym symbol DOTYKA ściany i jak musi być do niej obrócony.
 *
 * Przyciąganie stawiało środek symbolu na linii ściany, więc gniazdko wychodziło
 * trzonkiem na zewnątrz budynku, łącznik siedział na ścianie okrakiem (pół koła w
 * pokoju, pół w murze), a plakietka RJ45 była przecięta na pół. W rysunku
 * instalacyjnym symbol stoi PO STRONIE POMIESZCZENIA i dotyka ściany tym, czym
 * urządzenie w nią wchodzi.
 */

/**
 * Dodatkowy obrót glifu [stopnie], żeby jego strona przyścienna patrzyła w lokalne −Y
 * — kierunek, który `snapToWall` kieruje w ścianę.
 *
 * Kinkiet jest narysowany „bokiem": jego plecy to pionowa kreska po lewej (lokalne −X),
 * więc bez tej korekty na pionowej ścianie wychodził obrócony o 90° — plecami do
 * podłogi zamiast do muru. Widać to było dopiero na rysunku.
 *
 * Łącznik ma dźwignie narysowane skosem w GÓRĘ, czyli — po przyklejeniu — w stronę
 * ściany. Obrót o 180° odwraca to tak, jak łącznik wygląda naprawdę: koło (puszka
 * w murze) przy ścianie, dźwignie w stronę pomieszczenia. Dla łącznika schodowego
 * i krzyżowego obrót nic nie zmienia, bo ich dźwignie są rozłożone symetrycznie.
 */
export function montazPrzyscienny(type: ElementType): number {
  if (type === "kinkiet") return 90;
  if (isSwitchType(type)) return 180;
  return 0;
}

/**
 * Jak daleko od środka symbolu — po obrocie z `montazPrzyscienny` — sięga jego strona
 * przyścienna [jednostki glifu]. O tyle trzeba odsunąć środek od linii ściany, żeby
 * symbol jej dotknął, zamiast ją przecinać.
 *
 * Liczone z RZECZYWISTEJ geometrii symbolu, nie z pudełka `glyphBoxSize`: pudełko
 * łącznika (36 × 36) jest symetrycznym obrysem obejmującym dźwignie we wszystkie
 * strony, więc odsunięcie o jego połowę zawiesiłoby łącznik w powietrzu.
 */
export function zasiegPrzyscienny(type: ElementType): number {
  if (SOCKET_TYPES.includes(type)) return SOCKET_GLYPH.half;
  // Łącznik dotyka ściany KOŁEM — to ono odpowiada puszce w murze, a dźwignie idą
  // w stronę pomieszczenia (patrz obrót w `montazPrzyscienny`). Wyjątkiem są łącznik
  // schodowy i krzyżowy: ich dźwignie z założenia wychodzą na obie strony, więc jedna
  // zawsze musnie linię ściany. Odsunięcie ich o długość dźwigni oderwałoby koło od
  // muru — a to ono pokazuje, gdzie naprawdę siedzi puszka.
  if (isSwitchType(type)) return switchGlyph(type).r;
  // Kinkiet: plecy oprawy, po obrocie o 90° leżące na lokalnym −Y.
  if (type === "kinkiet") return 11;
  // Oprawa zewnętrzna jest jedynym symbolem, który WYSTAJE poza swoje pudełko:
  // promyki sięgają 13,5 przy pudełku 26 × 26. Pół jednostki, ale to właśnie ono
  // przecinałoby linię ściany.
  if (type === "oswietlenieZewn") return 13.5;
  // Reszta (plakietki z kodem, rozdzielnica, roleta, taśma, puszka, czujnik ruchu,
  // wentylator, oprawa zewnętrzna) to symbole wpisane w swoje pudełko — dotykają
  // ściany jego krawędzią.
  return glyphBoxSize(type).h / 2;
}

/**
 * Rogi symbolu elementu [jedn. planu] — to one, a nie sam środek, wyznaczają, gdzie
 * kończy się narysowana treść.
 *
 * Kadrowanie brało dotąd środki elementów i dokładało `MARGINES_KADROWANIA` (60 jedn.)
 * z każdej strony, żeby nie obciąć symbolu. To zapas na NAJGORSZY przypadek — wannę
 * z jej strefą — więc przy rzucie mieszkania szerokim na 420 jednostek zjadał prawie
 * ćwierć obrazu, choć na planie stały same gniazda o zasięgu kilkunastu jednostek.
 * Licząc pudełko każdego symbolu z osobna (tego samego, którym rysuje go płótno)
 * dostajemy kadr ciasny tam, gdzie może być ciasny, i szeroki tam, gdzie musi.
 */
export function rogiSymbolu(e: InstallationElement, skala: number): Point[] {
  const { w, h } = glyphBoxSize(e.type, fixtureSizeM(e) ?? undefined);
  // Obrót symbolu nie jest tu uwzględniany — bierzemy połowę PRZEKĄTNEJ, czyli
  // okrąg opisany na pudełku. Przy obrocie o 45° pudełko i tak zajmuje tyle miejsca,
  // a kadr ma nie obcinać niezależnie od tego, jak element stoi.
  const r = (Math.hypot(w, h) / 2) * skala;
  return [
    { x: e.x - r, y: e.y - r },
    { x: e.x + r, y: e.y + r },
  ];
}
