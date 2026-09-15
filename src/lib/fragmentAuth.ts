/**
 * Odczyt tego, po co Supabase odesłał użytkownika z maila.
 *
 * Wynik kliknięcia w link z maila wraca we FRAGMENCIE adresu (za `#`), a nie
 * w zapytaniu — fragment nigdy nie opuszcza przeglądarki, więc token nie trafia
 * do logów serwera ani do nagłówka `Referer`. Dla nas znaczy to tyle, że jedynym
 * źródłem informacji „czemu ten ktoś tu jest" jest `window.location.hash`.
 *
 * Czysta funkcja, celowo oderwana od `window` — dzięki temu da się ją sprawdzić
 * wprost, bez przeglądarki i bez udawania nawigacji.
 */

export type FragmentAuth =
  | { rodzaj: "reset"; token: string }
  | { rodzaj: "blad"; kod: string };

export function odczytajFragmentAuth(hash: string): FragmentAuth | null {
  const p = new URLSearchParams(hash.replace(/^#/, ""));

  // Błąd rozpatrujemy PRZED powodzeniem: przy zużytym albo wygasłym linku
  // Supabase nie przysyła żadnego tokenu, tylko sam opis problemu.
  const blad = p.get("error");
  if (blad) return { rodzaj: "blad", kod: p.get("error_code") || blad };

  // Wyłącznie `recovery`. `signup` też przychodzi z tokenem, ale konto jest
  // wtedy potwierdzone już po stronie Supabase i nie ma czego dokańczać —
  // otwarcie na to okna tylko zdezorientowałoby użytkownika.
  if (p.get("type") !== "recovery") return null;

  const token = p.get("access_token");
  // Bez tokenu nie ma czym zmienić hasła. Okno bez możliwości zapisu to ślepy
  // zaułek — lepiej zachować się tak, jakby fragmentu nie było.
  return token ? { rodzaj: "reset", token } : null;
}
