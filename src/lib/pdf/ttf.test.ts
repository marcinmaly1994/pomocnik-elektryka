import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { glifyPoNazwach, odchudzTtf, parseTtf } from "./ttf";
import { PDF_DIFF_NAMES } from "./engine";

const fontPath = join(process.cwd(), "src/assets/fonts/DejaVuSans.ttf");
const font = parseTtf(new Uint8Array(readFileSync(fontPath)));

describe("parseTtf (na realnym pliku DejaVuSans.ttf)", () => {
  it("czyta metryki fontu z tabel head/hhea/OS2/post", () => {
    expect(font.unitsPerEm).toBe(2048);
    expect(font.ascent).toBeGreaterThan(0);
    expect(font.descent).toBeLessThan(0);
    expect(font.capHeight).toBeGreaterThan(0);
    expect(font.italicAngle).toBe(0);
  });

  it("zwraca szerokość dla znaków ASCII obecnych w foncie", () => {
    const space = font.widthOf(32);
    const capA = font.widthOf(65);
    expect(space).not.toBeNull();
    expect(capA).not.toBeNull();
    expect(capA!).toBeGreaterThan(space!); // "A" szersze niż spacja
  });

  it("zwraca szerokość dla polskich znaków (dowód, że cmap trafia we właściwe glify)", () => {
    const ogonekA = font.widthOf(0x0105); // ą
    const lstrokeL = font.widthOf(0x0142); // ł
    expect(ogonekA).not.toBeNull();
    expect(ogonekA!).toBeGreaterThan(0);
    expect(lstrokeL).not.toBeNull();
    expect(lstrokeL!).toBeGreaterThan(0);
  });

  it("zwraca null dla code pointów, których nie ma w foncie", () => {
    expect(font.widthOf(0x1f600)).toBeNull(); // emoji spoza zakresu DejaVu Sans
  });

  it("rzuca błąd dla danych, które nie są poprawnym plikiem TrueType", () => {
    expect(() => parseTtf(new Uint8Array([0, 0, 0, 0]))).toThrow();
  });
});

/**
 * Odchudzanie fontu do osadzenia w PDF (audyt 5.11.2026, B12): każdy PDF ważył ok. 1,4 MB,
 * bo oba pliki DejaVu szły do niego w całości, choć dokument używa stałego zestawu
 * ok. 120 znaków.
 */
describe("odchudzTtf", () => {
  const surowe = new Uint8Array(readFileSync(fontPath));
  const znaki = [...Array.from({ length: 95 }, (_, i) => 32 + i), 0x0105, 0x0142, 0x017c, 0x03a9, 0x00b0];
  const chude = odchudzTtf(surowe, znaki);
  const poChudnieciu = parseTtf(chude);

  const tabele = (b: Uint8Array) => {
    const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const m = new Map<string, { offset: number; length: number; checksum: number }>();
    for (let i = 0; i < v.getUint16(4); i++) {
      const r = 12 + i * 16;
      const tag = String.fromCharCode(...b.slice(r, r + 4));
      m.set(tag, { checksum: v.getUint32(r + 4), offset: v.getUint32(r + 8), length: v.getUint32(r + 12) });
    }
    return m;
  };
  const sumaKontrolna = (b: Uint8Array, offset: number, length: number) => {
    let s = 0;
    for (let i = 0; i < length; i += 4) {
      let w = 0;
      for (let k = 0; k < 4; k++) w = (w << 8) | (i + k < length ? b[offset + i + k] : 0);
      s = (s + (w >>> 0)) >>> 0;
    }
    return s;
  };

  it("jest kilka razy mniejszy od oryginału", () => {
    expect(chude.length).toBeLessThan(surowe.length / 3);
  });

  it("szerokości wszystkich potrzebnych znaków są takie same jak w oryginale", () => {
    for (const cp of znaki) expect(poChudnieciu.widthOf(cp)).toBe(font.widthOf(cp));
    expect(poChudnieciu.ascent).toBe(font.ascent);
    expect(poChudnieciu.bbox).toEqual(font.bbox);
  });

  it("zostawia tablice potrzebne czytnikom PDF, wyrzuca zbędne", () => {
    const t = tabele(chude);
    for (const tag of ["cmap", "glyf", "head", "hhea", "hmtx", "loca", "maxp", "post"]) expect(t.has(tag)).toBe(true);
    for (const tag of ["GPOS", "GSUB", "kern", "FFTM"]) expect(t.has(tag)).toBe(false);
  });

  it("kontur potrzebnego glifu jest bajt w bajt ten sam, niepotrzebny jest pusty", () => {
    const glif = (b: Uint8Array, gid: number) => {
      const t = tabele(b);
      const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
      const head = t.get("head")!, loca = t.get("loca")!, glyf = t.get("glyf")!;
      const dlugie = v.getInt16(head.offset + 50) === 1;
      const off = (i: number) => (dlugie ? v.getUint32(loca.offset + i * 4) : v.getUint16(loca.offset + i * 2) * 2);
      return b.slice(glyf.offset + off(gid), glyf.offset + off(gid + 1));
    };
    // Glif litery „a" (gid 0x44 w DejaVu): w nowym pliku zaczyna się dokładnie tymi
    // samymi bajtami co w oryginale (dalej może dojść wyrównanie do 4 bajtów).
    const gidA = 0x44;
    const oryginal = Array.from(glif(surowe, gidA));
    expect(oryginal.length).toBeGreaterThan(0);
    expect(Array.from(glif(chude, gidA)).slice(0, oryginal.length)).toEqual(oryginal);
    // Ostatni glif fontu (rzadki znak spoza zestawu) — kontur wycięty.
    const t = tabele(chude);
    const nGlifow = new DataView(chude.buffer, chude.byteOffset, chude.byteLength).getUint16(t.get("maxp")!.offset + 4);
    expect(glif(chude, nGlifow - 1).length).toBe(0);
  });

  it("sumy kontrolne tabel i całego pliku się zgadzają", () => {
    const t = tabele(chude);
    for (const [tag, e] of t) {
      if (tag === "head") continue; // head liczony z wyzerowanym checkSumAdjustment
      expect(sumaKontrolna(chude, e.offset, e.length)).toBe(e.checksum);
    }
    expect(sumaKontrolna(chude, 0, chude.length)).toBe(0xb1b0afba);
  });
});

/**
 * PDF szuka glifu po NAZWIE z /Differences, a nie po Unicode — i w DejaVu nazwa nie
 * zawsze trafia w glif z `cmap` („Delta" to U+2206, nie U+0394). Bez tych glifów
 * odchudzony font gubił „Δ" w „ΔU / limit" karty obliczeń.
 */
describe("glifyPoNazwach i nazwy z /Differences", () => {
  const surowe = new Uint8Array(readFileSync(fontPath));
  /** Długość konturu glifu `gid` w pliku po `odchudzTtf` (loca zawsze w formacie długim). */
  const dlugoscGlifu = (b: Uint8Array, gid: number) => {
    const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
    let loca = 0;
    for (let i = 0; i < v.getUint16(4); i++) if (String.fromCharCode(...b.slice(12 + i * 16, 16 + i * 16)) === "loca") loca = v.getUint32(12 + i * 16 + 8);
    return v.getUint32(loca + (gid + 1) * 4) - v.getUint32(loca + gid * 4);
  };

  /** Sprawdza tablicę standardowych nazw Macintosha: glif wskazany nazwą musi być tym,
   *  który zostaje po odchudzeniu do SAMEGO Unicode tej litery. */
  it("standardowe nazwy Macintosha trafiają w glify swoich znaków Unicode", () => {
    const pary: [string, number][] = [["lslash", 0x142], ["oacute", 0xf3], ["degree", 0xb0], ["Cacute", 0x106], ["periodcentered", 0xb7], ["twosuperior", 0xb2], ["Lslash", 0x141]];
    const poNazwie = glifyPoNazwach(surowe, pary.map(([n]) => n));
    for (const [nazwa, cp] of pary) {
      const gid = poNazwie.get(nazwa);
      expect(gid, nazwa).toBeDefined();
      expect(dlugoscGlifu(odchudzTtf(surowe, [cp]), gid!), nazwa).toBeGreaterThan(0);
    }
  });

  it("każda nazwa z /Differences ma glif z konturem w odchudzonym foncie (regular i bold)", () => {
    for (const plik of ["DejaVuSans.ttf", "DejaVuSans-Bold.ttf"]) {
      const b = new Uint8Array(readFileSync(join(process.cwd(), "src/assets/fonts", plik)));
      const chude = odchudzTtf(b, [65], PDF_DIFF_NAMES);
      const gidy = glifyPoNazwach(chude, PDF_DIFF_NAMES);
      const v = new DataView(chude.buffer, chude.byteOffset, chude.byteLength);
      const tab = new Map<string, number>();
      for (let i = 0; i < v.getUint16(4); i++) tab.set(String.fromCharCode(...chude.slice(12 + i * 16, 16 + i * 16)), v.getUint32(12 + i * 16 + 8));
      const loca = tab.get("loca")!;
      for (const nazwa of PDF_DIFF_NAMES) {
        const gid = gidy.get(nazwa);
        expect(gid, `${plik}: ${nazwa}`).toBeDefined();
        const dlugosc = v.getUint32(loca + (gid! + 1) * 4) - v.getUint32(loca + gid! * 4);
        expect(dlugosc, `${plik}: ${nazwa}`).toBeGreaterThan(0);
      }
    }
  });
});
