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

/** Tablice, które zostają w odchudzonym foncie: wszystko, czego czytnik PDF potrzebuje do
 *  narysowania glifu (kontury, metryki, hinting) i do znalezienia go po nazwie z
 *  /Differences (`post`) albo po Unicode (`cmap`). `name` zostaje z noticą licencyjną. */
const TABELE_DO_OSADZENIA = new Set(["cmap", "cvt ", "fpgm", "gasp", "glyf", "head", "hhea", "hmtx", "loca", "maxp", "name", "OS/2", "post", "prep"]);

function sumaKontrolnaTabeli(b: Uint8Array): number {
  let suma = 0;
  for (let i = 0; i < b.length; i += 4) {
    const slowo = ((b[i] << 24) | ((b[i + 1] ?? 0) << 16) | ((b[i + 2] ?? 0) << 8) | (b[i + 3] ?? 0)) >>> 0;
    suma = (suma + slowo) >>> 0;
  }
  return suma;
}

/**
 * Font TrueType do osadzenia w PDF, z konturami TYLKO dla `kodyZnakow` — reszta glifów
 * zostaje, ale pusta.
 *
 * Audyt 5.11.2026 (B12): każdy PDF ważył ok. 1,4 MB, nawet jednostronicowa legenda, bo oba
 * pliki DejaVu (740 i 690 kB) szły do niego w całości — choć dokument używa stałego zestawu
 * ok. 120 znaków (ASCII, polskie litery, kilka jednostek; patrz `PDF_POLISH` w engine.ts).
 *
 * Celowo NIE jest to pełny subsetting z przenumerowaniem glifów: numery glifów, `cmap`
 * i `post` zostają nietknięte, więc /Differences z nazwami glifów i szerokości działają
 * dokładnie tak samo jak na pełnym foncie. Zmienia się tylko `glyf` (kontury niepotrzebnych
 * glifów wycięte) i `loca` (zawsze format długi), a znikają tablice, których PDF z prostym
 * fontem TrueType nie czyta (GSUB/GPOS/kern/GDEF…). Kontury złożone ciągną za sobą swoje
 * składowe — „ą" w wielu fontach to „a" + ogonek.
 */
export function odchudzTtf(bytes: Uint8Array, kodyZnakow: number[], nazwyGlifow: string[] = []): Uint8Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tables = readTableDirectory(view);
  const head = tables.get("head"), maxp = tables.get("maxp"), loca = tables.get("loca"), glyf = tables.get("glyf"), cmapT = tables.get("cmap");
  if (!head || !maxp || !loca || !glyf || !cmapT) return bytes; // nie TrueType z konturami glyf — osadzamy jak jest

  const liczbaGlifow = view.getUint16(maxp.offset + 4);
  const dlugaLoca = view.getInt16(head.offset + 50) === 1;
  const poczatek = (gid: number) => (dlugaLoca ? view.getUint32(loca.offset + gid * 4) : view.getUint16(loca.offset + gid * 2) * 2);

  // Potrzebne glify: .notdef + glify znaków + (rekurencyjnie) składowe glifów złożonych.
  const cmap = parseCmap(view, cmapT);
  const potrzebne = new Set<number>([0]);
  const kolejka: number[] = [];
  const dodaj = (gid: number | undefined) => {
    if (gid !== undefined && gid < liczbaGlifow && !potrzebne.has(gid)) {
      potrzebne.add(gid);
      kolejka.push(gid);
    }
  };
  for (const cp of kodyZnakow) dodaj(cmap.get(cp));
  // Glify wskazane NAZWĄ (/Differences) — nazwa nie musi trafiać w ten sam glif co Unicode
  // (w DejaVu „Delta" to U+2206, nie U+0394), a czytnik PDF szuka właśnie po nazwie.
  for (const gid of glifyPoNazwach(bytes, nazwyGlifow).values()) dodaj(gid);
  while (kolejka.length > 0) {
    const gid = kolejka.pop()!;
    const od = poczatek(gid), dlugosc = poczatek(gid + 1) - od;
    if (dlugosc <= 0 || view.getInt16(glyf.offset + od) >= 0) continue; // pusty albo prosty
    let p = glyf.offset + od + 10;
    for (;;) {
      const flagi = view.getUint16(p);
      const skladowa = view.getUint16(p + 2);
      if (skladowa < liczbaGlifow && !potrzebne.has(skladowa)) {
        potrzebne.add(skladowa);
        kolejka.push(skladowa);
      }
      p += 4 + (flagi & 0x0001 ? 4 : 2);
      if (flagi & 0x0008) p += 2;
      else if (flagi & 0x0040) p += 4;
      else if (flagi & 0x0080) p += 8;
      if (!(flagi & 0x0020)) break;
    }
  }

  // Nowe glyf + loca (format długi).
  const kawalki: Uint8Array[] = [];
  const nowaLoca = new Uint8Array((liczbaGlifow + 1) * 4);
  const lv = new DataView(nowaLoca.buffer);
  let przesuniecie = 0;
  for (let gid = 0; gid < liczbaGlifow; gid++) {
    lv.setUint32(gid * 4, przesuniecie);
    if (!potrzebne.has(gid)) continue;
    const od = poczatek(gid), dlugosc = poczatek(gid + 1) - od;
    if (dlugosc <= 0) continue;
    const z4 = (dlugosc + 3) & ~3;
    const kawalek = new Uint8Array(z4);
    kawalek.set(bytes.subarray(glyf.offset + od, glyf.offset + od + dlugosc));
    kawalki.push(kawalek);
    przesuniecie += z4;
  }
  lv.setUint32(liczbaGlifow * 4, przesuniecie);
  const nowyGlyf = new Uint8Array(przesuniecie);
  let w = 0;
  for (const k of kawalki) {
    nowyGlyf.set(k, w);
    w += k.length;
  }

  const nowyHead = bytes.slice(head.offset, head.offset + head.length);
  const hv = new DataView(nowyHead.buffer);
  hv.setInt16(50, 1); // indexToLocFormat: długi
  hv.setUint32(8, 0); // checkSumAdjustment liczony na końcu, z całego pliku

  // Złożenie pliku SFNT: katalog tablic posortowany po tagu, tablice wyrównane do 4 bajtów.
  const tagi = [...tables.keys()].filter((t) => TABELE_DO_OSADZENIA.has(t)).sort();
  const dane = new Map<string, Uint8Array>();
  for (const tag of tagi) {
    const e = tables.get(tag)!;
    dane.set(tag, tag === "glyf" ? nowyGlyf : tag === "loca" ? nowaLoca : tag === "head" ? nowyHead : bytes.slice(e.offset, e.offset + e.length));
  }
  const n = tagi.length;
  const naglowek = 12 + n * 16;
  const rozmiar = naglowek + tagi.reduce((s, t) => s + ((dane.get(t)!.length + 3) & ~3), 0);
  const wynik = new Uint8Array(rozmiar);
  const ov = new DataView(wynik.buffer);
  ov.setUint32(0, view.getUint32(0)); // sfntVersion
  ov.setUint16(4, n);
  const potega = 2 ** Math.floor(Math.log2(n));
  ov.setUint16(6, potega * 16);
  ov.setUint16(8, Math.log2(potega));
  ov.setUint16(10, n * 16 - potega * 16);
  let pozycja = naglowek;
  let offsetHead = 0;
  tagi.forEach((tag, i) => {
    const d = dane.get(tag)!;
    const r = 12 + i * 16;
    for (let k = 0; k < 4; k++) ov.setUint8(r + k, tag.charCodeAt(k));
    ov.setUint32(r + 4, sumaKontrolnaTabeli(d));
    ov.setUint32(r + 8, pozycja);
    ov.setUint32(r + 12, d.length);
    wynik.set(d, pozycja);
    if (tag === "head") offsetHead = pozycja;
    pozycja += (d.length + 3) & ~3;
  });
  ov.setUint32(offsetHead + 8, (0xb1b0afba - sumaKontrolnaTabeli(wynik)) >>> 0);
  return wynik;
}

/** Standardowe nazwy glifów Macintosha (258) — tablica `post` w formacie 2.0 wskazuje na nie
 *  indeksami 0..257, a dopiero dalsze indeksy na własne nazwy fontu. */
const NAZWY_MAC =
  ".notdef .null nonmarkingreturn space exclam quotedbl numbersign dollar percent ampersand quotesingle parenleft parenright asterisk plus comma hyphen period slash zero one two three four five six seven eight nine colon semicolon less equal greater question at A B C D E F G H I J K L M N O P Q R S T U V W X Y Z bracketleft backslash bracketright asciicircum underscore grave a b c d e f g h i j k l m n o p q r s t u v w x y z braceleft bar braceright asciitilde Adieresis Aring Ccedilla Eacute Ntilde Odieresis Udieresis aacute agrave acircumflex adieresis atilde aring ccedilla eacute egrave ecircumflex edieresis iacute igrave icircumflex idieresis ntilde oacute ograve ocircumflex odieresis otilde uacute ugrave ucircumflex udieresis dagger degree cent sterling section bullet paragraph germandbls registered copyright trademark acute dieresis notequal AE Oslash infinity plusminus lessequal greaterequal yen mu partialdiff summation product pi integral ordfeminine ordmasculine Omega ae oslash questiondown exclamdown logicalnot radical florin approxequal Delta guillemotleft guillemotright ellipsis nonbreakingspace Agrave Atilde Otilde OE oe endash emdash quotedblleft quotedblright quoteleft quoteright divide lozenge ydieresis Ydieresis fraction currency guilsinglleft guilsinglright fi fl daggerdbl periodcentered quotesinglbase quotedblbase perthousand Acircumflex Ecircumflex Aacute Edieresis Egrave Iacute Icircumflex Idieresis Igrave Oacute Ocircumflex apple Ograve Uacute Ucircumflex Ugrave dotlessi circumflex tilde macron breve dotaccent ring cedilla hungarumlaut ogonek caron Lslash lslash Scaron scaron Zcaron zcaron brokenbar Eth eth Yacute yacute Thorn thorn minus multiply onesuperior twosuperior threesuperior onehalf onequarter threequarters franc Gbreve gbreve Idotaccent Scedilla scedilla Cacute cacute Ccaron ccaron dcroat".split(
    " "
  );

/**
 * Numery glifów o podanych NAZWACH, z tablicy `post` (format 2.0). Pusta mapa dla innych
 * formatów — wtedy czytnik i tak nie znajdzie glifu po nazwie w samym foncie.
 *
 * Potrzebne, bo PDF z /Differences szuka glifu po nazwie, a nazwa nie musi wskazywać tego
 * samego glifu co Unicode w `cmap`: w DejaVu „Delta" to glif U+2206 (przyrost), nie U+0394.
 */
export function glifyPoNazwach(bytes: Uint8Array, nazwy: string[]): Map<string, number> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const post = readTableDirectory(view).get("post");
  const wynik = new Map<string, number>();
  if (!post || view.getUint32(post.offset) !== 0x00020000) return wynik;
  const liczba = view.getUint16(post.offset + 32);
  const indeksy: number[] = [];
  for (let g = 0; g < liczba; g++) indeksy.push(view.getUint16(post.offset + 34 + g * 2));
  const wlasne: string[] = [];
  let p = post.offset + 34 + liczba * 2;
  const koniec = post.offset + post.length;
  while (p < koniec) {
    const dl = view.getUint8(p);
    let s = "";
    for (let k = 0; k < dl; k++) s += String.fromCharCode(view.getUint8(p + 1 + k));
    wlasne.push(s);
    p += 1 + dl;
  }
  const szukane = new Set(nazwy);
  indeksy.forEach((idx, gid) => {
    const nazwa = idx < 258 ? NAZWY_MAC[idx] : wlasne[idx - 258];
    if (nazwa && szukane.has(nazwa) && !wynik.has(nazwa)) wynik.set(nazwa, gid);
  });
  return wynik;
}
