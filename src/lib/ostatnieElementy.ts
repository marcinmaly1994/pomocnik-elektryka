import type { ElementType } from "@/types";
import { ELEMENT_TYPES } from "@/lib/elements";

/**
 * „Ostatnio używane" w katalogu elementów (R13 z audytu Instalacji 11.11.2026).
 *
 * Przy rozstawianiu osprzętu robi się serie tych samych trzech–czterech typów, a każdy
 * powrót do nich to szukajka albo rozwinięcie sekcji akordeonu. Kafle nad listą skracają
 * to do jednego kliknięcia.
 *
 * Trzymane w `localStorage` PRZEGLĄDARKI, nie w projekcie: to nawyk osoby, która rysuje,
 * a nie cecha budynku — i nie ma czego synchronizować do chmury ani wklejać do kopii.
 */
export const KLUCZ_OSTATNICH = "pomocnikelektryka_ostatnie_elementy";
/** Cztery kafle — dwa rzędy po dwa w kolumnie panelu (256 px), z czytelną nazwą. */
export const ILE_OSTATNICH = 4;

interface Magazyn {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

/** Lista od najświeższego; nieznane typy (np. po zmianie katalogu) odpadają po cichu. */
export function czytajOstatnie(magazyn: Magazyn | null): ElementType[] {
  if (!magazyn) return [];
  try {
    const surowe: unknown = JSON.parse(magazyn.getItem(KLUCZ_OSTATNICH) ?? "[]");
    if (!Array.isArray(surowe)) return [];
    return surowe.filter((t): t is ElementType => typeof t === "string" && t in ELEMENT_TYPES).slice(0, ILE_OSTATNICH);
  } catch {
    return [];
  }
}

/** Typ na początek listy, bez powtórzeń, przycięte do `ILE_OSTATNICH`. */
export function dodajOstatni(lista: ElementType[], typ: ElementType): ElementType[] {
  return [typ, ...lista.filter((t) => t !== typ)].slice(0, ILE_OSTATNICH);
}

/** Zapis bez rzucania — brak pamięci (tryb prywatny) nie może popsuć wyboru elementu. */
export function zapiszOstatnie(magazyn: Magazyn | null, lista: ElementType[]): void {
  if (!magazyn) return;
  try {
    magazyn.setItem(KLUCZ_OSTATNICH, JSON.stringify(lista));
  } catch {
    // nic — to tylko wygoda
  }
}
