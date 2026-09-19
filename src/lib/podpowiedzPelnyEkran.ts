/**
 * Pamięć o tym, czy użytkownik zna już tryb pełnoekranowy.
 *
 * Osobno od samego komponentu podpowiedzi, bo sięga po nią także `DesignTab`:
 * w pełny ekran wchodzi się TRZEMA drogami (ikona w pasku, skrót `F`, podpowiedź),
 * a każda z nich znaczy to samo — „już wiem, że to istnieje".
 *
 * Preferencja widoku, nie część projektu, więc `localStorage`, tym samym wzorcem
 * co zwinięcie panelu bocznego.
 */
const KLUCZ = "pomocnikelektryka_podpowiedz_pelny_ekran";

export function czyPodpowiedzOdrzucona(): boolean {
  try {
    return localStorage.getItem(KLUCZ) === "1";
  } catch {
    // Tryb prywatny potrafi rzucać przy samym dostępie do localStorage. Brak zapisu
    // znaczy „jeszcze nie widział" — pokazanie podpowiedzi raz za dużo jest tańsze
    // niż wywrócenie edytora.
    return false;
  }
}

export function zapamietajOdrzucenie(): void {
  try {
    localStorage.setItem(KLUCZ, "1");
  } catch {
    // patrz wyżej
  }
}
