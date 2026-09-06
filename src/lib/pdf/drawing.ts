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
  const poleW = STRONA_W - MARGINES * 2 - (maLegende ? LEGENDA_W + 12 : 0);
  const poleH = STRONA_H - poleY - MARGINES;

  // Rysunek wpisany w pole Z ZACHOWANIEM PROPORCJI i wyśrodkowany. Rozciągnięcie do
  // pełnego pola zniekształciłoby symbole — a na rzucie instalacji proporcje niosą
  // informację (odległości, strefy), więc nie wolno ich naruszyć.
  const skala = Math.min(poleW / rysunek.width, poleH / rysunek.height);
  const rysW = rysunek.width * skala;
  const rysH = rysunek.height * skala;
  const rysDol = poleY + (poleH - rysH) / 2;
  doc.image(rysunek, poleX + (poleW - rysW) / 2, rysDol, rysW, rysH);

  if (maLegende) {
    const lx = STRONA_W - MARGINES - LEGENDA_W;
    // Dokładnie nagłówek + wiersze. Zapas „na oko" zostawiał pod ostatnią pozycją
    // pusty pasek, który czytał się jak zaczęty, niedokończony wiersz tabeli.
    const wysokosc = Math.min(poleH, LEGENDA_NAGLOWEK + legenda!.length * LEGENDA_WIERSZ);

    // Góra legendy równo z górą RYSUNKU, a nie z górną krawędzią pola. Rysunek jest
    // w pionie wyśrodkowany, więc przy przypięciu legendy do pola obie ramki zaczynały
    // się na różnych wysokościach i kartka wyglądała na niepoprawnie złożoną.
    //
    // Dwa ograniczenia: legenda nie może zejść pod pole (weszłaby na tabliczkę
    // rysunkową) ani wyjść ponad nie — przy długiej liście lub niskim rysunku
    // wyrównanie ustępuje więc mieszczeniu się na kartce.
    const gora = Math.min(poleY + poleH, Math.max(rysDol + rysH, poleY + wysokosc));
    const dol = gora - wysokosc;

    doc.box(lx, dol, LEGENDA_W, wysokosc, 0.985);
    doc.line(lx, dol, lx + LEGENDA_W, dol, 0.7, 0.55);
    doc.line(lx, gora, lx + LEGENDA_W, gora, 0.7, 0.55);
    doc.line(lx, dol, lx, gora, 0.7, 0.55);
    doc.line(lx + LEGENDA_W, dol, lx + LEGENDA_W, gora, 0.7, 0.55);

    doc.box(lx, gora - LEGENDA_NAGLOWEK, LEGENDA_W, LEGENDA_NAGLOWEK, 0.88);
    doc.text("LEGENDA", lx + 8, gora - 14, 9, true);
    doc.line(lx, gora - LEGENDA_NAGLOWEK, lx + LEGENDA_W, gora - LEGENDA_NAGLOWEK, 0.5, 0.55);

    let y = gora - LEGENDA_NAGLOWEK;
    for (const poz of legenda!) {
      y -= LEGENDA_WIERSZ;
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
      if (poz !== legenda![legenda!.length - 1]) doc.line(lx, y, lx + LEGENDA_W, y, 0.3, 0.88);
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
