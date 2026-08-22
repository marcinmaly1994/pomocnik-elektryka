/**
 * Wczytywanie źródła rzutu: obraz albo PDF → piksele RGBA + data URL do podkładu.
 *
 * PDF renderujemy przez `pdfjs-dist` ładowany DYNAMICZNIE — to ~1 MB, którego nie
 * ma sensu ciągnąć do bundla komuś, kto wgrywa zdjęcie z telefonu. Import siedzi
 * wewnątrz funkcji, więc trafia do osobnego chunka pobieranego dopiero przy
 * pierwszym PDF-ie.
 */

export interface WczytanyRzut {
  /** Piksele do analizy. */
  rgba: Uint8ClampedArray;
  szerokosc: number;
  wysokosc: number;
  /** Podkład do wyświetlenia w edytorze (PDF jest tu już zrasteryzowany). */
  dataUrl: string;
  nazwaPliku: string;
}

/** Górny limit rasteryzacji — chroni przed rzutem 300 dpi w formacie A0. */
const MAX_RASTER = 4000;

export function czyPdf(file: File): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

export function canvasDoWyniku(canvas: HTMLCanvasElement, nazwaPliku: string): WczytanyRzut {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Przeglądarka nie udostępniła kontekstu 2D");
  const dane = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return {
    rgba: dane.data,
    szerokosc: canvas.width,
    wysokosc: canvas.height,
    // PNG, nie JPEG: rzut to grafika kreskowa, a kompresja stratna rozmywa
    // cienkie ścianki i psuje próg Otsu przy późniejszej ponownej analizie.
    dataUrl: canvas.toDataURL("image/png"),
    nazwaPliku,
  };
}

async function wczytajObraz(file: File): Promise<WczytanyRzut> {
  const dataUrl = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(new Error("Nie udało się odczytać pliku"));
    r.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error("To nie wygląda na obraz, który potrafimy otworzyć"));
    i.src = dataUrl;
  });

  const skala = Math.min(1, MAX_RASTER / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * skala));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * skala));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Przeglądarka nie udostępniła kontekstu 2D");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  // Gdy nie skalowaliśmy, oddajemy ORYGINALNY dataUrl — bez ponownej kompresji.
  const wynik = canvasDoWyniku(canvas, file.name);
  return skala === 1 ? { ...wynik, dataUrl } : wynik;
}

async function wczytajPdf(file: File): Promise<WczytanyRzut> {
  const pdfjs = await import("pdfjs-dist");
  // Worker pdf.js jako moduł — Vite rozwiąże URL na etapie budowania.
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

  const bufor = await file.arrayBuffer();
  const dokument = await pdfjs.getDocument({ data: bufor }).promise;
  // Tylko pierwsza strona: rzut kondygnacji to jedna strona, a kolejne to zwykle
  // przekroje i opisy. Wielokondygnacyjność obsługujemy osobnym wgraniem na
  // każdą kondygnację, nie zgadywaniem, która strona jest którym piętrem.
  const strona = await dokument.getPage(1);

  const baza = strona.getViewport({ scale: 1 });
  const skala = Math.min(3, MAX_RASTER / Math.max(baza.width, baza.height));
  const viewport = strona.getViewport({ scale: skala });

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Przeglądarka nie udostępniła kontekstu 2D");
  // Białe tło: PDF bywa przezroczysty, a przezroczystość po rasteryzacji wychodzi
  // czarna i cały rzut zostaje uznany za jeden wielki tusz.
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await strona.render({ canvas, canvasContext: ctx, viewport }).promise;

  return canvasDoWyniku(canvas, file.name);
}

/** Wczytuje rzut z pliku. Rzuca wyjątek z komunikatem gotowym do pokazania. */
export async function wczytajRzut(file: File): Promise<WczytanyRzut> {
  return czyPdf(file) ? wczytajPdf(file) : wczytajObraz(file);
}

/** Prostokąt w pikselach ORYGINAŁU — te same jednostki co `WczytanyRzut.szerokosc/wysokosc`. */
export interface ObszarPrzyciecia {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Przycina wczytany rzut do podanego obszaru — użytkownik odrzuca część
 * dokumentu (np. tabelkę z legendą obok właściwego rzutu), zanim ruszy analiza.
 * Zwraca NOWY `WczytanyRzut`: mniejsze `rgba`/`szerokosc`/`wysokosc` i świeży
 * `dataUrl`, więc podkład w edytorze też pokazuje już tylko przycięty fragment.
 */
export function przytnijRzut(rzut: WczytanyRzut, obszar: ObszarPrzyciecia): WczytanyRzut {
  const x = Math.max(0, Math.round(obszar.x));
  const y = Math.max(0, Math.round(obszar.y));
  const w = Math.max(1, Math.min(Math.round(obszar.w), rzut.szerokosc - x));
  const h = Math.max(1, Math.min(Math.round(obszar.h), rzut.wysokosc - y));

  // Źródłowe piksele trzeba najpierw położyć na canvasie, żeby dało się z nich
  // wyciąć fragment przez `drawImage` — `rgba` to surowa tablica, nie obraz.
  const zrodlo = document.createElement("canvas");
  zrodlo.width = rzut.szerokosc;
  zrodlo.height = rzut.wysokosc;
  const zrodloCtx = zrodlo.getContext("2d", { willReadFrequently: true });
  if (!zrodloCtx) throw new Error("Przeglądarka nie udostępniła kontekstu 2D");
  zrodloCtx.putImageData(new ImageData(new Uint8ClampedArray(rzut.rgba), rzut.szerokosc, rzut.wysokosc), 0, 0);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Przeglądarka nie udostępniła kontekstu 2D");
  ctx.drawImage(zrodlo, x, y, w, h, 0, 0, w, h);

  return canvasDoWyniku(canvas, rzut.nazwaPliku);
}
