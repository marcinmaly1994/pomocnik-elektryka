import { create } from "zustand";
import { domyslnyNaglowek } from "@/lib/docHeader";
import {
  biezacyId,
  czytajIndeks,
  kluczProjektu,
  migrujStaryAutozapis,
  nowyId,
  ustawBiezacy,
  zapiszIndeks,
  usunProjekt,
  type WpisProjektu,
} from "@/lib/projektyLokalne";
import { WARUNKI_DOBORU_DOMYSLNE, type WarunkiDoboru } from "@/lib/panel/norms";
import type { ProjectSizingOptions } from "@/lib/panel/project";
import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import type {
  InstallationElement,
  Wall,
  RoomShape,
  RoomType,
  Opening,
  Floor,
  DocumentHeader,
  PriceTable,
  Point,
  ProtocolKey,
  PanelConfig,
  PanelDevice,
} from "@/types";
import {
  DEFAULT_PLAN_SIZE,
  nextRoomColor,
  nextRoomName,
  reassignRoomsOnFloor,
  reconcileRoomsOnLoad,
  roomColorForIndex,
  scaleOf,
  type PlanSize,
} from "@/lib/design";
import { DEFAULT_PRICES, type CostOverrides, type QtyOverrides } from "@/lib/costs";
import { INITIAL_ONBOARDING, type OnboardingState } from "@/lib/onboarding";
import type { ProtocolRow } from "@/lib/protocols";
import { decyzjaZapisu, type RodzajDokumentu } from "@/lib/dokumenty";
import {
  SUPABASE_CONFIGURED,
  sesjaZOdpowiedzi,
  supaGetProject,
  supaInsertProject,
  supaListProjects,
  supaRefresh,
  supaUpdateProject,
  wymagaOdswiezenia,
  type Session,
} from "@/lib/supabase";

/** Jeden komunikat dla wszystkich ścieżek wygaśnięcia — użytkownik ma zobaczyć
 *  to samo niezależnie od tego, czy odświeżenie się nie powiodło, czy nie było czym. */
const SESJA_WYGASLA = "Sesja wygasła — zaloguj się ponownie, żeby zapisywać w chmurze.";

const SESSION_KEY = "pomocnikelektryka_sesja";
/** Osobny klucz od sesji logowania — to jest sam PROJEKT (plan, ceny, protokoły…),
 *  zapisywany automatycznie, żeby zamknięcie karty bez konta w chmurze nie kasowało
 *  godziny pracy nad planem. Patrz `initLocalAutosave` na dole pliku. */


/** Ostatnia migawka projektu, o której WIEMY, że jest w chmurze — ustawiana
 *  zarówno po udanym zapisie, jak i po wczytaniu projektu z chmury. Trzymana
 *  poza store'em (jak `lastAutosavedJson` niżej), żeby porównanie z bieżącym
 *  stanem nie wymagało osobnego zapisu do store'a przy każdej zmianie. */
let lastCloudSavedJson: string | null = null;

/** Nazwa, pod którą projekt trafił ostatnio do chmury. Zmiana nazwy musi wymusić
 *  ponowne sprawdzenie kolizji — patrz `saveToCloud`. */
let ostatniaZapisanaNazwa: string | null = null;

/**
 * `updated_at` wiersza w chmurze, o którym WIEMY — z ostatniego zapisu albo wczytania.
 *
 * To jest cała pamięć potrzebna do optimistic lockingu: zapis idzie z warunkiem „nadpisz
 * tylko, jeśli w bazie stoi dokładnie ta wartość" (patrz `supaUpdateProject`). Bez tego
 * dwa urządzenia z otwartym tym samym projektem po prostu kasowały sobie pracę
 * nawzajem — autozapis chodzi co 2,5 s, więc przegrywał ten, kto akurat zapisał
 * wcześniej, i nie dowiadywał się o tym nigdy.
 *
 * `null` znaczy „nie wiemy" (np. projekt jeszcze nietrafiony do chmury) i wtedy zapis
 * idzie bez warunku — tak jak dotąd.
 */
let znaneUpdatedAt: string | null = null;

/** To samo dla ZESTAWU PROTOKOLOW — osobny wiersz w tej samej tabeli, wiec i osobny
 *  znacznik. Protokoly zapisuja sie tylko na klikniecie, wiec okno na kolizje jest
 *  mniejsze niz przy autozapisie projektu, ale kolizja konczy sie tak samo: cudza
 *  praca znika bez sladu. */
let znaneUpdatedAtProtokoly: string | null = null;

function loadStoredSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

/**
 * Projekt do otwarcia przy starcie — z listy projektów lokalnych.
 *
 * Kolejność ma znaczenie i nie jest dowolna:
 *  1. MIGRACJA. Kto miał projekt pod starym, pojedynczym kluczem, dostaje go jako
 *     pierwszy wpis listy. Bez tego aktualizacja aplikacji zastałaby pustkę.
 *  2. Bieżący, a gdy go nie ma — pierwszy z listy. Wskaźnik bieżącego mógł zniknąć
 *     (czyszczenie danych, druga karta), a lista wtedy i tak wie, co otworzyć.
 *
 * Cały odczyt w jednym `try`: zawartość `localStorage` to dane z zewnątrz, a wyjątek
 * przy starcie zabiłby powłokę aplikacji, zanim cokolwiek się pokaże.
 */
function loadAutosavedProject(): ProjectPayload | null {
  try {
    migrujStaryAutozapis(localStorage);
    const id = biezacyId(localStorage) ?? czytajIndeks(localStorage)[0]?.id ?? null;
    if (!id) return null;
    ustawBiezacy(localStorage, id);
    const raw = localStorage.getItem(kluczProjektu(id));
    return raw ? (JSON.parse(raw) as ProjectPayload) : null;
  } catch {
    return null;
  }
}

/**
 * Klucz, pod który idzie autozapis — czyli slot PROJEKTU AKTUALNIE OTWARTEGO.
 *
 * Zakłada slot, jeśli jeszcze nie istnieje (pierwsze uruchomienie w czystej
 * przeglądarce). Dzięki temu wywołujący nie musi wiedzieć, czy lista już jest.
 */
function kluczAutozapisu(): string {
  let id = biezacyId(localStorage);
  if (!id) {
    id = nowyId();
    ustawBiezacy(localStorage, id);
    zapiszIndeks(localStorage, [
      ...czytajIndeks(localStorage),
      { id, nazwa: useProjectStore.getState().projectName, zmieniony: Date.now() },
    ]);
  }
  return kluczProjektu(id);
}

/**
 * Odświeża wpis na liście po udanym zapisie: nazwę i czas zmiany.
 *
 * Bez tego lista pokazywałaby nazwę sprzed zmiany i „nigdy nie zmieniany" — czyli
 * kłamałaby akurat w dwóch polach, po których użytkownik rozpoznaje, który projekt
 * jest który. Błędy połykane: to kosmetyka listy, nie zapis pracy, więc nie ma prawa
 * wywrócić autozapisu, który właśnie się udał.
 */
/**
 * Przestawia wskaźnik bieżącego projektu na NOWY, pusty slot i dokłada go do listy.
 *
 * Wywoływana z `resetProject` PO domknięciu zapisu poprzedniego projektu. Zeruje też
 * `lastAutosavedJson`, bo to ono decyduje, czy autozapis w ogóle coś zrobi: bez
 * wyzerowania pusty projekt różniłby się od bufora i zapis by przeszedł, ale przy
 * powrocie do projektu o identycznej treści już nie — a wtedy nowy slot zostałby
 * pusty na dysku mimo widocznej pracy na ekranie.
 */
function przelaczNaNowyProjektLokalny(): void {
  try {
    const id = nowyId();
    ustawBiezacy(localStorage, id);
    zapiszIndeks(localStorage, [...czytajIndeks(localStorage), { id, nazwa: "Mój dom", zmieniony: Date.now() }]);
  } catch {
    // Brak dostępu do pamięci (tryb prywatny) nie może zablokować założenia nowego
    // projektu — praca w tej karcie ma działać także wtedy, gdy nic się nie zapisuje.
  }
  lastAutosavedJson = null;
}

function odswiezWpisIndeksu(): void {
  try {
    const id = biezacyId(localStorage);
    if (!id) return;
    const nazwa = useProjectStore.getState().projectName;
    const wpisy = czytajIndeks(localStorage);
    const i = wpisy.findIndex((w) => w.id === id);
    const wpis = { id, nazwa, zmieniony: Date.now() };
    if (i >= 0) wpisy[i] = wpis;
    else wpisy.push(wpis);
    zapiszIndeks(localStorage, wpisy);
  } catch {
    // patrz komentarz w opisie
  }
}

export interface ProtocolState {
  rows: ProtocolRow[];
  limit?: number;
}

/** Dane projektu do zapisu lokalnego/w chmurze — patrz `getProjectPayload`/`loadProjectPayload`. */
export interface ProjectPayload {
  draft: Draft;
  /** Warunki doboru — patrz `WarunkiDoboru`. Zapisy sprzed ich wprowadzenia tego pola
   *  nie mają i dostają wartości domyślne, czyli dokładnie to, co dobór zakładał
   *  dotąd milcząco. */
  warunkiDoboru?: WarunkiDoboru;
  floors: Floor[];
  activeFloorId: string;
  bgImages: Record<string, string>;
  scales: Record<string, number>;
  prices: PriceTable;
  /** Recznie wpisane WARTOSCI pozycji kosztorysu [zl netto] — patrz `CostOverrides`. */
  costOverrides: CostOverrides;
  /** Recznie poprawione ILOSCI pozycji kosztorysu — patrz `QtyOverrides`. */
  qtyOverrides: QtyOverrides;
  docHeader: DocumentHeader;
  protocols: Partial<Record<ProtocolKey, ProtocolState>>;
  projectName: string;
  panelConfig: PanelConfig;
  /**
   * Stan rozdzielnicy: aparaty, ukryte pozycje auto-generowane i tryb pracy.
   *
   * Wcześniej lista aparatów żyła WYŁĄCZNIE w stanie komponentu `PanelTab`, więc
   * ręcznie dołożone aparaty, skasowane pozycje i kolejność na szynie przepadały przy
   * każdym odświeżeniu i nie trafiały do zapisu projektu. Schemat jednokreskowy budował
   * sobie przy tym własną listę z obwodów, więc oba widoki potrafiły pokazywać co
   * innego. Trzymanie tego w projekcie naprawia jedno i drugie, a przy okazji jest
   * warunkiem koniecznym trybu ręcznego — rozdzielnica bez rzutu nie miałaby się
   * z czego odtworzyć.
   */
  panelDevices: PanelDevice[];
  /** `key` aparatów auto-generowanych, które użytkownik skasował — żeby nie wracały
   *  przy każdym przeliczeniu z rzutu. */
  panelHidden: string[];
  /**
   * `zRzutu` — aparaty wynikają z obwodów policzonych z planu i odświeżają się przy
   * jego zmianie. `reczny` — rozdzielnicę składa użytkownik i NIC jej nie nadpisuje.
   *
   * Tryb ręczny istnieje, bo dobór rozdzielnicy to częste zadanie samo w sobie:
   * wymiana tablicy w istniejącym budynku albo wycena nie wymagają rysowania rzutu.
   */
  panelTryb: "zRzutu" | "reczny";
  /**
   * Ręczne poprawki aparatów AUTO-GENEROWANYCH, kluczowane ich `key`.
   *
   * Aparat wynikający z obwodu jest odtwarzany przy każdej zmianie planu — a plan
   * zmienia się po każdym postawionym elemencie. Gdyby edycja szła wprost w listę,
   * poprawiona nastawa albo opis znikałyby po chwili bez śladu. Nadpisania przeżywają
   * odbudowę i są nakładane na świeżo policzony aparat; kasuje je dopiero świadome
   * „Odbuduj z rzutu". Aparaty dodane ręcznie nie potrzebują tego mechanizmu — nic ich
   * nie odtwarza, więc edytuje się je wprost.
   */
  panelOverrides: Record<string, Partial<PanelDevice>>;
  planSize: PlanSize;
  /** Postęp onboardingu „Zacznij w 3 krokach" — per projekt, żeby po powrocie
   *  do zapisanego projektu przewodnik się nie powtarzał. */
  onboarding: OnboardingState;
  /**
   * To jest PROJEKT PRZYKŁADOWY wczytany z „Zobacz gotowy przykład" na ekranie
   * startowym (patrz `zbudujProjektPrzykladowy` w lib/demo/mieszkanie.ts), a nie praca
   * użytkownika.
   *
   * Musi żyć w zapisywanym stanie, nie w stanie komponentu: przykład jest normalnym
   * projektem w store'rze, więc przeżywa przełączanie zakładek i odświeżenie strony
   * przez autozapis — a pasek „To jest przykład" ma zostać z nim przez cały ten czas.
   * Inaczej po powrocie z Kosztorysu albo po F5 cudzy dom wyglądałby na własny.
   *
   * Gaśnie dopiero przy „Nowy projekt" (`resetProject`) i przy wczytaniu czegokolwiek
   * innego, bo `loadProjectPayload` bierze wartość z wczytywanej migawki — a żaden
   * projekt użytkownika jej nie ma.
   *
   * Opcjonalna, jak `otwartyRecznie` czy `rysowanieBezPodkladu` — zapisy sprzed tej
   * zmiany jej nie mają i mają być traktowane jak to, czym są: własną pracą.
   */
  projektPrzykladowy?: boolean;
}

/**
 * Migracja z wersji JS: `DesignTab` przyjmował dotychczas ~30 osobnych propsów
 * (elements, walls, roomShapes, setDraft, commitSnapshot, undo, redo, canUndo,
 * canRedo, floors, setFloors, activeFloor, setActiveFloor, bgImages, ...).
 * To nie skaluje się wraz z rozwojem aplikacji i utrudnia śledzenie, co faktycznie
 * zmienia dany fragment kodu. Zustand pozwala komponentom pobierać tylko to,
 * czego potrzebują (przez selektory), bez przekazywania tego przez cały drzewo.
 */

interface Draft {
  elements: InstallationElement[];
  walls: Wall[];
  roomShapes: RoomShape[];
  openings: Opening[];
  /**
   * Ręczne poprawki tras przewodów, kluczowane `CableRoute.id` (id elementu dla
   * zasilania, `"${łącznikId}->${oprawaId}"` dla sterowania — patrz `buildCableRoutes`
   * w loads.ts). Trzymają WYŁĄCZNIE środkowe punkty (załamania) narysowane ręcznie
   * przez użytkownika, BEZ pierwszego/ostatniego punktu trasy — te zawsze biorą się
   * z aktualnej pozycji rozdzielnicy/łącznika i punktu/oprawy, żeby przesunięcie
   * elementu nie gubiło ręcznie ułożonych zagięć (patrz `applyRouteOverrides`).
   */
  routeOverrides: Record<string, Point[]>;
}

const emptyDraft: Draft = { elements: [], walls: [], roomShapes: [], openings: [], routeOverrides: {} };

/** Usuwa poprawki tras, których id odwołuje się do elementu, którego już nie ma
 *  (element skasowany albo cała kondygnacja usunięta) — inaczej `routeOverrides`
 *  rosłoby w nieskończoność martwymi wpisami, które nigdy nie trafią w żadną trasę.
 *  Id trasy zasilania to id JEDNEGO elementu; id trasy sterowania to dwa id
 *  rozdzielone `"->"` (łącznik i oprawa) — działa dla obu, bo sprawdza KAŻDĄ część. */
function pruneRouteOverrides(overrides: Record<string, Point[]>, elements: InstallationElement[]): Record<string, Point[]> {
  const ids = new Set(elements.map((e) => e.id));
  const out: Record<string, Point[]> = {};
  Object.entries(overrides).forEach(([routeId, pts]) => {
    if (routeId.split("->").every((id) => ids.has(id))) out[routeId] = pts;
  });
  return out;
}

/** Migawka do historii cofnij/ponów rozdzielnicy — trzy pola, które razem opisują to,
 *  co użytkownik faktycznie edytuje ręcznie. Bez `panelTryb`/`panelConfig`: zmiana
 *  trybu albo zasilania to przełącznik, nie edycja do cofnięcia. */
interface PanelSnapshot {
  devices: PanelDevice[];
  hidden: string[];
  overrides: Record<string, Partial<PanelDevice>>;
}

interface ProjectState {
  warunkiDoboru: WarunkiDoboru;
  /** Zmienia pojedyncze warunki doboru, zostawiając resztę bez zmian. */
  setWarunkiDoboru: (patch: Partial<WarunkiDoboru>) => void;
  draft: Draft;
  floors: Floor[];
  activeFloorId: string;
  bgImages: Record<string, string>;
  /** Metrów na jednostkę planu, per kondygnacja — brak wpisu = brak kalibracji. */
  scales: Record<string, number>;
  prices: PriceTable;
  /** Recznie wpisane WARTOSCI pozycji kosztorysu [zl netto] — patrz `CostOverrides`. */
  costOverrides: CostOverrides;
  /** Recznie poprawione ILOSCI pozycji kosztorysu — patrz `QtyOverrides`. */
  qtyOverrides: QtyOverrides;
  docHeader: DocumentHeader;
  projectName: string;
  protocols: Partial<Record<ProtocolKey, ProtocolState>>;
  /** Zasilanie/rozłącznik główny rozdzielnicy — współdzielone przez widok
   *  Rozdzielnicy i wygenerowany z niej Schemat jednokreskowy (ten sam
   *  `buildPanelDevices`), żeby oba widoki zawsze się zgadzały. */
  panelConfig: PanelConfig;
  panelDevices: PanelDevice[];
  panelHidden: string[];
  panelTryb: "zRzutu" | "reczny";
  panelOverrides: Record<string, Partial<PanelDevice>>;
  /** Obszar roboczy planu w jednostkach logicznych. Zapisywany w projekcie, bo
   *  dopasowuje się do proporcji wgranego rzutu — patrz planSizeForImage. */
  planSize: PlanSize;
  onboarding: OnboardingState;
  /** Bieżący projekt to wczytany PRZYKŁAD, a nie praca użytkownika — patrz pole
   *  o tej samej nazwie w `ProjectPayload`. */
  projektPrzykladowy: boolean;
  /** Wczytuje gotowy projekt przykładowy (lib/demo/mieszkanie.ts). Osobno od
   *  `loadProjectPayload`, bo sam sięga po dane — komponent nie musi ich znać,
   *  a moduł z przykładem dociąga się dopiero na kliknięcie (dynamiczny `import()`). */
  wczytajPrzyklad: () => Promise<void>;

  /**
   * Ile elementów dostało poprawione przypisanie do pomieszczenia przy ostatnim
   * wczytaniu projektu (patrz `reconcileRoomsOnLoad`) — 0, gdy zapis był spójny.
   *
   * Stan ULOTNY, świadomie poza `ProjectPayload`: to nie jest własność projektu,
   * tylko wynik jednego wczytania, i po odświeżeniu strony na poprawionych już
   * danych ma wyjść zero. Zakładka Instalacja robi z tego jednorazowy komunikat,
   * żeby remont zapisu nie odbywał się po cichu.
   */
  roomsFixedOnLoad: number;
  /** Zamyka komunikat o poprawionych przypisaniach — użytkownik go przyjął. */
  dismissRoomsFixedOnLoad: () => void;

  /** Sesja Supabase (konto + zapis w chmurze) — `null`, gdy niezalogowany lub
   *  backend nieskonfigurowany. Utrzymywana też w localStorage, żeby przetrwać
   *  odświeżenie strony. */
  session: Session | null;
  /** Id projektu w chmurze, jeśli bieżący projekt był już tam zapisany. */
  cloudId: string | null;
  /** Znacznik czasu (ms epoch) ostatniego automatycznego zapisu lokalnego —
   *  zasila wskaźnik „Zapisano lokalnie” w nagłówku. `null`, dopóki w tej karcie
   *  jeszcze nic nie zapisano. Ustawiane wyłącznie przez autosave niżej w pliku. */
  lastLocalSaveAt: number | null;
  /**
   * Co poszło nie tak z ostatnim zapisem lokalnym. `null`, gdy wszystko się zapisało.
   *
   * Przeglądarka daje na `localStorage` około 5 MB na całą aplikację, a podkład rzutu
   * potrafi zająć prawie tyle sam (zmierzone: zdjęcie 4000 × 2800 to 4,8 MB jako data
   * URL). Po przekroczeniu limitu `setItem` rzuca wyjątkiem — i dotąd był on po cichu
   * połykany: wskaźnik pokazywał godzinę OSTATNIEGO UDANEGO zapisu i po prostu
   * przestawał się zmieniać, a użytkownik zamykał kartę w przekonaniu, że praca jest
   * zapisana. To ten sam rodzaj cichej straty, co nadpisywanie cudzych zmian w chmurze
   * (patrz `konfliktChmury`) — tyle że dotyczy wszystkich, bo lokalny zapis nie wymaga
   * konta.
   *
   * „bezPodkladu" to stan pośredni: sam rysunek się zapisał, nie zmieścił się podkład.
   * Rysunek jest cenniejszy — powstawał godzinami, a podkład wgrywa się z pliku
   * w dziesięć sekund — więc ratujemy to, co da się uratować, i mówimy o tym wprost.
   */
  localSaveError: "bezPodkladu" | "brak" | null;
  /** To samo co `lastLocalSaveAt`, ale dla zapisu W CHMURZE — value-add
   *  zarezerwowany dla konta: zalogowani nie muszą pamiętać o ręcznym „Zapisz”,
   *  bo `saveToCloud` odpala się automatycznie po każdej zmianie (patrz autosave
   *  w chmurze niżej w pliku). `null`, dopóki nic jeszcze nie trafiło do chmury. */
  lastCloudSaveAt: number | null;
  /** Komunikat błędu ostatniej próby zapisu/wczytania w chmurze — `null`, gdy
   *  wszystko w porządku. Osobne od lokalnego zapisu, bo sieć zawodzi inaczej
   *  (i częściej) niż localStorage. */
  cloudSaveError: string | null;
  /** Zapis/wczytanie w toku — do spinnera przy wskaźniku chmury. */
  cloudBusy: boolean;

  /**
   * Zestaw protokołów jest OSOBNYM dokumentem na koncie, niezależnym od projektu
   * instalacji: pomiary pięcioletnie wykonuje się w obiektach, których się nie
   * projektowało, więc wiązanie ich z planem zmuszałoby do zakładania pustych
   * projektów. Stąd własne id i nazwa, obok `cloudId` projektu.
   */
  protokolyId: string | null;
  protokolyNazwa: string;
  /** Komunikat o przekroczonym limicie zapisów — osobno od `cloudSaveError`, bo to
   *  nie awaria, tylko decyzja do podjęcia przez użytkownika (co usunąć). */
  limitBlokada: { rodzaj: RodzajDokumentu; komunikat: string } | null;
  /** Autozapis w chmurze wstrzymany, bo trafił na limit. Bez tej flagi próbowałby
   *  co 2,5 s i za każdym razem zgłaszał ten sam błąd. Zdejmowana po udanym zapisie
   *  oraz przy ręcznej próbie, którą użytkownik podejmuje po zrobieniu miejsca. */
  autozapisWstrzymany: boolean;
  /**
   * Pytanie „nadpisać istniejący dokument o tej nazwie?”.
   *
   * Ustawiane, gdy zapis trafia na CUDZY wpis o tej samej nazwie — czyli taki,
   * którego w tej sesji nie wczytaliśmy ani nie zapisaliśmy. Bez tego pytania
   * autozapis potrafiłby nadpisać gotowy projekt świeżo otwartą, pustą sesją
   * o tej samej nazwie, i to bez śladu. Nadpisanie dokumentu, który sami przed
   * chwilą zapisaliśmy, pytania nie wymaga — to zwykłe „zapisz zmiany”.
   */
  pytanieONadpisanie: { rodzaj: RodzajDokumentu; nazwa: string; id: string } | null;
  /**
   * Ktos zapisal ten sam projekt w miedzyczasie (inne urzadzenie, inna karta).
   * `null` = brak konfliktu. Rozstrzyga uzytkownik — patrz `saveToCloud`.
   */
  konfliktChmury: { rodzaj: RodzajDokumentu; id: string; nazwa: string } | null;

  // historia cofnij/ponów — ten sam mechanizm co useHistory() w wersji JS,
  // ale jako część store'a, więc undo/redo działa niezależnie od tego,
  // które komponenty są aktualnie zamontowane
  past: Draft[];
  future: Draft[];

  setDraft: (updater: (d: Draft) => Draft, opts?: { commit?: boolean }) => void;
  commitSnapshot: (snapshot: Draft) => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  resetProject: () => void;

  /** Projekty zapisane W TEJ PRZEGLĄDARCE, najświeższy pierwszy. */
  projektyLokalne: () => WpisProjektu[];
  /** Przełącza się na projekt z listy lokalnej, domykając zapis bieżącego. */
  otworzProjektLokalny: (id: string) => void;
  /** Kasuje projekt z listy lokalnej razem z jego treścią. Zwraca to, co zostało. */
  usunProjektLokalny: (id: string) => WpisProjektu[];

  /**
   * Osobna, mniejsza historia cofnij/ponów — WYŁĄCZNIE dla ręcznych zmian w
   * rozdzielnicy (kasowanie aparatu, przenoszenie na szynie, edycja, „Wyrównaj fazy",
   * „Odbuduj z rzutu"). Musi być osobna od `past`/`future` powyżej: te śledzą PLAN
   * (`draft`), a aparaty w trybie „z rzutu" przeliczają się automatycznie przy KAŻDEJ
   * zmianie planu — gdyby dzieliły jeden stos, każde postawione gniazdko zaśmiecałoby
   * historię rozdzielnicy nieistotnym stanem pośrednim, a „Cofnij” w Rozdzielnicy
   * cofałoby losowe przeliczenia zamiast ostatniej ręcznej decyzji użytkownika.
   * Dlatego migawka trafia na stos wyłącznie przez jawne wywołanie
   * `commitPanelSnapshot()` w miejscu, które faktycznie jest akcją użytkownika —
   * nie przy każdym zapisie `panelDevices`.
   */
  panelPast: PanelSnapshot[];
  panelFuture: PanelSnapshot[];
  commitPanelSnapshot: () => void;
  panelUndo: () => void;
  panelRedo: () => void;
  panelCanUndo: () => boolean;
  panelCanRedo: () => boolean;

  /** Migawka danych projektu do zapisu (lokalnie lub w chmurze) — celowo bez
   *  historii cofnij/ponów i sesji/cloudId, które są stanem sesji, nie projektu. */
  getProjectPayload: () => ProjectPayload;
  /** Wczytuje migawkę danych projektu (np. z chmury) i czyści historię
   *  cofnij/ponów — to nowy punkt startowy, nie krok do cofnięcia. */
  loadProjectPayload: (payload: ProjectPayload) => void;

  setActiveFloorId: (id: string) => void;
  addFloor: (name: string) => void;
  /** Wysokość kondygnacji [m]; `undefined` przywraca wartość typową. */
  setFloorHeight: (id: string, heightM: number | undefined) => void;
  /** Kopiuje kondygnację razem z geometrią i osprzętem — patrz implementacja. */
  duplicateFloor: (id: string, name: string) => void;
  removeFloor: (id: string) => void;

  setBgImage: (floorId: string, dataUrl: string | null) => void;
  setScale: (floorId: string, metersPerUnit: number) => void;
  clearScale: (floorId: string) => void;
  setPrice: (key: string, value: number) => void;
  /** Wpisuje wartosc pozycji kosztorysu recznie; `null` przywraca ilosc x cena. */
  setCostOverride: (key: string, value: number | null) => void;
  /** Poprawia ilosc pozycji kosztorysu; `null` przywraca oszacowanie z rzutu. */
  setQtyOverride: (key: string, value: number | null) => void;
  setPrices: (patch: Record<string, number>) => void;
  setDocHeader: (patch: Partial<DocumentHeader>) => void;
  setProjectName: (name: string) => void;
  setPanelConfig: (patch: Partial<PanelConfig>) => void;
  setPanelDevices: (devices: PanelDevice[]) => void;
  setPanelHidden: (keys: string[]) => void;
  setPanelTryb: (tryb: "zRzutu" | "reczny") => void;
  setPanelOverrides: (o: Record<string, Partial<PanelDevice>>) => void;
  setPlanSize: (size: PlanSize) => void;
  setOnboarding: (patch: Partial<OnboardingState>) => void;

  setProtocolState: (key: ProtocolKey, patch: Partial<ProtocolState>) => void;

  setSession: (session: Session | null) => void;
  setCloudId: (id: string | null) => void;
  /** Natychmiastowy zapis w chmurze (bez czekania na debounce autosave'u) — do
   *  przycisku „Zapisz teraz” w menu konta. Ten sam kod ścieżki, którym leci
   *  automatyczny zapis w tle, więc oba mają identyczne zachowanie i błędy. */
  saveToCloud: (opcje?: { reczny?: boolean; nadpiszId?: string }) => Promise<void>;
  /** Wczytuje projekt zapisany w chmurze pod danym id i ustawia go jako bieżący
   *  punkt startowy (czyści historię cofnij/ponów, jak `loadProjectPayload`). */
  loadFromCloud: (id: string) => Promise<void>;

  /** Zapisuje BIEŻĄCE protokoły jako osobny dokument na koncie. Przy pełnym limicie
   *  nie zapisuje nic i ustawia `limitBlokada` — decyzję, co usunąć, podejmuje
   *  użytkownik, a nie aplikacja. */
  /** Zwraca świeżą sesję (odświeżając token, jeśli trzeba) albo `null`, gdy trzeba
   *  zalogować się ponownie. Każda ścieżka sięgająca do chmury przechodzi tędy. */
  zapewnijSesje: () => Promise<Session | null>;
  /** Czy okno z listą zestawów protokołów jest otwarte. W store, bo otwiera je
   *  zarówno przycisk w zakładce, jak i menu przy profilu — jedno okno, dwa wejścia. */
  oknoZestawowOtwarte: boolean;
  setOknoZestawow: (open: boolean) => void;
  saveProtokolyToCloud: (nazwa: string, opcje?: { nadpiszId?: string }) => Promise<void>;
  /** Zamyka pytanie o nadpisanie bez zapisywania. */
  anulujNadpisanie: () => void;
  /** Zamyka okno konfliktu bez rozstrzygania — autozapis zostaje wstrzymany,
   *  zeby nie wrocil z tym samym pytaniem po 2,5 s. */
  odlozKonflikt: () => void;
  loadProtokolyFromCloud: (id: string) => Promise<void>;
  /** Zaczyna nowy, pusty zestaw protokołów — odpina bieżący od zapisu w chmurze. */
  nowyZestawProtokolow: () => void;
  setLimitBlokada: (b: { rodzaj: RodzajDokumentu; komunikat: string } | null) => void;

  addRoomShape: (floor: string, points: Point[], name?: string, type?: RoomType) => void;
  renameRoomShape: (id: string, newName: string) => void;
  setRoomShapeType: (id: string, type: RoomType) => void;
  /** Przesuwa JEDEN narożnik obrysu — do edycji kształtu przeciąganiem na planie. */
  moveRoomShapePoint: (id: string, index: number, point: Point) => void;
  recolorRoomShape: (id: string) => void;
  deleteRoomShape: (id: string) => void;
  removeElements: (ids: string[]) => void;

  /** Zapisuje/nadpisuje ręczną poprawkę trasy — patrz `Draft.routeOverrides`. */
  setRouteOverride: (routeId: string, midPoints: Point[]) => void;
  /** Kasuje poprawkę, trasa wraca do automatycznego routingu. */
  clearRouteOverride: (routeId: string) => void;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  draft: emptyDraft,
  floors: [{ id: "f1", name: "Parter" }],
  activeFloorId: "f1",
  bgImages: {},
  scales: {},
  prices: { ...DEFAULT_PRICES },
  costOverrides: {},
  qtyOverrides: {},
  projectName: "Mój dom",
  protocols: {},
  panelConfig: { supply3f: true, mainRating: 40, perRow: 12 },
  warunkiDoboru: WARUNKI_DOBORU_DOMYSLNE,
  panelDevices: [],
  panelHidden: [],
  panelTryb: "zRzutu",
  panelOverrides: {},
  planSize: DEFAULT_PLAN_SIZE,
  onboarding: INITIAL_ONBOARDING,
  projektPrzykladowy: false,
  roomsFixedOnLoad: 0,
  dismissRoomsFixedOnLoad: () => set({ roomsFixedOnLoad: 0 }),
  session: loadStoredSession(),
  cloudId: null,
  protokolyId: null,
  oknoZestawowOtwarte: false,
  autozapisWstrzymany: false,
  pytanieONadpisanie: null,
  konfliktChmury: null,
  protokolyNazwa: "",
  limitBlokada: null,
  lastLocalSaveAt: null,
  localSaveError: null,
  lastCloudSaveAt: null,
  cloudSaveError: null,
  cloudBusy: false,
  docHeader: domyslnyNaglowek(),

  past: [],
  future: [],
  panelPast: [],
  panelFuture: [],

  setDraft: (updater, opts) => {
    const commit = opts?.commit !== false;
    set((state) => {
      const next = updater(state.draft);
      return {
        draft: next,
        past: commit ? [...state.past, state.draft] : state.past,
        future: commit ? [] : state.future,
      };
    });
  },

  commitSnapshot: (snapshot) => {
    set((state) => ({ past: [...state.past, snapshot], future: [] }));
  },

  undo: () => {
    const { past, draft, future } = get();
    if (past.length === 0) return;
    const prev = past[past.length - 1];
    set({
      draft: prev,
      past: past.slice(0, -1),
      future: [draft, ...future],
    });
  },

  redo: () => {
    const { future, draft, past } = get();
    if (future.length === 0) return;
    const next = future[0];
    set({
      draft: next,
      future: future.slice(1),
      past: [...past, draft],
    });
  },

  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,

  // Rozróżnienie w `docHeader` jest celowe: dane WŁASNE elektryka (nazwisko,
  // uprawnienia, miernik, świadectwo wzorcowania) są takie same dla każdego zlecenia,
  // więc ich kasowanie przy każdym nowym projekcie tylko zmuszałoby do przepisywania
  // ich w kółko. Kasowane są wyłącznie pola opisujące KONKRETNY obiekt.
  projektyLokalne: () => {
    try {
      return [...czytajIndeks(localStorage)].sort((a, b) => b.zmieniony - a.zmieniony);
    } catch {
      return [];
    }
  },

  /**
   * Otwarcie projektu z listy lokalnej.
   *
   * Ta sama kolejność co w `resetProject` i z tego samego powodu: najpierw domknięcie
   * zapisu projektu, który właśnie opuszczamy, dopiero potem przestawienie wskaźnika.
   * Odwrotnie — bufor autozapisu wylądowałby w slocie projektu, który dopiero
   * otwieramy, i nadpisał go treścią poprzedniego.
   */
  otworzProjektLokalny: (id) => {
    if (biezacyId(localStorage) === id) return;
    zapiszTerazLokalnie();
    try {
      const raw = localStorage.getItem(kluczProjektu(id));
      if (raw === null) return;
      ustawBiezacy(localStorage, id);
      lastAutosavedJson = raw;
      get().loadProjectPayload(JSON.parse(raw) as ProjectPayload);
    } catch {
      // Uszkodzony slot: zostajemy tam, gdzie byliśmy. Lepiej nie otworzyć projektu
      // niż wyrzucić użytkownika z tego, nad którym pracuje.
    }
  },

  usunProjektLokalny: (id) => {
    try {
      const zostalo = usunProjekt(localStorage, id);
      // Skasowanie OTWARTEGO projektu zostawiłoby na ekranie stan bez slotu —
      // następny autozapis założyłby mu nowy i projekt „wróciłby" na listę.
      // Dlatego wtedy zaczynamy czysto, tak jak przy „Nowym projekcie".
      if (biezacyId(localStorage) === null) get().resetProject();
      return zostalo;
    } catch {
      return [];
    }
  },

  resetProject: () => {
    /**
     * „Nowy projekt" ODKŁADA dotychczasowy na listę projektów lokalnych, zamiast go
     * kasować. To jest sedno listy: bez tego przy drugim mieszkaniu nadal trzeba by
     * nadpisać pierwsze.
     *
     * Kolejność jest tu wszystkim. Najpierw domykamy zapis STAREGO projektu w jego
     * slocie (autozapis chodzi z opóźnieniem 600 ms, więc ostatnie zmiany mogą jeszcze
     * wisieć w buforze), a dopiero potem przestawiamy wskaźnik bieżącego. Odwrotnie —
     * pusty stan wylądowałby w slocie starego projektu i zjadł dokładnie tę pracę,
     * którą próbujemy ocalić.
     *
     * WYJĄTEK: projekt przykładowy. Jest z założenia jednorazowy („Zacznij własny
     * projekt" jest jedynym wyjściem z niego), więc archiwizowanie go zaśmiecałoby
     * listę czymś, czego nikt nie tworzył. Wtedy po prostu zostajemy w tym samym
     * slocie i nadpisujemy go pustym projektem.
     */
    if (!get().projektPrzykladowy) {
      zapiszTerazLokalnie();
      przelaczNaNowyProjektLokalny();
    }
    // Nowy projekt zaczyna bez powiązania z jakimkolwiek wierszem w chmurze —
    // bez wyzerowania tego automatyczny zapis w tle nadpisałby STARY projekt
    // pustym draftem zamiast założyć nowy wiersz.
    lastCloudSavedJson = null;
    znaneUpdatedAt = null;
    ostatniaZapisanaNazwa = null;
    set((state) => ({
      draft: emptyDraft,
      past: [],
      future: [],
      panelPast: [],
      panelFuture: [],
      bgImages: {},
      scales: {},
      prices: { ...DEFAULT_PRICES },
      costOverrides: {},
      qtyOverrides: {},
      konfliktChmury: null,
      protocols: {},
      cloudId: null,
      lastCloudSaveAt: null,
      cloudSaveError: null,
      floors: [{ id: "f1", name: "Parter" }],
      activeFloorId: "f1",
      projectName: "Mój dom",
      panelConfig: { supply3f: true, mainRating: 40, perRow: 12 },
  warunkiDoboru: WARUNKI_DOBORU_DOMYSLNE,
      panelDevices: [],
      panelHidden: [],
      panelTryb: "zRzutu",
      panelOverrides: {},
      planSize: DEFAULT_PLAN_SIZE,
      onboarding: INITIAL_ONBOARDING,
      // „Nowy projekt" jest jedynym wyjściem z przykładu — i to jest to wyjście.
      projektPrzykladowy: false,
      // Nowy, pusty projekt nie ma czego prostować — komunikat po poprzednim
      // wczytaniu nie może mu zostać na ekranie.
      roomsFixedOnLoad: 0,
      docHeader: {
        ...state.docHeader,
        obiekt: "",
        adres: "",
        zleceniodawca: "",
        uwagi: "",
        data: new Date().toISOString().slice(0, 10),
        drawingNo: "E-01",
        revision: "A",
      },
    }));
  },

  getProjectPayload: () => {
    const { draft, floors, activeFloorId, bgImages, scales, prices, costOverrides, qtyOverrides, docHeader, protocols, projectName, panelConfig, warunkiDoboru, panelDevices, panelHidden, panelTryb, panelOverrides, planSize, onboarding, projektPrzykladowy } = get();
    return { draft, floors, activeFloorId, bgImages, scales, prices, costOverrides, qtyOverrides, docHeader, protocols, projectName, panelConfig, warunkiDoboru, panelDevices, panelHidden, panelTryb, panelOverrides, planSize, onboarding, projektPrzykladowy };
  },

  loadProjectPayload: (payload) => {
    // `{...emptyDraft, ...payload.draft}` — zapisy sprzed dodania `openings`
    // (pole nowe w tym kroku) nie mają go w ogóle, więc bez tego fallbacku
    // każdy odczyt `draft.openings` na starym projekcie rzucałby na `undefined`.
    const draft = { ...emptyDraft, ...payload.draft };
    // Remont przypisań do pomieszczeń — patrz `reconcileRoomsOnLoad`. Wchodzi TU,
    // a nie w komponencie, bo to jedyne wejście dla obu dróg wczytania (autozapis
    // w localStorage i projekt z chmury), więc poprawka nie zależy od tego, którą
    // z nich użytkownik akurat wszedł. Po przeliczeniu historia i tak startuje
    // pusta (`past`/`future` niżej), więc poprawione dane SĄ punktem wyjścia
    // projektu — nie stanem pośrednim, który dałoby się przypadkiem cofnąć.
    const { elements, poprawione } = reconcileRoomsOnLoad(draft.elements, draft.roomShapes, payload.scales);
    set({
      draft: { ...draft, elements },
      roomsFixedOnLoad: poprawione,
      floors: payload.floors.length ? payload.floors : [{ id: "f1", name: "Parter" }],
      activeFloorId: payload.activeFloorId || payload.floors[0]?.id || "f1",
      bgImages: payload.bgImages,
      scales: payload.scales,
      prices: { ...DEFAULT_PRICES, ...payload.prices },
      // Zapisy sprzed tej zmiany nie maja tego pola — pusta mapa znaczy "wszystko liczone".
      costOverrides: payload.costOverrides ?? {},
      qtyOverrides: payload.qtyOverrides ?? {},
      // Uzupełniane jak `prices` i `panelConfig` wyżej: zapis sprzed dodania pola
      // po prostu go NIE MA, a dotyczy to też projektów z chmury, wczytywanych na
      // dowolnym urządzeniu. `docHeader` szedł tu dotąd SUROWY i brak jednego pola
      // kładł całą aplikację — `resolveDocHeader` woła sześć komponentów, a jeden
      // z nich jest zamontowany w `App` na stałe, więc zostawał sam ekran awarii.
      docHeader: { ...domyslnyNaglowek(), ...(payload.docHeader ?? {}) },
      protocols: payload.protocols,
      projectName: payload.projectName || "Projekt",
      // `panelConfig` dodane po pierwszych zapisach w chmurze/lokalnie — starsze
      // migawki go nie mają, stąd fallback do domyślnej konfiguracji. Starsze zapisy
      // MOGĄ mieć w środku jeszcze pole `spd` sprzed usunięcia go z typu — zostaje
      // wtedy nieużywane w obiekcie (nikt go już nie czyta), nie trzeba go czyścić.
      //
      // Domyślne wartości nakładane NA obiekt, nie tylko na jego brak: `perRow` doszło
      // później niż sam `panelConfig`, więc brakuje go także w migawkach, które
      // `panelConfig` już mają. Bez tego rozdzielnica wczytana ze starego projektu
      // miałaby rząd o szerokości `undefined` i nie policzyłaby modułów.
      panelConfig: { supply3f: true, mainRating: 40, perRow: 12, ...((payload.panelConfig ?? {}) as Partial<PanelConfig>) },
      // Warunki doboru doszły po pierwszych zapisach — starsze migawki ich nie mają, a
      // wartości domyślne to dokładnie to, co dobór zakładał wtedy milcząco (30 °C,
      // jeden obwód w wiązce, układanie w ścianie, zero spadku na WLZ). Nakładane NA
      // obiekt, żeby migawka z częścią pól nie zostawiła reszty jako `undefined`.
      warunkiDoboru: { ...WARUNKI_DOBORU_DOMYSLNE, ...(payload.warunkiDoboru ?? {}) },
      // Projekty zapisane przed wprowadzeniem trwałej rozdzielnicy nie mają tych pól —
      // wracają wtedy do trybu „z rzutu" i odbudowują aparaty z obwodów, czyli
      // dokładnie tak, jak działały do tej pory.
      panelDevices: payload.panelDevices || [],
      panelHidden: payload.panelHidden || [],
      panelTryb: payload.panelTryb === "reczny" ? "reczny" : "zRzutu",
      panelOverrides: payload.panelOverrides || {},
      // starsze migawki nie mają obszaru planu — wracamy do domyślnego 1000x700
      planSize: payload.planSize || DEFAULT_PLAN_SIZE,
      // migawki sprzed onboardingu go nie mają — traktujemy je jak projekt
      // prowadzony bez przewodnika, więc bez wskrzeszania go po latach
      onboarding: payload.onboarding || { ...INITIAL_ONBOARDING, pominiety: true },
      // Bierzemy z migawki, więc wczytanie CZEGOKOLWIEK innego (projekt z chmury,
      // autozapis własnej pracy) samo gasi pasek „To jest przykład" — żaden projekt
      // użytkownika tego pola nie ma.
      projektPrzykladowy: payload.projektPrzykladowy === true,
      past: [],
      future: [],
      panelPast: [],
      panelFuture: [],
    });
  },

  setWarunkiDoboru: (patch) => set((state) => ({ warunkiDoboru: { ...state.warunkiDoboru, ...patch } })),

  setActiveFloorId: (id) => set({ activeFloorId: id }),

  /**
   * Wysokość kondygnacji [m]. `undefined` kasuje wpis i przywraca wartość typową —
   * pole ma stan „nie podano", bo to on odróżnia projekt, w którym nikt tej liczby nie
   * ruszał, od takiego, w którym ktoś świadomie wpisał 2,8.
   *
   * Wartości bezsensowne (zero, ujemne) są odrzucane już tutaj: wysokość zaniża
   * długość przewodu, a zaniżona długość to zaniżony spadek napięcia, czyli dobór
   * przepuszczający za cienki kabel.
   */
  setFloorHeight: (id, heightM) =>
    set((state) => ({
      floors: state.floors.map((f) => {
        if (f.id !== id) return f;
        if (heightM === undefined || !(heightM > 0)) {
          const { heightM: _pominiete, ...reszta } = f;
          return reszta;
        }
        return { ...f, heightM };
      }),
    })),

  addFloor: (name) =>
    set((state) => {
      const id = crypto.randomUUID();
      // Nowa kondygnacja DZIEDZICZY skalę: piętro rysuje się w tej samej skali co
      // parter, więc kazanie użytkownikowi kalibrować każdą z osobna to powtarzanie
      // tej samej czynności i ryzyko, że piętro dostanie inny przelicznik niż parter.
      // Bierzemy skalę bieżącej kondygnacji, a gdy jej nie ma — pierwszej skalibrowanej.
      const inherited =
        scaleOf(state.scales, state.activeFloorId) ??
        state.floors.map((f) => state.scales[f.id]).find((v) => typeof v === "number" && v > 0) ??
        null;
      // Wysokość dziedziczy się z tego samego powodu co skala: piętra w jednym domu
      // mają zwykle tę samą wysokość, a wpisywanie jej od nowa przy każdym to
      // powtarzanie tej samej czynności — i okazja, żeby piętro po cichu wróciło do
      // wartości typowej, mimo że parter jej nie ma.
      const wysokosc = state.floors.find((f) => f.id === state.activeFloorId)?.heightM;
      return {
        floors: [...state.floors, wysokosc === undefined ? { id, name } : { id, name, heightM: wysokosc }],
        activeFloorId: id,
        scales: inherited === null ? state.scales : { ...state.scales, [id]: inherited },
        // Obszar planu też jest wspólny — inaczej odziedziczona skala opisywałaby
        // rysunek o innych wymiarach, czyli już nie ta sama skala.
      };
    }),

  /**
   * Kopiuje kondygnację wraz z całą jej geometrią i osprzętem.
   *
   * Piętra w budynku wielorodzinnym bywają identyczne albo różnią się kilkoma
   * elementami — przerysowywanie ich od zera to najdłuższa i najbardziej bezmyślna
   * czynność w całej aplikacji, a przy okazji jedyna, przy której piony na pewno się
   * rozjadą (patrz podgląd kondygnacji poniżej).
   *
   * Identyfikatory MUSZĄ być przemapowane, nie tylko podmienione na nowe: otwory
   * wskazują na konkretną ścianę (`wallId`) albo obrys (`roomId`), więc kopia z tymi
   * samymi id-kami przykleiłaby drzwi z piętra do ściany z parteru. Przy usunięciu
   * tamtej ściany kasowałyby się razem z nią (patrz `deleteSelection`), na piętrze,
   * którego użytkownik w ogóle nie dotykał.
   *
   * `routeOverrides` NIE są kopiowane: są kluczowane id elementów, a kopie mają nowe.
   * Ręczny układ trasy i tak zależy od rozdzielnicy, której na nowym piętrze nie ma —
   * trasy policzą się od zera.
   */
  duplicateFloor: (id, name) =>
    set((state) => {
      const zrodlo = state.floors.find((f) => f.id === id);
      if (!zrodlo) return state;
      const nowaId = crypto.randomUUID();

      const mapaScian = new Map<string, string>();
      const mapaPokoi = new Map<string, string>();
      const walls = state.draft.walls
        .filter((w) => w.floor === id)
        .map((w) => {
          const noweId = crypto.randomUUID();
          mapaScian.set(w.id, noweId);
          return { ...w, id: noweId, floor: nowaId, points: w.points.map((p) => ({ ...p })) };
        });
      const roomShapes = state.draft.roomShapes
        .filter((r) => r.floor === id)
        .map((r) => {
          const noweId = crypto.randomUUID();
          mapaPokoi.set(r.id, noweId);
          return { ...r, id: noweId, floor: nowaId, points: r.points.map((p) => ({ ...p })) };
        });
      const openings = state.draft.openings
        .filter((o) => o.floor === id)
        .map((o) => ({
          ...o,
          id: crypto.randomUUID(),
          floor: nowaId,
          wallId: o.wallId ? mapaScian.get(o.wallId) : undefined,
          roomId: o.roomId ? mapaPokoi.get(o.roomId) : undefined,
        }));
      const elements = state.draft.elements
        .filter((e) => e.floor === id)
        .map((e) => ({ ...e, id: crypto.randomUUID(), floor: nowaId }));

      const skala = state.scales[id];
      return {
        floors: [...state.floors, { id: nowaId, name }],
        activeFloorId: nowaId,
        scales: typeof skala === "number" ? { ...state.scales, [nowaId]: skala } : state.scales,
        // Podkład (wgrany rzut) też idzie z kopią — piętro powielane z parteru zwykle
        // ma ten sam skan, a bez niego skala odziedziczona z parteru nie ma do czego
        // się odnieść.
        bgImages: state.bgImages[id] ? { ...state.bgImages, [nowaId]: state.bgImages[id] } : state.bgImages,
        draft: {
          ...state.draft,
          walls: [...state.draft.walls, ...walls],
          roomShapes: [...state.draft.roomShapes, ...roomShapes],
          openings: [...state.draft.openings, ...openings],
          elements: [...state.draft.elements, ...elements],
        },
        past: [...state.past, state.draft],
        future: [],
      };
    }),

  removeFloor: (id) =>
    set((state) => {
      if (state.floors.length <= 1) return state;
      const floors = state.floors.filter((f) => f.id !== id);
      const remainingElements = state.draft.elements.filter((e) => e.floor !== id);
      const draft: Draft = {
        elements: remainingElements,
        walls: state.draft.walls.filter((w) => w.floor !== id),
        roomShapes: state.draft.roomShapes.filter((r) => r.floor !== id),
        openings: state.draft.openings.filter((o) => o.floor !== id),
        routeOverrides: pruneRouteOverrides(state.draft.routeOverrides, remainingElements),
      };
      const bgImages = { ...state.bgImages };
      delete bgImages[id];
      const scales = { ...state.scales };
      delete scales[id];
      return {
        floors,
        draft,
        bgImages,
        scales,
        activeFloorId: state.activeFloorId === id ? floors[0].id : state.activeFloorId,
      };
    }),

  setBgImage: (floorId, dataUrl) =>
    set((state) => {
      const bgImages = { ...state.bgImages };
      if (dataUrl) bgImages[floorId] = dataUrl;
      else delete bgImages[floorId];
      return { bgImages };
    }),

  setScale: (floorId, metersPerUnit) =>
    set((state) => ({ scales: { ...state.scales, [floorId]: metersPerUnit } })),

  clearScale: (floorId) =>
    set((state) => {
      const scales = { ...state.scales };
      delete scales[floorId];
      return { scales };
    }),

  setPrice: (key, value) =>
    set((state) => ({ prices: { ...state.prices, [key]: value } })),

  setPrices: (patch) =>
    set((state) => ({ prices: { ...state.prices, ...patch } })),

  setCostOverride: (key, value) =>
    set((state) => {
      const next = { ...state.costOverrides };
      if (value === null) delete next[key];
      else next[key] = value;
      return { costOverrides: next };
    }),

  setQtyOverride: (key, value) =>
    set((state) => {
      const next = { ...state.qtyOverrides };
      if (value === null) delete next[key];
      else next[key] = value;
      return { qtyOverrides: next };
    }),

  setDocHeader: (patch) =>
    set((state) => ({ docHeader: { ...state.docHeader, ...patch } })),

  setProjectName: (name) => set({ projectName: name }),

  setPanelConfig: (patch) => set((state) => ({ panelConfig: { ...state.panelConfig, ...patch } })),

  setPanelDevices: (devices) => set({ panelDevices: devices }),
  setPanelHidden: (keys) => set({ panelHidden: keys }),
  setPanelTryb: (tryb) => set({ panelTryb: tryb }),
  setPanelOverrides: (o) => set({ panelOverrides: o }),

  // Patrz komentarz przy `panelPast`/`panelFuture` w interfejsie: osobny, mniejszy
  // stos historii, wypełniany WYŁĄCZNIE jawnym wywołaniem `commitPanelSnapshot()`
  // tuż PRZED ręczną zmianą — ten sam wzorzec co `commit: true` w `setDraft`, tylko
  // bez automatycznego wyzwalania przy każdym zapisie (bo tu „każdy zapis" obejmuje
  // też przeliczenia automatyczne z planu, których cofać nie wolno).
  commitPanelSnapshot: () => {
    const { panelDevices, panelHidden, panelOverrides } = get();
    set((state) => ({
      panelPast: [...state.panelPast, { devices: panelDevices, hidden: panelHidden, overrides: panelOverrides }],
      panelFuture: [],
    }));
  },

  panelUndo: () => {
    const { panelPast, panelDevices, panelHidden, panelOverrides, panelFuture } = get();
    if (panelPast.length === 0) return;
    const prev = panelPast[panelPast.length - 1];
    set({
      panelDevices: prev.devices,
      panelHidden: prev.hidden,
      panelOverrides: prev.overrides,
      panelPast: panelPast.slice(0, -1),
      panelFuture: [{ devices: panelDevices, hidden: panelHidden, overrides: panelOverrides }, ...panelFuture],
    });
  },

  panelRedo: () => {
    const { panelFuture, panelDevices, panelHidden, panelOverrides, panelPast } = get();
    if (panelFuture.length === 0) return;
    const next = panelFuture[0];
    set({
      panelDevices: next.devices,
      panelHidden: next.hidden,
      panelOverrides: next.overrides,
      panelFuture: panelFuture.slice(1),
      panelPast: [...panelPast, { devices: panelDevices, hidden: panelHidden, overrides: panelOverrides }],
    });
  },

  panelCanUndo: () => get().panelPast.length > 0,
  panelCanRedo: () => get().panelFuture.length > 0,

  setPlanSize: (size) => set({ planSize: size }),

  setOnboarding: (patch) => set((state) => ({ onboarding: { ...state.onboarding, ...patch } })),

  wczytajPrzyklad: async () => {
    // Dynamiczny `import()`, bo przykład to kilkadziesiąt elementów, ścian i obrysów
    // wpisanych wprost w kod — nikt, kto przyszedł rysować własny dom, nie musi tego
    // pobierać. Moduł trafia do osobnego kawałka i dociąga się na kliknięcie.
    const { zbudujProjektPrzykladowy } = await import("@/lib/demo/mieszkanie");
    // Przykład wchodzi TĄ SAMĄ drogą co projekt z chmury i z autozapisu — łącznie
    // z zerowaniem historii cofnij/ponów i remontem przypisań do pomieszczeń.
    get().loadProjectPayload(zbudujProjektPrzykladowy());
    // Nowy, świeżo wczytany przykład nie jest ŻADNYM wierszem w chmurze. Bez tego
    // autozapis w tle nadpisałby projekt, który był otwarty wcześniej (patrz ta sama
    // ostrożność w `resetProject`).
    lastCloudSavedJson = null;
    znaneUpdatedAt = null;
    ostatniaZapisanaNazwa = null;
    set({ cloudId: null, lastCloudSaveAt: null, cloudSaveError: null, konfliktChmury: null });
  },

  setProtocolState: (key, patch) =>
    set((state) => ({
      protocols: { ...state.protocols, [key]: { rows: [], ...state.protocols[key], ...patch } },
    })),

  setSession: (session) => {
    try {
      if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      else localStorage.removeItem(SESSION_KEY);
    } catch {
      // limit przeglądarki / tryb prywatny — sesja działa nadal w tej karcie
    }
    // Wylogowanie kasuje tylko KOMUNIKAT błędu — cloudId zostaje, żeby powrót do
    // tego samego konta w tej karcie nie założył drugiego wiersza w chmurze dla
    // tego samego projektu.
    set(session ? { session } : { session, cloudSaveError: null });
  },

  setCloudId: (id) => set({ cloudId: id }),

  saveToCloud: async (opcje) => {
    const { getProjectPayload, cloudId, projectName, zapewnijSesje } = get();
    const session = await zapewnijSesje();
    if (!session) return;
    // Ręczna próba zawsze zaczyna od czystej karty: użytkownik klika „Zapisz teraz"
    // zwykle właśnie po zrobieniu miejsca, więc wstrzymanie musi wtedy zniknąć.
    set({ cloudBusy: true, cloudSaveError: null, limitBlokada: null, konfliktChmury: null, ...(opcje?.reczny ? { autozapisWstrzymany: false } : {}) });
    try {
      const payload = getProjectPayload();
      // `kind` odróżnia projekt od zestawu protokołów w tej samej tabeli — bez niego
      // obie listy pokazywałyby wszystko i limity liczyłyby się wspólnie.
      const data = { ...payload, kind: "projekt" } as unknown as Record<string, unknown>;
      let docelowyId = cloudId;
      // Listę pobieramy nie tylko dla nowego projektu, ale też PO ZMIANIE NAZWY.
      // Bez tego drugiego warunku zmiana nazwy zapisanego projektu na już zajętą
      // szła prosto do aktualizacji i tworzyła drugi wpis o tej samej nazwie —
      // bez żadnego pytania. Przy niezmienionej nazwie dodatkowego żądania nie ma,
      // więc autozapis nadal kosztuje jedno wywołanie.
      if (!docelowyId || projectName !== ostatniaZapisanaNazwa) {
        const lista = await supaListProjects(session.token, session.user.id);
        const decyzja = decyzjaZapisu({
          lista,
          rodzaj: "projekt",
          nazwa: projectName,
          biezacyId: cloudId,
          wymuszonyId: opcje?.nadpiszId,
        });
        if (decyzja.akcja === "pytaj") {
          // Autozapis wstrzymujemy, bo inaczej dopytywałby co 2,5 s.
          set({
            autozapisWstrzymany: true,
            pytanieONadpisanie: { rodzaj: "projekt", nazwa: projectName, id: decyzja.id },
          });
          return;
        }
        if (decyzja.akcja === "limit") {
          // Okno listy pokazujemy WYŁĄCZNIE przy zapisie ręcznym — tam jest to
          // odpowiedź na kliknięcie, a nie coś wyskakującego znikąd.
          set({ autozapisWstrzymany: true });
          if (opcje?.reczny) set({ limitBlokada: { rodzaj: "projekt", komunikat: decyzja.komunikat } });
          else set({ cloudSaveError: decyzja.komunikat });
          return;
        }
        docelowyId = decyzja.akcja === "aktualizuj" ? decyzja.id : null;
      }
      if (docelowyId) {
        /**
         * Nadpisujemy TYLKO ten stan wiersza, który znamy — chyba że użytkownik
         * świadomie wybrał „nadpisz mimo to" (`nadpiszId`, ta sama droga co przy
         * kolizji nazw) albo zapisujemy do wiersza, którego jeszcze nie czytaliśmy.
         *
         * Pusta odpowiedź = warunek nie trafił w żaden wiersz, czyli ktoś zapisał
         * w międzyczasie. Nie ma wtedy dobrego automatycznego wyjścia: i nasza,
         * i tamta wersja są czyjąś pracą. Wstrzymujemy autozapis (inaczej pytałby
         * co 2,5 s) i oddajemy decyzję użytkownikowi.
         */
        const warunek = opcje?.nadpiszId ? null : znaneUpdatedAt;
        const wiersze = await supaUpdateProject(
          session.token,
          docelowyId,
          { name: projectName, data, updated_at: new Date().toISOString() },
          warunek
        );
        if (warunek && wiersze.length === 0) {
          set({ autozapisWstrzymany: true, konfliktChmury: { rodzaj: "projekt", id: docelowyId, nazwa: projectName } });
          return;
        }
        znaneUpdatedAt = wiersze[0]?.updated_at ?? null;
        if (docelowyId !== cloudId) set({ cloudId: docelowyId });
      } else {
        const [row] = await supaInsertProject(session.token, { user_id: session.user.id, name: projectName, data });
        // `updated_at` wypełnia baza (default now()), więc jedyne wiarygodne źródło
        // tej wartości to odpowiedź na INSERT.
        znaneUpdatedAt = row.updated_at ?? null;
        set({ cloudId: row.id });
      }
      lastCloudSavedJson = JSON.stringify(payload);
      ostatniaZapisanaNazwa = projectName;
      set({ lastCloudSaveAt: Date.now(), autozapisWstrzymany: false });
    } catch (e) {
      set({ cloudSaveError: e instanceof Error ? e.message : "Nie udało się zapisać w chmurze" });
    } finally {
      set({ cloudBusy: false });
    }
  },

  setLimitBlokada: (b) => set({ limitBlokada: b }),

  setOknoZestawow: (open) => set({ oknoZestawowOtwarte: open }),

  anulujNadpisanie: () => set({ pytanieONadpisanie: null }),

  odlozKonflikt: () => set({ konfliktChmury: null }),

  zapewnijSesje: async () => {
    const { session, setSession } = get();
    if (!session) return null;
    if (!wymagaOdswiezenia(session)) return session;
    // Sesja sprzed wprowadzenia odświeżania nie ma czym się odnowić. Mówimy o tym
    // wprost i wylogowujemy, zamiast pozwolić, żeby każdy kolejny zapis po cichu
    // wracał z 401 — a użytkownik pracował dalej w przekonaniu, że dane lecą do chmury.
    if (!session.refreshToken) {
      setSession(null);
      set({ cloudSaveError: SESJA_WYGASLA });
      return null;
    }
    try {
      const swieza = sesjaZOdpowiedzi(await supaRefresh(session.refreshToken));
      setSession(swieza);
      set({ cloudSaveError: null });
      return swieza;
    } catch {
      setSession(null);
      set({ cloudSaveError: SESJA_WYGASLA });
      return null;
    }
  },

  nowyZestawProtokolow: () => {
    // Nowy zestaw nie jest jeszcze zadnym wierszem w chmurze — zostawiony znacznik
    // kazalby pierwszemu zapisowi celowac w cudzy.
    znaneUpdatedAtProtokoly = null;
    set({ protokolyId: null, protokolyNazwa: "", protocols: {}, konfliktChmury: null });
  },

  saveProtokolyToCloud: async (nazwa, opcje) => {
    const { docHeader, protocols, protokolyId, zapewnijSesje } = get();
    const session = await zapewnijSesje();
    if (!session) return;
    set({ cloudBusy: true, cloudSaveError: null, limitBlokada: null, konfliktChmury: null });
    try {
      // Limit sprawdzamy na ŚWIEŻEJ liście z serwera, nie na lokalnej kopii: ten sam
      // użytkownik mógł zapisać coś na innym urządzeniu i lokalny stan byłby nieaktualny.
      const lista = await supaListProjects(session.token, session.user.id);
      const tytulRoboczy = nazwa.trim() || docHeader.obiekt || "Protokoły";
      // Ta sama decyzja co przy projektach — łącznie z przypadkiem, w którym zestaw
      // jest już zapisany, ale użytkownik zmienił mu nazwę na zajętą przez inny.
      const decyzja = decyzjaZapisu({
        lista,
        rodzaj: "protokoly",
        nazwa: tytulRoboczy,
        biezacyId: protokolyId,
        wymuszonyId: opcje?.nadpiszId,
      });
      if (decyzja.akcja === "pytaj") {
        set({ pytanieONadpisanie: { rodzaj: "protokoly", nazwa: tytulRoboczy, id: decyzja.id } });
        return;
      }
      if (decyzja.akcja === "limit") {
        set({ limitBlokada: { rodzaj: "protokoly", komunikat: decyzja.komunikat } });
        return;
      }
      const docelowyId = decyzja.akcja === "aktualizuj" ? decyzja.id : null;
      // Do dokumentu idą WYŁĄCZNIE dane protokołów — bez planu, kondygnacji i
      // podkładów. To one czynią z tego dokument niezależny od projektowania.
      const data = { kind: "protokoly", docHeader, protocols } as unknown as Record<string, unknown>;
      const tytul = tytulRoboczy;
      if (docelowyId) {
        // Ten sam optimistic locking co przy projekcie — patrz `supaUpdateProject`.
        // Protokoły zapisują się tylko na kliknięcie, więc kolizja jest rzadsza, ale
        // kończy się identycznie: pomiary wpisane na drugim urządzeniu znikają.
        const warunek = opcje?.nadpiszId ? null : znaneUpdatedAtProtokoly;
        const wiersze = await supaUpdateProject(
          session.token,
          docelowyId,
          { name: tytul, data, updated_at: new Date().toISOString() },
          warunek
        );
        if (warunek && wiersze.length === 0) {
          set({ konfliktChmury: { rodzaj: "protokoly", id: docelowyId, nazwa: tytul } });
          return;
        }
        znaneUpdatedAtProtokoly = wiersze[0]?.updated_at ?? null;
        if (docelowyId !== protokolyId) set({ protokolyId: docelowyId });
      } else {
        const [row] = await supaInsertProject(session.token, { user_id: session.user.id, name: tytul, data });
        znaneUpdatedAtProtokoly = row.updated_at ?? null;
        set({ protokolyId: row.id });
      }
      set({ protokolyNazwa: tytul, lastCloudSaveAt: Date.now() });
    } catch (e) {
      set({ cloudSaveError: e instanceof Error ? e.message : "Nie udało się zapisać protokołów" });
    } finally {
      set({ cloudBusy: false });
    }
  },

  loadProtokolyFromCloud: async (id) => {
    const session = await get().zapewnijSesje();
    if (!session) return;
    set({ cloudBusy: true, cloudSaveError: null });
    try {
      const [row] = await supaGetProject(session.token, id);
      if (!row) throw new Error("Nie znaleziono zestawu protokołów");
      const data = row.data as { docHeader?: DocumentHeader; protocols?: Partial<Record<ProtocolKey, ProtocolState>> };
      set({
        // Nagłówek i protokoły podmieniamy w całości; plan zostaje nietknięty, bo
        // zestaw protokołów nic o nim nie wie i nie ma prawa go nadpisać.
        docHeader: { ...get().docHeader, ...(data.docHeader ?? {}) },
        protocols: data.protocols ?? {},
        protokolyId: row.id,
        protokolyNazwa: row.name || "Protokoły",
        konfliktChmury: null,
      });
      // Od tego stanu wiersza liczy sie kolejny zapis — patrz `znaneUpdatedAtProtokoly`.
      znaneUpdatedAtProtokoly = row.updated_at ?? null;
    } catch (e) {
      set({ cloudSaveError: e instanceof Error ? e.message : "Nie udało się wczytać protokołów" });
    } finally {
      set({ cloudBusy: false });
    }
  },

  loadFromCloud: async (id) => {
    const { loadProjectPayload, getProjectPayload, zapewnijSesje } = get();
    const session = await zapewnijSesje();
    if (!session) return;
    set({ cloudBusy: true, cloudSaveError: null });
    try {
      const [row] = await supaGetProject(session.token, id);
      if (!row) throw new Error("Nie znaleziono projektu");
      const payload = row.data as unknown as ProjectPayload;
      loadProjectPayload({ ...payload, projectName: row.name || "Projekt" });
      // Migawka właśnie wczytana z chmury jest z definicji zgodna z chmurą —
      // bez tego automatyczny zapis w tle odpaliłby zbędny request od razu
      // po wczytaniu, mimo że nic się jeszcze nie zmieniło.
      //
      // WYJĄTEK: gdy wczytanie coś POPRAWIŁO (`reconcileRoomsOnLoad`), stan w pamięci
      // różni się od wiersza w bazie i ten skrót byłby nieprawdą — poprawka utknęłaby
      // w tej karcie do najbliższej innej zmiany, a każde kolejne otwarcie projektu
      // prostowałoby to samo od nowa i pokazywało ten sam komunikat. Zostawiamy wtedy
      // poprzednią migawkę, żeby autozapis zobaczył różnicę i odesłał poprawkę.
      // (Odpowiednik zapisu tuż po wczytaniu autozapisu lokalnego — patrz niżej.)
      if (get().roomsFixedOnLoad === 0) {
        lastCloudSavedJson = JSON.stringify(getProjectPayload());
      }
      // Nazwa wczytanego projektu liczy się jako „ostatnio zapisana" — inaczej
      // pierwszy autozapis po wczytaniu uznałby ją za zmienioną i niepotrzebnie
      // pobierał listę, żeby sprawdzić kolizję z samym sobą.
      ostatniaZapisanaNazwa = row.name || "Projekt";
      // Od tego stanu wiersza liczy sie kolejny zapis — patrz `znaneUpdatedAt`.
      znaneUpdatedAt = row.updated_at ?? null;
      set({ cloudId: row.id, lastCloudSaveAt: Date.now(), konfliktChmury: null });
    } catch (e) {
      set({ cloudSaveError: e instanceof Error ? e.message : "Nie udało się wczytać projektu" });
    } finally {
      set({ cloudBusy: false });
    }
  },

  addRoomShape: (floor, points, name, type) => {
    const { draft, setDraft } = get();
    const countHere = draft.roomShapes.filter((r) => r.floor === floor).length;
    const room: RoomShape = {
      id: crypto.randomUUID(),
      floor,
      name: name?.trim() || nextRoomName(countHere),
      color: roomColorForIndex(countHere),
      points,
      type,
    };
    // Świeżo obrysowane pomieszczenie przygarnia elementy, które już w nim stoją.
    // Kolejność „najpierw postaw gniazdka, potem obrysuj pokój" jest normalna przy
    // pracy na wgranym rzucie (widać ściany, więc nie trzeba nic obrysowywać, żeby
    // zacząć) — a bez tego wszystkie takie elementy zostawały „Bez pomieszczenia"
    // na zawsze, bo przypisanie liczyło się wyłącznie w chwili postawienia.
    const mpu = scaleOf(get().scales, floor);
    setDraft((d) => {
      const roomShapes = [...d.roomShapes, room];
      return { ...d, roomShapes, elements: reassignRoomsOnFloor(d.elements, roomShapes, floor, mpu, []) };
    });
  },

  setRoomShapeType: (id, type) => {
    const { setDraft } = get();
    setDraft((d) => ({ ...d, roomShapes: d.roomShapes.map((r) => (r.id === id ? { ...r, type } : r)) }));
  },

  // Zmiana nazwy pomieszczenia synchronizuje też już postawione w nim elementy —
  // inaczej obwody i grupowanie po pomieszczeniach "zgubiłyby" je pod starą nazwą.
  renameRoomShape: (id, newName) => {
    const { setDraft } = get();
    setDraft((d) => {
      const room = d.roomShapes.find((r) => r.id === id);
      if (!room) return d;
      return {
        ...d,
        roomShapes: d.roomShapes.map((r) => (r.id === id ? { ...r, name: newName } : r)),
        elements: d.elements.map((e) =>
          e.floor === room.floor && e.room === room.name ? { ...e, room: newName } : e
        ),
      };
    });
  },

  // Przeciągnięcie narożnika potrafi wypchnąć element z pomieszczenia albo wciągnąć
  // do niego sąsiada — przypisanie musi za tym nadążyć, tak samo jak przy zmianie
  // nazwy wyżej. Zawężone do TEGO pomieszczenia i elementów niczyich (patrz
  // `reassignRoomsOnFloor`), żeby edycja jednego pokoju nie ruszała reszty planu.
  moveRoomShapePoint: (id, index, point) => {
    const { setDraft, scales } = get();
    setDraft((d) => {
      const room = d.roomShapes.find((r) => r.id === id);
      if (!room) return d;
      const roomShapes = d.roomShapes.map((r) =>
        r.id === id ? { ...r, points: r.points.map((p, i) => (i === index ? point : p)) } : r
      );
      return {
        ...d,
        roomShapes,
        elements: reassignRoomsOnFloor(d.elements, roomShapes, room.floor, scaleOf(scales, room.floor), [room.name]),
      };
    });
  },

  recolorRoomShape: (id) => {
    const { setDraft } = get();
    setDraft((d) => {
      const room = d.roomShapes.find((r) => r.id === id);
      if (!room) return d;
      const color = nextRoomColor(room.color);
      return { ...d, roomShapes: d.roomShapes.map((r) => (r.id === id ? { ...r, color } : r)) };
    });
  },

  deleteRoomShape: (id) => {
    const { setDraft, scales } = get();
    // Kasuje też otwory postawione na krawędzi TEGO pomieszczenia — inaczej zostałyby
    // osierocone (roomId wskazujący na nieistniejące pomieszczenie), tak samo jak przy
    // kasowaniu ściany i jej otworów w DesignTab.
    // Elementy stojące w kasowanym pomieszczeniu to ta sama klasa osieroceń, tylko po
    // nazwie zamiast po id: bez przeliczenia zostawały z nazwą pokoju, którego już nie
    // ma na planie, i dalej tworzyły „jego" obwód w rozdzielnicy. Trafiają teraz albo
    // do pomieszczenia, które faktycznie je obejmuje, albo do „Bez pomieszczenia".
    setDraft((d) => {
      const room = d.roomShapes.find((r) => r.id === id);
      if (!room) return d;
      const roomShapes = d.roomShapes.filter((r) => r.id !== id);
      return {
        ...d,
        roomShapes,
        openings: d.openings.filter((o) => o.roomId !== id),
        elements: reassignRoomsOnFloor(d.elements, roomShapes, room.floor, scaleOf(scales, room.floor), [room.name]),
      };
    });
  },

  removeElements: (ids) => {
    const { setDraft } = get();
    setDraft((d) => {
      const elements = d.elements.filter((e) => !ids.includes(e.id));
      return { ...d, elements, routeOverrides: pruneRouteOverrides(d.routeOverrides, elements) };
    });
  },

  setRouteOverride: (routeId, midPoints) => {
    const { setDraft } = get();
    setDraft((d) => ({ ...d, routeOverrides: { ...d.routeOverrides, [routeId]: midPoints } }));
  },

  clearRouteOverride: (routeId) => {
    const { setDraft } = get();
    setDraft((d) => {
      if (!(routeId in d.routeOverrides)) return d;
      const routeOverrides = { ...d.routeOverrides };
      delete routeOverrides[routeId];
      return { ...d, routeOverrides };
    });
  },
}));

/**
 * Selektory pomocnicze — komponent pobiera tylko elementy bieżącej kondygnacji,
 * bez subskrybowania się na zmiany na innych piętrach.
 *
 * `useShallow` NIE jest kosmetyką: `filter` tworzy nową tablicę przy każdym odczycie,
 * więc bez porównania po zawartości wynik miał nową tożsamość po KAŻDEJ zmianie
 * store'a — także zupełnie niezwiązanej (ceny, protokoły, nagłówek dokumentu). Każde
 * `useMemo` oparte na tych tablicach przeliczało się wtedy od nowa, łącznie z trasami
 * przewodów, które na większym planie kosztują kilkadziesiąt milisekund. Obietnica
 * z akapitu wyżej dopiero teraz jest prawdziwa.
 */
export const useActiveFloorElements = () =>
  useProjectStore(useShallow((s) => s.draft.elements.filter((e) => e.floor === s.activeFloorId)));

export const useActiveFloorWalls = () =>
  useProjectStore(useShallow((s) => s.draft.walls.filter((w) => w.floor === s.activeFloorId)));

export const useActiveFloorRoomShapes = () =>
  useProjectStore(useShallow((s) => s.draft.roomShapes.filter((r) => r.floor === s.activeFloorId)));

export const useActiveFloorOpenings = () =>
  useProjectStore(useShallow((s) => s.draft.openings.filter((o) => o.floor === s.activeFloorId)));

/**
 * Opcje doboru wspólne dla Rozdzielnicy, Schematu i Kosztorysu.
 *
 * Muszą być JEDNE. Te trzy zakładki pokazują ten sam obwód — front rozdzielnicy,
 * gałąź schematu i pozycję kosztorysu — a przekrój i zabezpieczenie nadpisuje w nich
 * `applySizing`. Gdy jedna z nich liczyła z innymi warunkami niż pozostałe, aparat
 * mówił „6 mm²", a kosztorys zamawiał 2,5 mm² i nic tej sprzeczności nie zgłaszało.
 * Dokładnie to stało się, gdy warunki doboru dostała tylko Rozdzielnica.
 *
 * Geometria CAŁEGO budynku, nie bieżącej kondygnacji: obwód potrafi sięgać kilku pięter,
 * a długość trasy liczy się osobno na każdym (patrz `estimateRoutesByFloor`).
 */
export function useOpcjeDoboru(): ProjectSizingOptions {
  const walls = useProjectStore((s) => s.draft.walls);
  const roomShapes = useProjectStore((s) => s.draft.roomShapes);
  const openings = useProjectStore((s) => s.draft.openings);
  const scales = useProjectStore((s) => s.scales);
  const floors = useProjectStore((s) => s.floors);
  const warunki = useProjectStore((s) => s.warunkiDoboru);
  return useMemo(
    () => ({
      scales,
      geometria: { walls, roomShapes, openings },
      kondygnacje: floors,
      sposob_ulozenia: warunki.sposobUlozenia,
      temperatura_otoczenia_C: warunki.temperaturaC,
      obwodow_w_wiazce: warunki.obwodowWWiazce,
      spadek_wlz_pct: warunki.spadekWlzPct,
      zapas_na_punkt_m: warunki.zapasNaPunktM,
    }),
    [walls, roomShapes, openings, scales, floors, warunki]
  );
}

/**
 * Autozapis lokalny — projekt nie ma jeszcze wymogu konta w chmurze (Supabase jest
 * opcjonalne), więc bez tego zamknięcie karty albo odświeżenie strony kasowało całą
 * pracę nad planem. Osobny klucz od `SESSION_KEY`: to jest sam projekt (plan, ceny,
 * protokoły…), nie dane logowania — ma przetrwać nawet wylogowanie.
 *
 * 1) Zaraz po utworzeniu store'a, zanim zamontuje się pierwszy komponent, wczytuje
 *    ostatnią zapisaną migawkę (jeśli jest) przez już istniejące `loadProjectPayload`.
 * 2) Subskrybuje się na każdą zmianę store'a i po 600 ms ciszy (debounce — żeby nie
 *    zapisywać przy każdym pojedynczym ruchu myszką) zapisuje świeżą migawkę.
 *    Porównanie z ostatnio zapisanym JSON-em zapobiega pisaniu do localStorage (i
 *    pętli przez `lastLocalSaveAt`, który też wywołuje subskrybenta) gdy nic w
 *    samych danych projektu faktycznie się nie zmieniło.
 */
const autosavedProject = loadAutosavedProject();
if (autosavedProject) {
  useProjectStore.getState().loadProjectPayload(autosavedProject);
}

let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
let lastAutosavedJson: string | null = autosavedProject ? JSON.stringify(autosavedProject) : null;

/**
 * Poprawki przypisań do pomieszczeń (`reconcileRoomsOnLoad`) trafiają do zapisu OD RAZU.
 *
 * Wczytanie leci przed `subscribe` niżej, a punktem odniesienia autozapisu jest surowa
 * migawka z pliku — czyli ta SPRZED przeliczenia. Bez tego zapisu poprawka żyłaby więc
 * wyłącznie w pamięci karty i czekała na dowolną inną zmianę, a do tego czasu każde
 * otwarcie projektu prostowałoby to samo od nowa i pokazywało ten sam komunikat.
 * Zapisujemy tylko wtedy, gdy faktycznie było co poprawiać.
 */
if (autosavedProject && useProjectStore.getState().roomsFixedOnLoad > 0) {
  lastAutosavedJson = JSON.stringify(useProjectStore.getState().getProjectPayload());
  try {
    localStorage.setItem(kluczAutozapisu(), lastAutosavedJson);
  } catch {
    // patrz komentarz w subskrybencie niżej — brak zapisu nie psuje pracy w tej karcie
  }
}

/**
 * Ciało autozapisu, wyjęte z licznika czasu, żeby dało się je wywołać NATYCHMIAST.
 *
 * Powód: `zapiszTerazLokalnie` niżej. Awaryjne przeładowanie strony (patrz
 * `ErrorBoundary`) wypada w środku okna 600 ms i bez wcześniejszego opróżnienia
 * bufora zabrałoby ze sobą ostatnie zmiany.
 */
function wykonajAutozapis(): void {
  const payload = useProjectStore.getState().getProjectPayload();
  const json = JSON.stringify(payload);
  if (json === lastAutosavedJson) return;
  lastAutosavedJson = json;
  const klucz = kluczAutozapisu();
  try {
    localStorage.setItem(klucz, json);
    odswiezWpisIndeksu();
    useProjectStore.setState({ lastLocalSaveAt: Date.now(), localSaveError: null });
  } catch {
      /**
       * Limit przeglądarki albo tryb prywatny. Dwie rzeczy, których tu wcześniej
       * brakowało — obie sprowadzają się do „nie udawaj, że zapisałeś".
       *
       * 1. RATUJEMY RYSUNEK. Podkład rzutu potrafi zająć prawie cały budżet
       *    `localStorage` (zdjęcie 4000 × 2800 to 4,8 MB przy ~5 MB limitu), a jest
       *    najmniej cenną częścią projektu: wgrywa się z pliku w dziesięć sekund,
       *    podczas gdy rozstawiony osprzęt powstawał godzinami. Druga próba idzie
       *    więc bez podkładów.
       * 2. MÓWIMY O TYM. Bez `localSaveError` wskaźnik zamierał na godzinie ostatniego
       *    udanego zapisu, nie zmieniając ani koloru, ani treści.
       */
    try {
      localStorage.setItem(klucz, JSON.stringify({ ...payload, bgImages: {} }));
      odswiezWpisIndeksu();
      useProjectStore.setState({ lastLocalSaveAt: Date.now(), localSaveError: "bezPodkladu" });
    } catch {
      useProjectStore.setState({ localSaveError: "brak" });
    }
  }
}

useProjectStore.subscribe(() => {
  if (autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    autosaveTimer = null;
    wykonajAutozapis();
  }, 600);
});

/**
 * Zapisuje projekt lokalnie NATYCHMIAST, nie czekając na debounce.
 *
 * Do użycia przed czynnością, po której ta karta przestanie istnieć — dziś jedyną
 * taką jest awaryjne przeładowanie po nieudanym pobraniu kodu zakładki. Bez tego
 * przeładowanie wypadające w oknie 600 ms zabrałoby ze sobą ostatnie zmiany, a
 * użytkownik nie miałby jak skojarzyć jednego z drugim.
 */
export function zapiszTerazLokalnie(): void {
  if (autosaveTimer) {
    clearTimeout(autosaveTimer);
    autosaveTimer = null;
  }
  wykonajAutozapis();
}

/**
 * Autozapis W CHMURZE — value-add zarezerwowany dla konta (patrz `saveToCloud`).
 * Sam mechanizm jest identyczny jak przy lokalnym wyżej (subskrypcja + debounce +
 * porównanie JSON-em), różnice są dwie:
 *  - działa TYLKO gdy jest aktywna sesja i Supabase jest skonfigurowany — bez
 *    konta i tak jest lokalny autosave, więc praca nigdy nie ginie;
 *  - dłuższy debounce (2,5 s zamiast 600 ms), bo to żądanie sieciowe do REST
 *    Supabase, nie zapis do localStorage — nie ma sensu strzelać nim przy
 *    każdym pojedynczym ruchu myszką.
 * Woła `saveToCloud()` na store'ie, więc automatyczny i ręczny zapis („Zapisz
 * teraz" w menu konta) to dokładnie ta sama ścieżka kodu — nie da się, żeby
 * jedno działało, a drugie nie.
 */
let cloudAutosaveTimer: ReturnType<typeof setTimeout> | null = null;

useProjectStore.subscribe(() => {
  if (!useProjectStore.getState().session || !SUPABASE_CONFIGURED) return;
  // Przykład NIE jest projektem użytkownika i nie ma czego robić na jego liście
  // w chmurze. Bez tej straży samo kliknięcie „Zobacz gotowy przykład" zakładałoby
  // komuś zalogowanemu wiersz „Przykład: mieszkanie 70 m²", którego nigdy nie chciał
  // zapisać — a potem wracałby do niego przy każdym wejściu w „Moje projekty".
  // Lokalny autozapis działa dalej, więc odświeżenie strony przykładu nie gubi.
  if (useProjectStore.getState().projektPrzykladowy) return;
  if (cloudAutosaveTimer) clearTimeout(cloudAutosaveTimer);
  cloudAutosaveTimer = setTimeout(() => {
    cloudAutosaveTimer = null;
    const state = useProjectStore.getState();
    if (!state.session || state.cloudBusy) return;
    // Zapis odbity przez limit NIE aktualizuje migawki, więc bez tej straży pętla
    // subskrypcja → timer → nieudany zapis nakręcałaby się bez końca, zgłaszając ten
    // sam błąd co 2,5 s (a wcześniej otwierając przy tym okno listy projektów).
    // Wstrzymanie zdejmuje dopiero udany zapis albo ręczna próba użytkownika.
    if (state.autozapisWstrzymany) return;
    const json = JSON.stringify(state.getProjectPayload());
    if (json === lastCloudSavedJson) return;
    void state.saveToCloud();
  }, 2500);
});
