import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent, type MouseEvent as ReactMouseEvent } from "react";
import {
  AlertTriangle,
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndVertical,
  AlignHorizontalSpaceAround,
  AlignLeft,
  AlignRight,
  AlignStartVertical,
  AlignVerticalSpaceAround,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Layers,
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
import type { ElementType, OpeningKind, Point, RoomType } from "@/types";
import { computeSanitaryZones, VARIANTS_FOR } from "@/lib/elements";
import { computeLightGroups } from "@/lib/lightGroups";
import { alignMoves, distributeMoves, offsetMoves, type AlignMode, type DistributeAxis, type Move } from "@/lib/align";
import { checkPlan } from "@/lib/planCheck";
import { pozycjeZestawieniaDoPdf, summarizeFloor } from "@/lib/quantities";
import { przyscienny, snapToWall } from "@/lib/wallSnap";
import { computeCircuits } from "@/lib/panel/circuits";
import { applyRouteOverrides, buildCableRoutes, findPanel } from "@/lib/panel/loads";
import {
  DEFAULT_WALL_THICKNESS,
  GRID,
  MANUAL_DRAW_SCALE_MPU,
  MARGINES_KADROWANIA,
  ROOM_TYPE_LABELS,
  defaultOpeningWidth,
  detectRoomName,
  guessRoomType,
  nextRoomName,
  contentBounds,
  planSizeForImage,
  roomNameAfterMove,
  scaleOf,
} from "@/lib/design";
import {
  autoSymbolScale,
  DEFAULT_ELEMENT_SCALE,
  elementRenderScale,
  sanitaryRenderScale,
} from "@/lib/symbolScale";
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
import { PlanCheckPanel } from "./PlanCheckPanel";
import { QuantitiesPanel } from "./QuantitiesPanel";
import { EditElementModal } from "./EditElementModal";
import type Konva from "konva";
import { ELEMENT_TYPES, libSubtitle } from "@/lib/elements";
import { GlyphPreview } from "@/components/design/ElementGlyphSvg";
import { buildDrawingPdf } from "@/lib/pdf/drawing";
import { bialePlotno, plotnoDoPdf, rysujPodzialke, svgDoPlotna, PIKSELI_NA_PUNKT } from "@/lib/pdf/raster";
import { projectFileName } from "@/lib/pdf/download";
import { resolveDocHeader } from "@/lib/docHeader";
import { PdfPreview } from "@/components/ui/PdfPreview";

const DEFAULT_ROOM_SUGGESTIONS = ["Salon", "Kuchnia", "Łazienka", "Sypialnia", "Korytarz"];


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

const WYROWNANIA: { mode: AlignMode; label: string; Icon: typeof AlignLeft }[] = [
  { mode: "lewo", label: "Wyrównaj do lewej", Icon: AlignLeft },
  { mode: "srodekX", label: "Wyśrodkuj w pionie", Icon: AlignCenterHorizontal },
  { mode: "prawo", label: "Wyrównaj do prawej", Icon: AlignRight },
  { mode: "gora", label: "Wyrównaj do góry", Icon: AlignStartVertical },
  { mode: "srodekY", label: "Wyśrodkuj w poziomie", Icon: AlignCenterVertical },
  { mode: "dol", label: "Wyrównaj do dołu", Icon: AlignEndVertical },
];

const ROZLOZENIA: { axis: DistributeAxis; label: string; Icon: typeof AlignLeft }[] = [
  { axis: "x", label: "Rozłóż równomiernie w poziomie", Icon: AlignHorizontalSpaceAround },
  { axis: "y", label: "Rozłóż równomiernie w pionie", Icon: AlignVerticalSpaceAround },
];

const OPENING_KINDS: { id: OpeningKind; label: string }[] = [
  { id: "drzwi", label: "Drzwi" },
  { id: "okno", label: "Okno" },
];

const ROOM_MODES: { id: RoomDrawMode; label: string; hint: string }[] = [
  { id: "prostokat", label: "Prostokąt", hint: "przeciągnij z wciśniętym przyciskiem albo kliknij dwa przeciwległe narożniki" },
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
  const roomsFixedOnLoad = useProjectStore((s) => s.roomsFixedOnLoad);
  const dismissRoomsFixedOnLoad = useProjectStore((s) => s.dismissRoomsFixedOnLoad);
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
  // Pełne listy (wszystkie kondygnacje) — potrzebne WYŁĄCZNIE do podkładu z piętra
  // poniżej; reszta widoku pracuje na przefiltrowanych `useActiveFloor*`.
  const wszystkieSciany = useProjectStore((s) => s.draft.walls);
  const wszystkiePomieszczenia = useProjectStore((s) => s.draft.roomShapes);
  const wszystkieElementy = useProjectStore((s) => s.draft.elements);
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

  /**
   * Ile metrów ma jedno oczko siatki — miarka podpisana wprost przy przełączniku
   * przyciągania (patrz `EditorToolbar`).
   *
   * Przy rysowaniu od zera wychodzi równo 1 m i to jest cała pointa: siatka jest
   * wtedy linijką, po której da się odmierzyć pokój, zamiast być samą kratką
   * w tle. Dla wgranego, skalibrowanego rzutu wypada dowolna liczba — dlatego
   * liczona ze skali, a nie wpisana na sztywno.
   *
   * Zera po przecinku obcinane, żeby najczęstszy przypadek czytał się „1 m",
   * a nie „1,00 m”.
   */
  const opisKrokuSiatki = useMemo(() => {
    if (mpu === null || !(mpu > 0)) return null;
    const metry = (GRID * mpu).toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
    return `1 kratka = ${metry.replace(".", ",")} m`;
  }, [mpu]);

  const floors = useProjectStore((s) => s.floors);
  const floorName = floors.find((f) => f.id === activeFloorId)?.name ?? "Kondygnacja";

  const elements = useActiveFloorElements();
  const rawDocHeader = useProjectStore((st) => st.docHeader);
  const projectName = useProjectStore((st) => st.projectName);
  const stageRef = useRef<Konva.Stage | null>(null);
  /** Porzucenie podglądów żyjących WEWNĄTRZ płótna (prostokąt pomieszczenia, ramka
   *  zaznaczania) — patrz `anulujPodgladRef` w DesignCanvas. Escape obsługujemy tutaj,
   *  a tamten stan jest lokalny, więc bez tego kanału nie dało się go dosięgnąć. */
  const anulujPodgladRef = useRef<(() => boolean) | null>(null);
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
    // Wypust AGD niesie własną literę odbiornika w symbolu — dwa wypusty z RÓŻNYMI
    // literami (np. „L" lodówka, „Z" zmywarka) to WIZUALNIE różne symbole, więc
    // dostają osobne wpisy w legendzie, tak jak różna liczba gniazd w ramce.
    const wpisy = new Map<string, { type: ElementType; gangs: number; agdLetter?: string }>();
    for (const el of elements) {
      const litera = el.type === "wypustAGD" ? el.agdLetter || "A" : undefined;
      wpisy.set(`${el.type}:${el.gangs || 1}:${litera ?? ""}`, { type: el.type, gangs: el.gangs || 1, agdLetter: litera });
    }
    return [...wpisy.values()].sort((a, b) =>
      ELEMENT_TYPES[a.type].label.localeCompare(ELEMENT_TYPES[b.type].label, "pl") || (a.agdLetter || "").localeCompare(b.agdLetter || "")
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

    /**
     * Kadrowanie do NARYSOWANEJ TREŚCI, nie do całego obszaru planu.
     *
     * Obszar roboczy to 1000 × 700 jedn., czyli 50 × 35 m przy rysowaniu od zera —
     * mieszkanie 10 × 8 m zajmowało więc jedną piątą kartki, a resztę wypełniała pusta
     * siatka. Wydruk był nieczytelny nie dlatego, że rysunek jest zły, tylko dlatego,
     * że pokazywaliśmy głównie tło.
     */
    const kadr = contentBounds(planSize, walls, roomShapes, elements, openings, MARGINES_KADROWANIA * autoSymbolScale(mpu)) ?? {
      x: 0,
      y: 0,
      w: planSize.w,
      h: planSize.h,
    };

    /**
     * Rzeczy pomocnicze EKRANU, których nie ma na rysunku budowlanym: siatka, szare tło
     * obszaru roboczego i jego obwódka. Chowamy je na czas eksportu i przywracamy
     * w `finally` — inaczej wyjątek przy budowaniu PDF-a zostawiłby użytkownika
     * z płótnem bez siatki i bez wyjaśnienia dlaczego.
     */
    const pomocnicze = stage.find(".tylko-ekran");
    pomocnicze.forEach((n) => n.visible(false));

    let naBieli: HTMLCanvasElement;
    try {
      // Pole rysunku obok legendy, przeliczone na piksele druku.
      const docelowaSzer = Math.round(600 * PIKSELI_NA_PUNKT);
      const kadrPx = { x: kadr.x * zoom, y: kadr.y * zoom, width: kadr.w * zoom, height: kadr.h * zoom };
      const pixelRatio = docelowaSzer / kadrPx.width;
      const plotno = stage.toCanvas({ ...kadrPx, pixelRatio }) as HTMLCanvasElement;
      // Scena Konvy jest przezroczysta — bez podłożenia bieli wychodzi czarna płachta.
      naBieli = bialePlotno(plotno.width, plotno.height);
      naBieli.getContext("2d")!.drawImage(plotno, 0, 0);
      // Podziałka DOKŁADANA DO RASTRA, więc skaluje się razem z rysunkiem przy
      // wpasowywaniu go w kartkę — patrz `rysujPodzialke`. Bez skali nie ma czego
      // odmierzać, więc jej po prostu nie ma.
      if (mpu !== null && mpu > 0) rysujPodzialke(naBieli, (zoom * pixelRatio) / mpu);
    } finally {
      pomocnicze.forEach((n) => n.visible(true));
      stage.batchDraw();
    }

    const legenda = [];
    for (const sym of uzyteSymbole) {
      const svg = glifyRef.current?.querySelector<SVGSVGElement>(`[data-glif="${sym.type}:${sym.gangs}:${sym.agdLetter ?? ""}"] svg`);
      if (!svg) continue;
      const wariant = libSubtitle(sym.type, sym.gangs);
      const opis =
        sym.agdLetter !== undefined
          ? `${ELEMENT_TYPES[sym.type].label} — litera ${sym.agdLetter}`
          : wariant && sym.gangs > 1
            ? `${ELEMENT_TYPES[sym.type].label} — ${wariant}`
            : ELEMENT_TYPES[sym.type].label;
      legenda.push({ symbol: await plotnoDoPdf(await svgDoPlotna(svg, 96)), opis });
    }

    return buildDrawingPdf({
      tytul: `Rzut — ${floorName}`,
      header: docHeader,
      rysunek: await plotnoDoPdf(naBieli),
      legenda,
      // Rozbicie „rodzaj × pomieszczenie", nie sama suma per rodzaj: monter kupuje
      // według sumy, ale montuje pokój po pokoju i to jemu potrzebny jest podział.
      zestawienie: pozycjeZestawieniaDoPdf(elements),
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
  /** Przyciąganie do siatki. Domyślnie WYŁĄCZONE, bo na wgranym podkładzie ściany
   *  budynku nie leżą na oczkach siatki i przyciąganie tylko odciągałoby od rzutu.
   *  Rysowanie od zera włącza je jawnie — patrz `startManualDrawing`. */
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
  /** Rodzaj NOWEGO otworu — ustawienie edytora, jak grubosc sciany, nie czesc projektu. */
  const [openingKind, setOpeningKind] = useState<OpeningKind>("drzwi");
  const [pendingRoom, setPendingRoom] = useState<{ points: Point[]; name: string; type: RoomType; typeTouched: boolean } | null>(
    null
  );
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
  /** Tryb wymiarowania — domyslnie WYLACZONY: przy rysowaniu wymiary przeszkadzaja,
   *  a potrzebne sa przy sprawdzaniu i przed wydrukiem. */
  const [showDimensions, setShowDimensions] = useState(false);
  /** Podglad kondygnacji ponizej — domyslnie WYLACZONY: na parterze nie ma czego
   *  pokazac, a przy jednej kondygnacji przelacznik byloby samym szumem. */
  const [showUnderlay, setShowUnderlay] = useState(false);
  /** Przyciaganie osprzetu do scian. Domyslnie WLACZONE: to najczestsza czynnosc
   *  w calej aplikacji, a bez obrotu symbole stoja byle jak. Wylaczalne, bo nie kazdy
   *  element montuje sie w scianie (gniazdo podlogowe, wyspa kuchenna). */
  const [wallSnapOn, setWallSnapOn] = useState(true);
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

  /** Górna krawędź pływającej karty przewodnika — biblioteka elementów kończy się nad
   *  tą linią, żeby karta jej nie zasłaniała (patrz `goraKarty` w ElementLibrary.tsx). */
  const [goraPrzewodnika, setGoraPrzewodnika] = useState<number | null>(null);

  // --- wgrywanie podkładu ------------------------------------------------------
  const wgrywanie = useFloorPlanUpload();
  const ostatniRzutRef = useRef<string | null>(null);

  // --- onboarding ------------------------------------------------------------
  const onboarding = useOnboardingProgress();
  const setOnboarding = useProjectStore((s) => s.setOnboarding);
  const { dismissScaleStale } = onboarding;

  /**
   * Pierwszy ekran zupełnie świeżego projektu: JEDEN wybór (wgraj rzut / narysuj
   * samodzielnie / pomiń) zamiast trzech nakładających się wezwań do działania
   * naraz — banera „Zacznij od wgrania rzutu", karty onboardingu i pustej siatki
   * pod spodem. Znika przy PIERWSZYM fakcie świadczącym, że użytkownik już zaczął
   * (te same fakty, na których stoi reszta onboardingu — patrz `OnboardingFacts`
   * w lib/onboarding.ts) — i WRACA, jeśli te fakty przestaną być prawdą (np. „Usuń"
   * na świeżo wgranym podkładzie, zanim zdążyło się cokolwiek jeszcze zdarzyć — to
   * naprawdę powrót do punktu zero, więc ponowna propozycja wyboru ma sens).
   * WYJĄTEK: świadome „Pomiń" na TYM EKRANIE (`onboarding.entryScreenDismissed`,
   * trwały stan projektu, NIE stan tego komponentu — przełączenie zakładki i
   * powrót odmontowuje/montuje DesignTab na nowo) już nie wraca, nawet gdy fakty
   * się cofną albo użytkownik kliknie „Otwórz przewodnik" — inaczej „Pomiń" nic
   * by nie znaczyło. `wgrywanie.stan === "bezczynny"`, bo podczas wczytywania/
   * przycinania/błędu wgrywania te własne ekrany już mają pierwszeństwo.
   */
  const showEntryScreen =
    !onboarding.entryScreenDismissed &&
    wgrywanie.stan === "bezczynny" &&
    !onboarding.facts.maPodklad &&
    !onboarding.facts.maSkale &&
    !onboarding.facts.maElement &&
    !onboarding.facts.maNazwanePomieszczenie;

  /**
   * Czy na TEJ kondygnacji nic jeszcze nie narysowano. Baner „Zacznij od wgrania
   * rzutu" pytał dotąd wyłącznie o brak podkładu (`bgImageUrl`), więc po wybraniu
   * drugiej, równorzędnej drogi startu („Narysuj dom samodzielnie") wisiał dalej —
   * nad gotowymi ścianami, pomieszczeniami i elementami namawiał do wgrania rzutu,
   * którego użytkownik świadomie nie ma. Podkład to podpowiedź na START, więc
   * propozycja gaśnie z chwilą, gdy start faktycznie nastąpił.
   *
   * Liczy się KAŻDY narysowany obiekt, nie tylko elementy instalacji: same ściany
   * bez ani jednego gniazdka to już rozpoczęty rzut.
   *
   * Świadomie per kondygnacja, nie per projekt — nowe piętro startuje puste i tam
   * podkład znowu bywa najkrótszą drogą (patrz baner `needsRoomConfirmation` niżej,
   * który działa dokładnie w tej samej sytuacji).
   */
  const kondygnacjaPusta = elements.length === 0 && walls.length === 0 && roomShapes.length === 0;

  /**
   * Dopasowanie zoomu działa też wtedy, gdy kolumna płótna DOPIERO CO się
   * pojawiła. Dopóki trwa `showEntryScreen` albo przycinanie podkładu, ta
   * kolumna w ogóle nie jest zamontowana (`kolumnaPlotnaRef.current === null`),
   * więc efekt uruchomiony tylko raz przy montowaniu KOMPONENTU (nie kolumny)
   * łapał pustą referencję i już nigdy nie wracał — rzut zostawał na 100%
   * (pełny rozmiar planu w pikselach) zamiast skurczyć się do dostępnego
   * miejsca, przez co po wybraniu „Narysuj dom samodzielnie” płótno wychodziło
   * poza widoczny obszar i trzeba było przewijać. `wgrywanie.stan` i
   * `showEntryScreen` w zależnościach wymuszają ponowne dopięcie obserwatora
   * dokładnie w momencie, gdy kolumna faktycznie się pojawia.
   */
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
  }, [dopasujZoom, zoomReczny, wgrywanie.stan, showEntryScreen]);

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
    // Przy TEJ skali jedno oczko siatki to równo 1 metr (patrz MANUAL_DRAW_SCALE_MPU),
    // więc przyciąganie przestaje być „pomocą w wyrównywaniu", a staje się sposobem
    // rysowania w pełnych metrach — bez niego dom rysowany od zera wychodzi
    // w przypadkowych wymiarach (4,37 m zamiast 4,40), których nikt nie zamierzał.
    // Włączamy je tu, a nie w domyślnym stanie `snapOn`, bo na wgranym podkładzie
    // przyciąganie przeszkadza: ściany na zdjęciu nie leżą na oczkach siatki.
    setSnapOn(true);
    setToolMode("sciany");
    setCoachMark("sciany");
  }
  /** Zmiana narzędzia — wspólna dla kliknięcia w ToolRail I skrótu klawiszowego
   *  (patrz keydown handler niżej), żeby oba wejścia miały DOKŁADNIE te same
   *  efekty uboczne (porzucenie niedokończonej figury, przełączenie zakładki
   *  panelu, rozwinięcie zwiniętego panelu, zgaszenie dymka coach-marka) —
   *  bez wspólnej funkcji skrót klawiszowy "po cichu" pomijałby część z nich. */
  function selectTool(id: ToolMode) {
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
  }

  /** Skróty klawiszowe narzędzi (patrz `RAIL_TOOLS[].shortcut` w ToolRail.tsx —
   *  tooltipy pokazują tę samą literę). Osobna mapa zamiast if-else w keydown
   *  handlerze, żeby dodanie/zmiana skrótu wymagała jednej linijki w JEDNYM
   *  miejscu (w ToolRail literę widzi użytkownik, tutaj musi się zgadzać). */
  const TOOL_SHORTCUTS: Record<string, ToolMode> = {
    v: "zaznacz",
    e: "elementy",
    p: "pomieszczenie",
    w: "sciany",
    d: "otwory",
    h: "pan",
    s: "skala",
  };

  const [contextMenu, setContextMenu] = useState<
    { x: number; y: number; kind: "el" | "wall" | "room" | "wallDraw" | "opening"; id: string; multi: boolean } | null
  >(null);
  /** Edycja nazwy pomieszczenia w miejscu dwukliku na planie (input-nakładka, bo
   *  Konva nie ma natywnego pola tekstowego — ten sam trik co przy contextMenu). */
  const [roomNameEdit, setRoomNameEdit] = useState<{ x: number; y: number; id: string; value: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  /**
   * Zmiana narzędzia PRZYNOSZĄCA ze sobą gotowe zaznaczenie — skok ze spostrzeżenia
   * „Pokaż na planie" (patrz `pokazElementyNaPlanie`).
   *
   * Efekt niżej reaguje na KAŻDĄ zmianę `toolMode`, a React uruchamia efekty dopiero
   * po zatwierdzeniu wszystkich `setState` z jednej obsługi zdarzenia — więc bez tej
   * flagi czyszczenie wykonywało się PO ustawieniu zaznaczenia i kasowało je w tym
   * samym kliknięciu. Efekt: przycisk przełączał narzędzie i nie zaznaczał niczego.
   */
  const zaznaczenieZeSkokuRef = useRef(false);

  useEffect(() => {
    if (zaznaczenieZeSkokuRef.current) {
      zaznaczenieZeSkokuRef.current = false;
      return;
    }
    setMultiSelected([]);
    setCalibPoints([]);
  }, [toolMode]);

  /**
   * Zmiana kondygnacji zeruje WSZYSTKO, co wskazuje na obiekty z poprzedniego piętra.
   *
   * Płótno pokazuje tylko aktywną kondygnację (`useActiveFloor*`), ale te stany trzymają
   * gołe `id` i punkty — bez filtra po piętrze. Zaznaczenie przeżywające przełączenie
   * było więc bronią wycelowaną w rzeczy poza ekranem: pigułka kontrolek dalej pokazywała
   * „Usuń zaznaczone (4)”, a klik (albo Delete) kasował cztery elementy na piętrze, na
   * które użytkownik właśnie przestał patrzeć — bez żadnego widocznego skutku, więc i bez
   * szansy, żeby zauważyć pomyłkę i cofnąć.
   *
   * Ten sam problem, tylko odwrócony, miały niedokończone figury: `finishWall` czyta
   * `drawingWall` i zapisuje ścianę na AKTYWNEJ kondygnacji, więc przełączenie piętra
   * w połowie rysowania przeniosłoby narysowane punkty na nowe piętro.
   */
  useEffect(() => {
    setSelected(null);
    setMultiSelected([]);
    setCalibPoints([]);
    setDrawingWall([]);
    setDrawingRoomPoints([]);
    setContextMenu(null);
    setRoomNameEdit(null);
    setEditingId(null);
  }, [activeFloorId]);

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
      // Skróty narzędzi (V/E/P/W/D/H/S — patrz TOOL_SHORTCUTS/ToolRail.tsx). Bez
      // modyfikatorów: z Ctrl/Cmd/Alt to byłby skrót PRZEGLĄDARKI (np. Ctrl+P —
      // drukowanie), nie ten. Sam skrót dostępny WSZĘDZIE, nie tylko w trybie
      // „zaznacz" — to zamiennik kliknięcia w pasek narzędzi, który też działa
      // z dowolnego trybu.
      if (!e.ctrlKey && !e.metaKey && !e.altKey && tag !== "INPUT" && tag !== "TEXTAREA") {
        const tool = TOOL_SHORTCUTS[e.key.toLowerCase()];
        if (tool) {
          e.preventDefault();
          selectTool(tool);
        }
      }
      /**
       * Strzałki przesuwają zaznaczenie o JEDNĄ jednostkę planu, a z Shiftem o całe
       * oczko siatki (`GRID`). Bez tego jedynym sposobem na poprawienie gniazdka
       * o centymetr było przeciąganie myszą, czyli operacja z dokładnością do piksela
       * ekranu — przy oddalonym widoku jeden piksel to kilka centymetrów planu.
       *
       * `preventDefault` obowiązkowo: strzałki bez tego przewijają stronę, a płótno
       * odjeżdża spod kursora w trakcie poprawiania.
       */
      const STRZALKI: Record<string, Point> = {
        ArrowLeft: { x: -1, y: 0 },
        ArrowRight: { x: 1, y: 0 },
        ArrowUp: { x: 0, y: -1 },
        ArrowDown: { x: 0, y: 1 },
      };
      const kierunek = STRZALKI[e.key];
      if (kierunek && tag !== "INPUT" && tag !== "TEXTAREA" && zaznaczoneElementy.length > 0) {
        e.preventDefault();
        const krok = e.shiftKey ? GRID : 1;
        przesunElementy(offsetMoves(elements, zaznaczoneElementy, kierunek.x * krok, kierunek.y * krok));
      }

      // Ctrl/Cmd+D — duplikuj zaznaczenie. Odsunięte o pół oczka siatki, żeby kopia
      // nie schowała się dokładnie pod oryginałem i dało się ją od razu przeciągnąć.
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d" && tag !== "INPUT" && tag !== "TEXTAREA") {
        e.preventDefault();
        if (zaznaczoneElementy.length > 0) duplikujZaznaczenie();
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
        // Najpierw płótno — jego podglądy (prostokąt pomieszczenia w trakcie
        // przeciągania, ramka zaznaczania) żyją w stanie lokalnym DesignCanvas,
        // więc czyszczenie stanu tutaj samo z siebie ich nie dotykało: narysowany
        // obszar zostawał na ekranie mimo wciśniętego Escape.
        const porzuconyPodglad = anulujPodgladRef.current?.() ?? false;
        const bylCosDoPorzucenia =
          porzuconyPodglad ||
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

  // Każdy typ z wariantami ma WŁASNY licznik gangów — zmiana jednego nie wpływa na drugi.
  function gangsForType(t: ElementType): number {
    if (!VARIANTS_FOR[t]) return 1;
    return gangsByType[t] || 1;
  }

  /**
   * Zasięg przyciągania do ściany [m] — trochę ciaśniej niż tolerancja przypisania do
   * pomieszczenia (`ROOM_SNAP_TOLERANCE_M`), bo tamta tylko OPISUJE element, a ta go
   * PRZESUWA. Za szeroka ściągałaby na ścianę gniazdo postawione świadomie w podłodze
   * albo w wyspie kuchennej.
   */
  const WALL_SNAP_TOLERANCE_M = 0.35;

  /**
   * Pozycja i obrót elementu po ewentualnym przyklejeniu do ściany.
   *
   * Wspólne dla stawiania i przeciągania POJEDYNCZEGO elementu. Świadomie NIE dla
   * przeciągania grupy: przyciąganie każdego elementu z osobna rozerwałoby wzajemne
   * odstępy, które użytkownik właśnie ustawił wyrównaniem — a to jest dokładnie ten
   * sam powód, dla którego przeciąganie grupy nie przyciąga się też do siatki
   * (patrz `withSnap` w DesignCanvas).
   */
  function zPrzyciaganiemDoSciany(p: Point, type: ElementType, obecnyObrot = 0) {
    if (!wallSnapOn || !przyscienny(type)) return { x: p.x, y: p.y, rotation: obecnyObrot };
    const tolerancja = mpu ? WALL_SNAP_TOLERANCE_M / mpu : GRID / 2;
    return snapToWall(p, walls, roomShapes, tolerancja) ?? { x: p.x, y: p.y, rotation: obecnyObrot };
  }

  function handlePlaceElement(p: Point) {
    const m = zPrzyciaganiemDoSciany(p, activeType);
    setDraft((d) => ({
      ...d,
      elements: [
        ...d.elements,
        {
          id: crypto.randomUUID(),
          type: activeType,
          x: m.x,
          y: m.y,
          // Pomieszczenie liczone z pozycji PO przyciągnięciu — element ląduje wtedy
          // dokładnie na linii obrysu, gdzie decyduje tolerancja z `detectRoomName`.
          room: detectRoomName(m, roomShapes, mpu),
          floor: activeFloorId,
          dedicated: activeType === "gniazdko" ? dedicated : false,
          note: activeType === "gniazdko" && dedicated ? "AGD" : "",
          gangs: gangsForType(activeType),
          rotation: m.rotation,
          // Domyślna litera przy stawianiu z biblioteki — użytkownik podmienia ją na
          // właściwą (L, Z, ...) w edycji elementu, patrz `EditElementModal`.
          agdLetter: activeType === "wypustAGD" ? "A" : undefined,
        },
      ],
    }));
  }

  /**
   * Zastosowanie listy ruchów `{id, x, y}` — JEDNA droga dla wszystkiego, co przesuwa
   * elementy: przeciągnięcia grupy myszą, strzałek, duplikowania i wyrównywania.
   *
   * Wspólna, bo każde z nich musi przeliczyć przypisanie do pomieszczenia
   * (`roomNameAfterMove`). Wyrównanie rzędu gniazdek potrafi przesunąć skrajne o pół
   * metra — czyli akurat tyle, żeby wyjechały z pokoju — a osobne ścieżki zapisu
   * prędzej czy później rozjechałyby się w tym, która o tym pamięta.
   *
   * Pusta lista nie dotyka store'a: „Wyrównaj" na już równym rzędzie nie ma czego
   * zapisać i nie powinno zostawiać po sobie pustego kroku w historii cofania.
   */
  const przesunElementy = useCallback(
    (moves: Move[]) => {
      if (moves.length === 0) return;
      setDraft((d) => ({
        ...d,
        elements: d.elements.map((e) => {
          const m = moves.find((mv) => mv.id === e.id);
          return m ? { ...e, x: m.x, y: m.y, room: roomNameAfterMove(m, e.room, roomShapes, mpu) } : e;
        }),
      }));
    },
    [setDraft, roomShapes, mpu]
  );

  /** Id, których dotyczy operacja na zaznaczeniu — wielokrotne ma pierwszeństwo,
   *  a pojedyncze liczy się tylko dla elementów (ściany i trasy się nie wyrównują). */
  const zaznaczoneElementy = useMemo(
    () => (multiSelected.length > 0 ? multiSelected : selected?.kind === "el" ? [selected.id] : []),
    [multiSelected, selected]
  );

  /**
   * Duplikuje zaznaczone elementy, odsunięte o pół oczka siatki.
   *
   * Kopie dostają nowe `id` i przeliczone pomieszczenie (mogły wylądować w innym),
   * a zaznaczenie przechodzi na NIE — tak działa duplikowanie w każdym edytorze
   * i dzięki temu można od razu ciągnąć nową grupę w docelowe miejsce albo
   * powtórzyć skrót, żeby zrobić rząd.
   */
  function duplikujZaznaczenie() {
    const ids = zaznaczoneElementy;
    if (ids.length === 0) return;
    const odsuniecie = GRID / 2;
    const kopie = elements
      .filter((e) => ids.includes(e.id))
      .map((e) => {
        const x = e.x + odsuniecie;
        const y = e.y + odsuniecie;
        return { ...e, id: crypto.randomUUID(), x, y, room: roomNameAfterMove({ x, y }, e.room, roomShapes, mpu) };
      });
    if (kopie.length === 0) return;
    setDraft((d) => ({ ...d, elements: [...d.elements, ...kopie] }));
    setSelected(null);
    setMultiSelected(kopie.map((k) => k.id));
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

  /**
   * Klik, który zamyka wielobok ściany (przyciągnięty do jej pierwszego punktu —
   * `onCloseWall` z DesignCanvas), zatwierdza ścianę OD RAZU, z domykającym punktem
   * dołożonym na koniec — bez czekania na osobne „Zakończ"/Enter. Nie da się tu użyć
   * `finishWall`: ten czyta `drawingWall` ze stanu, które w momencie tego kliknięcia
   * jeszcze NIE zawiera punktu domykającego (`setDrawingWall` jest asynchroniczny),
   * więc zamknięcie buduje listę punktów jawnie, tak jak `createWallFromRoom`. */
  function closeWall(p: Point) {
    const points = [...drawingWall, p];
    if (points.length >= 2) {
      setDraft((d) => ({
        ...d,
        walls: [...d.walls, { id: crypto.randomUUID(), floor: activeFloorId, points, thickness: wallThickness }],
      }));
    }
    setDrawingWall([]);
  }

  /** Tworzy ścianę o kształcie IDENTYCZNYM z obrysem pomieszczenia — dla planów, które
   *  zaczęły się od samego obrysu pokoju (skrót „obrysuj pomieszczenie", bez osobnego
   *  rysowania ścian) i teraz mają dociągnąć plan do stanu z prawdziwymi ścianami:
   *  routowanie przewodów wzdłuż ścian (`buildCableRoutes`), grubość na rzucie do PDF
   *  itd. Zamknięty wielokąt — ostatni punkt domyka się z powrotem do pierwszego, tak
   *  samo jak ściana zamknięta ręcznie (patrz `finishWall`).
   *
   *  Osobny przycisk, NIE automat przy każdym narysowanym pomieszczeniu: automatyczne
   *  tworzenie ściany zdublowałoby ją u tych, którzy rysują obrys pomieszczenia
   *  WEWNĄTRZ już postawionych ścian — a to jest częsty, sprawdzony w testach
   *  przepływ, nie przypadek brzegowy. */
  function createWallFromRoom(roomId: string) {
    const room = roomShapes.find((r) => r.id === roomId);
    if (!room || room.points.length < 3) return;
    setDraft((d) => ({
      ...d,
      walls: [
        ...d.walls,
        { id: crypto.randomUUID(), floor: activeFloorId, points: [...room.points, room.points[0]], thickness: wallThickness },
      ],
    }));
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

  /** Szerokość JUŻ POSTAWIONEGO otworu — ten sam wzorzec co grubość ściany wyżej.
   *  Drzwi balkonowe, brama garażowa i okno tarasowe różnią się od siebie właśnie
   *  szerokością, a ta była do tej pory zabetonowana na wartości domyślnej. */
  function setOpeningWidth(id: string, width: number) {
    setDraft((d) => ({ ...d, openings: d.openings.map((o) => (o.id === id ? { ...o, width } : o)) }));
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
        { id, floor: activeFloorId, wallId, x: point.x, y: point.y, angle, width: defaultOpeningWidth(mpu, openingKind), kind: openingKind },
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
        { id, floor: activeFloorId, roomId, x: point.x, y: point.y, angle, width: defaultOpeningWidth(mpu, openingKind), kind: openingKind },
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
      const name = nextRoomName(roomShapes.length);
      setPendingRoom({ points: drawingRoomPoints, name, type: guessRoomType(name), typeTouched: false });
    }
    setDrawingRoomPoints([]);
  }

  function savePendingRoom() {
    if (!pendingRoom) return;
    addRoomShape(activeFloorId, pendingRoom.points, pendingRoom.name, pendingRoom.type);
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
  /**
   * Geometria kondygnacji PONIŻEJ — do przygaszonego podkładu na płótnie.
   *
   * „Poniżej" znaczy POPRZEDNIA NA LIŚCIE, a nie żadna wyliczona wysokość: kolejność
   * kondygnacji ustawia użytkownik, dodając je po kolei (Parter, Piętro 1…), i to
   * jedyny porządek, jaki aplikacja zna. Najniższa kondygnacja nie ma czego pokazać,
   * więc dostaje `null` i przełącznik się przy niej nie pojawia.
   */
  const idPonizej = useMemo(() => {
    const i = floors.findIndex((f) => f.id === activeFloorId);
    return i > 0 ? floors[i - 1].id : null;
  }, [floors, activeFloorId]);

  const podklad = useMemo(() => {
    if (!showUnderlay || !idPonizej) return null;
    return {
      walls: wszystkieSciany.filter((w) => w.floor === idPonizej),
      roomShapes: wszystkiePomieszczenia.filter((r) => r.floor === idPonizej),
      elements: wszystkieElementy.filter((e) => e.floor === idPonizej),
    };
  }, [showUnderlay, idPonizej, wszystkieSciany, wszystkiePomieszczenia, wszystkieElementy]);

  /** Zestawienie ilościowe TEJ kondygnacji — te same liczby, które trafiają do kosztorysu. */
  const zestawienie = useMemo(() => summarizeFloor(elements), [elements]);

  /** Sprawdzenie rzutu — liczone z TEJ kondygnacji, patrz komentarz przy `checkPlan`. */
  const planIssues = useMemo(
    () => checkPlan({ elements, roomShapes, metersPerUnit: mpu }),
    [elements, roomShapes, mpu]
  );

  /**
   * „Pokaż na planie" z listy spostrzeżeń. Zaznacza wskazane elementy i przełącza na
   * narzędzie zaznaczania — bez tego zaznaczenie byłoby samą obwódką, której nie da
   * się ruszyć ani skasować, a klik na płótnie w trybie „Wstaw element" postawiłby
   * kolejne gniazdko zamiast poprawić to zgłoszone.
   */
  const pokazElementyNaPlanie = useCallback(
    (ids: string[]) => {
      // Flagę stawiamy TYLKO przy faktycznej zmianie narzędzia — inaczej zostałaby
      // podniesiona na zapas i zjadła czyszczenie przy następnym, zwykłym przełączeniu.
      if (toolMode !== "zaznacz") zaznaczenieZeSkokuRef.current = true;
      setToolMode("zaznacz");
      setSelected(null);
      setMultiSelected(ids);
    },
    [toolMode]
  );
  // Trasy przewodów — WYŁĄCZNIE z elementów/ścian/pomieszczeń TEJ kondygnacji
  // (wszystkie trzy już przefiltrowane przez `useActiveFloor*`), więc rozdzielnica,
  // punkty i sieć, po której routuje `buildCableRoutes`, zawsze mieszkają w tym samym
  // układzie współrzędnych. Puste trasy zasilania bez rozdzielnicy na planie — trasy
  // sterowania (łącznik→oprawa) działają niezależnie od niej, patrz `buildCableRoutes`.
  const rawCableRoutes = useMemo(
    () => (showRoutes ? buildCableRoutes(findPanel(elements), computeCircuits(elements, roomShapes), elements, walls, roomShapes) : []),
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
    toolMode === "otwory" ||
    toolMode === "skala" ||
    (selected?.kind === "wall" && toolMode === "zaznacz" && walls.some((w) => w.id === selected.id)) ||
    (selected?.kind === "opening" && toolMode === "zaznacz" && openings.some((o) => o.id === selected.id)) ||
    (selected?.kind === "route" && toolMode === "zaznacz") ||
    // `toolMode !== "skala"` pominięte celowo: powyżej już wykluczyliśmy ten
    // przypadek (`toolMode === "skala"` zwróciłoby true wcześniej w tym samym `||`).
    !!skalaPotwierdzenie;

  /**
   * Zwinięty panel rozwija się sam, gdy w środku jest JEDYNE wyjście z zaczętej
   * operacji: „Zakończ"/„Anuluj" rysowanej ściany albo pomieszczenia i „Zatwierdź
   * skalę" przy kalibracji. Odkąd kontrolki kontekstowe mieszkają W PANELU (a nie
   * nad płótnem — patrz komentarz przy nich), zwinięcie panelu w połowie rysowania
   * zostawiałoby użytkownika bez wyjścia. To ten sam powód, dla którego w pełnym
   * ekranie pigułka kontrolek jako jedyna NIE chowa się za krawędź.
   *
   * Celowo WĘŻSZE niż `kontekstoweAktywne`: samo wybranie narzędzia (np. widoczny
   * selektor „Kształt: Prostokąt/Wielobok") niczego nie blokuje — prostokąt da się
   * narysować bez patrzenia na selektor, a panel wraca jednym kliknięciem. Gdyby
   * warunek obejmował także ten przypadek, „Zwiń panel" w trybie Pomieszczenie/Ściana
   * rozwijałby się natychmiast z powrotem i wyglądał na zepsuty przycisk.
   */
  const blokujaceKontrolki = drawingWall.length > 0 || drawingRoomPoints.length > 0 || toolMode === "skala";
  useEffect(() => {
    if (!pelnyEkran && blokujaceKontrolki && panelZwiniety) rozwinPanel();
  }, [pelnyEkran, blokujaceKontrolki, panelZwiniety, rozwinPanel]);

  /**
   * Treść pigułki kontrolek kontekstowych — WSPÓLNA dla obu miejsc, w których się
   * renderuje (pełny ekran kontra widok zwykły, patrz komentarze przy obu). Jedna
   * definicja, żeby te same kontrolki (grubość ściany, kształt pomieszczenia,
   * kalibracja skali…) nie rozjechały się przypadkiem między dwiema kopiami JSX.
   */
  const kontekstoweTresc = (
    <>
      {multiSelected.length > 0 && (
        <div className="flex min-w-0 flex-col items-start gap-1.5">
          <span className="text-xs font-medium text-slate-600">Zaznaczono: {multiSelected.length}</span>

          {/* Wyrównywanie i rozkładanie — do tej pory JEDYNĄ operacją na zaznaczeniu
              wielokrotnym było „Usuń", więc równanie rzędu gniazdek wzdłuż ściany
              robiło się przeciąganiem każdego z osobna, na oko. Ikony zamiast podpisów,
              bo sześć przycisków z nazwami nie mieści się w kolumnie 268 px; nazwa
              siedzi w `title` i `aria-label`, więc czytniki i testy ją widzą. */}
          {/* Dwa JAWNE rzędy, nie jeden zawijany: osiem przycisków po 28 px z odstępami
              przekracza szerokość kolumny o kilka pikseli, więc zawijanie łamało je
              w przypadkowym miejscu (7 + 1) i rozdzielało grupy wbrew ich znaczeniu.
              Wyrównanie i rozkładanie to dwie różne operacje — niech i wyglądają na dwie. */}
          <div className="flex items-center gap-1">
            {WYROWNANIA.map(({ mode, label, Icon }) => (
              <button
                key={mode}
                onClick={() => przesunElementy(alignMoves(elements, multiSelected, mode))}
                title={label}
                aria-label={label}
                className="pe-btn-ghost flex h-7 w-7 items-center justify-center"
              >
                <Icon size={14} />
              </button>
            ))}
          </div>

          {/* Rozkładanie ma sens dopiero od trzech — przy dwóch nie ma czego rozkładać
              (patrz `distributeMoves`), więc przyciski się nie pokazują, zamiast
              milczeć po kliknięciu. */}
          {multiSelected.length >= 3 && (
            <div className="flex items-center gap-1">
              {ROZLOZENIA.map(({ axis, label, Icon }) => (
                <button
                  key={axis}
                  onClick={() => przesunElementy(distributeMoves(elements, multiSelected, axis))}
                  title={label}
                  aria-label={label}
                  className="pe-btn-ghost flex h-7 w-7 items-center justify-center"
                >
                  <Icon size={14} />
                </button>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-1">
            <button onClick={duplikujZaznaczenie} className="pe-btn-ghost flex items-center gap-1 px-2.5 py-1 text-xs">
              <Copy size={13} /> Duplikuj
            </button>
            <button onClick={deleteSelection} className="pe-btn-ghost flex items-center gap-1 px-2.5 py-1 text-xs text-red-600">
              <Trash2 size={13} /> Usuń zaznaczone ({multiSelected.length})
            </button>
          </div>

          <span className="text-[11px] text-slate-400">Strzałki przesuwają o 1 jedn., z Shiftem o kratkę.</span>
        </div>
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
        <div className="flex flex-nowrap items-center gap-2 text-sm">
          <span className="whitespace-nowrap font-medium text-slate-600">Rysowanie ściany: {drawingWall.length} pkt.</span>
          <button onClick={finishWall} className="pe-btn-ghost shrink-0 px-2.5 py-1 text-sm">Zakończ</button>
          <button onClick={() => setDrawingWall([])} className="pe-btn-ghost shrink-0 px-2.5 py-1 text-sm">Anuluj</button>
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
      {/* Jedyna podpowiedź, jaką dostaje to narzędzie — bez ustawień typu grubość
          ściany/kształt pomieszczenia (stąd brak własnego coach-marka jak przy
          skali/ścianach, patrz `coachMark`), więc bez tej linijki jedyne wyjaśnienie
          „w co właściwie kliknąć" siedziałoby w tooltipie przycisku paska, widocznym
          tylko po najechaniu myszą — czego nikt nie robi, zanim spróbuje kliknąć. */}
      {toolMode === "otwory" && (
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs">
          <span className="font-medium text-slate-600">Rodzaj:</span>
          <div className="flex items-center gap-1 rounded-lg border border-border bg-white p-0.5">
            {OPENING_KINDS.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setOpeningKind(id)}
                className="rounded-md px-2.5 py-1 text-xs"
                style={openingKind === id ? { background: "#C1793F14", color: "#8A5526", fontWeight: 600 } : { color: "#64748B" }}
              >
                {label}
              </button>
            ))}
          </div>
          <span className="min-w-0 basis-full text-slate-500">
            Kliknij ścianę albo krawędź pomieszczenia, żeby wstawić tam {openingKind === "okno" ? "okno" : "drzwi"}.
            Szerokość poprawisz po zaznaczeniu otworu.
          </span>
        </div>
      )}

      {/* Szerokość ZAZNACZONEGO otworu — ten sam wzorzec co grubość zaznaczonej ściany
          wyżej. Wcześniej każdy otwór miał na sztywno 90 cm i nie było jak tego zmienić,
          więc drzwi balkonowe i okno tarasowe rysowały się jak zwykłe drzwi wewnętrzne. */}
      {selected?.kind === "opening" && toolMode === "zaznacz" && (() => {
        const o = openings.find((x) => x.id === selected.id);
        if (!o) return null;
        return (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500">Szerokość otworu:</span>
            <input
              data-testid="opening-width-input"
              type="number"
              min={1}
              step={mpu !== null ? 5 : 1}
              value={thicknessToDisplay(o.width)}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v) && v > 0) setOpeningWidth(o.id, thicknessFromDisplay(v));
              }}
              className="w-16 rounded border border-border px-1.5 py-0.5"
            />
            {mpu !== null ? "cm" : "jedn."}
          </div>
        );
      })()}

      {/* Wybór sposobu rysowania pojawia się dopiero po wejściu w tryb „Pomieszczenie" —
          poza nim byłby tylko szumem w pasku narzędzi. */}
      {toolMode === "pomieszczenie" && (
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
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
          <span className="min-w-0 basis-full text-slate-500">{ROOM_MODES.find((m) => m.id === roomMode)!.hint}</span>
        </div>
      )}
      {/* Prostokąt używa tej samej tablicy punktów na kotwicę pierwszego kliknięcia
          (patrz `rectAnchor` w DesignCanvas), ale komunikat musi być jego własny:
          „1 pkt." i podpowiedź o zamykaniu figury dotyczą wieloboku i przy
          prostokącie tylko wprowadzałyby w błąd. „Anuluj" jest wspólne — kasuje
          kotwicę tak samo jak zaczęty wielobok. */}
      {drawingRoomPoints.length > 0 && (
        <div className="flex flex-nowrap items-center gap-2 text-sm">
          <span className="whitespace-nowrap font-medium text-slate-600">
            {roomMode === "prostokat" ? (
              "Narożnik postawiony — kliknij przeciwległy, aby domknąć prostokąt"
            ) : (
              <>
                {drawingRoomPoints.length} pkt.
                {drawingRoomPoints.length >= 3 && " — kliknij w pierwszy punkt, aby zamknąć"}
              </>
            )}
          </span>
          {roomMode === "wielobok" && drawingRoomPoints.length >= 3 && (
            <button onClick={finishRoomDrawing} className="pe-btn-ghost shrink-0 px-2.5 py-1 text-sm">Zakończ</button>
          )}
          <button onClick={() => setDrawingRoomPoints([])} className="pe-btn-ghost shrink-0 px-2.5 py-1 text-sm">Anuluj</button>
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

      {/* Jednorazowa informacja o remoncie przypisań przy wczytaniu projektu (patrz
          `reconcileRoomsOnLoad`). Aplikacja poprawiła tu ZAPISANE dane użytkownika i
          zaraz odłoży je autozapisem — o czymś takim trzeba powiedzieć wprost, bo
          zmiana jest niewidoczna na rysunku (symbole stoją tam, gdzie stały; zmieniło
          się to, do jakiego obwodu trafią w rozdzielnicy). Do zamknięcia i bez powrotu:
          po poprawieniu danych następne wczytanie i tak naliczy zero. */}
      {roomsFixedOnLoad > 0 && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-xs"
          style={{ background: "#2D5A8C12", color: "#2D5A8C" }}
        >
          <Check size={14} className="shrink-0" />
          <span>
            Poprawiono przypisanie {roomsFixedOnLoad}{" "}
            {roomsFixedOnLoad === 1 ? "elementu" : "elementów"} do pomieszczeń — po przeniesieniu na planie zostały
            w starych pokojach. Sprawdź obwody w Rozdzielnicy.
          </span>
          <button
            onClick={dismissRoomsFixedOnLoad}
            className="ml-auto shrink-0 opacity-60 hover:opacity-100"
            title="Rozumiem"
            aria-label="Zamknij informację o poprawionych przypisaniach"
          >
            <X size={14} />
          </button>
        </div>
      )}

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

      {/* Pierwszy ekran zupełnie świeżego projektu — JEDEN wybór zamiast banera +
          karty onboardingu + pustego edytora naraz (patrz `showEntryScreen` wyżej).
          Zastępuje CAŁY edytor (baner niżej i pasek narzędzi/płótno dalej w tym
          pliku są jawnie zgaszone na czas jego trwania), a nie tylko dokłada się
          do niego — inaczej wracalibyśmy do tego samego nagromadzenia wezwań do
          działania, tylko w innej kolejności. */}
      {showEntryScreen && (
        <div className="pe-card flex flex-col items-center gap-4 px-6 py-16 text-center">
          <h2 className="pe-display text-xl">Zacznij projektować instalację</h2>
          <p className="max-w-md text-sm text-slate-500">
            Wgraj zdjęcie albo skan rzutu mieszkania, żeby rozmieścić elementy na prawdziwym planie — albo narysuj
            ściany od zera, bez podkładu.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button variant="copper" onClick={() => fileRef.current?.click()}>
              <Upload size={16} /> Wgraj rzut / zdjęcie
            </Button>
            {/* Druga, RÓWNOLEGŁA droga startu — nie zapasowa: bez rzutu pod ręką dom
                da się narysować od zera na siatce w standardowej skali (patrz
                `startManualDrawing`), zamiast zmuszać do szukania/skanowania rzutu. */}
            <Button variant="ghost" onClick={startManualDrawing}>
              Narysuj dom samodzielnie
            </Button>
          </div>
          <button onClick={onboarding.dismissEntryScreen} className="text-xs text-slate-400 underline hover:text-slate-600">
            Pomiń — zacznę na pustym planie
          </button>
        </div>
      )}

      {/* Podkład jeszcze nie wgrany — to pierwsza czynność w całym przepływie. Stała
          dotąd w panelu bocznym, NAD biblioteką elementów — ale to dwie różne sprawy
          (ogólny stan projektu kontra lista do wstawiania) tłoczące się w jednej wąskiej
          kolumnie, i tam też została zgłoszona jako przeszkadzająca. Tu, jako baner na
          całą szerokość (ten sam wzorzec co reszta banerów w tym miejscu), stoi
          w pierwszym ekranie tak samo jak wcześniej — plan-upload.spec.ts pilnuje tylko
          POZYCJI (nad biblioteką, bez scrollowania), nie konkretnego kontenera.
          Zgaszony na czas `showEntryScreen`, który oferuje DOKŁADNIE ten sam wybór —
          inaczej stałby POD nim i dublował go, czyli wracał do zgłoszonej bolączki.
          Zgaszony też, gdy na kondygnacji cokolwiek już stoi (`kondygnacjaPusta`):
          propozycja podkładu dotyczy STARTU, a po nim jest już tylko szumem. */}
      {!bgImageUrl && !showEntryScreen && kondygnacjaPusta && (
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
          przycięciu albo pominięciu edytor wraca w całości. Zgaszony też na czas
          `showEntryScreen` — to on jest pierwszym ekranem, nie pusty edytor pod nim. */}
      {wgrywanie.stan !== "przycinanie" && !showEntryScreen && (
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
          <span key={`${s.type}:${s.gangs}:${s.agdLetter ?? ""}`} data-glif={`${s.type}:${s.gangs}:${s.agdLetter ?? ""}`}>
            <GlyphPreview type={s.type} color={ELEMENT_TYPES[s.type].color} gangs={s.gangs} agdLetter={s.agdLetter} size={40} />
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
        opisKrokuSiatki={opisKrokuSiatki}
        onZapisz={session ? () => void saveToCloud({ reczny: true }) : null}
        zapisTrwa={cloudBusy}
        onSnapChange={setSnapOn}
        wallSnapOn={wallSnapOn}
        onWallSnapChange={setWallSnapOn}
        elementScale={elementScale}
        onElementScaleChange={setElementScale}
        defaultElementScale={DEFAULT_ELEMENT_SCALE}
        showZones={showZones}
        onToggleZones={() => setShowZones((z) => !z)}
        showRoutes={showRoutes}
        onToggleRoutes={() => setShowRoutes((r) => !r)}
        showDimensions={showDimensions}
        onToggleDimensions={() => setShowDimensions((d) => !d)}
        showUnderlay={showUnderlay}
        onToggleUnderlay={idPonizej ? () => setShowUnderlay((u) => !u) : null}
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
          onChange={selectTool}
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
          {/* Kontrolki kontekstowe bieżącego narzędzia (grubość ściany, kształt
              pomieszczenia, kalibracja skali, „Zakończ"/„Anuluj" rysowania) — w widoku
              ZWYKŁYM mieszkają TUTAJ, w panelu, a nie nad płótnem.
              Stały nad płótnem, w slocie o stałej wysokości 92 px, i to był powód
              zgłoszenia: w najczęstszym trybie („Zaznacz", bez zaznaczenia) slot
              świecił pustką, odsuwając rzut od paska narzędzi. Wszystkie próby
              zwijania/skracania tego slotu na miejscu odpadły — przesuwały płótno
              W POŁOWIE gestu rysowania albo zaraz po kliknięciu zaznaczającym na
              samym płótnie (patrz historia w git blame: cable-routes.spec.ts
              i room-drawing.spec.ts łapały to jako realne przesunięcie celu kliknięcia).
              Przeniesienie do panelu rozwiązuje to u źródła, a nie kompromisem:
              panel ma STAŁĄ szerokość (268 px) i własną kolumnę, więc treść może tu
              rosnąć i zawijać się do woli — kolumna płótna nawet o tym nie wie i rzut
              stoi równo z górną krawędzią paska narzędzi niezależnie od narzędzia.
              Zgodne zresztą z podziałem opisanym przy tej karcie wyżej: pasek wybiera,
              CZYM pracuję, panel pokazuje opcje dla tego wyboru. */}
          {!pelnyEkran && kontekstoweAktywne && (
            // `flex-col`, nie `flex-wrap` jak w wersji pełnoekranowej: tam pigułka ma
            // całą szerokość okna i bloki spokojnie stoją obok siebie, tu kolumna ma
            // 268 px, więc każdy blok dostaje własny wiersz. `min-w-0` na kontenerze
            // pozwala długim podpowiedziom („przytrzymaj lewy przycisk i przeciągnij")
            // zawinąć się wewnątrz zamiast wypychać treść poza panel.
            <div className="mb-2 flex min-w-0 flex-col items-start gap-2 rounded-card border border-copper/40 bg-[#FDF6EF] px-2.5 py-2 text-left shadow-sm">
              {kontekstoweTresc}
            </div>
          )}

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
              goraKarty={goraPrzewodnika}
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
            <div className="space-y-2">
              {/* Wejście w tę zakładkę było dotąd jedynym sposobem, żeby zobaczyć, że
                  trzeba wrócić do paska narzędzi po ikonę „Narysuj Pomieszczenie" —
                  przycisk tutaj skraca to o jeden krok, niezależnie od tego, czy
                  pomieszczenia już są, czy lista dopiero czeka na pierwsze. */}
              <button
                onClick={() => selectTool("pomieszczenie")}
                className="pe-btn-copper flex w-full items-center justify-center gap-1.5 py-1.5 text-xs"
              >
                <Layers size={13} /> Narysuj pomieszczenie
              </button>
              <RoomPanel roomShapes={roomShapes} metersPerUnit={mpu} onCreateWall={createWallFromRoom} />
            </div>
          )}
          </div>
          )}
        </div>

        <div
          ref={kolumnaPlotnaRef}
          className={pelnyEkran ? "h-full w-full p-2" : undefined}
          style={pelnyEkran ? undefined : { flex: "1 1 480px", minWidth: 320 }}
        >
          <DesignCanvas
            stageRef={stageRef}
            anulujPodgladRef={anulujPodgladRef}
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
            podklad={podklad}
            pokazWymiary={showDimensions}
            cableRoutes={cableRoutes}
            routeOverrides={routeOverrides}
            lightGroups={lightGroups}
            elementScale={elementRenderScale(mpu, elementScale)}
            sanitaryScale={sanitaryRenderScale(mpu)}
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
            /* Przypisanie do pomieszczenia jedzie RAZEM z elementem — patrz
               `roomNameAfterMove`. Bez tego gniazdko przeciągnięte z salonu do
               łazienki nadal raportowało się jako salonowe i po cichu trafiało do
               złego obwodu, bez strefy mokrej w doborze przekroju. Oba callbacki
               lecą raz na gest (drag end w DesignCanvas), więc to jeden wpis
               w historii cofania, nie jeden na klatkę. */
            onMoveElement={(id, x, y) =>
              setDraft((d) => ({
                ...d,
                elements: d.elements.map((e) => {
                  if (e.id !== id) return e;
                  const m = zPrzyciaganiemDoSciany({ x, y }, e.type, e.rotation ?? 0);
                  return { ...e, x: m.x, y: m.y, rotation: m.rotation, room: roomNameAfterMove(m, e.room, roomShapes, mpu) };
                }),
              }))
            }
            onMoveElements={przesunElementy}
            onAddWallPoint={(p) => setDrawingWall((pts) => [...pts, p])}
            onCloseWall={closeWall}
            onAddRoomPoint={(p) => setDrawingRoomPoints((pts) => [...pts, p])}
            onRoomRectDrawn={(points) => {
              const name = nextRoomName(roomShapes.length);
              setPendingRoom({ points, name, type: guessRoomType(name), typeTouched: false });
              // Prostokąt rysowany DWOMA KLIKNIĘCIAMI trzyma narożnik startowy w tej
              // samej tablicy co wielobok (patrz `rectAnchor` w DesignCanvas), więc
              // domknięcie figury musi ją wyczyścić — inaczej kolejny klik liczyłby
              // się od nieaktualnej kotwicy poprzedniego pomieszczenia.
              setDrawingRoomPoints([]);
            }}
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

          {/* Sprawdzenie rzutu — poza trybem pełnoekranowym. Tam plan ma dostać CAŁE
              okno, a paski zwijają się do krawędzi; karta z akapitami o normie jest
              dokładnie tym, czego ten tryb się pozbywa. Wraca po wyjściu. */}
          {!pelnyEkran && <PlanCheckPanel issues={planIssues} onShowElements={pokazElementyNaPlanie} />}
          {!pelnyEkran && <QuantitiesPanel zestawienie={zestawienie} />}
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
            onChange={(e) => {
              const name = e.target.value;
              // Podpowiedź typu śledzi nazwę tylko dopóki użytkownik sam niczego nie
              // wybrał z listy — inaczej ręczny wybór zostałby cicho nadpisany przy
              // kolejnej literze wpisywanej w polu nazwy.
              setPendingRoom((p) => (p ? { ...p, name, type: p.typeTouched ? p.type : guessRoomType(name) } : p));
            }}
            // Enter zatwierdza nazwę i dodaje pomieszczenie — bez tego trzeba było
            // sięgnąć po mysz mimo trwającej pracy klawiaturą (wpisywanie nazwy).
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                savePendingRoom();
              }
            }}
            className="mb-3 w-full rounded border border-border px-3 py-1.5 text-sm"
          />
          <label className="mb-1 block text-xs font-medium text-slate-500">Typ pomieszczenia</label>
          <select
            value={pendingRoom?.type ?? "inne"}
            onChange={(e) => {
              const type = e.target.value as RoomType;
              // Wybór z listy ustawia też nazwę na etykietę tego typu — dla
              // zdecydowanej większości pomieszczeń to i tak docelowa nazwa („Kuchnia",
              // „Łazienka"...), więc bez tego trzeba było wpisać to samo słowo DWA razy:
              // raz w polu nazwy, raz w tej liście. Kto chce inną nazwę (np. „Łazienka
              // rodziców"), nadal może ją dopisać w polu wyżej PO wybraniu typu — pole
              // nazwy zostaje zwykłym tekstem, nic mu tego nie zabrania.
              setPendingRoom((p) => (p ? { ...p, type, typeTouched: true, name: ROOM_TYPE_LABELS[type] } : p));
            }}
            className="mb-1 w-full rounded border border-border px-3 py-1.5 text-sm"
          >
            {(Object.entries(ROOM_TYPE_LABELS) as [RoomType, string][]).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <p className="mb-4 text-xs text-slate-400">
            Kuchnia, łazienka, pralnia i kotłownia rządzą się swoimi zasadami (gniazda hermetyczne, strefa mokra w
            doborze przewodu) — wybierz zgodnie z rzeczywistością, niezależnie od tego, jak nazwiesz pomieszczenie.
          </p>
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
      {/* Niewyrenderowana CAŁKOWICIE na czas `showEntryScreen`, nie tylko zwinięta
          (`open={false}`) — nawet dyskretny przycisk „?" byłby drugim, zbędnym
          zaproszeniem do tego samego wyboru, który zadaje właśnie ten ekran. */}
      {!showEntryScreen && (
      <OnboardingChecklist
        steps={onboarding.steps}
        complete={onboarding.complete}
        // Zwinięta do samego „?" na czas aktywnego coach-marka (dymek przy narzędziu
        // skali/ścian) — oba stoją w tym samym, lewym dolnym rogu i przy pełnej
        // karcie potrafiły się częściowo nakładać. Coach-mark i tak tłumaczy,
        // co robić DALEJ w tym samym kroku, więc pełna karta pod spodem jest w tej
        // chwili zbędna, nie tylko ciasna — wraca sama, gdy dymek zniknie.
        open={onboarding.showCard && !coachMark}
        compact={shouldShowCompact(seenBefore, {
          krok1Done: onboarding.steps[0].status === "done",
          krok2Done: onboarding.steps[1].status === "done",
          krok3Done: onboarding.steps[2].status === "done",
          pominiety: onboarding.skipped,
          ostatnioOtwarty: onboarding.showCard,
          skalaNieaktualna: onboarding.scaleStale,
          ekranStartowyPominiety: onboarding.entryScreenDismissed,
        })}
        bezPodkladu={!onboarding.facts.maPodklad}
        onStepAction={handleStepAction}
        onDrawManually={startManualDrawing}
        onSkip={onboarding.skip}
        onReopen={onboarding.reopen}
        onCollapse={onboarding.collapse}
        onGora={setGoraPrzewodnika}
      />
      )}

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
              <>
                <button
                  onClick={() => {
                    createWallFromRoom(contextMenu.id);
                    setContextMenu(null);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-ink hover:bg-slate-50"
                >
                  <Layers size={14} /> Utwórz ścianę z obrysu
                </button>
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
              </>
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
