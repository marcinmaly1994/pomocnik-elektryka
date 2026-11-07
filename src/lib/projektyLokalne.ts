import { LIMIT_ZAPISOW } from "./dokumenty";

/**
 * Lista projektów trzymanych W TEJ PRZEGLĄDARCE.
 *
 * Do tej pory projekt lokalny był dokładnie jeden: autozapis siedział pod jednym
 * stałym kluczem, a „Moje projekty" czytało wyłącznie z chmury. Kto nie zakładał
 * konta, ten przy drugim mieszkaniu musiał nadpisać pierwsze — i „Nowy projekt"
 * uczciwie o tym uprzedzał, co nie zmienia faktu, że praca przepadała.
 *
 * Rozmiar nie jest tu przeszkodą, wbrew pierwszemu wrażeniu: zmierzony projekt bez
 * podkładu waży ~9 kB, więc pięć takich to nadal ułamek budżetu. Cały budżet ~5 MB
 * potrafi natomiast zająć JEDEN podkład rzutu ze zdjęcia (4000 × 2800 to ok. 4,8 MB —
 * patrz `kodowaniePodkladu.ts`). Dlatego limit jest liczbowy i wspólny z chmurą,
 * a o brak miejsca dba istniejąca degradacja zapisu („Zapisano bez podkładu",
 * patrz `wykonajAutozapis` w store).
 *
 * Moduł jest CZYSTY względem przeglądarki — magazyn wstrzykujemy — żeby cała ta
 * logika dała się przetestować bez DOM-u i bez udawania `localStorage`.
 */

export interface WpisProjektu {
  id: string;
  nazwa: string;
  /** Znacznik czasu ostatniej zmiany — do sortowania listy i pokazania „kiedy". */
  zmieniony: number;
}

/** Tyle z `localStorage`, ile ten moduł naprawdę potrzebuje. */
export interface Magazyn {
  getItem(klucz: string): string | null;
  setItem(klucz: string, wartosc: string): void;
  removeItem(klucz: string): void;
}

export const KLUCZ_INDEKSU = "pomocnikelektryka_projekty";
export const KLUCZ_BIEZACEGO = "pomocnikelektryka_projekt_biezacy";
/** Klucz sprzed wprowadzenia listy. Zostaje w kodzie WYŁĄCZNIE dla migracji. */
export const KLUCZ_STAREGO_AUTOZAPISU = "pomocnikelektryka_projekt_autosave";

const NAZWA_ZASTEPCZA = "Projekt bez nazwy";

export function kluczProjektu(id: string): string {
  return `pomocnikelektryka_projekt_${id}`;
}

/**
 * Lista projektów, odporna na wszystko, co mogło trafić pod ten klucz.
 *
 * Zawartość `localStorage` to dane z zewnątrz: przeżyła aktualizacje aplikacji, tryb
 * prywatny i cudze rozszerzenia do przeglądarki. Wyjątek przy odczycie zabiłby całą
 * powłokę aplikacji przy starcie — nie tylko listę — więc każdy nieoczekiwany kształt
 * kończy się pustą listą, a nie rzuceniem.
 */
export function czytajIndeks(magazyn: Magazyn): WpisProjektu[] {
  let surowe: unknown;
  try {
    surowe = JSON.parse(magazyn.getItem(KLUCZ_INDEKSU) ?? "[]");
  } catch {
    return [];
  }
  if (!Array.isArray(surowe)) return [];

  return surowe
    .filter((w): w is Record<string, unknown> => typeof w === "object" && w !== null)
    .filter((w) => typeof w.id === "string" && w.id !== "")
    .map((w) => ({
      id: w.id as string,
      // Pozycja bez podpisu jest na liście nie do kliknięcia — lepiej nazwa zastępcza
      // niż pusty wiersz, o którym użytkownik nie wie, co zawiera.
      nazwa: typeof w.nazwa === "string" && w.nazwa.trim() ? w.nazwa : NAZWA_ZASTEPCZA,
      zmieniony: typeof w.zmieniony === "number" ? w.zmieniony : 0,
    }));
}

export function zapiszIndeks(magazyn: Magazyn, wpisy: WpisProjektu[]): void {
  magazyn.setItem(KLUCZ_INDEKSU, JSON.stringify(wpisy));
}

export function biezacyId(magazyn: Magazyn): string | null {
  const id = magazyn.getItem(KLUCZ_BIEZACEGO);
  return id && id.trim() ? id : null;
}

export function ustawBiezacy(magazyn: Magazyn, id: string): void {
  magazyn.setItem(KLUCZ_BIEZACEGO, id);
}

/** Czy zmieści się jeszcze jeden projekt. Limit wspólny z chmurą — jedna liczba
 *  dla obu list, żeby nie trzeba było pamiętać dwóch. */
export function czyJestMiejsce(wpisy: WpisProjektu[]): boolean {
  return wpisy.length < LIMIT_ZAPISOW;
}

/** Kasuje wpis RAZEM z treścią. Osierocona treść zajmowałaby budżet pamięci
 *  w nieskończoność, a budżet jest tu wąskim gardłem. */
export function usunProjekt(magazyn: Magazyn, id: string): WpisProjektu[] {
  const zostalo = czytajIndeks(magazyn).filter((w) => w.id !== id);
  zapiszIndeks(magazyn, zostalo);
  magazyn.removeItem(kluczProjektu(id));
  // Razem z projektem jego historia wersji (F15) — patrz `wersjeProjektu.ts`. Klucz
  // wpisany wprost, bo tamten moduł importuje stąd `Magazyn`.
  magazyn.removeItem(`pomocnikelektryka_wersje_${id}`);
  if (biezacyId(magazyn) === id) magazyn.removeItem(KLUCZ_BIEZACEGO);
  return zostalo;
}

/** Klucz, pod który odkładamy zapis, którego nie dało się wczytać. */
export function kluczUszkodzonego(id: string): string {
  return `pomocnikelektryka_uszkodzony_${id}`;
}

export interface OdlozonyZapis {
  nazwa: string;
  klucz: string;
}

/**
 * Odkłada na bok zapis projektu, który nie daje się wczytać, i zdejmuje go z listy.
 *
 * Nie kasuje treści — przenosi ją pod osobny klucz. Gdyby uszkodzony slot zostawić
 * na liście, pierwszy autozapis nadpisałby go pustym projektem i surowe dane
 * przepadłyby bez śladu; gdyby go wczytywać dalej, każdy start kończyłby się białym
 * ekranem, także w Kalkulatorach, które z projektu w ogóle nie korzystają.
 * Odłożona kopia zostaje do pobrania (komunikat po starcie), bo bywa naprawialna ręcznie.
 *
 * Gdy zabraknie miejsca na kopię (`setItem` rzuca przy pełnym magazynie), slot zostaje
 * nietknięty i na liście, a zdejmujemy tylko wskaźnik bieżącego — autozapis założy
 * wtedy nowy slot, zamiast nadpisać ten. Lepiej nie otworzyć projektu, niż go zniszczyć.
 */
export function odlozUszkodzony(magazyn: Magazyn, id: string): OdlozonyZapis | null {
  const raw = magazyn.getItem(kluczProjektu(id));
  const nazwa = czytajIndeks(magazyn).find((w) => w.id === id)?.nazwa ?? NAZWA_ZASTEPCZA;
  const klucz = kluczUszkodzonego(id);
  if (raw !== null) {
    try {
      magazyn.setItem(klucz, raw);
    } catch {
      if (biezacyId(magazyn) === id) magazyn.removeItem(KLUCZ_BIEZACEGO);
      return null;
    }
  }
  usunProjekt(magazyn, id);
  return { nazwa, klucz };
}

/**
 * Przenosi projekt sprzed wprowadzenia listy na listę.
 *
 * Najważniejsza funkcja w tym module. Użytkownik ma w przeglądarce projekt zapisany
 * pod starym kluczem; aktualizacja aplikacji nie ma prawa go zgubić — a zgubiłaby,
 * gdyby nowa lista po prostu zaczęła czytać z innego miejsca.
 *
 * Uruchamiana przy każdym starcie i BEZPIECZNA do powtarzania: gdy lista już istnieje,
 * nie rusza niczego. Zwraca id nowego wpisu albo `null`, gdy nie było czego migrować.
 */
export function migrujStaryAutozapis(magazyn: Magazyn): string | null {
  if (czytajIndeks(magazyn).length > 0) return null;
  const stary = magazyn.getItem(KLUCZ_STAREGO_AUTOZAPISU);
  if (stary === null) return null;

  // Nazwę bierzemy z treści, ale jej BRAK nie może zatrzymać migracji: uszkodzony
  // zapis to i tak lepszy materiał na wpis z nazwą zastępczą niż na zniknięcie.
  let nazwa = NAZWA_ZASTEPCZA;
  try {
    const dane = JSON.parse(stary) as { projectName?: unknown };
    if (typeof dane.projectName === "string" && dane.projectName.trim()) nazwa = dane.projectName;
  } catch {
    // zostaje nazwa zastępcza
  }

  const id = nowyId();
  magazyn.setItem(kluczProjektu(id), stary);
  zapiszIndeks(magazyn, [{ id, nazwa, zmieniony: Date.now() }]);
  ustawBiezacy(magazyn, id);
  // Stary klucz ZOSTAJE nietknięty. Kasowanie go tutaj oznaczałoby, że powrót do
  // poprzedniej wersji aplikacji (albo otwarcie jej w drugiej karcie w trakcie
  // wdrożenia) zastaje pustkę. Miejsce odzyska pierwszy zapis pod nowym kluczem.
  return id;
}

/** Identyfikator projektu. `crypto.randomUUID` bywa niedostępne poza HTTPS
 *  i w starszych przeglądarkach, więc z zapasowym wariantem. */
export function nowyId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
