import type { DocumentHeader } from "@/types";
import type { ProtocolKey } from "@/types";
import { createPdfDoc, polaczDokumenty, zlozPdf, type PdfDoc } from "./engine";
import { drawTitleBlock } from "./titleBlock";

/**
 * Komplet dokumentacji: jeden plik zamiast siedmiu pobrań.
 *
 * Rzut, schemat, legenda rozdzielnicy, paski opisowe, karta obliczeń, kosztorys
 * i protokoły powstawały osobno, a użytkownik sklejał je czymś zewnętrznym. Każdy
 * z nich buduje się dalej dokładnie tak samo — komplet bierze ich STRONY
 * (`PdfDoc.czesci`) i składa w jeden dokument, więc nie ma tu drugiej implementacji
 * żadnego rysunku ani tabeli.
 *
 * Wybór jest po stronie użytkownika, nie nasz: nie każda robota potrzebuje pasków
 * opisowych, a protokoły dotyczą odbioru, nie projektu.
 */

/** Zakładka, w której mieszka producent danego dokumentu — komplet musi ją otworzyć,
 *  bo rzut i schemat rasteryzują się z ŻYWEGO rysunku na ekranie. */
export type ZakladkaDokumentu = "projekt" | "rozdzielnica" | "schemat" | "kosztorys" | "protokoly";

export interface PozycjaKompletu {
  /** Klucz producenta — patrz `lib/pdf/rejestr.ts`. */
  id: string;
  etykieta: string;
  zakladka: ZakladkaDokumentu;
  /** Kondygnacja do ustawienia przed budową (dotyczy wyłącznie rzutów). */
  floorId?: string;
  /** Zaznaczone domyślnie. Odznaczone są dokumenty, które nie są częścią projektu:
   *  paski opisowe to wydruk warsztatowy do wycięcia, a protokoły dotyczą odbioru. */
  domyslnie: boolean;
}

/** Stan projektu w zakresie, który decyduje, CO w ogóle da się do kompletu włożyć. */
export interface StanDokumentow {
  kondygnacje: { id: string; nazwa: string; maTresc: boolean }[];
  maAparaty: boolean;
  maObwody: boolean;
  maKosztorys: boolean;
  protokoly: { key: ProtocolKey; tytul: string; wierszy: number }[];
}

/**
 * Lista dokumentów, które ten projekt ma czym wypełnić.
 *
 * Pozycji, których nie da się zbudować, po prostu NIE MA na liście — zamiast
 * wyszarzonych wierszy, przy których użytkownik zgaduje, czego mu brakuje. Pustej
 * kartki z samą główką tabeli nikt nie potrzebuje.
 */
export function dostepneDokumenty(stan: StanDokumentow): PozycjaKompletu[] {
  const poz: PozycjaKompletu[] = [];

  for (const k of stan.kondygnacje) {
    // Kondygnacja bez ścian, pomieszczeń i osprzętu dałaby pustą kartkę z tabliczką.
    if (!k.maTresc) continue;
    poz.push({ id: `rzut:${k.id}`, etykieta: `Rzut — ${k.nazwa}`, zakladka: "projekt", floorId: k.id, domyslnie: true });
  }
  if (stan.maAparaty) {
    poz.push({ id: "schemat", etykieta: "Schemat jednokreskowy", zakladka: "schemat", domyslnie: true });
    poz.push({ id: "legenda", etykieta: "Legenda rozdzielnicy", zakladka: "rozdzielnica", domyslnie: true });
    // Wydruk do wycięcia i wsunięcia w tabliczki aparatów — narzędzie warsztatowe,
    // nie część dokumentacji, więc domyślnie odznaczony.
    poz.push({ id: "paski", etykieta: "Paski opisowe do rozdzielnicy", zakladka: "rozdzielnica", domyslnie: false });
  }
  if (stan.maObwody) {
    poz.push({ id: "obliczenia", etykieta: "Karta obliczeń obwodów", zakladka: "rozdzielnica", domyslnie: true });
  }
  if (stan.maKosztorys) {
    poz.push({ id: "kosztorys", etykieta: "Kosztorys instalacji", zakladka: "kosztorys", domyslnie: true });
  }
  for (const p of stan.protokoly) {
    if (p.wierszy === 0) continue;
    // Protokoły dotyczą ODBIORU wykonanej instalacji, a nie projektu — do kompletu
    // wchodzą świadomie, kiedy dokumentacja idzie z pomiarami.
    poz.push({ id: `protokol:${p.key}`, etykieta: p.tytul, zakladka: "protokoly", domyslnie: false });
  }
  return poz;
}

const STRONA_W = 595.28;
const STRONA_H = 841.89;

/**
 * Strona tytułowa: co to za dokumentacja, czego dotyczy i co zawiera.
 *
 * Spis treści nie jest ozdobą — to jedyne miejsce, w którym widać, że kompletu
 * NIE złożono w całości (np. bez protokołów). Bez niego odbiorca nie wie, czy
 * czegoś nie zgubiono po drodze.
 */
export function buildStronaTytulowaDoc(header: DocumentHeader, pozycje: string[]): PdfDoc {
  const doc = createPdfDoc({
    pageW: STRONA_W,
    pageH: STRONA_H,
    // Krótka nazwa w tabliczce, mimo że nagłówek strony brzmi pełniej: rubryka
    // „RYSUNEK / DOKUMENT" ma 118 pt, w które pełna nazwa się nie mieści. Przycięta
    // („Dokumentacja instala..") wygląda jak usterka, a nie jak skrót.
    footer: (d) => drawTitleBlock(d, header, "Dokumentacja"),
  });
  const M = doc.margin;

  doc.y -= 60;
  doc.text("DOKUMENTACJA", M, doc.y, 26, true);
  doc.y -= 30;
  doc.text("INSTALACJI ELEKTRYCZNEJ", M, doc.y, 26, true);
  doc.y -= 34;
  doc.line(M, doc.y, M + doc.innerW, doc.y, 1.2, 0.3);
  doc.y -= 40;

  const wiersz = (etykieta: string, wartosc: string) => {
    if (!wartosc) return;
    doc.text(etykieta, M, doc.y, 9, false, 0.45);
    doc.text(wartosc, M + 110, doc.y, 11, true);
    doc.y -= 22;
  };
  wiersz("Obiekt", header.obiekt);
  wiersz("Adres", header.adres);
  wiersz("Inwestor", header.zleceniodawca);
  wiersz("Wykonawca", header.wykonawca);
  wiersz("Układ sieci", header.uklad);
  wiersz("Data", header.data);

  doc.y -= 20;
  doc.text("ZAWARTOŚĆ", M, doc.y, 11, true);
  doc.y -= 20;
  pozycje.forEach((p, i) => {
    doc.ensure(16);
    doc.text(`${i + 1}.`, M, doc.y, 9.5);
    doc.text(p, M + 22, doc.y, 9.5);
    doc.y -= 16;
  });

  doc.ensure(40);
  doc.y -= 24;
  doc.text(
    "Opracowanie orientacyjne/edukacyjne. Projekt do realizacji i odbioru wykonuje i podpisuje osoba",
    M,
    doc.y,
    7.5,
    false,
    0.5
  );
  doc.y -= 11;
  doc.text("z uprawnieniami; wymagane pomiary powykonawcze.", M, doc.y, 7.5, false, 0.5);

  return doc;
}

/** Składa strony wszystkich dokumentów w jeden plik. Kolejność jest kolejnością na
 *  liście — czyli tą ze strony tytułowej. */
export function buildKompletPdf(dokumenty: PdfDoc[]): Promise<Uint8Array> {
  return zlozPdf(polaczDokumenty(dokumenty.map((d) => d.czesci())));
}

/** Nazwa pozycji na potrzeby spisu treści. */
export function spisTresci(pozycje: PozycjaKompletu[]): string[] {
  return pozycje.map((p) => p.etykieta);
}
