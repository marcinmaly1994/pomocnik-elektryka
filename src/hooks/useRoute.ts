import { useCallback, useEffect, useState } from "react";
import { buildPath, parsePath, zakladkaZParametrem, type AppTab, type Route } from "@/lib/routing";

/** Wszystkie zywe instancje hooka — patrz komentarz przy subskrypcji nizej. */
const subskrybenci = new Set<() => void>();

/**
 * Ile razy użytkownik przeszedł do innej zakładki WEWNĄTRZ aplikacji (bez `replace`).
 *
 * Pozwala odróżnić wejście na zakładkę z nawigacji od otwarcia/odświeżenia strony —
 * patrz przewinięcie do edytora na telefonie w `DesignTab`. Przy starcie strony 0.
 */
let liczbaNawigacji = 0;
export function licznikNawigacji(): number {
  return liczbaNawigacji;
}

export interface NawigujOpcje {
  /**
   * Podmienia bieżący wpis w historii zamiast dokładać nowy.
   *
   * Do PORZĄDKOWANIA adresu, nie do nawigacji: gdy wejście na „/kalkulatory" bez
   * parametru uzupełniamy o konkretny kalkulator, użytkownik nigdzie nie przeszedł —
   * gdyby to był nowy wpis, „wstecz" wracałoby na adres, który natychmiast
   * przekierowuje z powrotem, czyli przycisk sprawiałby wrażenie zepsutego.
   */
  replace?: boolean;
}

/**
 * Bieżący widok wzięty z adresu URL, plus funkcja do jego zmiany.
 *
 * Źródłem prawdy jest `window.location` — nie kopia w stanie Reacta. Stan trzymany
 * tutaj jest tylko odbiciem adresu, odświeżanym przy każdej jego zmianie: własnej
 * (`nawiguj`) i cudzej („wstecz"/„dalej" w przeglądarce, które przychodzą jako
 * `popstate`). Dzięki temu nie ma dwóch prawd, które mogłyby się rozjechać.
 *
 * Hook wolno wywołać w kilku komponentach naraz (App, zakładka kalkulatorów,
 * zakładka protokołów) — każdy dostaje własną subskrypcję `popstate` i ten sam
 * odczyt z `location`, więc wszystkie widzą to samo.
 */
export function useRoute(): [Route, (tab: AppTab, param?: string | null, opts?: NawigujOpcje) => void] {
  const [route, setRoute] = useState<Route>(() => parsePath(biezacaSciezka()));

  useEffect(() => {
    function odswiez() {
      setRoute(parsePath(biezacaSciezka()));
    }
    // Nawigacja z JEDNEGO hooka musi dojść do WSZYSTKICH — `pushState`/`replaceState`
    // nie odpalają `popstate`, więc bez tej listy każda instancja widziała tylko
    // własne nawigacje. Do niedawna nie miało to znaczenia (zakładki nawigowały same
    // do siebie), ale komplet dokumentacji przełącza zakładki z okna stojącego OBOK
    // nich — i `App` po prostu nie dowiadywał się o zmianie.
    subskrybenci.add(odswiez);
    // `popstate` to jedyne zdarzenie, jakim przeglądarka zgłasza „wstecz"/„dalej".
    window.addEventListener("popstate", odswiez);
    // Odczyt także przy montowaniu: między policzeniem stanu początkowego a
    // podpięciem nasłuchu adres mógł się zmienić (np. inny efekt zdążył nawigować).
    odswiez();
    return () => {
      subskrybenci.delete(odswiez);
      window.removeEventListener("popstate", odswiez);
    };
  }, []);

  const nawiguj = useCallback((tab: AppTab, param?: string | null, opts?: NawigujOpcje) => {
    /**
     * „Pokaż tę zakładkę" nie ma jej RESETOWAĆ, gdy już się na niej jest.
     *
     * Zakładki z parametrem (protokoły, kalkulatory) trzymają w nim, co dokładnie jest
     * otwarte. Wywołanie bez parametru z zewnątrz — np. `setTab("protokoly")` po
     * wczytaniu zestawu z chmury — kasowało go, a zakładka wracała do pierwszej
     * pozycji z listy. Wcześniej było to niewidoczne, bo nawigacja jednej instancji
     * hooka nie docierała do pozostałych; odkąd dociera, kasowanie parametru zabierało
     * użytkownika z protokołu, który właśnie wypełniał.
     */
    const biezacy = parsePath(biezacaSciezka());
    const zachowany = param === undefined && biezacy.tab === tab ? biezacy.param : param;
    const sciezka = buildPath(tab, zakladkaZParametrem(tab) ? zachowany : null);
    // Nawigacja pod adres, na którym już jesteśmy, nie ma dokładać wpisu do historii —
    // inaczej kilka klików w tę samą zakładkę wymagałoby tylu samo naciśnięć „wstecz",
    // żeby cokolwiek się ruszyło.
    if (sciezka === biezacaSciezka()) return;
    // `history` zmieniamy sami, a `popstate` NIE odpala się dla własnych wywołań
    // push/replaceState — stąd jawne powiadomienie subskrybentów obok.
    if (opts?.replace) window.history.replaceState(null, "", sciezka);
    else {
      window.history.pushState(null, "", sciezka);
      liczbaNawigacji++;
    }
    subskrybenci.forEach((f) => f());
  }, []);

  return [route, nawiguj];
}

/** Sama ścieżka, bez query i kotwicy — routing korzysta wyłącznie z niej. */
function biezacaSciezka(): string {
  return window.location.pathname;
}
