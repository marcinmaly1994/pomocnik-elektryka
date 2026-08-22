import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pdfCharCode, pdfCharWidth, pdfTextWidth, pdfFitText, pdfEscape, createPdfDoc, assemblePdfBytes } from "./engine";
import { parseTtf } from "./ttf";
import { stubPdfFontFetch } from "./testFontMock";

function bytesToAscii(bytes: Uint8Array): string {
  const CHUNK = 0x8000; // osadzony font w bajtach jest za duży na jedno wywołanie fromCharCode(...bytes)
  let out = "";
  for (let i = 0; i < bytes.length; i += CHUNK) out += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return out;
}

const regularFont = parseTtf(new Uint8Array(readFileSync(join(process.cwd(), "src/assets/fonts/DejaVuSans.ttf"))));
const boldFont = parseTtf(new Uint8Array(readFileSync(join(process.cwd(), "src/assets/fonts/DejaVuSans-Bold.ttf"))));

beforeAll(stubPdfFontFetch);

describe("pdfCharCode", () => {
  it("zwraca kod ASCII bez zmian", () => {
    expect(pdfCharCode("A")).toBe(65);
    expect(pdfCharCode(" ")).toBe(32);
  });

  it("mapuje polskie znaki na kody 128+", () => {
    expect(pdfCharCode("ą")).toBe(128);
    expect(pdfCharCode("Ż")).toBe(145);
  });

  it("zamienniki jednoznakowe (np. Ω nie jest tu jednoznakowy — sprawdzamy inny)", () => {
    expect(pdfCharCode("–")).toBe("-".charCodeAt(0));
  });

  it("nieznany znak spoza zakresu -> kod znaku zapytania", () => {
    expect(pdfCharCode("字")).toBe(63);
  });
});

describe("pdfCharWidth", () => {
  it("zwraca szerokość ze zdefiniowanej tabeli", () => {
    expect(pdfCharWidth(65, false)).toBeGreaterThan(0); // "A"
  });

  it("bold i regular mogą się różnić", () => {
    const a = pdfCharWidth(65, false);
    const b = pdfCharWidth(65, true);
    expect(typeof a).toBe("number");
    expect(typeof b).toBe("number");
  });

  it("kod spoza tabeli -> domyślna szerokość 556", () => {
    expect(pdfCharWidth(9999, false)).toBe(556);
  });
});

describe("pdfTextWidth", () => {
  it("jest dodatnia dla niepustego tekstu i rośnie z rozmiarem", () => {
    const w10 = pdfTextWidth("Hello", 10, false);
    const w20 = pdfTextWidth("Hello", 20, false);
    expect(w10).toBeGreaterThan(0);
    expect(w20).toBeCloseTo(w10 * 2, 5);
  });

  it("pusty string ma szerokość zero", () => {
    expect(pdfTextWidth("", 10, false)).toBe(0);
  });

  it("uwzględnia wieloznakowe zamienniki (np. … -> ...)", () => {
    const ellipsis = pdfTextWidth("…", 10, false);
    const dots = pdfTextWidth("...", 10, false);
    expect(ellipsis).toBeCloseTo(dots, 5);
  });
});

describe("pdfFitText", () => {
  it("nie zmienia tekstu, który się mieści", () => {
    expect(pdfFitText("Krótki", 500, 9, false)).toBe("Krótki");
  });

  it("przycina długi tekst i dodaje wielokropek, mieszcząc się w szerokości", () => {
    const long = "To jest bardzo długi tekst, który na pewno nie zmieści się w wąskiej kolumnie tabeli";
    const fitted = pdfFitText(long, 60, 9, false);
    expect(fitted.endsWith("..")).toBe(true);
    expect(pdfTextWidth(fitted, 9, false)).toBeLessThanOrEqual(60);
  });
});

describe("pdfEscape", () => {
  it("escapuje nawiasy i backslash (składnia PDF stringów)", () => {
    expect(pdfEscape("(test)")).toBe("\\(test\\)");
    expect(pdfEscape("a\\b")).toBe("a\\\\b");
  });

  it("koduje polskie znaki jako ósemkowe escape \\ddd", () => {
    // "ą" -> kod 128 -> oktalnie 200
    expect(pdfEscape("ą")).toBe("\\200");
  });

  it("zamienia niekodowalne znaki na fallback", () => {
    expect(pdfEscape("Ω")).toBe("Ohm");
  });
});

describe("createPdfDoc + assemblePdfBytes", () => {
  it("produkuje poprawny nagłówek/trailer PDF", async () => {
    const doc = createPdfDoc();
    doc.text("Testowy dokument", doc.margin, doc.y);
    const bytes = await doc.finish();
    const out = bytesToAscii(bytes);
    expect(out.startsWith("%PDF-1.4")).toBe(true);
    expect(out.trim().endsWith("%%EOF")).toBe(true);
    expect(out).toContain("/Type /Catalog");
    expect(out).toContain("(Testowy dokument)");
  });

  it("zawiera dokładnie jedną stronę, gdy treść się mieści", async () => {
    const doc = createPdfDoc();
    doc.text("Jedna strona", doc.margin, doc.y);
    const bytes = await doc.finish();
    const out = bytesToAscii(bytes);
    expect((out.match(/\/Type \/Page /g) || []).length).toBe(1);
  });

  it("ensure() tworzy nową stronę, gdy zabraknie miejsca", async () => {
    const doc = createPdfDoc({ pageH: 200, margin: 20 }); // mała strona wymusza szybką paginację
    let pageBreaks = 0;
    doc.setNewPageHandler(() => {
      pageBreaks += 1;
    });
    for (let i = 0; i < 30; i++) {
      doc.ensure(20);
      doc.text(`Wiersz ${i}`, doc.margin, doc.y);
      doc.y -= 20;
    }
    const bytes = await doc.finish();
    const out = bytesToAscii(bytes);
    expect(pageBreaks).toBeGreaterThan(0);
    expect((out.match(/\/Type \/Page /g) || []).length).toBe(pageBreaks + 1);
  });

  it("assemblePdfBytes bezpośrednio składa podane strony", () => {
    const bytes = assemblePdfBytes(["0 g BT /F1 9 Tf 10 10 Td (x) Tj ET"], 100, 100, regularFont, boldFont);
    const out = bytesToAscii(bytes);
    expect(out.startsWith("%PDF-1.4")).toBe(true);
    expect((out.match(/\/Type \/Page /g) || []).length).toBe(1);
  });

  it("osadza oba pliki fontów (/FontFile2) i realny BaseFont DejaVu Sans", () => {
    const bytes = assemblePdfBytes(["0 g BT /F1 9 Tf 10 10 Td (x) Tj ET"], 100, 100, regularFont, boldFont);
    const out = bytesToAscii(bytes);
    expect(out).toContain("/Subtype /TrueType");
    expect(out).toContain("/BaseFont /DejaVuSans");
    expect(out).toContain("/BaseFont /DejaVuSans-Bold");
    expect((out.match(/\/FontFile2/g) || []).length).toBe(2);
  });
});
