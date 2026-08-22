import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseTtf } from "./ttf";

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
