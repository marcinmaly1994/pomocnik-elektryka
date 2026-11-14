import { useCallback, useState } from "react";
import type { Point } from "@/types";
import type { Przyciagniecie } from "@/lib/drawSnap";

/** Punkt rysowanej figury razem z tym, co o jego położeniu zadecydowało. */
export interface WynikPunktu {
  punkt: Point;
  zaczep: Przyciagniecie | null;
  /** Które osie złapały wyrównanie — do znacznika przy kursorze. */
  wyrownanie: { x: boolean; y: boolean };
}

/** Punkt i osie, które go ustawiły — znacznik wyrównania przy kursorze. */
export interface OsieKursora {
  punkt: Point;
  x: boolean;
  y: boolean;
}

/**
 * Kursory rysowania na płótnie — to, co idzie za myszą, zanim padnie klik.
 *
 * Cztery kawałki stanu DesignCanvas, wydzielone w pozycji 8 przeglądu z 12.11.2026:
 *
 * - `kursorPokoju` — koniec „gumowej" linii wieloboku pomieszczenia i podświetlenie
 *   punktu startowego, gdy kolejny klik zamknie figurę;
 * - `kursorSciany` — to samo dla ściany, z etykietą bieżącej długości;
 * - `zaczep` — narożnik albo krawędź już narysowanej geometrii, do której przyciągnęło
 *   rysowany punkt. Bez podświetlenia przyciąganie jest niewidzialne, a niewidzialne
 *   przyciąganie nie do odróżnienia od celnego kliknięcia;
 * - `osie` — czy punkt siadł w linii z czymś. Znacznik KRÓTKI, przy samym punkcie:
 *   linie przez cały rysunek pokazywały poziom narożnika pod kursorem, a nie punktu,
 *   który się właśnie stawia.
 *
 * Zaczep i osie zmieniały się PARAMI (sześć par wywołań w komponencie) i to jest powód
 * tego hooka: `pokazPomoc` ustawia obie z wyniku przyciągania, `bezPomocy` gasi obie.
 * Siódme miejsce gasiło sam zaczep — i po zamknięciu wieloboku znacznik osi stał przy
 * domkniętej figurze aż do następnego ruchu myszy.
 */
export function useKursoryRysowania() {
  const [kursorPokoju, setKursorPokoju] = useState<Point | null>(null);
  const [kursorSciany, setKursorSciany] = useState<Point | null>(null);
  const [zaczep, setZaczep] = useState<Przyciagniecie | null>(null);
  const [osie, setOsie] = useState<OsieKursora | null>(null);

  /** Zaczep i znacznik osi z wyniku przyciągania punktu. */
  const pokazPomoc = useCallback((w: WynikPunktu) => {
    setZaczep(w.zaczep);
    setOsie({ punkt: w.punkt, ...w.wyrownanie });
  }, []);

  /** Gasi zaczep i znacznik osi — kursor poza planem, domykanie figury, anulowanie. */
  const bezPomocy = useCallback(() => {
    setZaczep(null);
    setOsie(null);
  }, []);

  return { kursorPokoju, setKursorPokoju, kursorSciany, setKursorSciany, zaczep, osie, pokazPomoc, bezPomocy };
}
