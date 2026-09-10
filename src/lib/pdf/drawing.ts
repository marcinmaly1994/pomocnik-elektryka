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
  /** Klucz oznaczeń tras — obok legendy symboli. Pomijany, gdy tras na rysunku nie ma. */
  kluczTras?: PozycjaKlucza[];
  /** Spis obwodów na osobnej stronie — który kolor na rzucie jest którym obwodem. */
  obwody?: PozycjaObwodu[];
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


export function buildDrawingDoc({ tytul, header, rysunek, legenda, kluczTras, zestawienie, obwody }: RysunekPdfOpcje): PdfDoc {
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

  const maKlucz = !!kluczTras?.length;
  // Klucz staje OBOK legendy w pasku pod rysunkiem, więc na kolumny dla legendy
  // zostaje reszta szerokości.
  const naLegende = pelnaW - (maKlucz ? KLUCZ_W + 12 : 0);
  const kolumnyPaska = maLegende ? Math.max(1, Math.min(Math.floor(naLegende / LEGENDA_W), legenda!.length)) : 1;
  const legendaPasek = maLegende ? wymiarLegendy(legenda!.length, kolumnyPaska) : { w: 0, h: 0 };
  const pasek = {
    w: legendaPasek.w + (maKlucz ? (maLegende ? 12 : 0) + KLUCZ_W : 0),
    h: Math.max(legendaPasek.h, wysokoscKlucza(kluczTras?.length ?? 0)),
  };
  const wysokoscNaRysunek = poleH - pasek.h - 12;
  const skalaPasek = wysokoscNaRysunek > 0 ? Math.min(pelnaW / rysunek.width, wysokoscNaRysunek / rysunek.height) : 0;

  /**
   * Z kluczem zawsze pasek pod rysunkiem — klucz nie ma sensownego miejsca w wąskiej
   * kolumnie obok legendy, a rzuty i tak są szersze niż wyższe, więc pasek jest dla
   * nich wyborem lepszym albo równym. Świadome uproszczenie: przy rysunku wysokim
   * i wąskim kosztuje to trochę wysokości.
   */
  const podSpodem = maKlucz || (maLegende && skalaPasek > skalaKolumna);
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

  // Klucz oznaczeń tras — obok legendy w tym samym pasku, po jej prawej stronie.
  if (maKlucz) {
    const lewy = poleX + (pelnaW - pasek.w) / 2 + (maLegende ? legendaPasek.w + 12 : 0);
    rysujKlucz(doc, kluczTras!, lewy, poleY, KLUCZ_W);
  }

  if (zestawienie?.length) rysujZestawienie(doc, zestawienie);
  if (obwody?.length) rysujSpisObwodow(doc, obwody);

  return doc;
}

/**
 * Pozycja KLUCZA OZNACZEŃ — próbka linii i jej znaczenie.
 *
 * Legenda objaśnia symbole, ale nie trasy, a te niosą teraz trzy rozróżnienia naraz:
 * kolor (który obwód), grubość (zasilanie czy sterowanie) i kreska (trasa policzona
 * po ścianach czy szacunek). Bez klucza arkusz wysłany komuś innemu jest nieczytelny —
 * kolory widać, ale nie wiadomo, co znaczą.
 */
export interface PozycjaKlucza {
  opis: string;
  /** Kolor próbki 0–1 na kanał. Szary tam, gdzie próbka pokazuje GRUBOŚĆ albo KRESKĘ,
   *  a nie barwę — inaczej czytelnik bierze przykładowy kolor za znaczący. */
  rgb: [number, number, number];
  grubosc: number;
  kreska?: number[];
}

/** Wiersz SPISU OBWODÓW — kolor trasy na rzucie plus to, czym ten obwód jest. */
export interface PozycjaObwodu {
  kolor: [number, number, number];
  nazwa: string;
  kabel: string;
  zabezpieczenie: string;
}

/** Szerokość bloku klucza — mieści próbkę linii i CAŁY opis. Dobrana pod najdłuższy
 *  z nich: przy węższej kolumnie `pdfFitText` ucinał je wielokropkiem, a ucięty klucz
 *  tłumaczy mniej niż jego brak. */
const KLUCZ_W = 246;
const KLUCZ_WIERSZ = 16;
const KLUCZ_PROBKA = 34;

/** Wysokość bloku klucza — potrzebna układowi strony, zanim cokolwiek narysuje. */
function wysokoscKlucza(pozycji: number): number {
  return pozycji === 0 ? 0 : LEGENDA_NAGLOWEK + pozycji * KLUCZ_WIERSZ;
}

/** Rysuje klucz oznaczeń tras: próbka linii + opis, w kolumnie o zadanej szerokości. */
function rysujKlucz(doc: PdfDoc, pozycje: PozycjaKlucza[], x: number, dol: number, szerokosc: number) {
  const h = wysokoscKlucza(pozycje.length);
  const gora = dol + h;

  doc.box(x, dol, szerokosc, h, 0.985);
  doc.line(x, dol, x + szerokosc, dol, 0.7, 0.55);
  doc.line(x, gora, x + szerokosc, gora, 0.7, 0.55);
  doc.line(x, dol, x, gora, 0.7, 0.55);
  doc.line(x + szerokosc, dol, x + szerokosc, gora, 0.7, 0.55);

  doc.box(x, gora - LEGENDA_NAGLOWEK, szerokosc, LEGENDA_NAGLOWEK, 0.88);
  doc.text("OZNACZENIA TRAS", x + 8, gora - 14, 9, true);
  doc.line(x, gora - LEGENDA_NAGLOWEK, x + szerokosc, gora - LEGENDA_NAGLOWEK, 0.5, 0.55);

  pozycje.forEach((poz, i) => {
    const srodek = gora - LEGENDA_NAGLOWEK - (i + 0.5) * KLUCZ_WIERSZ;
    doc.liniaKolor(x + 8, srodek, x + 8 + KLUCZ_PROBKA, srodek, poz.rgb, poz.grubosc, poz.kreska);
    const opisX = x + 8 + KLUCZ_PROBKA + 8;
    doc.text(pdfFitText(poz.opis, szerokosc - (opisX - x) - 8, 7.5, false), opisX, srodek - 2.5, 7.5);
  });
}

/**
 * Spis obwodów: kolor trasy na rzucie, nazwa, przekrój i zabezpieczenie.
 *
 * Osobno od klucza i osobno od zestawienia elementów, bo odpowiada na inne pytanie.
 * Klucz mówi, CO znaczy kreska; zestawienie — ile czego kupić; spis — który kabel na
 * rzucie jest którym obwodem w rozdzielnicy. Bez niego kolor jest ładny, ale niemy.
 */
function rysujSpisObwodow(doc: PdfDoc, obwody: PozycjaObwodu[]): void {
  doc.ensure(STRONA_H);
  doc.text("SPIS OBWODÓW", MARGINES, doc.y - 12, 11, true);
  doc.y -= 30;

  const kolZabezp = STRONA_W - MARGINES - 90;
  const kolKabel = kolZabezp - 150;
  const kolNazwa = MARGINES + 40;

  const naglowek = () => {
    doc.text("Trasa", MARGINES, doc.y, 8, true, 0.35);
    doc.text("Obwód", kolNazwa, doc.y, 8, true, 0.35);
    doc.text("Przewód", kolKabel, doc.y, 8, true, 0.35);
    doc.text("Zabezpieczenie", kolZabezp, doc.y, 8, true, 0.35);
    doc.y -= 6;
    doc.line(MARGINES, doc.y, STRONA_W - MARGINES, doc.y, 0.6, 0.55);
    doc.y -= 12;
  };
  naglowek();

  for (const o of obwody) {
    if (doc.ensure(16)) {
      doc.y -= 8;
      naglowek();
    }
    // Próbka barwy dokładnie taka, jaką ma trasa na rzucie — to jedyne, co je łączy.
    doc.liniaKolor(MARGINES, doc.y + 2.5, MARGINES + 28, doc.y + 2.5, o.kolor, 1.5);
    doc.text(pdfFitText(o.nazwa, kolKabel - kolNazwa - 10, 8.5, false), kolNazwa, doc.y, 8.5);
    doc.text(pdfFitText(o.kabel, kolZabezp - kolKabel - 10, 8.5, false), kolKabel, doc.y, 8.5);
    doc.text(pdfFitText(o.zabezpieczenie, 84, 8.5, false), kolZabezp, doc.y, 8.5);
    doc.y -= 8;
    doc.line(MARGINES, doc.y, STRONA_W - MARGINES, doc.y, 0.3, 0.9);
    doc.y -= 8;
  }
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

/** Kolor `#rrggbb` na trójkę 0–1, w której liczy PDF. */
export function hexNaRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/**
 * Klucz oznaczeń tras — stały, bo opisuje KONWENCJĘ rysunku, a nie zawartość projektu.
 *
 * Trzy rozróżnienia, które trasa niesie jednocześnie: grubość (zasilanie czy
 * sterowanie), kreska (trasa policzona po ścianach czy szacunek) i kolor (który obwód).
 * Próbki grubości i kreski są SZARE — inaczej czytelnik wziąłby przykładową barwę za
 * znaczącą; o kolorze mówi osobny wiersz i spis obwodów.
 */
export const KLUCZ_TRAS = [
  { opis: "Zasilanie obwodu", rgb: [0.35, 0.35, 0.35] as [number, number, number], grubosc: 1.5 },
  // Bez strzałki „→": font dokumentu jej nie ma i wychodzi znak zapytania.
  { opis: "Sterowanie: łącznik do oprawy", rgb: [0.35, 0.35, 0.35] as [number, number, number], grubosc: 1, kreska: [1, 3] },
  { opis: "Trasa szacowana, bez routingu po ścianach", rgb: [0.35, 0.35, 0.35] as [number, number, number], grubosc: 1.5, kreska: [6, 4] },
  { opis: "Kolor linii = obwód, patrz spis obwodów", rgb: [0.12, 0.44, 0.7] as [number, number, number], grubosc: 1.5 },
];
