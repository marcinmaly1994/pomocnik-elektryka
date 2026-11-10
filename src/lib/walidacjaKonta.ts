/**
 * Reguły formularzy konta — w JEDNYM miejscu.
 *
 * Rejestracja, reset hasła z maila i zmiana hasła w profilu miały każde swoją kopię
 * reguły „co najmniej 6 znaków”. Rozjazd między nimi znaczyłby, że hasło przyjęte
 * w jednym oknie jest odrzucane w drugim. Ta sama wartość musi też stać w Supabase
 * (Authentication → Providers → Email → Minimum password length) — serwer jest
 * prawdziwą granicą, a ten plik tylko mówi o niej wcześniej i po polsku.
 *
 * Logowanie NIE sprawdza długości: konta założone przed podniesieniem minimum mogą
 * mieć krótsze hasła i muszą dalej móc się zalogować.
 */

export const MIN_DLUGOSC_HASLA = 8;

export const PODPOWIEDZ_HASLA = `Co najmniej ${MIN_DLUGOSC_HASLA} znaków.`;

/** Celowo luźne: „coś@coś.coś” bez spacji. Dokładną walidację robi serwer, a zbyt
 *  sprytny wzorzec odrzucałby poprawne adresy (np. z `+` albo długą domeną). */
const WZOR_EMAILA = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Błąd adresu e-mail albo `null`. Spacje na brzegach nie są błędem — przycinamy je. */
export function bladEmaila(email: string): string | null {
  const e = email.trim();
  if (!e) return "Podaj adres e-mail.";
  if (!WZOR_EMAILA.test(e)) return "To nie wygląda na adres e-mail. Sprawdź, czy nie brakuje „@” albo domeny.";
  return null;
}

/** Błąd nowego hasła (rejestracja, reset, zmiana w profilu) albo `null`. */
export function bladNowegoHasla(haslo: string, powtorzone: string): string | null {
  if (haslo.length < MIN_DLUGOSC_HASLA) return `Hasło musi mieć co najmniej ${MIN_DLUGOSC_HASLA} znaków.`;
  if (haslo !== powtorzone) return "Hasła nie są takie same.";
  return null;
}
