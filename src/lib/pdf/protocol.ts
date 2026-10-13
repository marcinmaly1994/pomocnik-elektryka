import type { DocumentHeader } from "@/types";
import { createPdfDoc, pdfFitText, pdfTextWidth, type PdfDoc } from "./engine";
import { drawTitleBlock } from "./titleBlock";
import { downloadPdfBytes, projectFileName } from "./download";
import { PROTOCOL_DEFS, limitOceny, protocolVerdict, type ProtocolRow } from "@/lib/protocols";
import type { ProtocolKey } from "@/types";

/** Łamie tekst na linie mieszczące się w `maxWidth`. Wydzielone z bloku „Uwagi",
 *  bo tej samej logiki potrzebuje wydruk kryteriów niebędących jedną liczbą. */
function zawijajTekst(tekst: string, maxWidth: number, size: number): string[] {
  const linie: string[] = [];
  let biezaca = "";
  for (const slowo of tekst.split(/\s+/)) {
    const kandydat = biezaca ? `${biezaca} ${slowo}` : slowo;
    if (biezaca && pdfTextWidth(kandydat, size, false) > maxWidth) {
      linie.push(biezaca);
      biezaca = slowo;
    } else {
      biezaca = kandydat;
    }
  }
  if (biezaca) linie.push(biezaca);
  return linie;
}

/** Składa protokół pomiarowy i zwraca gotowe bajty PDF (bez pobierania — testowalne bez DOM-u). */
export function buildProtocolDoc(key: ProtocolKey, header: DocumentHeader, rows: ProtocolRow[], zapisanyLimit: number): PdfDoc {
  const def = PROTOCOL_DEFS[key];
  // Stary zapis mógł mieć wartość spoza dzisiejszego zakresu; na wydruku ma stać ta,
  // wobec której FAKTYCZNIE oceniono wiersze.
  const limit = limitOceny(def, zapisanyLimit);
  // Izolacja ma teraz kolumnę na każdą parę pomiarową (do 10 naraz, wzór Z.4.4) —
  // w portretowym A4 nagłówki obcinały się do nieczytelnego "L1-..". Poziomy A4
  // daje ~250 pt więcej szerokości, tyle wystarcza na czytelne 6-7-znakowe etykiety.
  const landscape = key === "izolacja";
  const doc = createPdfDoc({
    footer: (d) => drawTitleBlock(d, header, def.title),
    ...(landscape ? { pageW: 841.89, pageH: 595.28 } : {}),
  });
  const M = doc.margin;
  const W = doc.innerW;

  const drawTitle = (cd: boolean) => {
    doc.text(def.title.toUpperCase(), M, doc.y - 12, 13, true);
    // 26, nie 20: tytuł ma 13 pt, więc jego linia potrzebuje tyle miejsca. Przy 20
    // wiersz z normą lądował 8 pt pod linią bazową tytułu — wchodził w jego światło
    // i obie linie zlewały się w nieczytelną plamę.
    doc.y -= 26;
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
  // Stał tu jeszcze mnożnik 1,3: zapas na to, że metryki silnika były helwetyckie, a font
  // osadzony (DejaVu Bold) jest o piątą szerszy. Metryki są już prawdziwe (patrz PDF_W_REG
  // w engine.ts), więc zapas zniknął — wartości stoją dokładnie tam, gdzie kończy się etykieta.
  const col1End = M + 270;
  const col2End = M + W;
  // `box` przyjmuje LEWY DOLNY róg i rośnie w GÓRĘ (patrz `engine.ts`: operator `re`
  // w PDF-ie). Wcześniej dół podawano jako `doc.y - 6`, więc 96-punktowe tło jechało
  // 90 pt ponad bieżącą pozycję — przykrywało tytuł i wychodziło poza krawędź strony.
  // Stąd „szary prostokąt na górze" i wrażenie, że nagłówka nie ma: był, tylko pod spodem.
  const wysBloku = 6 + (info.length / 2) * 15;
  doc.box(M, doc.y + 8 - wysBloku, W, wysBloku, 0.965);
  for (let i = 0; i < info.length; i += 2) {
    const yy = doc.y + 2;
    const label1 = info[i][0] + ":";
    const value1X = M + 6 + pdfTextWidth(label1, 8.5, true) + 6;
    doc.text(label1, M + 6, yy, 8.5, true);
    doc.text(pdfFitText(info[i][1] || "—", col1End - value1X, 8.5, false), value1X, yy, 8.5);
    if (info[i + 1]) {
      const label2 = info[i + 1][0] + ":";
      const value2X = M + 274 + pdfTextWidth(label2, 8.5, true) + 6;
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
    const baseCols = [
      { label: "Lp.", w: 20, key: "__lp", def: undefined },
      ...def.columns!.map((c) => ({ label: c.label, w: c.w, key: c.key, def: c })),
      { label: "Ocena", w: 68, key: "__ocena", def: undefined },
    ];
    const totalW = baseCols.reduce((a, c) => a + c.w, 0);
    const scale = W / totalW;
    const cols = baseCols.map((c) => ({ ...c, w: c.w * scale }));

    // Kolumny opisowe czytają się od lewej — nazwa obwodu ma zaczynać się w jednym
    // miejscu w każdym wierszu. Wartości (liczby, wybory, ocena) WYŚRODKOWUJEMY.
    //
    // Wcześniej wszystko było dosunięte do lewej i tabela wyglądała na rozjechaną:
    // krótkie „500" siedziało pod lewym skrajem szerokiego nagłówka „U pom. [V]",
    // więc oko wiązało wartość z sąsiednią kolumną. Pozycje x były przy tym
    // arytmetycznie ZGODNE — usterka była czysto wzrokowa, ale przez to nie mniej
    // realna: protokół czyta się kolumnami.
    const doSrodka = (c: (typeof cols)[number]) => c.def?.type !== "text";

    /** X, od którego rysujemy tekst w kolumnie o lewej krawędzi `lewa`. */
    const xTekstu = (tekst: string, lewa: number, c: (typeof cols)[number], size: number, bold: boolean) =>
      doSrodka(c) ? lewa + Math.max(3, (c.w - pdfTextWidth(tekst, size, bold)) / 2) : lewa + 4;

    const drawHead = () => {
      doc.box(M, doc.y - 12, W, 18, 0.88);
      let lewa = M;
      cols.forEach((c) => {
        const etykieta = pdfFitText(c.label, c.w - 6, 8, true);
        doc.text(etykieta, xTekstu(etykieta, lewa, c, 8, true), doc.y - 7, 8, true);
        lewa += c.w;
      });
      doc.y -= 18;
      doc.line(M, doc.y + 5, M + W, doc.y + 5, 0.8, 0.4);
    };
    drawHead();

    rows.forEach((r, i) => {
      if (doc.ensure(ROW_H)) drawHead();
      if (i % 2 === 1) doc.box(M, doc.y - ROW_H + 5, W, ROW_H, 0.968);
      let lewa = M;
      cols.forEach((c) => {
        let v: string;
        if (c.key === "__lp") {
          v = String(i + 1);
        } else if (c.key === "__ocena") {
          const ok = def.evaluate!(r, limit);
          v = ok === null ? "—" : ok ? "pozytywna" : "NEGATYWNA";
        } else if (c.def?.type === "computed") {
          v = c.def.compute!(r, limit);
        } else {
          v = r[c.key] === undefined || r[c.key] === "" ? "—" : String(r[c.key]);
        }
        const pogrubione = c.key === "__ocena";
        const tekst = pdfFitText(v, c.w - 6, 8.5, pogrubione);
        doc.text(tekst, xTekstu(tekst, lewa, c, 8.5, pogrubione), doc.y - ROW_H + 11, 8.5, pogrubione);
        lewa += c.w;
      });
      doc.y -= ROW_H;
      doc.line(M, doc.y + 5, M + W, doc.y + 5, 0.4, 0.86);
    });

    doc.y -= 14;
    doc.ensure(20);
    doc.text(`Kryterium oceny: ${def.limitLabel} = ${limit} ${def.limitUnit}`, M, doc.y, 8.5, false, 0.3);
    doc.y -= 12;
    // Kryteria niebędące jedną liczbą (czasy RCD zależne od typu, progi izolacji
    // zależne od napięcia próby) muszą stać na WYDRUKU — bez nich czytający protokół
    // nie ma jak sprawdzić, wobec czego oceniono poszczególne wiersze.
    if (def.extraCriterion) {
      for (const ln of zawijajTekst(def.extraCriterion, W - 10, 8)) {
        doc.ensure(14);
        doc.text(ln, M, doc.y, 8, false, 0.35);
        doc.y -= 11;
      }
    }
    doc.y -= 6;
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
    for (const ln of zawijajTekst(String(header.uwagi), W - 10, 8.5)) {
      doc.text(ln, M, doc.y, 8.5);
      doc.y -= 12;
      doc.ensure(14);
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

  return doc;
}

export async function downloadProtocolPdf(key: ProtocolKey, header: DocumentHeader, rows: ProtocolRow[], limit: number): Promise<boolean> {
  const bytes = await buildProtocolPdf(key, header, rows, limit);
  return downloadPdfBytes(bytes, projectFileName(`protokol-${key}`, header.obiekt, "pdf"));
}

/**
 * Ten sam dokument jako gotowy plik. Rozdzielenie na buildProtocolDoc i buildProtocolPdf jest po to,
 * zeby komplet dokumentacji mogl wziac SAME STRONY i zlozyc je z innymi dokumentami
 * w jeden plik (patrz polaczDokumenty w engine.ts) — zamiast sklejac gotowe PDF-y.
 */
export function buildProtocolPdf(...args: Parameters<typeof buildProtocolDoc>): Promise<Uint8Array> {
  return buildProtocolDoc(...args).finish();
}
