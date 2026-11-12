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

/**
 * Forma rzeczownika po liczebniku: „1 element", „3 elementy", „12 elementów",
 * „22 elementy". Zwraca SAMO słowo.
 *
 * Jedna funkcja zamiast `n === 1 ? … : n < 5 ? … : …` rozsianego po kodzie — tamten
 * skrót dawał „22 elementów" i „22 uwag" (R8 z audytu Instalacji 11.11.2026), bo
 * forma „kilka" wraca dla 22–24, 32–34…, a nie wraca dla 12–14.
 */
export function slowoLiczby(n: number, jeden: string, kilka: string, wiele: string): string {
  if (n === 1) return jeden;
  const j = Math.abs(n) % 10;
  const d = Math.abs(n) % 100;
  return j >= 2 && j <= 4 && (d < 12 || d > 14) ? kilka : wiele;
}

/** Liczba razem z odmienionym słowem: „22 elementy". Patrz `slowoLiczby`. */
export function zLiczba(n: number, jeden: string, kilka: string, wiele: string): string {
  return `${n} ${slowoLiczby(n, jeden, kilka, wiele)}`;
}
