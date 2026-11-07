/**
 * Udostępnianie linkiem tylko do odczytu (F14 z audytu 5.11.2026).
 *
 * Udostępnia się MIGAWKĘ kompletu dokumentacji w PDF, a nie żywy projekt: inwestor
 * ma zobaczyć rysunki i kosztorys w stanie, który elektryk uznał za gotowy do
 * pokazania, a nie każdą pośrednią zmianę. Przy okazji nic nie wymaga otwierania
 * tabeli projektów dla niezalogowanych — jedyne, co jest publiczne, to pojedynczy
 * plik pod losową ścieżką (patrz krok 5 w `supabase.ts`).
 *
 * Link prowadzi na stronę tej aplikacji (`/udostepnione/<uid>/<id>`), nie wprost do
 * pliku: odbiorca widzi dokumentację w przeglądarce, z nazwą aplikacji i przyciskiem
 * pobrania, zamiast surowego adresu Supabase.
 */

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const SCIEZKA_PODGLADU = new RegExp(`^/udostepnione/(${UUID})/(${UUID})/?$`, "i");

export interface Udostepnienie {
  uid: string;
  id: string;
}

/** Ścieżka pliku w koszyku: `<uid>/<id>.pdf`. */
export function sciezkaPliku(u: Udostepnienie): string {
  return `${u.uid}/${u.id}.pdf`;
}

/** Link do strony podglądu — ten, który wysyła się inwestorowi. */
export function linkPodgladu(origin: string, u: Udostepnienie): string {
  return `${origin.replace(/\/$/, "")}/udostepnione/${u.uid}/${u.id}`;
}

/**
 * Udostępnienie wskazane adresem strony albo `null`, gdy to nie jest strona podglądu.
 * Oba identyfikatory MUSZĄ być UUID-ami — z adresu idą prosto do ścieżki pliku,
 * więc nic innego (np. `../`) nie ma prawa przejść.
 */
export function udostepnienieZAdresu(pathname: string): Udostepnienie | null {
  const m = SCIEZKA_PODGLADU.exec(pathname);
  return m ? { uid: m[1].toLowerCase(), id: m[2].toLowerCase() } : null;
}

/** Identyfikator udostępnienia z nazwy pliku w koszyku (`<id>.pdf`). */
export function idZNazwyPliku(nazwa: string): string | null {
  const m = new RegExp(`^(${UUID})\\.pdf$`, "i").exec(nazwa);
  return m ? m[1].toLowerCase() : null;
}
