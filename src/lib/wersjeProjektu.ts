import type { ProjectPayload } from "@/store/useProjectStore";
import type { Magazyn } from "./projektyLokalne";

/**
 * Historia wersji projektu (F15 z audytu 5.11.2026): migawki zapisywane ręcznie
 * („przed zmianą obwodów"), do których da się wrócić.
 *
 * Cofanie (Ctrl+Z) tego nie zastępuje: historia cofania żyje w pamięci karty, ginie
 * po odświeżeniu i czyści się przy każdym wczytaniu projektu. Migawka leży w
 * `localStorage` obok samego projektu i przeżywa zamknięcie przeglądarki.
 *
 * Migawki NIE niosą podkładu rzutu. Jeden podkład ze zdjęcia potrafi zająć cały
 * budżet pamięci przeglądarki (patrz `projektyLokalne.ts`), a dwadzieścia jego kopii
 * na pewno by się nie zmieściło. Podkład zmienia się zresztą rzadko — przy
 * przywracaniu zostaje bieżący (`doPrzywrocenia`).
 *
 * Moduł czysty względem przeglądarki — magazyn wstrzykujemy, jak w `projektyLokalne`.
 */

export interface WersjaProjektu {
  id: string;
  nazwa: string;
  /** Znacznik czasu utworzenia. */
  utworzona: number;
  /** Migawka danych projektu bez podkładów (`bgImages` puste). */
  payload: ProjectPayload;
}

/** Ile migawek trzymamy na projekt — najstarsze odpadają. */
export const MAKS_WERSJI = 20;

export function kluczWersji(projektId: string): string {
  return `pomocnikelektryka_wersje_${projektId}`;
}

/** Lista migawek, od najnowszej. Uszkodzony zapis daje pustą listę, nie wyjątek. */
export function czytajWersje(magazyn: Magazyn, projektId: string): WersjaProjektu[] {
  let surowe: unknown;
  try {
    surowe = JSON.parse(magazyn.getItem(kluczWersji(projektId)) ?? "[]");
  } catch {
    return [];
  }
  if (!Array.isArray(surowe)) return [];
  return surowe
    .filter((w): w is Record<string, unknown> => typeof w === "object" && w !== null)
    .filter((w) => typeof w.id === "string" && typeof w.payload === "object" && w.payload !== null)
    .map((w) => ({
      id: w.id as string,
      nazwa: typeof w.nazwa === "string" && w.nazwa.trim() ? w.nazwa : "Wersja bez nazwy",
      utworzona: typeof w.utworzona === "number" ? w.utworzona : 0,
      payload: w.payload as ProjectPayload,
    }))
    .sort((a, b) => b.utworzona - a.utworzona);
}

export type WynikZapisuWersji = { ok: true; wersje: WersjaProjektu[] } | { ok: false; powod: string };

/**
 * Dokłada migawkę na początek listy. Przy braku miejsca w przeglądarce oddaje powód
 * zamiast rzucać — przycisk „Zapisz wersję" nie może wywrócić edytora.
 */
export function zapiszWersje(
  magazyn: Magazyn,
  projektId: string,
  nazwa: string,
  payload: ProjectPayload,
  teraz: number = Date.now(),
  noweId: () => string = () => crypto.randomUUID()
): WynikZapisuWersji {
  const nowa: WersjaProjektu = {
    id: noweId(),
    nazwa: nazwa.trim() || nazwaDomyslna(teraz),
    utworzona: teraz,
    payload: { ...payload, bgImages: {} },
  };
  const wersje = [nowa, ...czytajWersje(magazyn, projektId)].slice(0, MAKS_WERSJI);
  try {
    magazyn.setItem(kluczWersji(projektId), JSON.stringify(wersje));
  } catch {
    return {
      ok: false,
      powod: "Brak miejsca w pamięci przeglądarki. Usuń starsze wersje albo zapisz kopię projektu do pliku.",
    };
  }
  return { ok: true, wersje };
}

export function usunWersje(magazyn: Magazyn, projektId: string, id: string): WersjaProjektu[] {
  const zostaja = czytajWersje(magazyn, projektId).filter((w) => w.id !== id);
  if (zostaja.length) magazyn.setItem(kluczWersji(projektId), JSON.stringify(zostaja));
  else magazyn.removeItem(kluczWersji(projektId));
  return zostaja;
}

/**
 * Dane do wczytania przy przywracaniu: migawka plus BIEŻĄCE podkłady tych kondygnacji,
 * które w migawce istnieją. Migawka podkładów nie ma (patrz nagłówek), a przywrócenie
 * nie powinno zabierać rzutu, na którym się rysuje.
 */
export function doPrzywrocenia(wersja: WersjaProjektu, biezacePodklady: Record<string, string>): ProjectPayload {
  const pietra = new Set((wersja.payload.floors ?? []).map((f) => f.id));
  const podklady = Object.fromEntries(Object.entries(biezacePodklady).filter(([id]) => pietra.has(id)));
  return { ...wersja.payload, bgImages: podklady };
}

/** „Wersja z 7.11.2026, 14:05". */
export function nazwaDomyslna(teraz: number): string {
  const d = new Date(teraz);
  const dwie = (n: number) => String(n).padStart(2, "0");
  return `Wersja z ${d.getDate()}.${dwie(d.getMonth() + 1)}.${d.getFullYear()}, ${dwie(d.getHours())}:${dwie(d.getMinutes())}`;
}
