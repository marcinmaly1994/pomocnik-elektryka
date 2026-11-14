import { useCallback, useRef, useState } from "react";
import type { Point } from "@/types";
import { prostokatMiedzy, type ProstokatRamki } from "@/lib/geometry";

/**
 * Prostokąt rysowany przeciągnięciem po płótnie — ramka zaznaczania i prostokąt
 * pomieszczenia w DesignCanvas.
 *
 * Oba trzymały wcześniej po trzy osobne kawałki stanu w komponencie (kotwica, ref
 * z prostokątem, stan do renderu) i po swojej kopii tych samych operacji. Wydzielone
 * w pozycji 8 przeglądu z 12.11.2026.
 *
 * Źródłem prawdy dla bieżącego prostokąta jest REF, a nie tylko stan: przy szybkich
 * `mousemove` + `mouseup` w jednej turze React batchuje aktualizacje stanu, więc
 * handler `mouseup` czytający sam stan widział rozmiar sprzed ostatniego ruchu.
 * Stan jest tylko kopią do narysowania podglądu.
 */
export interface ProstokatPrzeciagany {
  /** Prostokąt do narysowania (kopia z refa) — `null`, gdy nic nie jest rysowane. */
  prostokat: ProstokatRamki | null;
  /** Czy trwa przeciąganie, tzn. jest kotwica z `mousedown`. */
  trwa(): boolean;
  /** Kotwica przeciągnięcia albo `null`. */
  kotwica(): Point | null;
  /** `mousedown`: kotwica w `p` i zerowy prostokąt w tym miejscu. */
  zacznij(p: Point): void;
  /**
   * `mousemove`: prostokąt od `od` do `p`. Domyślnie od kotwicy przeciągnięcia; prostokąt
   * pomieszczenia podaje też kotwicę trybu dwóch kliknięć, gdy przycisk nie jest wciśnięty.
   * Bez punktu startowego nic nie robi.
   */
  rozciagnij(p: Point, od?: Point | null): void;
  /**
   * `mouseup`: zdejmuje kotwicę i zwraca ostatni prostokąt. Podglądu NIE chowa — prostokąt
   * pomieszczenia zostawia go, gdy przeciągnięcie okazało się zwykłym klikiem (pierwszy krok
   * trybu dwóch kliknięć). Do schowania jest `schowaj`.
   */
  zakoncz(): ProstokatRamki | null;
  /** Chowa podgląd (stan), kotwicy nie rusza. */
  schowaj(): void;
  /** Porzuca wszystko: kotwicę, ref i podgląd — Escape, zmiana narzędzia. */
  porzuc(): void;
}

export function useProstokatPrzeciagany(): ProstokatPrzeciagany {
  const kotwicaRef = useRef<Point | null>(null);
  const prostokatRef = useRef<ProstokatRamki | null>(null);
  const [prostokat, setProstokat] = useState<ProstokatRamki | null>(null);

  const ustaw = useCallback((r: ProstokatRamki | null) => {
    prostokatRef.current = r;
    setProstokat(r);
  }, []);

  const trwa = useCallback(() => kotwicaRef.current !== null, []);
  const kotwica = useCallback(() => kotwicaRef.current, []);

  const zacznij = useCallback(
    (p: Point) => {
      kotwicaRef.current = p;
      ustaw({ x: p.x, y: p.y, w: 0, h: 0 });
    },
    [ustaw]
  );

  const rozciagnij = useCallback(
    (p: Point, od?: Point | null) => {
      const start = kotwicaRef.current ?? od ?? null;
      if (!start) return;
      ustaw(prostokatMiedzy(start, p));
    },
    [ustaw]
  );

  const zakoncz = useCallback(() => {
    const r = prostokatRef.current;
    kotwicaRef.current = null;
    prostokatRef.current = null;
    return r;
  }, []);

  const schowaj = useCallback(() => setProstokat(null), []);

  const porzuc = useCallback(() => {
    kotwicaRef.current = null;
    ustaw(null);
  }, [ustaw]);

  return { prostokat, trwa, kotwica, zacznij, rozciagnij, zakoncz, schowaj, porzuc };
}
