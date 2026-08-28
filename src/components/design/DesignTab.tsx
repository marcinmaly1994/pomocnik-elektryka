import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent, type MouseEvent as ReactMouseEvent } from "react";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Pencil,
  Pin,
  RotateCw,
  ShieldAlert,
  Trash2,
  Undo2,
  Upload,
  X,
} from "lucide-react";
import {
  useActiveFloorElements,
  useActiveFloorOpenings,
  useActiveFloorRoomShapes,
  useActiveFloorWalls,
  useProjectStore,
} from "@/store/useProjectStore";
import type { ElementType, Point } from "@/types";
import { computeSanitaryZones, NO_ROOM, VARIANTS_FOR } from "@/lib/elements";
import { computeLightGroups } from "@/lib/lightGroups";
import { computeCircuits } from "@/lib/panel/circuits";
import { applyRouteOverrides, buildCableRoutes, findPanel } from "@/lib/panel/loads";
import {
  DEFAULT_WALL_THICKNESS,
  MANUAL_DRAW_SCALE_MPU,
  defaultOpeningWidth,
  nextRoomName,
  planSizeForImage,
  scaleOf,
} from "@/lib/design";
import { pointInPolygon } from "@/lib/geometry";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { hasSeenOnboarding, markOnboardingSeen, useOnboardingProgress } from "@/hooks/useOnboardingProgress";
import { shouldShowCompact, planWidthMeters } from "@/lib/onboarding";
import { OnboardingChecklist } from "@/components/onboarding/OnboardingChecklist";
import { CoachMark } from "@/components/onboarding/CoachMark";
import { useFloorPlanUpload } from "@/hooks/useFloorPlanUpload";
import { CropTool } from "@/components/detect/CropTool";
import { DesignCanvas, MAX_ZOOM, MIN_ZOOM, wysokoscPlotna, type RoomDrawMode, type Selection, type ToolMode } from "./DesignCanvas";
import { ScaleCalibrationTool } from "./ScaleCalibrationTool";
import { EditorToolbar } from "./EditorToolbar";
import { EditorStatusBar } from "./EditorStatusBar";
import { ToolRail } from "./ToolRail";
import { ElementLibrary } from "./ElementLibrary";
import { RoomPanel } from "./RoomPanel";
import { EditElementModal } from "./EditElementModal";
import type Konva from "konva";
import { ELEMENT_TYPES, libSubtitle } from "@/lib/elements";
import { GlyphPreview } from "@/components/design/ElementGlyphSvg";
import { buildDrawingPdf } from "@/lib/pdf/drawing";
import { bialePlotno, plotnoDoPdf, svgDoPlotna, PIKSELI_NA_PUNKT } from "@/lib/pdf/raster";
import { projectFileName } from "@/lib/pdf/download";
import { resolveDocHeader } from "@/lib/docHeader";
import { PdfPreview } from "@/components/ui/PdfPreview";

const DEFAULT_ROOM_SUGGESTIONS = ["Salon", "Kuchnia", "Łazienka", "Sypialnia", "Korytarz"];


/** Bazowa geometria glifów okazała się za duża w skali planu (symbole zlewały się przy
 *  gęściej rozstawionych punktach), więc RENDER zawsze mnożymy przez ten współczynnik —
 *  niezależnie od tego, co pokazuje suwak. Suwak ma pokazywać „1.0×" jako punkt
 *  odniesienia (czyli „bez zmian względem domyślnego"), a nie bazową, zbyt dużą geometrię. */
const BASE_ELEMENT_SCALE = 0.7;

/** Wartość suwaka, od której użytkownik startuje i do której wraca „reset". To mnożnik
 *  WZGLĘDEM BASE_ELEMENT_SCALE, nie bezpośredni rozmiar renderu — patrz przeliczenie
 *  `elementScale * BASE_ELEMENT_SCALE` przekazywane do DesignCanvas. */
const DEFAULT_ELEMENT_SCALE = 1;

/**
 * Szerokość pasa przy krawędzi okna, który w pełnym ekranie wysuwa schowany pasek —
 * i zarazem szerokość widocznego uchwytu, który ten pas zapowiada.
 *
 * Te dwie wartości MUSZĄ być równe. Gdyby uchwyt był szerszy od pasa, najechanie na
 * jego zewnętrzną część nic by nie robiło: użytkownik celuje w widoczny element,
 * a ten milczy — najgorszy możliwy rodzaj kontrolki.
 *
 * 24 px, a nie 1–2: przy szybkim ruchu myszy kursor przeskakuje między klatkami
 * kilka pikseli i cieńszy pas dawał się „przestrzelić" bez efektu.
 */
const PAS_WYZWALAJACY = 24;

const ROOM_MODES: { id: RoomDrawMode; label: string; hint: string }[] = [
  { id: "prostokat", label: "Prostokąt", hint: "przytrzymaj lewy przycisk i przeciągnij" },
  { id: "wielobok", label: "Wielobok", hint: "klikaj kolejne narożniki, na koniec kliknij w pierwszy" },
];

/** Klucz w localStorage: użytkownik już raz odrzucił prompt „zabezpiecz kontem"
 *  po włożeniu sporo pracy — nie wracamy do niego po każdym odświeżeniu, bo
 *  stały baner o ryzyku (patrz niżej) i tak zostaje widoczny cały czas. */
const KONTO_PROMPT_ODRZUCONY_KEY = "pomocnikelektryka_konto_prompt_odrzucony";
/** Próg „sporo pracy": tyle elementów na planie uznajemy za projekt, którego
 *  szkoda by było stracić przez wyczyszczenie danych przeglądarki. */
const KONTO_PROMPT_PROG_ELEMENTOW = 10;

function odczytajOdrzuconyPrompt(): boolean {
  try {
    return localStorage.getItem(KONTO_PROMPT_ODRZUCONY_KEY) === "1";
  } catch {
    // prywatny tryb przeglądarki potrafi rzucać przy dostępie do localStorage —
    // brak tej flagi jest nieszkodliwy, prompt po prostu pokaże się ponownie
    return false;
  }
}

/** Zwinięcie panelu bocznego to preferencja widoku, nie część projektu — stąd
 *  localStorage, a nie zapisywany dokument. Kto raz zwinie, ma zwinięty na stałe. */
const PANEL_ZWINIETY_KEY = "pomocnikelektryka_panel_zwiniety";

function odczytajPanelZwiniety(): boolean {
  try {
    return localStorage.getItem(PANEL_ZWINIETY_KEY) === "1";
  } catch {
    // patrz odczytajOdrzuconyPrompt — brak flagi znaczy „domyślnie rozwinięty"
    return false;
  }
}

/**
 * Czy panel narzędzi w pełnym ekranie jest przypięty na stałe.
 *
 * Chowa się WYŁĄCZNIE panel lewy. Pasek górny i dolny stoją na stałe: są niskie
 * (~46 i ~54 px), więc odzysk miejsca był znikomy, a koszt spory — wysuwały się
 * pod kursorem w trakcie pracy i wchodziły w drogę przypiętym narzędziom. Miejsce
 * na planie realnie odzyskuje tylko schowanie panelu bocznego, bo ten ma ~370 px.
 */
const PRZYPIETE_KEY = "pomocnikelektryka_przypiete_panele";

function odczytajPrzypietyPanel(): boolean {
  try {
    const raw = localStorage.getItem(PRZYPIETE_KEY);
    if (!raw) return false;
    // Czytamy jedno pole, zamiast ufać kształtowi z JSON-a: w localStorage może
    // siedzieć wpis ze starszej wersji (trzy paski) albo ręcznie zepsuty.
    return (JSON.parse(raw) as { lewo?: unknown }).lewo === true;
  } catch {
    return false;
  }
}

export interface DesignTabProps {
  /** Otwiera modal logowania — sam DesignTab go nie renderuje (żyje w App.tsx
   *  razem z resztą kont/chmury), więc oddajemy sterowanie do rodzica. */
  onOpenAuth: () => void;
}

export function DesignTab({ onOpenAuth }: DesignTabProps) {
  const session = useProjectStore((s) => s.session);
  const saveToCloud = useProjectStore((s) => s.saveToCloud);
  const cloudBusy = useProjectStore((s) => s.cloudBusy);
  const activeFloorId = useProjectStore((s) => s.activeFloorId);
  const setDraft = useProjectStore((s) => s.setDraft);
  const addRoomShape = useProjectStore((s) => s.addRoomShape);
  const renameRoomShape = useProjectStore((s) => s.renameRoomShape);
  const deleteRoomShape = useProjectStore((s) => s.deleteRoomShape);
  const moveRoomShapePoint = useProjectStore((s) => s.moveRoomShapePoint);
  const removeElements = useProjectStore((s) => s.removeElements);
  const routeOverrides = useProjectStore((s) => s.draft.routeOverrides);
  const setRouteOverride = useProjectStore((s) => s.setRouteOverride);
  const clearRouteOverride = useProjectStore((s) => s.clearRouteOverride);
  const cofnijZatwierdzone = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);
  const maZatwierdzoneDoCofniecia = useProjectStore((s) => s.past.length > 0);
  const canRedo = useProjectStore((s) => s.future.length > 0);
  const bgImageUrl = useProjectStore((s) => s.bgImages[s.activeFloorId] ?? null);
  const setBgImage = useProjectStore((s) => s.setBgImage);
  const planSize = useProjectStore((s) => s.planSize);
  const setPlanSize = useProjectStore((s) => s.setPlanSize);
  const scales = useProjectStore((s) => s.scales);
  const setScale = useProjectStore((s) => s.setScale);
  const clearScale = useProjectStore((s) => s.clearScale);
  const mpu = scaleOf(scales, activeFloorId); // metrów na jednostkę planu (null = brak kalibracji)

  const floors = useProjectStore((s) => s.floors);
  const floorName = floors.find((f) => f.id === activeFloorId)?.name ?? "Kondygnacja";

  const elements = useActiveFloorElements();
  const rawDocHeader = useProjectStore((st) => st.docHeader);
  const projectName = useProjectStore((st) => st.projectName);
  const stageRef = useRef<Konva.Stage | null>(null);
  const glifyRef = useRef<HTMLDivElement>(null);
  const [podgladPdf, setPodgladPdf] = useState(false);
  const docHeader = resolveDocHeader(rawDocHeader, projectName);

  /**
   * Symbole użyte NA TEJ kondygnacji, do legendy. Kluczem jest typ RAZEM z liczbą
   * klawiszy/gniazd, bo glif łącznika grupowego różni się od pojedynczego — legenda
   * musi pokazywać dokładnie ten znak, który stoi na rysunku.
   *
   * Sortowane ALFABETYCZNIE po opisie: legenda jest tablicą do sprawdzania „co to za
   * znak", więc czyta się ją wyszukiwaniem, a nie od góry do dołu.
   */
  const uzyteSymbole = useMemo(() => {
    const wpisy = new Map<string, { type: ElementType; gangs: number }>();
    for (const el of elements) {
      wpisy.set(`${el.type}:${el.gangs || 1}`, { type: el.type, gangs: el.gangs || 1 });
    }
    return [...wpisy.values()].sort((a, b) =>
      ELEMENT_TYPES[a.type].label.localeCompare(ELEMENT_TYPES[b.type].label, "pl")
    );
  }, [elements]);

  /**
   * Rzut do PDF-a: rysunek rasteryzowany ze sceny Konvy + legenda złożona z glifów
   * tych samych komponentów, które rysują paletę elementów.
   *
   * Scena eksportuje się przez `toCanvas` z `pixelRatio` liczonym pod DRUK, a nie pod
   * ekran — na ekranie rzut ma kilkaset pikseli szerokości i wydrukowany wyglądałby
   * jak powiększony zrzut.
   */
  async function zbudujPdfRzutu(): Promise<Uint8Array> {
    const stage = stageRef.current;
    if (!stage) throw new Error("Rzut nie jest jeszcze gotowy.");

    // Pole rysunku obok legendy, przeliczone na piksele druku.
    const docelowaSzer = Math.round(600 * PIKSELI_NA_PUNKT);
    const plotno = stage.toCanvas({ pixelRatio: docelowaSzer / stage.width() }) as HTMLCanvasElement;
    // Scena Konvy jest przezroczysta — bez podłożenia bieli wychodzi czarna płachta.
    const naBieli = bialePlotno(plotno.width, plotno.height);
    naBieli.getContext("2d")!.drawImage(plotno, 0, 0);

    const legenda = [];
    for (const sym of uzyteSymbole) {
      const svg = glifyRef.current?.querySelector<SVGSVGElement>(`[data-glif="${sym.type}:${sym.gangs}"] svg`);
      if (!svg) continue;
      const wariant = libSubtitle(sym.type, sym.gangs);
      legenda.push({
        symbol: await plotnoDoPdf(await svgDoPlotna(svg, 96)),
        opis: wariant && sym.gangs > 1 ? `${ELEMENT_TYPES[sym.type].label} — ${wariant}` : ELEMENT_TYPES[sym.type].label,
      });
    }

    return buildDrawingPdf({
      tytul: `Rzut — ${floorName}`,
      header: docHeader,
      rysunek: await plotnoDoPdf(naBieli),
      legenda,
    });
  }
  const walls = useActiveFloorWalls();
  const roomShapes = useActiveFloorRoomShapes();
  const openings = useActiveFloorOpenings();

  const [sidebarTab, setSidebarTab] = useState<"elementy" | "pomieszczenia">("elementy");
  const [panelZwiniety, setPanelZwiniety] = useState(odczytajPanelZwiniety);

  const [toolMode, setToolMode] = useState<ToolMode>("zaznacz");
  const [activeType, setActiveType] = useState<ElementType>("gniazdko");
  const [dedicated, setDedicated] = useState(false);
  const [gangsByType, setGangsByType] = useState<Partial<Record<ElementType, number>>>({});
  const [snapOn, setSnapOn] = useState(false);
  /** Widoczność siatki — osobno od przyciągania. Domyślnie włączona, bo bez rzutu
   *  pod spodem to jedyny punkt odniesienia przy rysowaniu od zera. */
  const [gridOn, setGridOn] = useState(true);
  const [selected, setSelected] = useState<Selection>(null);
  const [multiSelected, setMultiSelected] = useState<string[]>([]);
  const [drawingWall, setDrawingWall] = useState<Point[]>([]);
  /** Grubość NOWEJ ściany (jedn. planu) — ustawienie edytora jak `snapOn`, nie
   *  część zapisywanego projektu. Trafia na ścianę dopiero w `finishWall`. */
  const [wallThickness, setWallThickness] = useState(DEFAULT_WALL_THICKNESS);
  /** Wymuszanie kątów prostych przy rysowaniu ściany: każdy kolejny odcinek jest
   *  albo poziomy, albo pionowy względem poprzedniego punktu — przydatne przy
   *  ścianach nośnych/działowych, które niemal zawsze są prostopadłe. */
  const [orthoWalls, setOrthoWalls] = useState(false);
  const [drawingRoomPoints, setDrawingRoomPoints] = useState<Point[]>([]);
  const [roomMode, setRoomMode] = useState<RoomDrawMode>("prostokat");
  const [pendingRoom, setPendingRoom] = useState<{ points: Point[]; name: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [calibPoints, setCalibPoints] = useState<Point[]>([]);
  /** Potwierdzenie tuż po zatwierdzeniu skali — znika razem z pigułką narzędzia
   *  kalibracji (`toolMode` wraca do „zaznacz"), więc bez tego wynik był widoczny
   *  wyłącznie w drobnym pasku stanu POD całym płótnem. Kto właśnie podał wymiar,
   *  patrzy w to miejsce na górze, nie w dół strony. */
  const [skalaPotwierdzenie, setSkalaPotwierdzenie] = useState<string | null>(null);
  useEffect(() => {
    if (!skalaPotwierdzenie) return;
    const t = setTimeout(() => setSkalaPotwierdzenie(null), 4000);
    return () => clearTimeout(t);
  }, [skalaPotwierdzenie]);
  const [showZones, setShowZones] = useState(true);
  /** Widoczność tras przewodów — domyślnie WYŁĄCZONA: to warstwa poglądowa, nie
   *  zawsze potrzebna, i bez rozdzielnicy postawionej na planie i tak jest pusta
   *  (patrz `cableRoutes` niżej), więc nie ma po co narzucać jej od razu. */
  const [showRoutes, setShowRoutes] = useState(false);
  // Skala samych symboli na planie (nie powiększenie widoku) — ustawienie widoku, więc
  // stan lokalny jak snapOn/showZones, a nie część zapisywanego projektu.
  const [elementScale, setElementScale] = useState(DEFAULT_ELEMENT_SCALE);
  const [zoom, setZoom] = useState(1);
  /** Gdy użytkownik sam ustawi powiększenie, przestajemy je dopasowywać automatycznie —
   *  nic bardziej nie irytuje niż widok, który sam sobie zmienia skalę po zmianie okna. */
  const [zoomReczny, setZoomReczny] = useState(false);
  /**
   * Tryb pełnoekranowy: plan zajmuje całe okno, a paski chowają się poza jego
   * krawędzie i wracają po najechaniu myszą. Świadomie NIE używamy tu
   * `requestFullscreen()` — natywny pełny ekran zabiera pasek kart i przycisk
   * wstecz, a przy narzędziu, w którym wgrywa się pliki i otwiera okna dialogowe,
   * to raczej pułapka niż udogodnienie. Tu chodzi o oddanie planowi miejsca
   * wewnątrz strony, nie o przejęcie całego monitora.
   */
  const [pelnyEkran, setPelnyEkran] = useState(false);
  /** Czy panel narzędzi jest w tej chwili odsłonięty kursorem (tylko w pełnym ekranie). */
  const [chromeLewo, setChromeLewo] = useState(false);
  /** Przypięty panel zostaje widoczny niezależnie od tego, gdzie jest kursor. */
  const [przypietyPanel, setPrzypietyPanel] = useState(odczytajPrzypietyPanel);
  /** Zmierzone rozmiary pasków — potrzebne, żeby paski ODSUNĘŁY płótno, zamiast
   *  położyć się na rysunku. Mierzymy, a nie wpisujemy na sztywno, bo szerokość
   *  lewej karty zmienia się ze zwinięciem panelu, a wysokość górnego paska zależy
   *  od tego, czy zawinie się na węższym ekranie. */
  const [rozmiaryChrome, setRozmiaryChrome] = useState({ gora: 0, lewo: 0, dol: 0 });
  const pelnyEkranRef = useRef<HTMLDivElement>(null);
  const gornyPasekRef = useRef<HTMLDivElement>(null);
  const lewaKartaRef = useRef<HTMLDivElement>(null);
  const dolnyPasekRef = useRef<HTMLDivElement>(null);
  const kolumnaPlotnaRef = useRef<HTMLDivElement>(null);
  const [wysPlotna, setWysPlotna] = useState(wysokoscPlotna);
  const ostatniaSzerRef = useRef(0);
  const [cursor, setCursor] = useState<Point | null>(null);
  /** Nazwa pliku podkładu — sam „wgrany" nie mówi, KTÓRY rzut leży pod spodem. */
  const [bgName, setBgName] = useState<string | null>(null);
  const [outsideHint, setOutsideHint] = useState(false);
  const outsideHintTimer = useRef<number | undefined>(undefined);
  const [kontoPromptOdrzucony, setKontoPromptOdrzucony] = useState(odczytajOdrzuconyPrompt);

  /**
   * Pinezka przypinająca pasek w pełnym ekranie. Renderowana wewnątrz samego paska,
   * więc wjeżdża i zjeżdża razem z nim — dzięki temu widać ją dokładnie wtedy, gdy
   * jest do czego się odnieść, i nie zaśmieca rysunku, gdy pasek jest schowany.
   */
  function Pinezka({ klasa }: { klasa: string }) {
    return (
      <button
        onClick={przelaczPrzypiecie}
        title={przypietyPanel ? "Odepnij — panel znów będzie się chował" : "Przypnij — panel zostanie na widoku"}
        aria-label={przypietyPanel ? "Odepnij pasek: lewo" : "Przypnij pasek: lewo"}
        aria-pressed={przypietyPanel}
        className={`${klasa} rounded p-1 transition-colors ${przypietyPanel ? "text-copper" : "text-slate-300 hover:text-slate-500"}`}
      >
        {przypietyPanel ? <Pin size={13} fill="currentColor" /> : <Pin size={13} />}
      </button>
    );
  }

  /**
   * Dopasowuje powiększenie tak, żeby rzut wypełnił dostępne miejsce.
   *
   * Bez tego na szerokim monitorze plan zostawał w rozmiarze 1:1 i tonął w szarym
   * tle — aplikacja wyglądała na pustą, choć miejsce było. Ograniczamy się
   * SZEROKOŚCIĄ I WYSOKOŚCIĄ naraz: samo dopasowanie do szerokości robiłoby
   * z niskiego rzutu pasek wymagający przewijania w pionie.
   */
  const dopasujZoom = useCallback(() => {
    const el = kolumnaPlotnaRef.current;
    if (!el) return;
    const dostepnaSzer = el.clientWidth - 2;
    if (dostepnaSzer <= 0) return;
    const z = Math.min(dostepnaSzer / planSize.w, wysPlotna / planSize.h);
    setZoom(Math.round(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z)) * 100) / 100);
  }, [planSize.w, planSize.h, wysPlotna]);

  useEffect(() => {
    // W pełnym ekranie płótno bierze całą wysokość okna: paski leżą NAD nim jako
    // nakładki, więc nie ma już nagłówka ani paska etapów, na które trzeba zostawić
    // zapas (patrz `wysokoscPlotna`).
    // Przypięte paski zajmują górę/dół okna na stałe, więc płótno musi o tyle
    // zmaleć — inaczej jego dolna krawędź chowałaby się pod przypiętym paskiem stanu.
    const zajetePionowo = rozmiaryChrome.gora + rozmiaryChrome.dol;
    const przelicz = () =>
      setWysPlotna(pelnyEkran ? Math.max(320, window.innerHeight - 16 - zajetePionowo) : wysokoscPlotna());
    przelicz();
    window.addEventListener("resize", przelicz);
    return () => window.removeEventListener("resize", przelicz);
  }, [pelnyEkran, rozmiaryChrome.gora, rozmiaryChrome.dol]);

  /** Wejście i wyjście z pełnego ekranu zmienia dostępne miejsce skokowo, więc rzut
   *  dopasowujemy na nowo — nawet jeśli użytkownik wcześniej ustawił zoom ręcznie.
   *  Zostawienie starego powiększenia dawało rysunek wielkości znaczka w rogu
   *  pustego ekranu, czyli dokładne przeciwieństwo tego, po co się tu wchodzi. */
  const przelaczPelnyEkran = useCallback(() => {
    setPelnyEkran((v) => !v);
    setZoomReczny(false);
    setChromeLewo(false);
  }, []);

  /**
   * O odsłonięciu pasków decyduje POZYCJA KURSORA, a nie `mouseenter`/`mouseleave`
   * na samych panelach.
   *
   * Zdarzenia najechania są tu zawodne z konkretnego powodu: panel wjeżdża pod
   * nieruchomy kursor, a przeglądarka nie zawsze przelicza wtedy stan `hover`.
   * Panel potrafi więc nigdy nie dostać `mouseenter` — a skoro nie wszedł, to
   * późniejsze `mouseleave` też nie ma prawa się pojawić i panel zostaje otwarty
   * na zawsze. W praktyce łapie to każdego, kto zatrzyma mysz przy krawędzi
   * i szarpnie nią w bok.
   *
   * Histereza: zamknięty panel otwiera dopiero wejście w wąski pas przy krawędzi,
   * a otwarty zamyka się dopiero po wyjściu poza JEGO WŁASNY obrys. Bez tego panel
   * mrugałby w kółko na granicy pasa wyzwalającego.
   */
  const obsluzRuchMyszy = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      if (!pelnyEkran) return;
      // Liczone względem KONTENERA, nie okna: kontener nie zawsze pokrywa się z oknem
      // co do piksela, a uchwyt jest pozycjonowany właśnie w nim — liczenie od
      // `window` rozjeżdżało próg z widocznym uchwytem o tyle, o ile kontener jest
      // przesunięty, i najechanie na uchwyt nic nie robiło.
      const ramka = pelnyEkranRef.current?.getBoundingClientRect();
      if (!ramka) return;
      const x = e.clientX - ramka.left;
      // Tylko lewa krawędź — paski poziome stoją na stałe i nie reagują na kursor.
      const szerLewej = lewaKartaRef.current?.offsetWidth ?? 0;
      setChromeLewo(x <= (chromeLewo ? szerLewej : PAS_WYZWALAJACY));
    },
    [pelnyEkran, chromeLewo],
  );

  /** Kursor opuszczający okno chowa panel — inaczej zostawałby otwarty po zjechaniu
   *  myszą poza przeglądarkę. Przypięty zostaje, bo o to w przypięciu chodzi. */
  const schowajChrome = useCallback(() => {
    setChromeLewo(false);
  }, []);

  /** Kontener przewijania płótna — DesignCanvas trzyma go u siebie, ale zmiany
   *  szerokości panelu muszą go przewinąć, więc sięgamy po niego przez kolumnę
   *  płótna. Jedyny element z `overflow-auto` w tej kolumnie to okno rysunku. */
  const kontenerPlotna = useCallback(
    () => kolumnaPlotnaRef.current?.querySelector<HTMLDivElement>("div.overflow-auto") ?? null,
    [],
  );
  /** Pozycja lewej krawędzi okna rysunku sprzed zmiany układu — do skompensowania skoku. */
  const lewaPrzedZmiana = useRef<number | null>(null);

  /** Wywoływane TUŻ PRZED każdą zmianą, która zwęża albo poszerza obszar rysunku. */
  const zapamietajKadr = useCallback(() => {
    lewaPrzedZmiana.current = kontenerPlotna()?.getBoundingClientRect().left ?? null;
  }, [kontenerPlotna]);

  /** Panel otwiera się sam, gdy sięgasz po narzędzie, które go potrzebuje — ale
   *  ŻADNE narzędzie go nie zamyka. Automatyczne chowanie zabierałoby bibliotekę
   *  dokładnie wtedy, gdy jest najbardziej potrzebna: zaraz po obrysowaniu pokoju
   *  stawia się w nim gniazdka (ta sama pułapka, przez którą wcześniej wycofano
   *  automatyczne przełączanie zawartości panelu — patrz komentarz przy ToolRail). */
  const rozwinPanel = useCallback(() => {
    zapamietajKadr();
    setPanelZwiniety(false);
    try {
      localStorage.setItem(PANEL_ZWINIETY_KEY, "0");
    } catch {
      /* patrz odczytajPanelZwiniety */
    }
  }, [zapamietajKadr]);

  const przelaczPanel = useCallback(() => {
    zapamietajKadr();
    setPanelZwiniety((zwiniety) => {
      const nowy = !zwiniety;
      try {
        localStorage.setItem(PANEL_ZWINIETY_KEY, nowy ? "1" : "0");
      } catch {
        /* patrz odczytajPanelZwiniety */
      }
      return nowy;
    });
  }, [zapamietajKadr]);

  const przelaczPrzypiecie = useCallback(() => {
    zapamietajKadr();
    setPrzypietyPanel((p) => {
      const nowy = !p;
      try {
        localStorage.setItem(PRZYPIETE_KEY, JSON.stringify({ lewo: nowy }));
      } catch {
        /* patrz odczytajPrzypietyPanel */
      }
      return nowy;
    });
  }, [zapamietajKadr]);

  /**
   * Każda zmiana szerokości panelu przesuwa obszar rysunku w bok, więc plan skakał
   * i trzeba go było szukać od nowa: o ~370 px przy przypięciu w pełnym ekranie
   * i o ~270 px przy zwijaniu panelu w widoku standardowym. Kompensujemy to
   * przewinięciem o dokładnie tyle, o ile przesunęła się lewa krawędź okna rysunku —
   * rysunek zostaje pod tym samym miejscem EKRANU.
   *
   * `useLayoutEffect`, bo przewinięcie musi wejść w tej samej klatce co nowy układ —
   * inaczej widać przeskok, czyli dokładnie to, co naprawiamy.
   *
   * Gdy cały rzut mieści się w oknie, nie ma czego przewijać i plan przecentruje się
   * w nowym obszarze (a przy automatycznym dopasowaniu jeszcze przeskaluje). To
   * poprawne: nic nie znika z widoku, bo widać całość.
   */
  useLayoutEffect(() => {
    const przed = lewaPrzedZmiana.current;
    if (przed === null) return;
    lewaPrzedZmiana.current = null;
    const el = kontenerPlotna();
    if (!el) return;
    el.scrollLeft += el.getBoundingClientRect().left - przed;
  }, [przypietyPanel, panelZwiniety, kontenerPlotna]);

  // Panel: widoczny pod kursorem albo przypięty. Paski poziome: zawsze.
  const widocznaLewa = chromeLewo || przypietyPanel;

  useEffect(() => {
    if (!pelnyEkran) {
      setRozmiaryChrome({ gora: 0, lewo: 0, dol: 0 });
      return;
    }
    const zmierz = () =>
      setRozmiaryChrome({
        gora: gornyPasekRef.current?.offsetHeight ?? 0,
        lewo: lewaKartaRef.current?.offsetWidth ?? 0,
        dol: dolnyPasekRef.current?.offsetHeight ?? 0,
      });
    zmierz();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(zmierz);
    for (const r of [gornyPasekRef, lewaKartaRef, dolnyPasekRef]) if (r.current) ro.observe(r.current);
    return () => ro.disconnect();
  }, [pelnyEkran, panelZwiniety]);

  useEffect(() => {
    if (zoomReczny) return;
    dopasujZoom();
    const el = kolumnaPlotnaRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    // Obserwujemy WYŁĄCZNIE szerokość. Dopasowanie zmienia wysokość płótna, ta
    // zmienia wysokość kolumny, a to znów budzi obserwatora — pętla zwrotna, przez
    // którą rzut przeskalowywał się w trakcie pracy i element uciekał spod kursora.
    const ro = new ResizeObserver((wpisy) => {
      const szer = Math.round(wpisy[0]?.contentRect.width ?? 0);
      if (szer === ostatniaSzerRef.current) return;
      ostatniaSzerRef.current = szer;
      dopasujZoom();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [dopasujZoom, zoomReczny]);

  // --- wgrywanie podkładu ------------------------------------------------------
  const wgrywanie = useFloorPlanUpload();
  const ostatniRzutRef = useRef<string | null>(null);

  // --- onboarding ------------------------------------------------------------
  const onboarding = useOnboardingProgress();
  const setOnboarding = useProjectStore((s) => s.setOnboarding);
  const { dismissScaleStale } = onboarding;
  const scaleToolRef = useRef<HTMLButtonElement | null>(null);
  const wallToolRef = useRef<HTMLButtonElement | null>(null);
  // Który dymek pokazać — dwa różne narzędzia (linijka / ściany), ten sam popover.
  const [coachMark, setCoachMark] = useState<"skala" | "sciany" | null>(null);
  const [seenBefore] = useState(hasSeenOnboarding);

  /** Klik w CTA kroku ustawia narzędzie i — dla skali — pokazuje dymek nad linijką. */
  function handleStepAction(id: "skala" | "pomieszczenia" | "element") {
    markOnboardingSeen();
    if (id === "skala") {
      // Bez podkładu nie ma czego mierzyć — najpierw prosimy o rzut (przypadek 1).
      // Rysowanie ręczne ma WŁASNY przycisk w karcie (patrz „Narysuj dom
      // samodzielnie" niżej), więc to CTA zostaje wyłącznie wgrywaniem.
      if (!onboarding.facts.maPodklad) {
        fileRef.current?.click();
        return;
      }
      setToolMode("skala");
      setCoachMark("skala");
      return;
    }
    if (id === "pomieszczenia") {
      setToolMode("pomieszczenie");
      setSidebarTab("pomieszczenia");
      return;
    }
    setToolMode("elementy");
    setSidebarTab("elementy");
  }

  /** Druga, równoległa droga startu obok wgrania rzutu: dom rysowany od zera na
   *  czystej siatce. Ustawia od razu STANDARDOWĄ skalę (patrz `MANUAL_DRAW_SCALE_MPU`
   *  w lib/design.ts — 1 kratka = 1 m), bo bez podkładu nie ma czego kalibrować, a
   *  krok 1 onboardingu i tak liczy się jako ukończony z chwilą ustawienia jakiejkolwiek
   *  skali (`facts.maSkale`, patrz lib/onboarding.ts) — więc odhacza się automatycznie. */
  function startManualDrawing() {
    markOnboardingSeen();
    setScale(activeFloorId, MANUAL_DRAW_SCALE_MPU);
    setToolMode("sciany");
    setCoachMark("sciany");
  }
  const [contextMenu, setContextMenu] = useState<
    { x: number; y: number; kind: "el" | "wall" | "room" | "wallDraw" | "opening"; id: string; multi: boolean } | null
  >(null);
  /** Edycja nazwy pomieszczenia w miejscu dwukliku na planie (input-nakładka, bo
   *  Konva nie ma natywnego pola tekstowego — ten sam trik co przy contextMenu). */
  const [roomNameEdit, setRoomNameEdit] = useState<{ x: number; y: number; id: string; value: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMultiSelected([]);
    setCalibPoints([]);
  }, [toolMode]);

  function deleteSelection() {
    if (multiSelected.length > 0) {
      removeElements(multiSelected);
      setMultiSelected([]);
      return;
    }
    if (selected) {
      if (selected.kind === "el") removeElements([selected.id]);
      else if (selected.kind === "wall") {
        // Usunięcie ściany kasuje też JEJ otwory — inaczej zostałyby osierocone
        // (wallId wskazujący na nieistniejącą ścianę).
        setDraft((d) => ({
          ...d,
          walls: d.walls.filter((w) => w.id !== selected.id),
          openings: d.openings.filter((o) => o.wallId !== selected.id),
        }));
      } else if (selected.kind === "opening") {
        setDraft((d) => ({ ...d, openings: d.openings.filter((o) => o.id !== selected.id) }));
      } else if (selected.kind === "room") {
        deleteRoomShape(selected.id);
      } else if (selected.kind === "route") {
        // Trasy nie da się „usunąć" — to widok policzony z planu. Delete/Backspace
        // na zaznaczonej trasie kasuje jej ręczną poprawkę (jeśli jakaś jest),
        // czyli cofa do routingu automatycznego — no-op, gdy nic nie było zmienione.
        clearRouteOverride(selected.id);
      }
      setSelected(null);
    }
  }

  function handleRoomContextMenu(id: string, x: number, y: number) {
    setSelected({ kind: "room", id });
    setMultiSelected([]);
    setContextMenu({ x, y, kind: "room", id, multi: false });
  }

  /**
   * „Cofnij” świadomy tego, co się właśnie rysuje.
   *
   * Historia (`past`/`future` w store) zna tylko ZATWIERDZONE zmiany — ściana czy
   * pomieszczenie trafiają do niej dopiero w `finishWall`/`finishRoomDrawing`. Punkty
   * postawione W TRAKCIE rysowania żyją w lokalnym stanie (`drawingWall`,
   * `drawingRoomPoints`) i historia o nich nic nie wie. Efekt: kto postawił trzeci
   * narożnik przez pomyłkę i sięgnął po „Cofnij”, trafiał na WYŁĄCZONY przycisk —
   * bo z punktu widzenia historii nie było jeszcze niczego do cofnięcia, choć na
   * ekranie stał świeżo postawiony punkt.
   *
   * Cofnięcie ostatniego postawionego punktu ma więc PIERWSZEŃSTWO przed cofnięciem
   * zatwierdzonej zmiany — dokładnie w kolejności, w jakiej użytkownik naciskał klawisze.
   */
  const wTrakcieRysowania = drawingWall.length > 0 || drawingRoomPoints.length > 0;
  const canUndo = wTrakcieRysowania || maZatwierdzoneDoCofniecia;
  function undo() {
    if (drawingWall.length > 0) {
      setDrawingWall((pts) => pts.slice(0, -1));
      return;
    }
    if (drawingRoomPoints.length > 0) {
      setDrawingRoomPoints((pts) => pts.slice(0, -1));
      return;
    }
    cofnijZatwierdzone();
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (document.activeElement as HTMLElement | null)?.tagName;
      if ((e.key === "Delete" || e.key === "Backspace") && tag !== "INPUT" && tag !== "TEXTAREA") {
        e.preventDefault();
        deleteSelection();
      }
      if ((e.key === "r" || e.key === "R") && tag !== "INPUT" && tag !== "TEXTAREA") {
        const ids = multiSelected.length > 0 ? multiSelected : selected?.kind === "el" ? [selected.id] : [];
        if (ids.length) {
          e.preventDefault();
          rotateElements(ids);
        } else if (selected?.kind === "opening") {
          e.preventDefault();
          toggleOpeningFlip(selected.id);
        }
      }
      if (e.key === "Escape") {
        // Escape ma jeden poziom naraz: najpierw porzuca to, co właśnie rysujesz,
        // i dopiero gdy nie ma czego porzucić — wychodzi z pełnego ekranu. Inaczej
        // jedno wciśnięcie kasowałoby niedokończoną ścianę I wyrzucało z trybu,
        // czyli karałoby za pomyłkę dwa razy.
        const bylCosDoPorzucenia =
          drawingWall.length > 0 || drawingRoomPoints.length > 0 || multiSelected.length > 0 || calibPoints.length > 0 || contextMenu !== null;
        setDrawingWall([]);
        setDrawingRoomPoints([]);
        setMultiSelected([]);
        setCalibPoints([]);
        setContextMenu(null);
        if (!bylCosDoPorzucenia && pelnyEkran) przelaczPelnyEkran();
      }
      // „F" jak fullscreen — skrót dla osób, które raz znajdą przycisk i potem chcą
      // przełączać tryb bez sięgania po mysz.
      if ((e.key === "f" || e.key === "F") && tag !== "INPUT" && tag !== "TEXTAREA") {
        e.preventDefault();
        przelaczPelnyEkran();
      }
      // Enter zatwierdza rysowaną ścianę — druga (obok PPM na płótnie, patrz
      // `onWallDrawContextMenu`) klawiaturowa alternatywa dla przycisku „Zakończ".
      // Próg 2 punktów jak w samym `finishWall` — z jednego punktu nie ma czego zapisać.
      if (e.key === "Enter" && drawingWall.length >= 2 && tag !== "INPUT" && tag !== "TEXTAREA") {
        e.preventDefault();
        finishWall();
      }
      // To samo dla wieloboku pomieszczenia — próg 3 punktów jak w `finishRoomDrawing`
      // (przycisk „Zakończ" pojawia się dopiero od trzech, mniej nie domyka figury).
      // Prostokąt nie potrzebuje tego skrótu: tam zamknięcie następuje od razu po
      // puszczeniu przycisku myszy, bez oddzielnego kroku zatwierdzenia.
      if (e.key === "Enter" && drawingRoomPoints.length >= 3 && tag !== "INPUT" && tag !== "TEXTAREA") {
        e.preventDefault();
        finishRoomDrawing();
      }
      // Ctrl/Cmd+Z jak wszędzie indziej — idzie przez ten sam wrapper `undo()` co
      // przycisk „Cofnij”, więc mid-draw usuwa ostatni punkt tak samo jak przycisk.
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && tag !== "INPUT" && tag !== "TEXTAREA") {
        e.preventDefault();
        if (e.shiftKey) {
          if (canRedo) redo();
        } else if (canUndo) {
          undo();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function detectRoomName(p: Point): string {
    for (const r of roomShapes) {
      if (pointInPolygon(p, r.points)) return r.name;
    }
    return NO_ROOM;
  }

  // Każdy typ z wariantami ma WŁASNY licznik gangów — zmiana jednego nie wpływa na drugi.
  function gangsForType(t: ElementType): number {
    if (!VARIANTS_FOR[t]) return 1;
    return gangsByType[t] || 1;
  }

  function handlePlaceElement(p: Point) {
    setDraft((d) => ({
      ...d,
      elements: [
        ...d.elements,
        {
          id: crypto.randomUUID(),
          type: activeType,
          x: p.x,
          y: p.y,
          room: detectRoomName(p),
          floor: activeFloorId,
          dedicated: activeType === "gniazdko" ? dedicated : false,
          note: activeType === "gniazdko" && dedicated ? "AGD" : "",
          gangs: gangsForType(activeType),
          rotation: 0,
        },
      ],
    }));
  }

  /** Obraca element(y) o 90° (w prawo) — np. gniazdko/łącznik przy skośnej ścianie. */
  function rotateElements(ids: string[]) {
    setDraft((d) => ({
      ...d,
      elements: d.elements.map((e) => (ids.includes(e.id) ? { ...e, rotation: ((e.rotation ?? 0) + 90) % 360 } : e)),
    }));
  }

  function finishWall() {
    if (drawingWall.length >= 2) {
      setDraft((d) => ({
        ...d,
        walls: [...d.walls, { id: crypto.randomUUID(), floor: activeFloorId, points: drawingWall, thickness: wallThickness }],
      }));
    }
    setDrawingWall([]);
  }

  /** Przesuwa JEDEN narożnik zapisanej ściany — edycja przeciąganiem na planie,
   *  ten sam wzorzec co `moveRoomShapePoint` w store, ale ściany (w odróżnieniu
   *  od pomieszczeń) nie mają własnych akcji w store i tak jak reszta ich obsługi
   *  (dodanie w `finishWall`, usunięcie w menu kontekstowym) idą wprost przez `setDraft`. */
  function moveWallPoint(id: string, index: number, point: Point) {
    setDraft((d) => ({
      ...d,
      walls: d.walls.map((w) => (w.id === id ? { ...w, points: w.points.map((p, i) => (i === index ? point : p)) } : w)),
    }));
  }

  /** Zmienia grubość JUŻ ZAPISANEJ ściany — edycja po fakcie, ten sam wzorzec
   *  `setDraft` co `moveWallPoint`, bo ściany nie mają własnych akcji w store. */
  function setWallThicknessOf(id: string, thickness: number) {
    setDraft((d) => ({ ...d, walls: d.walls.map((w) => (w.id === id ? { ...w, thickness } : w)) }));
  }

  /** Dokłada drzwi w miejscu kliknięcia w ścianę (`point`/`angle` już
   *  policzone w DesignCanvas — patrz `nearestPointOnPolyline`). Podobnie jak
   *  ściany, otwory nie mają własnych akcji w store — jeden `setDraft`.
   *
   *  Świeżo postawiony otwór od razu staje się ZAZNACZONY — bez tego „R"
   *  (obrót o 180°) czy PPM tuż po postawieniu nie miały czego dotyczyć
   *  (`selected` wskazywał jeszcze na cokolwiek było zaznaczone wcześniej,
   *  często nic), więc próba obrócenia świeżo postawionych drzwi wyglądała,
   *  jakby w ogóle nie działała. */
  function handleWallClickForOpening(wallId: string, point: Point, angle: number) {
    const id = crypto.randomUUID();
    setDraft((d) => ({
      ...d,
      openings: [
        ...d.openings,
        { id, floor: activeFloorId, wallId, x: point.x, y: point.y, angle, width: defaultOpeningWidth(mpu), kind: "drzwi" },
      ],
    }));
    setSelected({ kind: "opening", id });
    setMultiSelected([]);
  }

  /** Klik w krawędź pomieszczenia w trybie „otwory" — ten sam wzorzec co
   *  `handleWallClickForOpening`, tylko `roomId` zamiast `wallId`: pomieszczenia
   *  narysowane bez osobnej ściany inaczej w ogóle nie miałyby jak dostać drzwi. */
  function handleRoomEdgeClickForOpening(roomId: string, point: Point, angle: number) {
    const id = crypto.randomUUID();
    setDraft((d) => ({
      ...d,
      openings: [
        ...d.openings,
        { id, floor: activeFloorId, roomId, x: point.x, y: point.y, angle, width: defaultOpeningWidth(mpu), kind: "drzwi" },
      ],
    }));
    setSelected({ kind: "opening", id });
    setMultiSelected([]);
  }

  function handleOpeningContextMenu(id: string, x: number, y: number) {
    setSelected({ kind: "opening", id });
    setMultiSelected([]);
    setContextMenu({ x, y, kind: "opening", id, multi: false });
  }

  /** Obraca otwór o 180° — dla drzwi zamienia stronę zawiasu i kierunek
   *  otwierania skrzydła (patrz `flip` w `Opening` i przeliczenie w
   *  `DesignCanvas.tsx`). Klawisz „R" jak przy elementach, plus przycisk w menu
   *  kontekstowym. */
  function toggleOpeningFlip(id: string) {
    setDraft((d) => ({
      ...d,
      openings: d.openings.map((o) => (o.id === id ? { ...o, flip: !o.flip } : o)),
    }));
  }

  /** Grubość ściany w polu do wpisania: centymetry, gdy skala jest skalibrowana
   *  (ten sam wybór jednostki co `formatDlugosc` w DesignCanvas), inaczej same
   *  jednostki planu — użytkownik bez skali i tak nie ma punktu odniesienia dla cm. */
  function thicknessToDisplay(units: number): number {
    return mpu !== null ? Math.round(units * mpu * 100 * 10) / 10 : Math.round(units);
  }
  function thicknessFromDisplay(display: number): number {
    return mpu !== null ? display / 100 / mpu : display;
  }

  function finishRoomDrawing() {
    if (drawingRoomPoints.length >= 3) {
      setPendingRoom({ points: drawingRoomPoints, name: nextRoomName(roomShapes.length) });
    }
    setDrawingRoomPoints([]);
  }

  function savePendingRoom() {
    if (!pendingRoom) return;
    addRoomShape(activeFloorId, pendingRoom.points, pendingRoom.name);
    setPendingRoom(null);
  }

  /** Podkład ląduje w projekcie OD RAZU po wczytaniu pliku, jeszcze zanim
   *  użytkownik zdąży go przyciąć. Dzięki temu awaria wczytywania, anulowanie
   *  i pominięcie przycinania zostawiają użytkownika z działającym rzutem —
   *  wymaganie „nigdy bez utraty podkładu". Jeśli użytkownik PRZYTNIE plik,
   *  `wgrywanie.rzut` dostaje nowy `dataUrl` i efekt odpala się ponownie,
   *  podmieniając podkład na przycięty. */
  useEffect(() => {
    const r = wgrywanie.rzut;
    if (!r || ostatniRzutRef.current === r.dataUrl) return;
    ostatniRzutRef.current = r.dataUrl;
    setBgName(r.nazwaPliku);
    if (mpu !== null) setOnboarding({ skalaNieaktualna: true });
    setBgImage(activeFloorId, r.dataUrl);
    setPlanSize(planSizeForImage(r.szerokosc, r.wysokosc));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wgrywanie.rzut]);

  function handleBgFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    // Wczytanie idzie przez hook wgrywania — on obsługuje też PDF i sam
    // ustawia podkład (patrz efekt wyżej), więc awaria wczytywania nie gubi rzutu.
    void wgrywanie.wczytaj(file);
  }


  /** Krótka podpowiedź po kliknięciu poza obszarem planu — znika sama. */
  function flashOutsideHint() {
    setOutsideHint(true);
    window.clearTimeout(outsideHintTimer.current);
    outsideHintTimer.current = window.setTimeout(() => setOutsideHint(false), 2600);
  }

  const roomSuggestions = Array.from(
    new Set([...elements.map((e) => e.room), ...roomShapes.map((r) => r.name), ...DEFAULT_ROOM_SUGGESTIONS])
  );
  const editingElement = editingId ? elements.find((e) => e.id === editingId) ?? null : null;
  const zones = showZones ? computeSanitaryZones(elements, activeFloorId, mpu) : [];
  // Grupy sterowania oświetleniem liczone z elementów bieżącej kondygnacji — numer
  // pokazywany jest zarówno przy łączniku, jak i przy sterowanych przez niego punktach.
  const lightGroups = useMemo(() => computeLightGroups(elements), [elements]);
  // Trasy przewodów — WYŁĄCZNIE z elementów/ścian/pomieszczeń TEJ kondygnacji
  // (wszystkie trzy już przefiltrowane przez `useActiveFloor*`), więc rozdzielnica,
  // punkty i sieć, po której routuje `buildCableRoutes`, zawsze mieszkają w tym samym
  // układzie współrzędnych. Puste trasy zasilania bez rozdzielnicy na planie — trasy
  // sterowania (łącznik→lampa) działają niezależnie od niej, patrz `buildCableRoutes`.
  const rawCableRoutes = useMemo(
    () => (showRoutes ? buildCableRoutes(findPanel(elements), computeCircuits(elements), elements, walls, roomShapes) : []),
    [showRoutes, elements, walls, roomShapes]
  );
  // Ręczne poprawki (przeciągnięte przez użytkownika załamania, patrz DesignCanvas)
  // nakładane NA WIERZCHU świeżo policzonych tras — początek/koniec zawsze biorą się
  // z aktualnej pozycji elementu, więc jego przesunięcie nie gubi ręcznego układu.
  const cableRoutes = useMemo(() => applyRouteOverrides(rawCableRoutes, routeOverrides), [rawCableRoutes, routeOverrides]);

  function handleElementContextMenu(id: string, x: number, y: number) {
    if (multiSelected.includes(id) && multiSelected.length > 1) {
      setContextMenu({ x, y, kind: "el", id, multi: true });
      return;
    }
    setSelected({ kind: "el", id });
    setMultiSelected([]);
    setContextMenu({ x, y, kind: "el", id, multi: false });
  }

  function handleWallContextMenu(id: string, x: number, y: number) {
    setSelected({ kind: "wall", id });
    setMultiSelected([]);
    setContextMenu({ x, y, kind: "wall", id, multi: false });
  }

  /** PPM na płótnie w trakcie rysowania ściany (≥2 punkty) — alternatywa dla
   *  przycisku „Zakończ" i Entera, patrz `onWallDrawContextMenu` w DesignCanvas. */
  function handleWallDrawContextMenu(x: number, y: number) {
    setContextMenu({ x, y, kind: "wallDraw", id: "", multi: false });
  }

  /**
   * Czy pigułka kontrolek kontekstowych ma w tej chwili jakąkolwiek treść — TE SAME
   * warunki co gałęzie w `kontekstoweTresc` niżej, tylko spłaszczone do jednego
   * booleana. Potrzebne w widoku zwykłym do stylu „obramowanie/tło tylko gdy jest co
   * pokazać" przy STAŁEJ wysokości slotu (patrz `kolumnaPlotnaRef`) — inaczej pusta
   * pigułka rysowałaby pusty bordowany prostokąt nad płótnem przez większość czasu
   * pracy (tryb „zaznacz" jest domyślny i najczęstszy).
   */
  const kontekstoweAktywne =
    multiSelected.length > 0 ||
    toolMode === "sciany" ||
    toolMode === "pomieszczenie" ||
    toolMode === "skala" ||
    (selected?.kind === "wall" && toolMode === "zaznacz" && walls.some((w) => w.id === selected.id)) ||
    (selected?.kind === "route" && toolMode === "zaznacz") ||
    // `toolMode !== "skala"` pominięte celowo: powyżej już wykluczyliśmy ten
    // przypadek (`toolMode === "skala"` zwróciłoby true wcześniej w tym samym `||`).
    !!skalaPotwierdzenie;

  /**
   * Treść pigułki kontrolek kontekstowych — WSPÓLNA dla obu miejsc, w których się
   * renderuje (pełny ekran kontra widok zwykły, patrz komentarze przy obu). Jedna
   * definicja, żeby te same kontrolki (grubość ściany, kształt pomieszczenia,
   * kalibracja skali…) nie rozjechały się przypadkiem między dwiema kopiami JSX.
   */
  const kontekstoweTresc = (
    <>
      {multiSelected.length > 0 && (
        <button onClick={deleteSelection} className="pe-btn-ghost flex items-center gap-1 px-2.5 py-1.5 text-xs text-red-600">
          <Trash2 size={13} /> Usuń zaznaczone ({multiSelected.length})
        </button>
      )}

      {/* Grubość i ortogonalność ustawia się PRZED pierwszym kliknięciem, nie tylko
          w trakcie — stąd osobny warunek na `toolMode`, a nie na `drawingWall.length`. */}
      {toolMode === "sciany" && (
        <div className="flex items-center gap-3 text-xs">
          <label className="flex items-center gap-1.5 text-slate-500">
            Grubość:
            <input
              data-testid="wall-thickness-input"
              type="number"
              min={1}
              step={mpu !== null ? 0.5 : 1}
              value={thicknessToDisplay(wallThickness)}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v) && v > 0) setWallThickness(thicknessFromDisplay(v));
              }}
              className="w-16 rounded border border-border px-1.5 py-0.5"
            />
            {mpu !== null ? "cm" : "jedn."}
          </label>
          <label className="flex items-center gap-1.5 text-slate-500">
            <input
              data-testid="wall-ortho-checkbox"
              type="checkbox"
              checked={orthoWalls}
              onChange={(e) => setOrthoWalls(e.target.checked)}
            />
            Ortogonalnie (kąty proste)
          </label>
        </div>
      )}

      {drawingWall.length > 0 && (
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium text-slate-600">Rysowanie ściany: {drawingWall.length} pkt.</span>
          <button onClick={finishWall} className="pe-btn-ghost px-2.5 py-1 text-sm">Zakończ</button>
          <button onClick={() => setDrawingWall([])} className="pe-btn-ghost px-2.5 py-1 text-sm">Anuluj</button>
        </div>
      )}

      {/* Grubość JUŻ ZAPISANEJ ściany — edytowalna tylko w trybie „zaznacz", tak jak
          uchwyty narożników w DesignCanvas (w trybie „ściany" klik dokłada nowy punkt). */}
      {selected?.kind === "wall" && toolMode === "zaznacz" && (() => {
        const w = walls.find((x) => x.id === selected.id);
        if (!w) return null;
        const currentThickness = w.thickness ?? DEFAULT_WALL_THICKNESS;
        return (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500">Grubość zaznaczonej ściany:</span>
            <input
              data-testid="selected-wall-thickness-input"
              type="number"
              min={1}
              step={mpu !== null ? 0.5 : 1}
              value={thicknessToDisplay(currentThickness)}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v) && v > 0) setWallThicknessOf(w.id, thicknessFromDisplay(v));
              }}
              className="w-16 rounded border border-border px-1.5 py-0.5"
            />
            {mpu !== null ? "cm" : "jedn."}
          </div>
        );
      })()}
      {/* Zaznaczona trasa przewodu — podpowiedź jak ją edytować (dwuklik dokłada
          załamanie, przeciągnięcie uchwytu je przesuwa, dwuklik na uchwycie kasuje)
          i przycisk powrotu do routingu automatycznego, widoczny tylko gdy trasa
          FAKTYCZNIE ma ręczną poprawkę — inaczej wisiałby bez sensu przy każdej
          jeszcze nietkniętej trasie. */}
      {selected?.kind === "route" && toolMode === "zaznacz" && (
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span>Trasa: dwuklik dokłada punkt, przeciągnij uchwyt, dwuklik na uchwycie go kasuje.</span>
          {selected.id in routeOverrides && (
            <button
              onClick={() => clearRouteOverride(selected.id)}
              className="pe-btn-ghost flex items-center gap-1 px-2.5 py-1 text-xs"
            >
              <Undo2 size={13} /> Cofnij do trasy automatycznej
            </button>
          )}
        </div>
      )}
      {/* Wybór sposobu rysowania pojawia się dopiero po wejściu w tryb „Pomieszczenie" —
          poza nim byłby tylko szumem w pasku narzędzi. */}
      {toolMode === "pomieszczenie" && (
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium text-slate-600">Kształt:</span>
          <div className="flex items-center gap-1 rounded-lg border border-border bg-white p-0.5">
            {ROOM_MODES.map(({ id, label, hint }) => (
              <button
                key={id}
                onClick={() => {
                  setRoomMode(id);
                  setDrawingRoomPoints([]); // zmiana trybu przerywa figurę zaczętą w poprzednim
                }}
                title={hint}
                className="rounded-md px-2.5 py-1 text-sm"
                style={roomMode === id ? { background: "#C1793F14", color: "#8A5526", fontWeight: 600 } : { color: "#64748B" }}
              >
                {label}
              </button>
            ))}
          </div>
          <span className="text-slate-500">{ROOM_MODES.find((m) => m.id === roomMode)!.hint}</span>
        </div>
      )}
      {drawingRoomPoints.length > 0 && (
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium text-slate-600">
            {drawingRoomPoints.length} pkt.
            {drawingRoomPoints.length >= 3 && " — kliknij w pierwszy punkt, aby zamknąć"}
          </span>
          {drawingRoomPoints.length >= 3 && (
            <button onClick={finishRoomDrawing} className="pe-btn-ghost px-2.5 py-1 text-sm">Zakończ</button>
          )}
          <button onClick={() => setDrawingRoomPoints([])} className="pe-btn-ghost px-2.5 py-1 text-sm">Anuluj</button>
        </div>
      )}
      {toolMode === "skala" && (
        <ScaleCalibrationTool
          calibPoints={calibPoints}
          metersPerUnit={mpu}
          planWidthUnits={planSize.w}
          onApply={(metersPerUnit) => {
            setScale(activeFloorId, metersPerUnit);
            setCalibPoints([]);
            setToolMode("zaznacz");
            dismissScaleStale();
            setSkalaPotwierdzenie(`Skala ustawiona: 1 jedn. = ${(metersPerUnit * 100).toFixed(1).replace(".", ",")} cm`);
          }}
          onCancel={() => setCalibPoints([])}
          onClear={() => clearScale(activeFloorId)}
        />
      )}
      {/* Znika po 4 s albo przy następnej akcji, która coś tu wstawi (patrz
          `empty:hidden` przy obu miejscach renderowania) — to jedyny komunikat w tej
          pigułce, który sam się chowa, bo nie odpowiada żadnemu aktywnemu narzędziu;
          zostawiony na stałe wisiałby nad planem bez powodu. */}
      {skalaPotwierdzenie && toolMode !== "skala" && (
        <span className="flex items-center gap-1.5 text-sm font-medium" style={{ color: "#2C6B4A" }}>
          <Check size={15} /> {skalaPotwierdzenie}
        </span>
      )}
    </>
  );

  return (
    <div className="space-y-4">
      {/* Zamontowany ZAWSZE, niezależnie od tego, który ekran jest aktywny (edytor,
          weryfikacja detekcji, błąd wczytania) — inaczej `fileRef.current` bywał
          `null` akurat wtedy, gdy „Wgraj inny plik" na ekranie weryfikacji/błędu
          próbował go kliknąć, bo sam input mieszkał w kolumnie edytora, ukrytej
          podczas weryfikacji. */}
      <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={handleBgFile} />

      {/* Trwały baner ryzyka: projekt bez konta żyje WYŁĄCZNIE w localStorage tej
          przeglądarki — apka wcześniej milczała na ten temat, więc wyczyszczenie
          danych albo zmiana przeglądarki/urządzenia kasowała pracę bez ostrzeżenia.
          Widoczny cały czas, dopóki jest cokolwiek do stracenia (pusty projekt nie
          jest jeszcze problemem) i użytkownik nie jest zalogowany — bez opcji
          trwałego wyciszenia, bo ryzyko nie znika, dopóki nie założy konta. */}
      {!session && (elements.length > 0 || walls.length > 0 || roomShapes.length > 0 || !!bgImageUrl) && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-xs"
          style={{ background: "#C6433A14", color: "#A2352C" }}
        >
          <AlertTriangle size={14} className="shrink-0" />
          <span>
            Ten projekt istnieje tylko w tej przeglądarce — wyczyszczenie danych albo otwarcie na innym urządzeniu
            oznacza jego utratę.
          </span>
          <button onClick={onOpenAuth} className="font-semibold underline">
            Zabezpiecz kontem
          </button>
        </div>
      )}

      {/* Delikatny, JEDNORAZOWY prompt po włożeniu realnej pracy (>10 elementów) —
          w odróżnieniu od banera wyżej, ten da się odrzucić na stałe (patrz
          `kontoPromptOdrzucony`), żeby nie przypominać o tym samym w kółko. */}
      {!session && !kontoPromptOdrzucony && elements.length > KONTO_PROMPT_PROG_ELEMENTOW && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-xs"
          style={{ background: "#C1793F14", color: "#8A5526" }}
        >
          <ShieldAlert size={14} className="shrink-0" />
          <span>Włożyłeś już sporo pracy w ten projekt ({elements.length} elementów) — zabezpiecz go kontem, żeby go nie stracić.</span>
          <button onClick={onOpenAuth} className="font-semibold underline">
            Załóż konto / zaloguj się
          </button>
          <button
            onClick={() => {
              setKontoPromptOdrzucony(true);
              try {
                localStorage.setItem(KONTO_PROMPT_ODRZUCONY_KEY, "1");
              } catch {
                /* patrz odczytajOdrzuconyPrompt */
              }
            }}
            className="ml-auto shrink-0 opacity-60 hover:opacity-100"
            title="Nie przypominaj więcej"
            aria-label="Zamknij przypomnienie o koncie"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Podkład jeszcze nie wgrany — to pierwsza czynność w całym przepływie. Stała
          dotąd w panelu bocznym, NAD biblioteką elementów — ale to dwie różne sprawy
          (ogólny stan projektu kontra lista do wstawiania) tłoczące się w jednej wąskiej
          kolumnie, i tam też została zgłoszona jako przeszkadzająca. Tu, jako baner na
          całą szerokość (ten sam wzorzec co reszta banerów w tym miejscu), stoi
          w pierwszym ekranie tak samo jak wcześniej — plan-upload.spec.ts pilnuje tylko
          POZYCJI (nad biblioteką, bez scrollowania), nie konkretnego kontenera. */}
      {!bgImageUrl && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-xs"
          style={{ background: "#C1793F14", color: "#8A5526" }}
        >
          <Upload size={14} className="shrink-0" />
          <span>Zacznij od wgrania rzutu mieszkania albo odręcznego szkicu — posłuży za podkład, na którym rozmieścisz elementy.</span>
          <button onClick={() => fileRef.current?.click()} className="font-semibold underline">
            Wgraj rzut / zdjęcie
          </button>
          {/* Druga, RÓWNOLEGŁA droga startu — nie zapasowa: bez rzutu pod ręką dom da
              się narysować od zera na siatce w standardowej skali (patrz
              `startManualDrawing`), zamiast zmuszać do szukania/skanowania rzutu. */}
          <button onClick={startManualDrawing} className="font-semibold underline">
            Narysuj dom samodzielnie
          </button>
        </div>
      )}

      {/* Trwały, nieinwazyjny baner: praca bez skali jest DOZWOLONA, ale jej skutek
          (nieprecyzyjne długości i kosztorys) musi być widoczny cały czas, a nie raz. */}
      {onboarding.missingScaleWarning && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-xs"
          style={{ background: "#C1793F14", color: "#8A5526" }}
        >
          <span>Skala nieustawiona — długości przewodów i kosztorys mogą być niedokładne.</span>
          <button onClick={() => handleStepAction("skala")} className="font-semibold underline">
            Ustaw skalę
          </button>
        </div>
      )}

      {/* Kolejna kondygnacja: skalę odziedziczyła po parterze, ale pomieszczenia są
          własne — bez nich elementy nie trafią do właściwych pokoi, a strefy mokre
          i obwody kuchenne nie zadziałają. Przewodnik prowadzi tylko parter, więc
          tutaj wystarczy krótka prośba (przypadek brzegowy 4). */}
      {onboarding.needsRoomConfirmation && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-xs"
          style={{ background: "#2D5A8C12", color: "#2D5A8C" }}
        >
          <span>Ta kondygnacja ma już skalę z parteru, ale nie ma jeszcze pomieszczeń.</span>
          <button onClick={() => handleStepAction("pomieszczenia")} className="font-semibold underline">
            Obrysuj pomieszczenia
          </button>
        </div>
      )}

      {/* Podmiana podkładu unieważniła kalibrację — proponujemy poprawkę, nie kasujemy. */}
      {onboarding.scaleStale && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-xs"
          style={{ background: "#C6433A14", color: "#A2352C" }}
        >
          <span>Podkład się zmienił, więc skala może już nie pasować do tego rzutu.</span>
          <button onClick={() => handleStepAction("skala")} className="font-semibold underline">
            Skalibruj ponownie
          </button>
          <button onClick={dismissScaleStale} className="underline opacity-70">
            Skala jest OK
          </button>
        </div>
      )}

      {/* Przycinanie zastępuje widok edytora, ale NIE jest modalem bez wyjścia:
          podkład jest już w projekcie (patrz efekt wyżej), więc pominięcie albo
          przycięcie zawsze zostawia w pełni działający edytor — po prostu z
          nowym (albo tym samym) podkładem. */}
      {wgrywanie.stan === "wczytywanie" && (
        <div className="pe-card flex items-center gap-2.5 p-4 text-sm text-slate-600">
          <Loader2 size={16} className="animate-spin text-copper" aria-hidden="true" />
          Wczytuję plik…
        </div>
      )}

      {wgrywanie.stan === "przycinanie" && wgrywanie.rzut && (
        <CropTool
          obrazUrl={wgrywanie.rzut.dataUrl}
          szerokoscObrazu={wgrywanie.rzut.szerokosc}
          wysokoscObrazu={wgrywanie.rzut.wysokosc}
          onPrzytnij={(obszar) => {
            wgrywanie.przytnij(obszar);
            // Po podkładzie naturalny następny krok to skala — bez niej nie
            // policzymy metrów, więc od razu kierujemy tam uwagę użytkownika.
            setToolMode("skala");
            setCoachMark("skala");
          }}
          onPomin={() => {
            wgrywanie.pominPrzyciecie();
            setToolMode("skala");
            setCoachMark("skala");
          }}
        />
      )}

      {wgrywanie.stan === "blad" && (
        <div className="pe-card p-4">
          <p className="mb-2 text-sm" style={{ color: "#A2352C" }}>
            Nie udało się otworzyć tego pliku ({wgrywanie.blad}).
          </p>
          <p className="mb-3 text-xs text-slate-500">
            Spróbuj innego pliku (JPG, PNG albo PDF) albo narysuj plan ręcznie — narzędzia po lewej działają bez podkładu.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="copper" size="sm" onClick={() => fileRef.current?.click()}>
              <Upload size={14} /> Wgraj inny plik
            </Button>
            <Button variant="ghost" size="sm" onClick={wgrywanie.pomin}>
              Narysuję sam
            </Button>
          </div>
        </div>
      )}

      {/* Podczas przycinania edytor jest UKRYTY, a nie pokazany obok: to osobny
          krok przepływu, a dwa równoległe widoki planu (nakładka przycinania
          i płótno) myliły co do tego, na którym się właśnie pracuje. Po
          przycięciu albo pominięciu edytor wraca w całości. */}
      {wgrywanie.stan !== "przycinanie" && (
        <div
          ref={pelnyEkranRef}
          // `space-y-1.5`, nie `space-y-4`: pasek kontrolek ma stać tuż nad płótnem,
          // bo do niego się odnosi. Szeroki odstęp robił z niego osobną wysepkę.
          className={pelnyEkran ? "fixed inset-0 z-40 overflow-hidden bg-[#EEF2F6]" : "space-y-1.5"}
          onMouseMove={pelnyEkran ? obsluzRuchMyszy : undefined}
          onMouseLeave={pelnyEkran ? schowajChrome : undefined}
        >
      {/* Pasek kontrolek. W pełnym ekranie leży jako nakładka NAD płótnem i wysuwa
          się zza górnej krawędzi — dlatego `absolute`, a nie zwykły rząd w kolumnie:
          płótno nie może tracić wysokości na coś, co przez większość czasu jest
          schowane. */}
      <div
        // `top-0` z tego samego powodu co `left-0` przy panelu narzędzi: żadnej
        // szczeliny między pasem wyzwalającym a odsłanianym elementem.
        ref={gornyPasekRef}
        className={pelnyEkran ? "absolute inset-x-0 top-0 z-30" : undefined}
        // Przesunięcie w `style`, nie klasą Tailwinda z wartością arbitralną: ujemne
        // wartości arbitralne (`-translate-y-[calc(...)]`) to znany ostry róg — łatwo
        // trafić na zapis, który Tailwind złoży w niepoprawny CSS, a przeglądarka
        // odrzuca taką regułę bez słowa i pasek po prostu zostaje widoczny. Jawna
        // wartość jest odporna na tę klasę pomyłek i czytelna wprost.
        // `-100%` odnosi się do wysokości samego paska, `1rem` to zapas na cień.
      >
      {/* Glify legendy renderowane POZA ekranem tymi samymi komponentami, co paleta
          elementów — dzięki temu symbol w PDF-ie jest dokładnie tym samym znakiem,
          który użytkownik widzi w aplikacji i na rysunku. `aria-hidden`, bo dla
          czytnika ekranu to duplikat treści palety. */}
      <div ref={glifyRef} aria-hidden className="pointer-events-none absolute -left-[9999px] top-0 h-0 overflow-hidden">
        {uzyteSymbole.map((s) => (
          <span key={`${s.type}:${s.gangs}`} data-glif={`${s.type}:${s.gangs}`}>
            <GlyphPreview type={s.type} color={ELEMENT_TYPES[s.type].color} gangs={s.gangs} size={40} />
          </span>
        ))}
      </div>

      <PdfPreview
        open={podgladPdf}
        onOpenChange={setPodgladPdf}
        title={`Rzut — ${floorName}`}
        filename={projectFileName(`rzut-${floorName}`, projectName, "pdf")}
        build={zbudujPdfRzutu}
      />

      <EditorToolbar
        onPdf={() => setPodgladPdf(true)}
        pelnyEkran={pelnyEkran}
        onTogglePelnyEkran={przelaczPelnyEkran}
        bgImageUrl={bgImageUrl}
        bgName={bgName}
        onPickBg={() => fileRef.current?.click()}
        onClearBg={() => setBgImage(activeFloorId, null)}
        snapOn={snapOn}
        gridOn={gridOn}
        onGridChange={setGridOn}
        onZapisz={session ? () => void saveToCloud({ reczny: true }) : null}
        zapisTrwa={cloudBusy}
        onSnapChange={setSnapOn}
        elementScale={elementScale}
        onElementScaleChange={setElementScale}
        defaultElementScale={DEFAULT_ELEMENT_SCALE}
        showZones={showZones}
        onToggleZones={() => setShowZones((z) => !z)}
        showRoutes={showRoutes}
        onToggleRoutes={() => setShowRoutes((r) => !r)}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={undo}
        onRedo={redo}
        zoom={zoom}
        onZoomChange={(z) => {
          setZoomReczny(true);
          setZoom(z);
        }}
        onDopasuj={() => {
          setZoomReczny(false);
          dopasujZoom();
        }}
      />
      </div>

      {/* Kontrolki kontekstowe: pokazują się tylko przy narzędziu, którego dotyczą,
          więc pasek nie puchnie od opcji nieaktywnych w danym momencie. W pełnym
          ekranie pływają na środku góry i — w odróżnieniu od reszty — NIE chowają
          się za krawędź. Siedzą tu rzeczy, bez których nie da się dokończyć
          zaczętej czynności („Zakończ" ściany, kalibracja skali); ukrycie ich za
          najechaniem zostawiałoby użytkownika w połowie operacji bez wyjścia.
          `empty:hidden` gasi całą pigułkę, gdy żadne narzędzie nic tu nie wstawia —
          inaczej nad planem wisiałby pusty biały prostokąt.
          W widoku ZWYKŁYM ta sama treść renderuje się NIŻEJ, wewnątrz kolumny płótna,
          TUŻ NAD `<DesignCanvas>` (patrz `kolumnaPlotnaRef`) — w zwykłym przepływie,
          nie jako nakładka. Świadomy wybór: nakładka (`position:absolute`) próbowana
          jako pierwsza zasłaniała samo płótno w miejscu, gdzie realnie zaczyna się
          rysowanie ściany/pomieszczenia (np. blisko lewego górnego rogu) — pierwszy
          klik/przeciągnięcie trafiał wtedy w pigułkę zamiast w płótno. W przepływie
          pigułka owszem przesuwa płótno o własną wysokość, ale TYLKO płótno w jego
          WŁASNEJ kolumnie — pasek narzędzi, kolumna ToolRail i panel Elementy/
          Pomieszczenia (czyli to, o co chodziło w zgłoszeniu: „nie przesuwały
          wszystkiego w dół") stoją w miejscu. Musi to być OSOBNE miejsce w drzewie,
          a nie zwykły warunek na tym samym węźle: gdyby pigułka pływała nad CAŁĄ
          szerokością strony (jak tutaj, w pełnym ekranie), zasłaniałaby klikalne
          przyciski paska narzędzi i zakładki panelu pod spodem. */}
      {pelnyEkran && (
        <div
          className="absolute left-1/2 z-30 flex max-w-[calc(100%-10rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-3 rounded-card border border-copper/40 bg-[#FDF6EF]/95 px-3 py-2 shadow-lg backdrop-blur transition-[top] duration-200 empty:hidden"
          // Odsłonięty pasek edytora zajmuje górę okna — pigułka zjeżdża wtedy pod niego,
          // zamiast się z nim nakładać.
          style={{ top: rozmiaryChrome.gora + 12 }}
        >
          {kontekstoweTresc}
        </div>
      )}

      {/* Przypięty pasek ODSUWA płótno, zamiast się na nie kłaść. Panel na stałe
          zasłaniający róg rysunku byłby gorszy od chowającego się: zabierałby miejsce
          pracy bez możliwości zajrzenia pod spód. Nieprzypięte paski nadal pływają
          nad planem — tam przykrycie trwa chwilę i jest ceną za odsłonięcie. */}
      <div
        className={pelnyEkran ? "h-full w-full" : "flex flex-wrap items-start gap-4"}
        style={
          pelnyEkran
            ? {
                paddingLeft: przypietyPanel ? rozmiaryChrome.lewo : undefined,
                paddingTop: rozmiaryChrome.gora,
                paddingBottom: rozmiaryChrome.dol,
              }
            : undefined
        }
      >
        {/* Pasek narzędzi i panel tworzą JEDNĄ kartę — wzorzec activity baru z VS Code.
            Wcześniej pasek był osobną wysepką kończącą się w połowie wysokości, przez
            co wyglądał na oderwany, a w rzędzie stały trzy niezależne obiekty. To zresztą
            konceptualnie jedno: pasek wybiera, CZYM pracuję, panel pokazuje opcje dla
            tego wyboru.
            W pełnym ekranie ta sama karta staje się nakładką wysuwaną zza lewej
            krawędzi — `shadow-xl` odrywa ją wtedy wizualnie od rysunku pod spodem. */}
        <div
          ref={lewaKartaRef}
          className={
            pelnyEkran
              // Przy samej krawędzi (`left-0`), bez zaokrąglenia i ramki od tej strony:
              // panel wygląda wtedy jak wysunięty Z krawędzi okna, a nie jak kafelek
              // przypadkiem o nią oparty.
              // Animujemy WYŁĄCZNIE `transform`. Przy `transition-all` płynnie jechałyby
              // też `top`/`bottom`, przez co karta gonilaby wysuwający się pasek
              // z opóźnieniem i na moment go zasłaniała — czyli dokładnie to, co
              // ta zmiana ma naprawić. Odsunięcie ma być natychmiastowe.
              ? "absolute left-0 z-30 flex overflow-hidden rounded-r-card border border-l-0 border-border bg-white shadow-xl transition-transform duration-200"
              : "flex shrink-0 overflow-hidden rounded-card border border-border bg-white"
          }
          // Karta USTĘPUJE pasków poziomych, zamiast się na nie kłaść. Wszystkie trzy
          // panele mają ten sam `z-index`, więc o wierzchu decydowała kolejność w DOM
          // i karta przykrywała lewy koniec górnego paska — czyli kondygnacje i podkład.
          // Odsunięcie zamiast walki na `z-index` daje układ, w którym da się korzystać
          // z obu naraz: pasek u góry, narzędzia pod nim (tak jak w edytorach kodu).
          style={
            pelnyEkran
              ? {
                  top: rozmiaryChrome.gora,
                  bottom: rozmiaryChrome.dol,
                  transform: widocznaLewa ? "translateX(0)" : "translateX(calc(-100% - 1rem))",
                }
              : undefined
          }
        >
          {/* Pinezka w rogu karty, na tle, żeby nie zlewała się z zawartością panelu. */}
          {pelnyEkran && <Pinezka klasa="absolute right-1 top-1 z-10 bg-white/90" />}
          <ToolRail
          value={toolMode}
          onToolRef={(id, el) => {
            if (id === "skala") scaleToolRef.current = el;
            if (id === "sciany") wallToolRef.current = el;
          }}
          onChange={(id) => {
          // Wyjście z trybu porzuca niedokończoną figurę — inaczej jej punkty
          // wisiałyby na planie i doklejałyby się po powrocie do rysowania.
          if (id !== "pomieszczenie") setDrawingRoomPoints([]);
          if (id !== "sciany") setDrawingWall([]);
          setToolMode(id);
          // Zakładka panelu ma pokazywać zawartość ZGODNĄ z wybranym narzędziem —
          // „Wstaw element” podświetla „Elementy”, „Obrysuj pomieszczenie” podświetla
          // „Pomieszczenia”. Wcześniej pasek zmieniał tylko narzędzie i zostawiał
          // zakładkę bez zmian, więc po przejściu z jednego narzędzia na drugie w
          // panelu nadal stała treść od poprzedniego wyboru — myląco, bo z boku
          // wyglądało to na niedziałający przycisk.
          if (id === "elementy") setSidebarTab("elementy");
          if (id === "pomieszczenie") setSidebarTab("pomieszczenia");
          // Sięgnięcie po narzędzie, które karmi się panelem, rozwija go, jeśli był
          // zwinięty. W drugą stronę NIE działa: żadne narzędzie panelu nie zamyka.
          if (id === "elementy" || id === "pomieszczenie") rozwinPanel();
          // Ręczny wybór narzędzia z paska (a nie z CTA karty/onboardingu) chowa
          // dymek — dotyczy obu: linijki i ścian.
          setCoachMark(null);
          }}
          />

          {/* Uchwyt zwijania na styku paska narzędzi i panelu. Widoczny ZAWSZE, w obie
              strony — zwinięty panel bez widocznego sposobu powrotu byłby pułapką,
              a nie oszczędnością miejsca.
              Zwarty i wyśrodkowany (`self-center`), a nie na całą wysokość karty: pasek
              od góry do dołu czyta się jak kreska rozdzielająca, a nie jak przycisk —
              i przy wysokiej karcie jego środek wypada poza ekranem, więc bywa nie do
              kliknięcia. */}
          <button
            onClick={przelaczPanel}
            title={panelZwiniety ? "Pokaż panel elementów i pomieszczeń" : "Zwiń panel — więcej miejsca dla planu"}
            aria-label={panelZwiniety ? "Pokaż panel boczny" : "Zwiń panel boczny"}
            aria-expanded={!panelZwiniety}
            style={{ height: 56 }}
            className="flex w-4 shrink-0 items-center justify-center self-center rounded-sm border border-border bg-white text-slate-400 transition-colors hover:bg-slate-50 hover:text-copper"
          >
            {panelZwiniety ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
          </button>

          {/* W pełnym ekranie panel NIE przewija się sam — jest kolumną o pełnej
              wysokości, a przewijanie oddaje liście elementów w środku. Wcześniej
              przewijały się oba naraz i pokazywały dwa suwaki obok siebie. */}
          {!panelZwiniety && (
          <div
            className={pelnyEkran ? "flex min-h-0 flex-col overflow-hidden border-l border-border p-2" : "border-l border-border p-2"}
            style={{ width: 268 }}
          >
          <div className="mb-2 flex gap-1 rounded-lg border border-border bg-white p-1 text-xs">
            <button
              onClick={() => setSidebarTab("elementy")}
              className="flex-1 rounded-md py-1.5"
              style={sidebarTab === "elementy" ? { background: "#2D5A8C10", color: "#2D5A8C" } : { color: "#64748B" }}
            >
              Elementy
            </button>
            <button
              onClick={() => setSidebarTab("pomieszczenia")}
              className="flex-1 rounded-md py-1.5"
              style={sidebarTab === "pomieszczenia" ? { background: "#2D5A8C10", color: "#2D5A8C" } : { color: "#64748B" }}
            >
              Pomieszczenia ({roomShapes.length})
            </button>
          </div>

          {sidebarTab === "elementy" ? (
            <ElementLibrary
              wypelnijWysokosc={pelnyEkran}
              activeType={activeType}
              onPick={(type) => {
                setActiveType(type);
                setToolMode("elementy");
              }}
              gangs={gangsForType(activeType)}
              onSetGangs={(type, n) => setGangsByType((g) => ({ ...g, [type]: n }))}
              dedicated={dedicated}
              onToggleDedicated={setDedicated}
            />
          ) : (
            <RoomPanel roomShapes={roomShapes} />
          )}
          </div>
          )}
        </div>

        <div
          ref={kolumnaPlotnaRef}
          className={pelnyEkran ? "h-full w-full p-2" : undefined}
          style={pelnyEkran ? undefined : { flex: "1 1 480px", minWidth: 320 }}
        >
          {/* Widok ZWYKŁY: ta sama pigułka kontrolek kontekstowych co w pełnym ekranie
              (`kontekstoweTresc` wyżej), tylko stojąca W PRZEPŁYWIE tuż nad samym
              płótnem, w slocie o STAŁEJ wysokości (`min-h-[92px]`) zamiast pływająca
              nad całą stroną jak w pełnym ekranie. Dwie wcześniejsze próby odpadły:
              - `position:absolute` nad płótnem zasłaniało samo płótno w miejscu, gdzie
                realnie zaczyna się rysowanie (blisko lewego górnego rogu) — pierwszy
                klik/przeciągnięcie trafiał w pigułkę zamiast w scenę Konvy;
              - slot o wysokości RÓWNEJ bieżącej treści (bez `min-h`) przesuwał płótno
                przy KAŻDEJ zmianie treści, nie tylko przy zmianie narzędzia — np. sam
                tekst podpowiedzi przy rysowaniu wieloboku rośnie z „kliknij pierwszy
                narożnik" do „N pkt. — kliknij w pierwszy punkt, aby zamknąć" i mógł
                zawinąć się na DRUGĄ linię w trakcie klikania kolejnych wierzchołków —
                płótno (a więc i już postawione punkty względem kursora) jechało w dół
                W POŁOWIE gestu rysowania, czyli dokładnie to, czego dotyczy zgłoszenie,
                tylko przeniesione o poziom niżej.
              Stała wysokość slotu eliminuje oba: płótno startuje zawsze w tym samym
              miejscu swojej kolumny, niezależnie od narzędzia i etapu jego pracy —
              a ToolRail i panel Elementy/Pomieszczenia po lewej i tak nigdy się nie
              ruszają, co jest sednem zgłoszenia („nie przesuwały wszystkiego w dół").
              Ramka/tło pojawiają się tylko, gdy jest co pokazać (`kontekstoweAktywne`)
              — inaczej tryb „zaznacz" (domyślny, najczęstszy) wisiałby nad płótnem
              jako pusty bordowany prostokąt. */}
          {!pelnyEkran && (
            <div
              className={
                "mb-1.5 flex min-h-[92px] flex-wrap items-center gap-3 rounded-card px-3 py-2" +
                (kontekstoweAktywne ? " border border-copper/40 bg-[#FDF6EF] shadow-sm" : "")
              }
            >
              {kontekstoweTresc}
            </div>
          )}
          <DesignCanvas
            stageRef={stageRef}
            elements={elements}
            walls={walls}
            roomShapes={roomShapes}
            openings={openings}
            toolMode={toolMode}
            roomMode={roomMode}
            snapOn={snapOn}
            gridOn={gridOn}
            selected={selected}
            multiSelected={multiSelected}
            drawingWall={drawingWall}
            newWallThickness={wallThickness}
            orthoWalls={orthoWalls}
            drawingRoomPoints={drawingRoomPoints}
            bgImageUrl={bgImageUrl}
            calibPoints={calibPoints}
            zones={zones}
            cableRoutes={cableRoutes}
            routeOverrides={routeOverrides}
            lightGroups={lightGroups}
            elementScale={elementScale * BASE_ELEMENT_SCALE}
            planSize={planSize}
            metersPerUnit={mpu}
            onOutsidePlan={flashOutsideHint}
            onPointerMove={setCursor}
            zoom={zoom}
            onZoomChange={(z) => {
              setZoomReczny(true);
              setZoom(z);
            }}
            maxHeight={wysPlotna}
            onSelectElement={(id, shiftKey) => {
              if (shiftKey) {
                setMultiSelected((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
                return;
              }
              setSelected({ kind: "el", id });
              setMultiSelected([]);
            }}
            onSelectWall={(id) => {
              setSelected({ kind: "wall", id });
              setMultiSelected([]);
            }}
            onEditElement={(id) => setEditingId(id)}
            onElementContextMenu={handleElementContextMenu}
            onWallContextMenu={handleWallContextMenu}
            onWallDrawContextMenu={handleWallDrawContextMenu}
            onWallClickForOpening={handleWallClickForOpening}
            onSelectOpening={(id) => {
              setSelected({ kind: "opening", id });
              setMultiSelected([]);
            }}
            onOpeningContextMenu={handleOpeningContextMenu}
            onSelectRoom={(id) => {
              setSelected({ kind: "room", id });
              setMultiSelected([]);
            }}
            onRoomEdgeClickForOpening={handleRoomEdgeClickForOpening}
            onRoomContextMenu={handleRoomContextMenu}
            onRoomNameDblClick={(id, clientX, clientY) => {
              const room = roomShapes.find((r) => r.id === id);
              if (!room) return;
              setSelected({ kind: "room", id });
              setRoomNameEdit({ x: clientX, y: clientY, id, value: room.name });
            }}
            onMoveRoomPoint={(id, index, point) => moveRoomShapePoint(id, index, point)}
            onMoveWallPoint={moveWallPoint}
            onSelectRoute={(id) => {
              setSelected({ kind: "route", id });
              setMultiSelected([]);
            }}
            onSetRoutePoints={setRouteOverride}
            onResetRoute={clearRouteOverride}
            onClearSelection={() => {
              setSelected(null);
              setMultiSelected([]);
            }}
            onMarqueeSelect={(ids) => {
              setMultiSelected(ids);
              setSelected(null);
            }}
            onPlaceElement={handlePlaceElement}
            onMoveElement={(id, x, y) => setDraft((d) => ({ ...d, elements: d.elements.map((e) => (e.id === id ? { ...e, x, y } : e)) }))}
            onMoveElements={(moves) =>
              setDraft((d) => ({
                ...d,
                elements: d.elements.map((e) => {
                  const m = moves.find((mv) => mv.id === e.id);
                  return m ? { ...e, x: m.x, y: m.y } : e;
                }),
              }))
            }
            onAddWallPoint={(p) => setDrawingWall((pts) => [...pts, p])}
            onAddRoomPoint={(p) => setDrawingRoomPoints((pts) => [...pts, p])}
            onRoomRectDrawn={(points) => setPendingRoom({ points, name: nextRoomName(roomShapes.length) })}
            onCloseRoomPolygon={finishRoomDrawing}
            onAddCalibPoint={(p) => setCalibPoints((pts) => (pts.length >= 2 ? [p] : [...pts, p]))}
          />
          {/* Pasek stanu razem z linijką danych planu — w pełnym ekranie wysuwany zza
              dolnej krawędzi. Liczby (powierzchnia, skala, pozycja kursora) przydają
              się przy sprawdzaniu, a nie przy samym rysowaniu, więc mogą być schowane. */}
          <div
            className={
              pelnyEkran
                ? "absolute inset-x-0 bottom-0 z-30 border border-border bg-white px-2 py-1 shadow-xl"
                : undefined
            }
            ref={dolnyPasekRef}
          >
          <EditorStatusBar
            floorName={floorName}
            roomShapes={roomShapes}
            elementCount={elements.length}
            metersPerUnit={mpu}
            cursor={cursor}
          />
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
            <span className="text-slate-400">Obszar planu: {planSize.w} × {planSize.h} jedn.</span>
            {/* Szerokość rzutu w metrach — tak laik może sprawdzić, czy skala się zgadza.
                „1:50" nic mu nie mówi bez formatu arkusza w ręku. */}
            {mpu && (
              <span className="pe-chip pe-tag-green">rzut ≈ {planWidthMeters(mpu, planSize.w)!.toFixed(1)} m szer.</span>
            )}
            {outsideHint && (
              <span className="font-medium" style={{ color: "#8A5526" }}>
                Kliknięcie poza obszarem planu — element trafiłby poza rysunek, więc nic nie postawiono.
              </span>
            )}
          </div>
          </div>
        </div>
      </div>

      {/* UCHWYTY: jedyna rzecz, po której widać, że przy krawędziach coś jest schowane.
          Bez nich tryb wygląda jak plan bez narzędzi — nikt nie wodzi myszą po
          krawędziach ekranu w poszukiwaniu niewidzialnych paneli.
          Są też PRZYCISKAMI, nie samą dekoracją: na tablecie nie ma najeżdżania myszą,
          więc kliknięcie musi wystarczyć do otwarcia panelu. Znikają, gdy panel jest
          już wysunięty — wtedy niczego nie zapowiadają. */}
      {pelnyEkran && !widocznaLewa && (
        <button
          onClick={() => setChromeLewo(true)}
          title="Narzędzia rysowania — najedź na krawędź albo kliknij"
          aria-label="Pokaż narzędzia rysowania"
          style={{ width: PAS_WYZWALAJACY }}
          className="absolute left-0 top-1/2 z-30 flex -translate-y-1/2 flex-col items-center gap-1.5 rounded-r-lg border border-l-0 border-border bg-white/90 py-3 text-slate-400 shadow-md backdrop-blur transition-colors hover:bg-white hover:text-copper"
        >
          <ChevronRight size={13} />
          <span className="text-[9px] font-semibold uppercase tracking-wider" style={{ writingMode: "vertical-rl" }}>
            Narzędzia
          </span>
          <ChevronRight size={13} />
        </button>
      )}

      {/* Paski poziome nie mają już uchwytów ani awaryjnej pigułki „Esc": stoją na
          stałe, a wyjście z trybu siedzi w samym pasku (przycisk pełnego ekranu). */}
        </div>
      )}

      <Dialog open={!!pendingRoom} onOpenChange={(open) => !open && setPendingRoom(null)}>
        <DialogContent title="Nazwij pomieszczenie">
          <input
            autoFocus
            value={pendingRoom?.name ?? ""}
            onChange={(e) => setPendingRoom((p) => (p ? { ...p, name: e.target.value } : p))}
            // Enter zatwierdza nazwę i dodaje pomieszczenie — bez tego trzeba było
            // sięgnąć po mysz mimo trwającej pracy klawiaturą (wpisywanie nazwy).
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                savePendingRoom();
              }
            }}
            className="mb-4 w-full rounded border border-border px-3 py-1.5 text-sm"
          />
          <Button variant="copper" className="w-full" onClick={savePendingRoom}>
            Dodaj pomieszczenie
          </Button>
        </DialogContent>
      </Dialog>

      {editingElement && (
        <EditElementModal
          element={editingElement}
          roomSuggestions={roomSuggestions}
          autoLightGroups={lightGroups.get(editingElement.id)}
          onClose={() => setEditingId(null)}
          onSave={(patch) => {
            setDraft((d) => ({ ...d, elements: d.elements.map((e) => (e.id === editingElement.id ? { ...e, ...patch } : e)) }));
            setEditingId(null);
          }}
        />
      )}

      {/* Pozycjonowany `fixed`, więc miejsce w drzewie nie wpływa na układ strony. */}
      <OnboardingChecklist
        steps={onboarding.steps}
        complete={onboarding.complete}
        open={onboarding.showCard}
        compact={shouldShowCompact(seenBefore, {
          krok1Done: onboarding.steps[0].status === "done",
          krok2Done: onboarding.steps[1].status === "done",
          krok3Done: onboarding.steps[2].status === "done",
          pominiety: onboarding.skipped,
          ostatnioOtwarty: onboarding.showCard,
          skalaNieaktualna: onboarding.scaleStale,
        })}
        bezPodkladu={!onboarding.facts.maPodklad}
        onStepAction={handleStepAction}
        onDrawManually={startManualDrawing}
        onSkip={onboarding.skip}
        onReopen={onboarding.reopen}
        onCollapse={onboarding.collapse}
      />

      {coachMark === "skala" && (
        <CoachMark
          anchor={scaleToolRef.current}
          text="Kliknij dwa punkty o znanej odległości — na przykład dwa końce ściany albo framugę drzwi. Potem podasz, ile to metrów."
          onDismiss={() => setCoachMark(null)}
        />
      )}

      {coachMark === "sciany" && (
        <CoachMark
          anchor={wallToolRef.current}
          text="Klikaj kolejne narożniki, żeby postawić odcinki ściany. Enter, PPM → „Zatwierdź ścianę” albo przycisk „Zakończ” kończy bieżącą ścianę — możesz od razu zacząć kolejną."
          onDismiss={() => setCoachMark(null)}
        />
      )}

      {contextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} onContextMenu={(e) => e.preventDefault()} />
          <div
            className="pe-card fixed z-50 overflow-hidden py-1 text-sm"
            style={{ left: contextMenu.x, top: contextMenu.y, minWidth: 170 }}
          >
            {contextMenu.multi ? (
              <>
                <div className="px-3 py-1.5 text-[11px] text-slate-400">Zaznaczono {multiSelected.length}</div>
                <button
                  onClick={() => {
                    rotateElements(multiSelected);
                    setContextMenu(null);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-ink hover:bg-slate-50"
                >
                  <RotateCw size={14} /> Obróć o 90°
                </button>
                <button
                  onClick={() => {
                    deleteSelection();
                    setContextMenu(null);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-red-600 hover:bg-red-50"
                >
                  <Trash2 size={14} /> Usuń zaznaczone
                </button>
              </>
            ) : contextMenu.kind === "wall" ? (
              <button
                onClick={() => {
                  // Usunięcie ściany kasuje też JEJ otwory — inaczej zostałyby
                  // osierocone (patrz to samo w `deleteSelection`).
                  setDraft((d) => ({
                    ...d,
                    walls: d.walls.filter((w) => w.id !== contextMenu.id),
                    openings: d.openings.filter((o) => o.wallId !== contextMenu.id),
                  }));
                  setSelected(null);
                  setContextMenu(null);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-red-600 hover:bg-red-50"
              >
                <Trash2 size={14} /> Usuń ścianę
              </button>
            ) : contextMenu.kind === "opening" ? (
              <>
                <button
                  onClick={() => {
                    toggleOpeningFlip(contextMenu.id);
                    setContextMenu(null);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-ink hover:bg-slate-50"
                >
                  <RotateCw size={14} /> Obróć o 180°
                </button>
                <button
                  onClick={() => {
                    setDraft((d) => ({ ...d, openings: d.openings.filter((o) => o.id !== contextMenu.id) }));
                    setSelected(null);
                    setContextMenu(null);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-red-600 hover:bg-red-50"
                >
                  <Trash2 size={14} /> Usuń otwór
                </button>
              </>
            ) : contextMenu.kind === "room" ? (
              <button
                onClick={() => {
                  deleteRoomShape(contextMenu.id);
                  setSelected(null);
                  setContextMenu(null);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-red-600 hover:bg-red-50"
              >
                <Trash2 size={14} /> Usuń pomieszczenie
              </button>
            ) : contextMenu.kind === "wallDraw" ? (
              <button
                onClick={() => {
                  finishWall();
                  setContextMenu(null);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-ink hover:bg-slate-50"
              >
                <Check size={14} /> Zatwierdź ścianę
              </button>
            ) : (
              <>
                <button
                  onClick={() => {
                    setEditingId(contextMenu.id);
                    setContextMenu(null);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-ink hover:bg-slate-50"
                >
                  <Pencil size={14} /> Edytuj
                </button>
                <button
                  onClick={() => {
                    rotateElements([contextMenu.id]);
                    setContextMenu(null);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-ink hover:bg-slate-50"
                >
                  <RotateCw size={14} /> Obróć o 90°
                </button>
                <button
                  onClick={() => {
                    removeElements([contextMenu.id]);
                    setSelected(null);
                    setContextMenu(null);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-red-600 hover:bg-red-50"
                >
                  <Trash2 size={14} /> Usuń
                </button>
              </>
            )}
          </div>
        </>
      )}

      {roomNameEdit && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setRoomNameEdit(null)}
            onContextMenu={(e) => e.preventDefault()}
          />
          <input
            data-testid="room-name-edit"
            autoFocus
            value={roomNameEdit.value}
            onChange={(e) => setRoomNameEdit({ ...roomNameEdit, value: e.target.value })}
            onFocus={(e) => e.target.select()}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const name = roomNameEdit.value.trim();
                if (name) renameRoomShape(roomNameEdit.id, name);
                setRoomNameEdit(null);
              }
              if (e.key === "Escape") setRoomNameEdit(null);
            }}
            onBlur={() => {
              const name = roomNameEdit.value.trim();
              if (name) renameRoomShape(roomNameEdit.id, name);
              setRoomNameEdit(null);
            }}
            className="pe-card fixed z-50 px-2 py-1 text-sm outline-none"
            style={{ left: roomNameEdit.x - 60, top: roomNameEdit.y - 12, width: 120 }}
          />
        </>
      )}
    </div>
  );
}
