import type { DocumentHeader } from "@/types";
import { createPdfDoc, pdfFitText, pdfTextWidth, type PdfDoc, type PdfImage } from "./engine";
import { drawTitleBlock, TITLE_BLOCK_H } from "./titleBlock";
import { downloadPdfBytes, projectFileName } from "./download";

/**
 * Rysunek techniczny w PDF: kartka pozioma, tabliczka rysunkowa na dole, rysunek
 * dopasowany do wolnego pola i — opcjonalnie — legenda w kolumnie po prawej.
 *
 * Wspólne dla schematu jednokreskowego i rzutu kondygnacji, bo w obu przypadkach
 * problem jest ten sam: zmieścić jeden duży rysunek na kartce, nie deformując go.
 *
 * Rysunek wchodzi jako obraz (patrz `raster.ts`), ale WSZYSTKO wokół — tabliczka,
 * ramka i legenda — jest rysowane prymitywami PDF-a. Dzięki temu opisy w legendzie
 * i metryce są ostre w każdym powiększeniu i dają się zaznaczyć oraz przeszukać,
 * czego wydruk zrzutu ekranu nigdy nie daje.
 */

/**
 * Pozycja legendy: symbol (rasteryzowany glif) + jego opis.
 *
 * Świadomie BEZ liczby sztuk. Legenda objaśnia, co dany znak oznacza — zestawienie
 * ilościowe to inny dokument (kosztorys) i inny moment pracy. Liczba na rysunku
 * dodatkowo starzeje się przy każdej zmianie projektu, więc wydrukowana obok symbolu
 * bywa po prostu nieprawdziwa.
 */
export interface PozycjaLegendy {
  symbol: PdfImage;
  opis: string;
}

/** Wiersz zestawienia ilościowego — jeden rodzaj osprzętu w jednym pomieszczeniu. */
export interface PozycjaZestawienia {
  element: string;
  pomieszczenie: string;
  ilosc: number;
}

export interface RysunekPdfOpcje {
  /** Tytuł trafiający do tabliczki rysunkowej. */
  tytul: string;
  header: DocumentHeader;
  rysunek: PdfImage;
  legenda?: PozycjaLegendy[];
  /** Zestawienie ilościowe na osobnej stronie za rysunkiem. Pominięte, gdy puste —
   *  pusta strona z samym nagłówkiem to gorszy dokument niż jego brak. */
  zestawienie?: PozycjaZestawienia[];
}

// A4 poziomo. Rysunki są szersze niż wyższe — i schemat jednokreskowy, i rzut
// kondygnacji — więc pionowa kartka marnowałaby połowę arkusza.
const STRONA_W = 841.89;
const STRONA_H = 595.28;
const MARGINES = 36;

/** Szerokość kolumny legendy. Na tyle wąska, żeby rysunek dostał resztę kartki,
 *  na tyle szeroka, żeby zmieścił się dwuwierszowy opis symbolu. */
const LEGENDA_W = 176;
const LEGENDA_SYMBOL = 20;
const LEGENDA_WIERSZ = 26;
/** Wysokość paska nagłówka „LEGENDA". */
const LEGENDA_NAGLOWEK = 20;

/** Wysokość paska zajmowanego przez tabliczkę rysunkową u dołu strony. */
const TABLICZKA_H = TITLE_BLOCK_H + 8;

/** Łamie opis na dwie linie mieszczące się w kolumnie legendy. */
function dwieLinie(tekst: string, maxW: number, size: number): [string, string | null] {
  if (pdfTextWidth(tekst, size, false) <= maxW) return [tekst, null];
  const slowa = tekst.split(/\s+/);
  let pierwsza = "";
  let i = 0;
  for (; i < slowa.length; i++) {
    const kandydat = pierwsza ? `${pierwsza} ${slowa[i]}` : slowa[i];
    if (pierwsza && pdfTextWidth(kandydat, size, false) > maxW) break;
    pierwsza = kandydat;
  }
  const reszta = slowa.slice(i).join(" ");
  return [pierwsza, reszta ? pdfFitText(reszta, maxW, size, false) : null];
}
/** Wymiary bloku legendy przy zadanej liczbie kolumn. */
function wymiarLegendy(pozycji: number, kolumny: number): { w: number; h: number } {
  const wierszy = Math.ceil(pozycji / kolumny);
  return { w: kolumny * LEGENDA_W, h: LEGENDA_NAGLOWEK + wierszy * LEGENDA_WIERSZ };
}

/**
 * Rysuje blok legendy o lewym dolnym rogu w `(x, dol)`, w `kolumny` kolumnach.
 *
 * Wydzielone z układu strony, bo legenda ma teraz DWA miejsca: kolumnę po prawej albo
 * pasek pod rysunkiem — patrz `wybierzUklad`.
 */
function rysujLegende(doc: PdfDoc, pozycje: PozycjaLegendy[], x: number, dol: number, kolumny: number) {
  const { w, h } = wymiarLegendy(pozycje.length, kolumny);
  const gora = dol + h;
  const wierszy = Math.ceil(pozycje.length / kolumny);

  doc.box(x, dol, w, h, 0.985);
  doc.line(x, dol, x + w, dol, 0.7, 0.55);
  doc.line(x, gora, x + w, gora, 0.7, 0.55);
  doc.line(x, dol, x, gora, 0.7, 0.55);
  doc.line(x + w, dol, x + w, gora, 0.7, 0.55);

  doc.box(x, gora - LEGENDA_NAGLOWEK, w, LEGENDA_NAGLOWEK, 0.88);
  doc.text("LEGENDA", x + 8, gora - 14, 9, true);
  doc.line(x, gora - LEGENDA_NAGLOWEK, x + w, gora - LEGENDA_NAGLOWEK, 0.5, 0.55);

  pozycje.forEach((poz, i) => {
    // Czytamy WIERSZAMI, od lewej do prawej — tak samo jak tekst obok.
    const kolumna = i % kolumny;
    const wiersz = Math.floor(i / kolumny);
    const lx = x + kolumna * LEGENDA_W;
    const y = gora - LEGENDA_NAGLOWEK - (wiersz + 1) * LEGENDA_WIERSZ;
    const srodek = y + LEGENDA_WIERSZ / 2;

    doc.image(poz.symbol, lx + 8, srodek - LEGENDA_SYMBOL / 2, LEGENDA_SYMBOL, LEGENDA_SYMBOL);
    const opisX = lx + 8 + LEGENDA_SYMBOL + 8;
    const opisW = LEGENDA_W - (opisX - lx) - 8;
    const [l1, l2] = dwieLinie(poz.opis, opisW, 7.5);
    if (l2) {
      doc.text(l1, opisX, srodek + 1, 7.5);
      doc.text(l2, opisX, srodek - 8, 7.5);
    } else {
      doc.text(l1, opisX, srodek - 3, 7.5);
    }

    // Kreska tylko MIĘDZY wierszami: pod ostatnim leży już dolna ramka i podwójna
    // linia w tym miejscu wygląda jak niedomknięta tabela.
    if (wiersz < wierszy - 1) doc.line(lx, y, lx + LEGENDA_W, y, 0.3, 0.88);
    // ...i pionowa między kolumnami, żeby dwie pozycje obok siebie się nie zlewały.
    if (kolumna > 0) doc.line(lx, y, lx, y + LEGENDA_WIERSZ, 0.3, 0.88);
  });
}


export function buildDrawingDoc({ tytul, header, rysunek, legenda, zestawienie }: RysunekPdfOpcje): PdfDoc {
  const doc = createPdfDoc({
    pageW: STRONA_W,
    pageH: STRONA_H,
    margin: MARGINES,
    footer: (d) => drawTitleBlock(d, header, tytul),
  });

  const maLegende = !!legenda?.length;
  const poleX = MARGINES;
  const poleY = MARGINES + TABLICZKA_H;
  const pelnaW = STRONA_W - MARGINES * 2;
  const poleH = STRONA_H - poleY - MARGINES;

  /**
   * Legenda idzie tam, gdzie kosztuje rysunek NAJMNIEJ — w kolumnę po prawej albo
   * w pasek pod rysunkiem.
   *
   * Kolumna zabierała rysunkowi 188 z 770 punktów szerokości ZAWSZE, nawet gdy legenda
   * miała cztery pozycje i sięgała jednej trzeciej wysokości kartki; pod nią zostawał
   * pusty prostokąt przez całą wysokość. Przy rzucie szerszym niż wyższym — a takie są
   * prawie wszystkie — pasek pod rysunkiem oddaje mu całą szerokość i wychodzi on
   * o jedną trzecią większy. Przy rysunku wysokim i wąskim wygrywa kolumna, bo tam
   * ograniczeniem jest wysokość, nie szerokość.
   *
   * Wybór przez PORÓWNANIE SKALI, a nie przez regułę „jeśli szeroki, to pod spodem":
   * liczy się to, ile ostatecznie widać, a nie który wymiar jest większy.
   */
  const kolumnaW = pelnaW - (LEGENDA_W + 12);
  const skalaKolumna = Math.min(kolumnaW / rysunek.width, poleH / rysunek.height);

  const kolumnyPaska = maLegende ? Math.max(1, Math.min(Math.floor(pelnaW / LEGENDA_W), legenda!.length)) : 1;
  const pasek = maLegende ? wymiarLegendy(legenda!.length, kolumnyPaska) : { w: 0, h: 0 };
  const wysokoscNaRysunek = poleH - pasek.h - 12;
  const skalaPasek = wysokoscNaRysunek > 0 ? Math.min(pelnaW / rysunek.width, wysokoscNaRysunek / rysunek.height) : 0;

  const podSpodem = maLegende && skalaPasek > skalaKolumna;
  const poleW = podSpodem || !maLegende ? pelnaW : kolumnaW;
  const dostepnaH = podSpodem ? wysokoscNaRysunek : poleH;

  // Rysunek wpisany w pole Z ZACHOWANIEM PROPORCJI i wyśrodkowany. Rozciągnięcie do
  // pełnego pola zniekształciłoby symbole — a na rzucie instalacji proporcje niosą
  // informację (odległości, strefy), więc nie wolno ich naruszyć.
  const skala = Math.min(poleW / rysunek.width, dostepnaH / rysunek.height);
  const rysW = rysunek.width * skala;
  const rysH = rysunek.height * skala;
  const rysDol = poleY + (podSpodem ? pasek.h + 12 : 0) + (dostepnaH - rysH) / 2;
  doc.image(rysunek, poleX + (poleW - rysW) / 2, rysDol, rysW, rysH);

  if (maLegende) {
    if (podSpodem) {
      // Pasek wyśrodkowany pod rysunkiem, tuż nad tabliczką.
      rysujLegende(doc, legenda!, poleX + (pelnaW - pasek.w) / 2, poleY, kolumnyPaska);
    } else {
      /**
       * Góra legendy równo z górą RYSUNKU, a nie z górną krawędzią pola. Rysunek jest
       * w pionie wyśrodkowany, więc przy przypięciu legendy do pola obie ramki zaczynały
       * się na różnych wysokościach i kartka wyglądała na niepoprawnie złożoną.
       *
       * Dwa ograniczenia: legenda nie może zejść pod pole (weszłaby na tabliczkę
       * rysunkową) ani wyjść ponad nie — przy długiej liście lub niskim rysunku
       * wyrównanie ustępuje więc mieszczeniu się na kartce.
       */
      const wysokosc = Math.min(poleH, wymiarLegendy(legenda!.length, 1).h);
      const gora = Math.min(poleY + poleH, Math.max(rysDol + rysH, poleY + wysokosc));
      rysujLegende(doc, legenda!, STRONA_W - MARGINES - LEGENDA_W, gora - wysokosc, 1);
    }
  }

  if (zestawienie?.length) rysujZestawienie(doc, zestawienie);

  return doc;
}

/**
 * Zestawienie ilościowe na OSOBNEJ STRONIE, za rysunkiem.
 *
 * Świadomie nie w legendzie: patrz komentarz przy `PozycjaLegendy`. Legenda objaśnia
 * znaki i ta decyzja zostaje — liczba doklejona do symbolu miesza dwa różne dokumenty
 * w jednym miejscu. Osobna strona nie ma tego problemu: jest podpisana, da się ją
 * pominąć przy drukowaniu samego rysunku, a przede wszystkim nie odbiera rysunkowi
 * ani milimetra kartki.
 *
 * Powstała, bo zestawienia do druku nie było NIGDZIE — Kosztorys eksportuje CSV
 * z cenami, a to inny dokument i inny odbiorca: monter potrzebuje listy „co kupić
 * i ile", bez stawek.
 */
function rysujZestawienie(doc: PdfDoc, pozycje: PozycjaZestawienia[]): void {
  // Wymuszenie nowej strony: `ensure` z wysokością większą niż cała kartka nie ma
  // szans się zmieścić, więc zamyka bieżącą stronę (razem z tabliczką) i otwiera nową.
  doc.ensure(STRONA_H);

  doc.text("ZESTAWIENIE ELEMENTÓW", MARGINES, doc.y - 12, 11, true);
  doc.y -= 30;

  const kolIlosc = STRONA_W - MARGINES - 60;
  const kolPokoj = kolIlosc - 150;

  doc.text("Element", MARGINES, doc.y, 8, true, 0.35);
  doc.text("Pomieszczenie", kolPokoj, doc.y, 8, true, 0.35);
  doc.text("Ilość", kolIlosc, doc.y, 8, true, 0.35);
  doc.y -= 6;
  doc.line(MARGINES, doc.y, STRONA_W - MARGINES, doc.y, 0.6, 0.55);
  doc.y -= 12;

  for (const p of pozycje) {
    // Nagłówek tabeli powtarzany na każdej nowej stronie — bez tego druga strona
    // zestawienia to trzy kolumny liczb bez wyjaśnienia, co znaczą.
    if (doc.ensure(16)) {
      doc.y -= 8;
      doc.text("Element", MARGINES, doc.y, 8, true, 0.35);
      doc.text("Pomieszczenie", kolPokoj, doc.y, 8, true, 0.35);
      doc.text("Ilość", kolIlosc, doc.y, 8, true, 0.35);
      doc.y -= 6;
      doc.line(MARGINES, doc.y, STRONA_W - MARGINES, doc.y, 0.6, 0.55);
      doc.y -= 12;
    }
    doc.text(pdfFitText(p.element, kolPokoj - MARGINES - 10, 8.5, false), MARGINES, doc.y, 8.5);
    doc.text(pdfFitText(p.pomieszczenie, kolIlosc - kolPokoj - 10, 8.5, false), kolPokoj, doc.y, 8.5);
    doc.text(`${p.ilosc} szt.`, kolIlosc, doc.y, 8.5);
    doc.y -= 8;
    doc.line(MARGINES, doc.y, STRONA_W - MARGINES, doc.y, 0.3, 0.9);
    doc.y -= 8;
  }

  const razem = pozycje.reduce((s, p) => s + p.ilosc, 0);
  doc.y -= 4;
  doc.text("RAZEM", MARGINES, doc.y, 9, true);
  doc.text(`${razem} szt.`, kolIlosc, doc.y, 9, true);
}

export async function downloadDrawingPdf(opcje: RysunekPdfOpcje, bazaNazwy: string): Promise<boolean> {
  const bytes = await buildDrawingPdf(opcje);
  return downloadPdfBytes(bytes, projectFileName(bazaNazwy, opcje.header.obiekt, "pdf"));
}

/**
 * Ten sam dokument jako gotowy plik. Rozdzielenie na buildDrawingDoc i buildDrawingPdf jest po to,
 * zeby komplet dokumentacji mogl wziac SAME STRONY i zlozyc je z innymi dokumentami
 * w jeden plik (patrz polaczDokumenty w engine.ts) — zamiast sklejac gotowe PDF-y.
 */
export function buildDrawingPdf(...args: Parameters<typeof buildDrawingDoc>): Promise<Uint8Array> {
  return buildDrawingDoc(...args).finish();
}
