/**
 * Rozpoznawanie awarii POBRANIA KODU zakładki i decyzja, czy przeładować stronę.
 *
 * Od kiedy każda zakładka jest osobnym kawałkiem kodu (patrz `wczytaj` w `App.tsx`),
 * pojawił się scenariusz, którego wcześniej nie było: hosting serwuje pliki z hashem
 * w nazwie, więc każde WDROŻENIE unieważnia stare nazwy. Karta zostawiona otwarta
 * przez noc prosi rano o plik, którego już nie ma — dostaje 404, `import()` odrzuca
 * obietnicę, React nie ma czego wyrenderować i gasi całe drzewo. Użytkownik widzi
 * białą stronę, bez słowa wyjaśnienia i bez drogi powrotnej.
 *
 * Lekarstwem jest przeładowanie: pobiera świeży `index.html` z aktualnymi nazwami
 * plików i wszystko wraca do normy. Dlatego ten moduł odpowiada na dwa pytania —
 * czy to TA awaria (bo zwykłego błędu w kodzie przeładowanie nie naprawi, tylko
 * zapętli) i czy wolno przeładować JESZCZE RAZ.
 */

/**
 * Komunikaty przeglądarek dla nieudanego `import()`. Każdy silnik mówi to inaczej,
 * a żaden nie daje na to osobnego typu błędu — zostaje dopasowanie tekstu.
 * `ChunkLoadError` pochodzi z webpacka: tego tu nie ma, ale nazwa bywa przepisywana
 * przez narzędzia pośredniczące i nic nie kosztuje.
 */
const WZORCE: RegExp[] = [
  /failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /importing a module script failed/i,
  /unable to preload css/i,
  /chunkloaderror/i,
  /dynamically imported module/i,
];

export function toBladPobraniaKodu(blad: unknown): boolean {
  if (!blad) return false;
  const tekst =
    blad instanceof Error ? `${blad.name} ${blad.message}` : typeof blad === "string" ? blad : String(blad);
  return WZORCE.some((w) => w.test(tekst));
}

/** Klucz w `sessionStorage` — świadomie NIE `localStorage`: ochrona przed pętlą ma
 *  dotyczyć tej karty i tej sesji, a nie ciągnąć się przez tygodnie. */
const KLUCZ_PRZELADOWANIA = "pomocnikelektryka_awaryjne_przeladowanie";

/**
 * Odstęp, po którym wolno spróbować przeładowania po raz kolejny.
 *
 * Dwie rzeczy naraz. Krótsze niż minuta groziłoby PĘTLĄ: gdyby po przeładowaniu kod
 * dalej się nie pobierał (padła sieć, wdrożenie jest zepsute), strona wpadłaby w kółko
 * i użytkownik nie zdążyłby nawet przeczytać komunikatu. Dłuższe niż minuta zabrałoby
 * z kolei samoczynne wyleczenie przy DRUGIM wdrożeniu w trakcie jednej, długiej sesji.
 */
export const ODSTEP_PRZELADOWAN_MS = 60_000;

/**
 * Czy wolno teraz przeładować stronę awaryjnie. Wywołanie ZAPISUJE zgodę, więc
 * pyta się o nią dokładnie raz — drugie pytanie w tym samym oknie czasu dostaje `false`
 * i wtedy zamiast przeładowania pokazujemy komunikat z przyciskiem.
 */
export function wolnoPrzeladowac(teraz: number = Date.now()): boolean {
  let ostatnie: number;
  try {
    ostatnie = Number(sessionStorage.getItem(KLUCZ_PRZELADOWANIA)) || 0;
  } catch {
    // Tryb prywatny albo zablokowane dane witryny: bez pamięci nie ma jak wykluczyć
    // pętli, więc NIE przeładowujemy. Komunikat z przyciskiem działa tak czy owak.
    return false;
  }
  if (teraz - ostatnie < ODSTEP_PRZELADOWAN_MS) return false;
  try {
    sessionStorage.setItem(KLUCZ_PRZELADOWANIA, String(teraz));
  } catch {
    return false;
  }
  return true;
}
