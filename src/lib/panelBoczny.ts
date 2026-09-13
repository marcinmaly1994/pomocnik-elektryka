/**
 * Która zakładka panelu bocznego edytora ma być otwarta: „Elementy" czy „Pomieszczenia".
 *
 * PO CO: panel startował ZAWSZE na katalogu elementów — także na zupełnie pustej
 * kondygnacji, gdzie nie ma ich jeszcze gdzie postawić. Nowy użytkownik dostawał więc
 * jako pierwszą rzecz do przeczytania listę osprzętu (gniazdo trójfazowe, wypust AGD,
 * ładowarka EV), zamiast podpowiedzi, że plan zaczyna się od obrysowania pokoi. Sam
 * osprzęt da się postawić i bez pomieszczeń, ale wtedy nie trafia do żadnego z nich —
 * a to od pomieszczenia zależy grupowanie obwodów i strefy mokre.
 *
 * Czysta funkcja, żeby regułę dało się domknąć testem bez montowania edytora: to nie
 * jest „co narysować", tylko „na co patrzy użytkownik, zanim cokolwiek kliknie".
 */

export type ZakladkaPanelu = "elementy" | "pomieszczenia";

export interface FaktyKondygnacji {
  /** Czy na TEJ kondygnacji jest choć jedno narysowane pomieszczenie. */
  maPomieszczenia: boolean;
  /**
   * Czy stoi na niej choć jeden element instalacji.
   *
   * Liczy się, bo praca BEZ pomieszczeń jest dozwolona: kto postawił już osprzęt na
   * gołym rzucie, świadomie wybrał tę drogę i podpowiadanie mu „zacznij od pokoi"
   * byłoby cofaniem go do punktu, który minął.
   */
  maElementy: boolean;
}

/**
 * `wybor` to zakładka klikniętą RĘCZNIE (albo `null`, gdy użytkownik jeszcze nic nie
 * wybrał na tej kondygnacji). Wybór ręczny wygrywa zawsze — podpowiedź ma być
 * podpowiedzią, a nie przestawianiem panelu pod palcami.
 */
export function zakladkaPanelu(wybor: ZakladkaPanelu | null, fakty: FaktyKondygnacji): ZakladkaPanelu {
  if (wybor) return wybor;
  return fakty.maPomieszczenia || fakty.maElementy ? "elementy" : "pomieszczenia";
}
