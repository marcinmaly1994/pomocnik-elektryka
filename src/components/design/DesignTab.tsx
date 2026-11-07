import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent, type MouseEvent as ReactMouseEvent } from "react";
import { formatLiczba } from "@/lib/liczby";
import { klawiszDlaEdytora } from "@/lib/klawiaturaEdytora";
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
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Copy,
  CopyCheck,
  Eye,
  HelpCircle,
  Info,
  Layers,
  Loader2,
  Pencil,
  Pin,
  Plus,
  FlipHorizontal,
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
import type { ElementType, InstallationElement, OpeningKind, Point, RoomType, Wall } from "@/types";
import { pointInPolygon, punktWewnatrzWielokata } from "@/lib/geometry";
import { computeSanitaryZones } from "@/lib/elements";
import { computeLightGroups } from "@/lib/lightGroups";
import { alignMoves, distributeMoves, offsetMoves, type AlignMode, type DistributeAxis, type Move } from "@/lib/align";
import { checkPlan, stanSprawdzenia } from "@/lib/planCheck";
import { pozycjeZestawieniaDoPdf, summarizeFloor } from "@/lib/quantities";
import { przeliczPrzyscienneDoSkali, przyscienny, snapElementToWall } from "@/lib/wallSnap";
import { computeCircuits, maWlasnyObwodZDefinicji, wchodziDoObwodu } from "@/lib/panel/circuits";

import { bezNakladaniaNaSasiadow } from "@/lib/rozstawElementow";
import { applyRouteOverrides, buildCableRoutes, findPanel } from "@/lib/panel/loads";
import {
  DEFAULT_WALL_THICKNESS,
  GRID,
  MANUAL_DRAW_SCALE_MPU,
  rozpietoscRysunku,
  ROOM_TYPE_LABELS,
  WALL_SNAP_TOLERANCE_M,
  waskiEkran,
  MIN_WYS_PLOTNA,
  contentBounds,
  kadrOtwarcia,
  zoomSkaliRysowania,
  oczkoSiatkiM,
  planSizeForImage,
  roomNameAfterMove,
  detectRoomName,
  scaleOf,
  wierzcholkiZamknietejSciany,
  wysokoscPlotna,
  ZAPAS_ETYKIET,
  ZAPAS_POD_PLOTNEM,
} from "@/lib/design";
import {
  autoSymbolScale,
  skalaZRysunku,
  DEFAULT_ELEMENT_SCALE,
  elementRenderScale,
  sanitaryRenderScale,
} from "@/lib/symbolScale";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { hasSeenOnboarding, markOnboardingSeen, useOnboardingProgress } from "@/hooks/useOnboardingProgress";
import { shouldShowCompact, planWidthMeters } from "@/lib/onboarding";
import { NaglowekNarzedzia, PodpowiedzPrzesun, PodpowiedzZaznacz } from "./PanelNarzedzia";
import { KartaElementu } from "./KartaElementu";
import { przelaczWGrupie } from "@/lib/zaznaczanieGrupy";
import { OnboardingChecklist } from "@/components/onboarding/OnboardingChecklist";
import { CoachMark } from "@/components/onboarding/CoachMark";
import { useSzerokieOkno } from "./pasekMenuKontekst";
import { punktyZajeteRysunkiem } from "@/lib/obszarRysunku";
import { licznikNawigacji } from "@/hooks/useRoute";
import { CoPowstanie } from "@/components/onboarding/CoPowstanie";
import { WyborPrzykladu } from "@/components/onboarding/WyborPrzykladu";
import { PoleDlugosciOdcinka } from "@/components/design/PoleDlugosciOdcinka";
import { PoleWymiarowProstokata } from "@/components/design/PoleWymiarowProstokata";
import { DlugosciOdcinkowSciany } from "@/components/design/DlugosciOdcinkowSciany";
import { PodpowiedzKolka } from "@/components/design/PodpowiedzKolka";
import {
  czyOdnotowacKolko,
  czyPokazacPodpowiedzKolka,
  czyPokazacPowitanie,
  odczytajStanNawigacji,
  zapamietajOdrzuceniePowitania,
  zapamietajUmiejetnosc,
} from "@/lib/podpowiedziNawigacji";
import { useFloorPlanUpload } from "@/hooks/useFloorPlanUpload";
import { useRysowanieScian } from "@/hooks/useRysowanieScian";
import { useRysowaniePomieszczen } from "@/hooks/useRysowaniePomieszczen";
import { useOtwory } from "@/hooks/useOtwory";
import { useWstawianieElementu } from "@/hooks/useWstawianieElementu";
import { useZaznaczenie } from "@/hooks/useZaznaczenie";
import { CropTool } from "@/components/detect/CropTool";
import type { WidokSterowanie } from "./DesignCanvas";
import { DesignCanvas, type RoomDrawMode, type ToolMode } from "./DesignCanvas";
import { MAX_ZOOM, minZoom } from "./zoomPlanu";
import { ScaleCalibrationTool } from "./ScaleCalibrationTool";
import { EditorToolbar } from "./EditorToolbar";
import { EditorStatusBar } from "./EditorStatusBar";
import { ToolRail } from "./ToolRail";
import { WyborObwodu } from "./WyborObwodu";
import { ElementLibrary } from "./ElementLibrary";
import { RoomPanel, WierszPomieszczenia } from "./RoomPanel";
import { PlanCheckPanel } from "./PlanCheckPanel";
import { QuantitiesPanel } from "./QuantitiesPanel";
import { EditElementModal } from "./EditElementModal";
import type Konva from "konva";
import { ELEMENT_TYPES, libSubtitle, VARIANTS_FOR } from "@/lib/elements";
import { nearestRouteSegmentIndex, zalamaniaZNowymPunktem } from "@/lib/punktTrasy";
import { InfoTrasy } from "./InfoTrasy";
import { GlyphPreview } from "@/components/design/ElementGlyphSvg";
import { buildDrawingDoc, hexNaRgb, KLUCZ_TRAS } from "@/lib/pdf/drawing";
import type { PdfDoc } from "@/lib/pdf/engine";
import { zarejestrujProducenta } from "@/lib/pdf/rejestr";
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

/** Ostatnia wartość `licznikNawigacji()` obsłużona przez przewinięcie do edytora —
 *  patrz efekt przy `edytorZaslonietyRef`. Poza komponentem, bo przeżywa jego
 *  odmontowanie przy przejściu na inną zakładkę. */
let ostatniaObsluzonaNawigacja = 0;

/** Szerokość okna płótna, zanim kolumna zostanie zmierzona: arkusz, ale nie szerzej
 *  niż ekran (patrz komentarz przy `rozmiarOkna`). Bez znanej szerokości ekranu
 *  (środowisko testów jednostkowych) — sam arkusz, jak dotąd. */
function szerokoscPrzedPomiarem(arkusz: number): number {
  const ekran = typeof document === "undefined" ? 0 : document.documentElement.clientWidth;
  return ekran > 0 ? Math.min(arkusz, ekran) : arkusz;
}
/**
 * Bez ZAPISANEGO wyboru decyduje szerokość okna: na telefonie panel startuje
 * zwinięty, na monitorze rozwinięty.
 *
 * Panel ma 268 px i na wąskim ekranie zjeżdżał pod pasek narzędzi, spychając rzut
 * o kolejne pół ekranu w dół — czyli akurat tam, gdzie i tak było najciaśniej.
 * Zwinięty zostawia sam pionowy pasek ikon, a ten mieści się obok planu.
 *
 * WYBÓR UŻYTKOWNIKA MA PIERWSZEŃSTWO nad szerokością okna, w obie strony: kto raz
 * rozwinie panel na telefonie, ma go rozwiniętego także po odświeżeniu. Dlatego
 * sprawdzamy `!== null`, a nie samo `=== "1"` — wcześniej zapisane „0" było nie do
 * odróżnienia od braku zapisu.
 */
function odczytajPanelZwiniety(): boolean {
  try {
    const zapisane = localStorage.getItem(PANEL_ZWINIETY_KEY);
    if (zapisane !== null) return zapisane === "1";
  } catch {
    // patrz odczytajOdrzuconyPrompt — brak dostępu do pamięci nie może wywrócić edytora
  }
  return waskiEkran();
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
  /** Otwiera okno „Pomoc" — z tego samego powodu co `onOpenAuth`: modal żyje w App.tsx,
   *  bo otwiera go też link w nagłówku, widoczny na każdej zakładce. */
  onOpenPomoc: () => void;
  /**
   * Kolejny krok przepływu — ląduje jako przycisk na prawym końcu paska stanu
   * (patrz `nastepnyKrok` w EditorStatusBar). Na pozostałych zakładkach tę rolę
   * pełni pływająca pigułka w rogu okna; tutaj nie może, bo leżałaby na rysunku.
   * `undefined`, gdy nie ma dokąd iść — projekt jest jeszcze pusty.
   */
  nastepnyKrok?: { tytul: string; przejdz: () => void; pobierz: () => void };
}

export function DesignTab({ onOpenAuth, onOpenPomoc, nastepnyKrok }: DesignTabProps) {
  const session = useProjectStore((s) => s.session);
  const roomsFixedOnLoad = useProjectStore((s) => s.roomsFixedOnLoad);
  const dismissRoomsFixedOnLoad = useProjectStore((s) => s.dismissRoomsFixedOnLoad);
  const saveToCloud = useProjectStore((s) => s.saveToCloud);
  const cloudBusy = useProjectStore((s) => s.cloudBusy);
  const activeFloorId = useProjectStore((s) => s.activeFloorId);
  const setDraft = useProjectStore((s) => s.setDraft);
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
  /** Sterowanie kadrem płótna z zewnątrz — kompensacja zmian układu i „Dopasuj widok". */
  const widokRef = useRef<WidokSterowanie | null>(null);
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
  async function zbudujDokumentRzutu(): Promise<PdfDoc> {
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
    /**
     * Kadr liczony z ROGÓW symboli, nie z ich środków — patrz `rogiSymbolu`. Zostaje
     * już tylko zapas na to, co rysuje się OBOK symbolu: etykiety wymiarów i numery
     * grup sterowania. Stały margines „na wannę" pomniejszał rzut o prawie ćwierć
     * także wtedy, gdy żadnej wanny na nim nie było.
     */
    // Symbole, strefy przyborów i otwory z łukiem skrzydła — to samo źródło co kadr
    // na ekranie (patrz `punktyZajeteRysunkiem`).
    const rogi = punktyZajeteRysunkiem(elements, openings, walls, skalaOsprzetu, activeFloorId, mpu);
    const kadr = contentBounds(walls, roomShapes, rogi, openings, ZAPAS_ETYKIET * autoSymbolScale(mpu, skalaBezKalibracji)) ?? {
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
      /**
       * Wycinek liczony we WSPÓŁRZĘDNYCH SCENY, więc musi uwzględnić jej przesunięcie.
       * Scena stoi przesunięta o kadr ekranu (patrz stan `widok` w DesignCanvas), a
       * `toCanvas` przerysowuje ją z pełną transformacją — bez tego składnika wydruk
       * jechał dokładnie o tyle, o ile użytkownik odsunął sobie widok przy rysowaniu.
       * Co widać na ekranie, nie ma tu nic do rzeczy: kadrujemy do narysowanej treści.
       */
      const kadrPx = {
        x: kadr.x * zoom + stage.x(),
        y: kadr.y * zoom + stage.y(),
        width: kadr.w * zoom,
        height: kadr.h * zoom,
      };
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

    /**
     * Klucz oznaczeń i spis obwodów — TYLKO gdy trasy są na rysunku.
     *
     * Klucz przy rzucie bez tras tłumaczyłby kreski, których na nim nie ma, więc oba
     * idą razem z przewodami — patrz `trasyWPdf`.
     */
    const trasyNaRysunku = trasyPotrzebne ? cableRoutes : [];
    const obwodyPdf = [...new Map(trasyNaRysunku.map((r) => [r.circuitId || r.id, r])).values()].map((r) => ({
      kolor: hexNaRgb(r.color),
      nazwa: r.circuitName,
      kabel: r.cable,
      zabezpieczenie: r.breaker,
    }));

    return buildDrawingDoc({
      tytul: `Rzut — ${floorName}`,
      header: docHeader,
      rysunek: await plotnoDoPdf(naBieli),
      legenda,
      kluczTras: trasyNaRysunku.length ? KLUCZ_TRAS : undefined,
      // Rozbicie „rodzaj × pomieszczenie", nie sama suma per rodzaj: monter kupuje
      // według sumy, ale montuje pokój po pokoju i to jemu potrzebny jest podział.
      zestawienie: pozycjeZestawieniaDoPdf(elements),
      obwody: obwodyPdf.length ? obwodyPdf : undefined,
    });
  }
  /**
   * Zgłoszenie rzutu do kompletu dokumentacji.
   *
   * Rzut rasteryzuje się z ŻYWEJ sceny Konvy (`stageRef`), która istnieje tylko wtedy,
   * gdy ta zakładka jest zamontowana — dlatego komplet nie buduje go sam, tylko otwiera
   * zakładkę i sięga po tę funkcję (patrz `lib/pdf/rejestr.ts`). Klucz niesie ID
   * kondygnacji, bo producent umie zbudować wyłącznie kondygnację AKTYWNĄ: komplet
   * przełącza je po kolei i za każdym razem czeka na właściwy klucz.
   */
  useEffect(() => zarejestrujProducenta(`rzut:${activeFloorId}`, zbudujDokumentRzutu));

  const walls = useActiveFloorWalls();
  const roomShapes = useActiveFloorRoomShapes();
  const openings = useActiveFloorOpenings();

  /**
   * Zastępcza skala symboli dla kondygnacji BEZ skalibrowanej skali — zgadywana
   * z wielkości samego rysunku (patrz `skalaZRysunku`). Przy skalibrowanym rzucie
   * jest bez znaczenia: `autoSymbolScale` bierze wtedy zmierzone `mpu`.
   */
  const skalaBezKalibracji = useMemo(
    () => skalaZRysunku(rozpietoscRysunku(walls, roomShapes)),
    [walls, roomShapes]
  );

  const [panelZwiniety, setPanelZwiniety] = useState(odczytajPanelZwiniety);

  const [toolMode, setToolMode] = useState<ToolMode>("zaznacz");
  /**
   * Zatrzaśnięty Shift: każde kliknięcie DOKŁADA element do zaznaczenia zamiast
   * zaczynać nowe.
   *
   * Zaznaczenie wielokrotne miało dotąd dwie drogi i obie wymagały czegoś, czego
   * telefon nie ma: Shift z kliknięciem albo ramkę przeciągniętą myszą (przeciągnięcie
   * palcem dochodzi do płótna jako JEDNO kliknięcie po oderwaniu palca, więc ramka nie
   * ma z czego rosnąć). A bez zaznaczenia wielokrotnego nie ma wyrównywania,
   * rozkładania, duplikowania ani „Usuń zaznaczone".
   *
   * Przełącznik, a nie gest przeciągnięcia: „Zaznacz" jest narzędziem DOMYŚLNYM, więc
   * ramka z przeciągnięcia zabrałaby telefonowi przewijanie strony nad rysunkiem w tym
   * stanie, w którym aplikacja się otwiera.
   */
  const [zaznaczanieWielokrotne, setZaznaczanieWielokrotne] = useState(false);
  /** Przyciąganie do siatki. Domyślnie WYŁĄCZONE, bo na wgranym podkładzie ściany
   *  budynku nie leżą na oczkach siatki i przyciąganie tylko odciągałoby od rzutu.
   *  Rysowanie od zera włącza je jawnie — patrz `startManualDrawing`. */
  const [snapOn, setSnapOn] = useState(false);
  /** Widoczność siatki — osobno od przyciągania. Domyślnie włączona, bo bez rzutu
   *  pod spodem to jedyny punkt odniesienia przy rysowaniu od zera. */
  const [gridOn, setGridOn] = useState(true);
  /** Piąte skupisko — patrz `useZaznaczenie`. Stoi tutaj, bo `useOtwory` niżej
   *  melduje mu świeżo postawiony otwór. */
  const zaznaczenie = useZaznaczenie();
  /** Reset przy zmianie kondygnacji potrzebuje w zależnościach czegoś stabilnego,
   *  a nie całego obiektu hooka — patrz `setSzkicSciany` niżej. */
  const { wyczysc: wyczyscZaznaczenie } = zaznaczenie;
  /**
   * Same ODCZYTY idą destrukturyzacją, a nie przez `zaznaczenie.*` jak w pozostałych
   * hookach — i jest to wymuszone, nie kwestia gustu. TypeScript zawęża typ po
   * `selected?.kind === "wall"`, ale gubi to zawężenie na `selected.id`
   * w tym samym wyrażeniu: każde wywołanie funkcji po drodze (a tam stoi
   * `walls.some(...)`) unieważnia zawężenie własności obiektu. Akcje zostają przy
   * obiekcie, bo to one niosą znaczenie; stan i jego settery to zwykły `useState`.
   *
   * Settery są tu z drugiego powodu: wchodzą do zależności dwóch efektów, a cały
   * obiekt hooka dostaje przy każdym renderze nową tożsamość i odpalałby je bez końca.
   */
  const { selected, multiSelected, contextMenu, setSelected, setMultiSelected } = zaznaczenie;
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
  /**
   * Id ściany właśnie zamkniętej w pętlę — podstawa propozycji „zrób z tego
   * pomieszczenie" w pigułce kontrolek.
   *
   * Moment jest tu całą wartością. Kto domknął obrys murem, ma ten pokój przed
   * oczami; przewodnik zaraz każe mu „obrysować pomieszczenia", a bez tej propozycji
   * jedyną drogą jest przejechanie po raz drugi dokładnie tej samej figury. Propozycja,
   * nie automat: pętla ściany bywa obrysem całego domu albo korytarza wokół klatki,
   * a nie każdy obrys jest pomieszczeniem.
   */
  const [petlaDoNazwania, setPetlaDoNazwania] = useState<string | null>(null);
  /** Rysowanie ścian ma własny hook — pierwsze skupisko stanu wyjęte z tego pliku
   *  (patrz `useRysowanieScian`). Czytane przez obiekt, nie destrukturyzacją: po
   *  `sciany.drawingWall` widać, do czego ten stan należy, a po gołej nazwie nie. */
  const sciany = useRysowanieScian({ onPetlaZamknieta: setPetlaDoNazwania });
  /** Drugie skupisko z własnym hookiem — patrz `useRysowaniePomieszczen`. */
  const pokoje = useRysowaniePomieszczen();
  /** Trzecie skupisko — patrz `useOtwory`. Zaznaczenie i menu kontekstowe są osobnymi
   *  skupiskami stanu, więc hook tylko je zawiadamia, zamiast je posiadać. */
  const otwory = useOtwory({
    onZaznacz: (id) => zaznaczenie.zaznacz("opening", id),
    onMenuKontekstowe: (id, x, y) => zaznaczenie.menuKontekstowe("opening", id, x, y),
  });
  /** Z tego samego powodu co `setSzkicSciany` wyżej: reset przy zmianie kondygnacji
   *  potrzebuje w zależnościach czegoś stabilnego, a nie całego obiektu hooka. */
  const { porzucSzkic: porzucSzkicPokoju } = pokoje;
  /** Czyszczenie szkicu ściany wyjęte z `sciany` osobno, bo musi stać w zależnościach
   *  efektu przełączania kondygnacji (niżej), a cały obiekt hooka dostaje przy każdym
   *  renderze nową tożsamość — wpisany do zależności odpalałby ten reset bez przerwy
   *  i kasował rysowaną właśnie ścianę. Sam setter pochodzi z `useState`, więc jest
   *  stabilny i jako zależność nie zmienia niczego. */
  const { setDrawingWall: setSzkicSciany } = sciany;
  const [showZones, setShowZones] = useState(true);
  /** Widoczność tras przewodów — domyślnie WYŁĄCZONA: to warstwa poglądowa, nie
   *  zawsze potrzebna, i bez rozdzielnicy postawionej na planie i tak jest pusta
   *  (patrz `cableRoutes` niżej), więc nie ma po co narzucać jej od razu. */
  const [showRoutes, setShowRoutes] = useState(false);
  /**
   * Czy rzut w PDF-ie ma pokazywać trasy przewodów. DOMYŚLNIE tak, niezależnie od
   * przełącznika w edytorze — rzut instalacji bez przewodów to nie jest rysunek
   * instalacji, a eksport rasteryzuje scenę taką, jaka jest, więc bez tego wydruk po
   * cichu zależał od tego, co akurat było włączone na ekranie.
   */
  const [trasyWPdf, setTrasyWPdf] = useState(true);
  /** Tryb wymiarowania — domyslnie WYLACZONY: przy rysowaniu wymiary przeszkadzaja,
   *  a potrzebne sa przy sprawdzaniu i przed wydrukiem. */
  const [showDimensions, setShowDimensions] = useState(false);
  /** Powierzchnia pomieszczeń — osobno od wymiarów, bo odpowiada na inne pytanie:
   *  wymiary służą do wytyczenia ścian, powierzchnia do sprawdzenia metrażu. Oba
   *  domyślnie wyłączone z tego samego powodu — przy rysowaniu podpisy przeszkadzają. */
  const [showAreas, setShowAreas] = useState(false);
  /** Wysokosci montazu przy osprzecie — domyslnie WYLACZONE z tego samego powodu co
   *  wymiary. Osobno od nich, bo wymiary opisuja BUDYNEK, a te INSTALACJE. */
  const [showHeights, setShowHeights] = useState(false);
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
  /** Korzeń CAŁEJ zakładki — jego górna krawędź to wysokość nagłówka strony i paska
   *  etapów, czyli tej części chrome'u, która nigdy się nie zmienia. Potrzebna do
   *  policzenia wysokości płótna z pominięciem banerów (patrz efekt `wysPlotna`). */
  const korzenZakladkiRef = useRef<HTMLDivElement>(null);
  const pelnyEkranRef = useRef<HTMLDivElement>(null);
  const gornyPasekRef = useRef<HTMLDivElement>(null);
  const lewaKartaRef = useRef<HTMLDivElement>(null);
  const dolnyPasekRef = useRef<HTMLDivElement>(null);
  const kolumnaPlotnaRef = useRef<HTMLDivElement>(null);
  const [wysPlotna, setWysPlotna] = useState(wysokoscPlotna);
  /**
   * Czy `wysPlotna` jest już ZMIERZONA, a nie zgadnięta na starcie (`wysokoscPlotna()`
   * bez argumentów daje 640 px). Kadr otwarcia wolno odhaczyć dopiero po pomiarze —
   * patrz efekt dopasowania niżej.
   */
  const [wysZmierzona, setWysZmierzona] = useState(false);
  /** Czy płótno liczy się od początku edytora (telefon albo niskie okno) — patrz
   *  `przelicz` w efekcie wysokości. Czytane przez efekty przewijania do edytora. */
  const odEdytoraRef = useRef(false);
  /** Szerokość dostępna dla płótna — mierzona razem z dopasowaniem powiększenia.
   *  Razem z `wysPlotna` wyznacza OKNO widoku, które dostaje płótno. */
  const [dostepnaSzer, setDostepnaSzer] = useState(0);
  /** Od 768 px w górę kolumna narzędzi stoi OBOK rysunku i równa się z nim wysokością;
   *  niżej stoi NAD nim i bierze wysokość z treści (patrz styl `lewaKartaRef`). */
  const szerokieOkno = useSzerokieOkno();
  /** Palec zamiast myszy — tylko do słów w podpowiedziach panelu („Kliknij" / „Stuknij"). */
  const naDotyku = typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
  const ostatniaSzerRef = useRef(0);
  /** Kondygnacja, dla której kadr został już ustawiony na rysunku — patrz efekt niżej. */
  const skadrowanaRef = useRef<string | null>(null);
  /** Prośba o ponowne dopasowanie kadru po wejściu/wyjściu z pełnego ekranu — patrz
   *  efekt dopasowania. Osobno od `skadrowanaRef`, bo gaśnie dopiero przy ustalonych
   *  wymiarach, a nie przy pierwszej udanej próbie. */
  const przekadrujRef = useRef(false);
  const [cursor, setCursor] = useState<Point | null>(null);
  /** Nazwa pliku podkładu — sam „wgrany" nie mówi, KTÓRY rzut leży pod spodem. */
  const [bgName, setBgName] = useState<string | null>(null);
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
  /**
   * Rysunek widziany przez dopasowanie kadru.
   *
   * Przez REF, nie przez zależności `useCallback` — i to jest tu sedno. Gdyby
   * dopasowanie zależało od ścian i pomieszczeń, zmieniałoby tożsamość przy każdej
   * narysowanej linii, a efekt, który je woła, przeramowywałby widok po każdym
   * kliknięciu. Dopasowanie ma brać rysunek TAKI, JAKI JEST W CHWILI DOPASOWANIA,
   * a dziać się tylko wtedy, gdy ktoś o nie poprosi albo gdy zmieni się okno.
   */
  const trescRef = useRef({ walls, roomShapes, elements, openings });
  /** Skala symboli dla kadru — liczona w komponencie dopiero niżej (`skalaOsprzetu`),
   *  a kadr czyta ją w chwili dopasowania, więc przez ref. */
  const skalaOsprzetuRef = useRef(1);
  trescRef.current = { walls, roomShapes, elements, openings };

  /**
   * Ustawia kadr tak, żeby rysunek wypełnił dostępne miejsce.
   *
   * Dopasowujemy do TREŚCI, nie do arkusza. Arkusz to 50 × 35 m przy rysowaniu od
   * zera, więc dom o 140 m² zajmował z niego jedną ósmą i otwierał się wielkości
   * znaczka pocztowego w morzu pustej siatki — od tego zaczęła się przebudowa
   * płótna. Pusta kondygnacja zostaje przy arkuszu: nie ma czego kadrować, a arkusz
   * w rogu daje przewidywalny punkt, od którego zaczyna się rysowanie.
   *
   * Ograniczamy się SZEROKOŚCIĄ I WYSOKOŚCIĄ naraz: samo dopasowanie do szerokości
   * robiłoby z niskiego rzutu pasek wymagający przewijania w pionie.
   */
  /**
   * Szerokość, do której ostatnio dopasowywaliśmy. Obserwator zmian rozmiaru reaguje
   * tylko na ODSTĘPSTWO od niej — dzięki temu pierwsze zgłoszenie po podpięciu (to
   * samo, do czego przed chwilą dopasowaliśmy kadr) nie kasuje tego dopasowania.
   */
  const zmierzSzerokosc = useCallback(() => {
    const el = kolumnaPlotnaRef.current;
    if (!el) return null;
    // Bez paddingu kolumny: w pełnym ekranie ma ona `p-2` i płótno liczone z samego
    // `clientWidth` wystawało 8 px za prawą krawędź okna.
    const s = getComputedStyle(el);
    const szer = el.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight) - 2;
    if (szer <= 0) return null;
    setDostepnaSzer(szer);
    ostatniaSzerRef.current = szer;
    return szer;
  }, []);


  /**
   * Powiększenie I kadr ustawione na RYSUNKU — dopasowanie, o które ktoś poprosił.
   *
   * Arkusz to 50 × 35 m przy rysowaniu od zera, więc dom o 140 m² zajmował z niego
   * jedną ósmą i otwierał się wielkości znaczka pocztowego w morzu pustej siatki —
   * od tego zaczęła się przebudowa płótna. Pusta kondygnacja zostaje przy arkuszu:
   * nie ma czego kadrować, a arkusz w rogu daje przewidywalny punkt, od którego
   * zaczyna się rysowanie (patrz `kadrOtwarcia`).
   *
   * Wołane przy otwarciu rysunku i przyciskiem „Dopasuj widok" — czyli wtedy, gdy
   * przestawienie kadru jest dokładnie tym, czego użytkownik chce. Na płótnie bez
   * granic ten przycisk jest zresztą jedyną drogą powrotną, gdy widok odjedzie.
   */
  const dopasujKadr = useCallback(() => {
    const dostepnaSzer = zmierzSzerokosc();
    // Zwraca, czy kadr FAKTYCZNIE się ustawił. Kolumna płótna nie istnieje, dopóki na
    // wierzchu stoi ekran startowy albo trwa wgrywanie rzutu — a wołający musi wiedzieć,
    // że próba przepadła, żeby nie odhaczyć kondygnacji jako skadrowanej.
    if (dostepnaSzer === null) return false;
    const { walls: sc, roomShapes: pom, elements: el, openings: otw } = trescRef.current;
    const kadr = kadrOtwarcia(
      // Margines ZERO: oddech wokół rysunku dokłada `kadrOtwarcia` ułamkiem jego
      // rozmiaru. Domyślny margines tej funkcji jest skrojony pod eksport (ma zmieścić
      // wannę ze strefą ochronną) i przy małym pokoju zabrałby pół kadru.
      //
      // Razem z tym, co wystaje poza obrys ścian (symbole, strefy, łuki drzwi) — liczony
      // z samych środków kadr ucinał łuk drzwi wejściowych i numery obwodów przy dolnej
      // ścianie przykładu (patrz `punktyZajeteRysunkiem`).
      contentBounds(
        sc,
        pom,
        [...el, ...punktyZajeteRysunkiem(el, otw, sc, skalaOsprzetuRef.current, activeFloorId, mpu)],
        otw,
        0
      ),
      // Podkład, a nie „obszar planu": bez wgranego rzutu nie ma czego dopasowywać
      // i kadr bierze wtedy skalę rysowania (patrz `kadrOtwarcia`).
      bgImageUrl ? { w: planSize.w, h: planSize.h } : null,
      { w: dostepnaSzer, h: wysPlotna },
      { min: minZoom(), max: MAX_ZOOM },
      mpu
    );
    setZoom(kadr.zoom);
    widokRef.current?.ustaw(kadr.widok.x, kadr.widok.y);
    return true;
  }, [planSize.w, planSize.h, wysPlotna, zmierzSzerokosc, bgImageUrl, mpu, activeFloorId]);

  /**
   * Odpowiedź na zmianę rozmiaru okna: zwinięcie panelu, pojawienie się listy
   * pomieszczeń, baner nad rysunkiem.
   *
   * Dopasowanie robimy TYLKO wtedy, gdy nie ma jeszcze rysunku — i tą samą regułą co
   * przy otwarciu (patrz `dopasujKadr`), żeby czysta kartka nie miała dwóch różnych
   * powiększeń zależnie od tego, czy ktoś właśnie zwinął panel. Gdy rysunek jest, kadr
   * należy do użytkownika i nie ruszamy go wcale — ani powiększenia, ani przesunięcia.
   *
   * To nie ostrożność, tylko wniosek z pomiaru. Dorysowanie pomieszczenia zmienia
   * szerokość panelu bocznego, więc obserwator rozmiaru budzi się dokładnie w trakcie
   * rysowania; przeliczanie wtedy powiększenia wyrywało rysunek spod kursora, a przy
   * otwartym projekcie kasowało dopiero co ustawiony kadr (zmierzone: powiększenie
   * wracało z dopasowanego do rysunku 3,0 na dopasowane do arkusza 0,87).
   *
   * Sam pomiar szerokości zostaje bezwarunkowo — od niego zależy rozmiar okna widoku.
   */
  const dopasujPustaKartke = useCallback(() => {
    const { walls: sc, roomShapes: pom, elements: el, openings: otw } = trescRef.current;
    // Pomiar szerokości PRZED wyjściem — tak jak mówi komentarz wyżej. Wcześniej
    // wychodziliśmy przed nim i przy narysowanym rzucie okno widoku zostawało
    // w starej szerokości: w pełnym ekranie płótno miało 1030 px zamiast 1424.
    zmierzSzerokosc();
    if (sc.length || pom.length || el.length || otw.length) return;
    dopasujKadr();
  }, [dopasujKadr, zmierzSzerokosc]);

  /** Wejście i wyjście z pełnego ekranu zmienia dostępne miejsce skokowo, więc rzut
   *  dopasowujemy na nowo — nawet jeśli użytkownik wcześniej ustawił zoom ręcznie.
   *  Zostawienie starego powiększenia dawało rysunek wielkości znaczka w rogu
   *  pustego ekranu, czyli dokładne przeciwieństwo tego, po co się tu wchodzi. */
  const przelaczPelnyEkran = useCallback(() => {
    setPelnyEkran((v) => !v);
    // Prośba o ponowne dopasowanie — bez niej efekt dopasowania dla narysowanego
    // rzutu niczego nie robił (kondygnacja była już „skadrowana") i obietnica z
    // komentarza wyżej była martwa: rzut zostawał w powiększeniu sprzed zmiany,
    // w rogu dużo większego okna. Patrz `przekadrujRef` w efekcie dopasowania.
    przekadrujRef.current = true;
    // Okno, w którym każda zmiana wymiarów dopasowuje kadr od nowa — patrz efekt
    // dopasowania. Wymiary ustalają się w kilku krokach (kolumna, potem paski,
    // potem wysokość płótna), więc ostatnie dopasowanie trafia w ostateczne.
    window.setTimeout(() => {
      przekadrujRef.current = false;
    }, 400);
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

  /** Okno rysunku — DesignCanvas trzyma je u siebie, ale zmiany szerokości panelu
   *  muszą przestawić kadr, więc sięgamy po nie przez kolumnę płótna. Wcześniej
   *  szukaliśmy tu `div.overflow-auto`: okno przestało się przewijać, selektor
   *  przestał cokolwiek znajdować i kompensacja po cichu umarła. */
  const kontenerPlotna = useCallback(
    () => kolumnaPlotnaRef.current?.querySelector<HTMLDivElement>("[data-plan-okno]") ?? null,
    [],
  );
  /**
   * Lewa krawędź OKNA rysunku sprzed zmiany układu — do skompensowania skoku.
   *
   * Mierzymy okno, a nie kolumnę, bo to okno niesie rysunek: punkt planu leżący przy
   * jego lewej krawędzi ma tam zostać. Gdy rzut nie mieści się w kolumnie, jedno i
   * drugie to ta sama liczba; gdy się mieści, okno jest w kolumnie wyśrodkowane
   * i jedzie o POŁOWĘ tego, co kolumna — kompensacja liczona z kolumny wychodziła
   * wtedy dwa razy za duża.
   */
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
   * przesunięciem kadru o dokładnie tyle, o ile przesunęła się lewa krawędź okna
   * rysunku — rysunek zostaje pod tym samym miejscem EKRANU.
   *
   * Kompensacja wisi na KONKRETNYM GEŚCIE, a nie na obserwatorze układu, i to jest
   * tu istotne. Obserwator widziałby także zmiany szerokości okna wynikające z samego
   * powiększenia (okno jest wyśrodkowane, a jego szerokość to arkusz razy zoom, więc
   * oddalanie samo przesuwa jego krawędź) i „poprawiałby" kadr wbrew użytkownikowi —
   * symbole uciekały wtedy spod kursora przy oddalonym widoku.
   *
   * `useLayoutEffect`, bo przesunięcie musi wejść w tej samej klatce co nowy układ —
   * inaczej widać przeskok, czyli dokładnie to, co naprawiamy.
   *
   * Gdy cały rzut mieści się w oknie, krawędź nie drgnie i nie ma czego kompensować:
   * plan przecentruje się w nowym obszarze (a przy automatycznym dopasowaniu jeszcze
   * przeskaluje). To poprawne, bo widać całość.
   */
  useLayoutEffect(() => {
    const przed = lewaPrzedZmiana.current;
    if (przed === null) return;
    lewaPrzedZmiana.current = null;
    const el = kontenerPlotna();
    if (!el) return;
    widokRef.current?.przesunOPiksele(el.getBoundingClientRect().left - przed, 0);
  }, [przypietyPanel, panelZwiniety, kontenerPlotna]);

  /**
   * Coś zaznaczone w pełnym ekranie na szerokim oknie — panel wysuwa się wtedy sam, bo
   * stoją w nim opcje zaznaczenia (karta elementu, ściany, pomieszczenia, operacje na
   * grupie; patrz `trescKontekstu`). Bez tego karta elementu siedziała w schowanym
   * panelu i nikt jej nie widział. Odznaczenie chowa panel z powrotem, chyba że jest
   * przypięty. Na telefonie nie: tam panel zasłoniłby prawie cały rysunek, a opcje
   * zaznaczenia zostają w pigułce nad rzutem.
   */
  const zaznaczenieWysuwaPanel =
    pelnyEkran && szerokieOkno && toolMode === "zaznacz" && (selected !== null || multiSelected.length > 0);
  // Panel: widoczny pod kursorem, przypięty albo z opcjami zaznaczenia. Paski poziome: zawsze.
  const widocznaLewa = chromeLewo || przypietyPanel || zaznaczenieWysuwaPanel;

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
  /** „Zobacz gotowy przykład" na ekranie startowym otwiera okno wyboru zamiast
   *  wczytywać jeden zaszyty przykład — samo wczytanie robi `WyborPrzykladu`. */
  const [wyborPrzykladu, setWyborPrzykladu] = useState(false);
  /** Gasi zachęty do założenia konta — w przykładzie nie ma czego zabezpieczać
   *  (patrz oba banery niżej). */
  const projektPrzykladowy = useProjectStore((s) => s.projektPrzykladowy);
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
   * Wysokość okna rysunku. Stoi TUTAJ, a nie przy pozostałych efektach układu wyżej,
   * bo potrzebuje `showEntryScreen` i `wgrywanie.stan` — a te są zadeklarowane dopiero
   * nad tym miejscem.
   */
  useEffect(() => {
    // W pełnym ekranie płótno bierze całą wysokość okna: paski leżą NAD nim jako
    // nakładki, więc nie ma już nagłówka ani paska etapów, na które trzeba zostawić
    // zapas (patrz `wysokoscPlotna`).
    // Przypięte paski zajmują górę/dół okna na stałe, więc płótno musi o tyle
    // zmaleć — inaczej jego dolna krawędź chowałaby się pod przypiętym paskiem stanu.
    const zajetePionowo = rozmiaryChrome.gora + rozmiaryChrome.dol;
    const przelicz = () => {
      // W widoku standardowym MIERZYMY, ile stoi nad płótnem, zamiast zgadywać stałą —
      // patrz `wysokoscPlotna`.
      //
      // Mierzymy jednak WYŁĄCZNIE chrome STAŁY, z pominięciem banerów, i to jest tu
      // najważniejsza decyzja. Banery („zacznij od podkładu", „brak skali", „zabezpiecz
      // kontem") pojawiają się i znikają W TRAKCIE pracy — pierwszy postawiony element
      // gasi jeden z nich. Gdyby wchodziły do rachunku, płótno zmieniałoby wtedy
      // wysokość, dopasowanie widoku przeliczałoby powiększenie i CAŁY rzut skakałby
      // pod kursorem dokładnie w chwili, gdy użytkownik coś na nim stawia. Baner niech
      // więc spycha rysunek w dół (i wydłuża stronę), a nie przeskalowuje go.
      //
      // Bierzemy PRAWDZIWĄ górną krawędź kolumny płótna i odejmujemy od niej to, co
      // zajmują dziś banery — czyli wszyscy bracia stojący PRZED korzeniem edytora.
      // Wychodzi z tego położenie, w którym płótno byłoby, gdyby żadnego banera nie
      // było: wielkość stała, niezależna od tego, ile ich akurat wisi.
      //
      // HISTORIA: stała tu suma dwóch odcinków (góra dokumentu → korzeń zakładki oraz
      // korzeń edytora → kolumna płótna). Milcząco zakładała, że MIĘDZY tymi korzeniami
      // nie ma nic poza banerami — a jest jeszcze odstęp `space-y-4`. Dopóki korzeń
      // zakładki był zwykłym blokiem, margines schodził na zewnątrz i suma się zgadzała;
      // po zmianie strony na kolumnę flexową (stopka przy dole okna) marginesy przestały
      // się scalać i rachunek zaniżał się o równe 16 px — akurat tyle, żeby płótno znów
      // sięgnęło pod pigułkę „Dalej". Odejmowanie MIERZONYCH banerów jest odporne na
      // każdy taki odstęp, bo nie zakłada o nim niczego.
      const kolumna = kolumnaPlotnaRef.current;
      const korzenEdytora = pelnyEkranRef.current;
      const korzenZakladki = korzenZakladkiRef.current;
      let gora: number | null = null;
      if (kolumna && korzenEdytora && korzenZakladki) {
        let banery = 0;
        for (const brat of Array.from(korzenZakladki.children)) {
          if (brat === korzenEdytora) break;
          const box = brat.getBoundingClientRect();
          // Ukryty input pliku i inne zerowej wysokości nie zajmują miejsca, ale
          // `space-y-4` i tak dopisuje im margines — obie rzeczy trzeba pominąć razem.
          if (box.height === 0) continue;
          banery += box.height + parseFloat(getComputedStyle(brat).marginTop || "0");
        }
        gora = kolumna.getBoundingClientRect().top + window.scrollY - banery;
      }
      // SAM pasek stanu — REZERWUJEMY mu miejsce, żeby nie wypadł pod zgięcie. Niesie
      // powierzchnię, skalę, stan zapisu i przycisk kolejnego kroku; rysowanie bez ani
      // jednej z tych rzeczy przed oczami to ten sam problem co rysowanie po niewidocznej
      // części planu. Mierzony, nie zgadywany: na węższym oknie pasek się zawija i rośnie.
      //
      // Szukany po `aria-label`, bo to część kontraktu `EditorStatusBar` (pilnują go
      // testy e2e) — bliżej mu do trwałej nazwy niż do szczegółu budowy drzewa.
      const pasekStanu = dolnyPasekRef.current?.querySelector<HTMLElement>('[aria-label="Stan projektu"]');
      const zapasPod = pasekStanu
        ? pasekStanu.getBoundingClientRect().height +
          parseFloat(getComputedStyle(pasekStanu).marginTop || "0") +
          ZAPAS_POD_PLOTNEM
        : ZAPAS_POD_PLOTNEM;
      /**
       * Liczymy od początku EDYTORA, nie od góry strony — na TELEFONIE zawsze, a na
       * większym ekranie wtedy, gdy okno jest za NISKIE, żeby liczenie od góry strony
       * dało płótnu choćby dolną granicę wysokości.
       *
       * Nad edytorem stoją nagłówek, pasek etapów i banery. Na telefonie to 185 px
       * i więcej, a na laptopie 1024×768 czy 1280×720 — tyle, że płótno dostawało
       * 360 px (dolną granicę), a pasek stanu z „Dalej" lądował pod krawędzią ekranu.
       * Przy wejściu do edytora strona w tym trybie przewija się do niego (patrz efekty
       * `pokazRysunek` i powrotu na zakładkę niżej), więc płótno liczone od edytora
       * mieści się razem z paskiem stanu. Nagłówek zostaje osiągalny przewinięciem.
       *
       * Od samego OKNA płótna, nie od kolumny: nad płótnem w kolumnie stoją kontrolki
       * narzędzia (np. grubość ściany), a każde 50 px nad płótnem to pasek stanu
       * wypchnięty za dolną krawędź ekranu.
       */
      const odEdytora =
        !pelnyEkran && gora !== null && (waskiEkran() || window.innerHeight - gora - zapasPod < MIN_WYS_PLOTNA);
      odEdytoraRef.current = odEdytora;
      if (odEdytora && kolumna && korzenEdytora) {
        const okno = kolumna.querySelector<HTMLElement>("[data-plan-okno]") ?? kolumna;
        gora = okno.getBoundingClientRect().top - korzenEdytora.getBoundingClientRect().top;
      }
      // W pełnym ekranie z WNĘTRZA kolumny płótna: ma ona wysokość okna minus paski,
      // a sama od płótna nie zależy (`h-full` w wierszu o stałej wysokości). Stały wzór
      // `innerHeight − 16 − paski` pomijał odstęp nad wierszem i płótno wchodziło
      // pod pasek stanu o 8 px. Wzór zostaje jako zapas, gdy kolumny jeszcze nie ma.
      const wnetrzeKolumny = (() => {
        if (!pelnyEkran || !kolumna) return null;
        const s = getComputedStyle(kolumna);
        return kolumna.clientHeight - parseFloat(s.paddingTop) - parseFloat(s.paddingBottom);
      })();
      const nowa = pelnyEkran
        ? Math.max(320, wnetrzeKolumny ?? window.innerHeight - 16 - zajetePionowo)
        : wysokoscPlotna(gora, window.innerHeight, zapasPod);
      // Próg 1 px: `getBoundingClientRect` potrafi oddać ułamek piksela, a każda taka
      // różnica jest dla Reacta nowym stanem. Bez progu obserwator niżej budziłby się
      // w kółko na własnym skutku.
      setWysPlotna((poprzednia) => (Math.abs(nowa - poprzednia) > 1 ? nowa : poprzednia));
      // Bez kolumny płótna (ekran startowy, wgrywanie) liczba wyżej to nadal zgadywanie.
      if (pelnyEkran || gora !== null) setWysZmierzona(true);
    };
    przelicz();
    window.addEventListener("resize", przelicz);
    // Stały chrome też potrafi zmienić wysokość bez zmiany rozmiaru okna: pasek narzędzi
    // zawija się na węższej kolumnie, pasek kondygnacji rośnie po dodaniu piętra.
    // Obserwujemy więc korzeń edytora — to on obejmuje oba te paski.
    const korzen = pelnyEkranRef.current;
    if (typeof ResizeObserver === "undefined" || !korzen) {
      return () => window.removeEventListener("resize", przelicz);
    }
    const ro = new ResizeObserver(przelicz);
    ro.observe(korzen);
    return () => {
      window.removeEventListener("resize", przelicz);
      ro.disconnect();
    };
    // `showEntryScreen`/`wgrywanie.stan`: dopiero po ich zmianie korzeń edytora (a z nim
    // kolumna płótna) w ogóle jest w drzewie — bez tego obserwator dopinałby się do
    // `null` i nigdy nie wracał. Ten sam powód co przy obserwatorze szerokości niżej.
  }, [pelnyEkran, rozmiaryChrome.gora, rozmiaryChrome.dol, showEntryScreen, wgrywanie.stan]);

  /** Czy na wierzchu stoi COKOLWIEK INNEGO niż edytor — ekran wejściowy, wczytywanie
   *  pliku albo przycinanie podkładu. Trzymane w refie, żeby złapać samo PRZEJŚCIE
   *  do edytora, a nie każdy render, w którym edytor akurat jest widoczny. */
  const edytorZaslonietyRef = useRef(showEntryScreen || wgrywanie.stan !== "bezczynny");
  /**
   * Na TELEFONIE przewijamy do rysunku, gdy tylko edytor się pojawi.
   *
   * Powód jest zmierzony: przy oknie 375×812 płótno zaczyna się 543 px w dół strony —
   * nad nim stoi nagłówek (210 px), pasek etapów, banery, pasek kondygnacji i pasek
   * narzędzi. Użytkownik klika „Narysuj dom samodzielnie", dostaje w odpowiedzi ten sam
   * nagłówek co przed chwilą i nie ma żadnego znaku, że gdzieś niżej czeka kartka do
   * rysowania. Odpowiedzią na „chcę rysować" ma być rysunek na ekranie.
   *
   * Celem jest KORZEŃ EDYTORA, nie sama kolumna płótna: zaczyna się paskiem edytora
   * (powiększenie, cofnij) i paskiem narzędzi, więc po przewinięciu widać i czym
   * rysować, i po czym. Wysokość płótna jest na telefonie liczona właśnie od tego
   * miejsca (patrz `przelicz` wyżej) — przewinięcie i rachunek muszą się zgadzać.
   *
   * Tylko przy PRZEJŚCIU do edytora — czyli gdy schodzi z wierzchu ekran wejściowy,
   * wczytywanie pliku albo przycinanie podkładu — i tylko poniżej progu wąskiego
   * ekranu. Użytkownik WRACAJĄCY do gotowego projektu widzi edytor od pierwszej klatki,
   * więc żadnego przejścia nie ma i strona nie drgnie: szarpanie nią przy każdym
   * powrocie na zakładkę byłoby walką o to, gdzie ma patrzeć. Na monitorze edytor
   * i tak mieści się w oknie (patrz `wysokoscPlotna`).
   */
  useEffect(() => {
    const zaslonietyTeraz = showEntryScreen || wgrywanie.stan !== "bezczynny";
    const bylZasloniety = edytorZaslonietyRef.current;
    edytorZaslonietyRef.current = zaslonietyTeraz;
    if (!bylZasloniety || zaslonietyTeraz) return;
    if (!odEdytoraRef.current) return;
    // Po zamontowaniu kolumny, nie w tej samej klatce co zmiana stanu — inaczej
    // przewijalibyśmy do elementu, który jeszcze nie ma swojej wysokości.
    //
    // Płynne przewinięcie liczy cel NA STARCIE, a układ nad edytorem jeszcze się
    // wtedy układa (zmierzone: znikający element zabierał 52 px w trakcie ruchu, więc
    // edytor lądował tyle niżej i pasek stanu z „Dalej" wypadał za dolną krawędź).
    // Po zakończeniu ruchu dosuwamy więc edytor do góry jednym skokiem. `scrollend`
    // tam, gdzie jest; zegar jako zapas dla przeglądarek, które go nie znają.
    let zegar = 0;
    const dosun = () => {
      window.removeEventListener("scrollend", dosun);
      window.clearTimeout(zegar);
      const el = pelnyEkranRef.current;
      if (el && Math.abs(el.getBoundingClientRect().top) > 2) el.scrollIntoView({ block: "start" });
    };
    const id = window.requestAnimationFrame(() => {
      pelnyEkranRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      window.addEventListener("scrollend", dosun);
      zegar = window.setTimeout(dosun, 900);
    });
    return () => {
      window.cancelAnimationFrame(id);
      window.removeEventListener("scrollend", dosun);
      window.clearTimeout(zegar);
    };
  }, [showEntryScreen, wgrywanie.stan]);

  /**
   * Na TELEFONIE przewijamy do edytora także przy POWROCIE na tę zakładkę z innej —
   * ale nie przy otwarciu ani odświeżeniu strony.
   *
   * Wcześniej świadomie nie przewijaliśmy przy powrotach (patrz efekt wyżej), bo
   * płótno liczyło się od góry strony i po powrocie było w całości w kadrze. Odkąd na
   * telefonie wysokość płótna liczy się od początku EDYTORA, powrót z Rozdzielnicy
   * zostawiał stronę przy nagłówku: z rzutu widać było ok. 240 px, a pasek stanu
   * z „Dalej" leżał pod krawędzią ekranu. Kliknięcie w etap „Instalacja" to jasna
   * intencja pracy na rzucie.
   *
   * Nawigację odróżnia licznik z `useRoute` — przy starcie strony ma 0. Moduł pamięta
   * ostatnią obsłużoną wartość, więc podwójne montowanie w trybie deweloperskim nie
   * przewija dwa razy (dlatego też sprzątanie efektu NIE anuluje klatki).
   */
  useEffect(() => {
    const licznik = licznikNawigacji();
    if (licznik === ostatniaObsluzonaNawigacja) return;
    ostatniaObsluzonaNawigacja = licznik;
    if (!odEdytoraRef.current || edytorZaslonietyRef.current) return;
    window.requestAnimationFrame(() => pelnyEkranRef.current?.scrollIntoView({ block: "start" }));
  }, []);

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
    /**
     * Kadr na rysunku ustawiamy RAZ NA KONDYGNACJĘ — przy jej otwarciu.
     *
     * Ten efekt uruchamia się ponownie przy wielu okazjach (zmiana wysokości płótna,
     * wyjście z ekranu startowego, koniec wgrywania rzutu), a przeramowanie jest
     * wtedy ostatnią rzeczą, jakiej ktoś chce: dorysowanie ściany zmienia wysokość
     * panelu bocznego, więc rysunek uciekałby spod kursora w trakcie rysowania.
     * Poza pierwszym razem zostaje samo powiększenie, dokładnie jak dotąd.
     *
     * Znacznik „skadrowana" dopiero przy ZMIERZONEJ wysokości płótna. Pomiar
     * i dopasowanie ruszają w tym samym cyklu, więc pierwsze dopasowanie widzi jeszcze
     * zgadnięte 640 px — a zmierzona wysokość (360 px na telefonie) wchodziła, gdy
     * kadr był już zablokowany. Otwarty przykład miał wtedy pustą górę płótna i dół
     * mieszkania za krawędzią. `wysZmierzona` w zależnościach budzi efekt ponownie
     * także wtedy, gdy pomiar trafi akurat w zgadniętą liczbę i sama wysokość się
     * nie zmieni.
     */
    /**
     * `przekadrujRef` — przez chwilę po wejściu/wyjściu z pełnego ekranu każda zmiana
     * wymiarów dopasowuje kadr od nowa (flagę gasi zegar w `przelaczPelnyEkran`): tuż po
     * wejściu kolumna ma przez chwilę wysokość bez pasków (zmierzone 868 zamiast
     * 733 px) i jednorazowe dopasowanie do niej wypychało dół rysunku za pasek stanu.
     */
    if (skadrowanaRef.current !== activeFloorId || przekadrujRef.current) {
      if (dopasujKadr() && wysZmierzona) skadrowanaRef.current = activeFloorId;
    } else {
      dopasujPustaKartke();
    }
    const el = kolumnaPlotnaRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    // Obserwujemy WYŁĄCZNIE szerokość. Dopasowanie zmienia wysokość płótna, ta
    // zmienia wysokość kolumny, a to znów budzi obserwatora — pętla zwrotna, przez
    // którą rzut przeskalowywał się w trakcie pracy i element uciekał spod kursora.
    const ro = new ResizeObserver((wpisy) => {
      const szer = Math.round(wpisy[0]?.contentRect.width ?? 0);
      if (szer === ostatniaSzerRef.current) return;
      ostatniaSzerRef.current = szer;
      dopasujPustaKartke();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [dopasujKadr, dopasujPustaKartke, zoomReczny, wgrywanie.stan, showEntryScreen, activeFloorId, wysZmierzona]);

  const scaleToolRef = useRef<HTMLButtonElement | null>(null);
  const wallToolRef = useRef<HTMLButtonElement | null>(null);
  /** Grupa przycisków powiększenia w pasku — kotwica dymka o nawigacji po rzucie. */
  const [grupaZoomu, setGrupaZoomu] = useState<HTMLDivElement | null>(null);
  // Który dymek pokazać — trzy okazje (linijka / ściany / nawigacja), ten sam popover.
  const [coachMark, setCoachMark] = useState<"skala" | "sciany" | "nawigacja" | null>(null);
  /**
   * Co użytkownik już wie o ruszaniu rzutem (patrz `podpowiedziNawigacji.ts`).
   *
   * Czytane RAZ, przy montowaniu: między zapisem a odczytem stoi tylko ta zakładka,
   * więc stan Reacta i `localStorage` nie mają jak się rozjechać.
   */
  const [stanNawigacji, setStanNawigacji] = useState(odczytajStanNawigacji);
  /**
   * Licznik pomyłek „kółko bez Ctrl" — patrz `PodpowiedzKolka`. Licznik, a nie flaga,
   * żeby kolejne kręcenie przedłużało komunikat, zamiast nie robić nic.
   */
  const [sygnalKolka, setSygnalKolka] = useState(0);
  /** Kiedy ostatnio odnotowaliśmy kręcenie kółkiem — patrz `czyOdnotowacKolko`. */
  const ostatnieKolkoRef = useRef(0);
  const [seenBefore] = useState(hasSeenOnboarding);

  /**
   * Dymek czekający na SWOJĄ kolej — patrz `poWgraniuPodkladu`.
   *
   * Ref, nie stan: nikt go nie ogląda, dopóki nie nadejdzie jego moment, a zmiana
   * kolejki sama w sobie nie ma prawa niczego przerysować.
   */
  const nastepnyCoachMark = useRef<"skala" | null>(null);

  /** Pokazuje dymek czekający w kolejce (jeśli jakiś jest) i opróżnia ją. */
  const pokazNastepnyCoachMark = useCallback(() => {
    const nastepny = nastepnyCoachMark.current;
    nastepnyCoachMark.current = null;
    setCoachMark(nastepny);
  }, []);
  /**
   * Pierwsze przybliżenie rzutu — gasi obie podpowiedzi o nawigacji na dobre.
   *
   * Wołane z JEDNEGO miejsca dla wszystkich dróg: `Ctrl` + kółko na płótnie i
   * przyciski w pasku wchodzą tym samym `onZoomChange`, więc nie da się nauczyć
   * przybliżania „po cichu", z pominięciem tego zapisu.
   */
  const oznaczUmiejetnoscNawigacji = useCallback(() => {
    zapamietajUmiejetnosc();
    setStanNawigacji((s) => (s.umieNawigowac ? s : { ...s, umieNawigowac: true }));
    // Dymek, który właśnie o tym mówił, nie ma już czego tłumaczyć — ustępuje
    // miejsca temu, co czekało za nim.
    //
    // Kolejkę opróżniamy POZA funkcją aktualizującą stan. React woła ją w trybie
    // ścisłym dwa razy dla tej samej zmiany: pierwsze wywołanie zabierało dymek
    // z kolejki, drugie zastawało ją pustą i kasowało go z powrotem.
    if (coachMark === "nawigacja") pokazNastepnyCoachMark();
  }, [coachMark, pokazNastepnyCoachMark]);

  /**
   * „Rozumiem" pod dymkiem o nawigacji — zamyka go na dobre, także po odświeżeniu,
   * i oddaje scenę temu, co czekało w kolejce (zwykle: dymkowi o skali).
   */
  const zamknijPowitanieNawigacji = useCallback(() => {
    zapamietajOdrzuceniePowitania();
    setStanNawigacji((s) => ({ ...s, powitanieOdrzucone: true }));
    pokazNastepnyCoachMark();
  }, [pokazNastepnyCoachMark]);

  /**
   * Ktoś kręci kółkiem nad rzutem bez `Ctrl` — czyli przewija stronę, prawdopodobnie
   * próbując przybliżyć plan. Podnosimy licznik, a `PodpowiedzKolka` zamienia go na
   * gasnący sam komunikat.
   */
  const zglosKolkoBezCtrl = useCallback(() => {
    if (!czyPokazacPodpowiedzKolka(stanNawigacji, coachMark === "nawigacja")) return;
    // Jedno kręcenie kółkiem to kilkadziesiąt zdarzeń, a każde szło dotąd prosto
    // w stan, czyli w pełne przerysowanie tej zakładki razem z płótnem. Dymek i tak
    // wyglądał identycznie — patrz `ODSTEP_ZGLOSZEN_KOLKA`.
    const teraz = Date.now();
    if (!czyOdnotowacKolko(ostatnieKolkoRef.current, teraz)) return;
    ostatnieKolkoRef.current = teraz;
    setSygnalKolka((n) => n + 1);
  }, [stanNawigacji, coachMark]);

  /**
   * Koniec wgrywania podkładu — przycięciem albo z jego pominięciem.
   *
   * Kolejność dymków jest tu celowa: najpierw JAK oglądać rzut, dopiero potem CO z nim
   * zrobić. Dwóch punktów o znanej odległości nie da się wskazać na rzucie, którego nie
   * umie się przybliżyć — a nawigacja po płótnie jest jedyną rzeczą w tej aplikacji
   * wziętą wprost z programów CAD (patrz `podpowiedziNawigacji.ts`).
   *
   * Kto nawigację już zna, ten przechodzi prosto do skali, czyli do stanu sprzed tej
   * zmiany. Kolejka ma najwyżej dwa elementy i nie zamierza być mechanizmem ogólnym.
   */
  const poWgraniuPodkladu = useCallback(() => {
    // Po podkładzie naturalny następny krok to skala — bez niej nie policzymy metrów.
    setToolMode("skala");
    if (czyPokazacPowitanie(stanNawigacji)) {
      nastepnyCoachMark.current = "skala";
      setCoachMark("nawigacja");
      return;
    }
    setCoachMark("skala");
  }, [stanNawigacji]);

  /**
   * „Dopasuj widok" — kadr wraca na rysunek.
   *
   * JEDNA funkcja dla ikony w pasku i dla dwukliku w puste miejsce płótna: obie drogi
   * muszą też zdjąć `zoomReczny`, bo inaczej widok zostałby „ręczny" i przestał
   * reagować na zmiany okna mimo świeżego dopasowania.
   */
  const dopasujWidok = useCallback(() => {
    setZoomReczny(false);
    dopasujKadr();
  }, [dopasujKadr]);

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
      return;
    }
    setToolMode("elementy");
  }

  /** Druga, równoległa droga startu obok wgrania rzutu: dom rysowany od zera na
   *  czystej siatce. Ustawia od razu STANDARDOWĄ skalę (patrz `MANUAL_DRAW_SCALE_MPU`
   *  w lib/design.ts — 1 kratka = 1 m), bo bez podkładu nie ma czego kalibrować, a
   *  krok 1 onboardingu i tak liczy się jako ukończony z chwilą ustawienia jakiejkolwiek
   *  skali (`facts.maSkale`, patrz lib/onboarding.ts) — więc odhacza się automatycznie. */
  function startManualDrawing() {
    markOnboardingSeen();
    // Zapamiętujemy SAM WYBÓR, bo nic innego po nim nie zostaje: skala i narzędzie to
    // za mało, żeby ktokolwiek później odczytał „ten użytkownik świadomie nie ma rzutu"
    // (patrz `rysowanieBezPodkladu` w lib/onboarding.ts). Bez tego baner namawiający
    // do wgrania podkładu wstawał natychmiast po kliknięciu tego przycisku.
    onboarding.chooseManualDrawing();
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
    // Dokładanie do zaznaczenia dotyczy WYŁĄCZNIE narzędzia „Zaznacz" — zostawione
    // włączone na później byłoby pułapką: po powrocie kliknięcie w element dokładałoby
    // go do zaznaczenia sprzed kwadransa, bez żadnego widocznego powodu.
    if (id !== "zaznacz") setZaznaczanieWielokrotne(false);
    // Wyjście z trybu porzuca niedokończoną figurę — inaczej jej punkty
    // wisiałyby na planie i doklejałyby się po powrocie do rysowania.
    if (id !== "pomieszczenie") pokoje.setDrawingRoomPoints([]);
    if (id !== "sciany") sciany.setDrawingWall([]);
    // Propozycja „zrób z tej pętli pomieszczenie" dotyczy CHWILI zaraz po domknięciu
    // obrysu. Wyjście z narzędzia ściany jest odpowiedzią „nie teraz" — wskrzeszanie
    // jej przy powrocie do rysowania pół godziny później byłoby natręctwem. Sama
    // operacja zostaje dostępna w menu kontekstowym ściany, więc nic nie przepada.
    if (id !== "sciany") setPetlaDoNazwania(null);
    // Treść panelu idzie za narzędziem sama (patrz `NaglowekNarzedzia`) — nie ma
    // już osobnej zakładki, którą trzeba by tu przestawiać.
    setToolMode(id);
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

  /** Edycja nazwy pomieszczenia w miejscu dwukliku na planie (input-nakładka, bo
   *  Konva nie ma natywnego pola tekstowego — ten sam trik co przy contextMenu). */
  const [roomNameEdit, setRoomNameEdit] = useState<{ x: number; y: number; id: string; value: string } | null>(null);
  /** Okno informacji o przewodzie — trasa i wskazany odcinek (patrz `InfoTrasy`). */
  const [infoTrasy, setInfoTrasy] = useState<{ id: string; odcinek: number } | null>(null);
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
  }, [toolMode, setMultiSelected]);

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
    wyczyscZaznaczenie();
    setCalibPoints([]);
    setSzkicSciany([]);
    porzucSzkicPokoju();
    setRoomNameEdit(null);
    setEditingId(null);
  }, [activeFloorId, setSzkicSciany, porzucSzkicPokoju, wyczyscZaznaczenie]);

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
  const wTrakcieRysowania = sciany.drawingWall.length > 0 || pokoje.drawingRoomPoints.length > 0;
  const canUndo = wTrakcieRysowania || maZatwierdzoneDoCofniecia;
  function undo() {
    if (sciany.drawingWall.length > 0) {
      sciany.setDrawingWall((pts) => pts.slice(0, -1));
      return;
    }
    if (pokoje.drawingRoomPoints.length > 0) {
      pokoje.setDrawingRoomPoints((pts) => pts.slice(0, -1));
      return;
    }
    cofnijZatwierdzone();
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Klawisz naciśnięty w oknie, menu, panelu paska albo liście rozwijanej nie jest
      // dla planu — patrz `klawiszDlaEdytora` (Delete pod oknem „Pomoc" kasował
      // zaznaczony element, litery skrótów blokowały wybór w listach).
      if (!klawiszDlaEdytora(e.target)) return;
      const tag = (document.activeElement as HTMLElement | null)?.tagName;
      if ((e.key === "Delete" || e.key === "Backspace") && tag !== "INPUT" && tag !== "TEXTAREA") {
        e.preventDefault();
        zaznaczenie.usunZaznaczone();
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

      // Ctrl+A / Ctrl+C / Ctrl+V — zaznacz wszystko, kopiuj, wklej (F2/F4 z audytu
      // 5.11.2026). Filtr `klawiszDlaEdytora` na początku już odsiał pola tekstowe i okna,
      // więc tu klawisze należą do planu; `preventDefault` tylko, gdy coś faktycznie robimy,
      // żeby Ctrl+C na pustym zaznaczeniu nie zabierał przeglądarce zwykłego kopiowania.
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && tag !== "INPUT" && tag !== "TEXTAREA") {
        const klawisz = e.key.toLowerCase();
        if (klawisz === "a" && elements.length > 0) {
          e.preventDefault();
          zaznaczWszystko();
        } else if (klawisz === "c" && zaznaczoneElementy.length > 0) {
          e.preventDefault();
          kopiujZaznaczenie();
        } else if (klawisz === "v" && schowekRef.current.length > 0) {
          e.preventDefault();
          wklejSchowek();
        }
      }

      if ((e.key === "r" || e.key === "R") && tag !== "INPUT" && tag !== "TEXTAREA") {
        const ids = multiSelected.length > 0 ? multiSelected : selected?.kind === "el" ? [selected.id] : [];
        if (ids.length) {
          e.preventDefault();
          rotateElements(ids);
        } else if (selected?.kind === "opening") {
          e.preventDefault();
          otwory.obroc(selected.id);
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
          sciany.drawingWall.length > 0 || pokoje.drawingRoomPoints.length > 0 || multiSelected.length > 0 || calibPoints.length > 0 || contextMenu !== null;
        sciany.setDrawingWall([]);
        pokoje.setDrawingRoomPoints([]);
        setMultiSelected([]);
        setCalibPoints([]);
        zaznaczenie.zamknijMenu();
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
      if (e.key === "Enter" && sciany.drawingWall.length >= 2 && tag !== "INPUT" && tag !== "TEXTAREA") {
        e.preventDefault();
        sciany.finishWall();
      }
      // To samo dla wieloboku pomieszczenia — próg 3 punktów jak w `finishRoomDrawing`
      // (przycisk „Zakończ" pojawia się dopiero od trzech, mniej nie domyka figury).
      // Prostokąt nie potrzebuje tego skrótu: tam zamknięcie następuje od razu po
      // puszczeniu przycisku myszy, bez oddzielnego kroku zatwierdzenia.
      if (e.key === "Enter" && pokoje.drawingRoomPoints.length >= 3 && tag !== "INPUT" && tag !== "TEXTAREA") {
        e.preventDefault();
        pokoje.zakonczRysowanie();
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
      // Ctrl+Y — ponów, jak w Wordzie, AutoCAD-zie i przeglądarce. Na Windowsie to
      // pierwszy skrót, po który sięga ręka; Ctrl+Shift+Z zostaje dla nawyków z Maca.
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "y" && tag !== "INPUT" && tag !== "TEXTAREA") {
        e.preventDefault();
        if (canRedo) redo();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Każdy typ z wariantami ma WŁASNY licznik gangów — zmiana jednego nie wpływa na drugi.
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
    // Skala renderu symboli musi tu dojść ta sama, którą rysuje płótno — odsunięcie od
    // ściany jest podane w jednostkach glifu, a element żyje w jednostkach planu.
    return (
      snapElementToWall(p, walls, roomShapes, tolerancja, type, skalaOsprzetu) ?? { x: p.x, y: p.y, rotation: obecnyObrot }
    );
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

  /**
   * Schowek planu — skopiowane elementy (Ctrl+C), wklejane Ctrl+V (F4 z audytu 5.11.2026).
   *
   * Trzymany w pamięci zakładki, nie w schowku systemowym: to dane planu, nie tekst, a
   * zakładka zostaje zamontowana przy przełączaniu kondygnacji — o to właśnie chodzi,
   * bo główny powód istnienia schowka to te same gniazda nad sobą na parterze i piętrze.
   * Licznik wklejeń odsuwa każdą kolejną kopię na tej samej kondygnacji, żeby nie
   * lądowały jedna na drugiej.
   */
  const schowekRef = useRef<InstallationElement[]>([]);
  const wklejenRef = useRef(0);

  function zaznaczWszystko() {
    setToolMode("zaznacz");
    setSelected(null);
    setMultiSelected(elements.map((e) => e.id));
  }

  function kopiujZaznaczenie() {
    const ids = zaznaczoneElementy;
    schowekRef.current = elements.filter((e) => ids.includes(e.id)).map((e) => ({ ...e }));
    wklejenRef.current = 0;
  }

  function wklejSchowek() {
    const zrodlo = schowekRef.current;
    if (zrodlo.length === 0) return;
    const naTejSamej = zrodlo.every((e) => e.floor === activeFloorId);
    const odsuniecie = naTejSamej ? (GRID / 2) * ++wklejenRef.current : 0;
    const kopie = zrodlo.map((e) => {
      const x = e.x + odsuniecie;
      const y = e.y + odsuniecie;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { roomId: _id, obwod, lightGroup, ...reszta } = e;
      return {
        ...reszta,
        // Na tej samej kondygnacji kopia zachowuje ręczny numer obwodu i grupy, tak jak
        // Ctrl+D. Na INNEJ — nie: numer obwodu znaczy to samo w całym budynku, więc
        // gniazdo z piętra dołączyłoby do obwodu z parteru.
        ...(naTejSamej ? { obwod, lightGroup } : {}),
        id: crypto.randomUUID(),
        floor: activeFloorId,
        x,
        y,
        // Pokój z położenia na DOCELOWEJ kondygnacji; nazwa pokoju z innego piętra nie
        // jest tu „nazwą wpisaną ręcznie", którą trzeba chronić.
        room: naTejSamej ? roomNameAfterMove({ x, y }, e.room, roomShapes, mpu) : detectRoomName({ x, y }, roomShapes, mpu),
      };
    });
    setDraft((d) => ({ ...d, elements: [...d.elements, ...kopie] }));
    setToolMode("zaznacz");
    setSelected(null);
    setMultiSelected(kopie.map((k) => k.id));
  }

  /**
   * Przypisuje elementom NUMER OBWODU — albo oddaje je automatowi (`undefined`).
   *
   * Numer jest decyzją projektową, której z rysunku nie da się odgadnąć: automat
   * dzieli obwody po rodzaju punktu, mokrości pomieszczenia i kolejności, a
   * projektant wie, że kuchnia ma iść osobno. Patrz `computeCircuits`.
   *
   * Odbiorniki z własnym obwodem z definicji (ładowarka EV, gniazdo trójfazowe,
   * wypust AGD, gniazdo dedykowane) są tu pomijane, nawet gdyby trafiły do
   * zaznaczenia grupowego — ich obwód ma inny przewód i inne zabezpieczenie, więc
   * dołączenie do wspólnego dałoby obwód z błędnym doborem.
   */
  function przypiszObwod(ids: string[], numer: number | undefined) {
    setDraft((d) => ({
      ...d,
      elements: d.elements.map((e) =>
        ids.includes(e.id) && wchodziDoObwodu(e) && !maWlasnyObwodZDefinicji(e) ? { ...e, obwod: numer } : e
      ),
    }));
  }

  /**
   * Numery, które już gdzieś w PROJEKCIE są — do podpowiedzi w menu. Bez nich
   * przypisanie drugiego gniazda do „obwodu 3" wymagałoby zapamiętania, że taki
   * numer w ogóle istnieje.
   *
   * Liczone z CAŁEGO budynku, nie z bieżącej kondygnacji, bo numer znaczy to samo
   * w całym projekcie: `computeCircuits` w rozdzielnicy grupuje po nim wszystkie
   * elementy, niezależnie od piętra. Gdy lista pochodziła z jednej kondygnacji,
   * „+ nowy" na piętrze proponował numer zajęty na parterze — i kliknięcie po cichu
   * scalało dwa niezwiązane zestawy punktów w jeden obwód.
   *
   * Numery używane WYŁĄCZNIE gdzie indziej zostają na liście (scalenie przez piętra
   * bywa zamierzone — jeden pion), ale są oznaczone, żeby było to wybór, a nie
   * przypadek.
   */
  const uzyteNumeryObwodow = useMemo(() => {
    const naTej = new Set<number>();
    for (const e of elements) if (typeof e.obwod === "number") naTej.add(e.obwod);
    const wszystkieNumery = new Set<number>();
    for (const e of wszystkieElementy) if (typeof e.obwod === "number") wszystkieNumery.add(e.obwod);
    return [...wszystkieNumery]
      .sort((a, b) => a - b)
      .map((numer) => ({ numer, gdzieIndziej: !naTej.has(numer) }));
  }, [elements, wszystkieElementy]);

  /** Obraca element(y) o 90° (w prawo) — np. gniazdko/łącznik przy skośnej ścianie. */
  function rotateElements(ids: string[]) {
    setDraft((d) => ({
      ...d,
      elements: d.elements.map((e) => (ids.includes(e.id) ? { ...e, rotation: ((e.rotation ?? 0) + 90) % 360 } : e)),
    }));
  }

  /**
   * Droga W DRUGĄ STRONĘ niż `createWallFromRoom`: ze ściany zamkniętej w pętlę robi
   * pomieszczenie o dokładnie tym samym obrysie.
   *
   * Tej strony brakowało, a to ona jest naturalna po „Narysuj dom samodzielnie":
   * użytkownik dostaje narzędzie ściany, obrysowuje nim dom albo pokój, po czym
   * przewodnik każe mu „obrysować pomieszczenia" — czyli przejechać po raz drugi
   * dokładnie tę samą figurę. Tu wystarczy nazwać.
   *
   * Prowadzi przez ZWYKŁE okno „Nazwij pomieszczenie" (`pendingRoom`), a nie tworzy
   * pomieszczenia po cichu: typ pomieszczenia decyduje o regułach doboru (gniazda
   * hermetyczne, strefa mokra), więc pokój bez świadomie wybranego typu jest wart
   * mniej niż jego brak. To ta sama droga, którą idzie każde inne pomieszczenie.
   */
  function createRoomFromWall(wallId: string) {
    const wall = walls.find((w) => w.id === wallId);
    const punkty = wall && wierzcholkiZamknietejSciany(wall.points);
    if (!punkty) return;
    pokoje.zaproponuj(punkty);
  }

  /**
   * Ściany tej kondygnacji, które są zamkniętą pętlą i NIE mają jeszcze swojego
   * pomieszczenia — czyli te, dla których propozycja „zrób z tego pomieszczenie"
   * ma sens.
   *
   * „Nie mają pomieszczenia" liczone przez punkt WEWNĄTRZ obrysu: jeśli wpada on do
   * któregoś z narysowanych pokoi, ktoś już ten obszar obrysował i przypominanie o tym
   * byłoby dokładnie tym natręctwem, które gasimy w innych banerach.
   *
   * Punkt bierzemy z `punktWewnatrzWielokata`, a NIE ze średniej wierzchołków, i to jest
   * tu istotne. Dla obrysu wklęsłego — a mieszkania w kształcie L i U są na rzutach
   * regułą — średnia wypada w samym wcięciu, czyli poza figurą. Pętla dostawała wtedy
   * odpowiedź „nie ma pomieszczenia" nawet tuż po tym, jak użytkownik zrobił z niej
   * pokój o dokładnie tym samym obrysie, więc menu kontekstowe dalej proponowało
   * „Utwórz pomieszczenie z obrysu" i dawało się zrobić drugi, nakładający się pokój
   * (zdublowana powierzchnia w zestawieniu).
   *
   * `null` (figura bez wnętrza) traktujemy jako „nie wiemy" i propozycji NIE gasimy:
   * `wierzcholkiZamknietejSciany` odrzuca już figury o zerowym polu, więc tu jest to
   * przypadek czysto teoretyczny, a milczenie byłoby gorsze od zbędnej propozycji.
   */
  const petleBezPomieszczenia = useMemo(
    () =>
      walls
        .map((w) => ({ wall: w, punkty: wierzcholkiZamknietejSciany(w.points) }))
        .filter((x): x is { wall: Wall; punkty: Point[] } => x.punkty !== null)
        .filter(({ punkty }) => {
          const wnetrze = punktWewnatrzWielokata(punkty);
          if (!wnetrze) return true;
          return !roomShapes.some((r) => r.points.length >= 3 && pointInPolygon(wnetrze, r.points));
        }),
    [walls, roomShapes]
  );

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
  /** Grubość ściany w polu do wpisania: centymetry, gdy skala jest skalibrowana
   *  (ten sam wybór jednostki co `formatDlugosc` w DesignCanvas), inaczej same
   *  jednostki planu — użytkownik bez skali i tak nie ma punktu odniesienia dla cm. */
  function thicknessToDisplay(units: number): number {
    return mpu !== null ? Math.round(units * mpu * 100 * 10) / 10 : Math.round(units);
  }
  function thicknessFromDisplay(display: number): number {
    return mpu !== null ? display / 100 / mpu : display;
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
   * Skok z pozycji „Sprawdzenie" w pasku stanu do karty z uwagami: rozwija ją (także
   * zwiniętą wcześniej ręcznie) i przewija do niej. W pełnym ekranie karty nie ma,
   * więc najpierw z niego wychodzi — kliknięcie w uwagę to jasna prośba o jej treść.
   * Przewinięcie po chwili, bo karta pojawia się dopiero po wyjściu z pełnego ekranu.
   */
  const kartaSprawdzeniaRef = useRef<HTMLDivElement>(null);
  const [kartaSprawdzeniaOtwarta, setKartaSprawdzeniaOtwarta] = useState<boolean | null>(null);
  const pokazSprawdzenie = useCallback(() => {
    setKartaSprawdzeniaOtwarta(true);
    if (pelnyEkran) przelaczPelnyEkran();
    window.setTimeout(
      () => kartaSprawdzeniaRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      pelnyEkran ? 450 : 0
    );
  }, [pelnyEkran, przelaczPelnyEkran]);

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
    [toolMode, setSelected, setMultiSelected]
  );
  /** To samo dla spostrzeżeń o pomieszczeniach (nachodzące obrysy) — zaznacza pokój,
   *  więc od razu widać jego narożniki do przeciągnięcia. */
  const pokazPomieszczenieNaPlanie = useCallback(
    (id: string) => {
      if (toolMode !== "zaznacz") zaznaczenieZeSkokuRef.current = true;
      setToolMode("zaznacz");
      setMultiSelected([]);
      setSelected({ kind: "room", id });
    },
    [toolMode, setSelected, setMultiSelected]
  );
  // Trasy przewodów — WYŁĄCZNIE z elementów/ścian/pomieszczeń TEJ kondygnacji
  // (wszystkie trzy już przefiltrowane przez `useActiveFloor*`), więc rozdzielnica,
  // punkty i sieć, po której routuje `buildCableRoutes`, zawsze mieszkają w tym samym
  // układzie współrzędnych. Puste trasy zasilania bez rozdzielnicy na planie — trasy
  // sterowania (łącznik→oprawa) działają niezależnie od niej, patrz `buildCableRoutes`.
  /**
   * Trasy liczone także wtedy, gdy edytor ich nie pokazuje, ale trwa eksport — muszą
   * być na scenie, bo PDF powstaje z jej rasteryzacji. Poza tymi dwoma przypadkami
   * liczenie jest pomijane: przy każdej zmianie elementu to kilkadziesiąt milisekund,
   * których nie ma po co wydawać na warstwę, której nikt nie ogląda.
   */
  const trasyPotrzebne = showRoutes || (podgladPdf && trasyWPdf);
  /**
   * Skala renderu osprzętu — jedna liczba, od której zależy i rysunek, i odsunięcie
   * elementów od ściany. Wydzielona, bo pilnuje jej efekt niżej.
   */
  const skalaOsprzetu = elementRenderScale(mpu, elementScale, skalaBezKalibracji);
  skalaOsprzetuRef.current = skalaOsprzetu;

  /** Czwarte skupisko — patrz `useWstawianieElementu`. Stoi TUTAJ, a nie przy
   *  pozostałych hookach, bo potrzebuje `skalaOsprzetu` policzonej wyżej. */
  const wstawianie = useWstawianieElementu({ skalaSymboli: skalaOsprzetu, przyciagnijDoSciany: zPrzyciaganiemDoSciany });

  /**
   * Zmiana skali symboli przesuwa osprzęt PRZYKLEJONY do ścian, żeby dalej ich dotykał.
   *
   * Pozycja zapisana przez `snapElementToWall` jest odsunięta od ściany o tyle, ile
   * mierzył symbol W CHWILI STAWIANIA. Gdy skala zmieni się później — kalibracja rzutu,
   * suwak rozmiaru, rozpoznana wielkość rysunku — symbol rośnie wokół starej kotwicy
   * i trzonek gniazdka wchodzi w mur. Szczegóły przeliczenia: `przeliczPrzyscienneDoSkali`.
   *
   * `commit: false`, bo to nie jest czynność użytkownika: poprawka ma jechać razem
   * z jego następną zmianą, a nie zajmować własnego kroku w „Cofnij".
   *
   * Ref zamiast zależności efektu: interesuje nas RÓŻNICA między skalami, a pierwsze
   * uruchomienie (montaż, wczytanie projektu) żadnej różnicy nie ma i nie może niczego
   * przesunąć.
   */
  const poprzedniaSkalaOsprzetu = useRef(skalaOsprzetu);
  useEffect(() => {
    const stara = poprzedniaSkalaOsprzetu.current;
    poprzedniaSkalaOsprzetu.current = skalaOsprzetu;
    if (stara === skalaOsprzetu) return;
    setDraft(
      (d) => {
        const next = przeliczPrzyscienneDoSkali(d.elements, walls, roomShapes, stara, skalaOsprzetu);
        return next === d.elements ? d : { ...d, elements: next };
      },
      { commit: false }
    );
    // `walls`/`roomShapes` celowo poza zależnościami: rysowanie kolejnej ściany ma
    // przeliczać osprzęt tylko wtedy, gdy zmieniło SKALĘ — a wtedy i tak zmienia się
    // `skalaOsprzetu`. Bez tego każde tknięcie obrysu ruszałoby elementami bez powodu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skalaOsprzetu, setDraft]);

  const rawCableRoutes = useMemo(
    () =>
      trasyPotrzebne
        ? buildCableRoutes(
            findPanel(elements),
            // Obwody CAŁEGO budynku, te same, które liczą Rozdzielnica, Schemat
            // i Kosztorys. Rzut liczył je sobie wcześniej sam, z elementów jednego
            // piętra, więc ten sam obwód miał na rysunku inny numer, inną nazwę
            // i inny kolor niż w reszcie aplikacji — a spis obwodów idzie do PDF-a
            // rzutu, więc dwa dokumenty w jednym komplecie mówiły co innego.
            // Rysowane są i tak wyłącznie punkty stojące na tej kondygnacji
            // (patrz `naTejKondygnacji` w `buildCableRoutes`).
            computeCircuits(wszystkieElementy, wszystkiePomieszczenia),
            elements,
            walls,
            roomShapes,
            openings,
            skalaOsprzetu,
            // Cały budynek WYŁĄCZNIE po to, żeby rozpoznać oprawę sterowaną łącznikiem
            // z innej kondygnacji — rysunek nadal powstaje z elementów tego piętra.
            wszystkieElementy
          )
        : [],
    [trasyPotrzebne, elements, wszystkieElementy, wszystkiePomieszczenia, walls, roomShapes, openings, skalaOsprzetu]
  );
  // Ręczne poprawki (przeciągnięte przez użytkownika załamania, patrz DesignCanvas)
  // nakładane NA WIERZCHU świeżo policzonych tras — początek/koniec zawsze biorą się
  // z aktualnej pozycji elementu, więc jego przesunięcie nie gubi ręcznego układu.
  const cableRoutes = useMemo(() => applyRouteOverrides(rawCableRoutes, routeOverrides), [rawCableRoutes, routeOverrides]);

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
    /**
     * CAŁY tryb „zaznacz", a nie tylko chwile z czymś zaznaczonym: stoi w nim
     * przełącznik „Zaznacz kilka", który ma być pod ręką ZANIM cokolwiek zaznaczono —
     * to on odblokowuje resztę operacji na zaznaczeniu.
     *
     * Pochłania tym samym trzy dawne warunki („zaznaczona ściana/otwór/trasa w trybie
     * zaznacz"): pigułka i tak jest wtedy aktywna, a ich treść dokłada `kontekstoweTresc`
     * własnymi warunkami. Slot nie świeci już pustką, bo zawsze ma co najmniej przełącznik.
     */
    toolMode === "zaznacz" ||
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
  /**
   * Pętla ścian czekająca na propozycję „zrób z niej pomieszczenie" — albo `null`.
   *
   * WYLICZANA, a nie trzymana w stanie: gdy pętla dostanie już swoje pomieszczenie
   * (tędy albo zwykłym obrysowaniem), wypada z `petleBezPomieszczenia` i propozycja
   * gaśnie sama. Gaszenie ręczne wymagałoby pamiętania o tym w każdym miejscu,
   * którym może powstać pomieszczenie.
   */
  const propozycjaPokoju =
    petlaDoNazwania && toolMode === "sciany"
      ? petleBezPomieszczenia.find((x) => x.wall.id === petlaDoNazwania) ?? null
      : null;

  const blokujaceKontrolki = sciany.drawingWall.length > 0 || pokoje.drawingRoomPoints.length > 0 || toolMode === "skala";
  useEffect(() => {
    // Tylko na SZEROKIM ekranie, gdzie panel stoi OBOK rzutu. Na telefonie stoi NAD nim,
    // więc rozwinięcie przy pierwszym punkcie ściany spychało rzut o 261 px w połowie
    // rysowania i kolejne narożniki trafiały w panel. Tam kontrolki pływają nad
    // płótnem (patrz nakładka przy `DesignCanvas`), więc panel nie musi się rozwijać.
    if (!pelnyEkran && szerokieOkno && blokujaceKontrolki && panelZwiniety) rozwinPanel();
  }, [pelnyEkran, szerokieOkno, blokujaceKontrolki, panelZwiniety, rozwinPanel]);

  /**
   * Treść pigułki kontrolek kontekstowych — WSPÓLNA dla obu miejsc, w których się
   * renderuje (pełny ekran kontra widok zwykły, patrz komentarze przy obu). Jedna
   * definicja, żeby te same kontrolki (grubość ściany, kształt pomieszczenia,
   * kalibracja skali…) nie rozjechały się przypadkiem między dwiema kopiami JSX.
   */
  /**
   * Pigułka „Wstawiasz: …" — na TELEFONIE, gdy biblioteka elementów jest zwinięta.
   *
   * Biblioteka stoi tam NAD rzutem i zajmuje ekran: rzut miał wtedy 360 px i zaczynał
   * się ponad 530 px od góry, więc każde gniazdko to było przewinięcie w dół (postaw)
   * i w górę (wybierz następne). Po wybraniu elementu biblioteka się zwija, a to, co
   * dało się w niej ustawić dla wybranego elementu — liczba gniazd, „Dedykowane (AGD)"
   * — przechodzi tutaj, razem z drogą powrotną („Zmień").
   *
   * Tylko przy ZWINIĘTYM panelu: przy rozwiniętym te same kontrolki są w bibliotece
   * i dwie kopie dałyby dwa pola o tej samej nazwie.
   */
  const aktywnyTyp = wstawianie.activeType;
  const warianty = aktywnyTyp ? VARIANTS_FOR[aktywnyTyp] : undefined;
  const pigulkaWstawiania =
    !szerokieOkno && !pelnyEkran && panelZwiniety && toolMode === "elementy" && aktywnyTyp ? (
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5 text-sm">
        <span className="font-medium text-slate-600">Wstawiasz: {ELEMENT_TYPES[aktywnyTyp].label}</span>
        {warianty && warianty.length > 1 && (
          <div className="flex gap-1" role="group" aria-label="Liczba gniazd">
            {warianty.map((n) => {
              const wybrany = wstawianie.gangsForType(aktywnyTyp) === n;
              return (
                <button
                  key={n}
                  type="button"
                  aria-pressed={wybrany}
                  onClick={() => wstawianie.ustawGangs(aktywnyTyp, n)}
                  className={`min-w-8 rounded-md border px-2 py-1 text-xs ${wybrany ? "border-copper bg-white text-copper" : "border-border bg-white text-slate-500"}`}
                >
                  {n}
                </button>
              );
            })}
          </div>
        )}
        {aktywnyTyp === "gniazdko" && (
          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            <input type="checkbox" checked={wstawianie.dedicated} onChange={(e) => wstawianie.setDedicated(e.target.checked)} />
            Dedykowane (AGD)
          </label>
        )}
        <button
          type="button"
          onClick={() => rozwinPanel()}
          className="pe-btn-ghost shrink-0 px-2.5 py-1 text-sm"
        >
          Zmień
        </button>
      </div>
    ) : null;

/**
   * Karta ZAZNACZONEJ ściany: długość, grubość, długości odcinków i akcje.
   *
   * Grubość i odcinki stały tu już wcześniej; doszedł nagłówek (ile ściana ma i z ilu
   * odcinków) i akcje, które dotąd były tylko w menu pod prawym przyciskiem: „Usuń
   * ścianę" i — dla pętli bez pomieszczenia — „Utwórz pomieszczenie z obrysu".
   */
  const kartaSciany = (() => {
    if (toolMode !== "zaznacz" || selected?.kind !== "wall" || multiSelected.length > 0) return null;
    const w = walls.find((x) => x.id === selected.id);
    if (!w) return null;
    const currentThickness = w.thickness ?? DEFAULT_WALL_THICKNESS;
    const odcinki = Math.max(0, w.points.length - 1);
    let dlugosc = 0;
    for (let i = 1; i < w.points.length; i++) {
      dlugosc += Math.hypot(w.points[i].x - w.points[i - 1].x, w.points[i].y - w.points[i - 1].y);
    }
    const petla = petleBezPomieszczenia.some((x) => x.wall.id === w.id);
    const przycisk = "pe-btn-ghost flex items-center gap-1 px-2.5 py-1 text-xs [@media(pointer:coarse)]:min-h-11";
    return (
      <div className="flex min-w-0 flex-col items-start gap-2 text-xs" data-testid="karta-sciany">
        <div>
          <div className="text-sm font-semibold text-ink">Ściana</div>
          <div className="text-[11px] text-slate-500">
            {mpu !== null ? `${formatLiczba(dlugosc * mpu, 2)} m` : `${Math.round(dlugosc)} jedn.`} ·{" "}
            {odcinki} {odcinki === 1 ? "odcinek" : odcinki < 5 ? "odcinki" : "odcinków"}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <span className="text-slate-500">Grubość:</span>
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
        {/* Długości odcinków obok grubości, bo to ta sama sprawa: poprawianie
            wymiarów ściany JUŻ NARYSOWANEJ, gdy pomyłka wyszła później. */}
        <DlugosciOdcinkowSciany
          punkty={w.points}
          mpu={mpu}
          onPrzesunPunkt={(index, punkt) => moveWallPoint(w.id, index, punkt)}
        />
        <div className="flex flex-wrap gap-1.5">
          {petla && (
            <button onClick={() => createRoomFromWall(w.id)} className={przycisk}>
              <Layers size={13} /> Utwórz pomieszczenie z obrysu
            </button>
          )}
          <button onClick={zaznaczenie.usunZaznaczone} className={`${przycisk} text-red-600`}>
            <Trash2 size={13} /> Usuń ścianę
          </button>
        </div>
      </div>
    );
  })();

  /**
   * Treść kontrolek kontekstowych w zadanym zakresie.
   *
   * W pełnym ekranie na szerokim oknie część ZAZNACZENIA (przełącznik „Zaznacz kilka",
   * operacje na grupie, karta ściany, trasa, szerokość otworu) idzie do panelu obok
   * paska — tam, gdzie karta elementu — a pigułka nad rzutem zostaje dla RYSOWANIA
   * (grubość ściany, kształt pomieszczenia, otwory, kalibracja). Dotąd karta ściany
   * pływała nad rzutem i zasłaniała okolicę zaznaczonej ściany, a karta elementu stała
   * w schowanym panelu — dwa różne miejsca na to samo.
   */
  const trescKontekstu = (zakres: "wszystko" | "zaznaczenie" | "rysowanie") => (
    <>
      {zakres !== "rysowanie" && (
      <>
      {/* Zatrzaśnięty Shift — jedyna droga do zaznaczenia wielokrotnego bez klawiatury
          i bez myszy (patrz `zaznaczanieWielokrotne`). Stoi NAD listą operacji na
          zaznaczeniu, bo to on je odblokowuje: najpierw się zaznacza, potem wyrównuje. */}
      {toolMode === "zaznacz" && elements.length > 0 && (
        <button
          data-testid="zaznacz-kilka"
          onClick={() => setZaznaczanieWielokrotne((v) => !v)}
          aria-pressed={zaznaczanieWielokrotne}
          title="Kolejne kliknięcia dokładają elementy do zaznaczenia — to samo co Shift z kliknięciem"
          className="pe-btn-ghost flex items-center gap-1.5 px-2.5 py-1 text-xs"
          style={zaznaczanieWielokrotne ? { background: "#C1793F14", color: "#8A5526", fontWeight: 600 } : undefined}
        >
          <CopyCheck size={13} /> Zaznacz kilka
        </button>
      )}

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
            <button onClick={zaznaczenie.usunZaznaczone} className="pe-btn-ghost flex items-center gap-1 px-2.5 py-1 text-xs text-red-600">
              <Trash2 size={13} /> Usuń zaznaczone ({multiSelected.length})
            </button>
          </div>

          <span className="text-[11px] text-slate-400">Strzałki przesuwają o 1 jedn., z Shiftem o kratkę.</span>
        </div>
      )}

      </>
      )}
      {zakres !== "zaznaczenie" && (
      <>
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
              value={thicknessToDisplay(sciany.wallThickness)}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v) && v > 0) sciany.setWallThickness(thicknessFromDisplay(v));
              }}
              className="w-16 rounded border border-border px-1.5 py-0.5"
            />
            {mpu !== null ? "cm" : "jedn."}
          </label>
          <label className="flex items-center gap-1.5 text-slate-500">
            <input
              data-testid="wall-ortho-checkbox"
              type="checkbox"
              checked={sciany.orthoWalls}
              onChange={(e) => sciany.setOrthoWalls(e.target.checked)}
            />
            Ortogonalnie (kąty proste)
          </label>
        </div>
      )}

      {sciany.drawingWall.length > 0 && (
        // Zawijany: na telefonie ten wiersz stoi w nakładce szerokiej na ekran i przy
        // `flex-nowrap` „Zakończ" i „Anuluj" wychodziły poza prawą krawędź.
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm">
          <span className="whitespace-nowrap font-medium text-slate-600">Rysowanie ściany: {sciany.drawingWall.length} pkt.</span>
          <PoleDlugosciOdcinka
            punkty={sciany.drawingWall}
            mpu={mpu}
            onZmiana={sciany.setDrawingWall}
            testId="wall-segment-length-input"
          />
          <button onClick={sciany.finishWall} className="pe-btn-ghost shrink-0 px-2.5 py-1 text-sm">Zakończ</button>
          <button onClick={() => sciany.setDrawingWall([])} className="pe-btn-ghost shrink-0 px-2.5 py-1 text-sm">Anuluj</button>
        </div>
      )}

      </>
      )}
      {zakres !== "rysowanie" && (
      <>
      {/* Grubość JUŻ ZAPISANEJ ściany — edytowalna tylko w trybie „zaznacz", tak jak
          uchwyty narożników w DesignCanvas (w trybie „ściany" klik dokłada nowy punkt). */}
      {/* Karta zaznaczonej ściany stoi TU (pigułka nad rzutem) na telefonie i w pełnym
          ekranie; w zwykłym widoku na szerokim ekranie — w panelu obok, jak karta
          elementu. Jedno miejsce naraz, żeby nie było dwóch pól grubości. */}
      {(!szerokieOkno || pelnyEkran) && kartaSciany}
      {/* Zaznaczona trasa przewodu — podpowiedź jak ją edytować (PPM / przytrzymanie
          → „Dodaj punkt", przeciągnięcie uchwytu go przesuwa, dwuklik na uchwycie kasuje,
          dwuklik na trasie pokazuje informacje o przewodzie)
          i przycisk powrotu do routingu automatycznego, widoczny tylko gdy trasa
          FAKTYCZNIE ma ręczną poprawkę — inaczej wisiałby bez sensu przy każdej
          jeszcze nietkniętej trasie. */}
      {selected?.kind === "route" && toolMode === "zaznacz" && (
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span>
            {!szerokieOkno
              ? "Trasa: przytrzymaj palec → „Dodaj punkt”, przeciągnij uchwyt, stuknij dwa razy w uchwyt, żeby go skasować, a w trasę — żeby zobaczyć informacje."
              : "Trasa: PPM → „Dodaj punkt”, przeciągnij uchwyt, dwuklik na uchwycie go kasuje, dwuklik na trasie pokazuje informacje."}
          </span>
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
      </>
      )}
      {zakres !== "zaznaczenie" && (
      <>
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
                onClick={() => otwory.setOpeningKind(id)}
                className="rounded-md px-2.5 py-1 text-xs"
                style={otwory.openingKind === id ? { background: "#C1793F14", color: "#8A5526", fontWeight: 600 } : { color: "#4F5D73" }}
              >
                {label}
              </button>
            ))}
          </div>
          <span className="min-w-0 basis-full text-slate-500">
            {/* Na szerokim ekranie to samo zdanie stoi już w nagłówku panelu tuż nad tą
                ramką (patrz `NaglowekNarzedzia`). Na telefonie ramka pływa nad rzutem,
                a panel z nagłówkiem bywa zwinięty — tam zdanie jest potrzebne. */}
            {!szerokieOkno && (
              <>Kliknij ścianę albo krawędź pomieszczenia, żeby wstawić tam {otwory.openingKind === "okno" ? "okno" : "drzwi"}. </>
            )}
            Szerokość poprawisz po zaznaczeniu otworu.
          </span>
        </div>
      )}

      </>
      )}
      {zakres !== "rysowanie" && (
      <>
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
                if (Number.isFinite(v) && v > 0) otwory.ustawSzerokosc(o.id, thicknessFromDisplay(v));
              }}
              className="w-16 rounded border border-border px-1.5 py-0.5"
            />
            {mpu !== null ? "cm" : "jedn."}
          </div>
        );
      })()}

      </>
      )}
      {zakres !== "zaznaczenie" && (
      <>
      {/* Wybór sposobu rysowania pojawia się dopiero po wejściu w tryb „Pomieszczenie" —
          poza nim byłby tylko szumem w pasku narzędzi.

          Na telefonie znika też na czas RYSOWANIA (postawiony narożnik albo punkty
          wieloboku). Nakładka pływa wtedy nad rzutem i każdy jej wiersz zasłania miejsce,
          w które trzeba kliknąć — z wyborem kształtu, podpowiedzią, komunikatem
          i polami wymiarów zajmowała 45% płótna (audyt 5.11.2026). Zmiana kształtu
          w połowie figury i tak zaczyna rysowanie od nowa, a „Anuluj" stoi niżej. */}
      {toolMode === "pomieszczenie" && (szerokieOkno || pokoje.drawingRoomPoints.length === 0) && (
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
          <span className="font-medium text-slate-600">Kształt:</span>
          <div className="flex items-center gap-1 rounded-lg border border-border bg-white p-0.5">
            {ROOM_MODES.map(({ id, label, hint }) => (
              <button
                key={id}
                onClick={() => {
                  pokoje.ustawTryb(id);
                }}
                title={hint}
                className="rounded-md px-2.5 py-1 text-sm"
                style={pokoje.roomMode === id ? { background: "#C1793F14", color: "#8A5526", fontWeight: 600 } : { color: "#4F5D73" }}
              >
                {label}
              </button>
            ))}
          </div>
          {/* Ten sam przełącznik co przy ścianach i ta sama zmienna — kąty proste to
              cecha RYSUNKU, nie jednego narzędzia. Wcześniej ściany miały wymuszanie
              kątów, a pomieszczenia nie, choć rysuje się nimi ten sam budynek.
              Przy prostokącie ukryty: ten tryb i tak daje kąty proste z definicji,
              więc przełącznik bez skutku tylko kazałby szukać różnicy. */}
          {pokoje.roomMode === "wielobok" && (
            <label className="flex items-center gap-1.5 text-slate-500">
              <input
                data-testid="room-ortho-checkbox"
                type="checkbox"
                checked={sciany.orthoWalls}
                onChange={(e) => sciany.setOrthoWalls(e.target.checked)}
              />
              Ortogonalnie (kąty proste)
            </label>
          )}
          <span className="min-w-0 basis-full text-slate-500">{ROOM_MODES.find((m) => m.id === pokoje.roomMode)!.hint}</span>
        </div>
      )}
      {/* Prostokąt używa tej samej tablicy punktów na kotwicę pierwszego kliknięcia
          (patrz `rectAnchor` w DesignCanvas), ale komunikat musi być jego własny:
          „1 pkt." i podpowiedź o zamykaniu figury dotyczą wieloboku i przy
          prostokącie tylko wprowadzałyby w błąd. „Anuluj" jest wspólne — kasuje
          kotwicę tak samo jak zaczęty wielobok. */}
      {pokoje.drawingRoomPoints.length > 0 && (
        // Zawijany — ten sam powód co przy rysowaniu ściany wyżej.
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm">
          {/* Bez `whitespace-nowrap`: na 320 px „…kliknij przeciwległy" było ucinane
              krawędzią nakładki. */}
          <span className="min-w-0 font-medium text-slate-600">
            {pokoje.roomMode === "prostokat" ? (
              "Narożnik postawiony — kliknij przeciwległy"
            ) : (
              <>
                {pokoje.drawingRoomPoints.length} pkt.
                {pokoje.drawingRoomPoints.length >= 3 && " — kliknij w pierwszy punkt, aby zamknąć"}
              </>
            )}
          </span>
          {/* Prostokąt dostaje WYMIARY, wielobok — długość ostatniego odcinka.
              Różnica nie jest kaprysem: prostokąt nie ma „ostatniego odcinka", bo
              powstaje jednym pociągnięciem między dwoma narożnikami. */}
          {pokoje.roomMode === "prostokat" && (
            <PoleWymiarowProstokata
              kotwica={pokoje.drawingRoomPoints[0]}
              mpu={mpu}
              planSize={planSize}
              onUtworz={(punkty) => {
                pokoje.zaproponuj(punkty);
                pokoje.porzucSzkic();
              }}
            />
          )}
          {pokoje.roomMode === "wielobok" && (
            <PoleDlugosciOdcinka
              punkty={pokoje.drawingRoomPoints}
              mpu={mpu}
              onZmiana={pokoje.setDrawingRoomPoints}
              testId="room-segment-length-input"
            />
          )}
          {pokoje.roomMode === "wielobok" && pokoje.drawingRoomPoints.length >= 3 && (
            <button onClick={pokoje.zakonczRysowanie} className="pe-btn-ghost shrink-0 px-2.5 py-1 text-sm">Zakończ</button>
          )}
          <button onClick={() => pokoje.setDrawingRoomPoints([])} className="pe-btn-ghost shrink-0 px-2.5 py-1 text-sm">Anuluj</button>
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
            setSkalaPotwierdzenie(`Skala ustawiona: oczko siatki = ${formatLiczba(oczkoSiatkiM(metersPerUnit, zoom), 2)} m`);
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

      {/* Propozycja tuż po domknięciu obrysu murem — patrz `petlaDoNazwania`.
          Widoczność jest WYLICZANA, nie gaszona ręcznie: pętla, która dostała już
          pomieszczenie, wypada z `petleBezPomieszczenia` i propozycja znika sama,
          niezależnie od tego, którędy pokój powstał. */}
      {propozycjaPokoju && (
        // Kolumna, nie wiersz: w widoku standardowym pigułka stoi w WĄSKIM panelu
        // bocznym (patrz oba miejsca renderowania `kontekstoweTresc`), gdzie zdanie
        // obok przycisku łamie się na trzy linijki i rozpycha panel.
        <div className="flex min-w-0 flex-col items-start gap-1.5">
          <span className="text-xs font-medium text-slate-600">Obrys zamknięty</span>
          <button
            onClick={() => createRoomFromWall(propozycjaPokoju.wall.id)}
            className="pe-btn-copper flex items-center gap-1.5 px-2.5 py-1 text-xs"
          >
            <Layers size={13} /> Zrób z niego pomieszczenie
          </button>
          <button
            onClick={() => setPetlaDoNazwania(null)}
            className="text-[11px] text-slate-400 underline hover:text-slate-600"
            aria-label="Odrzuć propozycję pomieszczenia"
          >
            Nie teraz
          </button>
        </div>
      )}
      </>
      )}
    </>
  );
  const kontekstoweTresc = trescKontekstu("wszystko");

  return (
    // Na ekranie startowym zakładka sięga po CAŁĄ wolną wysokość okna (rodzic jest
    // rozciągliwą kolumną — patrz App.tsx), żeby powitanie wypełniło ekran zamiast
    // wisieć wąskim paskiem u góry. W pozostałych stanach zakładka jest i tak wyższa
    // niż okno, więc rozciąganie nic by nie dało — zostaje zwykły blok.
    <div className={showEntryScreen ? "flex flex-1 flex-col space-y-4" : "space-y-4"} ref={korzenZakladkiRef}>
      {/* Zamontowany ZAWSZE, niezależnie od tego, który ekran jest aktywny (edytor,
          weryfikacja detekcji, błąd wczytania) — inaczej `fileRef.current` bywał
          `null` akurat wtedy, gdy „Wgraj inny plik" na ekranie weryfikacji/błędu
          próbował go kliknąć, bo sam input mieszkał w kolumnie edytora, ukrytej
          podczas weryfikacji. */}
      <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={handleBgFile} />

      {/* POZA blokiem `showEntryScreen` niżej, celowo: wybór karty wczytuje projekt,
          ekran startowy natychmiast znika, więc okno osadzone w jego bloku
          odmontowałoby się w połowie własnej akcji (patrz komentarz w `WyborPrzykladu`).
          Stoi tu, obok `fileRef`, z tego samego powodu co on — zamontowane ZAWSZE. */}
      <WyborPrzykladu open={wyborPrzykladu} onOpenChange={setWyborPrzykladu} />

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
            {roomsFixedOnLoad === 1 ? "elementu" : "elementów"} do pomieszczeń — zapis nie zgadzał się z tym, gdzie
            stoją na planie. Sprawdź obwody w Rozdzielnicy.
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
          trwałego wyciszenia, bo ryzyko nie znika, dopóki nie założy konta.
          NIE dotyczy projektu PRZYKŁADOWEGO: nie ma tam czego stracić (dane siedzą
          w kodzie aplikacji i wczytują się jednym kliknięciem z powrotem), a ostrzeżenie
          o utracie pracy pod cudzym mieszkaniem jest po prostu nieprawdziwe. */}
      {!session && !projektPrzykladowy && (elements.length > 0 || walls.length > 0 || roomShapes.length > 0 || !!bgImageUrl) && (
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
          `kontoPromptOdrzucony`), żeby nie przypominać o tym samym w kółko.
          Na przykładzie zgaszony z tego samego powodu co baner wyżej — a do tego
          jego próg (>10 elementów) przykład przekracza od pierwszej sekundy, więc
          bez tej straży „włożyłeś już sporo pracy" witałoby kogoś, kto nie włożył
          w ten projekt ani jednego kliknięcia. */}
      {!session && !kontoPromptOdrzucony && !projektPrzykladowy && elements.length > KONTO_PROMPT_PROG_ELEMENTOW && (
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
        // `flex-1` + `justify-center`: karta rośnie na całą wolną wysokość, a jej treść
        // stoi w pionowym środku. Sama treść jest ta sama co wcześniej — problemem był
        // wyłącznie pas gołego tła pod spodem, nie to, co na karcie stoi.
        <div className="pe-card flex flex-1 flex-col items-center justify-center gap-4 px-6 py-12 text-center">
          {/* Nagłówek mówi, co ta aplikacja ROBI, a nie co użytkownik ma kliknąć.
              Poprzednie „Zacznij projektować instalację" było poleceniem wydanym
              komuś, kto jeszcze nie wie, gdzie trafił — a jedyne zdanie tłumaczące
              aplikację stoi na tej stronie jako hasło 12,5 px pod logo. */}
          <h2 className="pe-display text-xl">Zaprojektuj instalację elektryczną w swoim domu</h2>
          <p className="max-w-lg text-sm text-slate-500">
            Rozstaw gniazdka i oświetlenie na rzucie mieszkania. Rozdzielnica, schemat jednokreskowy
            i kosztorys policzą się z tego same.
          </p>

          {/* Obietnica przed instrukcją — patrz `CoPowstanie`. */}
          <div className="my-1 w-full max-w-2xl border-y border-border py-4">
            <CoPowstanie />
          </div>

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

          {/* TRZECIA droga: nie robić nic i zobaczyć gotowy wynik. Stoi OSOBNO, pod
              dwiema pozostałymi i lżejszym stylem, bo to nie jest sposób na zaczęcie
              własnego projektu — tylko odpowiedź na pytanie „co ta strona w ogóle
              robi", którego dwa przyciski wyżej nie adresują wcale. Kto ma rzut pod
              ręką, ma nad nim kliknąć dalej. */}
          <button
            onClick={() => setWyborPrzykladu(true)}
            className="flex items-center gap-1.5 text-sm font-medium text-blueprint underline-offset-2 hover:underline [@media(pointer:coarse)]:min-h-8"
          >
            <Eye size={15} /> Zobacz gotowy przykład
          </button>

          {/* Dwa drobne wyjścia obok siebie, oba drugorzędne wobec trzech dróg startu
              wyżej. „Jak to działa" otwiera to samo okno co „Pomoc" w nagłówku — sześć
              kroków od rzutu po kosztorys, skróty klawiszowe i zastrzeżenie o SEP.
              Treść jest dobra i istnieje od dawna, tylko wisiała za małym, szarym
              linkiem w pasku narzędzi nad przepływem, czyli dokładnie tam, gdzie NIE
              zagląda ktoś, kto właśnie wszedł i nie wie, od czego zacząć. Tu stoi
              w miejscu, w którym to pytanie realnie pada.
              Kolejność: najpierw pomoc (odpowiedź), potem pominięcie (rezygnacja). */}
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs">
            <button onClick={onOpenPomoc} className="flex items-center gap-1 text-slate-500 underline hover:text-copper [@media(pointer:coarse)]:min-h-8">
              <HelpCircle size={13} /> Nie wiesz, od czego zacząć? Zobacz, jak to działa
            </button>
            <button onClick={onboarding.dismissEntryScreen} className="text-slate-400 underline hover:text-slate-600 [@media(pointer:coarse)]:min-h-8">
              Pomiń — zacznę na pustym planie
            </button>
          </div>
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
          propozycja podkładu dotyczy STARTU, a po nim jest już tylko szumem.
          I zgaszony, gdy użytkownik wybrał drugą drogę startu („Narysuj dom
          samodzielnie", `manualDrawingChosen`) — sam ten wybór nie tworzy jeszcze ani
          ściany, ani pomieszczenia, więc `kondygnacjaPusta` zostaje prawdziwe i baner
          wstawał NATYCHMIAST po kliknięciu, ponawiając pytanie, na które użytkownik
          właśnie odpowiedział. „Wgraj podkład" zostaje w pasku narzędzi, więc nikomu
          niczego to nie zamyka. */}
      {!bgImageUrl && !showEntryScreen && kondygnacjaPusta && !onboarding.manualDrawingChosen && (
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
            poWgraniuPodkladu();
          }}
          onPomin={() => {
            wgrywanie.pominPrzyciecie();
            poWgraniuPodkladu();
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
        build={async () => (await zbudujDokumentRzutu()).finish()}
        wariant={trasyWPdf ? "z-trasami" : "bez-tras"}
        opcje={
          <label className="flex items-center gap-2 text-[13px] text-slate-600">
            <input
              type="checkbox"
              checked={trasyWPdf}
              onChange={(e) => setTrasyWPdf(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            Trasy przewodów na rysunku
          </label>
        }
      />

      <EditorToolbar
        zoomStandardowy={zoomSkaliRysowania(mpu)}
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
        showAreas={showAreas}
        onToggleAreas={() => setShowAreas((a) => !a)}
        showHeights={showHeights}
        onToggleHeights={() => setShowHeights((h) => !h)}
        showUnderlay={showUnderlay}
        onToggleUnderlay={idPonizej ? () => setShowUnderlay((u) => !u) : null}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={undo}
        onRedo={redo}
        zoom={zoom}
        onGrupaZoomuRef={setGrupaZoomu}
        wskazZoom={coachMark === "nawigacja"}
        onZoomChange={(z) => {
          setZoomReczny(true);
          setZoom(z);
          oznaczUmiejetnoscNawigacji();
        }}
        onDopasuj={dopasujWidok}
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
          {/* Na szerokim oknie opcje zaznaczenia są w panelu — tu tylko rysowanie. */}
          {szerokieOkno ? trescKontekstu("rysowanie") : kontekstoweTresc}
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
          // Uchwyt dla testów: wcześniej celowały w tę kartę zestawem klas układu
          // (`div.flex.shrink-0.overflow-hidden.rounded-card`), więc pierwsza zmiana
          // responsywności — zdjęcie `shrink-0` na wąskim ekranie — wywracała test,
          // który z tą zmianą nie miał nic wspólnego.
          data-testid="karta-narzedzi"
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
              : /**
                 * KOLUMNA na telefonie, RZĄD od 768 px w górę.
                 *
                 * Rzędem była zawsze — a poniżej `md` pasek narzędzi jest POZIOMY (patrz
                 * `pionowo` w ToolRail), więc obie rzeczy biły się o tę samą szerokość:
                 * zmierzone przy 375 px pasek brał 172 px, a panelowi zostawało 137 px
                 * z 268 px, których potrzebuje. Nazwy elementów były ucięte w połowie,
                 * a wybór liczby gniazd i „Dedykowane (AGD)" wychodziły poza kadr — czyli
                 * treść była NIEOSIĄGALNA, nie tylko brzydka.
                 *
                 * Poziomy pasek nad panelem to zresztą to, co opisuje sam ToolRail
                 * („w zwykłym widoku stoi nad planem, w poprzek") — tylko że stał obok.
                 */
                "flex min-w-0 flex-col overflow-hidden rounded-card border border-border bg-white md:flex-row md:shrink-0"
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
              : /**
                 * Karta kończy się tam, gdzie płótno obok niej.
                 *
                 * Bez tego kolumna rosła do wysokości swojej TREŚCI — zmierzone 820 px
                 * przy płótnie wysokim na 595 — i to ona, a nie rysunek, decydowała
                 * o wysokości strony: przy oknie 1440×900 dokument miał 1233 px, więc
                 * rysowanie odbywało się na stronie, która się przewija, a stopka
                 * wisiała 240 px pod krawędzią okna.
                 *
                 * `md:` w klasach niżej: na telefonie kolumna stoi NAD rysunkiem, a nie
                 * obok niego, więc nie ma czego równać — tam wysokość zostaje z treści.
                 */
                { height: szerokieOkno ? wysPlotna : undefined }
          }
        >
          {/* Pinezka w rogu karty, na tle, żeby nie zlewała się z zawartością panelu. */}
          {pelnyEkran && <Pinezka klasa="absolute right-1 top-1 z-10 bg-white/90" />}

          {/* Jawne ZAMKNIJ obok pinezki — jedyna droga schowania karty na DOTYKU.
              Odsłania ją uchwyt przy krawędzi (jest przyciskiem, więc palec go otwiera),
              ale chowa ją dotąd wyłącznie `mousemove` poza jej obrys albo `mouseleave`
              kontenera — a palec nie wysyła ani jednego, ani drugiego. Na telefonie
              karta zostawała więc otwarta na dobre, zasłaniając rysunek.

              Tylko gdy karta jest odsłonięta i NIEPRZYPIĘTA: przypięta ma zostać
              z definicji, a jej pinezka obok i tak jest sposobem na zmianę zdania. */}
          {pelnyEkran && widocznaLewa && !przypietyPanel && (
            <button
              onClick={() => {
                setChromeLewo(false);
                // Panel wysunięty przez zaznaczenie schowa się dopiero razem z nim.
                if (zaznaczenieWysuwaPanel) zaznaczenie.wyczysc();
              }}
              title="Schowaj narzędzia — wrócą uchwytem przy krawędzi"
              aria-label="Schowaj narzędzia rysowania"
              className="absolute right-1 top-8 z-10 rounded bg-white/90 p-1 text-slate-300 transition-colors hover:text-slate-500"
            >
              <X size={13} />
            </button>
          )}
          <ToolRail
          value={toolMode}
          onToolRef={(id, el) => {
            if (id === "skala") scaleToolRef.current = el;
            if (id === "sciany") wallToolRef.current = el;
          }}
          onChange={selectTool}
          // W pełnym ekranie karta jest przyklejona do LEWEJ krawędzi okna, więc pasek
          // narzędzi musi być pionowy niezależnie od szerokości ekranu — patrz `pionowo`.
          pionowo={pelnyEkran}
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
            // Uchwyt idzie za układem karty: na telefonie jest poziomą listwą MIĘDZY
            // paskiem narzędzi a panelem pod nim, na monitorze — pionową kreską obok.
            // Strzałka obraca się razem z nim, bo „w prawo" nad panelem nic nie znaczy.
            //
            // W PEŁNYM EKRANIE karta jest rzędem także na telefonie (pasek narzędzi stoi
            // pionowo przy lewej krawędzi), więc uchwyt ma być pionową kreską zawsze.
            // Pozioma listwa `w-full` rozpychała tam rząd: zmierzone 340 px uchwytu
            // na ekranie 375 px, a treść panelu (katalog, opcje, karty) zaczynała się
            // na x=406 — poza ekranem.
            className={`flex shrink-0 items-center justify-center rounded-sm border border-border bg-white text-slate-400 transition-colors hover:bg-slate-50 hover:text-copper ${
              pelnyEkran ? "h-14 w-4 self-center" : "h-6 w-full md:h-14 md:w-4 md:self-center"
            }`}
          >
            {panelZwiniety ? (
              <>
                <ChevronDown size={13} className={pelnyEkran ? "hidden" : "md:hidden"} />
                <ChevronRight size={13} className={pelnyEkran ? "block" : "hidden md:block"} />
              </>
            ) : (
              <>
                <ChevronUp size={13} className={pelnyEkran ? "hidden" : "md:hidden"} />
                <ChevronLeft size={13} className={pelnyEkran ? "block" : "hidden md:block"} />
              </>
            )}
          </button>

          {/* W pełnym ekranie panel NIE przewija się sam — jest kolumną o pełnej
              wysokości, a przewijanie oddaje liście elementów w środku. Wcześniej
              przewijały się oba naraz i pokazywały dwa suwaki obok siebie. */}
          {!panelZwiniety && (
          <div
            /**
             * W pełnym ekranie panel NIE przewija się sam — jest kolumną o pełnej
             * wysokości, a przewijanie oddaje liście elementów w środku (dwa suwaki
             * obok siebie były pierwszym, co rzucało się w oczy po wysunięciu narzędzi).
             *
             * W widoku zwykłym przewija się, bo od tej zmiany kolumna ma wysokość
             * PŁÓTNA obok (patrz styl karty wyżej). Cokolwiek się w niej nie mieści —
             * lista pod kartą przewodnika, długi spis pomieszczeń — ma dać się
             * doscrollować TU, zamiast rozpychać całą stronę i wynosić rysunek z oczu.
             */
            /**
             * 268 px dopiero od `md` w górę — na telefonie panel bierze CAŁĄ szerokość
             * karty, bo stoi wtedy POD paskiem narzędzi, a nie obok niego (patrz układ
             * karty wyżej). Sztywne 268 px w rzędzie o szerokości 327 px kończyło się
             * ścięciem treści.
             *
             * Ramka też idzie za układem: w kolumnie oddziela GÓRA (`border-t`),
             * w rzędzie — lewa krawędź.
             */
            className={
              pelnyEkran
                ? "flex min-h-0 w-[268px] flex-col overflow-hidden border-l border-border p-2"
                : // `max-h-[55vh]` na telefonie: rozwinięty panel ma być SKRZYNKĄ, a nie
                  // kolumną bez końca. Po rozłożeniu go na całą szerokość karty urósł do
                  // 768 px i zepchnął rysunek jeszcze niżej, niż stał przedtem — a to on
                  // jest tematem tej zakładki. Przewijanie i tak ma w środku.
                  "pe-bez-suwaka flex max-h-[55vh] min-h-0 w-full flex-col overflow-y-auto border-t border-border p-2 md:max-h-none md:w-[268px] md:border-l md:border-t-0"
            }
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
          {/* Na telefonie te same kontrolki pływają nad płótnem — patrz nakładka przy
              `DesignCanvas`. Tylko w JEDNYM miejscu naraz: dwie kopie dawałyby dwa
              przyciski „Zakończ" o tej samej nazwie. */}
          <NaglowekNarzedzia narzedzie={toolMode} />
          {szerokieOkno && kontekstoweAktywne && (
            // `flex-col`, nie `flex-wrap` jak w wersji pełnoekranowej: tam pigułka ma
            // całą szerokość okna i bloki spokojnie stoją obok siebie, tu kolumna ma
            // 268 px, więc każdy blok dostaje własny wiersz. `min-w-0` na kontenerze
            // pozwala długim podpowiedziom („przytrzymaj lewy przycisk i przeciągnij")
            // zawinąć się wewnątrz zamiast wypychać treść poza panel.
            //
            // W pełnym ekranie — tylko część ZAZNACZENIA; rysowanie zostaje w pigułce nad
            // rzutem (patrz `trescKontekstu`). `empty:hidden`: bez zaznaczenia i na
            // pustej kondygnacji (bez „Zaznacz kilka") ramka nie ma czego pokazać.
            <div className="mb-2 flex min-w-0 flex-col items-start gap-2 rounded-card border border-copper/40 bg-[#FDF6EF] px-2.5 py-2 text-left shadow-sm empty:hidden">
              {pelnyEkran ? trescKontekstu("zaznaczenie") : kontekstoweTresc}
            </div>
          )}

          {/* Treść panelu idzie za WYBRANYM NARZĘDZIEM — patrz `NaglowekNarzedzia`.
              Dotąd stały tu zawsze zakładki „Elementy / Pomieszczenia", więc przy
              drzwiach, przesuwaniu widoku czy kalibracji pod ich opcjami wisiał katalog
              od poprzedniego wyboru. Narzędzia, których opcje to same kontrolki
              kontekstowe (ściany, drzwi i okna, kalibracja), nie mają tu nic więcej. */}
          {toolMode === "elementy" ? (
            <ElementLibrary
              wypelnijWysokosc={pelnyEkran}
              goraKarty={goraPrzewodnika}
              activeType={wstawianie.activeType}
              onPick={(type) => {
                wstawianie.setActiveType(type);
                setToolMode("elementy");
                if (!szerokieOkno && !pelnyEkran) {
                  setPanelZwiniety(true);
                  window.requestAnimationFrame(() => pelnyEkranRef.current?.scrollIntoView({ block: "start" }));
                }
              }}
              gangs={wstawianie.gangsForType(wstawianie.activeType)}
              onSetGangs={wstawianie.ustawGangs}
              dedicated={wstawianie.dedicated}
              onToggleDedicated={wstawianie.setDedicated}
            />
          ) : toolMode === "pomieszczenie" ? (
            <div className="flex min-h-0 flex-1 flex-col gap-1.5">
              <div className="px-0.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400" data-testid="liczba-pomieszczen">
                Pomieszczenia ({roomShapes.length})
              </div>
              {/* Przewija się sama LISTA — przy kilkunastu pomieszczeniach inaczej
                  wypychałaby kontrolki kształtu nad nią poza kolumnę. */}
              <div className="pe-bez-suwaka min-h-0 flex-1 overflow-y-auto pr-1">
                <RoomPanel roomShapes={roomShapes} metersPerUnit={mpu} onCreateWall={sciany.createWallFromRoom} />
              </div>
            </div>
          ) : toolMode === "pan" ? (
            <PodpowiedzPrzesun naDotyku={naDotyku} />
          ) : toolMode === "zaznacz" && !selected && multiSelected.length === 0 ? (
            <PodpowiedzZaznacz
              pustaKondygnacja={roomShapes.length === 0 && elements.length === 0 && walls.length === 0}
              naDotyku={naDotyku}
              onWybierz={selectTool}
            />
          ) : toolMode === "zaznacz" && selected?.kind === "el" && multiSelected.length === 0 ? (
            (() => {
              const el = elements.find((e) => e.id === selected.id);
              if (!el) return null;
              return (
                <KartaElementu
                  element={el}
                  uzyteNumery={uzyteNumeryObwodow}
                  onEdytuj={() => setEditingId(el.id)}
                  onObroc={() => rotateElements([el.id])}
                  onUsun={() => {
                    removeElements([el.id]);
                    setSelected(null);
                  }}
                  onObwod={(n) => przypiszObwod([el.id], n)}
                />
              );
            })()
          ) : kartaSciany && szerokieOkno && !pelnyEkran ? (
            kartaSciany
          ) : toolMode === "zaznacz" && selected?.kind === "room" && multiSelected.length === 0 ? (
            (() => {
              const pokoj = roomShapes.find((r) => r.id === selected.id);
              if (!pokoj) return null;
              // Karta zaznaczonego pomieszczenia — ten sam wiersz co na liście w
              // „Narysuj pomieszczenie", tu z podpisanymi akcjami (patrz `WierszPomieszczenia`).
              return (
                <div className="space-y-1.5" data-testid="karta-pomieszczenia">
                  <div className="text-sm font-semibold text-ink">Pomieszczenie</div>
                  <WierszPomieszczenia
                    key={pokoj.id}
                    room={pokoj}
                    metersPerUnit={mpu}
                    onCreateWall={sciany.createWallFromRoom}
                    podpisy
                    onUsuniete={() => setSelected(null)}
                  />
                </div>
              );
            })()
          ) : null}
          </div>
          )}
        </div>

        <div
          ref={kolumnaPlotnaRef}
          // `min-w-0` poniżej `md`: sztywne 320 px nie mieściło się obok paska
          // narzędzi na ekranie 375 px i rozpychało stronę w poziomie. Płótno i tak
          // dopasowuje powiększenie do szerokości kolumny (patrz `dopasujZoom`), więc
          // węższa kolumna daje mniejszy, ale CAŁY rzut zamiast wystającego kadru.
          // `relative`: komunikat „przytrzymaj Ctrl" pływa NAD płótnem i liczy pozycję
          // od tej kolumny — bez niej uciekłby do najbliższego przodka z pozycją, czyli
          // gdzieś na stronę.
          className={pelnyEkran ? "relative h-full w-full p-2" : "relative min-w-0 md:min-w-[320px]"}
          // Podstawa 320 px = `md:min-w-[320px]` wyżej. Dawne 480 px (z pierwszego commita,
          // bez uzasadnienia) nie mieściło się obok karty narzędzi (343 px) na tablecie
          // w pionie: przy 768–850 px płótno zawijało się POD kartę, na 861 px od góry
          // i w dolnej granicy wysokości, a obok karty zostawała pustka.
          style={pelnyEkran ? undefined : { flex: "1 1 320px" }}
        >
          {/* Podpowiedź o pełnym ekranie stoi TU, tuż nad płótnem, którego dotyczy —
              i tylko poza pełnym ekranem, gdzie byłaby zaprzeczeniem samej siebie.
              O wąskim ekranie decyduje `sm:hidden` w samym komponencie. */}
          {/* Komunikat o `Ctrl` — nad płótnem, bo dotyczy gestu robionego właśnie na nim. */}
          <PodpowiedzKolka sygnal={sygnalKolka} />
          {/* `relative` dla nakładki kontrolek na telefonie — liczy się od PŁÓTNA, nie od
              całej kolumny (pod płótnem stoi jeszcze pasek stanu). */}
          <div className="relative">
          {/* Kontrolki bieżącego narzędzia na TELEFONIE: nakładka przy dolnej krawędzi
              rzutu, nie treść nad nim. Każda treść nad płótnem, która pojawia się
              w trakcie rysowania, przesuwa płótno pod palcem — a na telefonie panel
              stoi właśnie nad płótnem. Na monitorze kontrolki są w panelu obok rzutu. */}
          {!pelnyEkran && !szerokieOkno && (kontekstoweAktywne || pigulkaWstawiania) && (
            <div
              data-testid="kontrolki-narzedzia"
              className="pe-bez-suwaka absolute inset-x-2 bottom-2 z-20 flex max-h-[45%] min-w-0 flex-wrap items-center gap-2 overflow-y-auto rounded-card border border-copper/40 bg-[#FDF6EF]/95 px-2.5 py-2 text-left shadow-lg empty:hidden"
            >
              {kontekstoweAktywne && kontekstoweTresc}
              {pigulkaWstawiania}
            </div>
          )}
          <DesignCanvas
            stageRef={stageRef}
            anulujPodgladRef={anulujPodgladRef}
            elements={elements}
            walls={walls}
            roomShapes={roomShapes}
            openings={openings}
            toolMode={toolMode}
            roomMode={pokoje.roomMode}
            snapOn={snapOn}
            gridOn={gridOn}
            selected={selected}
            multiSelected={multiSelected}
            drawingWall={sciany.drawingWall}
            newWallThickness={sciany.wallThickness}
            ortho={sciany.orthoWalls}
            drawingRoomPoints={pokoje.drawingRoomPoints}
            bgImageUrl={bgImageUrl}
            calibPoints={calibPoints}
            zones={zones}
            podklad={podklad}
            pokazWymiary={showDimensions}
            pokazPowierzchnie={showAreas}
            pokazWysokosci={showHeights}
            cableRoutes={cableRoutes}
            routeOverrides={routeOverrides}
            lightGroups={lightGroups}
            elementScale={skalaOsprzetu}
            sanitaryScale={sanitaryRenderScale(mpu, skalaBezKalibracji)}
            planSize={planSize}
            metersPerUnit={mpu}
            onPointerMove={setCursor}
            zoom={zoom}
            onZoomChange={(z) => {
              setZoomReczny(true);
              setZoom(z);
              oznaczUmiejetnoscNawigacji();
            }}
            onKolkoBezCtrl={zglosKolkoBezCtrl}
            onDopasujWidok={dopasujWidok}
            widokRef={widokRef}
            /* Okno widoku bierze CAŁE dostępne miejsce, zamiast kurczyć się do arkusza
               albo do wgranego rzutu. Dopóki miało rozmiar arkusza, poza arkusz nie dało
               się nawet kliknąć — okno BYŁO rysunkiem. Teraz okno jest wziernikiem:
               podkład leży w nim wyśrodkowany, a rysować można wszędzie, także obok niego.
               Próba przykrojenia okna do rzutu została wycofana: kratka ma sięgać tak
               daleko, jak daleko jest miejsce. */
            rozmiarOkna={{
              // Przed pierwszym pomiarem kolumny — nie szerzej niż ekran. Arkusz
              // (1000 px) przez jedną klatkę rozpychał stronę telefonu do 1024 px,
              // przeglądarka mobilna się na tę chwilę oddalała, a przewinięcie do
              // edytora (patrz `waskiEkran`) gasło razem z powrotem układu.
              w: Math.max(1, dostepnaSzer || szerokoscPrzedPomiarem(planSize.w * zoom)),
              h: Math.max(1, wysPlotna),
            }}
            onSelectElement={(id, shiftKey) => {
              // Shift i przełącznik znaczą DOKŁADNIE to samo — jedna droga, dwa wejścia.
              if (shiftKey || zaznaczanieWielokrotne) {
                // Element zaznaczony wcześniej pojedynczo idzie do grupy razem z nowym —
                // patrz `przelaczWGrupie`.
                const pojedynczy = selected?.kind === "el" ? selected.id : null;
                setMultiSelected((ids) => przelaczWGrupie(ids, pojedynczy, id));
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
            onElementContextMenu={zaznaczenie.menuElementu}
            onWallContextMenu={(id, x, y) => zaznaczenie.menuKontekstowe("wall", id, x, y)}
            onWallDrawContextMenu={zaznaczenie.menuRysowanejSciany}
            onWallClickForOpening={otwory.wstawNaScianie}
            onSelectOpening={(id) => {
              setSelected({ kind: "opening", id });
              setMultiSelected([]);
            }}
            onOpeningContextMenu={otwory.menuKontekstowe}
            onSelectRoom={(id) => {
              setSelected({ kind: "room", id });
              setMultiSelected([]);
            }}
            onRoomEdgeClickForOpening={otwory.wstawNaKrawedziPokoju}
            onRoomContextMenu={(id, x, y) => zaznaczenie.menuKontekstowe("room", id, x, y)}
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
            onRouteContextMenu={(id, x, y, punkt) => zaznaczenie.menuKontekstowe("route", id, x, y, punkt)}
            onRouteInfo={(id, odcinek) => {
              setSelected({ kind: "route", id });
              setMultiSelected([]);
              setInfoTrasy({ id, odcinek });
            }}
            onClearSelection={() => {
              setSelected(null);
              setMultiSelected([]);
            }}
            onMarqueeSelect={(ids) => {
              setMultiSelected(ids);
              setSelected(null);
            }}
            onPlaceElement={wstawianie.wstaw}
            duchElementu={{
              type: wstawianie.activeType,
              gangs: wstawianie.gangsForType(wstawianie.activeType),
              agdLetter: wstawianie.activeType === "wypustAGD" ? "A" : undefined,
              podglad: wstawianie.podglad,
            }}
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
                  /**
                   * Rozsuwanie także po PRZECIĄGNIĘCIU, nie tylko przy stawianiu.
                   *
                   * Bez tego zakaz nakładania się symboli obowiązywał w jedną stronę:
                   * postawić jedno na drugim się nie dało, ale nasunąć ręcznie już tak —
                   * i wracał ten sam problem (spod wierzchniego symbolu nie da się
                   * wyciągnąć tego pod spodem).
                   *
                   * Dopiero po PUSZCZENIU, nie w trakcie ruchu: odpychanie elementu spod
                   * kursora w trakcie przeciągania byłoby walką z ręką użytkownika.
                   * Przeciąganie GRUPY zostaje nietknięte (patrz `przesunElementy`) —
                   * tam chodzi o zachowanie wzajemnych odstępów, które ktoś przed chwilą
                   * ustawił wyrównaniem.
                   */
                  const poz = bezNakladaniaNaSasiadow({ ...e, ...m }, elements, skalaOsprzetu, mpu, id);
                  return {
                    ...e,
                    x: poz.x,
                    y: poz.y,
                    rotation: m.rotation,
                    room: roomNameAfterMove(poz, e.room, roomShapes, mpu),
                  };
                }),
              }))
            }
            onMoveElements={przesunElementy}
            onAddWallPoint={(p) => sciany.setDrawingWall((pts) => [...pts, p])}
            onCloseWall={sciany.closeWall}
            onAddRoomPoint={(p) => pokoje.setDrawingRoomPoints((pts) => [...pts, p])}
            onRoomRectDrawn={(points) => {
              pokoje.zaproponuj(points);
              pokoje.porzucSzkic();
            }}
            onCloseRoomPolygon={pokoje.zakonczRysowanie}
            onAddCalibPoint={(p) => setCalibPoints((pts) => (pts.length >= 2 ? [p] : [...pts, p]))}
          />
          </div>
          {/* Pasek stanu razem z linijką danych planu — w pełnym ekranie wysuwany zza
              dolnej krawędzi. Liczby (powierzchnia, skala, pozycja kursora) przydają
              się przy sprawdzaniu, a nie przy samym rysowaniu, więc mogą być schowane. */}
          <div
            className={
              // W pełnym ekranie `fixed` do dołu OKNA, nie `absolute` do dołu kolumny płótna.
              // Układ rezerwuje na pasek pas o jego wysokości (`paddingBottom` wiersza,
              // `bottom` karty narzędzi, wysokość płótna) — a pasek przypięty do kolumny
              // stał NAD tym pasem, czyli na rzucie: zmierzone przy 1440 × 900 pasek
              // 722–811 px na płótnie kończącym się na 819, a pas 811–900 pusty.
              // Korzeń pełnego ekranu jest `fixed inset-0` bez transformacji, więc
              // `fixed` liczy się tu od okna.
              pelnyEkran
                ? "fixed inset-x-0 bottom-0 z-30 border border-border bg-white px-2 py-1 shadow-xl"
                : undefined
            }
            ref={dolnyPasekRef}
          >
          <EditorStatusBar
            floorName={floorName}
            roomShapes={roomShapes}
            elementCount={elements.length}
            metersPerUnit={mpu}
            zoom={zoom}
            cursor={cursor}
            // W pełnym ekranie NIE: ten tryb jest o skupieniu na rysunku, a pasek stanu
            // leży wtedy jako wysuwana nakładka — przycisk wyprowadzający z zakładki nie
            // ma czego tam szukać. Ta sama zasada, według której chowa się w pełnym
            // ekranie reszta nawigacji (patrz `z-30` pigułek w App.tsx).
            nastepnyKrok={pelnyEkran ? undefined : nastepnyKrok}
            szerokoscRzutuM={mpu ? planWidthMeters(mpu, planSize.w) : null}
            sprawdzenie={{ stan: stanSprawdzenia(planIssues), pokaz: pokazSprawdzenie }}
          />
          {/*
            * Szerokość rzutu w metrach — tak laik może sprawdzić, czy skala się zgadza.
            * „1:50" nic mu nie mówi bez formatu arkusza w ręku.
            *
            * Stał tu obok odczyt „Obszar planu: 1000 × 700 jedn." i został usunięty.
            * Mówił w JEDNOSTKACH PLANU, czyli pojęciem z kodu: elektryk nie ma jak go
            * użyć ani z czym zestawić — z tego samego powodu zniknęło ono wcześniej
            * z odczytu skali (patrz `oczkoSiatkiM`). Co gorsza opisywał obszar, który
            * przestał cokolwiek znaczyć dla rysunku: rysować można wszędzie, więc jego
            * rozmiar mówi już tylko o tym, jak duży jest podkład — a o podkładzie
            * ten wiersz mówi właśnie w metrach.
            */}
          </div>

          {/* Sprawdzenie rzutu — poza trybem pełnoekranowym. Tam plan ma dostać CAŁE
              okno, a paski zwijają się do krawędzi; karta z akapitami o normie jest
              dokładnie tym, czego ten tryb się pozbywa. Wraca po wyjściu. */}
          {!pelnyEkran && (
            <div ref={kartaSprawdzeniaRef} className="scroll-mt-4">
              <PlanCheckPanel
                issues={planIssues}
                onShowElements={pokazElementyNaPlanie}
                onShowRoom={pokazPomieszczenieNaPlanie}
                przelaczone={kartaSprawdzeniaOtwarta}
                onPrzelacz={setKartaSprawdzeniaOtwarta}
              />
            </div>
          )}
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

      <Dialog open={!!pokoje.pendingRoom} onOpenChange={(open) => !open && pokoje.zamknijPropozycje()}>
        <DialogContent title="Nazwij pomieszczenie">
          <input
            autoFocus
            value={pokoje.pendingRoom?.name ?? ""}
            onChange={(e) => pokoje.zmienNazwe(e.target.value)}
            // Nazwa zastępcza („Pomieszczenie 1") jest od razu ZAZNACZONA, więc pierwsza
            // wpisana litera ją kasuje. Bez tego `autoFocus` stawiał kursor na KOŃCU
            // wpisanej wartości i wpisanie „Kuchnia" dawało „Pomieszczenie 1Kuchnia" —
            // typ rozpoznawał się poprawnie, a do projektu trafiała śmieciowa nazwa,
            // widoczna potem na rzucie, w zestawieniu i w kosztorysie.
            onFocus={(e) => e.currentTarget.select()}
            // Enter zatwierdza nazwę i dodaje pomieszczenie — bez tego trzeba było
            // sięgnąć po mysz mimo trwającej pracy klawiaturą (wpisywanie nazwy).
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                pokoje.zapisz();
              }
            }}
            className="mb-3 w-full rounded border border-border px-3 py-1.5 text-sm"
          />
          <label className="mb-1 block text-xs font-medium text-slate-500">Typ pomieszczenia</label>
          <select
            value={pokoje.pendingRoom?.type ?? "inne"}
            onChange={(e) => pokoje.zmienTyp(e.target.value as RoomType)}
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
          <Button variant="copper" className="w-full" onClick={pokoje.zapisz}>
            Dodaj pomieszczenie
          </Button>
        </DialogContent>
      </Dialog>

      {editingElement && (
        <EditElementModal
          element={editingElement}
          roomSuggestions={roomSuggestions}
          autoLightGroups={lightGroups.get(editingElement.id)}
          uzyteObwody={uzyteNumeryObwodow}
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
          text={`${szerokieOkno ? "Kliknij" : "Dotknij"} dwa punkty o znanej odległości — na przykład dwa końce ściany albo framugę drzwi. Potem podasz, ile to metrów.`}
          onDismiss={() => setCoachMark(null)}
        />
      )}

      {coachMark === "nawigacja" && (
        <CoachMark
          anchor={grupaZoomu}
          /* Dwa różne zestawy gestów, bo na dotyku nie ma ani `Ctrl`, ani rolki —
             jest za to szczypanie dwoma palcami (patrz `gestDotyku.ts`). Obie wersje
             kończą się na przyciskach w pasku, bo to na nie dymek pokazuje strzałką. */
          text={
            szerokieOkno
              ? "Rzut przybliżysz Ctrl + kółkiem myszy, a przesuniesz wciśniętą rolką — albo narzędziem ręki z paska. Ikona obok procentów wraca do całego rzutu."
              : "Rzut przybliżysz szczypaniem dwoma palcami albo przyciskami − i + w pasku, a przesuniesz narzędziem ręki. Ikona obok procentów wraca do całego rzutu."
          }
          onDismiss={zamknijPowitanieNawigacji}
        />
      )}

      {coachMark === "sciany" && (
        <CoachMark
          anchor={wallToolRef.current}
          /* Na dotyku nie ma ani Entera, ani prawego przycisku — jest przytrzymanie palca
             na płótnie (to samo menu co PPM) i „Zakończ" w nakładce nad dolną krawędzią
             rzutu. Ten sam podział co w dymku nawigacji niżej. */
          text={
            szerokieOkno
              ? "Klikaj kolejne narożniki, żeby postawić odcinki ściany. Enter, PPM → „Zatwierdź ścianę” albo przycisk „Zakończ” kończy bieżącą ścianę — możesz od razu zacząć kolejną."
              : "Dotykaj kolejnych narożników, żeby postawić odcinki ściany. Przytrzymaj palec na rzucie → „Zatwierdź ścianę” albo „Zakończ” na dole rzutu kończy bieżącą ścianę — możesz od razu zacząć kolejną."
          }
          onDismiss={() => setCoachMark(null)}
        />
      )}

      {infoTrasy &&
        (() => {
          const trasa = cableRoutes.find((r) => r.id === infoTrasy.id);
          if (!trasa) return null;
          return (
            <InfoTrasy
              trasa={trasa}
              odcinek={infoTrasy.odcinek}
              mpu={scaleOf(scales, trasa.floor)}
              reczna={trasa.id in routeOverrides}
              onClose={() => setInfoTrasy(null)}
            />
          );
        })()}

      {contextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => zaznaczenie.zamknijMenu()} onContextMenu={(e) => e.preventDefault()} />
          <div
            className="pe-card fixed z-50 overflow-hidden py-1 text-sm"
            data-testid="menu-kontekstowe"
            style={{ left: contextMenu.x, top: contextMenu.y, minWidth: 170 }}
          >
            {contextMenu.multi ? (
              <>
                <div className="px-3 py-1.5 text-[11px] text-slate-400">Zaznaczono {multiSelected.length}</div>
                <button
                  onClick={() => {
                    rotateElements(multiSelected);
                    zaznaczenie.zamknijMenu();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-ink hover:bg-slate-50"
                >
                  <RotateCw size={14} /> Obróć o 90°
                </button>
                <button
                  onClick={() => {
                    zaznaczenie.usunZaznaczone();
                    zaznaczenie.zamknijMenu();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-red-600 hover:bg-red-50"
                >
                  <Trash2 size={14} /> Usuń zaznaczone
                </button>
                {/* Przypisanie GRUPOWE jest tu najważniejsze: obwód składa się
                    z kilku punktów, więc klikanie ich po jednym byłoby karą za
                    korzystanie z funkcji. */}
                {(() => {
                  // Elementy spoza obwodów (łączniki, teletechnika, rozdzielnica…) w ogóle
                  // się tu nie liczą — patrz `wchodziDoObwodu`. Gdy zostaną same takie,
                  // wyboru nie ma wcale: nie ma czemu nadać numeru ani czego wyjaśniać.
                  const zaznaczone = elements.filter((e) => multiSelected.includes(e.id) && wchodziDoObwodu(e));
                  if (zaznaczone.length === 0) return null;
                  const doPrzypisania = zaznaczone.filter((e) => !maWlasnyObwodZDefinicji(e));
                  if (doPrzypisania.length === 0) {
                    return (
                      <WyborObwodu
                        uzyte={uzyteNumeryObwodow}
                        onWybierz={() => {}}
                        zablokowane="Żaden z zaznaczonych odbiorników nie może dzielić obwodu — ładowarka EV, gniazdo trójfazowe, wypust AGD i gniazdo dedykowane mają własny z definicji."
                      />
                    );
                  }
                  const numery = new Set(doPrzypisania.map((e) => e.obwod));
                  return (
                    <WyborObwodu
                      numerAktualny={numery.size === 1 ? [...numery][0] : undefined}
                      uzyte={uzyteNumeryObwodow}
                      onWybierz={(n) => {
                        przypiszObwod(multiSelected, n);
                        zaznaczenie.zamknijMenu();
                      }}
                    />
                  );
                })()}
              </>
            ) : contextMenu.kind === "wall" ? (
              <>
                {/* Tylko dla ściany zamkniętej w pętlę — z otwartej łamanej nie ma
                    czego zrobić. Lustro pozycji „Utwórz ścianę z obrysu" w menu
                    pomieszczenia niżej: ta sama operacja, druga strona. */}
                {petleBezPomieszczenia.some((p) => p.wall.id === contextMenu.id) && (
                  <button
                    onClick={() => {
                      createRoomFromWall(contextMenu.id);
                      zaznaczenie.zamknijMenu();
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-ink hover:bg-slate-50"
                  >
                    <Layers size={14} /> Utwórz pomieszczenie z obrysu
                  </button>
                )}
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
                  zaznaczenie.zamknijMenu();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-red-600 hover:bg-red-50"
              >
                <Trash2 size={14} /> Usuń ścianę
              </button>
              </>
            ) : contextMenu.kind === "opening" ? (
              <>
                <button
                  onClick={() => {
                    otwory.obroc(contextMenu.id);
                    zaznaczenie.zamknijMenu();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-ink hover:bg-slate-50"
                >
                  <RotateCw size={14} /> Obróć o 180°
                </button>
                {/* Tylko dla drzwi: okno nie ma zawiasu, więc lustro byłoby przyciskiem,
                    po którym nic nie widać — a przycisk bez skutku jest gorszy niż brak
                    przycisku, bo każe szukać zmiany, której nie ma. */}
                {openings.find((o) => o.id === contextMenu.id)?.kind === "drzwi" && (
                  <button
                    onClick={() => {
                      otwory.odbij(contextMenu.id);
                      zaznaczenie.zamknijMenu();
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-ink hover:bg-slate-50"
                  >
                    <FlipHorizontal size={14} /> Lustro (prawe/lewe)
                  </button>
                )}
                <button
                  onClick={() => {
                    setDraft((d) => ({ ...d, openings: d.openings.filter((o) => o.id !== contextMenu.id) }));
                    setSelected(null);
                    zaznaczenie.zamknijMenu();
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
                    sciany.createWallFromRoom(contextMenu.id);
                    zaznaczenie.zamknijMenu();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-ink hover:bg-slate-50"
                >
                  <Layers size={14} /> Utwórz ścianę z obrysu
                </button>
                <button
                  onClick={() => {
                    deleteRoomShape(contextMenu.id);
                    setSelected(null);
                    zaznaczenie.zamknijMenu();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-red-600 hover:bg-red-50"
                >
                  <Trash2 size={14} /> Usuń pomieszczenie
                </button>
              </>
            ) : contextMenu.kind === "route" ? (
              <>
                {contextMenu.punkt && (
                  <button
                    onClick={() => {
                      const trasa = cableRoutes.find((r) => r.id === contextMenu.id);
                      if (trasa && contextMenu.punkt) setRouteOverride(trasa.id, zalamaniaZNowymPunktem(trasa.points, contextMenu.punkt));
                      zaznaczenie.zamknijMenu();
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-ink hover:bg-slate-50"
                  >
                    <Plus size={14} /> Dodaj punkt
                  </button>
                )}
                <button
                  onClick={() => {
                    const trasa = cableRoutes.find((r) => r.id === contextMenu.id);
                    // Odcinek pod kursorem — ten sam, który wskazałby dwuklik.
                    if (trasa) setInfoTrasy({ id: trasa.id, odcinek: contextMenu.punkt ? nearestRouteSegmentIndex(contextMenu.punkt, trasa.points) : 0 });
                    zaznaczenie.zamknijMenu();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-ink hover:bg-slate-50"
                >
                  <Info size={14} /> Informacje o przewodzie
                </button>
                {contextMenu.id in routeOverrides && (
                  <button
                    onClick={() => {
                      clearRouteOverride(contextMenu.id);
                      zaznaczenie.zamknijMenu();
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-ink hover:bg-slate-50"
                  >
                    <Undo2 size={14} /> Cofnij do trasy automatycznej
                  </button>
                )}
              </>
            ) : contextMenu.kind === "wallDraw" ? (
              <button
                onClick={() => {
                  sciany.finishWall();
                  zaznaczenie.zamknijMenu();
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
                    zaznaczenie.zamknijMenu();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-ink hover:bg-slate-50"
                >
                  <Pencil size={14} /> Edytuj
                </button>
                <button
                  onClick={() => {
                    rotateElements([contextMenu.id]);
                    zaznaczenie.zamknijMenu();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-ink hover:bg-slate-50"
                >
                  <RotateCw size={14} /> Obróć o 90°
                </button>
                <button
                  onClick={() => {
                    removeElements([contextMenu.id]);
                    setSelected(null);
                    zaznaczenie.zamknijMenu();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-red-600 hover:bg-red-50"
                >
                  <Trash2 size={14} /> Usuń
                </button>
                {(() => {
                  const el = elements.find((e) => e.id === contextMenu.id);
                  // Rozdzielnica, łącznik czy gniazdo RJ45 nie należą do obwodu 230 V —
                  // wybór numeru byłby tam przyciskiem bez skutku (patrz `wchodziDoObwodu`).
                  if (!el || !wchodziDoObwodu(el)) return null;
                  return (
                    <WyborObwodu
                      numerAktualny={el.obwod}
                      uzyte={uzyteNumeryObwodow}
                      onWybierz={(n) => {
                        przypiszObwod([contextMenu.id], n);
                        zaznaczenie.zamknijMenu();
                      }}
                      zablokowane={
                        maWlasnyObwodZDefinicji(el)
                          ? "Ten odbiornik ma własny obwód z definicji — inny przewód i inne zabezpieczenie niż obwód wspólny."
                          : undefined
                      }
                    />
                  );
                })()}
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
