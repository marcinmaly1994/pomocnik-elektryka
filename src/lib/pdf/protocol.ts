import type { DocumentHeader } from "@/types";
import { createPdfDoc, pdfFitText, pdfTextWidth } from "./engine";
import { drawTitleBlock } from "./titleBlock";
import { downloadPdfBytes, projectFileName } from "./download";
import { PROTOCOL_DEFS, protocolVerdict, type ProtocolRow } from "@/lib/protocols";
import type { ProtocolKey } from "@/types";

/** Składa protokół pomiarowy i zwraca gotowe bajty PDF (bez pobierania — testowalne bez DOM-u). */
export function buildProtocolPdf(key: ProtocolKey, header: DocumentHeader, rows: ProtocolRow[], limit: number): Promise<Uint8Array> {
  const def = PROTOCOL_DEFS[key];
  const doc = createPdfDoc({ footer: (d) => drawTitleBlock(d, header, def.title) });
  const M = doc.margin;
  const W = doc.innerW;

  const drawTitle = (cd: boolean) => {
    doc.text(def.title.toUpperCase(), M, doc.y - 12, 13, true);
    doc.y -= cd ? 26 : 20;
    if (!cd) {
      doc.text(pdfFitText(`Wymagania wg ${def.norm}`, W, 8.5, false), M, doc.y, 8.5, false, 0.35);
      doc.y -= 18;
    }
  };
  doc.setNewPageHandler(() => drawTitle(true));
  drawTitle(false);

  // --- dane ogólne (dwie kolumny etykieta/wartość) ---
  const info: [string, string | undefined][] = [
    ["Obiekt", header.obiekt], ["Adres", header.adres],
    ["Zleceniodawca", header.zleceniodawca], ["Układ sieci", header.uklad],
    ["Wykonawca pomiarów", header.wykonawca], ["Nr uprawnień", header.uprawnienia],
    ["Przyrząd pomiarowy", header.przyrzad], ["Nr fabryczny", header.nrFabryczny],
    ["Świadectwo wzorcowania", header.swiadectwo], ["Data pomiarów", header.data],
    ["Temperatura [°C]", header.temperatura], ["Wilgotność [%]", header.wilgotnosc],
  ];
  // Odstęp etykieta->wartość liczony z szerokości etykiety (nie na sztywno) — przy stałym
  // wcięciu dłuższe etykiety (np. "Świadectwo wzorcowania:") potrafiły nachodzić na wartość.
  // `pdfTextWidth` liczy w przybliżeniu wg tabel Helvetiki (patrz komentarz w engine.ts przy
  // PDF_W_REG), a osadzony font (DejaVu Sans Bold) bywa ok. 20% szerszy dla pogrubionych
  // etykiet — stąd zapas `LABEL_WIDTH_SAFETY` w wyliczeniu pozycji wartości.
  const LABEL_WIDTH_SAFETY = 1.3;
  const col1End = M + 270;
  const col2End = M + W;
  doc.box(M, doc.y - 6, W, 6 + (info.length / 2) * 15, 0.965);
  for (let i = 0; i < info.length; i += 2) {
    const yy = doc.y + 2;
    const label1 = info[i][0] + ":";
    const value1X = M + 6 + pdfTextWidth(label1, 8.5, true) * LABEL_WIDTH_SAFETY + 6;
    doc.text(label1, M + 6, yy, 8.5, true);
    doc.text(pdfFitText(info[i][1] || "—", col1End - value1X, 8.5, false), value1X, yy, 8.5);
    if (info[i + 1]) {
      const label2 = info[i + 1][0] + ":";
      const value2X = M + 274 + pdfTextWidth(label2, 8.5, true) * LABEL_WIDTH_SAFETY + 6;
      doc.text(label2, M + 274, yy, 8.5, true);
      doc.text(pdfFitText(info[i + 1][1] || "—", col2End - value2X, 8.5, false), value2X, yy, 8.5);
    }
    doc.y -= 15;
  }
  doc.y -= 12;

  doc.text(def.intro, M, doc.y, 8.5, false, 0.3);
  doc.y -= 18;

  // --- tabela wyników ---
  const ROW_H = 17;
  if (def.checklist) {
    const cols = [
      { label: "Lp.", w: 28 },
      { label: "Sprawdzany element", w: W - 28 - 90 },
      { label: "Ocena", w: 90 },
    ];
    const drawHead = () => {
      doc.box(M, doc.y - 12, W, 18, 0.88);
      let cx = M + 5;
      cols.forEach((c) => {
        doc.text(c.label, cx, doc.y - 7, 8.5, true);
        cx += c.w;
      });
      doc.y -= 18;
      doc.line(M, doc.y + 5, M + W, doc.y + 5, 0.8, 0.4);
    };
    drawHead();
    rows.forEach((r, i) => {
      if (doc.ensure(ROW_H)) drawHead();
      if (i % 2 === 1) doc.box(M, doc.y - ROW_H + 5, W, ROW_H, 0.968);
      const label = ({ tak: "zgodne", nie: "NIEZGODNE", nd: "nie dotyczy" } as Record<string, string>)[String(r.status)] || "—";
      doc.text(String(i + 1), M + 5, doc.y - ROW_H + 11, 8.5);
      doc.text(pdfFitText(String(r.text ?? ""), cols[1].w - 10, 8.5, false), M + 33, doc.y - ROW_H + 11, 8.5);
      doc.text(label, M + 28 + cols[1].w + 5, doc.y - ROW_H + 11, 8.5, r.status === "nie");
      doc.y -= ROW_H;
      doc.line(M, doc.y + 5, M + W, doc.y + 5, 0.4, 0.86);
    });
  } else {
    const baseCols = [...def.columns!.map((c) => ({ label: c.label, w: c.w, key: c.key, def: c })), { label: "Ocena", w: 68, key: "__ocena", def: undefined }];
    const totalW = baseCols.reduce((a, c) => a + c.w, 0);
    const scale = W / totalW;
    const cols = baseCols.map((c) => ({ ...c, w: c.w * scale }));

    const drawHead = () => {
      doc.box(M, doc.y - 12, W, 18, 0.88);
      let cx = M + 4;
      cols.forEach((c) => {
        doc.text(pdfFitText(c.label, c.w - 6, 8, true), cx, doc.y - 7, 8, true);
        cx += c.w;
      });
      doc.y -= 18;
      doc.line(M, doc.y + 5, M + W, doc.y + 5, 0.8, 0.4);
    };
    drawHead();

    rows.forEach((r, i) => {
      if (doc.ensure(ROW_H)) drawHead();
      if (i % 2 === 1) doc.box(M, doc.y - ROW_H + 5, W, ROW_H, 0.968);
      let cx = M + 4;
      cols.forEach((c) => {
        let v: string;
        if (c.key === "__ocena") {
          const ok = def.evaluate!(r, limit);
          v = ok === null ? "—" : ok ? "pozytywna" : "NEGATYWNA";
        } else if (c.def?.type === "computed") {
          v = c.def.compute!(r);
        } else {
          v = r[c.key] === undefined || r[c.key] === "" ? "—" : String(r[c.key]);
        }
        doc.text(pdfFitText(v, c.w - 6, 8.5, c.key === "__ocena"), cx, doc.y - ROW_H + 11, 8.5, c.key === "__ocena");
        cx += c.w;
      });
      doc.y -= ROW_H;
      doc.line(M, doc.y + 5, M + W, doc.y + 5, 0.4, 0.86);
    });

    doc.y -= 14;
    doc.ensure(20);
    doc.text(`Kryterium oceny: ${def.limitLabel} = ${limit} ${def.limitUnit}`, M, doc.y, 8.5, false, 0.3);
    doc.y -= 16;
  }

  // --- wynik końcowy ---
  doc.y -= 8;
  doc.ensure(60);
  const verdict = protocolVerdict(def, rows, limit);
  const vText =
    verdict === null
      ? "BRAK KOMPLETU DANYCH"
      : verdict
        ? "WYNIK POZYTYWNY — instalacja w badanym zakresie spełnia wymagania"
        : "WYNIK NEGATYWNY — stwierdzono niezgodności wymagające usunięcia";
  doc.box(M, doc.y - 8, W, 22, verdict === false ? 0.92 : 0.95);
  doc.text(vText, M + 6, doc.y, 9.5, true);
  doc.y -= 34;

  if (header.uwagi) {
    doc.ensure(40);
    doc.text("Uwagi:", M, doc.y, 9, true);
    doc.y -= 13;
    const words = String(header.uwagi).split(/\s+/);
    let ln = "";
    words.forEach((w) => {
      if (pdfTextWidth(ln + " " + w, 8.5, false) > W - 10) {
        doc.text(ln, M, doc.y, 8.5);
        doc.y -= 12;
        doc.ensure(14);
        ln = w;
      } else {
        ln = ln ? ln + " " + w : w;
      }
    });
    if (ln) {
      doc.text(ln, M, doc.y, 8.5);
      doc.y -= 12;
    }
    doc.y -= 10;
  }

  // --- podpisy ---
  doc.ensure(60);
  doc.y -= 16;
  doc.line(M, doc.y, M + 190, doc.y, 0.6, 0.5);
  doc.line(M + W - 190, doc.y, M + W, doc.y, 0.6, 0.5);
  doc.y -= 11;
  doc.text("Wykonawca pomiarów (podpis)", M, doc.y, 8, false, 0.4);
  doc.text("Zleceniodawca / odbiór (podpis)", M + W - 190, doc.y, 8, false, 0.4);
  doc.y -= 16;
  doc.text("Dokument wygenerowany w pomocnikelektryka.pl — wymaga weryfikacji i podpisu osoby z uprawnieniami.", M, doc.y, 7.5, false, 0.5);

  return doc.finish();
}

export async function downloadProtocolPdf(key: ProtocolKey, header: DocumentHeader, rows: ProtocolRow[], limit: number): Promise<boolean> {
  const bytes = await buildProtocolPdf(key, header, rows, limit);
  return downloadPdfBytes(bytes, projectFileName(`protokol-${key}`, header.obiekt, "pdf"));
}
