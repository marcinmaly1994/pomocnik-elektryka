/**
 * Wybór formatu, w jakim podkład rzutu trafia do pamięci przeglądarki.
 *
 * Podkład jest zapisywany w `localStorage` jako `data URL` razem z całym projektem,
 * a budżet `localStorage` to około 5 MB na całą aplikację. Zmierzone rozmiary tego
 * samego rzutu 4000 × 2800:
 *
 *   rysunek kreskowy z PDF-a — PNG 315 kB
 *   zdjęcie / skan          — PNG 4,8 MB   (czyli cały budżet na jednej kondygnacji)
 *
 * PNG był tu wybrany świadomie: rzut to grafika kreskowa, a kompresja stratna rozmywa
 * cienkie ścianki. Dla FOTOGRAFII to jednak najgorszy możliwy wybór — bezstratny format
 * na materiale, który z natury jest szumem. A ten obraz służy WYŁĄCZNIE za podkład
 * rysunkowy pod planem (rysowany z przezroczystością 0,85); analiza pikseli idzie
 * osobnym torem, po surowej tablicy `rgba`, która nigdy nie jest kompresowana.
 *
 * Wybieramy więc mniejszy z dwóch zapisów, a nie format „na zawsze". Rysunek kreskowy
 * i tak wygrywa PNG-iem, bo jednolite tło kompresuje się bezstratnie lepiej niż JPEG.
 */

/**
 * Jakość JPEG. 0,82 to próg, poniżej którego na zdjęciu rzutu widać artefakty przy
 * cienkich liniach; powyżej plik rośnie bez widocznego zysku.
 */
const JAKOSC_JPEG = 0.82;

/**
 * Ile MNIEJSZY musi być JPEG, żeby go wybrać.
 *
 * Nie „choćby o bajt": przy zbliżonych rozmiarach nie ma powodu tracić bezstratności.
 * Realny zysk na zdjęciu to kilkukrotność, więc próg 0,7 przepuszcza dokładnie te
 * przypadki, dla których ta zamiana w ogóle powstała.
 */
const PROG_ZYSKU = 0.7;

/** Czy w obrazie jest choć jeden piksel nie w pełni krycia. */
export function maPrzezroczystosc(rgba: Uint8ClampedArray): boolean {
  for (let i = 3; i < rgba.length; i += 4) {
    if (rgba[i] !== 255) return true;
  }
  return false;
}

export interface WyborFormatu {
  dataUrl: string;
  format: "png" | "jpeg";
}

/**
 * Mniejszy z dwóch zapisów tego samego obrazu.
 *
 * `png` i `jpeg` przyjmowane są jako gotowe `data URL`, żeby ta decyzja dała się
 * sprawdzić testem bez canvasu — samo kodowanie zostaje po stronie przeglądarki.
 *
 * Przezroczystość przesądza sprawę bez patrzenia na rozmiary: JPEG jej nie zna
 * i wypełniłby przezroczyste miejsca czernią, czyli zamiast lżejszego podkładu
 * dałby czarną płachtę pod rysunkiem.
 */
export function mniejszyZapis(png: string, jpeg: string, przezroczystosc: boolean): WyborFormatu {
  if (przezroczystosc) return { dataUrl: png, format: "png" };
  return jpeg.length < png.length * PROG_ZYSKU ? { dataUrl: jpeg, format: "jpeg" } : { dataUrl: png, format: "png" };
}

/** Kodowanie podkładu z canvasu — połączenie obu powyższych z samą przeglądarką. */
export function zakodujPodklad(canvas: HTMLCanvasElement, rgba: Uint8ClampedArray): WyborFormatu {
  return mniejszyZapis(
    canvas.toDataURL("image/png"),
    canvas.toDataURL("image/jpeg", JAKOSC_JPEG),
    maPrzezroczystosc(rgba)
  );
}
