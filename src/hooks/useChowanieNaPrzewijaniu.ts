import { useEffect, useRef, useState } from "react";

/**
 * Chowa pływające pigułki „Cofnij/Dalej", kiedy ktoś czyta stronę w dół.
 *
 * Pigułki są `position: fixed` w dolnych rogach okna, więc przy przewijaniu długiej
 * tabeli (Kosztorys, lista aparatów Rozdzielnicy) leżały na jej pierwszej kolumnie —
 * na nazwach pozycji — i po zatrzymaniu przewijania dalej je zasłaniały.
 *
 * Wracają, gdy użytkownik przewija w górę (typowy gest „szukam nawigacji"), jest
 * blisko góry strony albo dojechał do jej końca. Koniec strony celowo: stopka ma już
 * zapas pod pigułki (patrz `SiteFooter`), a gaszenie „Dalej" dokładnie wtedy, gdy ktoś
 * doczytał do końca i chce iść dalej, zabierałoby skrót w jedynym momencie, w którym
 * jest naprawdę potrzebny.
 */

/** Poniżej tylu pikseli od góry pigułki są zawsze widoczne. */
export const PROG_GORY_PX = 120;
/** Tyle pikseli od końca strony liczy się już jako „dojechał do końca". */
export const PROG_KONCA_PX = 120;
/** Drobniejsze ruchy (drgnięcie kółka, dosunięcie po przewinięciu) nic nie zmieniają. */
export const MARTWA_STREFA_PX = 8;

export type StanPrzewiniecia = {
  /** Poprzednia pozycja przewinięcia. */
  poprzednie: number;
  /** Bieżąca pozycja przewinięcia. */
  teraz: number;
  /** Wysokość okna. */
  wysokoscOkna: number;
  /** Całkowita wysokość strony. */
  wysokoscStrony: number;
};

/**
 * Nowy stan schowania dla pojedynczego zdarzenia przewinięcia; `null`, gdy ruch był
 * za mały, żeby cokolwiek zmieniać.
 */
export function schowacPigulki(s: StanPrzewiniecia): boolean | null {
  if (s.teraz <= PROG_GORY_PX) return false;
  if (s.teraz + s.wysokoscOkna >= s.wysokoscStrony - PROG_KONCA_PX) return false;
  const ruch = s.teraz - s.poprzednie;
  if (Math.abs(ruch) < MARTWA_STREFA_PX) return null;
  return ruch > 0;
}

/**
 * `true`, gdy pigułki mają być schowane. Zmiana `klucz` (np. zakładki) pokazuje je
 * od nowa — nowa strona zaczyna od góry.
 */
export function useChowanieNaPrzewijaniu(klucz: unknown): boolean {
  const [schowane, setSchowane] = useState(false);
  const poprzednie = useRef(0);

  useEffect(() => {
    setSchowane(false);
    poprzednie.current = window.scrollY;
    const naPrzewiniecie = () => {
      const teraz = window.scrollY;
      const wynik = schowacPigulki({
        poprzednie: poprzednie.current,
        teraz,
        wysokoscOkna: window.innerHeight,
        wysokoscStrony: document.documentElement.scrollHeight,
      });
      if (wynik === null) return;
      poprzednie.current = teraz;
      setSchowane(wynik);
    };
    window.addEventListener("scroll", naPrzewiniecie, { passive: true });
    return () => window.removeEventListener("scroll", naPrzewiniecie);
  }, [klucz]);

  return schowane;
}
