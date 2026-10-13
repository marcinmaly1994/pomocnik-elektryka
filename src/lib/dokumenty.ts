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

/**
 * Szuka dokumentu tego samego rodzaju o tej samej nazwie.
 *
 * Zapis pod istniejącą nazwą ma NADPISYWAĆ, a nie tworzyć kolejną pozycję. Bez tego
 * każde „Zapisz” robiło nowy wpis, konto zapychało się kopiami tego samego projektu,
 * a przy piątej pozycji autozapis wpadał w pętlę blokady limitu.
 *
 * Porównanie po przycięciu spacji i bez rozróżniania wielkości liter: „Mój dom”
 * i „mój dom  ” to dla użytkownika ten sam projekt, choć bajtowo są różne.
 */
export function znajdzPoNazwie(
  lista: Pick<PozycjaDokumentu, "id" | "name" | "kind">[],
  rodzaj: RodzajDokumentu,
  nazwa: string,
): string | null {
  const szukana = nazwa.trim().toLocaleLowerCase("pl");
  if (!szukana) return null;
  const trafienie = filtrujPoRodzaju(lista, rodzaj).find((p) => p.name.trim().toLocaleLowerCase("pl") === szukana);
  return trafienie?.id ?? null;
}

/**
 * Co zrobić z żądaniem zapisu. Wydzielone z warstwy sieciowej, bo to TU siedzi cała
 * logika, którą łatwo przeoczyć — i którą raz już przeoczyłem: kolizję nazw
 * sprawdzałem wyłącznie dla dokumentów bez powiązania z chmurą, więc zmiana nazwy
 * już zapisanego projektu na istniejącą przechodziła bez pytania i tworzyła dwa
 * wpisy o tej samej nazwie.
 */
export type DecyzjaZapisu =
  | { akcja: "aktualizuj"; id: string }
  | { akcja: "utworz" }
  | { akcja: "pytaj"; id: string }
  | { akcja: "limit"; komunikat: string };

export function decyzjaZapisu(opts: {
  lista: Pick<PozycjaDokumentu, "id" | "name" | "kind">[];
  rodzaj: RodzajDokumentu;
  nazwa: string;
  /** Id dokumentu, który w tej sesji wczytaliśmy albo zapisaliśmy. */
  biezacyId: string | null;
  /** Id wskazane przez użytkownika po potwierdzeniu nadpisania — pomija pytanie. */
  wymuszonyId?: string | null;
}): DecyzjaZapisu {
  const { lista, rodzaj, nazwa, biezacyId, wymuszonyId } = opts;
  if (wymuszonyId) return { akcja: "aktualizuj", id: wymuszonyId };

  const zNazwy = znajdzPoNazwie(lista, rodzaj, nazwa);
  // Kolizja to wpis o tej samej nazwie INNY niż ten, który właśnie edytujemy.
  // Zapisanie zmian we własnym dokumencie nie jest kolizją i nie może pytać —
  // inaczej pytanie wracałoby przy każdym zapisie.
  if (zNazwy && zNazwy !== biezacyId) return { akcja: "pytaj", id: zNazwy };

  if (biezacyId) return { akcja: "aktualizuj", id: biezacyId };

  const limit = sprawdzLimit(lista, rodzaj, null);
  if (limit.zablokowany) return { akcja: "limit", komunikat: limit.komunikat };
  return { akcja: "utworz" };
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
