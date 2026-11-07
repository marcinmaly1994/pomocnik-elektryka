import type { DocumentHeader } from "@/types";
import { createPdfDoc, pdfFitText, pdfTextWidth, type PdfDoc, type PdfImage } from "./engine";
import { drawTitleBlock, TITLE_BLOCK_H } from "./titleBlock";

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
  /** Format arkusza (zawsze w poziomie). Domyślnie A4. */
  format?: FormatArkusza;
  /**
   * Ile pikseli rastra `rysunek` przypada na metr w naturze. Podany — rysunek drukuje się
   * w NORMOWEJ skali liczbowej (patrz `dobierzSkale`), a skala trafia do tabliczki.
   * Pominięty (schemat, rzut bez kalibracji) — rysunek wypełnia pole jak dotąd.
   */
  pikseliNaMetr?: number;
}

export type FormatArkusza = "A4" | "A3";

/** Wymiary arkusza w poziomie [pt]. */
export const ARKUSZE: Record<FormatArkusza, { w: number; h: number }> = {
  A4: { w: 841.89, h: 595.28 },
  A3: { w: 1190.55, h: 841.89 },
};

/**
 * Skale rysunku budowlanego, od najdokładniejszej. Rzut instalacji rysuje się zwykle
 * w 1:50 albo 1:100; mniejsze skale są dla dużych budynków na małej kartce.
 */
export const SKALE_NORMOWE = [20, 25, 50, 75, 100, 150, 200, 250, 500, 1000] as const;

/** Punkty typograficzne na milimetr papieru. */
const PT_NA_MM = 72 / 25.4;

/**
 * Skala liczbowa wydruku (F10 z audytu 5.11.2026).
 *
 * Rysunek wpasowany w pole wychodził w skali przypadkowej, np. 1:63,7 — podziałka
 * pozwalała coś odmierzyć, ale nie dało się napisać skali w tabliczce, a monter
 * przykładający linijkę do kartki nie miał na co przeliczać. Bierzemy więc NAJBLIŻSZĄ
 * normową skalę, w której rysunek jeszcze się mieści (czyli mianownik nie mniejszy
 * od dopasowanego), i pomniejszamy rysunek dokładnie do niej.
 *
 * `ptNaPx` to powiększenie, z jakim rysunek mieści się w polu. Zwraca mianownik skali
 * i powiększenie, które go realizuje (nigdy większe od `ptNaPx`). Gdy rysunek nie
 * mieści się nawet w 1:1000, zwraca `null` — wtedy zostaje dopasowanie bez skali.
 */
export function dobierzSkale(ptNaPx: number, pikseliNaMetr: number): { mianownik: number; ptNaPx: number } | null {
  if (!(ptNaPx > 0) || !(pikseliNaMetr > 0)) return null;
  // milimetry w naturze na milimetr papieru przy dopasowaniu
  const dopasowany = (1000 * PT_NA_MM) / (pikseliNaMetr * ptNaPx);
  // tolerancja na błąd zaokrąglenia: 1:50,0000001 to wciąż 1:50
  const mianownik = SKALE_NORMOWE.find((n) => n >= dopasowany * (1 - 1e-9));
  if (!mianownik) return null;
  return { mianownik, ptNaPx: (1000 * PT_NA_MM) / (pikseliNaMetr * mianownik) };
}

// Kartka zawsze pozioma (A4 albo A3 — patrz `ARKUSZE`). Rysunki są szersze niż wyższe —
// i schemat jednokreskowy, i rzut kondygnacji — więc pionowa marnowałaby pół arkusza.
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


/** Odstęp między blokami (legenda, klucz) i między blokiem a rysunkiem [pt]. */
const ODSTEP_BLOKU = 12;

interface WejscieUkladu {
  rysW: number;
  rysH: number;
  pelnaW: number;
  poleH: number;
  legendaPozycji: number;
  kluczPozycji: number;
}

interface UkladStrony {
  /** Blok (legenda + klucz) leży w pasku pod rysunkiem; inaczej w kolumnie po prawej. */
  podSpodem: boolean;
  kolumnyLegendy: number;
  /** Szerokość i wysokość bloku. W kolumnie legenda i klucz są jedno pod drugim, w pasku
   *  obok siebie. */
  blokW: number;
  blokH: number;
  /** Pole, w które wpisuje się rysunek, i skala, z jaką się w nie mieści. */
  poleW: number;
  dostepnaH: number;
  skala: number;
}

/**
 * Wybiera, gdzie stoją legenda i klucz tras: w kolumnie po prawej (w 1–3 kolumnach
 * legendy, klucz pod nią) albo w pasku pod rysunkiem. Wygrywa układ, w którym RYSUNEK
 * wychodzi największy.
 *
 * Poprzednio klucz tras wymuszał pasek pod rysunkiem bez porównania. Przy długiej
 * legendzie (23 pozycje w rzucie domu) pasek zostawiał legendzie tylko dwie kolumny —
 * klucz zabierał resztę szerokości — czyli 332 z 461 pt wysokości pola, a rysunkowi
 * 117 pt: około jednej czwartej kartki. Kolumna o dwóch kolumnach legendy, z kluczem
 * pod nią, zostawia mu pełną wysokość i 406 pt szerokości.
 *
 * Remis (przy rysunku wysokim i wąskim ograniczeniem jest wysokość, więc szerokość
 * kolumny niczego nie zmienia) rozstrzyga kolejność kandydatów: wąska kolumna przed
 * szeroką, kolumna przed paskiem — czyli to samo, co robił układ bez klucza.
 */
function wybierzUklad({ rysW, rysH, pelnaW, poleH, legendaPozycji, kluczPozycji }: WejscieUkladu): UkladStrony {
  const maLegende = legendaPozycji > 0;
  const maKlucz = kluczPozycji > 0;
  const kluczH = wysokoscKlucza(kluczPozycji);
  const wpisz = (poleW: number, dostepnaH: number) =>
    dostepnaH > 0 && poleW > 0 ? Math.min(poleW / rysW, dostepnaH / rysH) : 0;

  if (!maLegende && !maKlucz) {
    return { podSpodem: false, kolumnyLegendy: 1, blokW: 0, blokH: 0, poleW: pelnaW, dostepnaH: poleH, skala: wpisz(pelnaW, poleH) };
  }

  const kandydaci: UkladStrony[] = [];

  // Kolumna po prawej: legenda w 1–3 kolumnach, pod nią klucz. Szerokość bloku to szersza
  // z obu części, żeby klucz (246 pt) nie wychodził poza kolumnę.
  for (const kolumny of maLegende ? [1, 2, 3].filter((k) => k <= legendaPozycji) : [1]) {
    const legenda = maLegende ? wymiarLegendy(legendaPozycji, kolumny) : { w: 0, h: 0 };
    const blokW = Math.max(legenda.w, maKlucz ? KLUCZ_W : 0);
    const blokH = legenda.h + (maLegende && maKlucz ? ODSTEP_BLOKU : 0) + kluczH;
    if (blokH > poleH) continue;
    const poleW = pelnaW - blokW - ODSTEP_BLOKU;
    kandydaci.push({ podSpodem: false, kolumnyLegendy: kolumny, blokW, blokH, poleW, dostepnaH: poleH, skala: wpisz(poleW, poleH) });
  }

  // Pasek pod rysunkiem: legenda w tylu kolumnach, ile się zmieści obok klucza. Więcej
  // kolumn to niższy pasek, a szerokość rysunku i tak jest pełna, więc liczy się tylko ta.
  const naLegende = pelnaW - (maKlucz ? KLUCZ_W + ODSTEP_BLOKU : 0);
  const kolumnyPaska = maLegende ? Math.max(1, Math.min(Math.floor(naLegende / LEGENDA_W), legendaPozycji)) : 1;
  const legendaPasek = maLegende ? wymiarLegendy(legendaPozycji, kolumnyPaska) : { w: 0, h: 0 };
  const blokW = legendaPasek.w + (maKlucz ? (maLegende ? ODSTEP_BLOKU : 0) + KLUCZ_W : 0);
  const blokH = Math.max(legendaPasek.h, kluczH);
  const dostepnaH = poleH - blokH - ODSTEP_BLOKU;
  if (dostepnaH > 0 && blokW <= pelnaW) {
    kandydaci.push({ podSpodem: true, kolumnyLegendy: kolumnyPaska, blokW, blokH, poleW: pelnaW, dostepnaH, skala: wpisz(pelnaW, dostepnaH) });
  }

  // Najlepszy według skali; przy remisie wygrywa wcześniejszy (patrz komentarz wyżej).
  let najlepszy: UkladStrony | undefined = kandydaci[0];
  for (const k of kandydaci) if (najlepszy && k.skala > najlepszy.skala + 1e-9) najlepszy = k;
  if (najlepszy) return najlepszy;

  // Nic się nie mieści (absurdalnie długa legenda): kolumna o największej liczbie kolumn
  // legendy, czyli najniższa. Lepiej rysunek mały niż żaden.
  const legenda = maLegende ? wymiarLegendy(legendaPozycji, 3) : { w: 0, h: 0 };
  const blokW3 = Math.max(legenda.w, maKlucz ? KLUCZ_W : 0);
  const poleW3 = pelnaW - blokW3 - ODSTEP_BLOKU;
  return {
    podSpodem: false,
    kolumnyLegendy: 3,
    blokW: blokW3,
    blokH: legenda.h + kluczH,
    poleW: poleW3,
    dostepnaH: poleH,
    skala: wpisz(poleW3, poleH),
  };
}

export function buildDrawingDoc({
  tytul,
  header,
  rysunek,
  legenda,
  kluczTras,
  zestawienie,
  obwody,
  format = "A4",
  pikseliNaMetr,
}: RysunekPdfOpcje): PdfDoc {
  const arkusz = ARKUSZE[format];
  // Skala jest cechą RYSUNKU, a tabliczka powtarza się na każdej stronie — także na
  // zestawieniu. Liczona niżej, przed pierwszym narysowaniem stopki.
  let skalaRysunku: number | undefined;
  const doc = createPdfDoc({
    pageW: arkusz.w,
    pageH: arkusz.h,
    margin: MARGINES,
    footer: (d) => drawTitleBlock(d, header, tytul, skalaRysunku !== undefined ? { skala: `1:${skalaRysunku}`, format } : undefined),
  });

  const maLegende = !!legenda?.length;
  const maKlucz = !!kluczTras?.length;
  const poleX = MARGINES;
  const poleY = MARGINES + TABLICZKA_H;
  const pelnaW = doc.pageW - MARGINES * 2;
  const poleH = arkusz.h - poleY - MARGINES;

  const uklad = wybierzUklad({
    rysW: rysunek.width,
    rysH: rysunek.height,
    pelnaW,
    poleH,
    legendaPozycji: legenda?.length ?? 0,
    kluczPozycji: kluczTras?.length ?? 0,
  });
  const { podSpodem, kolumnyLegendy, blokW, blokH, poleW, dostepnaH } = uklad;
  let skala = uklad.skala;
  const normowa = pikseliNaMetr ? dobierzSkale(skala, pikseliNaMetr) : null;
  if (normowa) {
    skala = normowa.ptNaPx;
    skalaRysunku = normowa.mianownik;
  }

  // Rysunek wpisany w pole Z ZACHOWANIEM PROPORCJI i wyśrodkowany. Rozciągnięcie do
  // pełnego pola zniekształciłoby symbole — a na rzucie instalacji proporcje niosą
  // informację (odległości, strefy), więc nie wolno ich naruszyć.
  const rysW = rysunek.width * skala;
  const rysH = rysunek.height * skala;
  const rysDol = poleY + (podSpodem ? blokH + ODSTEP_BLOKU : 0) + (dostepnaH - rysH) / 2;
  doc.image(rysunek, poleX + (poleW - rysW) / 2, rysDol, rysW, rysH);

  if (podSpodem) {
    // Legenda i klucz obok siebie w pasku, wyśrodkowanym pod rysunkiem, tuż nad tabliczką.
    const lewy = poleX + (pelnaW - blokW) / 2;
    const legendaW = maLegende ? wymiarLegendy(legenda!.length, kolumnyLegendy).w : 0;
    if (maLegende) rysujLegende(doc, legenda!, lewy, poleY, kolumnyLegendy);
    if (maKlucz) rysujKlucz(doc, kluczTras!, lewy + (maLegende ? legendaW + ODSTEP_BLOKU : 0), poleY, KLUCZ_W);
  } else if (maLegende || maKlucz) {
    /**
     * Kolumna po prawej: legenda, a pod nią klucz tras. Góra bloku równo z górą RYSUNKU,
     * a nie z górną krawędzią pola. Rysunek jest w pionie wyśrodkowany, więc przy
     * przypięciu bloku do pola obie ramki zaczynały się na różnych wysokościach
     * i kartka wyglądała na niepoprawnie złożoną.
     *
     * Dwa ograniczenia: blok nie może zejść pod pole (weszłaby na tabliczkę rysunkową)
     * ani wyjść ponad nie. `wybierzUklad` wybiera kolumnę tylko wtedy, gdy blok mieści
     * się w polu, więc wyrównanie do rysunku nigdy nie wypycha go poza kartkę.
     */
    const gora = Math.min(poleY + poleH, Math.max(rysDol + rysH, poleY + blokH));
    const lewy = doc.pageW - MARGINES - blokW;
    let dol = gora;
    if (maLegende) {
      const h = wymiarLegendy(legenda!.length, kolumnyLegendy).h;
      rysujLegende(doc, legenda!, lewy, dol - h, kolumnyLegendy);
      dol -= h + ODSTEP_BLOKU;
    }
    if (maKlucz) rysujKlucz(doc, kluczTras!, lewy, dol - wysokoscKlucza(kluczTras!.length), blokW);
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
  doc.ensure(doc.pageH);
  doc.text("SPIS OBWODÓW", MARGINES, doc.y - 12, 11, true);
  doc.y -= 30;

  const kolZabezp = doc.pageW - MARGINES - 90;
  const kolKabel = kolZabezp - 150;
  const kolNazwa = MARGINES + 40;

  const naglowek = () => {
    doc.text("Trasa", MARGINES, doc.y, 8, true, 0.35);
    doc.text("Obwód", kolNazwa, doc.y, 8, true, 0.35);
    doc.text("Przewód", kolKabel, doc.y, 8, true, 0.35);
    doc.text("Zabezpieczenie", kolZabezp, doc.y, 8, true, 0.35);
    doc.y -= 6;
    doc.line(MARGINES, doc.y, doc.pageW - MARGINES, doc.y, 0.6, 0.55);
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
    doc.line(MARGINES, doc.y, doc.pageW - MARGINES, doc.y, 0.3, 0.9);
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
  doc.ensure(doc.pageH);

  doc.text("ZESTAWIENIE ELEMENTÓW", MARGINES, doc.y - 12, 11, true);
  doc.y -= 30;

  const kolIlosc = doc.pageW - MARGINES - 60;
  const kolPokoj = kolIlosc - 150;

  doc.text("Element", MARGINES, doc.y, 8, true, 0.35);
  doc.text("Pomieszczenie", kolPokoj, doc.y, 8, true, 0.35);
  doc.text("Ilość", kolIlosc, doc.y, 8, true, 0.35);
  doc.y -= 6;
  doc.line(MARGINES, doc.y, doc.pageW - MARGINES, doc.y, 0.6, 0.55);
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
      doc.line(MARGINES, doc.y, doc.pageW - MARGINES, doc.y, 0.6, 0.55);
      doc.y -= 12;
    }
    doc.text(pdfFitText(p.element, kolPokoj - MARGINES - 10, 8.5, false), MARGINES, doc.y, 8.5);
    doc.text(pdfFitText(p.pomieszczenie, kolIlosc - kolPokoj - 10, 8.5, false), kolPokoj, doc.y, 8.5);
    doc.text(`${p.ilosc} szt.`, kolIlosc, doc.y, 8.5);
    doc.y -= 8;
    doc.line(MARGINES, doc.y, doc.pageW - MARGINES, doc.y, 0.3, 0.9);
    doc.y -= 8;
  }

  const razem = pozycje.reduce((s, p) => s + p.ilosc, 0);
  doc.y -= 4;
  doc.text("RAZEM", MARGINES, doc.y, 9, true);
  doc.text(`${razem} szt.`, kolIlosc, doc.y, 9, true);
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
