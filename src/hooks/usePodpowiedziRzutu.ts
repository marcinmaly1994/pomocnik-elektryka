import { useCallback, useRef, useState } from "react";
import {
  czyOdnotowacKolko,
  czyPokazacPodpowiedzKolka,
  czyPokazacPowitanie,
  odczytajStanNawigacji,
  zapamietajOdrzuceniePowitania,
  zapamietajUmiejetnosc,
} from "@/lib/podpowiedziNawigacji";

/** Trzy okazje do dymka — linijka (skala), ściany, nawigacja po rzucie — ten sam popover. */
export type DymekRzutu = "skala" | "sciany" | "nawigacja";

/**
 * Podpowiedzi przewodnika na rzucie: który dymek stoi, co czeka w kolejce, co
 * użytkownik już wie o ruszaniu rzutem i sygnał „kółko bez Ctrl".
 *
 * Wydzielone z DesignTab w pozycji 8 przeglądu z 12.11.2026. Kotwice dymków (przyciski
 * w pasku, grupa powiększenia) i zmiana narzędzia zostają w komponencie — to DOM
 * i stan edytora, nie przewodnika.
 */
export function usePodpowiedziRzutu() {
  const [dymek, setDymek] = useState<DymekRzutu | null>(null);
  /**
   * Co użytkownik już wie o ruszaniu rzutem (patrz `podpowiedziNawigacji.ts`).
   *
   * Czytane RAZ, przy montowaniu: między zapisem a odczytem stoi tylko ta zakładka,
   * więc stan Reacta i `localStorage` nie mają jak się rozjechać.
   */
  const [stanNawigacji, setStanNawigacji] = useState(odczytajStanNawigacji);
  /**
   * Licznik pomyłek „kółko bez Ctrl" — patrz `PodpowiedzKolka`. Licznik, a nie flaga,
   * żeby kolejne kręcenie przedłużało komunikat, zamiast nie robić nic.
   */
  const [sygnalKolka, setSygnalKolka] = useState(0);
  /** Kiedy ostatnio odnotowaliśmy kręcenie kółkiem — patrz `czyOdnotowacKolko`. */
  const ostatnieKolkoRef = useRef(0);
  /**
   * Dymek czekający na SWOJĄ kolej — patrz `poWgraniuPodkladu`.
   *
   * Ref, nie stan: nikt go nie ogląda, dopóki nie nadejdzie jego moment, a zmiana
   * kolejki sama w sobie nie ma prawa niczego przerysować.
   */
  const nastepnyRef = useRef<"skala" | null>(null);

  /** Pokazuje dymek czekający w kolejce (jeśli jakiś jest) i opróżnia ją. */
  const pokazNastepny = useCallback(() => {
    const nastepny = nastepnyRef.current;
    nastepnyRef.current = null;
    setDymek(nastepny);
  }, []);

  /**
   * Pierwsze przybliżenie rzutu — gasi obie podpowiedzi o nawigacji na dobre.
   *
   * Wołane z JEDNEGO miejsca dla wszystkich dróg: `Ctrl` + kółko na płótnie i
   * przyciski w pasku wchodzą tym samym `onZoomChange`, więc nie da się nauczyć
   * przybliżania „po cichu", z pominięciem tego zapisu.
   */
  const oznaczUmiejetnoscNawigacji = useCallback(() => {
    zapamietajUmiejetnosc();
    setStanNawigacji((s) => (s.umieNawigowac ? s : { ...s, umieNawigowac: true }));
    // Dymek, który właśnie o tym mówił, nie ma już czego tłumaczyć — ustępuje
    // miejsca temu, co czekało za nim.
    //
    // Kolejkę opróżniamy POZA funkcją aktualizującą stan. React woła ją w trybie
    // ścisłym dwa razy dla tej samej zmiany: pierwsze wywołanie zabierało dymek
    // z kolejki, drugie zastawało ją pustą i kasowało go z powrotem.
    if (dymek === "nawigacja") pokazNastepny();
  }, [dymek, pokazNastepny]);

  /**
   * „Rozumiem" pod dymkiem o nawigacji — zamyka go na dobre, także po odświeżeniu,
   * i oddaje scenę temu, co czekało w kolejce (zwykle: dymkowi o skali).
   */
  const zamknijPowitanieNawigacji = useCallback(() => {
    zapamietajOdrzuceniePowitania();
    setStanNawigacji((s) => ({ ...s, powitanieOdrzucone: true }));
    pokazNastepny();
  }, [pokazNastepny]);

  /**
   * Ktoś kręci kółkiem nad rzutem bez `Ctrl` — czyli przewija stronę, prawdopodobnie
   * próbując przybliżyć plan. Podnosimy licznik, a `PodpowiedzKolka` zamienia go na
   * gasnący sam komunikat.
   */
  const zglosKolkoBezCtrl = useCallback(() => {
    if (!czyPokazacPodpowiedzKolka(stanNawigacji, dymek === "nawigacja")) return;
    // Jedno kręcenie kółkiem to kilkadziesiąt zdarzeń, a każde szło dotąd prosto
    // w stan, czyli w pełne przerysowanie zakładki razem z płótnem. Dymek i tak
    // wyglądał identycznie — patrz `ODSTEP_ZGLOSZEN_KOLKA`.
    const teraz = Date.now();
    if (!czyOdnotowacKolko(ostatnieKolkoRef.current, teraz)) return;
    ostatnieKolkoRef.current = teraz;
    setSygnalKolka((n) => n + 1);
  }, [stanNawigacji, dymek]);

  /**
   * Dymki po wgraniu podkładu (przycięciem albo z jego pominięciem).
   *
   * Kolejność jest celowa: najpierw JAK oglądać rzut, dopiero potem CO z nim zrobić.
   * Dwóch punktów o znanej odległości nie da się wskazać na rzucie, którego nie umie
   * się przybliżyć. Kto nawigację już zna, ten przechodzi prosto do skali. Kolejka ma
   * najwyżej dwa elementy i nie zamierza być mechanizmem ogólnym.
   */
  const poWgraniuPodkladu = useCallback(() => {
    if (czyPokazacPowitanie(stanNawigacji)) {
      nastepnyRef.current = "skala";
      setDymek("nawigacja");
      return;
    }
    setDymek("skala");
  }, [stanNawigacji]);

  return {
    dymek,
    /** Pokazuje wskazany dymek albo chowa bieżący (`null`). */
    pokazDymek: setDymek,
    sygnalKolka,
    oznaczUmiejetnoscNawigacji,
    zamknijPowitanieNawigacji,
    zglosKolkoBezCtrl,
    poWgraniuPodkladu,
  };
}
