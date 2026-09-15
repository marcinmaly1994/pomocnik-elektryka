/**
 * Rozmiar opisów pomieszczeń na rzucie — nazwy i adnotacji (wymiary, powierzchnia).
 *
 * Dotąd był stałą: `fontSize={11}` w jednostkach planu. Jednostka planu ma jednak
 * różną długość w metrach zależnie od skali, więc stała w jednostkach jest w istocie
 * stałą W METRACH — i przy rysowaniu od zera (0,05 m/jedn.) dawała litery wysokie na
 * 55 cm. Napis „Przedpokój" miał wtedy 2,75 m szerokości i NIE MIEŚCIŁ SIĘ w pokoju
 * o powierzchni 7 m² (2,60 × 2,70 m). Przy wgranym rzucie skalibrowanym drobniej ten
 * sam zapis dawał z kolei litery 22-centymetrowe, czyli nieczytelne.
 *
 * Osprzęt ten problem ma rozwiązany od dawna (`skalaZRysunku`, `autoSymbolScale`) —
 * opisy pomieszczeń jako jedyne zostały poza tym mechanizmem. Ten moduł je dołącza.
 */

/** Wysokość liter NAZWY pomieszczenia w metrach rzutu — mniej więcej tyle, ile ma
 *  opis pomieszczenia na rysunku budowlanym w skali 1:100. */
export const WYSOKOSC_NAZWY_M = 0.28;

/** Rozmiar sprzed tej zmiany. Używany, gdy skala NIE JEST znana — wtedy nie ma z czego
 *  liczyć i rysunek ma wyglądać dokładnie tak jak przedtem. */
export const FALLBACK_FONT_NAZWY = 11;
export const FALLBACK_FONT_ADNOTACJI = 8.5;

/** Poniżej tego rozmiaru napis przestaje być czytelny i docinanie nie ma sensu —
 *  lepiej pozwolić mu wystawać, niż pokazać nieczytelną plamę. */
export const MIN_FONT_OPISU = 4;

/**
 * Ile szerokości fontu zajmuje średnio jeden znak.
 *
 * Zmierzone na żywo w Konvie, tym samym krojem, którym rysowany jest rzut:
 * „Łazienka" 44 jedn. / 8 znaków / font 11, „Przedpokój" 55/10/11, „Salon" 28/5/11 —
 * za każdym razem 0,50. Przybliżenie, a nie pomiar: Konva podaje prawdziwą szerokość
 * dopiero PO zbudowaniu węzła, a rozmiar trzeba znać wcześniej, żeby go ustawić.
 */
export const SREDNIA_SZEROKOSC_ZNAKU = 0.5;

/**
 * Rozmiar DOWOLNEGO napisu rzutu, przeliczony ze skali.
 *
 * Bierze dotychczasową wartość jako punkt odniesienia i zachowuje jej stosunek do
 * nazwy pomieszczenia. Dzięki temu hierarchia rzutu — nazwa jako tytuł, wymiary
 * i powierzchnia jako adnotacje drugiego planu — zostaje dokładnie taka, jaką
 * ustalono wcześniej, a zmienia się WYŁĄCZNIE wspólna skala wszystkich napisów.
 * Gdyby przeliczyć ze skali same nazwy, wymiar ściany stałby się większy od nazwy
 * pokoju i hierarchia odwróciłaby się do góry nogami.
 */
export function fontRzutu(mpu: number | null, fallback: number): number {
  return fallback * skalaOpisowRzutu(mpu);
}

/**
 * Wspólny mnożnik dla WSZYSTKIEGO, co napisane na rzucie w jednostkach planu:
 * rozmiarów pisma, ale też odsunięć i szerokości ramek. Stosowany do dotychczasowych
 * wartości zachowuje ich wzajemne proporcje co do joty — zmienia się tylko wspólna
 * skala. Bez niego napis zmalałby, a jego odsunięcie od ściany zostało dawne i opis
 * odkleiłby się od tego, co opisuje.
 */
export function skalaOpisowRzutu(mpu: number | null): number {
  if (!(mpu && mpu > 0)) return 1;
  return WYSOKOSC_NAZWY_M / (FALLBACK_FONT_NAZWY * mpu);
}

/** Ile miejsca zajmie napis przy danym rozmiarze [jedn. planu]. */
export function szerokoscTekstu(tekst: string, font: number): number {
  return tekst.length * font * SREDNIA_SZEROKOSC_ZNAKU;
}

/** Margines od ścian: napis dotykający muru czyta się jak część rysunku, nie jak opis. */
const UDZIAL_SZEROKOSCI_POKOJU = 0.9;

/**
 * Rozmiar napisu dla KONKRETNEGO pomieszczenia: najpierw ze skali, potem docięty do
 * szerokości pokoju.
 *
 * Docinanie działa wyłącznie w dół. Powiększanie napisu w dużym salonie rozjechałoby
 * rzut — każdy pokój miałby opis innej wielkości i nic by już nie wskazywało, że to
 * jeden rysunek.
 *
 * @param mpu metrów na jednostkę planu; `null` = skala nieznana
 * @param tekst treść napisu — jego długość decyduje, czy się mieści
 * @param szerokoscPokoju szerokość obrysu pomieszczenia [jedn. planu]
 */
export function fontOpisuPokoju(
  mpu: number | null,
  tekst: string,
  szerokoscPokoju: number,
  opcje: { fallback?: number } = {}
): number {
  const { fallback = FALLBACK_FONT_NAZWY } = opcje;
  const zeSkali = fontRzutu(mpu, fallback);

  const dostepna = szerokoscPokoju * UDZIAL_SZEROKOSCI_POKOJU;
  const potrzebna = szerokoscTekstu(tekst, zeSkali);
  if (potrzebna <= dostepna || potrzebna === 0) return zeSkali;

  return Math.max(MIN_FONT_OPISU, zeSkali * (dostepna / potrzebna));
}
