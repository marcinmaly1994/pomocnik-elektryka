/**
 * Dołożenie elementu do zaznaczenia GRUPOWEGO (Shift z kliknięciem albo przełącznik
 * „Zaznacz kilka").
 *
 * Grupa zaczynała się dotąd od pustej listy, więc element zaznaczony wcześniej
 * pojedynczo przepadał: zaznaczenie gniazda, potem Shift z kliknięciem w drugie —
 * i w grupie było tylko drugie. Teraz pierwsze dołączenie do grupy zabiera ze sobą
 * to, co było zaznaczone pojedynczo, tak jak w każdym edytorze.
 *
 * @param grupa bieżące zaznaczenie grupowe
 * @param pojedynczy element zaznaczony pojedynczo (albo `null`)
 * @param id element, w który właśnie kliknięto
 */
export function przelaczWGrupie(grupa: string[], pojedynczy: string | null, id: string): string[] {
  if (grupa.length === 0 && pojedynczy) {
    // Kliknięcie w TEN SAM, już zaznaczony element zaczyna grupę od niego, zamiast
    // go zdejmować — włączenie „Zaznacz kilka" nie ma nic odznaczać.
    if (pojedynczy === id) return [id];
    return [pojedynczy, id];
  }
  return grupa.includes(id) ? grupa.filter((x) => x !== id) : [...grupa, id];
}
