import { create } from "zustand";
import type {
  InstallationElement,
  Wall,
  RoomShape,
  Opening,
  Floor,
  DocumentHeader,
  PriceTable,
  Point,
  ProtocolKey,
  PanelConfig,
  PanelDevice,
} from "@/types";
import { DEFAULT_PLAN_SIZE, nextRoomColor, nextRoomName, roomColorForIndex, scaleOf, type PlanSize } from "@/lib/design";
import { DEFAULT_PRICES } from "@/lib/costs";
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
const AUTOSAVE_KEY = "pomocnikelektryka_projekt_autosave";

/** Ostatnia migawka projektu, o której WIEMY, że jest w chmurze — ustawiana
 *  zarówno po udanym zapisie, jak i po wczytaniu projektu z chmury. Trzymana
 *  poza store'em (jak `lastAutosavedJson` niżej), żeby porównanie z bieżącym
 *  stanem nie wymagało osobnego zapisu do store'a przy każdej zmianie. */
let lastCloudSavedJson: string | null = null;

/** Nazwa, pod którą projekt trafił ostatnio do chmury. Zmiana nazwy musi wymusić
 *  ponowne sprawdzenie kolizji — patrz `saveToCloud`. */
let ostatniaZapisanaNazwa: string | null = null;

function loadStoredSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

function loadAutosavedProject(): ProjectPayload | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    return raw ? (JSON.parse(raw) as ProjectPayload) : null;
  } catch {
    return null;
  }
}

export interface ProtocolState {
  rows: ProtocolRow[];
  limit?: number;
}

/** Dane projektu do zapisu lokalnego/w chmurze — patrz `getProjectPayload`/`loadProjectPayload`. */
export interface ProjectPayload {
  draft: Draft;
  floors: Floor[];
  activeFloorId: string;
  bgImages: Record<string, string>;
  scales: Record<string, number>;
  prices: PriceTable;
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
}

const emptyDraft: Draft = { elements: [], walls: [], roomShapes: [], openings: [] };

interface ProjectState {
  draft: Draft;
  floors: Floor[];
  activeFloorId: string;
  bgImages: Record<string, string>;
  /** Metrów na jednostkę planu, per kondygnacja — brak wpisu = brak kalibracji. */
  scales: Record<string, number>;
  prices: PriceTable;
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

  /** Migawka danych projektu do zapisu (lokalnie lub w chmurze) — celowo bez
   *  historii cofnij/ponów i sesji/cloudId, które są stanem sesji, nie projektu. */
  getProjectPayload: () => ProjectPayload;
  /** Wczytuje migawkę danych projektu (np. z chmury) i czyści historię
   *  cofnij/ponów — to nowy punkt startowy, nie krok do cofnięcia. */
  loadProjectPayload: (payload: ProjectPayload) => void;

  setActiveFloorId: (id: string) => void;
  addFloor: (name: string) => void;
  removeFloor: (id: string) => void;

  setBgImage: (floorId: string, dataUrl: string | null) => void;
  setScale: (floorId: string, metersPerUnit: number) => void;
  clearScale: (floorId: string) => void;
  setPrice: (key: string, value: number) => void;
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
  loadProtokolyFromCloud: (id: string) => Promise<void>;
  /** Zaczyna nowy, pusty zestaw protokołów — odpina bieżący od zapisu w chmurze. */
  nowyZestawProtokolow: () => void;
  setLimitBlokada: (b: { rodzaj: RodzajDokumentu; komunikat: string } | null) => void;

  addRoomShape: (floor: string, points: Point[], name?: string) => void;
  renameRoomShape: (id: string, newName: string) => void;
  /** Przesuwa JEDEN narożnik obrysu — do edycji kształtu przeciąganiem na planie. */
  moveRoomShapePoint: (id: string, index: number, point: Point) => void;
  recolorRoomShape: (id: string) => void;
  deleteRoomShape: (id: string) => void;
  removeElements: (ids: string[]) => void;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  draft: emptyDraft,
  floors: [{ id: "f1", name: "Parter" }],
  activeFloorId: "f1",
  bgImages: {},
  scales: {},
  prices: { ...DEFAULT_PRICES },
  projectName: "Mój dom",
  protocols: {},
  panelConfig: { supply3f: true, mainRating: 40 },
  panelDevices: [],
  panelHidden: [],
  panelTryb: "zRzutu",
  panelOverrides: {},
  planSize: DEFAULT_PLAN_SIZE,
  onboarding: INITIAL_ONBOARDING,
  session: loadStoredSession(),
  cloudId: null,
  protokolyId: null,
  oknoZestawowOtwarte: false,
  autozapisWstrzymany: false,
  pytanieONadpisanie: null,
  protokolyNazwa: "",
  limitBlokada: null,
  lastLocalSaveAt: null,
  lastCloudSaveAt: null,
  cloudSaveError: null,
  cloudBusy: false,
  docHeader: {
    obiekt: "", adres: "", zleceniodawca: "", wykonawca: "", uprawnienia: "",
    przyrzad: "", nrFabryczny: "", swiadectwo: "",
    data: new Date().toISOString().slice(0, 10),
    temperatura: "20", wilgotnosc: "55", uklad: "TN-S",
    drawingNo: "E-01", revision: "A",
  },

  past: [],
  future: [],

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
  resetProject: () => {
    // Nowy projekt zaczyna bez powiązania z jakimkolwiek wierszem w chmurze —
    // bez wyzerowania tego automatyczny zapis w tle nadpisałby STARY projekt
    // pustym draftem zamiast założyć nowy wiersz.
    lastCloudSavedJson = null;
    ostatniaZapisanaNazwa = null;
    set((state) => ({
      draft: emptyDraft,
      past: [],
      future: [],
      bgImages: {},
      scales: {},
      prices: { ...DEFAULT_PRICES },
      protocols: {},
      cloudId: null,
      lastCloudSaveAt: null,
      cloudSaveError: null,
      floors: [{ id: "f1", name: "Parter" }],
      activeFloorId: "f1",
      projectName: "Mój dom",
      panelConfig: { supply3f: true, mainRating: 40 },
      panelDevices: [],
      panelHidden: [],
      panelTryb: "zRzutu",
      panelOverrides: {},
      planSize: DEFAULT_PLAN_SIZE,
      onboarding: INITIAL_ONBOARDING,
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
    const { draft, floors, activeFloorId, bgImages, scales, prices, docHeader, protocols, projectName, panelConfig, panelDevices, panelHidden, panelTryb, panelOverrides, planSize, onboarding } = get();
    return { draft, floors, activeFloorId, bgImages, scales, prices, docHeader, protocols, projectName, panelConfig, panelDevices, panelHidden, panelTryb, panelOverrides, planSize, onboarding };
  },

  loadProjectPayload: (payload) =>
    set({
      // `{...emptyDraft, ...payload.draft}` — zapisy sprzed dodania `openings`
      // (pole nowe w tym kroku) nie mają go w ogóle, więc bez tego fallbacku
      // każdy odczyt `draft.openings` na starym projekcie rzucałby na `undefined`.
      draft: { ...emptyDraft, ...payload.draft },
      floors: payload.floors.length ? payload.floors : [{ id: "f1", name: "Parter" }],
      activeFloorId: payload.activeFloorId || payload.floors[0]?.id || "f1",
      bgImages: payload.bgImages,
      scales: payload.scales,
      prices: { ...DEFAULT_PRICES, ...payload.prices },
      docHeader: payload.docHeader,
      protocols: payload.protocols,
      projectName: payload.projectName || "Projekt",
      // `panelConfig` dodane po pierwszych zapisach w chmurze/lokalnie — starsze
      // migawki go nie mają, stąd fallback do domyślnej konfiguracji. Starsze zapisy
      // MOGĄ mieć w środku jeszcze pole `spd` sprzed usunięcia go z typu — zostaje
      // wtedy nieużywane w obiekcie (nikt go już nie czyta), nie trzeba go czyścić.
      panelConfig: payload.panelConfig || { supply3f: true, mainRating: 40 },
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
      past: [],
      future: [],
    }),

  setActiveFloorId: (id) => set({ activeFloorId: id }),

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
      return {
        floors: [...state.floors, { id, name }],
        activeFloorId: id,
        scales: inherited === null ? state.scales : { ...state.scales, [id]: inherited },
        // Obszar planu też jest wspólny — inaczej odziedziczona skala opisywałaby
        // rysunek o innych wymiarach, czyli już nie ta sama skala.
      };
    }),

  removeFloor: (id) =>
    set((state) => {
      if (state.floors.length <= 1) return state;
      const floors = state.floors.filter((f) => f.id !== id);
      const draft: Draft = {
        elements: state.draft.elements.filter((e) => e.floor !== id),
        walls: state.draft.walls.filter((w) => w.floor !== id),
        roomShapes: state.draft.roomShapes.filter((r) => r.floor !== id),
        openings: state.draft.openings.filter((o) => o.floor !== id),
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

  setDocHeader: (patch) =>
    set((state) => ({ docHeader: { ...state.docHeader, ...patch } })),

  setProjectName: (name) => set({ projectName: name }),

  setPanelConfig: (patch) => set((state) => ({ panelConfig: { ...state.panelConfig, ...patch } })),

  setPanelDevices: (devices) => set({ panelDevices: devices }),
  setPanelHidden: (keys) => set({ panelHidden: keys }),
  setPanelTryb: (tryb) => set({ panelTryb: tryb }),
  setPanelOverrides: (o) => set({ panelOverrides: o }),

  setPlanSize: (size) => set({ planSize: size }),

  setOnboarding: (patch) => set((state) => ({ onboarding: { ...state.onboarding, ...patch } })),

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
    set({ cloudBusy: true, cloudSaveError: null, limitBlokada: null, ...(opcje?.reczny ? { autozapisWstrzymany: false } : {}) });
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
        await supaUpdateProject(session.token, docelowyId, { name: projectName, data, updated_at: new Date().toISOString() });
        if (docelowyId !== cloudId) set({ cloudId: docelowyId });
      } else {
        const [row] = await supaInsertProject(session.token, { user_id: session.user.id, name: projectName, data });
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

  nowyZestawProtokolow: () => set({ protokolyId: null, protokolyNazwa: "", protocols: {} }),

  saveProtokolyToCloud: async (nazwa, opcje) => {
    const { docHeader, protocols, protokolyId, zapewnijSesje } = get();
    const session = await zapewnijSesje();
    if (!session) return;
    set({ cloudBusy: true, cloudSaveError: null, limitBlokada: null });
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
        await supaUpdateProject(session.token, docelowyId, { name: tytul, data, updated_at: new Date().toISOString() });
        if (docelowyId !== protokolyId) set({ protokolyId: docelowyId });
      } else {
        const [row] = await supaInsertProject(session.token, { user_id: session.user.id, name: tytul, data });
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
      });
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
      lastCloudSavedJson = JSON.stringify(getProjectPayload());
      // Nazwa wczytanego projektu liczy się jako „ostatnio zapisana" — inaczej
      // pierwszy autozapis po wczytaniu uznałby ją za zmienioną i niepotrzebnie
      // pobierał listę, żeby sprawdzić kolizję z samym sobą.
      ostatniaZapisanaNazwa = row.name || "Projekt";
      set({ cloudId: row.id, lastCloudSaveAt: Date.now() });
    } catch (e) {
      set({ cloudSaveError: e instanceof Error ? e.message : "Nie udało się wczytać projektu" });
    } finally {
      set({ cloudBusy: false });
    }
  },

  addRoomShape: (floor, points, name) => {
    const { draft, setDraft } = get();
    const countHere = draft.roomShapes.filter((r) => r.floor === floor).length;
    const room: RoomShape = {
      id: crypto.randomUUID(),
      floor,
      name: name?.trim() || nextRoomName(countHere),
      color: roomColorForIndex(countHere),
      points,
    };
    setDraft((d) => ({ ...d, roomShapes: [...d.roomShapes, room] }));
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

  moveRoomShapePoint: (id, index, point) => {
    const { setDraft } = get();
    setDraft((d) => ({
      ...d,
      roomShapes: d.roomShapes.map((r) =>
        r.id === id ? { ...r, points: r.points.map((p, i) => (i === index ? point : p)) } : r
      ),
    }));
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
    const { setDraft } = get();
    setDraft((d) => ({ ...d, roomShapes: d.roomShapes.filter((r) => r.id !== id) }));
  },

  removeElements: (ids) => {
    const { setDraft } = get();
    setDraft((d) => ({ ...d, elements: d.elements.filter((e) => !ids.includes(e.id)) }));
  },
}));

/** Selektory pomocnicze — komponent pobiera tylko elementy bieżącej kondygnacji,
 *  bez subskrybowania się na zmiany na innych piętrach. */
export const useActiveFloorElements = () =>
  useProjectStore((s) => s.draft.elements.filter((e) => e.floor === s.activeFloorId));

export const useActiveFloorWalls = () =>
  useProjectStore((s) => s.draft.walls.filter((w) => w.floor === s.activeFloorId));

export const useActiveFloorRoomShapes = () =>
  useProjectStore((s) => s.draft.roomShapes.filter((r) => r.floor === s.activeFloorId));

export const useActiveFloorOpenings = () =>
  useProjectStore((s) => s.draft.openings.filter((o) => o.floor === s.activeFloorId));

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

useProjectStore.subscribe(() => {
  if (autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    autosaveTimer = null;
    const payload = useProjectStore.getState().getProjectPayload();
    const json = JSON.stringify(payload);
    if (json === lastAutosavedJson) return;
    lastAutosavedJson = json;
    try {
      localStorage.setItem(AUTOSAVE_KEY, json);
      useProjectStore.setState({ lastLocalSaveAt: Date.now() });
    } catch {
      // limit przeglądarki / tryb prywatny — projekt działa nadal w tej karcie, tylko bez zapisu
    }
  }, 600);
});

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
