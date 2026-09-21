/**
 * Czy użytkownik wie, jak ruszać rzutem — i co mu o tym powiedzieć.
 *
 * Nawigacja po płótnie jest jedyną rzeczą w tej aplikacji wziętą wprost z programów
 * CAD: `Ctrl` + kółko przybliża (samo kółko przewija STRONĘ, bo inaczej nie dałoby się
 * przewinąć strony nad rzutem), a wciśnięta rolka przesuwa widok. Dla kogoś, kto nie
 * siedział w AutoCAD-zie, jest to niewidoczne: kręci kółkiem nad planem, ucieka mu
 * cała strona i nic tego nie tłumaczy — ani pasek, ani spis skrótów w Pomocy.
 *
 * Stąd dwie podpowiedzi o różnym charakterze i osobnej pamięci:
 *   • POWITANIE — raz, zaraz po wgraniu rzutu, przy przyciskach powiększenia;
 *   • KÓŁKO — w chwili pomyłki, gdy ktoś kręci kółkiem bez `Ctrl`.
 *
 * Pamięć osobna, bo „zamknąłem okienko" to nie to samo co „umiem": powitanie bardzo
 * często odklikuje się odruchowo. Dopiero pierwsze FAKTYCZNE przybliżenie rzutu gasi
 * obie naraz — wtedy wiadomo, że wiedza doszła.
 *
 * Preferencja widoku, nie część projektu, więc `localStorage` — tym samym wzorcem, co
 * `podpowiedzPelnyEkran.ts` i zwinięcie panelu bocznego.
 */

export const KLUCZ_POWITANIE = "pomocnikelektryka_podpowiedz_nawigacja";
export const KLUCZ_UMIE = "pomocnikelektryka_umie_przyblizac";

export interface StanNawigacji {
  /** Powitanie zamknięte przyciskiem „Rozumiem" (albo Esc). */
  powitanieOdrzucone: boolean;
  /** Rzut został choć raz przybliżony — kółkiem z `Ctrl` albo przyciskami w pasku. */
  umieNawigowac: boolean;
}

function odczytaj(klucz: string): boolean {
  try {
    return localStorage.getItem(klucz) === "1";
  } catch {
    // Tryb prywatny potrafi rzucać przy samym dostępie do `localStorage`. Brak zapisu
    // znaczy „jeszcze nie widział" — podpowiedź raz za dużo jest tańsza niż wywrócony
    // edytor.
    return false;
  }
}

function zapisz(klucz: string): void {
  try {
    localStorage.setItem(klucz, "1");
  } catch {
    // patrz wyżej
  }
}

export function odczytajStanNawigacji(): StanNawigacji {
  return {
    powitanieOdrzucone: odczytaj(KLUCZ_POWITANIE),
    umieNawigowac: odczytaj(KLUCZ_UMIE),
  };
}

export function zapamietajOdrzuceniePowitania(): void {
  zapisz(KLUCZ_POWITANIE);
}

/** Wołane po PIERWSZYM przybliżeniu rzutu — gasi obie podpowiedzi na dobre. */
export function zapamietajUmiejetnosc(): void {
  zapisz(KLUCZ_UMIE);
}

/** Powitanie należy się temu, kto rzutu jeszcze nie ruszał i nie zamknął podpowiedzi. */
export function czyPokazacPowitanie(stan: StanNawigacji): boolean {
  return !stan.powitanieOdrzucone && !stan.umieNawigowac;
}

/**
 * Podpowiedź po kółku bez `Ctrl`.
 *
 * Nie patrzy na `powitanieOdrzucone` — właśnie dlatego, że zamknięcie powitania nie
 * dowodzi niczego poza tym, że okienko przeszkadzało. Ustępuje tylko OTWARTEMU
 * powitaniu, żeby dwie chmurki nie mówiły naraz tego samego.
 */
export function czyPokazacPodpowiedzKolka(stan: StanNawigacji, powitanieOtwarte: boolean): boolean {
  return !stan.umieNawigowac && !powitanieOtwarte;
}
