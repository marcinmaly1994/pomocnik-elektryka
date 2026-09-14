import type { ElementType, InstallationElement } from "@/types";
import { ELEMENT_TYPES, etykietaOsprzetu, kluczOsprzetu, mechanizmowWElemencie, NO_ROOM } from "@/lib/elements";

/**
 * Zestawienie ilościowe kondygnacji — „ile czego" i „ile w którym pomieszczeniu".
 *
 * Powód: pasek stanu podawał jedną liczbę („Elementy: 15"). Żeby zobaczyć rozbicie,
 * trzeba było przejść do Kosztorysu — dwa kroki dalej, przez Rozdzielnicę. A to jest
 * pytanie zadawane W TRAKCIE rysowania: czy w salonie jest już dość gniazdek, czy nie
 * zapomniałem o łączniku w korytarzu.
 *
 * Liczby MUSZĄ zgadzać się z kosztorysem, więc obie strony liczą przez tę samą
 * `mechanizmowWElemencie` — patrz komentarz przy niej.
 */

export interface WierszZestawienia {
  /**
   * Klucz wiersza — typ symbolu PLUS wariant (patrz `kluczOsprzetu`).
   *
   * Sam `type` nie wystarcza, odkąd jeden typ daje dwa wiersze: gniazdo pojedyncze
   * i podwójne. Dwa wiersze o tym samym kluczu React sklejał w jeden.
   */
  klucz: string;
  /** Typ SYMBOLU — wspólny dla obu wariantów gniazda, bo rysują się tak samo. */
  type: ElementType;
  label: string;
  /** Sztuki osprzętu do kupienia. Gniazdo podwójne to JEDNA sztuka (własnej pozycji
   *  cennika); dwie robi już tylko stary zapis podwójnego łącznika. */
  sztuk: number;
  /** Punkty na rysunku (symbole). */
  punktow: number;
}

export interface WierszPomieszczenia {
  room: string;
  sztuk: number;
  punktow: number;
}

export interface Zestawienie {
  wiersze: WierszZestawienia[];
  pomieszczenia: WierszPomieszczenia[];
  /** Sumy dla całej kondygnacji — do nagłówka, żeby nie liczyć ich w komponencie. */
  sztukRazem: number;
  punktowRazem: number;
}

/**
 * Buduje zestawienie z elementów JEDNEJ kondygnacji.
 *
 * Sortowanie ALFABETYCZNE po nazwie, nie po liczbie: zestawienie czyta się szukając
 * konkretnej pozycji („ile mam gniazd hermetycznych"), a nie od najczęstszej — dokładnie
 * ten sam powód, dla którego alfabetycznie sortuje się legenda symboli w PDF.
 *
 * Wyposażenie sanitarne (wanna, prysznic, umywalka) NIE wchodzi: to nie jest osprzęt
 * elektryczny, tylko punkt odniesienia dla stref ochronnych. Wliczone psułoby zarówno
 * sumę „ile elementów instalacji", jak i zgodność z kosztorysem, który też je pomija.
 */
export function summarizeFloor(elements: InstallationElement[]): Zestawienie {
  const instalacyjne = elements.filter((e) => ELEMENT_TYPES[e.type]?.role !== "sanitary");

  const wgTypu = new Map<string, WierszZestawienia>();
  const wgPokoju = new Map<string, WierszPomieszczenia>();
  let sztukRazem = 0;

  for (const e of instalacyjne) {
    const sztuk = mechanizmowWElemencie(e);
    sztukRazem += sztuk;

    // Grupowanie po typie PLUS wariancie: pojedyncze i podwójne to dwa produkty
    // do zamówienia, więc dwa wiersze — tak samo jak dwie pozycje w kosztorysie.
    const klucz = kluczOsprzetu(e);
    const wiersz = wgTypu.get(klucz) ?? { klucz, type: e.type, label: etykietaOsprzetu(e), sztuk: 0, punktow: 0 };
    wiersz.sztuk += sztuk;
    wiersz.punktow += 1;
    wgTypu.set(klucz, wiersz);

    const pokoj = wgPokoju.get(e.room) ?? { room: e.room, sztuk: 0, punktow: 0 };
    pokoj.sztuk += sztuk;
    pokoj.punktow += 1;
    wgPokoju.set(e.room, pokoj);
  }

  return {
    wiersze: [...wgTypu.values()].sort((a, b) => a.label.localeCompare(b.label, "pl")),
    // „Bez pomieszczenia" na KONIEC listy, niezależnie od alfabetu: to nie jest pokój,
    // tylko worek na to, co jeszcze nie ma przypisania — czytelniej pod kreską niż
    // wciśnięte między Kuchnię a Łazienkę.
    pomieszczenia: [...wgPokoju.values()].sort((a, b) => {
      if (a.room === NO_ROOM) return 1;
      if (b.room === NO_ROOM) return -1;
      return a.room.localeCompare(b.room, "pl");
    }),
    sztukRazem,
    punktowRazem: instalacyjne.length,
  };
}

/**
 * Zestawienie rozbite na pary "rodzaj x pomieszczenie" — do tabeli w PDF.
 *
 * Inny podzial niz `summarizeFloor`, bo inny odbiorca: w aplikacji patrzy sie na sumy
 * ("ile gniazdek mam w ogole"), a na budowie montuje sie pokoj po pokoju ("co idzie
 * do kuchni"). Sortowanie po pomieszczeniu, potem po nazwie elementu — tabela ma sie
 * czytac jak lista zakupow na jedno pomieszczenie naraz.
 */
export function pozycjeZestawieniaDoPdf(
  elements: InstallationElement[]
): { element: string; pomieszczenie: string; ilosc: number }[] {
  const mapa = new Map<string, { element: string; pomieszczenie: string; ilosc: number }>();
  for (const e of elements) {
    if (ELEMENT_TYPES[e.type]?.role === "sanitary") continue;
    const element = etykietaOsprzetu(e);
    const klucz = `${e.room}|${element}`;
    const poz = mapa.get(klucz) ?? { element, pomieszczenie: e.room, ilosc: 0 };
    poz.ilosc += mechanizmowWElemencie(e);
    mapa.set(klucz, poz);
  }
  return [...mapa.values()].sort((a, b) => {
    // "Bez pomieszczenia" na koniec, tak samo jak w panelu w aplikacji.
    if (a.pomieszczenie !== b.pomieszczenie) {
      if (a.pomieszczenie === NO_ROOM) return 1;
      if (b.pomieszczenie === NO_ROOM) return -1;
      return a.pomieszczenie.localeCompare(b.pomieszczenie, "pl");
    }
    return a.element.localeCompare(b.element, "pl");
  });
}
