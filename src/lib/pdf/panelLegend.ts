import type { DocumentHeader, PanelDevice } from "@/types";
import { createPdfDoc, pdfFitText } from "./engine";
import { drawTitleBlock } from "./titleBlock";
import { downloadPdfBytes, projectFileName } from "./download";

interface LegendColumn {
  key: keyof LegendRow;
  label: string;
  w: number;
}

interface LegendRow {
  tag: string;
  label: string;
  poles: string;
  modules: string;
  caption: string;
  cable: string;
}

const COLS: LegendColumn[] = [
  { key: "tag", label: "Ozn.", w: 44 },
  { key: "label", label: "Aparat", w: 60 },
  { key: "poles", label: "Bieg.", w: 38 },
  { key: "modules", label: "Mod.", w: 36 },
  { key: "caption", label: "Opis obwodu", w: 215 },
  { key: "cable", label: "Przewód", w: 118 },
];
const ROW_H = 19;
const HEAD_H = 22;

/** Składa legendę rozdzielnicy elektrycznej i zwraca gotowe bajty PDF (bez pobierania —
 *  dzięki temu da się to przetestować bez DOM-u). */
export function buildPanelLegendPdf(
  devices: PanelDevice[],
  rowCount: number,
  usedModules: number,
  totalModules: number,
  perRow = 12,
  header: DocumentHeader
): Promise<Uint8Array> {
  const doc = createPdfDoc({ footer: (d) => drawTitleBlock(d, header, "Legenda rozdzielnicy elektrycznej") });
  const M = doc.margin;
  const W = doc.innerW;

  const drawHead = (first: boolean) => {
    if (first) {
      doc.text("LEGENDA ROZDZIELNICY ELEKTRYCZNEJ", M, doc.y - 14, 14, true);
      doc.y -= 32;
      doc.text(`Rzędów: ${rowCount} x ${perRow} modułów   |   Zajęte moduły: ${usedModules} z ${totalModules}`, M, doc.y, 9);
      doc.y -= 20;
    } else {
      doc.text("LEGENDA ROZDZIELNICY (cd.)", M, doc.y - 12, 11, true);
      doc.y -= 28;
    }
    doc.box(M, doc.y - HEAD_H + 5, W, HEAD_H, 0.88);
    let cx = M + 5;
    COLS.forEach((c) => {
      doc.text(c.label, cx, doc.y - HEAD_H + 11, 9, true);
      cx += c.w;
    });
    doc.y -= HEAD_H;
    doc.line(M, doc.y + 4, M + W, doc.y + 4, 0.8, 0.4);
  };
  doc.setNewPageHandler(() => drawHead(false));
  drawHead(true);

  devices.forEach((d, i) => {
    doc.ensure(ROW_H); // nagłówek nowej strony (jeśli potrzebny) rysuje setNewPageHandler
    if (i % 2 === 1) doc.box(M, doc.y - ROW_H + 5, W, ROW_H, 0.965);

    const row: LegendRow = {
      tag: d.tag || "",
      label: d.label || "",
      poles: d.poles || "",
      modules: String(d.modules || ""),
      caption: (d.caption || "") + (d.rcdTag ? ` (za ${d.rcdTag})` : ""),
      cable: d.cable || "-",
    };
    let cx = M + 5;
    COLS.forEach((c) => {
      const bold = c.key === "tag";
      doc.text(pdfFitText(row[c.key], c.w - 8, 9, bold), cx, doc.y - ROW_H + 11, 9, bold);
      cx += c.w;
    });
    doc.y -= ROW_H;
    doc.line(M, doc.y + 4, M + W, doc.y + 4, 0.4, 0.85);
  });

  doc.y -= 24;
  if (!doc.ensure(24)) {
    doc.text("Data montażu: ..................................", M, doc.y, 9);
    doc.text("Wykonawca: ..................................", M + 270, doc.y, 9);
  }

  return doc.finish();
}

export async function downloadPanelLegendPdf(
  devices: PanelDevice[],
  rowCount: number,
  usedModules: number,
  totalModules: number,
  perRow = 12,
  header: DocumentHeader
): Promise<boolean> {
  const bytes = await buildPanelLegendPdf(devices, rowCount, usedModules, totalModules, perRow, header);
  return downloadPdfBytes(bytes, projectFileName("legenda-rozdzielnicy", header.obiekt, "pdf"));
}
