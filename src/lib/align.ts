import type { InstallationElement, Point } from "@/types";

/**
 * Wyrównywanie i równomierne rozkładanie zaznaczonych elementów.
 *
 * Powód: gniazdka stawia się seriami wzdłuż jednej ściany, a klikanie ich „na oko"
 * daje rząd, w którym każde siedzi kilka centymetrów wyżej od sąsiada. Do tej pory
 * jedyną operacją na zaznaczeniu wielokrotnym było „Usuń" — poprawianie równości
 * wymagało przeciągania każdego z osobna, bez punktu odniesienia.
 *
 * Funkcje zwracają LISTĘ RUCHÓW (`{id, x, y}`), a nie zmienione elementy. Taki
 * kształt pasuje bez tłumaczenia do `onMoveElements` w DesignCanvas, więc wyrównanie
 * przechodzi tą samą drogą co przeciągnięcie myszą — łącznie z przeliczeniem
 * przypisania do pomieszczenia (patrz `roomNameAfterMove`) i jednym wpisem
 * w historii cofania.
 */

export type AlignMode = "lewo" | "prawo" | "gora" | "dol" | "srodekX" | "srodekY";
export type DistributeAxis = "x" | "y";

export interface Move {
  id: string;
  x: number;
  y: number;
}

/** Elementy o podanych id, w kolejności z listy źródłowej. */
function wybrane(elements: InstallationElement[], ids: string[]): InstallationElement[] {
  const zbior = new Set(ids);
  return elements.filter((e) => zbior.has(e.id));
}

/** Ruchy, które faktycznie coś zmieniają — bez nich każde kliknięcie „Wyrównaj"
 *  dokładałoby pusty wpis do historii cofania, nawet gdy rząd był już równy. */
function tylkoZmiany(sel: InstallationElement[], docelowe: (e: InstallationElement) => Point): Move[] {
  const out: Move[] = [];
  for (const e of sel) {
    const p = docelowe(e);
    if (p.x !== e.x || p.y !== e.y) out.push({ id: e.id, x: p.x, y: p.y });
  }
  return out;
}

/**
 * Wyrównuje zaznaczone elementy do wspólnej krawędzi albo osi.
 *
 * Punktem odniesienia jest OBRYS zaznaczenia, nie pierwszy kliknięty element:
 * „do lewej" oznacza lewą krawędź całej grupy. To zachowanie z edytorów graficznych
 * i jedyne, które daje ten sam wynik niezależnie od kolejności zaznaczania.
 *
 * Mniej niż dwa elementy nie mają się do czego wyrównać — zwracamy pustą listę,
 * zamiast udawać, że coś się stało.
 */
export function alignMoves(elements: InstallationElement[], ids: string[], mode: AlignMode): Move[] {
  const sel = wybrane(elements, ids);
  if (sel.length < 2) return [];

  const minX = Math.min(...sel.map((e) => e.x));
  const maxX = Math.max(...sel.map((e) => e.x));
  const minY = Math.min(...sel.map((e) => e.y));
  const maxY = Math.max(...sel.map((e) => e.y));
  const srodekX = (minX + maxX) / 2;
  const srodekY = (minY + maxY) / 2;

  return tylkoZmiany(sel, (e) => {
    switch (mode) {
      case "lewo":
        return { x: minX, y: e.y };
      case "prawo":
        return { x: maxX, y: e.y };
      case "gora":
        return { x: e.x, y: minY };
      case "dol":
        return { x: e.x, y: maxY };
      case "srodekX":
        return { x: srodekX, y: e.y };
      case "srodekY":
        return { x: e.x, y: srodekY };
    }
  });
}

/**
 * Rozkłada zaznaczone elementy równomiernie między SKRAJNYMI.
 *
 * Skrajne zostają na miejscu — to one wyznaczają rozpiętość, a użytkownik ustawił je
 * świadomie (pierwsze i ostatnie gniazdo w rzędzie). Rusza się tylko to, co w środku.
 *
 * Poniżej trzech elementów nie ma czego rozkładać: dwa są z definicji równo
 * rozłożone względem siebie.
 */
export function distributeMoves(elements: InstallationElement[], ids: string[], axis: DistributeAxis): Move[] {
  const sel = wybrane(elements, ids);
  if (sel.length < 3) return [];

  const posortowane = [...sel].sort((a, b) => a[axis] - b[axis]);
  const start = posortowane[0][axis];
  const koniec = posortowane[posortowane.length - 1][axis];
  const krok = (koniec - start) / (posortowane.length - 1);

  const cele = new Map<string, number>();
  posortowane.forEach((e, i) => cele.set(e.id, start + krok * i));

  return tylkoZmiany(sel, (e) => {
    const v = cele.get(e.id)!;
    return axis === "x" ? { x: v, y: e.y } : { x: e.x, y: v };
  });
}

/** Przesunięcie zaznaczenia o wektor — wspólne dla strzałek i duplikowania. */
export function offsetMoves(elements: InstallationElement[], ids: string[], dx: number, dy: number): Move[] {
  return wybrane(elements, ids).map((e) => ({ id: e.id, x: e.x + dx, y: e.y + dy }));
}
