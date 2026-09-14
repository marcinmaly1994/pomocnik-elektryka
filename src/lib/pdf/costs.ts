import type { DocumentHeader } from "@/types";
import type { CostRow } from "@/lib/costs";
import { VAT_RATE, podsumowanieKosztorysu } from "@/lib/costs";
import { createPdfDoc, pdfFitText, pdfTextWidth, type PdfDoc } from "./engine";
import { drawTitleBlock } from "./titleBlock";
import { downloadPdfBytes, projectFileName } from "./download";

/**
 * Kosztorys jako dokument do wysłania klientowi.
 *
 * Zakładka eksportowała się dotąd wyłącznie do CSV — a CSV to plik roboczy: otwiera się
 * różnie w różnych arkuszach, nie ma tabliczki rysunkowej i nie wygląda jak oferta.
 * Rzut, legenda rozdzielnicy, schemat i protokoły miały PDF od dawna; kosztorys, czyli
 * jedyny z tych dokumentów, który klient naprawdę czyta, nie miał.
 */

interface Kolumna {
  label: string;
  w: number;
  /** Liczby idą do PRAWEJ — inaczej kolumny kwot nie da się czytać w pionie. */
  right?: boolean;
}

const COLS: Kolumna[] = [
  { label: "Lp.", w: 26 },
  { label: "Pozycja", w: 243 },
  { label: "Ilość", w: 50, right: true },
  { label: "Cena jedn.", w: 70, right: true },
  { label: "Wartość", w: 72, right: true },
];
/**
 * Szerokość rubryki kwoty w podsumowaniu [pt]. Etykiety kończą się dokładnie o tyle
 * przed prawą krawędzią, więc kolizja etykiety z kwotą jest możliwa TYLKO wtedy, gdy
 * kwota jest szersza niż ta rubryka — i to sprawdza test.
 */
export const KOL_KWOTY = 120;
const ROW_H = 18;
const HEAD_H = 21;

/** Kwota po polsku: przecinek dziesiętny i spacja co trzy cyfry. Bez tego pozycja za
 *  kilkanaście tysięcy czyta się jak numer telefonu. */
export function formatujKwote(v: number): string {
  const [calosc, reszta] = Math.abs(v).toFixed(2).split(".");
  const zGrupami = calosc.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${v < 0 ? "-" : ""}${zGrupami},${reszta}`;
}

function tekstDoPrawej(doc: PdfDoc, str: string, prawy: number, y: number, size: number, bold = false): void {
  doc.text(str, prawy - pdfTextWidth(str, size, bold), y, size, bold);
}

export function buildCostsDoc(rows: CostRow[], header: DocumentHeader): PdfDoc {
  const doc = createPdfDoc({ footer: (d) => drawTitleBlock(d, header, "Kosztorys instalacji") });
  const M = doc.margin;
  const W = doc.innerW;

  // Sumy i PODPIS pod nimi z tego samego miejsca co w zakladce — patrz
  // `podsumowanieKosztorysu`. To jest dokument, ktory idzie do wykonawcy, wiec
  // podpis pod wielka liczba musi byc prawdziwy tak samo jak na ekranie.
  const podsumowanie = podsumowanieKosztorysu(rows);
  const netto = podsumowanie.netto;
  const vat = podsumowanie.vat;
  const ryczaltowe = rows.filter((r) => r.overridden).length;

  const naglowekTabeli = (first: boolean) => {
    if (first) {
      doc.text("KOSZTORYS INSTALACJI ELEKTRYCZNEJ", M, doc.y - 14, 14, true);
      doc.y -= 30;
      doc.text(
        "Zestawienie orientacyjne — ilości oszacowane z rzutu instalacji, ceny wg cennika użytkownika.",
        M,
        doc.y,
        8,
        false,
        0.45
      );
      doc.y -= 18;
    } else {
      doc.text("KOSZTORYS (cd.)", M, doc.y - 12, 11, true);
      doc.y -= 26;
    }
    doc.box(M, doc.y - HEAD_H + 5, W, HEAD_H, 0.88);
    let cx = M + 5;
    COLS.forEach((c) => {
      if (c.right) tekstDoPrawej(doc, c.label, cx + c.w - 10, doc.y - HEAD_H + 11, 8.5, true);
      else doc.text(c.label, cx, doc.y - HEAD_H + 11, 8.5, true);
      cx += c.w;
    });
    doc.y -= HEAD_H;
    doc.line(M, doc.y + 4, M + W, doc.y + 4, 0.8, 0.4);
  };
  doc.setNewPageHandler(() => naglowekTabeli(false));
  naglowekTabeli(true);

  rows.forEach((r, i) => {
    doc.ensure(ROW_H);
    if (i % 2 === 1) doc.box(M, doc.y - ROW_H + 5, W, ROW_H, 0.965);
    const base = doc.y - ROW_H + 11;

    // Gwiazdka przy pozycji wycenionej ryczałtem — bez niej odbiorca mnoży ilość przez
    // cenę, nie dostaje wartości z tabeli i traci zaufanie do całego dokumentu.
    const opis = r.overridden ? `${r.label} *` : r.label;
    let cx = M + 5;
    doc.text(String(i + 1), cx, base, 8.5);
    cx += COLS[0].w;
    doc.text(pdfFitText(opis, COLS[1].w - 8, 8.5, false), cx, base, 8.5);
    cx += COLS[1].w;
    tekstDoPrawej(doc, String(r.qty), cx + COLS[2].w - 10, base, 8.5);
    cx += COLS[2].w;
    tekstDoPrawej(doc, formatujKwote(r.price), cx + COLS[3].w - 10, base, 8.5);
    cx += COLS[3].w;
    tekstDoPrawej(doc, formatujKwote(r.value), cx + COLS[4].w - 10, base, 8.5, true);

    doc.y -= ROW_H;
    doc.line(M, doc.y + 4, M + W, doc.y + 4, 0.4, 0.85);
  });

  /**
   * Podsumowanie trzyma się kolumny „Wartość", a nie środka strony — oko szuka sumy
   * pod liczbami, które ją tworzą.
   *
   * Etykieta jest wyrównana DO PRAWEJ i kończy się o `KOL_KWOTY` przed krawędzią, a nie
   * zaczyna w stałym punkcie. Przy wersji „zaczyna się tu" napis „RAZEM brutto" (11 pt,
   * pogrubiony) dorastał do prawej kwoty i przy większych sumach zlewał się z nią
   * w „RAZEM brutto581,79 zł" — widać to było dopiero na wyrenderowanej kartce.
   */
  const prawy = M + W - 10;
  const etykietaPrawy = prawy - KOL_KWOTY;
  doc.ensure(58);
  doc.y -= 10;
  const wiersz = (label: string, kwota: number, duzy = false) => {
    const size = duzy ? 11 : 9;
    tekstDoPrawej(doc, label, etykietaPrawy, doc.y, size, duzy);
    tekstDoPrawej(doc, `${formatujKwote(kwota)} zł`, prawy, doc.y, size, true);
    doc.y -= duzy ? 20 : 15;
  };
  wiersz("Razem netto", netto);
  wiersz(`VAT ${VAT_RATE}%`, vat);
  doc.line(etykietaPrawy - 90, doc.y + 12, M + W, doc.y + 12, 0.8, 0.3);
  doc.y -= 4;
  wiersz(podsumowanie.etykietaSumy, netto + vat, true);

  /**
   * Czego ta suma NIE obejmuje — wprost na kartce, pod nią.
   *
   * Bez tego dokument wysyłany wykonawcy podawał „RAZEM brutto" bez śladu po tym, że
   * `robocizna` ma domyślną cenę 0 i do sumy nie weszła. Na ekranie ostrzeżenie było
   * (choć pod liczbą), w PDF-ie nie było go wcale — czyli akurat tam, gdzie liczba
   * przestaje mieć obok siebie aplikację, która mogłaby ją wytłumaczyć.
   */
  if (podsumowanie.niewycenione.length > 0) {
    doc.ensure(24);
    const wstep = podsumowanie.brakRobocizny
      ? "UWAGA: to cena materiału, nie cena instalacji. Bez wyceny pozostają: "
      : "UWAGA: suma nie obejmuje pozycji bez ceny: ";
    doc.text(pdfFitText(wstep + podsumowanie.niewycenione.join(", ") + ".", W, 7.5, false), M, doc.y, 7.5, false, 0.3);
    doc.y -= 14;
  }

  if (ryczaltowe > 0) {
    doc.ensure(20);
    doc.text(
      "* Wartość pozycji podana ryczałtem — nie wynika z iloczynu ilości i ceny jednostkowej.",
      M,
      doc.y,
      7.5,
      false,
      0.45
    );
    doc.y -= 14;
  }

  doc.ensure(30);
  doc.text(
    "Kosztorys orientacyjny. Ilości należy zweryfikować na rzucie budynku przed zakupem materiału;",
    M,
    doc.y,
    7.5,
    false,
    0.5
  );
  doc.y -= 11;
  doc.text("nie zastępuje oferty ani projektu wykonanego przez osobę z uprawnieniami.", M, doc.y, 7.5, false, 0.5);

  return doc;
}

export async function downloadCostsPdf(rows: CostRow[], header: DocumentHeader): Promise<boolean> {
  const bytes = await buildCostsPdf(rows, header);
  return downloadPdfBytes(bytes, projectFileName("kosztorys", header.obiekt, "pdf"));
}

/**
 * Ten sam dokument jako gotowy plik. Rozdzielenie na buildCostsDoc i buildCostsPdf jest po to,
 * zeby komplet dokumentacji mogl wziac SAME STRONY i zlozyc je z innymi dokumentami
 * w jeden plik (patrz polaczDokumenty w engine.ts) — zamiast sklejac gotowe PDF-y.
 */
export function buildCostsPdf(...args: Parameters<typeof buildCostsDoc>): Promise<Uint8Array> {
  return buildCostsDoc(...args).finish();
}
