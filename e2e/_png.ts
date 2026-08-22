import { deflateSync } from "node:zlib";

/**
 * Generuje poprawny, minimalny PNG o zadanych wymiarach — do testów, które potrzebują
 * obrazu tylko po to, żeby przeglądarka odczytała z niego `naturalWidth/Height`.
 *
 * Generowany, a NIE wklejony jako gotowy base64: ręcznie sklejony ciąg łatwo zepsuć tak,
 * że nagłówek deklaruje poprawne wymiary, a dane pikseli są uszkodzone. Obraz wtedy nie
 * ładuje się w przeglądarce (`onerror`), a test wygląda, jakby to aplikacja nie reagowała
 * na wgranie podkładu — dokładnie ta pułapka kosztowała jedno błędne rozpoznanie.
 */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typed = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([len, typed, crc]);
}

export function makePng(width: number, height: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 8 bitów na kanał
  ihdr[9] = 0; // skala szarości
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // filtr standardowy
  ihdr[12] = 0; // bez przeplotu

  // każdy wiersz poprzedzony bajtem filtra (0 = brak)
  const raw = Buffer.alloc((width + 1) * height, 0xc8);
  for (let y = 0; y < height; y++) raw[y * (width + 1)] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Koduje bufor RGB (3 bajty na piksel) jako PNG bez kompresji stratnej. */
function encodeRgbPng(width: number, height: number, rgb: Uint8Array): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 8 bitów na kanał
  ihdr[9] = 2; // truecolor RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // bajt filtra
    Buffer.from(rgb.buffer, rgb.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/**
 * Rzut testowy: białe tło, czarne obrysy prostokątnych pokoi.
 *
 * Generowany, a nie wklejony jako base64: detekcja ma na nim FAKTYCZNIE coś
 * znaleźć, więc geometria musi być kontrolowana i czytelna z kodu testu.
 */
export function makePlanPng(
  width: number,
  height: number,
  pokoje: [number, number, number, number][],
  grubosc = 5
): Buffer {
  const px = new Uint8Array(width * height * 3).fill(255);
  const tusz = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = (y * width + x) * 3;
    px[i] = px[i + 1] = px[i + 2] = 0;
  };
  for (const [x0, y0, x1, y1] of pokoje) {
    for (let g = 0; g < grubosc; g++) {
      for (let x = x0; x <= x1; x++) {
        tusz(x, y0 + g);
        tusz(x, y1 - g);
      }
      for (let y = y0; y <= y1; y++) {
        tusz(x0 + g, y);
        tusz(x1 - g, y);
      }
    }
  }
  return encodeRgbPng(width, height, px);
}
