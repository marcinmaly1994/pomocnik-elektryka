/**
 * Minimalny parser TrueType (SFNT) — czyta tylko to, co potrzebne do osadzenia fontu
 * w PDF jako prosty font TrueType: metryki (`head`/`hhea`/`OS/2`/`post`) i szerokości
 * znaków (`cmap` format 4 → glyph ID → `hmtx`). Bez obsługi CFF/OpenType-CFF (DejaVu
 * to czyste glyf/loca TrueType, więc nie jest potrzebna) ani subsettingu — cały plik
 * fontu jest osadzany jako jest, ten moduł tylko odczytuje z niego liczby.
 */

interface TableEntry {
  offset: number;
  length: number;
}

function readTableDirectory(view: DataView): Map<string, TableEntry> {
  const numTables = view.getUint16(4);
  const tables = new Map<string, TableEntry>();
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16;
    let tag = "";
    for (let j = 0; j < 4; j++) tag += String.fromCharCode(view.getUint8(rec + j));
    tables.set(tag, { offset: view.getUint32(rec + 8), length: view.getUint32(rec + 12) });
  }
  return tables;
}

/** Mapa code point (Unicode) -> glyph ID, z podtablicy `cmap` formatu 4 (Windows BMP). */
function parseCmapFormat4(view: DataView, base: number): Map<number, number> {
  const map = new Map<number, number>();
  const segCountX2 = view.getUint16(base + 6);
  const segCount = segCountX2 / 2;
  const endCodeBase = base + 14;
  const startCodeBase = endCodeBase + segCountX2 + 2; // +2 pomija reservedPad
  const idDeltaBase = startCodeBase + segCountX2;
  const idRangeOffsetBase = idDeltaBase + segCountX2;

  for (let seg = 0; seg < segCount; seg++) {
    const endCode = view.getUint16(endCodeBase + seg * 2);
    const startCode = view.getUint16(startCodeBase + seg * 2);
    const idDelta = view.getInt16(idDeltaBase + seg * 2);
    const idRangeOffset = view.getUint16(idRangeOffsetBase + seg * 2);
    if (startCode === 0xffff && endCode === 0xffff) continue;
    for (let cp = startCode; cp <= endCode && cp !== 0xffff; cp++) {
      let glyphId: number;
      if (idRangeOffset === 0) {
        glyphId = (cp + idDelta) & 0xffff;
      } else {
        const addr = idRangeOffsetBase + seg * 2 + idRangeOffset + (cp - startCode) * 2;
        if (addr + 2 > view.byteLength) continue;
        const raw = view.getUint16(addr);
        glyphId = raw === 0 ? 0 : (raw + idDelta) & 0xffff;
      }
      if (glyphId !== 0) map.set(cp, glyphId);
    }
  }
  return map;
}

function parseCmap(view: DataView, table: TableEntry): Map<number, number> {
  const base = table.offset;
  const numTables = view.getUint16(base + 2);
  let best: { platformID: number; encodingID: number; offset: number } | null = null;
  for (let i = 0; i < numTables; i++) {
    const rec = base + 4 + i * 8;
    const platformID = view.getUint16(rec);
    const encodingID = view.getUint16(rec + 2);
    const offset = view.getUint32(rec + 4);
    // preferuj Windows Unicode BMP (3,1); w drugiej kolejności dowolny Unicode (0,x)
    const isWindowsUnicode = platformID === 3 && encodingID === 1;
    const isUnicode = platformID === 0;
    if (isWindowsUnicode || (!best && isUnicode)) {
      const format = view.getUint16(base + offset);
      if (format === 4) {
        best = { platformID, encodingID, offset };
        if (isWindowsUnicode) break;
      }
    }
  }
  if (!best) return new Map();
  return parseCmapFormat4(view, base + best.offset);
}

export interface ParsedTtf {
  /** Surowe bajty całego pliku fontu — do osadzenia jako /FontFile2. */
  bytes: Uint8Array;
  unitsPerEm: number;
  ascent: number;
  descent: number;
  capHeight: number;
  italicAngle: number;
  bbox: [number, number, number, number];
  /** Szerokość znaku (advance width) w jednostkach 1000/em, wg PDF /Widths. `null` = brak glifu dla tego code pointa. */
  widthOf(codePoint: number): number | null;
}

export function parseTtf(bytes: Uint8Array): ParsedTtf {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tables = readTableDirectory(view);

  const head = tables.get("head");
  const hhea = tables.get("hhea");
  const maxp = tables.get("maxp");
  const hmtxTable = tables.get("hmtx");
  const cmapTable = tables.get("cmap");
  const os2 = tables.get("OS/2");
  const post = tables.get("post");
  if (!head || !hhea || !maxp || !hmtxTable || !cmapTable) {
    throw new Error("Nieprawidłowy plik TrueType — brak wymaganych tabel (head/hhea/maxp/hmtx/cmap).");
  }

  const unitsPerEm = view.getUint16(head.offset + 18);
  const bbox: [number, number, number, number] = [
    view.getInt16(head.offset + 36),
    view.getInt16(head.offset + 38),
    view.getInt16(head.offset + 40),
    view.getInt16(head.offset + 42),
  ];

  const ascentRaw = view.getInt16(hhea.offset + 4);
  const descentRaw = view.getInt16(hhea.offset + 6);
  const numberOfHMetrics = view.getUint16(hhea.offset + 34);

  let capHeightRaw = Math.round(unitsPerEm * 0.7);
  let italicAngle = 0;
  if (os2) {
    const version = view.getUint16(os2.offset);
    if (version >= 2 && os2.length >= 90) capHeightRaw = view.getInt16(os2.offset + 88);
  }
  if (post) {
    // italicAngle to liczba stałoprzecinkowa 16.16 (stopnie)
    const raw = view.getInt32(post.offset + 4);
    italicAngle = raw / 65536;
  }

  const scale = 1000 / unitsPerEm;
  const cmap = parseCmap(view, cmapTable);

  const advanceWidths: number[] = [];
  for (let i = 0; i < numberOfHMetrics; i++) {
    advanceWidths.push(view.getUint16(hmtxTable.offset + i * 4));
  }
  const lastWidth = advanceWidths[advanceWidths.length - 1] ?? 0;

  function widthOfGlyph(glyphId: number): number {
    const raw = glyphId < advanceWidths.length ? advanceWidths[glyphId] : lastWidth;
    return Math.round(raw * scale);
  }

  return {
    bytes,
    unitsPerEm,
    ascent: Math.round(ascentRaw * scale),
    descent: Math.round(descentRaw * scale),
    capHeight: Math.round(capHeightRaw * scale),
    italicAngle,
    bbox: bbox.map((v) => Math.round(v * scale)) as [number, number, number, number],
    widthOf(codePoint: number): number | null {
      const glyphId = cmap.get(codePoint);
      if (glyphId === undefined) return null;
      return widthOfGlyph(glyphId);
    },
  };
}
