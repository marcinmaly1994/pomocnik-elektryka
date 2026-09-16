/**
 * Liczby pokazywane użytkownikowi.
 *
 * Po polsku separatorem dziesiętnym jest PRZECINEK — i to dotyczy każdej liczby, którą
 * ktoś przepisze do oferty albo do protokołu. Aplikacja miała z tym rozjazd w obrębie
 * jednego ekranu: pozycja kosztorysu pokazywała „172,50 zł", a suma pod nią
 * „2021.50 zł"; kalkulator przyjmował „0,8", a wynik obok podawał „2.73 Ω".
 *
 * Funkcja mieszkała wcześniej w `lib/calc/result.ts` i stamtąd brały ją wyłącznie
 * kalkulatory. Tutaj, bo formatowanie liczby nie jest częścią silnika obliczeń —
 * potrzebują go tak samo kosztorys, rozdzielnica i protokoły. `lib/calc/result.ts`
 * nadal ją reeksportuje, żeby nie ruszać kilkudziesięciu istniejących wywołań.
 *
 * Reguły pilnuje test `liczby.test.ts`: `toFixed` bez zamiany na przecinek jest błędem
 * wszędzie poza trzema wypisanymi tam wyjątkami, gdzie kropka jest wymagana.
 */

/**
 * Liczba z przecinkiem dziesiętnym i zadaną precyzją.
 *
 * `null`/`undefined`/NaN dają kreskę, a NIE zero: „0,00 V" przy nieobliczonym spadku
 * napięcia byłoby stwierdzeniem, że spadku nie ma.
 */
export function formatLiczba(v: number | null | undefined, miejsca: number): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return v.toFixed(miejsca).replace(".", ",");
}

/**
 * Ta sama liczba, tylko po polsku — BEZ narzucania precyzji.
 *
 * Do miejsc, w których o zaokrągleniu zdecydował już silnik obliczeń i wyświetlamy
 * jego wynik bez zmian. `formatLiczba` nie nadaje się tam, bo wymaga podania liczby
 * miejsc: „2,731 Ω" (dokładna wartość Zs max z tablic) zamieniłoby na „2,73 Ω",
 * czyli po cichu zmieniłoby DANE przy okazji poprawiania interpunkcji.
 */
export function zPrzecinkiem(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return String(v).replace(".", ",");
}
