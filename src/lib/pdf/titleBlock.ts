import type { DocumentHeader } from "@/types";
import { pdfFitText, type PdfDoc } from "./engine";

/**
 * Tabliczka rysunkowa (metryka) rysowana na dole każdej strony — standard dokumentacji
 * technicznej: obiekt, tytuł rysunku, numer i rewizja, data, wykonawca.
 *
 * Układ to SIATKA o dwóch wysokościach wiersza, wspólna dla wszystkich kolumn. Wcześniej
 * trzecia kolumna upychała cztery napisy w wysokości przewidzianej na trzy: etykieta
 * „DATA" lądowała 2 pt pod dziewięciopunktowym numerem rysunku i obie linie zlewały się
 * w jedną plamę („E-01" przekreślone napisem „DATA"). Stałe wierszy stoją więc teraz
 * w jednym miejscu i obowiązują wszystkie kolumny naraz — nie da się dołożyć napisu
 * „gdzieś pomiędzy", nie widząc, że koliduje.
 */

/** Wysokość paska. Musi zmieścić dwa wiersze etykieta+wartość, nie trzy „na wyczucie". */
export const TITLE_BLOCK_H = 48;

export function drawTitleBlock(doc: PdfDoc, header: DocumentHeader, docTitle: string): void {
  const M = doc.margin;
  const W = doc.innerW;
  const H = TITLE_BLOCK_H;
  const y0 = M - 6; // pasek tuż nad marginesem dolnym
  const c1 = 190;
  const c2 = 130; // szerokości pierwszych dwóch kolumn

  // Linie bazowe wierszy — liczone od dołu paska, wspólne dla całej tabliczki.
  const R1_ETYKIETA = y0 + 38;
  const R1_WARTOSC = y0 + 27;
  const R2_ETYKIETA = y0 + 13;
  const R2_WARTOSC = y0 + 3;
  const PODZIAL = y0 + 24; // pozioma linia między wierszami trzeciej kolumny

  const x3 = M + c1 + c2;
  const w3 = W - c1 - c2;
  const polowa = w3 / 2;

  doc.box(M, y0, W, H, 0.98);
  doc.line(M, y0 + H, M + W, y0 + H, 1, 0.25);
  doc.line(M, y0, M + W, y0, 0.7, 0.55);
  doc.line(M, y0, M, y0 + H, 0.7, 0.55);
  doc.line(M + W, y0, M + W, y0 + H, 0.7, 0.55);
  doc.line(M + c1, y0, M + c1, y0 + H, 0.5, 0.65);
  doc.line(x3, y0, x3, y0 + H, 0.5, 0.65);
  // Trzecia kolumna to pełna krata 2×2 — bez tych kresek numer, rewizja i data
  // czytały się jak jeden ciąg napisów, a nie jak osobne rubryki metryki.
  doc.line(x3, PODZIAL, M + W, PODZIAL, 0.4, 0.75);
  doc.line(x3 + polowa, y0, x3 + polowa, y0 + H, 0.4, 0.75);

  doc.text("OBIEKT", M + 6, R1_ETYKIETA, 6.5, true, 0.5);
  doc.text(pdfFitText(header.obiekt || "—", c1 - 12, 9, true), M + 6, R1_WARTOSC, 9, true);
  doc.text(pdfFitText(header.adres || "", c1 - 12, 7.5, false), M + 6, R2_WARTOSC, 7.5, false, 0.4);

  doc.text("RYSUNEK / DOKUMENT", M + c1 + 6, R1_ETYKIETA, 6.5, true, 0.5);
  doc.text(pdfFitText(docTitle || "—", c2 - 12, 8.5, true), M + c1 + 6, R1_WARTOSC, 8.5, true);
  doc.text(
    pdfFitText(header.wykonawca ? `Wykonał: ${header.wykonawca}` : "", c2 - 12, 7.5, false),
    M + c1 + 6,
    R2_WARTOSC,
    7.5,
    false,
    0.4
  );

  // Rubryki przycinane do szerokości SWOJEJ komórki — długi numer rysunku ma się
  // skrócić, a nie wejść w sąsiednią rubrykę.
  const komorkaW = polowa - 12;
  const xA = x3 + 6;
  const xB = x3 + polowa + 6;

  doc.text("NR RYS.", xA, R1_ETYKIETA, 6.5, true, 0.5);
  doc.text(pdfFitText(header.drawingNo || "—", komorkaW, 9, true), xA, R1_WARTOSC, 9, true);
  doc.text("REW.", xB, R1_ETYKIETA, 6.5, true, 0.5);
  doc.text(pdfFitText(header.revision || "—", komorkaW, 9, true), xB, R1_WARTOSC, 9, true);

  doc.text("DATA", xA, R2_ETYKIETA, 6.5, true, 0.5);
  doc.text(pdfFitText(header.data || "—", komorkaW, 8, false), xA, R2_WARTOSC, 8);
  doc.text("WYGENEROWANO", xB, R2_ETYKIETA, 6.5, true, 0.5);
  doc.text("pomocnikelektryka.pl", xB, R2_WARTOSC, 6.5, false, 0.55);
}
