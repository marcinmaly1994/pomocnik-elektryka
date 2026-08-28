import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Stage, Layer, Rect, Line, Circle, Arc, Text, Group, Image as KonvaImage } from "react-konva";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import type { CableRoute, InstallationElement, Opening, Point, RoomShape, Wall } from "@/types";
import { ELEMENT_TYPES, type SanitaryZone } from "@/lib/elements";
import { colorForRoomName, DEFAULT_WALL_THICKNESS, GRID, type PlanSize } from "@/lib/design";
import { spreadOverlappingRoutes } from "@/lib/panel/loads";
import { clampNum, nearestPointOnPolyline, snap } from "@/lib/geometry";
import { ElementGlyphKonva, SelectionOutlineKonva } from "@/components/design/ElementGlyphKonva";
import { groupLabelAnchors } from "@/lib/glyphs";

export type ToolMode = "zaznacz" | "elementy" | "sciany" | "pomieszczenie" | "otwory" | "pan" | "skala";
export type Selection = { kind: "el" | "wall" | "room" | "opening"; id: string } | null;

/** Sposób rysowania pomieszczenia: prostokąt przeciągnięciem albo wielobok klikaniem. */
export type RoomDrawMode = "prostokat" | "wielobok";

/** Promień (w jednostkach planu) przyciągania do pierwszego punktu wieloboku. Dobrany
 *  tak, by dało się trafić myszką bez powiększania, ale żeby nie zamykać figury
 *  przypadkiem przy stawianiu punktu tuż obok startu. */
const ROOM_CLOSE_RADIUS = 12;
/** Poniżej tego rozmiaru (w jednostkach planu) przeciągnięcie traktujemy jak przypadkowe
 *  drgnięcie myszy przy kliknięciu, a nie jak chęć narysowania prostokąta. */
const MIN_ROOM_SIZE = 8;

/** Granice powiększenia widoku planu — wspólne dla Ctrl+scroll i przycisków paska. */
/**
 * Wysokość okna płótna liczona z okna przeglądarki, a nie stała 640 px.
 *
 * Na monitorze 1440p sztywna wysokość zostawiała pod płótnem pas pustego tła,
 * a rzut i tak nie mógł urosnąć, bo dopasowanie ogranicza się WYSOKOŚCIĄ.
 * Odejmujemy zapas na nagłówek, pasek etapów, pasek narzędzi i pasek stanu.
 */
export function wysokoscPlotna(): number {
  const okno = typeof window === "undefined" ? 900 : window.innerHeight;
  // Dolna granica to dotychczasowe 640 px, NIE mniej: pierwsza wersja liczyła
  // `okno - 300` z podłogą 420 i przy oknie 720 px zmniejszała płótno o 220 px
  // względem stanu poprzedniego — czyli na laptopie pogarszała to, co miała
  // poprawić. Rośniemy tylko tam, gdzie jest z czego rosnąć.
  return Math.max(640, Math.min(1100, okno - 260));
}
export const MIN_ZOOM = 0.4;
export const MAX_ZOOM = 4;

/** Ładuje obraz podkładu z data URL. Zwraca `null`, dopóki się nie wczyta. */
function useBackgroundImage(src: string | null): HTMLImageElement | null {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!src) {
      setImage(null);
      return;
    }
    const img = new window.Image();
    img.onload = () => setImage(img);
    img.src = src;
    return () => setImage(null);
  }, [src]);
  return image;
}

interface DesignCanvasProps {
  /** Uchwyt na scenę Konvy dla rodzica — potrzebny wyłącznie do EKSPORTU rzutu
   *  (rasteryzacja przez `stage.toCanvas()`). Rysowaniem steruje nadal wyłącznie
   *  ten komponent; ref jest tu podglądem, nie kanałem sterowania. */
  stageRef?: React.MutableRefObject<Konva.Stage | null>;
  elements: InstallationElement[];
  walls: Wall[];
  roomShapes: RoomShape[];
  openings: Opening[];
  toolMode: ToolMode;
  roomMode: RoomDrawMode;
  snapOn: boolean;
  /** Czy rysować siatkę pomocniczą. Niezależne od `snapOn` — patrz komentarz przy
   *  renderowaniu siatki. */
  gridOn: boolean;
  selected: Selection;
  multiSelected: string[];
  drawingWall: Point[];
  /** Grubość (jedn. planu) do podglądu ściany W TRAKCIE rysowania — ta sama
   *  wartość, która trafi na zapisaną ścianę po zatwierdzeniu (patrz `finishWall`
   *  w DesignTab), więc podgląd od razu pokazuje docelową grubość, nie stałą. */
  newWallThickness: number;
  /** Wymusza kolejny odcinek ściany jako poziomy albo pionowy względem ostatniego
   *  postawionego punktu — patrz `orthoSnap` niżej. */
  orthoWalls: boolean;
  drawingRoomPoints: Point[];
  bgImageUrl: string | null;
  calibPoints: Point[];
  zones: SanitaryZone[];
  /** Wizualne trasy przewodów (rozdzielnica → punkt), patrz `buildCableRoutes` —
   *  pusta tablica, gdy na kondygnacji nie ma rozdzielnicy albo widoczność wyłączona. */
  cableRoutes: CableRoute[];
  /** Numery grup sterowania oświetleniem, wyliczone w DesignTab (lib/lightGroups.ts). */
  lightGroups: Map<string, (number | undefined)[]>;
  /** Mnożnik rozmiaru symboli elementów (1 = rozmiar bazowy). */
  elementScale: number;
  /** Obszar roboczy planu — dopasowany do proporcji wgranego rzutu (patrz store). */
  planSize: PlanSize;
  /** Metrów na jednostkę planu — `null` bez kalibracji. Do etykiety wymiaru
   *  pokazywanej na żywo podczas rysowania ściany (patrz `drawingWall`). */
  metersPerUnit: number | null;
  /** Kliknięcie poza obszarem planu — do pokazania podpowiedzi, czemu nic się nie stało. */
  onOutsidePlan: () => void;
  /** Pozycja kursora w jednostkach planu (null = poza planem) — do paska stanu. */
  onPointerMove?: (p: Point | null) => void;
  /** Powiększenie widoku. Sterowane z paska narzędzi, więc trzymane w stanie
   *  Reacta zamiast wyłącznie imperatywnie na scenie — inaczej pasek nie miałby
   *  skąd wziąć aktualnej wartości do pokazania. */
  zoom: number;
  onZoomChange: (z: number) => void;
  /** Wysokość okna płótna — liczona w DesignTab, żeby dopasowanie znało ten sam limit. */
  maxHeight: number;
  onSelectElement: (id: string, shiftKey: boolean) => void;
  onSelectWall: (id: string) => void;
  onEditElement: (id: string) => void;
  onElementContextMenu: (id: string, clientX: number, clientY: number) => void;
  onWallContextMenu: (id: string, clientX: number, clientY: number) => void;
  /** PPM na płótnie W TRAKCIE rysowania ściany (co najmniej 2 postawione punkty) —
   *  alternatywa dla przycisku „Zakończ" i klawisza Enter, ten sam wzorzec menu
   *  kontekstowego co przy elementach/ścianach/pomieszczeniach. */
  onWallDrawContextMenu: (clientX: number, clientY: number) => void;
  /** Klik w ścianę W TRYBIE „otwory" — zamiast zaznaczać ścianę, dokłada na niej
   *  drzwi w najbliższym do kliknięcia miejscu (`point`/`angle` już policzone
   *  przez `nearestPointOnPolyline`, DesignTab tylko zapisuje). */
  onWallClickForOpening: (wallId: string, point: Point, angle: number) => void;
  onSelectOpening: (id: string) => void;
  onOpeningContextMenu: (id: string, clientX: number, clientY: number) => void;
  /** Klik w KRAWĘDŹ obrysu pomieszczenia (nie we wnętrze — patrz komentarz przy
   *  renderowaniu obrysu) — zaznacza pomieszczenie i odsłania uchwyty narożników.
   *  W trybie „otwory" ta sama krawędź zamiast tego dokłada drzwi — patrz
   *  `onRoomEdgeClickForOpening` niżej, ten sam wzorzec co `onWallClickForOpening`. */
  onSelectRoom: (id: string) => void;
  /** Klik w krawędź pomieszczenia W TRYBIE „otwory" — pomieszczenia często nie mają
   *  osobno narysowanej ściany, więc to jedyny sposób postawić tam drzwi.
   *  `point`/`angle` liczone tu samo, tak jak przy `onWallClickForOpening`, tylko na
   *  ZAMKNIĘTYM obrysie (ostatni punkt łączy się z pierwszym). */
  onRoomEdgeClickForOpening: (roomId: string, point: Point, angle: number) => void;
  onRoomContextMenu: (id: string, clientX: number, clientY: number) => void;
  /** Dwuklik w NAZWĘ pomieszczenia — otwiera edycję nazwy w miejscu kliknięcia. */
  onRoomNameDblClick: (id: string, clientX: number, clientY: number) => void;
  /** Koniec przeciągania narożnika — pojedynczy wpis do historii cofania na CAŁY
   *  ruch, nie na każdą klatkę (patrz onDragMove elementów, ten sam wzorzec). */
  onMoveRoomPoint: (id: string, index: number, point: Point) => void;
  /** Koniec przeciągania narożnika ściany — jeden wpis do historii cofania na
   *  cały ruch, ten sam wzorzec co `onMoveRoomPoint`. */
  onMoveWallPoint: (id: string, index: number, point: Point) => void;
  onClearSelection: () => void;
  onMarqueeSelect: (ids: string[]) => void;
  onPlaceElement: (p: Point) => void;
  onMoveElement: (id: string, x: number, y: number) => void;
  onMoveElements: (moves: { id: string; x: number; y: number }[]) => void;
  onAddWallPoint: (p: Point) => void;
  onAddRoomPoint: (p: Point) => void;
  /** Prostokąt narysowany przeciągnięciem — gotowe 4 wierzchołki. */
  onRoomRectDrawn: (points: Point[]) => void;
  /** Kliknięto w pierwszy punkt wieloboku (albo w jego pobliżu) — zamknij figurę. */
  onCloseRoomPolygon: () => void;
  onAddCalibPoint: (p: Point) => void;
}

interface MarqueeRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Punkt planu pod kursorem albo `null`, gdy kursor jest POZA obszarem planu.
 *
 * Wcześniej współrzędne były tu po cichu przycinane do krawędzi, więc kliknięcie obok
 * planu (możliwe po oddaleniu widoku) stawiało element przy brzegu zamiast tam, gdzie
 * użytkownik kliknął — bez śladu, że coś poszło nie tak. Teraz takie kliknięcie nie
 * robi nic, a `DesignTab` mówi dlaczego.
 */
function planPoint(stage: Konva.Stage, size: PlanSize): Point | null {
  const pos = stage.getRelativePointerPosition();
  if (!pos) return null;
  if (pos.x < 0 || pos.y < 0 || pos.x > size.w || pos.y > size.h) return null;
  return { x: pos.x, y: pos.y };
}

/** Punkt przycięty do obszaru planu — do TRWAJĄCEGO przeciągania, gdzie kursor bywa
 *  chwilowo poza planem, a rysowana figura i tak ma zostać w jego granicach. */
function clampedPlanPoint(stage: Konva.Stage, size: PlanSize): Point | null {
  const pos = stage.getRelativePointerPosition();
  if (!pos) return null;
  return { x: clampNum(pos.x, 0, size.w), y: clampNum(pos.y, 0, size.h) };
}

function centroid(points: Point[]): Point {
  const n = points.length || 1;
  return {
    x: points.reduce((a, p) => a + p.x, 0) / n,
    y: points.reduce((a, p) => a + p.y, 0) / n,
  };
}

export function DesignCanvas({
  stageRef,
  elements,
  walls,
  roomShapes,
  openings,
  toolMode,
  roomMode,
  snapOn,
  gridOn,
  selected,
  multiSelected,
  drawingWall,
  newWallThickness,
  orthoWalls,
  drawingRoomPoints,
  bgImageUrl,
  calibPoints,
  zones,
  cableRoutes,
  lightGroups,
  elementScale,
  planSize,
  metersPerUnit,
  onOutsidePlan,
  onPointerMove,
  zoom,
  onZoomChange,
  maxHeight,
  onSelectElement,
  onSelectWall,
  onEditElement,
  onElementContextMenu,
  onWallContextMenu,
  onWallDrawContextMenu,
  onWallClickForOpening,
  onSelectOpening,
  onOpeningContextMenu,
  onSelectRoom,
  onRoomEdgeClickForOpening,
  onRoomContextMenu,
  onRoomNameDblClick,
  onMoveRoomPoint,
  onMoveWallPoint,
  onClearSelection,
  onMarqueeSelect,
  onPlaceElement,
  onMoveElement,
  onMoveElements,
  onAddWallPoint,
  onAddRoomPoint,
  onRoomRectDrawn,
  onCloseRoomPolygon,
  onAddCalibPoint,
}: DesignCanvasProps) {
  /**
   * Wymuszone przerysowanie warstwy tła po przełączeniu siatki.
   *
   * react-konva nakłada `visible` na istniejące węzły, ale samo z siebie NIE
   * odrysowuje warstwy — zmierzone: prop docierał do płótna (`true` → `false`),
   * a linie zostawały na ekranie. Widać to było tylko przy zmianie, która i tak
   * wymusza pełne odrysowanie (np. powiększenie), więc błąd łatwo wziąć za
   * „przełącznik nie działa".
   */
  useEffect(() => {
    warstwaTlaRef.current?.batchDraw();
  }, [gridOn]);

  const bgImage = useBackgroundImage(bgImageUrl);
  /** Kontener przewijania — to jego `scrollLeft`/`scrollTop` wyznacza kadr planu.
   *  Wszystkie drogi przesuwania i przybliżania działają wyłącznie na nim. */
  const kontenerRef = useRef<HTMLDivElement>(null);
  const przesuwanieRef = useRef<{ x: number; y: number; scrollX: number; scrollY: number } | null>(null);
  /** Punkt planu, który ma zostać pod kursorem po zmianie powiększenia Ctrl+kółkiem.
   *  Nakładany dopiero po przerysowaniu płótna — patrz `useLayoutEffect` niżej. */
  const kotwicaZoomRef = useRef<{ planX: number; planY: number; kursorX: number; kursorY: number } | null>(null);
  /** Tylko po to, żeby zmienić kursor na „łapkę" — sam gest żyje w refie, bo
   *  przerysowywanie sceny przy każdym pikselu ruchu byłoby marnotrawstwem. */
  const [przesuwa, setPrzesuwa] = useState(false);

  const layerRef = useRef<Konva.Layer>(null);
  /** Warstwa tła z siatką — potrzebna, żeby wymusić jej przerysowanie po zmianie
   *  widoczności siatki (patrz efekt niżej). */
  const warstwaTlaRef = useRef<Konva.Layer>(null);
  const elementNodesRef = useRef<Map<string, Konva.Group>>(new Map());
  // Węzły obrysu pomieszczenia — wizualny (wypełnienie) i „hitowy" (krawędź do
  // klikania) trzymają TE SAME punkty, więc podczas przeciągania narożnika trzeba
  // zaktualizować oba imperatywnie na żywo (patrz onDragMove uchwytu niżej), tak
  // jak elementy aktualizują siebie nawzajem podczas wspólnego przeciągania.
  const roomLineNodesRef = useRef<Map<string, Konva.Line>>(new Map());
  const roomHitNodesRef = useRef<Map<string, Konva.Line>>(new Map());
  const wallLineNodesRef = useRef<Map<string, Konva.Line>>(new Map());
  const marqueeStartRef = useRef<Point | null>(null);
  // Źródło prawdy dla bieżącego prostokąta zaznaczania to ref, nie tylko stan —
  // przy szybkich zdarzeniach mousemove+mouseup w jednej turze React batchuje
  // aktualizacje stanu, więc odczyt samego stanu w handlerze mouseup potrafił
  // widzieć nieaktualną (sprzed ostatniego mousemove) wartość.
  const marqueeRectRef = useRef<MarqueeRect | null>(null);
  const [marqueeRect, setMarqueeRect] = useState<MarqueeRect | null>(null);
  const groupDragRef = useRef<{ ids: string[]; start: Record<string, Point>; draggedId: string } | null>(null);
  /**
   * Konva po zakończeniu przeciągnięcia elementu i tak wysyła Stage'owi zdarzenie
   * „click” (drag suszy shape'owi jego WŁASNY click, ale Stage śledzi start/koniec
   * gestu niezależnie) — bez tej straży `handleStageClick` w trybie „Wstaw element”
   * traktował puszczenie przeciąganego elementu jak kliknięcie w puste miejsce i
   * stawiał tam DRUGI element. Ustawiane w `onDragEnd`, gaszone przy najbliższym
   * kliknięciu Stage'a (jednorazowo — nie ma znaczyć „zawsze ignoruj kliknięcia”).
   */
  const elementDragJustEndedRef = useRef(false);

  // Prostokąt pomieszczenia rysowany przeciągnięciem — ta sama para ref+stan co przy
  // zaznaczaniu prostokątem wyżej i z tego samego powodu (React batchuje stan między
  // mousemove a mouseup, więc handler `mouseup` czytający sam stan widziałby stary rozmiar).
  const roomRectStartRef = useRef<Point | null>(null);
  const roomRectRef = useRef<MarqueeRect | null>(null);
  const [roomRect, setRoomRect] = useState<MarqueeRect | null>(null);
  // Pozycja kursora w trybie wieloboku — do „gumowej" linii od ostatniego punktu i do
  // podświetlenia punktu startowego, gdy kolejny klik zamknie figurę.
  const [roomCursor, setRoomCursor] = useState<Point | null>(null);
  // To samo dla rysowania ścian — „gumowy" odcinek od ostatniego postawionego
  // punktu do kursora, z etykietą bieżącej długości (patrz render niżej).
  const [wallCursor, setWallCursor] = useState<Point | null>(null);

  const drawingRoom = toolMode === "pomieszczenie";

  // Trasy niezależnie policzone (`buildCableRoutes`) potrafią przebiegać dokładnie
  // tym samym odcinkiem ściany (np. dwa obwody gniazdek w tym samym pomieszczeniu) —
  // bez tego trasy renderowałyby się jako jedna zlana linia. `spreadOverlappingRoutes`
  // liczy WYŁĄCZNIE punkty do rysowania (offset prostopadły do wspólnego odcinka),
  // reszta pól `CableRoute` (długość, kolor, styl) zostaje autorytatywna z `r`.
  const spreadRoutePoints = useMemo(() => spreadOverlappingRoutes(cableRoutes), [cableRoutes]);

  function withSnap(p: Point): Point {
    return snapOn ? { x: snap(p.x, GRID), y: snap(p.y, GRID) } : p;
  }

  /** Przy rysowaniu ortogonalnym zamraża oś BLIŻSZĄ poprzedniemu punktowi na jego
   *  wartości — odcinek wychodzi idealnie poziomy albo pionowy, w zależności od
   *  tego, w którą stronę kursor odsunął się bardziej. */
  function orthoSnap(last: Point, p: Point): Point {
    const dx = Math.abs(p.x - last.x);
    const dy = Math.abs(p.y - last.y);
    return dx >= dy ? { x: p.x, y: last.y } : { x: last.x, y: p.y };
  }

  /** Długość odcinka w jednostkach planu, sformatowana do etykiety: metry, jeśli
   *  skala jest ustawiona, inaczej same jednostki planu — ten sam wybór co pasek
   *  stanu (`EditorStatusBar`), żeby liczby w aplikacji mówiły jednym językiem. */
  function formatDlugosc(jednostki: number): string {
    if (metersPerUnit !== null) return `${(jednostki * metersPerUnit).toFixed(2).replace(".", ",")} m`;
    return `${Math.round(jednostki)} jedn.`;
  }

  /** Czy punkt trafia w pierwszy wierzchołek wieloboku na tyle blisko, by go zamknąć.
   *  Wymaga co najmniej 3 punktów — z dwóch nie powstanie pomieszczenie. */
  function closesPolygon(p: Point): boolean {
    if (drawingRoomPoints.length < 3) return false;
    const first = drawingRoomPoints[0];
    return Math.hypot(p.x - first.x, p.y - first.y) <= ROOM_CLOSE_RADIUS;
  }

  function rectCorners(r: MarqueeRect): Point[] {
    return [
      { x: r.x, y: r.y },
      { x: r.x + r.w, y: r.y },
      { x: r.x + r.w, y: r.y + r.h },
      { x: r.x, y: r.y + r.h },
    ];
  }

  // layer.batchDraw() planuje przerysowanie mapy trafień przez requestAnimationFrame —
  // w tabie bez fokusu/widoczności przeglądarka potrafi to trwale wstrzymać, przez co
  // świeżo dodany element/ściana/pomieszczenie nigdy nie trafiały do hit-testu Konvy
  // (klik w nie nic nie zaznaczał). layer.draw() robi to samo synchronicznie.
  useEffect(() => {
    layerRef.current?.draw();
  });

  function handleStageMouseDown(e: KonvaEventObject<MouseEvent>) {
    // Rolką się PRZESUWA, a nie rysuje: bez tego wciśnięcie środkowego przycisku
    // zaczynało prostokąt pomieszczenia albo zaznaczanie obszarem, i użytkownik
    // przesuwając plan rysował po nim ramkę.
    if (e.evt.button === 1) return;
    const stage = e.target.getStage();
    // Rysowanie prostokąta pomieszczenia działa też nad już narysowanym pomieszczeniem
    // (jest tylko podkładem rysunkowym), więc tu — inaczej niż przy zaznaczaniu — nie
    // wymagamy, żeby zdarzenie trafiło prosto w scenę.
    if (drawingRoom && roomMode === "prostokat") {
      const p = stage && planPoint(stage, planSize);
      if (!p) return;
      const start = withSnap(p);
      roomRectStartRef.current = start;
      const rect = { x: start.x, y: start.y, w: 0, h: 0 };
      roomRectRef.current = rect;
      setRoomRect(rect);
      return;
    }

    if (e.target !== stage) return;
    onClearSelection();
    if (toolMode !== "zaznacz") return;
    const p = stage && planPoint(stage, planSize);
    if (!p) return;
    marqueeStartRef.current = p;
    const rect = { x: p.x, y: p.y, w: 0, h: 0 };
    marqueeRectRef.current = rect;
    setMarqueeRect(rect);
  }

  function handleStageMouseMove(e: KonvaEventObject<MouseEvent>) {
    const stage = e.target.getStage();

    // Pozycja kursora w jednostkach planu — pasek stanu przelicza ją na metry.
    // `null` poza obszarem planu, żeby nie pokazywać współrzędnych spoza rysunku.
    onPointerMove?.(stage ? planPoint(stage, planSize) : null);

    if (toolMode === "sciany" && drawingWall.length > 0) {
      const raw = stage && clampedPlanPoint(stage, planSize);
      if (!raw) {
        setWallCursor(null);
        return;
      }
      const snapped = withSnap(raw);
      setWallCursor(orthoWalls ? orthoSnap(drawingWall[drawingWall.length - 1], snapped) : snapped);
      return;
    }

    if (drawingRoom) {
      const raw = stage && clampedPlanPoint(stage, planSize);
      if (!raw) return;
      if (roomMode === "wielobok") {
        // przy kursorze w pobliżu startu pokazujemy punkt startowy, nie pozycję myszy —
        // dzięki temu widać dokładnie, gdzie figura się domknie
        setRoomCursor(closesPolygon(raw) ? drawingRoomPoints[0] : withSnap(raw));
        return;
      }
      const start = roomRectStartRef.current;
      if (!start) return;
      const p = withSnap(raw);
      const rect = {
        x: Math.min(start.x, p.x),
        y: Math.min(start.y, p.y),
        w: Math.abs(p.x - start.x),
        h: Math.abs(p.y - start.y),
      };
      roomRectRef.current = rect;
      setRoomRect(rect);
      return;
    }

    if (!marqueeStartRef.current) return;
    const p = stage && clampedPlanPoint(stage, planSize);
    if (!p) return;
    const start = marqueeStartRef.current;
    const rect = {
      x: Math.min(start.x, p.x),
      y: Math.min(start.y, p.y),
      w: Math.abs(p.x - start.x),
      h: Math.abs(p.y - start.y),
    };
    marqueeRectRef.current = rect;
    setMarqueeRect(rect);
  }

  function handleStageMouseUp() {
    if (roomRectStartRef.current) {
      roomRectStartRef.current = null;
      const rect = roomRectRef.current;
      roomRectRef.current = null;
      setRoomRect(null);
      if (rect && rect.w >= MIN_ROOM_SIZE && rect.h >= MIN_ROOM_SIZE) onRoomRectDrawn(rectCorners(rect));
      return;
    }

    if (!marqueeStartRef.current) return;
    marqueeStartRef.current = null;
    const rect = marqueeRectRef.current;
    marqueeRectRef.current = null;
    setMarqueeRect(null);
    if (!rect || (rect.w < 4 && rect.h < 4)) return; // zbyt mały ruch = zwykły klik, nie zaznaczanie
    const ids = elements
      .filter((el) => el.x >= rect.x && el.x <= rect.x + rect.w && el.y >= rect.y && el.y <= rect.y + rect.h)
      .map((el) => el.id);
    onMarqueeSelect(ids);
  }

  function handleStageClick(e: KonvaEventObject<MouseEvent>) {
    // Patrz komentarz przy `elementDragJustEndedRef`: to zdarzenie „click” jest
    // ECHEM zakończonego przeciągnięcia elementu, nie nowym kliknięciem — gasimy
    // flagę i kończymy, zanim narzędzie „elementy” zdąży postawić drugi element
    // dokładnie tam, gdzie przeciągany właśnie wylądował.
    if (elementDragJustEndedRef.current) {
      elementDragJustEndedRef.current = false;
      return;
    }
    // Konva synteryzuje własne zdarzenie „click" na mousedown+mouseup na tym samym
    // celu NIEZALEŻNIE od przycisku myszy — bez tej straży PPM otwierające menu
    // zatwierdzenia ściany (`handleStageContextMenu`) dokładał RÓWNOCZEŚNIE nowy
    // punkt tą samą drogą co lewy klik, więc zatwierdzona ściana miała jeden
    // punkt więcej niż faktycznie postawiono.
    // Środkowy przycisk (1) przesuwa widok — patrz `zacznijPrzesuwanieSrodkowym`.
    // Bez tej straży puszczenie rolki po przesunięciu planu stawiałoby element
    // albo czyściło zaznaczenie w miejscu, w którym akurat skończył się gest.
    if (e.evt.button === 2 || e.evt.button === 1) return;
    const stage = e.target.getStage();
    if (!stage) return;
    const p = planPoint(stage, planSize);
    if (!p) {
      // Kliknięcie poza planem: narzędzia rysujące nie mają gdzie nic postawić, więc
      // zamiast po cichu dokleić element do krawędzi (jak było wcześniej) mówimy o tym.
      if (toolMode !== "zaznacz" && toolMode !== "pan") onOutsidePlan();
      return;
    }

    if (toolMode === "sciany") {
      const point = orthoWalls && drawingWall.length > 0 ? orthoSnap(drawingWall[drawingWall.length - 1], p) : p;
      onAddWallPoint(point);
      return;
    }
    if (toolMode === "pomieszczenie") {
      // Prostokąt powstaje z przeciągnięcia (mousedown→mouseup), więc towarzyszące
      // kliknięcie musi tu zostać zignorowane, inaczej dokładałoby lewy punkt.
      if (roomMode === "prostokat") return;
      if (closesPolygon(p)) {
        onCloseRoomPolygon();
        setRoomCursor(null);
        return;
      }
      onAddRoomPoint(withSnap(p));
      return;
    }
    if (toolMode === "skala") {
      onAddCalibPoint(p);
      return;
    }
    if (toolMode === "elementy") {
      onPlaceElement(snapOn ? { x: snap(p.x, GRID), y: snap(p.y, GRID) } : p);
    }
  }

  /** PPM na płótnie w trakcie rysowania ściany zatwierdza ją zamiast otwierać
   *  domyślne menu przeglądarki — druga droga do tego samego co przycisk „Zakończ"
   *  i Enter. Podglądowe kształty ściany mają `listening={false}`, więc zdarzenie
   *  zawsze dociera tutaj niezależnie od tego, gdzie dokładnie kliknięto. Poza
   *  rysowaniem ściany (albo z mniej niż dwoma punktami — `finishWall` i tak nic
   *  by nie zapisał) domyślne menu przeglądarki zostaje nietknięte. */
  function handleStageContextMenu(e: KonvaEventObject<MouseEvent>) {
    if (toolMode !== "sciany" || drawingWall.length < 2) return;
    e.evt.preventDefault();
    onWallDrawContextMenu(e.evt.clientX, e.evt.clientY);
  }

  /**
   * Ctrl+kółko: przybliżenie z zachowaniem punktu pod kursorem.
   *
   * Kadr zmieniamy PRZEWINIĘCIEM kontenera, nie pozycją sceny. Wcześniej ta funkcja
   * przesuwała scenę (`stage.position`), podczas gdy kółko i rolka przewijają
   * kontener — dwa niezależne układy współrzędnych na tę samą czynność. Przy
   * przybliżeniu potrafiły się wykluczać: treść wypchnięta sceną poza płótno była
   * przycinana bezpowrotnie, a przewijanie pokazywało w tym miejscu pustkę.
   *
   * Nowa skala wchodzi przez stan Reacta, więc przewinięcie trzeba nałożyć dopiero
   * PO przerysowaniu (patrz `useLayoutEffect` niżej) — w tym momencie płótno ma
   * jeszcze stary rozmiar i większe wartości zostałyby przycięte.
   */
  function handleWheel(e: KonvaEventObject<WheelEvent>) {
    if (!e.evt.ctrlKey && !e.evt.metaKey) return; // bez Ctrl — zwykłe przewijanie strony
    e.evt.preventDefault();
    const el = kontenerRef.current;
    if (!el) return;
    const ramka = el.getBoundingClientRect();
    const kursorX = e.evt.clientX - ramka.left;
    const kursorY = e.evt.clientY - ramka.top;
    // Punkt planu pod kursorem — to on ma zostać w tym samym miejscu ekranu.
    const planX = (el.scrollLeft + kursorX) / zoom;
    const planY = (el.scrollTop + kursorY) / zoom;
    const factor = e.evt.deltaY < 0 ? 1.1 : 0.9;
    const nowaSkala = clampNum(zoom * factor, MIN_ZOOM, MAX_ZOOM);
    if (nowaSkala === zoom) return;
    kotwicaZoomRef.current = { planX, planY, kursorX, kursorY };
    onZoomChange(nowaSkala);
  }

  /**
   * Przesuwanie planu wciśniętą rolką — konwencja z programów CAD i edytorów
   * graficznych, działająca NIEZALEŻNIE od wybranego narzędzia. Dzięki temu można
   * poprawić kadr w trakcie rysowania ściany, bez przełączania się na „Przesuń
   * widok" i z powrotem (co porzuciłoby zaczęty odcinek).
   *
   * Przesuwamy `scrollLeft`/`scrollTop` kontenera, a nie scenę Konvy: kadr jest tu
   * wyznaczany właśnie przez przewinięcie kontenera, więc ten sam mechanizm obsługuje
   * kółko myszy i to, co widać po przybliżeniu. Ruszanie sceną dawałoby drugi,
   * niezależny układ współrzędnych i dwa różne „przesunięcia" naraz.
   */
  /**
   * JEDEN mechanizm przesuwania widoku dla wszystkich dróg: narzędzia „Przesuń
   * widok" (lewy przycisk), wciśniętej rolki (środkowy) i kółka myszy.
   *
   * Wcześniej narzędzie przesuwało SCENĘ Konvy, a kółko i rolka przewijały
   * kontener — dwa układy współrzędnych na tę samą czynność. Po przybliżeniu
   * wykluczały się nawzajem: treść wypchnięta sceną poza płótno była przycinana
   * bezpowrotnie, a przewinięcie pokazywało tam pustkę. Teraz wszystko rusza
   * wyłącznie przewinięciem kontenera, więc żaden fragment planu nie może stać
   * się nieosiągalny.
   */
  /** Nakłada przewinięcie utrzymujące punkt spod kursora po zmianie powiększenia.
   *  `useLayoutEffect`, nie `useEffect`: przewinięcie musi wejść w tej samej klatce,
   *  w której płótno dostało nowy rozmiar — inaczej widać przeskok. */
  useLayoutEffect(() => {
    const k = kotwicaZoomRef.current;
    const el = kontenerRef.current;
    if (!k || !el) return;
    kotwicaZoomRef.current = null;
    el.scrollLeft = k.planX * zoom - k.kursorX;
    el.scrollTop = k.planY * zoom - k.kursorY;
  }, [zoom]);

  function zacznijPrzesuwanie(e: ReactPointerEvent<HTMLDivElement>) {
    // Środkowy przycisk działa ZAWSZE, lewy tylko w trybie „Przesuń widok" —
    // inaczej odebrałby rysowanie wszystkim pozostałym narzędziom.
    const rolka = e.button === 1;
    const lewyWTrybiePan = e.button === 0 && toolMode === "pan";
    if (!rolka && !lewyWTrybiePan) return;
    const el = kontenerRef.current;
    if (!el) return;
    // `preventDefault` gasi windowsowe autoprzewijanie (kółko z kotwicą), które
    // inaczej przejmuje gest i pokazuje własny kursor.
    if (rolka) e.preventDefault();
    przesuwanieRef.current = { x: e.clientX, y: e.clientY, scrollX: el.scrollLeft, scrollY: el.scrollTop };
    el.setPointerCapture(e.pointerId);
    setPrzesuwa(true);
  }

  function przesuwajSrodkowym(e: ReactPointerEvent<HTMLDivElement>) {
    const start = przesuwanieRef.current;
    const el = kontenerRef.current;
    if (!start || !el) return;
    // Minus: chwytamy rysunek i ciągniemy go za kursorem, więc widok jedzie
    // w przeciwną stronę niż mysz.
    el.scrollLeft = start.scrollX - (e.clientX - start.x);
    el.scrollTop = start.scrollY - (e.clientY - start.y);
  }

  function zakonczPrzesuwanieSrodkowym(e: ReactPointerEvent<HTMLDivElement>) {
    if (!przesuwanieRef.current) return;
    przesuwanieRef.current = null;
    kontenerRef.current?.releasePointerCapture(e.pointerId);
    setPrzesuwa(false);
  }

  return (
    // Karta PRZYLEGA do rzutu (`w-fit`) i sama się centruje (`mx-auto`), zamiast
    // rozciągać się na kolumnę i centrować zawartość w środku. Efekt wizualny jest
    // ten sam — wolne miejsce rozkłada się po obu stronach — ale obramowanie pokrywa
    // się z płótnem, więc współrzędne kliknięcia liczone względem karty trafiają
    // tam, gdzie użytkownik widzi rysunek. `max-w-full` zostawia przewijanie,
    // gdy rzut jest szerszy od kolumny.
    <div
      ref={kontenerRef}
      className="pe-bez-suwaka mx-auto w-fit max-w-full overflow-auto rounded-card border border-border"
      style={{ maxHeight, cursor: przesuwa ? "grabbing" : toolMode === "pan" ? "grab" : undefined }}
      onPointerDown={zacznijPrzesuwanie}
      onPointerMove={przesuwajSrodkowym}
      onPointerUp={zakonczPrzesuwanieSrodkowym}
      onPointerCancel={zakonczPrzesuwanieSrodkowym}
      // Środkowy przycisk domyślnie wkleja zaznaczenie (Linux) albo otwiera
      // autoprzewijanie — jedno i drugie w trakcie przesuwania planu przeszkadza.
      onAuxClick={(e) => e.button === 1 && e.preventDefault()}
    >
      <Stage
        ref={stageRef}
        width={planSize.w * zoom}
        height={planSize.h * zoom}
        scaleX={zoom}
        scaleY={zoom}
        // BEZ `draggable`: przesuwanie widoku obsługuje wyłącznie przewijanie
        // kontenera (patrz `zacznijPrzesuwanie`). Przeciąganie sceny wypychało
        // treść poza płótno, gdzie była przycinana bezpowrotnie.
        onWheel={handleWheel}
        onMouseDown={handleStageMouseDown}
        onMouseMove={handleStageMouseMove}
        onMouseUp={handleStageMouseUp}
        onClick={handleStageClick}
        onContextMenu={handleStageContextMenu}
        style={{ background: "#F7F9FB", cursor: toolMode === "pan" ? "grab" : toolMode === "zaznacz" ? "default" : "crosshair" }}
      >
        {/* `key` zalezny od siatki PRZEMONTOWUJE warstwe przy przelaczeniu. Zwykla
            zmiana `visible` na istniejacych wezlach nie odswiezala rysunku — prop
            docieral do plotna (zmierzone: true -> false), ale linie zostawaly na
            ekranie, a `batchDraw` na warstwie tego nie naprawial. Przemontowanie
            tworzy plotno warstwy od nowa, wiec stan zawsze zgadza sie z widokiem.
            Koszt jest znikomy: to gest uzytkownika, nie cos, co dzieje sie w petli. */}
        <Layer listening={false} key={gridOn ? "tlo-z-siatka" : "tlo-bez-siatki"} ref={warstwaTlaRef}>
          <Rect x={0} y={0} width={planSize.w} height={planSize.h} fill="#F7F9FB" />
          {bgImage && <KonvaImage image={bgImage} x={0} y={0} width={planSize.w} height={planSize.h} opacity={0.85} />}
          {/* Siatkę da się wyłączyć niezależnie od przyciągania. To dwie różne rzeczy:
              przyciąganie porządkuje RYSOWANIE, a siatka jest tylko widoczna — i przy
              wgranym rzucie potrafi zwyczajnie przeszkadzać, przykrywając cienkie
              linie podkładu. Wyłączenie jej nie zmienia sposobu stawiania elementów. */}
          {/* `visible`, a nie warunek przed `map`. Węzły zostają zamontowane i tylko
              zmieniają widoczność — usuwanie ich z drzewa nie przerysowywało warstwy
              i siatka zostawała na płótnie mimo wyłączenia (zmierzone: ta sama liczba
              linii w obu stanach). Zmiana `visible` na istniejącym węźle wymusza
              odrysowanie, więc przełącznik działa natychmiast. */}
          {gridOn &&
            Array.from({ length: Math.floor(planSize.w / GRID) + 1 }, (_, i) => i * GRID).map((x) => (
              <Line key={`gx${x}`} points={[x, 0, x, planSize.h]} stroke="#E1E7EC" strokeWidth={1} />
            ))}
          {gridOn &&
            Array.from({ length: Math.floor(planSize.h / GRID) + 1 }, (_, i) => i * GRID).map((y) => (
              <Line key={`gy${y}`} points={[0, y, planSize.w, y]} stroke="#E1E7EC" strokeWidth={1} />
            ))}
          {/* Widoczna granica obszaru roboczego — po oddaleniu widoku wokół planu robi się
              puste tło i bez obwódki nie było wiadomo, dokąd wolno stawiać elementy. */}
          <Rect x={0} y={0} width={planSize.w} height={planSize.h} stroke="#C3CDD7" strokeWidth={1.5} />
        </Layer>

        <Layer ref={layerRef}>
          {roomShapes.map((r) => {
            const pts = r.points.flatMap((p) => [p.x, p.y]);
            const c = centroid(r.points);
            const isSelRoom = selected?.kind === "room" && selected.id === r.id;
            // Krawędź i nazwa łapią klik TYLKO w trybie zaznaczania, rysowania pomieszczeń
            // i otworów (bo zaraz po narysowaniu pomieszczenia narzędzie zostaje w trybie
            // „pomieszczenie", a użytkownik od razu chce je edytować — to dokładnie
            // zgłoszony przepływ; tryb „otwory" dochodzi z tego samego powodu co przy
            // ścianach, patrz `onRoomEdgeClickForOpening`). Bez tego wyłączenia w INNYCH
            // trybach, `hitStrokeWidth` ciągnący się przez CAŁY obwód pomieszczenia
            // kradłby kliknięcia w trybie „Wstaw Element"/„Narysuj Ścianę" za każdym razem,
            // gdy padają blisko ściany — czyli niemal zawsze, bo gniazdka i łączniki
            // stawia się właśnie przy ścianach.
            const roomInteractive = toolMode === "zaznacz" || toolMode === "pomieszczenie" || toolMode === "otwory";
            return (
              <Group key={r.id}>
                {/* Wypełnienie: CZYSTO WIZUALNE, `listening={false}`. To musi zostać
                    non-listening — inaczej wraca regresja z kroku 60 (wypełniony,
                    zamknięty wielokąt przechwytuje każdy hit-test w swoim wnętrzu,
                    więc zaznaczanie obszarem zaczęte w pustym miejscu pomieszczenia
                    w ogóle się nie uruchamia). Edycję kształtu daje osobna krawędź
                    poniżej, nie to wypełnienie. */}
                <Line
                  ref={(node) => {
                    if (node) roomLineNodesRef.current.set(r.id, node);
                    else roomLineNodesRef.current.delete(r.id);
                  }}
                  listening={false}
                  points={pts}
                  closed
                  fill={`${r.color}22`}
                  stroke={r.color}
                  strokeWidth={isSelRoom ? 2.5 : 1.5}
                />

                {/* Krawędź: OSOBNY, niewidoczny kształt WYŁĄCZNIE do klikania, z szerokim
                    `hitStrokeWidth`. Sam brak `fill` NIE wystarczy — dla `closed` Line
                    Konva domyślnie ma `fillEnabled=true` niezależnie od tego, czy `fill`
                    jest ustawiony, więc na hit-canvasie i tak maluje całe wnętrze i klik
                    w środku trafiał w ten kształt (zweryfikowane przez
                    `Stage.getIntersection`). Dopiero jawne `fillEnabled={false}` ogranicza
                    hit-test do samego obrysu, więc klik gdziekolwiek indziej wewnątrz
                    przechodzi na wylot do sceny — marquee-select zostaje nietknięty, a mimo
                    to trafienie w krawędź nie wymaga pikselowej precyzji. To tu, a nie na
                    wypełnieniu, siedzi zaznaczanie i PPM→usuń: „krawędź" w zgłoszeniu jest
                    dosłowna, nie orientacyjna. */}
                <Line
                  ref={(node) => {
                    if (node) roomHitNodesRef.current.set(r.id, node);
                    else roomHitNodesRef.current.delete(r.id);
                  }}
                  points={pts}
                  closed
                  fillEnabled={false}
                  listening={roomInteractive}
                  stroke="transparent"
                  strokeWidth={1}
                  hitStrokeWidth={14}
                  onClick={(e) => {
                    e.cancelBubble = true;
                    // W trybie „otwory" klik w krawędź pomieszczenia dokłada na niej
                    // drzwi zamiast zaznaczać pomieszczenie — ten sam wzorzec co przy
                    // ścianach (`onWallClickForOpening`), tylko na ZAMKNIĘTYM obrysie
                    // (domykamy pierwszym punktem na końcu, bo `nearestPointOnPolyline`
                    // sam nie zna ostatniego, zamykającego segmentu).
                    if (toolMode === "otwory") {
                      const stage = e.target.getStage();
                      const p = stage && planPoint(stage, planSize);
                      const nearest = p && nearestPointOnPolyline(p, [...r.points, r.points[0]]);
                      if (nearest) onRoomEdgeClickForOpening(r.id, nearest.point, nearest.angle);
                      return;
                    }
                    onSelectRoom(r.id);
                  }}
                  onContextMenu={(e) => {
                    e.evt.preventDefault();
                    e.cancelBubble = true;
                    onRoomContextMenu(r.id, e.evt.clientX, e.evt.clientY);
                  }}
                />

                <Text
                  x={c.x - 40}
                  y={c.y - 6}
                  width={80}
                  align="center"
                  text={r.name}
                  fontSize={11}
                  fill={r.color}
                  listening={roomInteractive}
                  onClick={(e) => {
                    e.cancelBubble = true;
                    onSelectRoom(r.id);
                  }}
                  onDblClick={(e) => {
                    e.cancelBubble = true;
                    onRoomNameDblClick(r.id, e.evt.clientX, e.evt.clientY);
                  }}
                  onContextMenu={(e) => {
                    e.evt.preventDefault();
                    e.cancelBubble = true;
                    onRoomContextMenu(r.id, e.evt.clientX, e.evt.clientY);
                  }}
                />

                {/* Uchwyty narożników — tylko przy zaznaczonym pomieszczeniu. Podgląd
                    przeciągania jest IMPERATYWNY (patrz onDragMove elementów wyżej w tym
                    pliku, ten sam wzorzec): dopiero dragEnd zapisuje do store'a, więc
                    historia cofania dostaje jeden wpis na cały ruch, nie jeden na klatkę.
                    Tylko w trybie „zaznacz" — ten sam wzorzec i powód co przy uchwytach
                    ściany niżej: w trybie „pomieszczenie" klik na płótnie stawia kolejny
                    wierzchołek NOWEGO pomieszczenia, więc uchwyty ISTNIEJĄCEGO by się z
                    tym gryzły (klik blisko narożnika chwytałby za uchwyt zamiast zaczynać
                    rysowanie), a zaznaczenie z poprzedniego trybu potrafi przetrwać
                    przełączenie na „pomieszczenie". */}
                {isSelRoom &&
                  toolMode === "zaznacz" &&
                  r.points.map((p, i) => (
                    <Circle
                      key={i}
                      x={p.x}
                      y={p.y}
                      radius={6}
                      fill="#fff"
                      stroke={r.color}
                      strokeWidth={2}
                      draggable
                      onDragMove={(e) => {
                        const newPts = [...pts];
                        newPts[i * 2] = e.target.x();
                        newPts[i * 2 + 1] = e.target.y();
                        roomLineNodesRef.current.get(r.id)?.points(newPts);
                        roomHitNodesRef.current.get(r.id)?.points(newPts);
                      }}
                      onDragEnd={(e) => {
                        const x = snapOn ? snap(e.target.x(), GRID) : e.target.x();
                        const y = snapOn ? snap(e.target.y(), GRID) : e.target.y();
                        onMoveRoomPoint(r.id, i, { x, y });
                      }}
                      onContextMenu={(e) => {
                        e.evt.preventDefault();
                        e.cancelBubble = true;
                        onRoomContextMenu(r.id, e.evt.clientX, e.evt.clientY);
                      }}
                    />
                  ))}
              </Group>
            );
          })}

          {walls.map((w) => {
            const isSel = selected?.kind === "wall" && selected.id === w.id;
            const pts = w.points.flatMap((p) => [p.x, p.y]);
            return (
              <Group key={w.id}>
                <Line
                  ref={(node) => {
                    if (node) wallLineNodesRef.current.set(w.id, node);
                    else wallLineNodesRef.current.delete(w.id);
                  }}
                  points={pts}
                  stroke={isSel ? "#C1793F" : "#16202B"}
                  strokeWidth={(w.thickness ?? DEFAULT_WALL_THICKNESS) + (isSel ? 2 : 0)}
                  lineCap="round"
                  lineJoin="round"
                  onClick={(e) => {
                    e.cancelBubble = true;
                    // W trybie „otwory" klik w ścianę dokłada na niej drzwi
                    // zamiast ją zaznaczać — patrz `onWallClickForOpening`.
                    if (toolMode === "otwory") {
                      const stage = e.target.getStage();
                      const p = stage && planPoint(stage, planSize);
                      const nearest = p && nearestPointOnPolyline(p, w.points);
                      if (nearest) onWallClickForOpening(w.id, nearest.point, nearest.angle);
                      return;
                    }
                    onSelectWall(w.id);
                  }}
                  onContextMenu={(e) => {
                    e.evt.preventDefault();
                    e.cancelBubble = true;
                    onWallContextMenu(w.id, e.evt.clientX, e.evt.clientY);
                  }}
                />
                {/* Uchwyty narożników — edycja ściany PO zapisie, ten sam wzorzec co
                    przeciąganie narożników pomieszczenia: podgląd imperatywny podczas
                    ruchu (onDragMove), zapis do store'a dopiero na końcu (onDragEnd),
                    więc historia cofania dostaje jeden wpis na cały ruch. Tylko w trybie
                    „zaznacz" — w „ściany" klik na płótnie dokłada nowy punkt ściany, więc
                    uchwyty by się z tym gryzły. */}
                {isSel &&
                  toolMode === "zaznacz" &&
                  w.points.map((p, i) => (
                    <Circle
                      key={i}
                      x={p.x}
                      y={p.y}
                      radius={6}
                      fill="#fff"
                      stroke="#C1793F"
                      strokeWidth={2}
                      draggable
                      onDragMove={(e) => {
                        const newPts = [...pts];
                        newPts[i * 2] = e.target.x();
                        newPts[i * 2 + 1] = e.target.y();
                        wallLineNodesRef.current.get(w.id)?.points(newPts);
                      }}
                      onDragEnd={(e) => {
                        const x = snapOn ? snap(e.target.x(), GRID) : e.target.x();
                        const y = snapOn ? snap(e.target.y(), GRID) : e.target.y();
                        onMoveWallPoint(w.id, i, { x, y });
                      }}
                      onContextMenu={(e) => {
                        e.evt.preventDefault();
                        e.cancelBubble = true;
                        onWallContextMenu(w.id, e.evt.clientX, e.evt.clientY);
                      }}
                    />
                  ))}
              </Group>
            );
          })}

          {/* Otwory: „wycięcie" w kolorze tła planu nad ścianą plus glif — łuk skrzydła
              dla drzwi. Gałąź `o.kind !== "drzwi"` (podwójna linia szyby okna) rysuje
              już tylko STARE otwory z zapisów sprzed usunięcia opcji okna — narzędzie
              stawia od tej pory wyłącznie drzwi, patrz `OpeningKind` w types/index.ts.
              Ściana pod spodem zostaje NIETKNIĘTA (żaden segment nie jest faktycznie
              dzielony) — to czysto wizualne przykrycie, więc edycja ściany
              (przeciąganie narożnika, zmiana grubości) działa bez zmian. */}
          {openings.map((o) => {
            const isSel = selected?.kind === "opening" && selected.id === o.id;
            const wall = walls.find((w) => w.id === o.wallId);
            const wallThickness = (wall?.thickness ?? DEFAULT_WALL_THICKNESS) + 4;
            const halfW = o.width / 2;
            // Obrót o 180° (drzwi) zamienia, który koniec jest zawiasem i w którą
            // stronę skrzydło się otwiera — realizowane jako przesunięcie kąta o π,
            // więc dir/perp/edge1/edge2 poniżej same wychodzą „odwrócone".
            const effAngle = o.angle + (o.flip ? Math.PI : 0);
            const dir = { x: Math.cos(effAngle), y: Math.sin(effAngle) };
            const perp = { x: -dir.y, y: dir.x };
            const edge1 = { x: o.x - dir.x * halfW, y: o.y - dir.y * halfW };
            const edge2 = { x: o.x + dir.x * halfW, y: o.y + dir.y * halfW };
            const angleDeg = (effAngle * 180) / Math.PI;
            const glyphColor = isSel ? "#C1793F" : o.kind === "drzwi" ? "#16202B" : "#2D5A8C";
            return (
              <Group
                key={o.id}
                onClick={(e) => {
                  e.cancelBubble = true;
                  onSelectOpening(o.id);
                }}
                onContextMenu={(e) => {
                  e.evt.preventDefault();
                  e.cancelBubble = true;
                  onOpeningContextMenu(o.id, e.evt.clientX, e.evt.clientY);
                }}
              >
                <Rect
                  x={o.x}
                  y={o.y}
                  width={o.width}
                  height={wallThickness}
                  offsetX={halfW}
                  offsetY={wallThickness / 2}
                  rotation={angleDeg}
                  fill="#F7F9FB"
                  listening={false}
                />
                {/* Szerszy niewidoczny obszar klikalny — sam glif (łuk/dwie cienkie
                    linie) byłby zbyt wąski do wygodnego zaznaczenia/PPM. */}
                <Rect
                  x={o.x}
                  y={o.y}
                  width={o.width}
                  height={wallThickness + 12}
                  offsetX={halfW}
                  offsetY={(wallThickness + 12) / 2}
                  rotation={angleDeg}
                  fill="transparent"
                />
                {o.kind === "drzwi" ? (
                  <>
                    <Line
                      points={[edge1.x, edge1.y, edge1.x + perp.x * o.width, edge1.y + perp.y * o.width]}
                      stroke={glyphColor}
                      strokeWidth={1.5}
                      listening={false}
                    />
                    <Arc
                      x={edge1.x}
                      y={edge1.y}
                      innerRadius={o.width}
                      outerRadius={o.width}
                      angle={90}
                      rotation={angleDeg}
                      stroke={glyphColor}
                      strokeWidth={1}
                      dash={[3, 3]}
                      listening={false}
                    />
                  </>
                ) : (
                  <>
                    <Line
                      points={[
                        edge1.x - (perp.x * wallThickness) / 4, edge1.y - (perp.y * wallThickness) / 4,
                        edge2.x - (perp.x * wallThickness) / 4, edge2.y - (perp.y * wallThickness) / 4,
                      ]}
                      stroke={glyphColor}
                      strokeWidth={1.5}
                      listening={false}
                    />
                    <Line
                      points={[
                        edge1.x + (perp.x * wallThickness) / 4, edge1.y + (perp.y * wallThickness) / 4,
                        edge2.x + (perp.x * wallThickness) / 4, edge2.y + (perp.y * wallThickness) / 4,
                      ]}
                      stroke={glyphColor}
                      strokeWidth={1.5}
                      listening={false}
                    />
                  </>
                )}
              </Group>
            );
          })}

          {zones.map((z) => (
            <Group key={z.id} listening={false}>
              <Circle x={z.x} y={z.y} radius={z.r2} fill="#C1793F14" stroke="#C1793F" strokeWidth={1} dash={[5, 4]} />
              {z.r1 > 0 && <Circle x={z.x} y={z.y} radius={z.r1} fill="#C6433A1A" stroke="#C6433A" strokeWidth={1.2} dash={[3, 3]} />}
              <Text
                x={z.x - 60}
                y={z.y - z.r2 - 14}
                width={120}
                align="center"
                text={`strefy: ${z.label}${!z.calibrated ? " (bez skali)" : ""}`}
                fontSize={8}
                fill="#8A5526"
              />
            </Group>
          ))}

          {/* Trasy przewodów: od rozdzielnicy do każdego punktu obwodu, kolorowane jak
              POMIESZCZENIE punktu docelowego (`colorForRoomName`) — ten sam kolor co
              obrys pokoju na planie, więc od razu widać, do którego pokoju dana trasa
              biegnie, nawet gdy krzyżuje się z innymi. Elementy bez rozpoznanego
              pomieszczenia dostają neutralny szary (`NO_ROOM_COLOR`).
              `viaWalls` odróżnia stylem linii DWA różne poziomy pewności co do trasy
              (patrz `buildCableRoutes`): CIĄGŁA — trasa faktycznie routowana wzdłuż
              narysowanych ścian/obrysów pomieszczeń; PRZERYWANA — zapasowy szacunek
              Manhattan, użyty gdy nie ma po czym routować. Bez tego rozróżnienia
              przerywana linia sugerowałaby pewność, której nie ma.
              `kind` odróżnia dodatkowo ZASILANIE (rozdzielnica → punkt, grubsza linia)
              od STEROWANIA (łącznik → lampa, cieńsza kropkowana) — to fizycznie inna
              para żył w tym samym kablu, więc nie powinny wyglądać identycznie.
              Punkty do rysowania idą z `spreadRoutePoints`, nie z `r.points` wprost —
              trasy dzielące ten sam odcinek ściany dostają tam boczny offset, żeby się
              nie zlewały w jedną linię (patrz `spreadOverlappingRoutes`). Nieinteraktywne —
              `listening={false}`, jak strefy ochronne wyżej. */}
          {cableRoutes.map((r) => {
            const isControl = r.kind === "sterowanie";
            const pts = spreadRoutePoints.get(r.id) ?? r.points;
            return (
              <Line
                key={r.id}
                points={pts.flatMap((p) => [p.x, p.y])}
                stroke={colorForRoomName(r.room, roomShapes)}
                // Grubsza i mniej przezroczysta niż typowa linia poglądowa — odcinek
                // routowany WZDŁUŻ ściany dzieli z nią oś, więc cieniutka, półprzezroczysta
                // kreska ginęła optycznie pod dużo grubszym, ciemnym pociągnięciem ściany.
                // Trasy sterowania są celowo cieńsze i kropkowane — inny rodzaj przewodu.
                strokeWidth={isControl ? 1.5 : 2.5}
                dash={isControl ? [1, 3] : r.viaWalls ? undefined : [6, 4]}
                opacity={0.9}
                lineJoin="round"
                listening={false}
              />
            );
          })}

          {/* Ściana w trakcie rysowania: odcinki już postawione, punkty widoczne na
              każdym kliknięciu, „gumowy" odcinek do kursora i etykieta jego BIEŻĄCEJ
              długości — bez niej trzeba było postawić ścianę na oko i dopiero potem
              sprawdzać, czy wyszła właściwa długość. */}
          {drawingWall.length > 0 && (
            <>
              <Line
                points={drawingWall.flatMap((p) => [p.x, p.y])}
                stroke="#2D5A8C"
                strokeWidth={newWallThickness}
                dash={[6, 4]}
              />
              {drawingWall.map((p, i) => (
                <Circle key={i} x={p.x} y={p.y} radius={4} fill="#2D5A8C" listening={false} />
              ))}
              {wallCursor &&
                (() => {
                  const ostatni = drawingWall[drawingWall.length - 1];
                  const dlugosc = Math.hypot(wallCursor.x - ostatni.x, wallCursor.y - ostatni.y);
                  const midX = (ostatni.x + wallCursor.x) / 2;
                  const midY = (ostatni.y + wallCursor.y) / 2;
                  return (
                    <>
                      <Line
                        points={[ostatni.x, ostatni.y, wallCursor.x, wallCursor.y]}
                        stroke="#2D5A8C"
                        strokeWidth={1.5}
                        dash={[3, 4]}
                        opacity={0.7}
                        listening={false}
                      />
                      <Circle x={wallCursor.x} y={wallCursor.y} radius={4} fill="#fff" stroke="#2D5A8C" strokeWidth={1.5} listening={false} />
                      {dlugosc > 0 && (
                        <Text
                          x={midX - 40}
                          y={midY - 18}
                          width={80}
                          align="center"
                          text={formatDlugosc(dlugosc)}
                          fontSize={11}
                          fontStyle="bold"
                          fill="#2D5A8C"
                          listening={false}
                        />
                      )}
                    </>
                  );
                })()}
            </>
          )}
          {/* Wielobok w trakcie rysowania: odcinki już postawione, „gumowa" linia do
              kursora, oraz WIDOCZNE punkty po każdym kliknięciu (wcześniej była sama
              linia, więc nie było wiadomo, gdzie dokładnie wylądował wierzchołek).
              Pierwszy punkt rośnie i zmienia się w pierścień, gdy kolejny klik zamknie
              figurę — to jedyny sygnał, że przyciąganie do zamknięcia właśnie działa. */}
          {drawingRoomPoints.length > 0 && (
            <>
              <Line points={drawingRoomPoints.flatMap((p) => [p.x, p.y])} stroke="#C1793F" strokeWidth={2} dash={[6, 4]} closed={false} />
              {roomCursor && (
                <Line
                  points={[
                    drawingRoomPoints[drawingRoomPoints.length - 1].x,
                    drawingRoomPoints[drawingRoomPoints.length - 1].y,
                    roomCursor.x,
                    roomCursor.y,
                  ]}
                  stroke="#C1793F"
                  strokeWidth={1.5}
                  dash={[3, 4]}
                  opacity={0.7}
                  listening={false}
                />
              )}
              {drawingRoomPoints.map((p, i) => {
                const isFirst = i === 0;
                const willClose = isFirst && !!roomCursor && closesPolygon(roomCursor);
                return (
                  <Circle
                    key={i}
                    x={p.x}
                    y={p.y}
                    radius={willClose ? 8 : 4}
                    fill={willClose ? "#fff" : "#C1793F"}
                    stroke="#C1793F"
                    strokeWidth={willClose ? 3 : 1.5}
                    listening={false}
                  />
                );
              })}
            </>
          )}

          {/* Podgląd prostokąta w trakcie przeciągania. */}
          {roomRect && (roomRect.w > 0 || roomRect.h > 0) && (
            <Rect
              x={roomRect.x}
              y={roomRect.y}
              width={roomRect.w}
              height={roomRect.h}
              fill="#C1793F1A"
              stroke="#C1793F"
              strokeWidth={2}
              dash={[6, 4]}
              listening={false}
            />
          )}

          {calibPoints.length === 2 && (
            <Line points={calibPoints.flatMap((p) => [p.x, p.y])} stroke="#3B8C63" strokeWidth={2} />
          )}
          {calibPoints.map((p, i) => (
            <Circle key={i} x={p.x} y={p.y} radius={5} fill="#3B8C63" listening={false} />
          ))}

          {elements.map((el) => {
            const def = ELEMENT_TYPES[el.type];
            const isSel = (selected?.kind === "el" && selected.id === el.id) || multiSelected.includes(el.id);
            return (
              <Group
                key={el.id}
                ref={(node) => {
                  if (node) elementNodesRef.current.set(el.id, node);
                  else elementNodesRef.current.delete(el.id);
                }}
                x={el.x}
                y={el.y}
                rotation={el.rotation ?? 0}
                scaleX={elementScale}
                scaleY={elementScale}
                // Przeciąganie działa też w narzędziu „Wstaw element” — kliknięcie na
                // JUŻ POSTAWIONY element (gniazdko, łącznik…) w tym trybie tylko go
                // zaznacza (patrz `onClick` niżej, `cancelBubble` gasi kliknięcie
                // stawiające NOWY element), więc przeciąganie tu nie koliduje z
                // niczym. Bez tego drobna korekta pozycji wymagała przełączenia się
                // na „Zaznacz” i z powrotem — dwa kliknięcia na jeden mały ruch.
                // Pozostałe narzędzia (ściany, pomieszczenia…) zostają wyłączone:
                // tam przeciąganie elementu kolidowałoby z klikaniem kolejnych
                // punktów rysowanej figury.
                draggable={toolMode === "zaznacz" || toolMode === "elementy"}
                onMouseDown={(e) => {
                  e.cancelBubble = true;
                }}
                onClick={(e) => {
                  e.cancelBubble = true;
                  onSelectElement(el.id, e.evt.shiftKey);
                }}
                onDblClick={(e) => {
                  e.cancelBubble = true;
                  onEditElement(el.id);
                }}
                onContextMenu={(e) => {
                  e.evt.preventDefault();
                  e.cancelBubble = true;
                  onElementContextMenu(el.id, e.evt.clientX, e.evt.clientY);
                }}
                onDragStart={() => {
                  // jeśli przeciągany element jest częścią większego zaznaczenia — przesuwamy
                  // całą grupę naraz, nie tylko element pod kursorem
                  if (multiSelected.includes(el.id) && multiSelected.length > 1) {
                    const start: Record<string, Point> = {};
                    multiSelected.forEach((id) => {
                      const node = elementNodesRef.current.get(id);
                      if (node) start[id] = { x: node.x(), y: node.y() };
                    });
                    groupDragRef.current = { ids: multiSelected, start, draggedId: el.id };
                  } else {
                    groupDragRef.current = null;
                  }
                }}
                onDragMove={(e) => {
                  const group = groupDragRef.current;
                  if (!group) return;
                  const draggedStart = group.start[group.draggedId];
                  const dx = e.target.x() - draggedStart.x;
                  const dy = e.target.y() - draggedStart.y;
                  group.ids.forEach((id) => {
                    if (id === group.draggedId) return;
                    const node = elementNodesRef.current.get(id);
                    const start = group.start[id];
                    if (node && start) node.position({ x: start.x + dx, y: start.y + dy });
                  });
                }}
                onDragEnd={(e) => {
                  elementDragJustEndedRef.current = true;
                  const group = groupDragRef.current;
                  groupDragRef.current = null;
                  if (group) {
                    const draggedStart = group.start[group.draggedId];
                    const dx = e.target.x() - draggedStart.x;
                    const dy = e.target.y() - draggedStart.y;
                    const moves = group.ids.map((id) => {
                      const start = group.start[id];
                      const rawX = start.x + dx;
                      const rawY = start.y + dy;
                      const x = snapOn ? snap(rawX, GRID) : rawX;
                      const y = snapOn ? snap(rawY, GRID) : rawY;
                      const node = elementNodesRef.current.get(id);
                      if (node) node.position({ x, y });
                      return { id, x, y };
                    });
                    onMoveElements(moves);
                    return;
                  }
                  const x = snapOn ? snap(e.target.x(), GRID) : e.target.x();
                  const y = snapOn ? snap(e.target.y(), GRID) : e.target.y();
                  e.target.position({ x, y });
                  onMoveElement(el.id, x, y);
                }}
              >
                {isSel && <SelectionOutlineKonva type={el.type} />}
                <ElementGlyphKonva type={el.type} color={def.color} gangs={el.gangs} />
                {/* Numery grup sterowania oświetleniem — ten sam numer przy łączniku i
                    przy punktach, którymi steruje. Stoją OBOK symbolu, poza jego obrysem
                    (patrz `groupLabelAnchors`), i bez obwódki, żeby nie zasłaniać rysunku.
                    Łącznik grupowy ma dwa obwody, więc dostaje dwie cyfry — po jednej przy
                    każdej dźwigni. Obrócone przeciwnie do elementu, żeby po obróceniu
                    symbolu (klawisz „R") cyfra dalej stała prosto. */}
                {(lightGroups.get(el.id) ?? []).map((n, i) => {
                  // Pozycja w tablicy = numer obwodu, więc dziury (obwód bez grupy)
                  // pomijamy zamiast zsuwać — inaczej numer prawej dźwigni wylądowałby
                  // przy lewej.
                  if (n === undefined) return null;
                  const at = groupLabelAnchors(el.type)[i] ?? groupLabelAnchors(el.type)[0];
                  return (
                    <Text
                      key={i}
                      x={at.x}
                      y={at.y}
                      rotation={-(el.rotation ?? 0)}
                      text={String(n)}
                      fontSize={9}
                      fontStyle="700"
                      fill={def.color}
                      width={14}
                      height={14}
                      offsetX={7}
                      offsetY={7}
                      align="center"
                      verticalAlign="middle"
                      listening={false}
                    />
                  );
                })}
              </Group>
            );
          })}

          {marqueeRect && (
            <Rect
              x={marqueeRect.x}
              y={marqueeRect.y}
              width={marqueeRect.w}
              height={marqueeRect.h}
              fill="#2D5A8C14"
              stroke="#2D5A8C"
              strokeWidth={1}
              dash={[4, 3]}
              listening={false}
            />
          )}
        </Layer>
      </Stage>
    </div>
  );
}
