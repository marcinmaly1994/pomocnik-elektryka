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
  | { rodzaj: "blad"; kod: string }
  /**
   * Potwierdzenie załatwione już po stronie Supabase — aplikacja ma tylko zdjąć
   * fragment z adresu (niesie tokeny sesji!) i powiedzieć, co się stało.
   * `email_polowa` — przy bezpiecznej zmianie adresu pierwszy z dwóch linków.
   */
  | { rodzaj: "potwierdzono"; co: "rejestracja" | "email" | "email_polowa" };

export function odczytajFragmentAuth(hash: string): FragmentAuth | null {
  const p = new URLSearchParams(hash.replace(/^#/, ""));

  // Błąd rozpatrujemy PRZED powodzeniem: przy zużytym albo wygasłym linku
  // Supabase nie przysyła żadnego tokenu, tylko sam opis problemu.
  const blad = p.get("error");
  if (blad) return { rodzaj: "blad", kod: p.get("error_code") || blad };

  const typ = p.get("type");
  if (typ === "signup") return { rodzaj: "potwierdzono", co: "rejestracja" };
  if (typ === "email_change") return { rodzaj: "potwierdzono", co: "email" };
  // Pierwszy link bezpiecznej zmiany adresu wraca bez tokenów, z samym opisem.
  if (/other email/i.test(p.get("message") ?? "")) return { rodzaj: "potwierdzono", co: "email_polowa" };

  if (typ !== "recovery") return null;

  const token = p.get("access_token");
  // Bez tokenu nie ma czym zmienić hasła. Okno bez możliwości zapisu to ślepy
  // zaułek — lepiej zachować się tak, jakby fragmentu nie było.
  return token ? { rodzaj: "reset", token } : null;
}
