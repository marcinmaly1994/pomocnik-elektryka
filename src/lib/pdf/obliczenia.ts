import type { DocumentHeader } from "@/types";
import type { SizedCircuit } from "@/lib/panel/sizing";
import { createPdfDoc, pdfFitText, pdfTextWidth, type PdfDoc } from "./engine";
import { drawTitleBlock } from "./titleBlock";
import { downloadPdfBytes, projectFileName } from "./download";

/**
 * Karta obliczeń obwodów — dobór jako dokument, nie jako widok.
 *
 * Aplikacja liczy dla każdego obwodu prąd obliczeniowy, przekrój, obciążalność, spadek
 * napięcia i warunek zwarciowy, po czym gubiła to razem z sesją: jedyny dokument o
 * obwodach, legenda rozdzielnicy, niesie `tag / opis / bieguny / moduły / kabel` i ani
 * jednej liczby z doboru. Obliczenia są osobną częścią dokumentacji obok rysunków
 * i zestawienia materiału — bez tego wydruku trzeba je było przepisywać z ekranu.
 *
 * Karta podaje też DŁUGOŚĆ trasy, której tabela na ekranie nie pokazuje. Bez niej ΔU
 * jest liczbą do wierzenia: czytelnik nie ma jak jej odtworzyć ani zakwestionować.
 */

interface Kolumna {
  label: string;
  w: number;
  /** Liczby idą do PRAWEJ — inaczej kolumny nie da się porównywać w pionie. */
  right?: boolean;
}

/** A4 POZIOMO: jedenaście kolumn nie mieści się na szerokości 511 pt strony pionowej,
 *  a zawijanie wiersza doboru na dwie linie robi z tabeli tapetę. */
const STRONA_W = 841.89;
const STRONA_H = 595.28;

const COLS: Kolumna[] = [
  { label: "Obwód", w: 178 },
  { label: "Faza", w: 34 },
  { label: "Ib", w: 44, right: true },
  { label: "Przekrój", w: 58, right: true },
  { label: "Przewód", w: 104 },
  { label: "Aparat", w: 54 },
  { label: "Iz", w: 44, right: true },
  { label: "Długość", w: 52, right: true },
  { label: "ΔU / limit", w: 68, right: true },
  { label: "Zs max", w: 54, right: true },
  { label: "RCD", w: 42 },
];

/**
 * Suma szerokosci kolumn [pt]. Wystawiona, zeby test pilnowal, ze tabela miesci sie
 * w szerokosci strony — dolozenie kolumny bez zwezenia innych wypycha ostatnia poza
 * kartke, a na podgladzie pierwszej strony widac to dopiero, gdy sie tego szuka.
 */
export const SZEROKOSCI = COLS.map((c) => c.w);
export const SZEROKOSC_TABELI = SZEROKOSCI.reduce((a, w) => a + w, 0);
/** Wymiary strony do sprawdzenia w tescie — te same, ktorymi tworzony jest dokument. */
export const STRONA = { w: STRONA_W, h: STRONA_H, margines: 42 };

/**
 * O ile tekst wyrownany DO PRAWEJ konczy sie przed krawedzia kolumny [pt].
 *
 * Wiecej niz odstep kolumn lewych (5 pt), bo tabele metryk w silniku sa helwetyckie,
 * a dokument osadza wlasny font: realna szerokosc napisu bywa wieksza od policzonej,
 * wiec napis wyrownany do prawej wychodzi poza wyliczony koniec. Przy 10 pt naglowek
 * „Zs max" dotykal sasiedniego „RCD" — widac to bylo dopiero na wyrenderowanej kartce.
 */
export const WCIECIE_PRAWE = 16;

const ROW_H = 17;
const HEAD_H = 20;

/** Liczba po polsku: przecinek dziesiętny. Kropka w „2.5 mm²" wygląda w polskim
 *  dokumencie jak literówka, a w tabeli obok „2,88 Ω" — jak niespójność. */
function liczba(v: number): string {
  return String(v).replace(".", ",");
}

/**
 * Wiersz tabeli w postaci gotowych napisów — osobno od rysowania, żeby dało się
 * sprawdzić SAMO formatowanie bez czytania bajtów PDF-a.
 *
 * Kolejność odpowiada `COLS`. Kreska „—" znaczy „aplikacja tego nie policzyła", nigdy
 * „zero": obwód bez skali kondygnacji nie ma zmierzonej trasy i nie wolno w tym miejscu
 * postawić 0 m, bo to byłaby nieprawda o instalacji.
 */
export function komorkiObliczen(s: SizedCircuit, dlugosc_m?: number): string[] {
  return [
    // Wykrzyknik zamiast koloru: wydruk bywa czarno-biały, a tło wiersza z ekranu
    // (delikatna czerwień/pomarańcz) zniknie w druku bez śladu.
    `${s.status === "ok" ? "" : "(!) "}${s.nazwa}`,
    s.liczba_faz === "3" ? "3F" : s.faza,
    s.Ib_A === null ? "—" : `${liczba(s.Ib_A)} A`,
    s.przekroj_mm2 === null ? "—" : `${liczba(s.przekroj_mm2)} mm²`,
    s.kabel ?? "—",
    s.aparat ? `${s.aparat.charakterystyka}${s.aparat.In_A} ${s.aparat.bieguny}` : "—",
    s.Iz_A === null ? "—" : `${liczba(s.Iz_A)} A`,
    dlugosc_m === undefined ? "—" : `${liczba(dlugosc_m)} m`,
    // Limit obok wartości, nie w osobnej kolumnie ani w przypisie: „1,8%" samo w sobie
    // nie mówi, czy obwód przeszedł, a limit zmienia się z rodzajem obwodu (3% / 5%).
    s.spadek_napiecia_pct === null ? "—" : `${liczba(s.spadek_napiecia_pct)}% / ${liczba(s.spadek_napiecia_limit_pct)}%`,
    s.Zs_max_Ohm === null ? "—" : `${liczba(s.Zs_max_Ohm)} Ω`,
    `typ ${s.rcd_typ}`,
  ];
}

function tekstDoPrawej(doc: PdfDoc, str: string, prawy: number, y: number, size: number, bold = false): void {
  doc.text(str, prawy - pdfTextWidth(str, size, bold), y, size, bold);
}

export function buildCalcSheetDoc(
  sized: SizedCircuit[],
  dlugosci: Map<string, number>,
  header: DocumentHeader
): PdfDoc {
  const doc = createPdfDoc({
    pageW: STRONA_W,
    pageH: STRONA_H,
    footer: (d) => drawTitleBlock(d, header, "Karta obliczeń obwodów"),
  });
  const M = doc.margin;
  const W = doc.innerW;

  const naglowekTabeli = (first: boolean) => {
    if (first) {
      doc.text("KARTA OBLICZEŃ OBWODÓW", M, doc.y - 14, 14, true);
      doc.y -= 30;
      doc.text(
        "Dobór wg PN-HD 60364: obciążalność przewodu, spadek napięcia i warunek samoczynnego wyłączenia.",
        M,
        doc.y,
        8,
        false,
        0.45
      );
      doc.y -= 18;
    } else {
      doc.text("KARTA OBLICZEŃ OBWODÓW (cd.)", M, doc.y - 12, 11, true);
      doc.y -= 26;
    }
    doc.box(M, doc.y - HEAD_H + 5, W, HEAD_H, 0.88);
    let cx = M + 5;
    COLS.forEach((c) => {
      if (c.right) tekstDoPrawej(doc, c.label, cx + c.w - WCIECIE_PRAWE, doc.y - HEAD_H + 11, 8.5, true);
      else doc.text(c.label, cx, doc.y - HEAD_H + 11, 8.5, true);
      cx += c.w;
    });
    doc.y -= HEAD_H;
    doc.line(M, doc.y + 4, M + W, doc.y + 4, 0.8, 0.4);
  };
  doc.setNewPageHandler(() => naglowekTabeli(false));
  naglowekTabeli(true);

  sized.forEach((s, i) => {
    doc.ensure(ROW_H); // nagłówek nowej strony rysuje setNewPageHandler
    if (i % 2 === 1) doc.box(M, doc.y - ROW_H + 5, W, ROW_H, 0.965);
    const base = doc.y - ROW_H + 11;

    const komorki = komorkiObliczen(s, dlugosci.get(s.id));
    let cx = M + 5;
    COLS.forEach((c, k) => {
      const tekst = pdfFitText(komorki[k], c.w - WCIECIE_PRAWE - 2, 8.5, false);
      if (c.right) tekstDoPrawej(doc, tekst, cx + c.w - WCIECIE_PRAWE, base, 8.5);
      else doc.text(tekst, cx, base, 8.5);
      cx += c.w;
    });

    doc.y -= ROW_H;
    doc.line(M, doc.y + 4, M + W, doc.y + 4, 0.4, 0.85);
  });

  /**
   * Uwagi pod tabelą, a nie zamiast wykrzykników w niej — jedno bez drugiego nie działa.
   * Sam wykrzyknik nie mówi, CO jest nie tak; sama lista uwag pod tabelą nie prowadzi
   * wzroku do wiersza, którego dotyczy. Treść jest ta sama, którą widać na ekranie
   * pod tabelą doboru, bo dokument ma potwierdzać ekran, a nie mówić coś innego.
   */
  const uwagi = sized.flatMap((s) => s.ostrzezenia.map((o) => ({ obwod: s.nazwa, ...o })));
  if (uwagi.length > 0) {
    doc.ensure(30);
    doc.y -= 12;
    doc.text("UWAGI DO DOBORU", M, doc.y, 10, true);
    doc.y -= 16;
    uwagi.forEach((u) => {
      doc.ensure(13);
      // JEDEN napis, nie pogrubiony prefiks plus reszta doklejona na `pdfTextWidth`:
      // metryki silnika są helwetyckie, a dokument osadza własny font, więc doklejenie
      // trafiało w środek prefiksu i dawało „Uwaga - Obwód gniazd ogólnyOhwód ...".
      // Wytłuszczenie samego początku nie jest warte napisu, którego nie da się
      // przeczytać.
      const tekst = `${u.level === "error" ? "BŁĄD" : "Uwaga"} — ${u.obwod}: ${u.message}`;
      doc.text(pdfFitText(tekst, W, 8, false), M, doc.y, 8);
      doc.y -= 12;
    });
  }

  doc.ensure(34);
  doc.y -= 10;
  doc.text(
    "Ib — prąd obliczeniowy, Iz — obciążalność przewodu po współczynnikach ułożenia, ΔU — spadek napięcia do najdalszego",
    M,
    doc.y,
    7.5,
    false,
    0.5
  );
  doc.y -= 11;
  doc.text(
    "punktu obwodu, Zs max — dopuszczalna impedancja pętli zwarcia. Kreska oznacza wielkość niepoliczoną, nie zerową.",
    M,
    doc.y,
    7.5,
    false,
    0.5
  );
  doc.y -= 14;
  doc.text(
    "Dobór orientacyjny/edukacyjny. Projekt do realizacji i odbioru wykonuje i podpisuje osoba z uprawnieniami;",
    M,
    doc.y,
    7.5,
    false,
    0.5
  );
  doc.y -= 11;
  doc.text("wymagane pomiary powykonawcze.", M, doc.y, 7.5, false, 0.5);

  return doc;
}

export async function downloadCalcSheetPdf(
  sized: SizedCircuit[],
  dlugosci: Map<string, number>,
  header: DocumentHeader
): Promise<boolean> {
  const bytes = await buildCalcSheetPdf(sized, dlugosci, header);
  return downloadPdfBytes(bytes, projectFileName("karta-obliczen", header.obiekt, "pdf"));
}

/**
 * Ten sam dokument jako gotowy plik. Rozdzielenie na buildCalcSheetDoc i buildCalcSheetPdf jest po to,
 * zeby komplet dokumentacji mogl wziac SAME STRONY i zlozyc je z innymi dokumentami
 * w jeden plik (patrz polaczDokumenty w engine.ts) — zamiast sklejac gotowe PDF-y.
 */
export function buildCalcSheetPdf(...args: Parameters<typeof buildCalcSheetDoc>): Promise<Uint8Array> {
  return buildCalcSheetDoc(...args).finish();
}
