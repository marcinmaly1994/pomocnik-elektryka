import { pointInPolygon } from "./geometry";

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

/**
 * Zapas ramki nad wyliczoną szerokością napisu.
 *
 * Ramka RÓWNA szerokości napisu nie wystarcza: Konva uznaje wtedy, że tekst się nie
 * mieści, i łamie go na dwie linie. Objawiało się to tym, że KAŻDA nazwa pomieszczenia
 * rozpadała się na rzucie — „Salon" wychodził jako „Salo" i „n" pod spodem.
 *
 * Zmierzone na żywo: przy ramce 14,01 jedn. napis „Salon" (font 5,6) nadal się łamał,
 * przy 15,4 już nie. Przybliżenie `SREDNIA_SZEROKOSC_ZNAKU` jest więc odrobinę za małe
 * i sam pomiar równy przybliżeniu zawsze trafiał w przypadek graniczny.
 */
const ZAPAS_RAMKI = 1.15;

/**
 * Szerokość ramki tekstu [jedn. planu]. Ramka nie ogranicza napisu — służy wyłącznie
 * do wyśrodkowania go na pomieszczeniu (`align="center"`), więc lepiej, żeby była
 * odrobinę za szeroka niż o włos za wąska.
 */
export function szerokoscRamki(tekst: string, font: number): number {
  return Math.max(szerokoscTekstu(tekst, font) * ZAPAS_RAMKI, 1);
}

/**
 * Ile napis NAPRAWDĘ zajmuje w poziomie — do szukania mu miejsca, nie do ramki.
 *
 * Miejsce liczono dotąd z szerokości RAMKI, czyli z zapasem 15% (`ZAPAS_RAMKI`),
 * który jest tylko po to, żeby Konva nie łamała tekstu. Nazwa docięta do pokoju ma
 * 90% jego szerokości (`UDZIAL_SZEROKOSCI_POKOJU`), a jej ramka — 103%: żadne
 * położenie nie mieściło się w obrysie i `miejsceNaOpis` wracało do środka pokoju,
 * czyli na lampę. W przykładowym domu tak zostawała „Klatka schodowa" (2 m szerokości,
 * siedem symboli). 1,1 to górna granica zmierzonego stosunku prawdziwej szerokości do
 * przybliżenia (patrz komentarz przy `ZAPAS_RAMKI`: 14,0 wyliczone, do 15,4 zmierzone).
 */
export function zasiegNapisu(tekst: string, font: number): number {
  return szerokoscTekstu(tekst, font) * 1.1;
}

/** Prostokąt osiowy w jednostkach planu — zajęte miejsce, które opis ma omijać. */
export interface ZajeteMiejsce {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * Gdzie postawić opis, żeby nie leżał na symbolu ani na innym opisie.
 *
 * Nazwa pomieszczenia stoi w jego środku — a środek pokoju to dokładnie miejsce, w które
 * stawia się lampę sufitową. W przykładowym mieszkaniu „Kuchnię" i „Sypialnię" przecinał
 * krzyżyk oprawy; w projekcie użytkownika wyglądało to tak samo, bo tak się po prostu
 * rozmieszcza oświetlenie.
 *
 * Sprawdzamy kotwicę, a potem kolejne miejsca — podane wprost (`kandydaci`) albo
 * przesunięcia od kotwicy co `krok` (najpierw w pionie, bo nazwa pod lampą albo nad nią
 * czyta się naturalnie, potem w bok). Bierzemy PIERWSZE, na którym blok opisu mieści się
 * w obrysie i nie nachodzi na nic zajętego. Gdy takiego nie ma — pierwsze wolne za
 * obrysem (tylko z `wolnoZaObrys`), potem miejsce w obrysie zasłonięte najmniej,
 * a na końcu kotwica, czyli położenie sprzed tej zmiany.
 *
 * `blok` to zasięg opisu względem kotwicy (odległości od niej, dodatnie).
 */
export function miejsceNaOpis(opcje: {
  kotwica: { x: number; y: number };
  blok: { lewo: number; prawo: number; gora: number; dol: number };
  przeszkody: ZajeteMiejsce[];
  /** Obrys, w którym opis ma zostać; bez niego dowolne miejsce. */
  obrys?: { x: number; y: number }[];
  /** Ściany jako odcinki z grubością — napis nie może na nich leżeć. Odcinki, a nie
   *  prostokąty: prostokąt otaczający UKOŚNĄ ścianę zablokowałby pół pokoju. */
  odcinki?: { a: { x: number; y: number }; b: { x: number; y: number }; grubosc: number }[];
  /** Czy wolne miejsce ZA obrysem wygrywa z zasłoniętym w obrysie — patrz koniec funkcji. */
  wolnoZaObrys?: boolean;
  /** Miejsca do sprawdzenia po kotwicy; bez nich — siatka przesunięć co `krok`. */
  kandydaci?: { x: number; y: number }[];
  krok?: number;
  krokow?: number;
  /**
   * Odstęp od przeszkód [jedn. planu] — tylko przy sprawdzaniu zasłonięcia, nie przy
   * mieszczeniu się w obrysie. Prostokąty symboli są przybliżeniem rysunku, a napis
   * stawiany „na styk" potrafił zachodzić na symbol o ułamek jednostki („Hol" na
   * lampie i gniazdku w przykładowym domu).
   */
  odstep?: number;
}): { x: number; y: number } {
  const { kotwica, blok, przeszkody, obrys, krok = 0, krokow = 4, odcinki = [], odstep = 0 } = opcje;

  const zaslonieta = (x: number, y: number) => {
    const x1 = x - blok.lewo - odstep;
    const x2 = x + blok.prawo + odstep;
    const y1 = y - blok.gora - odstep;
    const y2 = y + blok.dol + odstep;
    let pole = 0;
    for (const p of przeszkody) {
      const w = Math.min(x2, p.x2) - Math.max(x1, p.x1);
      const h = Math.min(y2, p.y2) - Math.max(y1, p.y1);
      if (w > 0 && h > 0) pole += w * h;
    }
    // Ściana przecinająca napis liczy się jak PEŁNE zasłonięcie: napis na murze jest
    // nieczytelny tak samo jak pod symbolem, a „najmniej zasłonięte" miejsce nie może
    // wygrać tylko dlatego, że mur jest cieńszy od symbolu.
    for (const o of odcinki) {
      const g = o.grubosc / 2;
      if (odcinekPrzecinaProstokat(o.a, o.b, x1 - g, y1 - g, x2 + g, y2 + g)) pole += (x2 - x1) * (y2 - y1);
    }
    return pole;
  };
  const wObrysie = (x: number, y: number) =>
    !obrys ||
    [
      { x: x - blok.lewo, y: y - blok.gora },
      { x: x + blok.prawo, y: y - blok.gora },
      { x: x - blok.lewo, y: y + blok.dol },
      { x: x + blok.prawo, y: y + blok.dol },
    ].every((p) => pointInPolygon(p, obrys));

  const wszystkie = [kotwica, ...(opcje.kandydaci ?? przesunieciaWokol(kotwica, krok, krokow))];
  let najlepsze: { x: number; y: number } | null = null;
  let najmniej = Infinity;
  for (const k of wszystkie) {
    if (!wObrysie(k.x, k.y)) continue;
    const pole = zaslonieta(k.x, k.y);
    if (pole === 0) return k;
    if (pole < najmniej) {
      najmniej = pole;
      najlepsze = k;
    }
  }
  // W obrysie nie ma wolnego miejsca. Dla podpisu, który nie jest NAZWĄ obrysu (strefa
  // przyboru), czytelny napis wystający za ścianę jest lepszy niż schowany pod symbolem
  // — w małej łazience trafiał inaczej pod umywalkę albo pod brodzik. Nazwa pomieszczenia
  // za ścianą czytałaby się już jako nazwa SĄSIADA, więc ona tej furtki nie dostaje.
  const wolneGdziekolwiek = opcje.wolnoZaObrys ? wszystkie.find((k) => zaslonieta(k.x, k.y) === 0) : undefined;
  return wolneGdziekolwiek ?? najlepsze ?? kotwica;
}

/**
 * Pełna siatka punktów co `krok` wokół `p` (do `krokow` kroków w każdą stronę),
 * od najbliższych. Przy równej odległości najpierw pion, potem poziom, na końcu skosy.
 *
 * Pełna siatka, a nie osiem promieni: w pokoju w kształcie L wolne miejsce leżało
 * „w bok i trochę w górę" od środka obrysu, czyli między promieniami, i przeszukiwanie
 * samych kierunków głównych nigdy by go nie znalazło.
 */
export function przesunieciaWokol(p: { x: number; y: number }, krok: number, krokow: number): { x: number; y: number }[] {
  if (krok <= 0) return [];
  const siatka: { i: number; j: number }[] = [];
  for (let i = -krokow; i <= krokow; i++) {
    for (let j = -krokow; j <= krokow; j++) {
      if (i !== 0 || j !== 0) siatka.push({ i, j });
    }
  }
  const ranga = ({ i, j }: { i: number; j: number }) => (i === 0 ? 0 : j === 0 ? 1 : 2);
  siatka.sort((a, b) => Math.hypot(a.i, a.j) - Math.hypot(b.i, b.j) || ranga(a) - ranga(b) || b.j - a.j || b.i - a.i);
  return siatka.map(({ i, j }) => ({ x: p.x + i * krok, y: p.y + j * krok }));
}

/**
 * Czy odcinek ab przecina prostokąt [x1, x2] × [y1, y2] (albo w nim leży).
 * Obcinanie Lianga–Barsky'ego: parametr t przesuwa się po odcinku, a każda krawędź
 * prostokąta zawęża przedział, w którym odcinek jest wewnątrz.
 */
function odcinekPrzecinaProstokat(
  a: { x: number; y: number },
  b: { x: number; y: number },
  x1: number,
  y1: number,
  x2: number,
  y2: number
): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;
  for (const [p, q] of [
    [-dx, a.x - x1],
    [dx, x2 - a.x],
    [-dy, a.y - y1],
    [dy, y2 - a.y],
  ]) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
  }
  return true;
}
