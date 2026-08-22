import type { DocumentHeader } from "@/types";
import { pdfFitText, type PdfDoc } from "./engine";

/**
 * Tabliczka rysunkowa (metryka) rysowana na dole każdej strony — standard dokumentacji
 * technicznej: obiekt, tytuł rysunku, numer i rewizja, data, wykonawca.
 */
export function drawTitleBlock(doc: PdfDoc, header: DocumentHeader, docTitle: string): void {
  const M = doc.margin;
  const W = doc.innerW;
  const H = 40;
  const y0 = M - 6; // pasek tuż nad marginesem dolnym
  const c1 = 190;
  const c2 = 130; // szerokości pierwszych dwóch kolumn

  doc.box(M, y0, W, H, 0.98);
  doc.line(M, y0 + H, M + W, y0 + H, 1, 0.25);
  doc.line(M, y0, M + W, y0, 0.7, 0.55);
  doc.line(M, y0, M, y0 + H, 0.7, 0.55);
  doc.line(M + W, y0, M + W, y0 + H, 0.7, 0.55);
  doc.line(M + c1, y0, M + c1, y0 + H, 0.5, 0.65);
  doc.line(M + c1 + c2, y0, M + c1 + c2, y0 + H, 0.5, 0.65);

  doc.text("OBIEKT", M + 6, y0 + H - 10, 6.5, true, 0.5);
  doc.text(pdfFitText(header.obiekt || "—", c1 - 10, 9, true), M + 6, y0 + H - 21, 9, true);
  doc.text(pdfFitText(header.adres || "", c1 - 10, 7.5, false), M + 6, y0 + 8, 7.5, false, 0.4);

  doc.text("RYSUNEK / DOKUMENT", M + c1 + 6, y0 + H - 10, 6.5, true, 0.5);
  doc.text(pdfFitText(docTitle || "—", c2 - 10, 8.5, true), M + c1 + 6, y0 + H - 21, 8.5, true);
  doc.text(pdfFitText(header.wykonawca ? `Wykonał: ${header.wykonawca}` : "", c2 - 10, 7.5, false), M + c1 + 6, y0 + 8, 7.5, false, 0.4);

  const c3x = M + c1 + c2 + 6;
  doc.text("NR RYS.", c3x, y0 + H - 10, 6.5, true, 0.5);
  doc.text(header.drawingNo || "—", c3x, y0 + H - 21, 9, true);
  doc.text("REW.", c3x + 55, y0 + H - 10, 6.5, true, 0.5);
  doc.text(header.revision || "—", c3x + 55, y0 + H - 21, 9, true);
  doc.text("DATA", c3x, y0 + 17, 6.5, true, 0.5);
  doc.text(header.data || "—", c3x, y0 + 7, 8);
  doc.text("pomocnikelektryka.pl", c3x + 55, y0 + 7, 6.5, false, 0.55);
}
