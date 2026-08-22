/**
 * Dokumenty zapisywane na koncie: projekty instalacji i zestawy protokołów.
 *
 * Oba rodzaje leżą w JEDNEJ tabeli `projects` i różnią się polem `kind` wewnątrz
 * `data`. Świadomie nie zakładamy osobnej tabeli: wymagałaby ręcznej migracji SQL
 * i własnych reguł RLS w panelu Supabase, a to krok poza aplikacją, którego nie da
 * się wykonać za użytkownika. Tu wystarczy zapis, który i tak wykonujemy.
 *
 * Zapisy sprzed wprowadzenia rozdziału nie mają `kind` w ogóle — traktujemy je
 * jako projekty, bo tylko takie wtedy powstawały.
 */

export type RodzajDokumentu = "projekt" | "protokoly";

/** Ile dokumentów każdego rodzaju wolno trzymać na koncie. */
export const LIMIT_ZAPISOW = 5;

export const NAZWA_RODZAJU: Record<RodzajDokumentu, string> = {
  projekt: "projekt",
  protokoly: "zestaw protokołów",
};

export interface PozycjaDokumentu {
  id: string;
  name: string;
  updated_at: string;
  /** Brak wartości = zapis sprzed rozdzielenia rodzajów, czyli projekt. */
  kind?: string | null;
}

export function rodzajDokumentu(poz: Pick<PozycjaDokumentu, "kind">): RodzajDokumentu {
  return poz.kind === "protokoly" ? "protokoly" : "projekt";
}

export function filtrujPoRodzaju<T extends Pick<PozycjaDokumentu, "kind">>(lista: T[], rodzaj: RodzajDokumentu): T[] {
  return lista.filter((p) => rodzajDokumentu(p) === rodzaj);
}

export interface WynikLimitu {
  /** `true` = zapisu nie wolno wykonać, trzeba najpierw coś usunąć. */
  zablokowany: boolean;
  /** Ile dokumentów tego rodzaju jest już na koncie. */
  ile: number;
  komunikat: string;
}

/**
 * Sprawdza, czy zapis się zmieści w limicie.
 *
 * Nadpisanie ISTNIEJĄCEGO dokumentu nigdy nie jest blokowane — liczba zapisów się
 * wtedy nie zmienia, a blokowanie zapisu czegoś, co już jest na koncie, oznaczałoby
 * utratę bieżącej pracy przy pełnym limicie. Blokujemy wyłącznie utworzenie kolejnego.
 */
export function sprawdzLimit(
  lista: Pick<PozycjaDokumentu, "id" | "kind">[],
  rodzaj: RodzajDokumentu,
  nadpisywaneId: string | null,
): WynikLimitu {
  const tegoRodzaju = filtrujPoRodzaju(lista, rodzaj);
  const ile = tegoRodzaju.length;
  const nadpisujemy = !!nadpisywaneId && tegoRodzaju.some((p) => p.id === nadpisywaneId);
  const zablokowany = !nadpisujemy && ile >= LIMIT_ZAPISOW;
  return {
    zablokowany,
    ile,
    komunikat: zablokowany
      ? `Masz już ${LIMIT_ZAPISOW} zapisanych pozycji (limit dla tego rodzaju). Usuń jedną, żeby zapisać nową.`
      : "",
  };
}
