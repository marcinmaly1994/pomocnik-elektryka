import type { ProjectPayload } from "@/store/useProjectStore";
import { downloadBlob, projectFileName } from "@/lib/pdf/download";

/**
 * Kopia zapasowa projektu: zapis do pliku i odczyt z pliku.
 *
 * Do niedawna eksport istniał WYŁĄCZNIE w ustawieniach konta, a to okno renderuje się
 * tylko po zalogowaniu. Kopii nie mógł więc zrobić nikt bez konta — czyli dokładnie
 * ci użytkownicy, którym aplikacja pokazuje stały baner o tym, że projekt żyje wyłącznie
 * w tej przeglądarce. Odczytu nie było w ogóle, więc nawet zapisany plik nie miał dokąd
 * wrócić. Regulamin radzi „projekt warto wyeksportować do pliku" i dopiero od teraz
 * jest to rada wykonalna dla każdego.
 *
 * Zapis i odczyt siedzą w jednym module, bo to dwie strony tej samej umowy o format
 * pliku — rozdzielone, rozjechałyby się przy pierwszej zmianie kształtu danych.
 */

/** Zapisuje bieżący projekt do pliku JSON. Zwraca `false`, gdy przeglądarka odmówiła
 *  pobrania (patrz `downloadBlob`). */
export function zapiszKopie(payload: ProjectPayload, projectName: string): boolean {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
  return downloadBlob(blob, projectFileName("projekt", projectName, "json"));
}

export type WynikOdczytu = { ok: true; payload: ProjectPayload } | { ok: false; powod: string };

/** Jedyny komunikat o odrzuceniu. Rozróżnianie „to nie JSON" od „to JSON, ale nie
 *  projekt" nic użytkownikowi nie daje — w obu przypadkach wskazał niewłaściwy plik,
 *  a jedyna sensowna rada jest ta sama. */
const NIE_TEN_PLIK =
  "Ten plik nie jest plikiem kopii projektu. Wskaż plik JSON zapisany przez „Zapisz kopię do pliku”.";

/**
 * Sprawdza zawartość wybranego pliku i oddaje projekt gotowy do wczytania.
 *
 * Walidacja jest PŁYTKA świadomie. `loadProjectPayload` w store sam uzupełnia braki
 * starszych zapisów (pola `openings`, `warunkiDoboru` i inne doszły po drodze), więc
 * ostrzejsze sprawdzanie odrzucałoby własne kopie użytkownika sprzed aktualizacji —
 * a to właśnie one są powodem, dla którego kopia zapasowa w ogóle istnieje. Zadaniem
 * tej funkcji jest odróżnić kopię projektu od PRZYPADKOWEGO PLIKU, a nie pilnować wersji.
 *
 * Czysta i bez DOM-u, żeby dało się ją przetestować bez udawania `FileReader`.
 */
export function czytajKopie(tekst: string): WynikOdczytu {
  if (!tekst.trim()) return { ok: false, powod: NIE_TEN_PLIK };

  let dane: unknown;
  try {
    dane = JSON.parse(tekst);
  } catch {
    return { ok: false, powod: NIE_TEN_PLIK };
  }

  // `null` i tablice przechodzą `JSON.parse` bez wyjątku i są typu "object" albo
  // dają się indeksować — bez tego sita wywrócą się dopiero w store, czyli za późno,
  // żeby powiedzieć użytkownikowi cokolwiek sensownego.
  if (typeof dane !== "object" || dane === null || Array.isArray(dane)) {
    return { ok: false, powod: NIE_TEN_PLIK };
  }

  const kandydat = dane as Partial<ProjectPayload>;
  const maPlan = typeof kandydat.draft === "object" && kandydat.draft !== null;
  const maKondygnacje = Array.isArray(kandydat.floors);
  if (!maPlan || !maKondygnacje) return { ok: false, powod: NIE_TEN_PLIK };

  return { ok: true, payload: kandydat as ProjectPayload };
}
