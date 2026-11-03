import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pdfCharCode, pdfCharWidth, pdfTextWidth, pdfFitText, pdfZawin, pdfEscape, createPdfDoc, assemblePdfBytes, polaczDokumenty, PDF_LAST_CHAR, PDF_POLISH, PDF_W_BOLD, PDF_W_REG, type CzesciDokumentu, type PdfImage } from "./engine";
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

describe("pdfZawin", () => {
  const tekst = "Bez wyceny pozostają: Ładowarka EV / wallbox, Oprawa oświetleniowa, Napęd rolety, Szafka teletechniczna / rack, Robocizna za punkt instalacyjny.";

  it("tekst, który się mieści, zostaje jedną linią", () => {
    expect(pdfZawin("Krótki tekst", 500, 9, false)).toEqual(["Krótki tekst"]);
  });

  it("długi tekst łamie między słowami i nic nie gubi", () => {
    const linie = pdfZawin(tekst, 200, 7.5, false);
    expect(linie.length).toBeGreaterThan(1);
    for (const l of linie) expect(pdfTextWidth(l, 7.5, false)).toBeLessThanOrEqual(200);
    // Złożone z powrotem daje ten sam tekst — w odróżnieniu od pdfFitText nic nie ginie.
    expect(linie.join(" ")).toBe(tekst);
  });

  it("słowo szersze niż linia tnie się twardo, zamiast wyjechać poza kartkę", () => {
    const linie = pdfZawin("Wypustzasilajacyagdwersjapodwojnazuziemieniem", 60, 9, false);
    expect(linie.length).toBeGreaterThan(1);
    for (const l of linie) expect(pdfTextWidth(l, 9, false)).toBeLessThanOrEqual(60);
    expect(linie.join("")).toBe("Wypustzasilajacyagdwersjapodwojnazuziemieniem");
  });

  it("pusty tekst daje pustą listę, a absurdalnie wąska kolumna nie zapętla się", () => {
    expect(pdfZawin("   ", 100, 9, false)).toEqual([]);
    expect(() => pdfZawin("abc def", 0.1, 9, false)).not.toThrow();
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

  it("znaki jednostek mają własne glify, nie transliterację", () => {
    // Ω i ° dostały własne kody w /Differences (146, 147 -> oktalnie 222, 223).
    // Wcześniej szły jako „Ohm" i „st.": zapis niepoprawny dla jednostki i o dwa
    // znaki dłuższy, przez co rozpychał nagłówki tabeli wyników.
    expect(pdfEscape("Ω")).toBe("\\222");
    expect(pdfEscape("°")).toBe("\\223");
  });

  it("znaki bez własnego glifu nadal idą przez fallback", () => {
    expect(pdfEscape("≤")).toBe("<=");
    expect(pdfEscape("—")).toBe("-");
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
    const bytes = assemblePdfBytes([{ content: "0 g BT /F1 9 Tf 10 10 Td (x) Tj ET", w: 100, h: 100 }], regularFont, boldFont);
    const out = bytesToAscii(bytes);
    expect(out.startsWith("%PDF-1.4")).toBe(true);
    expect((out.match(/\/Type \/Page /g) || []).length).toBe(1);
  });

  it("osadza oba pliki fontów (/FontFile2) i realny BaseFont DejaVu Sans", () => {
    const bytes = assemblePdfBytes([{ content: "0 g BT /F1 9 Tf 10 10 Td (x) Tj ET", w: 100, h: 100 }], regularFont, boldFont);
    const out = bytesToAscii(bytes);
    expect(out).toContain("/Subtype /TrueType");
    expect(out).toContain("/BaseFont /DejaVuSans");
    expect(out).toContain("/BaseFont /DejaVuSans-Bold");
    expect((out.match(/\/FontFile2/g) || []).length).toBe(2);
  });
});

/**
 * Każda strona musi zaczynać się białym tłem na pełny MediaBox.
 *
 * Bez tego strona jest PRZEZROCZYSTA. Czytniki na jasnym podłożu dorysowują biel za
 * nas i usterka jest niewidoczna — ale wbudowany czytnik Chrome ma podłoże ciemne,
 * więc pokazywał czarny prostokąt zamiast dokumentu. Zgłoszone przez użytkownika
 * dopiero po dodaniu podglądu („wyskakuje czarne okno"), choć problem siedział w
 * samym dokumencie i dotyczył tak samo pobranych plików.
 */
describe("createPdfDoc — tło stron", () => {
  const TLO = /^1 g 0 0 595\.28 841\.89 re f 0 g/;

  it("pierwsza strona zaczyna się białym tłem na cały MediaBox", async () => {
    const doc = createPdfDoc();
    doc.text("Cokolwiek", 42, 700);
    const out = bytesToAscii(await doc.finish());
    const strumien = out.slice(out.indexOf("stream\n") + 7);
    expect(strumien).toMatch(TLO);
  });

  it("tło dostaje TAKŻE każda kolejna strona", async () => {
    const doc = createPdfDoc();
    // `ensure` z wysokością większą niż strona wymusza łamanie.
    doc.text("Strona 1", 42, 700);
    expect(doc.ensure(10_000)).toBe(true);
    doc.text("Strona 2", 42, 700);
    const out = bytesToAscii(await doc.finish());

    const strumienie = [...out.matchAll(/stream\n([\s\S]*?)\nendstream/g)]
      .map((m) => m[1])
      // Osadzone fonty to binaria, w których sekwencja "Tj" trafia się przypadkiem.
      // Odsiewamy je rozmiarem: font waży setki kilobajtów, strumień treści strony
      // kilkaset bajtów — sam operator "Tj" nie wystarczy, żeby je rozróżnić.
      .filter((s) => s.includes("Tj") && s.length < 4000);
    expect(strumienie).toHaveLength(2);
    for (const s of strumienie) expect(s).toMatch(TLO);
  });
});

/**
 * Osadzanie obrazów. Rysunki (schemat, rzut) wchodzą do PDF-a jako rastry, więc silnik
 * musi umieć wypuścić poprawny XObject i podpiąć go do zasobów strony — bez tego
 * czytnik pokazuje pustą kartkę i nie zgłasza błędu.
 */
describe("createPdfDoc — obrazy", () => {
  const obraz = { bytes: new Uint8Array([1, 2, 3, 4, 5]), width: 4, height: 2, filter: "FlateDecode" as const };

  it("wypuszcza XObject i odwołuje się do niego w treści oraz w zasobach strony", async () => {
    const doc = createPdfDoc();
    doc.image(obraz, 50, 100, 200, 100);
    const out = bytesToAscii(await doc.finish());

    expect(out).toContain("/Type /XObject /Subtype /Image /Width 4 /Height 2");
    expect(out).toContain("/Filter /FlateDecode /Length 5");
    // `cm` skaluje jednostkowy kwadrat do prostokąta docelowego i przesuwa na miejsce.
    expect(out).toContain("q 200.00 0 0 100.00 50.00 100.00 cm /Im1 Do Q");
    expect(out).toMatch(/\/XObject << \/Im1 \d+ 0 R >>/);
  });

  it("ten sam obraz użyty dwa razy to JEDEN obiekt w pliku", async () => {
    // Inaczej rysunek powtórzony na kilku stronach mnożyłby megabajty.
    const doc = createPdfDoc();
    doc.image(obraz, 10, 10, 50, 25);
    doc.image(obraz, 10, 200, 50, 25);
    const out = bytesToAscii(await doc.finish());

    expect(out.split("/Subtype /Image")).toHaveLength(2);
    expect(out.split("/Im1 Do")).toHaveLength(3);
  });

  it("bez obrazów zasoby strony nie dostają pustego /XObject", async () => {
    const doc = createPdfDoc();
    doc.text("Sam tekst", 42, 700);
    const out = bytesToAscii(await doc.finish());
    expect(out).not.toContain("/XObject");
  });
});

/**
 * Skladanie kilku dokumentow w jeden plik — fundament kompletu dokumentacji.
 *
 * Sklejamy CZESCI (strony i obrazy), a nie gotowe PDF-y: te trzeba by parsowac
 * i przenumerowywac, a tutaj wszystko powstaje w naszym wlasnym generatorze.
 */
describe("polaczDokumenty + assemblePdfBytes", () => {
  const obraz = (bajt: number): PdfImage => ({
    bytes: new Uint8Array([bajt]),
    width: 1,
    height: 1,
    filter: "FlateDecode",
  });

  it("zachowuje kolejnosc stron kolejnych dokumentow", () => {
    const a: CzesciDokumentu = { pages: [{ content: "A1", w: 10, h: 10 }, { content: "A2", w: 10, h: 10 }], images: [] };
    const b: CzesciDokumentu = { pages: [{ content: "B1", w: 20, h: 20 }], images: [] };
    expect(polaczDokumenty([a, b]).pages.map((s) => s.content)).toEqual(["A1", "A2", "B1"]);
  });

  /** Kazda strona zostaje przy SWOIM formacie — komplet miesza pion z poziomem. */
  it("nie ujednolica rozmiaru stron", () => {
    const pion: CzesciDokumentu = { pages: [{ content: "p", w: 595.28, h: 841.89 }], images: [] };
    const poziom: CzesciDokumentu = { pages: [{ content: "l", w: 841.89, h: 595.28 }], images: [] };
    const { pages } = polaczDokumenty([pion, poziom]);
    expect(pages[0]).toMatchObject({ w: 595.28, h: 841.89 });
    expect(pages[1]).toMatchObject({ w: 841.89, h: 595.28 });
  });

  /**
   * Sedno laczenia: `/Im1` drugiego dokumentu wskazywalby obraz pierwszego, wiec na
   * kartce wyszedlby rzut parteru w miejscu schematu. Numery przesuwaja sie o tyle,
   * ile obrazow wniosly dokumenty przed nim.
   */
  it("przenumerowuje odwolania do obrazow", () => {
    const a: CzesciDokumentu = {
      pages: [{ content: "q 1 0 0 1 0 0 cm /Im1 Do Q", w: 10, h: 10 }],
      images: [obraz(1)],
    };
    const b: CzesciDokumentu = {
      pages: [{ content: "q 1 0 0 1 0 0 cm /Im1 Do Q /Im2 Do", w: 10, h: 10 }],
      images: [obraz(2), obraz(3)],
    };
    const { pages, images } = polaczDokumenty([a, b]);
    expect(pages[0].content).toContain("/Im1 Do");
    expect(pages[1].content).toContain("/Im2 Do");
    expect(pages[1].content).toContain("/Im3 Do");
    expect(images).toHaveLength(3);
  });

  it("pierwszy dokument zostaje nietkniety — nie ma czego przesuwac", () => {
    const a: CzesciDokumentu = { pages: [{ content: "/Im1 Do", w: 10, h: 10 }], images: [obraz(1)] };
    expect(polaczDokumenty([a]).pages[0].content).toBe("/Im1 Do");
  });

  it("z pustej listy powstaje pusty zestaw, nie wyjatek", () => {
    expect(polaczDokumenty([])).toEqual({ pages: [], images: [] });
  });

  it("czesci() i finish() zamykaja dokument tak samo — bez zdublowanej strony", async () => {
    const doc = createPdfDoc({ footer: (d) => d.text("stopka", 10, 10) });
    doc.text("tresc", doc.margin, doc.y);
    const czesci = doc.czesci();
    expect(czesci.pages).toHaveLength(1);
    // Drugie zamkniecie nie dokleja pustej kartki z druga tabliczka.
    expect(doc.czesci().pages).toHaveLength(1);
    const out = bytesToAscii(await doc.finish());
    expect((out.match(/\/Type \/Page /g) || []).length).toBe(1);
    expect((out.match(/\(stopka\)/g) || []).length).toBe(1);
  });

  it("zlozony komplet ma tyle stron, ile wniosly dokumenty", async () => {
    const pion = createPdfDoc();
    pion.text("kosztorys", pion.margin, pion.y);
    const poziom = createPdfDoc({ pageW: 841.89, pageH: 595.28 });
    poziom.text("karta obliczen", poziom.margin, poziom.y);
    const { pages, images } = polaczDokumenty([pion.czesci(), poziom.czesci()]);
    const out = bytesToAscii(assemblePdfBytes(pages, regularFont, boldFont, images));
    expect((out.match(/\/Type \/Page /g) || []).length).toBe(2);
    expect(out).toContain("/MediaBox [0 0 595.28 841.89]");
    expect(out).toContain("/MediaBox [0 0 841.89 595.28]");
  });
});

/**
 * Metryki tekstu MUSZA odpowiadac osadzonemu fontowi.
 *
 * Przez dlugi czas nie odpowiadaly: w tablicach stala Helvetica, a dokument osadzal
 * DejaVu. Kazde przyciecie do kolumny i kazde wyrownanie do prawej liczylo sie
 * z zanizonych liczb, wiec napisy wychodzily poza swoje rubryki — widac to bylo
 * dopiero na wyrenderowanej kartce, nigdy w tescie. Ten test zamyka te droge:
 * tablice sa porownywane z PLIKAMI fontow, wiec rozjechac sie moga tylko razem
 * z ich podmiana, i wtedy powie o tym czerwony test, a nie uzytkownik.
 */
describe("metryki fontu", () => {
  /** Kod PDF -> code point, odwrocone z `PDF_POLISH` (ta sama droga co `widthsForFont`). */
  const codePointDlaKodu: Record<number, number> = {};
  for (const ch of Object.keys(PDF_POLISH)) codePointDlaKodu[PDF_POLISH[ch]] = ch.codePointAt(0)!;

  const zFontu = (font: ReturnType<typeof parseTtf>) => {
    const out: number[] = [];
    for (let code = 32; code <= PDF_LAST_CHAR; code++) {
      if (code === 127) {
        out.push(0);
        continue;
      }
      const cp = code <= 126 ? code : codePointDlaKodu[code];
      out.push(cp !== undefined ? (font.widthOf(cp) ?? 0) : 0);
    }
    return out;
  };

  it("tablica regular odpowiada plikowi DejaVuSans.ttf", () => {
    expect(PDF_W_REG).toEqual(zFontu(regularFont));
  });

  it("tablica bold odpowiada plikowi DejaVuSans-Bold.ttf", () => {
    expect(PDF_W_BOLD).toEqual(zFontu(boldFont));
  });

  /** Kazdy kod ma wlasna szerokosc — brak wpisu oznaczalby ciche 556 z `pdfCharWidth`,
   *  czyli znow zgadywanie zamiast pomiaru. */
  it("kazdy uzywany kod ma szerokosc z fontu", () => {
    for (let code = 32; code <= PDF_LAST_CHAR; code++) {
      if (code === 127) continue;
      expect(pdfCharWidth(code, false)).toBeGreaterThan(0);
      expect(pdfCharWidth(code, true)).toBeGreaterThan(0);
    }
  });

  /**
   * Sedno dla ukladu stron: bold jest SZERSZY od regular. Tablice helwetyckie mowily
   * to samo, ale o innych proporcjach — i to na nich opieraly sie wszystkie rubryki.
   */
  it("pogrubiony napis jest szerszy od zwyklego", () => {
    const napis = "Świadectwo wzorcowania:";
    expect(pdfTextWidth(napis, 8.5, true)).toBeGreaterThan(pdfTextWidth(napis, 8.5, false));
  });
});
