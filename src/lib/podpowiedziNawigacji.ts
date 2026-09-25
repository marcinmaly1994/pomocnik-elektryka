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
 * zwinięcie panelu bocznego.
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

/**
 * Najkrótszy odstęp między zgłoszeniami „kółko bez `Ctrl`" [ms].
 *
 * Kręcenie kółkiem to nie jedno zdarzenie, tylko kilkadziesiąt — przeglądarka wysyła
 * je gęsto przez cały gest. Każde szło dotąd prosto w stan Reacta, czyli w pełne
 * przerysowanie zakładki rysunku razem z płótnem.
 *
 * Zmierzone: 100 tików kosztowało 61 ms więcej niż te same 100 tików u kogoś, kto
 * podpowiedź ma już wyłączoną. To ~0,6 ms na tik — realne, ale niewielkie, i warto
 * o tym wiedzieć, zanim ktoś uzna ten próg za lekarstwo na zacinanie. Jest lekarstwem
 * na PRACĘ BEZ CELU: dymek i tak wygląda identycznie.
 *
 * 400 ms, bo komunikat żyje 2600 ms (`CZAS_POKAZU` w `PodpowiedzKolka`). Odstęp
 * kilkakrotnie od niego krótszy zachowuje sens licznika — dalsze kręcenie nadal
 * przedłuża komunikat, tylko sześć razy na gest zamiast pięćdziesięciu.
 */
export const ODSTEP_ZGLOSZEN_KOLKA = 400;

/**
 * Czy to kręcenie kółkiem warto jeszcze odnotować.
 *
 * Osobno i bez zegara w środku, żeby dało się sprawdzić testem: `teraz` przychodzi
 * z zewnątrz, tak samo jak w pozostałych funkcjach tego pliku stan przychodzi
 * z `odczytajStanNawigacji`.
 */
export function czyOdnotowacKolko(ostatnieZgloszenie: number, teraz: number): boolean {
  return teraz - ostatnieZgloszenie >= ODSTEP_ZGLOSZEN_KOLKA;
}
