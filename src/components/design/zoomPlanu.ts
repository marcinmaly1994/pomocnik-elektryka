import { PROG_WASKIEGO_EKRANU } from "@/lib/design";

/** Granice powiększenia widoku planu — wspólne dla Ctrl+scroll i przycisków paska. */
export const MIN_ZOOM = 0.4;

export const MAX_ZOOM = 4;

/** Dolna granica powiększenia na wąskim ekranie — patrz `minZoom`. */
export const MIN_ZOOM_WASKI = 0.2;

/**
 * Dolna granica powiększenia, zależna od szerokości okna.
 *
 * Na monitorze zostaje 0,4: niżej symbole osprzętu przestają być rozróżnialne, a
 * miejsca i tak nie brakuje. Na telefonie ta sama granica znaczyła co innego —
 * kolumna planu ma tam około 250 px, a plan przy 0,4 zajmuje 400 px, więc CAŁEGO
 * mieszkania nie dawało się zobaczyć ani razu, nawet po dopasowaniu widoku.
 * Alternatywą dla drobnego rzutu nie był większy rzut, tylko oglądanie go przez
 * dziurkę — stąd 0,2 poniżej progu.
 */
export function minZoom(): number {
  const okno = typeof window === "undefined" ? 1280 : window.innerWidth;
  return okno < PROG_WASKIEGO_EKRANU ? MIN_ZOOM_WASKI : MIN_ZOOM;
}
