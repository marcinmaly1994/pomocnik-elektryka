import type { PdfImage } from "./engine";

/**
 * Zamiana tego, co widać na ekranie, na obraz osadzalny w PDF.
 *
 * Rysunki (schemat jednokreskowy, rzut kondygnacji) powstają jako SVG i jako płótno
 * Konvy — odtwarzanie ich geometrii po raz drugi w prymitywach PDF-a byłoby drugą
 * implementacją tego samego rysunku, rozjeżdżającą się z pierwszą przy każdej zmianie.
 * Rasteryzujemy więc to, co użytkownik faktycznie widzi: eksport z definicji zgadza się
 * z ekranem.
 *
 * Cena: rysunek w PDF-ie nie jest wektorowy, więc nie skaluje się bez końca. Dlatego
 * renderujemy w gęstości drukarskiej (`DPI_DRUKU`), a nie ekranowej.
 */

/** Gęstość rasteryzacji rysunków. 200 dpi to próg, powyżej którego wydruk A4 przestaje
 *  wyglądać na „powiększony zrzut ekranu", a plik nie robi się jeszcze nieporęczny. */
export const DPI_DRUKU = 200;

/** Ile pikseli przypada na punkt PDF przy powyższej gęstości (PDF liczy w 1/72 cala). */
export const PIKSELI_NA_PUNKT = DPI_DRUKU / 72;

/**
 * Kompresuje bajty algorytmem zlib (deflate) — dokładnie tym, którego oczekuje filtr
 * `/FlateDecode`. `CompressionStream` jest wbudowany w przeglądarki; gdy go nie ma,
 * zwracamy `null`, a wywołujący schodzi na JPEG.
 */
async function zlib(dane: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === "undefined") return null;
  const strumien = new Blob([dane as BlobPart]).stream().pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(strumien).arrayBuffer());
}

/** Pobiera surowe RGB z płótna, odrzucając kanał alfa (PDF /DeviceRGB go nie zna).
 *  Przezroczystość składamy na BIEL — inaczej wychodzi czarna, patrz `detect/source.ts`. */
function rgbZPlotna(canvas: HTMLCanvasElement): Uint8Array {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Przeglądarka nie udostępniła kontekstu 2D");
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const rgb = new Uint8Array(canvas.width * canvas.height * 3);
  for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
    const a = data[i + 3] / 255;
    rgb[j] = Math.round(data[i] * a + 255 * (1 - a));
    rgb[j + 1] = Math.round(data[i + 1] * a + 255 * (1 - a));
    rgb[j + 2] = Math.round(data[i + 2] * a + 255 * (1 - a));
  }
  return rgb;
}

/** Wyciąga bajty z data URL (`data:image/jpeg;base64,...`). */
function bajtyZDataUrl(dataUrl: string): Uint8Array {
  const bin = atob(dataUrl.slice(dataUrl.indexOf(",") + 1));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Płótno -> obraz do PDF-a.
 *
 * Domyślnie BEZSTRATNIE (zlib + `/FlateDecode`): rysunek techniczny to cienkie kreski
 * na bieli, a właśnie na nich JPEG zostawia najbardziej widoczne artefakty. Duże
 * jednolite tło sprawia przy tym, że deflate ściska taki obraz bardzo dobrze.
 * JPEG zostaje jako zapas dla przeglądarek bez `CompressionStream`.
 */
export async function plotnoDoPdf(canvas: HTMLCanvasElement): Promise<PdfImage> {
  const spakowane = await zlib(rgbZPlotna(canvas));
  if (spakowane) {
    return { bytes: spakowane, width: canvas.width, height: canvas.height, filter: "FlateDecode" };
  }
  return {
    bytes: bajtyZDataUrl(canvas.toDataURL("image/jpeg", 0.92)),
    width: canvas.width,
    height: canvas.height,
    filter: "DCTDecode",
  };
}

/** Tworzy płótno o zadanym rozmiarze, wypełnione bielą (tło strony rysunku). */
export function bialePlotno(w: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w));
  canvas.height = Math.max(1, Math.round(h));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Przeglądarka nie udostępniła kontekstu 2D");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return canvas;
}

/**
 * Rasteryzuje element <svg> ze strony.
 *
 * Serializowany SVG musi nieść WŁASNE wymiary — przeglądarka rysuje `<img>` z SVG wg
 * atrybutów `width`/`height`, a nie wg tego, jak element wyglądał w układzie strony.
 * Klon dostaje je z `viewBox`, przemnożone przez żądaną skalę.
 */
export function svgDoPlotna(svg: SVGSVGElement, szerokoscPx: number): Promise<HTMLCanvasElement> {
  const vb = svg.viewBox.baseVal;
  const wBazowa = vb && vb.width ? vb.width : svg.clientWidth || 800;
  const hBazowa = vb && vb.height ? vb.height : svg.clientHeight || 600;
  const skala = szerokoscPx / wBazowa;
  const w = Math.round(wBazowa * skala);
  const h = Math.round(hBazowa * skala);

  const klon = svg.cloneNode(true) as SVGSVGElement;
  klon.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  klon.setAttribute("width", String(w));
  klon.setAttribute("height", String(h));

  const zrodlo = `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(klon)}`;
  // Blob, nie `data:` — przy większych rysunkach data URL potrafi przekroczyć limit
  // długości adresu i obrazek po cichu się nie ładuje.
  const url = URL.createObjectURL(new Blob([zrodlo], { type: "image/svg+xml;charset=utf-8" }));

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = bialePlotno(w, h);
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
      resolve(canvas);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Nie udało się zrasteryzować rysunku."));
    };
    img.src = url;
  });
}
