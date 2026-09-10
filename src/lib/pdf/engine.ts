/**
 * Silnik PDF — wielostronicowy dokument z tekstem, liniami i tłem, napisany od zera
 * (bez zewnętrznych bibliotek typu jsPDF), przeniesiony z oryginalnego pliku JS.
 *
 * Polskie znaki: standardowe kodowanie WinAnsi nie zawiera ą/ć/ę/ł/ń/ś/ź/ż, więc font
 * dostaje własną tablicę /Differences mapującą kody 128+ na nazwy glifów. W oryginale to
 * polegało na podstawieniu fontu Helvetica przez czytnik PDF — działało niepewnie, bo nie
 * każdy czytnik ma te glify w swoim foncie zastępczym. Tutaj zamiast tego osadzamy realny
 * font (DejaVu Sans, licencja pozwala na osadzanie/redystrybucję — zob.
 * src/assets/fonts/DejaVuSans-LICENSE.txt) jako /FontFile2, więc znaki renderują się
 * poprawnie niezależnie od czytnika. Metryki (szerokości, wysokości) czyta `ttf.ts`
 * bezpośrednio z plików fontu.
 *
 * W wersji JS `createPdfDoc(...).finish(filename)` od razu assemblował PDF i uruchamiał
 * pobieranie w jednej funkcji. Tutaj rozdzielone: `finish()` zwraca same bajty (testowalne
 * bez DOM-u — patrz `assemblePdfBytes`, które przyjmuje już sparsowane fonty i jest w pełni
 * synchroniczne/czyste), a wywołanie pobierania w przeglądarce jest osobnym krokiem (zob.
 * download.ts). `finish()` jest asynchroniczne tylko dlatego, że pierwsze użycie musi pobrać
 * (`fetch`) i sparsować pliki fontów — wynik jest cache'owany w module, więc kolejne PDF-y
 * w tej samej sesji nie pobierają ich ponownie.
 */

import { parseTtf, type ParsedTtf } from "./ttf";
import regularFontUrl from "@/assets/fonts/DejaVuSans.ttf?url";
import boldFontUrl from "@/assets/fonts/DejaVuSans-Bold.ttf?url";

export const PDF_POLISH: Record<string, number> = {
  ą: 128, ć: 129, ę: 130, ł: 131, ń: 132, ó: 133, ś: 134, ź: 135, ż: 136,
  Ą: 137, Ć: 138, Ę: 139, Ł: 140, Ń: 141, Ó: 142, Ś: 143, Ź: 144, Ż: 145,
  // Znaki JEDNOSTEK. Wcześniej szły przez `PDF_FALLBACK` jako transliteracje: „MΩ"
  // wychodziło „MOhm", „°C" jako „st.C", „IΔn" jako „Idn". W protokole pomiarowym to
  // nie jest drobiazg — „MOhm" nie jest poprawnym zapisem jednostki, a dłuższe o dwa
  // znaki etykiety rozpychały nagłówki tak, że „R min [MOhm]" stykało się z „Ocena".
  //
  // Kody muszą iść BEZ DZIUR od 128: /Differences wypisuje nazwy glifów jednym ciągiem
  // od 128, a tablica szerokości leci po kolei do `PDF_LAST_CHAR`.
  Ω: 146, "°": 147, Δ: 148, μ: 149, "·": 150, "²": 151,
};

export const PDF_DIFF_NAMES = [
  "aogonek", "cacute", "eogonek", "lslash", "nacute", "oacute", "sacute", "zacute", "zdotaccent",
  "Aogonek", "Cacute", "Eogonek", "Lslash", "Nacute", "Oacute", "Sacute", "Zacute", "Zdotaccent",
  "Omega", "degree", "Delta", "mu", "periodcentered", "twosuperior",
];

/** Najwyższy kod obsadzony w /Differences — liczony, a nie wpisany na sztywno, żeby
 *  dołożenie glifu nie wymagało pamiętania o `/LastChar` i o tablicach szerokości. */
export const PDF_LAST_CHAR = Math.max(...Object.values(PDF_POLISH));

export const PDF_FALLBACK: Record<string, string> = {
  "—": "-", "–": "-", "„": '"', "”": '"', "×": "x", "…": "...", " ": " ",
  "≤": "<=", "≥": ">=",
};

/**
 * Metryki OSADZONEGO fontu (jednostki/1000) — kody 32..126, potem 127 (nieużywany)
 * i 128+ dla glifów z /Differences (polskie litery, dalej jednostki).
 *
 * Wyliczone z PLIKÓW DejaVu leżących w src/assets/fonts i pilnowane testem, który
 * parsuje te pliki i porównuje je z tą tablicą — rozjechać się mogą tylko razem
 * z podmianą fontu, i wtedy test to powie.
 *
 * HISTORIA: wcześniej stały tu metryki HELWETYKI, bo tablice powstały, zanim dokument
 * zaczął osadzać własny font. Rozjazd nie był kosmetyczny: DejaVu jest średnio 17%
 * (regular) i 21% (bold) szersza, na pojedynczych znakach nawet dwukrotnie. Wszystko,
 * co mierzy tekst — przycinanie do kolumny (pdfFitText), wyrównanie do prawej,
 * pozycja wartości za etykietą — liczyło się z zaniżonych liczb, więc napisy wychodziły
 * poza swoje rubryki. Łatane to było lokalnie: 30% zapasu w nagłówku protokołu,
 * szersze wcięcie kolumn w karcie obliczeń, skrócone nazwy w tabliczce. Te łatki
 * zniknęły razem z przyczyną.
 */
export const PDF_W_REG = [
  318, 401, 460, 838, 636, 950, 780, 275, 390, 390, 500, 838, 318, 361, 318, 337,
  636, 636, 636, 636, 636, 636, 636, 636, 636, 636, 337, 337, 838, 838, 838, 531,
  1000, 684, 686, 698, 770, 632, 575, 775, 752, 295, 295, 656, 557, 863, 748, 787,
  603, 787, 695, 635, 611, 732, 684, 989, 685, 611, 685, 390, 337, 390, 838, 500,
  500, 613, 635, 550, 635, 615, 352, 635, 634, 278, 278, 579, 278, 974, 634, 612,
  635, 635, 411, 521, 392, 634, 592, 818, 592, 592, 525, 636, 337, 636, 838, 0,
  613, 550, 615, 284, 634, 612, 521, 525, 525, 684, 698, 632, 562, 748, 787, 635,
  685, 685, 764, 500, 684, 636, 318, 401,
];

export const PDF_W_BOLD = [
  348, 456, 521, 838, 696, 1002, 872, 306, 457, 457, 523, 838, 380, 415, 380, 365,
  696, 696, 696, 696, 696, 696, 696, 696, 696, 696, 400, 400, 838, 838, 838, 580,
  1000, 774, 762, 734, 830, 683, 683, 821, 837, 372, 372, 775, 637, 995, 837, 850,
  733, 850, 770, 720, 682, 812, 774, 1103, 771, 724, 725, 457, 365, 457, 838, 500,
  500, 675, 716, 593, 716, 678, 435, 716, 712, 343, 343, 665, 343, 1042, 712, 687,
  716, 716, 493, 595, 478, 712, 652, 924, 645, 652, 582, 712, 365, 712, 838, 0,
  675, 593, 678, 371, 712, 687, 595, 582, 582, 774, 734, 683, 642, 837, 850, 720,
  725, 725, 850, 500, 774, 736, 380, 438,
];

/** Zamienia znak na kod używany w strumieniu PDF (z uwzględnieniem polskich znaków i zamienników). */
export function pdfCharCode(ch: string): number {
  if (PDF_POLISH[ch] !== undefined) return PDF_POLISH[ch];
  const code = ch.codePointAt(0) ?? 63;
  if (code >= 32 && code <= 126) return code;
  const fb = PDF_FALLBACK[ch];
  if (fb !== undefined && fb.length === 1) return fb.codePointAt(0) ?? 63;
  return 63; // "?"
}

export function pdfCharWidth(code: number, bold: boolean): number {
  const table = bold ? PDF_W_BOLD : PDF_W_REG;
  const w = table[code - 32];
  return w === undefined ? 556 : w;
}

/** Szerokość napisu w punktach — pozwala przycinać tekst do realnej szerokości kolumny,
 *  zamiast zgadywać po liczbie znaków (co przy polskich literach dawało błędne wyniki). */
export function pdfTextWidth(str: string, size: number, bold: boolean): number {
  let total = 0;
  for (const ch of String(str)) {
    const multi = PDF_FALLBACK[ch];
    if (multi !== undefined && multi.length > 1) {
      for (const c2 of multi) total += pdfCharWidth(c2.codePointAt(0) ?? 63, bold);
      continue;
    }
    total += pdfCharWidth(pdfCharCode(ch), bold);
  }
  return (total * size) / 1000;
}

export function pdfFitText(str: string, maxWidth: number, size: number, bold: boolean): string {
  if (pdfTextWidth(str, size, bold) <= maxWidth) return str;
  const ell = "..";
  let out = "";
  for (const ch of String(str)) {
    if (pdfTextWidth(out + ch + ell, size, bold) > maxWidth) break;
    out += ch;
  }
  return out + ell;
}

export function pdfEscape(str: string): string {
  let out = "";
  for (const ch of String(str)) {
    if (PDF_POLISH[ch] !== undefined) {
      out += "\\" + PDF_POLISH[ch].toString(8).padStart(3, "0");
      continue;
    }
    if (ch === "(" || ch === ")" || ch === "\\") {
      out += "\\" + ch;
      continue;
    }
    const code = ch.codePointAt(0) ?? 0;
    if (code < 32 || code > 126) {
      out += PDF_FALLBACK[ch] !== undefined ? PDF_FALLBACK[ch] : "?";
      continue;
    }
    out += ch;
  }
  return out;
}

/**
 * Obraz gotowy do osadzenia. `bytes` to już ZAKODOWANY strumień (skompresowany zlib
 * dla `FlateDecode` albo surowy plik JPEG dla `DCTDecode`) — silnik go nie przetwarza,
 * tylko wkleja, dokładnie jak plik fontu. Przygotowaniem zajmuje się `raster.ts`.
 */
export interface PdfImage {
  bytes: Uint8Array;
  /** Szerokość w PIKSELACH — rozmiar na stronie podaje się osobno, w punktach. */
  width: number;
  height: number;
  filter: "FlateDecode" | "DCTDecode";
}

export interface PdfDoc {
  y: number;
  readonly pageW: number;
  readonly margin: number;
  readonly innerW: number;
  setNewPageHandler(fn: (doc: PdfDoc) => void): void;
  text(str: string, x: number, y: number, size?: number, bold?: boolean, gray?: number): void;
  line(x1: number, y1: number, x2: number, y2: number, w?: number, gray?: number): void;
  /**
   * Linia w KOLORZE, opcjonalnie kreskowana. Osobno od `line`, bo tamta operuje
   * odcieniem szarości — a rysunek techniczny potrzebuje szarości niemal wszędzie
   * i koloru tylko tam, gdzie niesie on treść: przy próbkach tras obwodów.
   *
   * `kreska` to wzór w punktach PDF-a (np. `[1, 3]`), pusty albo pominięty = ciągła.
   */
  liniaKolor(x1: number, y1: number, x2: number, y2: number, rgb: [number, number, number], w?: number, kreska?: number[]): void;
  /** Wypełniony prostokąt w KOLORZE — próbka barwy obwodu w spisie. */
  boxKolor(x: number, y: number, w: number, h: number, rgb: [number, number, number]): void;
  box(x: number, y: number, w: number, h: number, gray?: number): void;
  /** Wstawia obraz. `x`,`y` to LEWY DOLNY róg — jak w `box`, bo PDF liczy od dołu. */
  image(img: PdfImage, x: number, y: number, w: number, h: number): void;
  /** Zapewnia miejsce na kolejny blok; w razie potrzeby rysuje stopkę na bieżącej stronie i zaczyna nową. */
  ensure(h: number): boolean;
  /** Assembluje kompletny plik PDF i zwraca jego bajty (bez efektu ubocznego pobierania).
   *  Asynchroniczne — przy pierwszym wywołaniu w sesji pobiera i parsuje pliki fontów. */
  finish(): Promise<Uint8Array>;
  /**
   * Zamyka dokument i oddaje jego CZĘŚCI zamiast gotowego pliku — strony i obrazy.
   *
   * Tym żyje komplet dokumentacji: kilka dokumentów zbudowanych osobno składa się
   * w jeden plik (`polaczDokumenty`), zamiast sklejać gotowe PDF-y, co wymagałoby
   * parsowania i przenumerowywania cudzej struktury obiektów.
   *
   * Zamknięcie strony jest idempotentne i wspólne z `finish()` — drugie wywołanie
   * nie dokłada bieżącej strony po raz drugi ani nie rysuje tabliczki dwa razy.
   */
  czesci(): CzesciDokumentu;
}

/**
 * Strona gotowa do złożenia: strumień treści plus rozmiar WŁASNEJ kartki.
 *
 * Rozmiar jest cechą STRONY, nie dokumentu — komplet miesza pion (kosztorys, legenda)
 * z poziomem (rzut, schemat, karta obliczeń) i każda strona musi zachować swój format.
 * Wcześniej `assemblePdfBytes` dostawała jeden rozmiar na cały plik, bo każdy dokument
 * powstawał osobno i pytanie o mieszanie formatów nie istniało.
 */
export interface StronaPdf {
  content: string;
  w: number;
  h: number;
}

export interface CzesciDokumentu {
  pages: StronaPdf[];
  images: PdfImage[];
}

export interface PdfDocOptions {
  pageW?: number;
  pageH?: number;
  margin?: number;
  footer?: (doc: PdfDoc) => void;
}

/** Uniwersalny silnik PDF — wielostronicowy dokument z tekstem, liniami i tłem. */
export function createPdfDoc({ pageW = 595.28, pageH = 841.89, margin = 42, footer }: PdfDocOptions = {}): PdfDoc {
  const pages: string[] = [];
  const obrazy: PdfImage[] = [];

  /**
   * Białe tło strony — pierwsza rzecz na KAŻDEJ stronie.
   *
   * PDF bez jawnie namalowanego tła jest PRZEZROCZYSTY. Czytniki składające go na
   * jasnym podłożu dorysowują biel za nas i wszystko wygląda dobrze — ale wbudowany
   * czytnik Chrome ma podłoże CIEMNE (#525659), więc przezroczysta strona wychodzi
   * w nim czarnym prostokątem z ledwo widocznym tekstem. Ten sam mechanizm opisuje
   * komentarz przy rasteryzacji wgrywanych rzutów w `lib/detect/source.ts`:
   * „przezroczystość po rasteryzacji wychodzi czarna".
   *
   * Tło należy więc do DOKUMENTU, a nie do komponentu, który go pokazuje — dotyczy
   * tak samo podglądu, wydruku i każdego czytnika, w którym plik wyląduje.
   */
  const tloStrony = () => `1 g 0 0 ${pageW.toFixed(2)} ${pageH.toFixed(2)} re f 0 g`;

  let content: string[] = [tloStrony()];
  let y = pageH - margin;
  let onNewPage: ((doc: PdfDoc) => void) | null = null;
  const footerReserve = footer ? 50 : 26; // zarezerwowane miejsce nad tabliczką rysunkową

  const api: PdfDoc = {
    get y() {
      return y;
    },
    set y(v: number) {
      y = v;
    },
    get pageW() {
      return pageW;
    },
    get margin() {
      return margin;
    },
    get innerW() {
      return pageW - margin * 2;
    },
    setNewPageHandler(fn) {
      onNewPage = fn;
    },
    text(str, x, yy, size = 9, bold = false, gray = 0) {
      content.push(`${gray} g BT /${bold ? "F2" : "F1"} ${size} Tf ${x.toFixed(1)} ${yy.toFixed(1)} Td (${pdfEscape(str)}) Tj ET 0 g`);
    },
    line(x1, y1, x2, y2, w = 0.6, gray = 0.75) {
      content.push(`${gray} G ${w} w ${x1.toFixed(1)} ${y1.toFixed(1)} m ${x2.toFixed(1)} ${y2.toFixed(1)} l S`);
    },
    liniaKolor(x1, y1, x2, y2, rgb, w = 1, kreska) {
      const [r, g, b] = rgb;
      const wzor = kreska?.length ? `[${kreska.join(" ")}] 0 d ` : "";
      content.push(
        `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} RG ${w} w ${wzor}${x1.toFixed(1)} ${y1.toFixed(1)} m ${x2.toFixed(1)} ${y2.toFixed(1)} l S [] 0 d 0 G`
      );
    },
    boxKolor(x, yy, w, h, rgb) {
      const [r, g, b] = rgb;
      content.push(`${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg ${x.toFixed(1)} ${yy.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)} re f 0 g`);
    },
    box(x, yy, w, h, gray = 0.93) {
      content.push(`${gray} g ${x.toFixed(1)} ${yy.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)} re f 0 g`);
    },
    image(img, x, yy, w, h) {
      // Ten sam obraz wstawiony dwa razy ma być JEDNYM obiektem w pliku — inaczej
      // rysunek na kilku stronach mnożyłby megabajty.
      let nr = obrazy.indexOf(img);
      if (nr === -1) nr = obrazy.push(img) - 1;
      // `cm` skaluje jednostkowy kwadrat obrazu do docelowego prostokąta i przesuwa go
      // na miejsce; `q`/`Q` zamykają tę transformację, żeby nie wyciekła na dalszy rysunek.
      content.push(`q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${yy.toFixed(2)} cm /Im${nr + 1} Do Q`);
    },
    ensure(h) {
      if (y - h < margin + footerReserve) {
        if (footer) footer(api);
        pages.push(content.join("\n"));
        content = [tloStrony()];
        y = pageH - margin;
        if (onNewPage) onNewPage(api);
        return true;
      }
      return false;
    },
    czesci() {
      zamknij();
      return { pages: pages.map((content) => ({ content, w: pageW, h: pageH })), images: obrazy };
    },
    finish() {
      return zlozPdf(api.czesci());
    },
  };

  /** Domyka bieżącą stronę razem z tabliczką. Raz — `finish()` i `czesci()` prowadzą
   *  do tego samego miejsca, a podwójne domknięcie dokleiłoby pustą kartkę z drugą
   *  tabliczką. */
  let zamkniety = false;
  function zamknij() {
    if (zamkniety) return;
    zamkniety = true;
    if (footer) footer(api);
    pages.push(content.join("\n"));
  }

  return api;
}

/**
 * Składa CZĘŚCI kilku dokumentów w jeden zestaw stron i obrazów.
 *
 * Cała trudność siedzi w obrazach: strumień strony odwołuje się do nich przez `/Im1`,
 * `/Im2`… liczone od zera W SWOIM dokumencie. Po zlepieniu dwóch dokumentów `/Im1`
 * drugiego wskazywałoby rysunek pierwszego — na kartce wyszedłby rzut parteru w miejscu
 * schematu. Numery są więc przesuwane o tyle, ile obrazów wniosły dokumenty przed nim.
 *
 * Podmiana jest bezpieczna, bo to NASZ generator: `/Im<n> Do` powstaje wyłącznie
 * w `image()` i nigdzie indziej taki token się nie pojawia (tekst jest escapowany,
 * a nazwy fontów to /F1 i /F2).
 */
/** Zamienia części (własne albo złożone z kilku dokumentów) w gotowy plik. Osobno od
 *  `finish()`, bo komplet dokumentacji nie ma jednego dokumentu, tylko ich listę. */
export async function zlozPdf(czesci: CzesciDokumentu): Promise<Uint8Array> {
  const { regular, bold } = await loadPdfFonts();
  return assemblePdfBytes(czesci.pages, regular, bold, czesci.images);
}

export function polaczDokumenty(dokumenty: CzesciDokumentu[]): CzesciDokumentu {
  const pages: StronaPdf[] = [];
  const images: PdfImage[] = [];
  for (const d of dokumenty) {
    const przesuniecie = images.length;
    for (const strona of d.pages) {
      pages.push({
        ...strona,
        content:
          przesuniecie === 0
            ? strona.content
            : strona.content.replace(/\/Im(\d+) Do/g, (_, nr: string) => `/Im${Number(nr) + przesuniecie} Do`),
      });
    }
    images.push(...d.images);
  }
  return { pages, images };
}

/** Code (128..145) -> code point Unicode, odwrócone z `PDF_POLISH` — do wyliczania
 *  realnych szerokości polskich znaków z osadzonego fontu. */
const PDF_POLISH_BY_CODE: Record<number, number> = {};
for (const ch of Object.keys(PDF_POLISH)) {
  PDF_POLISH_BY_CODE[PDF_POLISH[ch]] = ch.codePointAt(0)!;
}

/** Konwertuje bajty na "binarny" JS string (jeden code unit = jeden bajt) — do osadzenia
 *  surowego pliku fontu w strumieniu obiektu PDF. Fragmentami, żeby nie przekroczyć limitu
 *  argumentów `String.fromCharCode(...)` dla dużych plików fontów. */
function bytesToBinaryString(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let out = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    out += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return out;
}

/** Realne szerokości znaków (kody 32..145) z osadzonego fontu, z awaryjnym spadkiem na
 *  tabelę z tego modułu, gdyby jakiegoś code pointa w foncie zabrakło (dziś nie brakuje
 *  żadnego — pilnuje tego test „każdy używany kod ma szerokość z fontu"). */
function widthsForFont(font: ParsedTtf, fallback: number[]): number[] {
  const widths: number[] = [];
  for (let code = 32; code <= PDF_LAST_CHAR; code++) {
    if (code === 127) {
      widths.push(0);
      continue;
    }
    const codePoint = code <= 126 ? code : PDF_POLISH_BY_CODE[code];
    const w = codePoint !== undefined ? font.widthOf(codePoint) : null;
    widths.push(w ?? fallback[code - 32] ?? 556);
  }
  return widths;
}

let cachedFonts: Promise<{ regular: ParsedTtf; bold: ParsedTtf }> | null = null;

/** Pobiera i parsuje pliki fontów DejaVu Sans (regular + bold) — raz na sesję, wynik
 *  cache'owany w module. `regularFontUrl`/`boldFontUrl` to adresy zassetowane przez Vite. */
function loadPdfFonts(): Promise<{ regular: ParsedTtf; bold: ParsedTtf }> {
  if (!cachedFonts) {
    cachedFonts = Promise.all([
      fetch(regularFontUrl).then((r) => r.arrayBuffer()),
      fetch(boldFontUrl).then((r) => r.arrayBuffer()),
    ]).then(([regularBuf, boldBuf]) => ({
      regular: parseTtf(new Uint8Array(regularBuf)),
      bold: parseTtf(new Uint8Array(boldBuf)),
    }));
  }
  return cachedFonts;
}

/** Składa strumienie stron w kompletny plik PDF i zwraca jego bajty. Czysta/synchroniczna —
 *  fonty przekazywane są już sparsowane (patrz `loadPdfFonts`), co czyni tę funkcję w pełni
 *  testowalną bez sieci/DOM-u (testy wczytują pliki fontów z dysku przez `fs`). */
export function assemblePdfBytes(
  pages: StronaPdf[],
  regularFont: ParsedTtf,
  boldFont: ParsedTtf,
  images: PdfImage[] = []
): Uint8Array {
  const objs: string[] = [];
  const push = (s: string) => {
    objs.push(s);
    return objs.length;
  };

  const contentIds = pages.map((s) => push(`<< /Length ${s.content.length} >>\nstream\n${s.content}\nendstream`));
  const encId = push(`<< /Type /Encoding /BaseEncoding /WinAnsiEncoding /Differences [128 ${PDF_DIFF_NAMES.map((n) => "/" + n).join(" ")}] >>`);

  function pushFont(font: ParsedTtf, baseFontName: string, fallbackWidths: number[], stemV: number): number {
    const fontFileId = push(`<< /Length ${font.bytes.length} /Length1 ${font.bytes.length} >>\nstream\n${bytesToBinaryString(font.bytes)}\nendstream`);
    const descId = push(
      `<< /Type /FontDescriptor /FontName /${baseFontName} /Flags 32 ` +
        `/FontBBox [${font.bbox.join(" ")}] /ItalicAngle ${font.italicAngle} ` +
        `/Ascent ${font.ascent} /Descent ${font.descent} /CapHeight ${font.capHeight} /StemV ${stemV} ` +
        `/FontFile2 ${fontFileId} 0 R >>`
    );
    return push(
      `<< /Type /Font /Subtype /TrueType /BaseFont /${baseFontName} /FirstChar 32 /LastChar ${PDF_LAST_CHAR} ` +
        `/Widths [${widthsForFont(font, fallbackWidths).join(" ")}] /Encoding ${encId} 0 R /FontDescriptor ${descId} 0 R >>`
    );
  }

  const f1 = pushFont(regularFont, "DejaVuSans", PDF_W_REG, 80);
  const f2 = pushFont(boldFont, "DejaVuSans-Bold", PDF_W_BOLD, 120);

  // Obrazy jako XObject-y — bajty wklejane surowo, tak samo jak plik fontu.
  // Wrzucane PRZED wyliczeniem `pagesId`, bo ono zakłada, że po tym miejscu
  // dochodzą już tylko obiekty stron.
  const imageIds = images.map((im) =>
    push(
      `<< /Type /XObject /Subtype /Image /Width ${im.width} /Height ${im.height} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /${im.filter} /Length ${im.bytes.length} >>\n` +
        `stream\n${bytesToBinaryString(im.bytes)}\nendstream`
    )
  );
  const xobjRes = imageIds.length
    ? ` /XObject << ${imageIds.map((id, i) => `/Im${i + 1} ${id} 0 R`).join(" ")} >>`
    : "";

  const pagesId = objs.length + pages.length + 1;
  const kidsIds = pages.map((strona, i) =>
    push(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${strona.w.toFixed(2)} ${strona.h.toFixed(2)}] ` +
        `/Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >>${xobjRes} >> /Contents ${contentIds[i]} 0 R >>`
    )
  );
  push(`<< /Type /Pages /Kids [${kidsIds.map((k) => k + " 0 R").join(" ")}] /Count ${kidsIds.length} >>`);
  const catalogId = push(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objs.forEach((body, idx) => {
    offsets.push(pdf.length);
    pdf += `${idx + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefPos = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objs.length; i++) pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;

  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff;
  return bytes;
}
