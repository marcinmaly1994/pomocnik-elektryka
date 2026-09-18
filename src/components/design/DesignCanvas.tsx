import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { rozmiescEtykietyGrup, type EtykietaDoRozmieszczenia } from "@/lib/lightGroups";

import { Stage, Layer, Rect, Line, Circle, Arc, Text, Group, Image as KonvaImage } from "react-konva";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import type { CableRoute, ElementType, InstallationElement, Opening, Point, RoomShape, Wall } from "@/types";
import { ELEMENT_TYPES, fixtureSizeM, mountingLabel, SANITARY_FIXTURES, type SanitaryZone } from "@/lib/elements";
import {
  DEFAULT_WALL_THICKNESS,
  gruboscObrysuPokoju,
  krokSiatki,
  MANUAL_DRAW_SCALE_MPU,
  PROG_WASKIEGO_EKRANU,
  type PlanSize,
} from "@/lib/design";
import {
  FALLBACK_FONT_ADNOTACJI,
  FALLBACK_FONT_NAZWY,
  fontOpisuPokoju,
  skalaOpisowRzutu,
  szerokoscRamki,
} from "@/lib/opisPomieszczenia";
import {
  promieniePrzyciagania,
  promienOsi,
  snapDoGeometrii,
  wyrownajDoOsi,
  type Przyciagniecie,
} from "@/lib/drawSnap";
import { spreadOverlappingRoutes } from "@/lib/panel/loads";
import { clampNum, nearestPointOnPolyline, polygonAreaM2, rectangleSizeM, snap } from "@/lib/geometry";
import { ElementGlyphKonva, SelectionOutlineKonva } from "@/components/design/ElementGlyphKonva";
import { glyphBoxSize, groupLabelAnchors, groupLabelCandidates } from "@/lib/glyphs";

export type ToolMode = "zaznacz" | "elementy" | "sciany" | "pomieszczenie" | "otwory" | "pan" | "skala";
export type Selection = { kind: "el" | "wall" | "room" | "opening" | "route"; id: string } | null;

/** Sposób rysowania pomieszczenia: prostokąt przeciągnięciem albo wielobok klikaniem. */
export type RoomDrawMode = "prostokat" | "wielobok";

/** Promień (w jednostkach planu) przyciągania do pierwszego punktu wieloboku —
 *  wieloboku pomieszczenia (`drawingRoomPoints`) i wieloboku ściany (`drawingWall`),
 *  ten sam próg dla obu. Dobrany tak, by dało się trafić myszką bez powiększania,
 *  ale żeby nie zamykać figury przypadkiem przy stawianiu punktu tuż obok startu. */
const POLYGON_CLOSE_RADIUS = 12;
/** Promień (w jednostkach planu) przyciągania czwartego punktu ściany do narożnika,
 *  który domykałby prostokąt (patrz `zPrzyciaganiem`) — wyraźnie mniejszy
 *  niż `POLYGON_CLOSE_RADIUS`: użytkownik prosił o przyciąganie w BARDZO bliskiej
 *  odległości, żeby nie domykało przypadkiem, gdy naprawdę chce postawić punkt obok.
 *  To przyciąganie do NIEOZNACZONEGO, wyliczonego punktu — inaczej niż zamknięcie
 *  wieloboku (`closesPolygon`/`closesWall`), które celuje w punkt już WIDOCZNY na
 *  rysunku, więc może pozwolić sobie na normalny, większy promień. */
const WALL_RECT_SNAP_RADIUS = 6;
/** Poniżej tego rozmiaru (w jednostkach planu) przeciągnięcie traktujemy jak przypadkowe
 *  drgnięcie myszy przy kliknięciu, a nie jak chęć narysowania prostokąta. */
/**
 * Bok znacznika zaczepu i grubość jego kreski — w PIKSELACH EKRANU.
 *
 * Nie w jednostkach planu, i to jest tu sedno. Znacznik jest ozdobą kursora, nie
 * elementem rysunku: ma powiedzieć „złapało tu", a nie zajmować konkretne miejsce na
 * rzucie. Liczony w jednostkach planu rósł razem z powiększeniem — przy skali
 * rysowania (40 px/m) kwadracik miał 24 px zamiast dziesięciu i zasłaniał narożnik,
 * który miał wskazywać. Programy CAD trzymają takie znaczniki w pikselach ekranu.
 */
const ZACZEP_PX = 11;
const ZACZEP_KRESKA_PX = 1.5;

const MIN_ROOM_SIZE = 8;

/** Granice powiększenia widoku planu — wspólne dla Ctrl+scroll i przycisków paska. */
export const MIN_ZOOM = 0.4;
/**
 * Sterowanie kadrem dostępne z zewnątrz płótna.
 *
 * `przesunOPiksele` kompensuje skok rysunku, gdy zmiana szerokości panelu przesunie
 * okno po ekranie; `ustaw` sprowadza kadr pod konkretny punkt planu — bez tego na
 * płótnie bez granic dało się odjechać dowolnie daleko i nie mieć jak wrócić.
 */
export interface WidokSterowanie {
  przesunOPiksele(dxPx: number, dyPx: number): void;
  ustaw(x: number, y: number): void;
}

export const MAX_ZOOM = 4;

/** Dolna granica powiększenia na wąskim ekranie — patrz `minZoom`. */
export const MIN_ZOOM_WASKI = 0.2;

/**
 * Dolna granica powiększenia, zależna od szerokości okna.
 *
 * Na monitorze zostaje 0,4: niżej symbole osprzętu przestają być rozróżnialne, a
 * miejsca i tak nie brakuje. Na telefonie ta sama granica znaczyła co innego —
 * kolumna planu ma tam około 250 px, a plan przy 0,4 zajmuje 400 px, więc CAŁEGO
 * mieszkania nie dawało się zobaczyć ani razu, nawet po dopasowaniu widoku.
 * Alternatywą dla drobnego rzutu nie był większy rzut, tylko oglądanie go przez
 * dziurkę — stąd 0,2 poniżej progu.
 */
export function minZoom(): number {
  const okno = typeof window === "undefined" ? 1280 : window.innerWidth;
  return okno < PROG_WASKIEGO_EKRANU ? MIN_ZOOM_WASKI : MIN_ZOOM;
}

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
  /**
   * Kanał do PORZUCENIA podglądów rysowanych wewnątrz tego komponentu — płótno
   * wstawia tu swoją funkcję, rodzic ją wywołuje (zwraca `true`, jeśli faktycznie
   * było co porzucić).
   *
   * Potrzebny, bo Escape obsługuje DesignTab, a prostokąt pomieszczenia i ramka
   * zaznaczania żyją w stanie LOKALNYM płótna — celowo, bo zmieniają się przy każdym
   * ruchu myszy i wyniesienie ich wyżej przerysowywałoby całą zakładkę na każdą
   * klatkę przeciągania. Bez tego kanału Escape czyścił stan rodzica, a narysowany
   * prostokąt zostawał na ekranie.
   *
   * Ten sam wzorzec co `stageRef` wyżej: zwykły ref w propsie, nie `forwardRef` —
   * żeby oba wyjścia z płótna wyglądały tak samo.
   */
  anulujPodgladRef?: React.MutableRefObject<(() => boolean) | null>;
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
  /** Geometria kondygnacji PONIŻEJ, rysowana jako przygaszony podkład. `null`, gdy
   *  podgląd wyłączony albo nie ma czego pokazać (najniższa kondygnacja). */
  podklad: { walls: Wall[]; roomShapes: RoomShape[]; elements: InstallationElement[] } | null;
  /** Tryb wymiarowania: dlugosci WSZYSTKICH scian i wymiary prostokatnych pomieszczen.
   *  Ustawienie widoku, wlaczane w pasku edytora — patrz komentarze przy obu miejscach. */
  pokazWymiary: boolean;
  /**
   * Powierzchnia pomieszczenia jako podpis pod nazwą.
   *
   * Osobny przełącznik od wymiarów, bo jest przydatna DOKŁADNIE TAM, gdzie wymiary
   * zawodzą: „a × b" da się podać tylko dla prostokąta, a pole liczy się z obrysu,
   * więc jest prawdziwe dla trójkąta, trapezu, wykuszu i litery L tak samo.
   */
  pokazPowierzchnie: boolean;
  /** Wysokości montażu przy symbolach osprzętu („+30", „+110" — patrz `mountingLabel`).
   *  Osobny przełącznik od wymiarów ścian: tamte opisują BUDYNEK, te INSTALACJĘ, i na
   *  gotowym rzucie chce się je zwykle widzieć osobno. */
  pokazWysokosci: boolean;
  /** Wizualne trasy przewodów (rozdzielnica → punkt), patrz `buildCableRoutes` —
   *  pusta tablica, gdy na kondygnacji nie ma rozdzielnicy albo widoczność wyłączona. */
  cableRoutes: CableRoute[];
  /** Ręczne poprawki tras (środkowe punkty), kluczowane `CableRoute.id` — patrz
   *  `Draft.routeOverrides` w store. Tu wyłącznie do rozpoznania, KTÓRE trasy są
   *  ręcznie zmienione (styl linii, wyłączenie z rozsuwania równoległych tras) —
   *  same punkty do narysowania są już wmieszane w `cableRoutes` przez DesignTab
   *  (`applyRouteOverrides`), więc to pole nie steruje samym rysowaniem ścieżki. */
  routeOverrides: Record<string, Point[]>;
  /** Numery grup sterowania oświetleniem, wyliczone w DesignTab (lib/lightGroups.ts). */
  lightGroups: Map<string, (number | undefined)[]>;
  /** Skala renderu symboli osprzętu — suwak razy wyrównanie do skali rzutu
   *  (patrz `elementRenderScale`). */
  elementScale: number;
  /** Skala renderu przyborów sanitarnych. Osobna, bo ich obrys ma odpowiadać
   *  PRAWDZIWYM wymiarom wanny/brodzika — patrz `sanitaryRenderScale`. */
  sanitaryScale: number;
  /** Obszar roboczy planu — dopasowany do proporcji wgranego rzutu (patrz store). */
  planSize: PlanSize;
  /**
   * Rozmiar OKNA widoku w pikselach — tyle miejsca zajmuje płótno na stronie.
   *
   * Scena ma rozmiar okna, a nie arkusza: treść wypchnięta poza scenę jest przycinana
   * bezpowrotnie, więc przy przesuwaniu rysunku scena MUSI obejmować całe widoczne
   * pole. Kadr wyznacza odtąd stan `widok`, nie przewinięcie kontenera.
   */
  rozmiarOkna: { w: number; h: number };
  /**
   * Uchwyt do sterowania kadrem z zewnątrz. Ten sam wzorzec co `anulujPodgladRef`:
   * zwykły ref w propsie, bo wołającym są zdarzenia w `DesignTab` (zmiana szerokości
   * panelu bocznego, przycisk „Dopasuj widok"), a nie zmiana danych.
   *
   * Kadr mieszka tutaj, więc przeliczenie pikseli na jednostki planu też musi być
   * tutaj — `DesignTab` nie ma prawa wiedzieć, jak wygląda ten układ współrzędnych.
   */
  widokRef?: React.MutableRefObject<WidokSterowanie | null>;
  /** Metrów na jednostkę planu — `null` bez kalibracji. Do etykiety wymiaru
   *  pokazywanej na żywo podczas rysowania ściany (patrz `drawingWall`). */
  metersPerUnit: number | null;
  /** Pozycja kursora w jednostkach planu (null = poza planem) — do paska stanu. */
  onPointerMove?: (p: Point | null) => void;
  /** Powiększenie widoku. Sterowane z paska narzędzi, więc trzymane w stanie
   *  Reacta zamiast wyłącznie imperatywnie na scenie — inaczej pasek nie miałby
   *  skąd wziąć aktualnej wartości do pokazania. */
  zoom: number;
  onZoomChange: (z: number) => void;
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
  onSelectRoute: (id: string) => void;
  /** Zapisuje CAŁĄ nową tablicę środkowych punktów trasy (nie pojedynczy indeks) —
   *  prostsze niż mutacja po indeksie przez granicę propsów, a wywołujący i tak ma
   *  pod ręką pełną, świeżą listę (patrz przeciąganie/wstawianie/kasowanie uchwytu
   *  niżej). Pusta tablica cofa do routingu automatycznego, tak jak `onResetRoute`. */
  onSetRoutePoints: (routeId: string, midPoints: Point[]) => void;
  /** Kasuje ręczną poprawkę — trasa wraca do automatycznego routingu. */
  onResetRoute: (routeId: string) => void;
  onClearSelection: () => void;
  onMarqueeSelect: (ids: string[]) => void;
  onPlaceElement: (p: Point) => void;
  onMoveElement: (id: string, x: number, y: number) => void;
  onMoveElements: (moves: { id: string; x: number; y: number }[]) => void;
  onAddWallPoint: (p: Point) => void;
  /** Klik, który zamyka wielobok ściany (przyciągnięty do jej pierwszego punktu —
   *  patrz `closesWall`) — zatwierdza ścianę od razu z podanym punktem domykającym
   *  dołożonym na koniec, bez czekania na osobne „Zakończ". Ten sam wzorzec co
   *  `onCloseRoomPolygon`, tylko że ściana (w odróżnieniu od pomieszczenia) nie ma
   *  osobnej reprezentacji „zamkniętej" — zamknięcie to zwykły ostatni punkt równy
   *  pierwszemu (patrz `finishWall`/`createWallFromRoom` w DesignTab). */
  onCloseWall: (p: Point) => void;
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
 * Punkt planu pod kursorem. `null` znaczy wyłącznie „nie wiadomo, gdzie jest kursor"
 * (scena bez wskaźnika), a nie „kursor poza czymś".
 *
 * Płótno nie ma granic, więc nie ma też punktów spoza planu. Wcześniej stały tu dwie
 * funkcje: jedna odrzucała kliknięcia poza arkuszem, druga przycinała do niego
 * trwające przeciąganie. Obie pilnowały granicy, której już nie ma — rysunek nie musi
 * mieścić się w arkuszu, bo arkusz jest teraz tylko podkładem pod rysunkiem.
 */
function planPoint(stage: Konva.Stage): Point | null {
  return stage.getRelativePointerPosition();
}

/** Indeks odcinka [i, i+1] łamanej `points` najbliższego punktowi `p` — do
 *  wstawienia nowego załamania trasy dokładnie tam, gdzie użytkownik dwukliknął,
 *  zamiast zawsze na końcu. `nearestPointOnPolyline` w geometry.ts liczy to samo,
 *  ale nie zwraca indeksu, którego tu akurat potrzeba. */
function nearestRouteSegmentIndex(p: Point, points: Point[]): number {
  let bestIdx = 0;
  let bestDistSq = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) continue;
    const t = clampNum(((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq, 0, 1);
    const distSq = (p.x - (a.x + t * dx)) ** 2 + (p.y - (a.y + t * dy)) ** 2;
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      bestIdx = i;
    }
  }
  return bestIdx;
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
  anulujPodgladRef,
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
  podklad,
  pokazWymiary,
  pokazPowierzchnie,
  pokazWysokosci,
  cableRoutes,
  routeOverrides,
  lightGroups,
  elementScale,
  sanitaryScale,
  planSize,
  rozmiarOkna,
  widokRef,
  metersPerUnit,
  onPointerMove,
  zoom,
  onZoomChange,
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
  onSelectRoute,
  onSetRoutePoints,
  onResetRoute,
  onClearSelection,
  onMarqueeSelect,
  onPlaceElement,
  onMoveElement,
  onMoveElements,
  onAddWallPoint,
  onCloseWall,
  onAddRoomPoint,
  onRoomRectDrawn,
  onCloseRoomPolygon,
  onAddCalibPoint,
}: DesignCanvasProps) {
  /** Osprzęt idzie za suwakiem „Rozmiar elementów", przybory sanitarne nie — ich obrys
   *  jest strefą 1 i musi zgadzać się z tym, co liczy walidator (patrz `sanitaryRenderScale`). */
  const skalaSymbolu = (type: ElementType) => (SANITARY_FIXTURES[type] ? sanitaryScale : elementScale);

  /**
   * Strona symbolu, po której staje etykieta numeru grupy — wybierana tak, żeby cyfry
   * sąsiadów na siebie nie wchodziły.
   *
   * Domyślnie etykieta stała ZAWSZE po prawej, więc dwa łączniki po przeciwnych stronach
   * ściany — a tak stawia je każdy, kto montuje je przy tej samej framudze — wypychały
   * cyfry ku sobie. W projekcie przykładowym łącznik kuchenny stoi 67 cm od salonowego
   * schodowego i jego „1" wyglądało jak drugi numer schodowego, który ma „4".
   *
   * Liczone TUTAJ, a nie w `DesignTab` razem z samymi numerami, bo wybór zależy od skali
   * symboli — a ta jest znana dopiero w płótnie (`skalaSymbolu`).
   */
  const kotwiceEtykiet = useMemo(() => {
    const doRozmieszczenia: EtykietaDoRozmieszczenia[] = [];
    elements.forEach((el) => {
      (lightGroups.get(el.id) ?? []).forEach((n, i) => {
        if (n === undefined) return;
        doRozmieszczenia.push({
          klucz: `${el.id}:${i}`,
          srodek: { x: el.x, y: el.y },
          rotacja: el.rotation ?? 0,
          kandydaci: groupLabelCandidates(el.type, i),
          skala: SANITARY_FIXTURES[el.type] ? sanitaryScale : elementScale,
        });
      });
    });
    // Odstęp mierzony rozmiarem samej cyfry (pudełko 14 jedn.), przeskalowanym tak samo
    // jak symbol — inaczej próg byłby poprawny wyłącznie przy rysunku odręcznym.
    return rozmiescEtykietyGrup(doRozmieszczenia, 40 * elementScale);
  }, [elements, lightGroups, elementScale, sanitaryScale]);

  /**
   * Obszar TRAFIENIA symbolu — osobny od tego, co widać.
   *
   * Część symboli to sama kreska albo okrąg (punkt sufitowy, czujnik), więc klikalne
   * jest w nich dokładnie to, co narysowane — narożniki i przerwy już nie. Przy małym
   * powiększeniu albo małym symbolu trafienie zaczyna wymagać celowania w piksel,
   * a kliknięcie w element to najczęstsza czynność w całym edytorze. Przezroczysty
   * prostokąt o rozmiarze pudełka glifu robi z całego symbolu jeden cel, niezależnie
   * od tego, ile w nim narysowanej kreski.
   *
   * BEZ minimum liczonego w pikselach ekranu, choć kusi. Taka podłoga musi mieć
   * ograniczenie górne, bo inaczej przy najmniejszym powiększeniu wyhodowałaby cel
   * wielkości pokoju i element kradłby kliknięcia sąsiadom oraz narzędziu stawiania.
   * A to ograniczenie kasuje zarazem cały zysk z podłogi — zmierzone: klik 5 px obok
   * środka przy maksymalnym oddaleniu chybia tak samo z podłogą, jak i bez niej.
   * Zostaje sama złożoność. Przy tak oddalonym rzucie i tak się nie celuje: się przybliża.
   */

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
  /** Kontener okna widoku. Nie przewija się już — kadr wyznacza stan `widok`. */
  const kontenerRef = useRef<HTMLDivElement>(null);
  /**
   * Lewy górny róg OKNA w jednostkach planu. To jedyny nośnik kadru: narzędzie
   * „Przesuń widok", wciśnięta rolka i Ctrl+kółko ruszają wyłącznie tę wartość.
   *
   * Wcześniej kadr wyznaczało przewinięcie kontenera, a scena miała rozmiar arkusza.
   * Działało, dopóki rysunek nie miał prawa wyjść poza arkusz — ale to właśnie ten
   * arkusz znika. Scena wielkości okna plus przesunięcie w jednostkach planu daje
   * płótno bez granic, bez drugiego układu współrzędnych obok pierwszego.
   */
  const [widok, setWidok] = useState({ x: 0, y: 0 });
  const przesuwanieRef = useRef<{ x: number; y: number; widokX: number; widokY: number } | null>(null);
  /** Punkt planu, który ma zostać pod kursorem po zmianie powiększenia Ctrl+kółkiem.
   *  Nakładany dopiero po przerysowaniu płótna — patrz `useLayoutEffect` niżej. */
  const kotwicaZoomRef = useRef<{ planX: number; planY: number; kursorX: number; kursorY: number } | null>(null);
  /**
   * Wystawia sterowanie kadrem na zewnątrz. `useLayoutEffect`, bo `DesignTab` woła
   * `przesunOPiksele` ze SWOJEGO efektu układu — a efekty układu dziecka wchodzą przed
   * efektami rodzica, więc przy zwykłym `useEffect` uchwyt bywałby jeszcze pusty.
   */
  useLayoutEffect(() => {
    if (!widokRef) return;
    widokRef.current = {
      przesunOPiksele: (dxPx, dyPx) => {
        if (dxPx === 0 && dyPx === 0) return;
        setWidok((w) => ({ x: w.x + dxPx / zoom, y: w.y + dyPx / zoom }));
      },
      ustaw: (x, y) => setWidok({ x, y }),
    };
    return () => {
      widokRef.current = null;
    };
  }, [widokRef, zoom]);

  /**
   * Skok siatki, jeden dla rysowania kratki i dla przyciągania. Wspólna wartość jest
   * tu istotna: przyciąganie do innego skoku niż widoczna kratka to najgorszy możliwy
   * wariant — użytkownik celuje w linię, którą widzi, a punkt siada gdzie indziej.
   */
  const krok = useMemo(() => krokSiatki(metersPerUnit, zoom), [metersPerUnit, zoom]);

  /**
   * Linie siatki liczone z WIDOCZNEGO prostokąta, nie z arkusza. Dopóki rysunek musiał
   * mieścić się w arkuszu, siatka mogła kończyć się razem z nim; teraz rysować można
   * wszędzie, więc kratka ma być wszędzie tam, gdzie widać płótno.
   *
   * Oczko nie potrzebuje już dolnej blokady: skok idzie za powiększeniem (patrz
   * `krokSiatki`), więc kratka z definicji nie zejdzie poniżej progu czytelności.
   */
  const siatka = useMemo(() => {
    const lewo = widok.x;
    const gora = widok.y;
    const prawo = widok.x + rozmiarOkna.w / zoom;
    const dol = widok.y + rozmiarOkna.h / zoom;
    const linie = (od: number, doKad: number) => {
      const start = Math.floor(od / krok) * krok;
      const ile = Math.floor((doKad - start) / krok) + 1;
      return Array.from({ length: Math.max(0, ile) }, (_, i) => start + i * krok);
    };
    return { lewo, prawo, gora, dol, pionowe: linie(lewo, prawo), poziome: linie(gora, dol) };
  }, [widok.x, widok.y, rozmiarOkna.w, rozmiarOkna.h, zoom, krok]);

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
  // Ten sam wzorzec co przy ścianach/pomieszczeniach: podgląd przeciągania uchwytu
  // trasy jest imperatywny (onDragMove aktualizuje węzeł Line wprost), zapis do
  // store'a dopiero na onDragEnd — jeden wpis w historii na cały ruch.
  const routeLineNodesRef = useRef<Map<string, Konva.Line>>(new Map());
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
  /** Prostokąt domknięty przeciągnięciem — gasi `click`, który Konva wysyła zaraz
   *  po `mouseup` (patrz `handleStageMouseUp`). */
  const roomRectJustDrawnRef = useRef(false);

  /**
   * Porzuca WSZYSTKO, co jest w trakcie rysowania wewnątrz płótna: podgląd prostokąta
   * pomieszczenia i ramkę zaznaczania. Zwraca, czy faktycznie było co porzucać —
   * rodzic potrzebuje tego do reguły „Escape robi jedną rzecz naraz" (najpierw
   * porzuca rysowanie, dopiero potem wychodzi z pełnego ekranu).
   *
   * Zerowanie KOTWIC (`*StartRef`), nie tylko widocznego podglądu, jest tu istotne:
   * Escape wciśnięty z wciąż wciśniętym przyciskiem myszy zostawiał kotwicę, więc
   * puszczenie przycisku i tak zakładało pomieszczenie — mimo że użytkownik właśnie
   * powiedział „anuluj". `handleStageMouseUp` wychodzi bez efektu, gdy kotwica jest
   * pusta, więc samo jej wyczyszczenie wystarczy.
   */
  function anulujPodglad(): boolean {
    const przeciaganieProstokata = roomRectStartRef.current !== null;
    const bylo = przeciaganieProstokata || roomRect !== null || marqueeStartRef.current !== null || marqueeRect !== null;

    // Po `mouseup` Konva wyśle jeszcze `click`. Tylko przy PRZERWANYM PRZECIĄGANIU
    // trzeba go zjeść — inaczej puszczenie przycisku od razu stawiałoby kotwicę
    // nowego prostokąta w tym samym miejscu. Przy anulowaniu bez wciśniętej myszy
    // (tryb dwóch kliknięć) tej flagi NIE wolno ustawiać, bo zjadłaby następne,
    // całkiem już zamierzone kliknięcie użytkownika.
    if (przeciaganieProstokata) roomRectJustDrawnRef.current = true;

    roomRectStartRef.current = null;
    roomRectRef.current = null;
    marqueeStartRef.current = null;
    marqueeRectRef.current = null;
    setRoomRect(null);
    setMarqueeRect(null);
    setZaczep(null);
    return bylo;
  }

  // Bez tablicy zależności — funkcja domyka się nad świeżym stanem przy każdym
  // renderze, więc ref musi wskazywać na tę najnowszą wersję, a nie na pierwszą.
  useEffect(() => {
    if (!anulujPodgladRef) return;
    anulujPodgladRef.current = anulujPodglad;
    return () => {
      anulujPodgladRef.current = null;
    };
  });
  // Pozycja kursora w trybie wieloboku — do „gumowej" linii od ostatniego punktu i do
  // podświetlenia punktu startowego, gdy kolejny klik zamknie figurę.
  const [roomCursor, setRoomCursor] = useState<Point | null>(null);
  // To samo dla rysowania ścian — „gumowy" odcinek od ostatniego postawionego
  // punktu do kursora, z etykietą bieżącej długości (patrz render niżej).
  const [wallCursor, setWallCursor] = useState<Point | null>(null);
  /**
   * Zaczep, na którym stoi w tej chwili rysowany punkt — narożnik albo krawędź już
   * narysowanej ściany/pomieszczenia, do której go przyciągnęło (`null`, gdy stoi
   * wolno). Wyłącznie do PODŚWIETLENIA: bez niego przyciąganie jest niewidzialne,
   * a niewidzialne przyciąganie jest nie do odróżnienia od celnego kliknięcia —
   * użytkownik nie wie, czy ściany faktycznie się zeszły, czy tylko tak wyglądają.
   */
  const [zaczep, setZaczep] = useState<Przyciagniecie | null>(null);

  const drawingRoom = toolMode === "pomieszczenie";

  // Trasy niezależnie policzone (`buildCableRoutes`) potrafią przebiegać dokładnie
  // tym samym odcinkiem ściany (np. dwa obwody gniazdek w tym samym pomieszczeniu) —
  // bez tego trasy renderowałyby się jako jedna zlana linia. `spreadOverlappingRoutes`
  // liczy WYŁĄCZNIE punkty do rysowania (offset prostopadły do wspólnego odcinka),
  // reszta pól `CableRoute` (długość, kolor, styl) zostaje autorytatywna z `r`.
  // Trasy z RĘCZNĄ poprawką są wyłączone z rozsuwania — użytkownik jawnie ułożył ich
  // przebieg, więc automatyczny boczny offset przesunąłby linię od miejsca, w które ją
  // przeciągnął. Wyłączenie ich z listy „współlokatorów" danego odcinka jest też
  // poprawne dla POZOSTAŁYCH tras: skoro edytowana trasa nie biegnie już tym odcinkiem
  // ściany, nie powinna zajmować w nim pasa.
  const spreadRoutePoints = useMemo(
    () => spreadOverlappingRoutes(cableRoutes.filter((r) => !(r.id in routeOverrides)), roomShapes),
    [cableRoutes, routeOverrides, roomShapes]
  );

  /**
   * Przyciągnięcie do siatki — dla GEOMETRII BUDYNKU (ściany i obrysy pomieszczeń,
   * rysowane i przeciągane za uchwyty), nie dla elementów instalacji.
   *
   * Otwory (drzwi) są poza tym podziałem celowo: przypinają się do LINII ŚCIANY
   * przez `nearestPointOnPolyline`, bo drzwi mają siedzieć w ścianie, a nie na
   * najbliższym oczku siatki obok niej.
   *
   * To rozróżnienie jest celowe. Siatka to podziałka w okrągłych metrach (patrz
   * `krokSiatki`) — właściwa dla ścian, bo dom ma wymiary w pełnych i połówkowych
   * metrach. Dla gniazdka czy łącznika ta sama podziałka jest za zgrubna: punkt
   * kliknięty przy framudze odskakiwałby na najbliższe oczko, czyli na środek ściany.
   * Element ląduje więc dokładnie tam, gdzie kliknięto — o resztę dba
   * `ROOM_SNAP_TOLERANCE_M` w DesignTab, która przypisuje go do właściwego
   * pomieszczenia, gdy wypadł tuż obok jego obrysu (nie przesuwa go).
   *
   * Odkąd oczko idzie za powiększeniem, ten podział broni się jeszcze lepiej: przy
   * mocno przybliżonym widoku kratka schodzi do 20 cm, więc przyciąganie ścian jest
   * dokładniejsze niż dawniej — a element i tak nie ma po co na nią wskakiwać.
   */
  /** Grubosc obrysu pomieszczen w jednostkach planu — jedna dla calego rysunku,
   *  bo skala jest wspolna. Liczona raz, nie w petli po pomieszczeniach. */
  const grubosciObrysu = gruboscObrysuPokoju(metersPerUnit);
  /**
   * Mnożnik WSZYSTKICH napisów rzutu — patrz `skalaOpisowRzutu`. Dotychczasowe stałe
   * (8,5 / 11 / 12 i ich odsunięcia) zostają w kodzie jako punkt odniesienia i idą
   * przez ten mnożnik, więc wzajemne proporcje napisów są dokładnie te co przedtem,
   * a zmienia się tylko ich wspólna wielkość względem rysunku.
   */
  const so = skalaOpisowRzutu(metersPerUnit);

  function withSnap(p: Point): Point {
    return snapOn ? { x: snap(p.x, krok), y: snap(p.y, krok) } : p;
  }

  /**
   * Przyciągnięcie do GEOMETRII, która już jest na rzucie — obrysów pomieszczeń
   * i ścian. `null`, gdy nic nie jest w zasięgu.
   *
   * NIE zależy od przełącznika „przyciągaj do siatki" i to jest świadome. Siatkę gasi
   * się na wgranym podkładzie, bo ściany na zdjęciu nie leżą na jej oczkach (patrz
   * `setSnapOn` w DesignTab) — ale to jest argument przeciwko SIATCE, nie przeciwko
   * dociąganiu do ściany, którą użytkownik sam przed chwilą narysował. Szczelina kilku
   * centymetrów między dwoma pokojami nie jest niczyim zamiarem.
   *
   * Wspólne dla OBU narzędzi rysujących, i to jest sedno tej funkcji: ściana ma łapać
   * ścianę i pokój, pokój ma łapać pokój i ścianę. Wcześniej przyciągały się wyłącznie
   * pomieszczenia do pomieszczeń, więc dorysowanie ścianki działowej do już postawionej
   * ściany wymagało trafienia co do piksela, a pokój rysowany wewnątrz gotowego obrysu
   * ścian nie łapał go wcale (patrz `lib/drawSnap.ts`).
   */
  function przyciagnijDoGeometrii(p: Point): Przyciagniecie | null {
    const { naroznik, krawedz } = promieniePrzyciagania(metersPerUnit);
    return snapDoGeometrii(p, { roomShapes, walls }, naroznik, krawedz);
  }

  /**
   * Przyciąganie punktu RYSOWANEGO POMIESZCZENIA — najpierw do istniejącej geometrii,
   * dopiero potem do siatki.
   *
   * Kolejność jest tu całą treścią: pokoje w domu stykają się ścianami, więc trafienie
   * w krawędź sąsiada jest ważniejsze niż trafienie w linię siatki. Bok pomieszczenia
   * może mieć dowolną długość, więc jego krawędź wcale nie musi leżeć na siatce —
   * i wtedy sąsiad przyciągnięty do siatki mija się z nią o kilka jednostek, zostawiając
   * szczelinę albo zachodząc na niego.
   */
  function snapPunktuPokoju(p: Point): Point {
    return punktPokojuZZaczepem(p).punkt;
  }

  /**
   * Punkty, do których PIONU i POZIOMU wyrównuje się rysowany wierzchołek.
   *
   * Dwa źródła, oba wynikające z tego, jak się rysuje pokój. Pierwsze to wierzchołki
   * FIGURY WŁAŚNIE RYSOWANEJ: druga i trzecia ściana mają stanąć prostopadle do
   * pierwszej, a nie o dwa stopnie od niej. Drugie to narożniki geometrii, KOŁO KTÓREJ
   * stoi kursor — dostawiając pokój do sąsiada, wyrównuje się do jego ścian.
   *
   * Narożniki są filtrowane odległością od kursora, i to nie dla wydajności: oś ciągnie
   * się przez cały rysunek, więc branie wszystkich narożników mieszkania robiłoby
   * kursor lepkim wszędzie. Wyrównanie ma pomagać przy sąsiedzie, przy którym się stoi.
   */
  const ZASIEG_OSI_M = 3;
  function kandydaciOsi(p: Point): Point[] {
    const mpu = metersPerUnit !== null && metersPerUnit > 0 ? metersPerUnit : MANUAL_DRAW_SCALE_MPU;
    const zasieg = ZASIEG_OSI_M / mpu;
    const wPoblizu = (q: Point) => Math.hypot(q.x - p.x, q.y - p.y) <= zasieg;
    return [
      ...drawingRoomPoints,
      ...roomShapes.flatMap((r) => r.points).filter(wPoblizu),
      ...walls.flatMap((w) => w.points).filter(wPoblizu),
    ];
  }

  /** To samo, ale razem z zaczepem, który o położeniu punktu zadecydował — patrz
   *  `punktScianyZZaczepem` niżej, gdzie stoi powód takiej pary. */
  function punktPokojuZZaczepem(p: Point): { punkt: Point; zaczep: Przyciagniecie | null } {
    const z = przyciagnijDoGeometrii(p);
    // Trafienie w samą geometrię wygrywa: skoro punkt siada na narożniku sąsiada, to
    // jest już wyrównany do wszystkiego, do czego trzeba.
    if (z) return { punkt: z.point, zaczep: z };

    // Wyrównanie do osi liczymy z punktu SUROWEGO, nie z przyciągniętego do siatki:
    // siatka zaokrągla do pół metra, więc najpierw zniosłaby punkt z osi, a potem oś
    // ściągałaby go z powrotem — przy oczku drobniejszym niż tolerancja osi wychodziły
    // z tego skoki. Oś ma pierwszeństwo, siatka dopala tę współrzędną, której oś nie
    // złapała.
    const naSiatce = withSnap(p);
    const w = wyrownajDoOsi(p, kandydaciOsi(p), promienOsi(metersPerUnit));
    return {
      punkt: { x: w.osX ? w.punkt.x : naSiatce.x, y: w.osY ? w.punkt.y : naSiatce.y },
      zaczep: null,
    };
  }

  /** Przy rysowaniu ortogonalnym zamraża oś BLIŻSZĄ poprzedniemu punktowi na jego
   *  wartości — odcinek wychodzi idealnie poziomy albo pionowy, w zależności od
   *  tego, w którą stronę kursor odsunął się bardziej. */
  function orthoSnap(last: Point, p: Point): Point {
    const dx = Math.abs(p.x - last.x);
    const dy = Math.abs(p.y - last.y);
    return dx >= dy ? { x: p.x, y: last.y } : { x: last.x, y: p.y };
  }

  /**
   * Narożnik, który domknąłby prostokąt zaczęty punktami `p0`→`p1`→`p2` — leżący
   * naprzeciw `p1`. W trybie ortogonalnym `p1→p2` jest już prostopadłe do `p0→p1`
   * (patrz `orthoSnap`), więc ten punkt daje prawdziwy prostokąt (równoległe ściany),
   * nie tylko równoległobok.
   */
  function sugerowanyNaroznik(p0: Point, p1: Point, p2: Point): Point {
    return { x: p0.x + (p2.x - p1.x), y: p0.y + (p2.y - p1.y) };
  }

  /**
   * Przyciąganie punktu ściany do dwóch celów — sprawdzanych w tej kolejności:
   *
   * 1. Zamknięcie wieloboku: kursor blisko PIERWSZEGO postawionego punktu (patrz
   *    `closesWall`) — to punkt już WIDOCZNY na rysunku, więc ma pierwszeństwo przed
   *    poniższym, bo bliskość niego prawie na pewno oznacza „chcę zamknąć figurę
   *    tutaj", niezależnie od trybu ortogonalnego (zamknięcie wieloboku pomieszczenia
   *    też nie jest z niczym warunkowane).
   * 2. Czwarty punkt (`drawingWall.length === 3`) dostaje przyciąganie do narożnika,
   *    który domknąłby prostokąt zaczęty pierwszymi trzema — bez niego trzeba było
   *    trafić w niego co do piksela, żeby ściana 4 wyszła dokładnie równoległa do
   *    ściany 2. Promień CELOWO mały (patrz `WALL_RECT_SNAP_RADIUS`): to poprawka
   *    drobnej niedokładności kliknięcia, nie zamiennik świadomego stawiania punktu
   *    w pobliżu — inaczej niż (1), bo to punkt WYLICZONY, nigdzie nie narysowany.
   *
   * Poza tymi dwoma przypadkami zwraca `null` — „nic z rysowanej ściany nie złapało",
   * co `punktSciany` odróżnia od trafienia i dopiero wtedy pyta o geometrię obok.
   */
  function zPrzyciaganiem(p: Point): Point | null {
    if (closesWall(p)) return drawingWall[0];
    if (orthoWalls && drawingWall.length === 3) {
      const naroznik = sugerowanyNaroznik(drawingWall[0], drawingWall[1], drawingWall[2]);
      if (Math.hypot(p.x - naroznik.x, p.y - naroznik.y) <= WALL_RECT_SNAP_RADIUS) return naroznik;
    }
    return null;
  }

  /**
   * Punkt ściany po WSZYSTKICH przyciąganiach, w kolejności, która ma znaczenie:
   * siatka → kąt prosty → domknięcie/narożnik → istniejąca geometria.
   *
   * Jedna funkcja dla PODGLĄDU („gumowy" odcinek z etykietą długości) i dla KLIKNIĘCIA,
   * które punkt zatwierdza. Dotąd były to dwie osobne ścieżki i rozjechały się:
   * podgląd przyciągał do siatki, klik nie — więc przy włączonym przyciąganiu etykieta
   * pokazywała równe „4,00 m", a do projektu trafiał odcinek 3,91 m. Wymiar, który
   * kłamie w momencie rysowania, jest gorszy niż brak wymiaru.
   *
   * Kolejność jest wymuszona: siatka MUSI iść pierwsza, bo `zPrzyciaganiem` zwraca
   * albo dokładnie pierwszy punkt ściany (domknięcie), albo wyliczony narożnik —
   * dosnapowanie ich po fakcie odsunęłoby figurę od punktu, do którego miała trafić.
   *
   * Przyciąganie do istniejącej geometrii idzie na SAM KONIEC i wygrywa z siatką oraz
   * z kątem prostym, ale PRZEGRYWA z domknięciem i narożnikiem prostokąta. Powód
   * kolejności: te dwa dotyczą ściany RYSOWANEJ W TEJ CHWILI, więc mówią o zamiarze
   * dokładniej niż cokolwiek stojącego obok.
   *
   * ROZSTRZYGNIĘTE, nie przeoczone: przyciąganie do cudzej geometrii wygrywa z trybem
   * „Ortogonalnie" ŚWIADOMIE. Skutek uboczny jest realny i został zaakceptowany — przy
   * włączonym wymuszaniu kątów prostych punkt, który wypadnie w promieniu 0,6 m od
   * narożnika sąsiedniej ściany, odskoczy z osi i odcinek wyjdzie lekko skośny. Wybrano
   * to, bo dociągnięcie do konkretnego, widocznego narożnika jest wskazaniem MIEJSCA,
   * a tryb ortogonalny tylko pomocą w trzymaniu osi — dokładnie tak samo traktuje go
   * domknięcie figury („niezależnie od trybu ortogonalnego" wyżej). Pilnuje tego test
   * „przyciąganie do geometrii WYGRYWA z trybem ortogonalnym" w
   * e2e/przyciaganie-do-geometrii.spec.ts: gdyby ktoś odwrócił ten priorytet uznając go
   * za błąd, dowie się o tym od razu.
   *
   * Liczone z `raw`, nie z punktu po siatce — pytanie brzmi „gdzie użytkownik
   * NAPRAWDĘ pokazał", a nie „gdzie wylądował po zaokrągleniu do oczka".
   */
  function punktSciany(raw: Point): Point {
    return punktScianyZZaczepem(raw).punkt;
  }

  /**
   * Punkt ściany RAZEM z zaczepem, który o jego położeniu zadecydował (`null`, gdy
   * punkt stoi wolno albo złapało go domknięcie/narożnik prostokąta — te mają
   * pierwszeństwo i nie są zaczepem o cudzą geometrię).
   *
   * Jedno przejście zamiast dwóch: podgląd potrzebuje i punktu, i zaczepu, a liczenie
   * ich osobno przeszukiwało WSZYSTKIE ściany i pomieszczenia dwa razy na każdy ruch
   * myszy — z porównywaniem współrzędnych na koniec, żeby odgadnąć, czy to zaczep
   * wygrał. Tu wiadomo to wprost, bo obie odpowiedzi powstają w tym samym miejscu.
   */
  function punktScianyZZaczepem(raw: Point): { punkt: Point; zaczep: Przyciagniecie | null } {
    const naSiatce = withSnap(raw);
    const ostatni = drawingWall[drawingWall.length - 1];
    const ortho = orthoWalls && ostatni ? orthoSnap(ostatni, naSiatce) : naSiatce;
    const wlasne = zPrzyciaganiem(ortho);
    if (wlasne) return { punkt: wlasne, zaczep: null };
    const z = przyciagnijDoGeometrii(raw);
    return { punkt: z?.point ?? ortho, zaczep: z };
  }

  /** Długość odcinka w jednostkach planu, sformatowana do etykiety: metry, jeśli
   *  skala jest ustawiona, inaczej same jednostki planu — ten sam wybór co pasek
   *  stanu (`EditorStatusBar`), żeby liczby w aplikacji mówiły jednym językiem. */
  function formatDlugosc(jednostki: number): string {
    if (metersPerUnit !== null) return `${(jednostki * metersPerUnit).toFixed(2).replace(".", ",")} m`;
    return `${Math.round(jednostki)} jedn.`;
  }

  /**
   * Powierzchnia obrysu, sformatowana do etykiety — ta sama zasada co
   * `formatDlugosc`: metry kwadratowe, gdy skala jest znana, inaczej nic (`null`),
   * bo „82000 jedn.²" nie mówi nikomu niczego, a przy metrach kwadratowych chodzi
   * właśnie o rozpoznanie „to za duże jak na łazienkę".
   *
   * Przeliczenie zostawione `polygonAreaM2` (geometry.ts) zamiast mnożenia przez
   * `metersPerUnit` na miejscu: skalowanie powierzchni jest KWADRATOWE i ma z tego
   * powodu siedzieć w jednym miejscu — patrz komentarz przy tamtej funkcji.
   */
  function formatPowierzchnia(points: Point[]): string | null {
    const m2 = polygonAreaM2(points, metersPerUnit);
    if (m2 === null) return null;
    return `${m2.toFixed(1).replace(".", ",")} m²`;
  }

  /** Podpis „3,45 × 4,20 m" dla prostokątnego obrysu — sama detekcja i przeliczenie
   *  siedzą w `rectangleSizeM` (geometry.ts), tutaj zostaje wyłącznie formatowanie. */
  function formatWymiaryProstokata(points: Point[]): string | null {
    const rozmiar = rectangleSizeM(points, metersPerUnit);
    if (!rozmiar) return null;
    const f = (v: number) => v.toFixed(2).replace(".", ",");
    return `${f(rozmiar.w)} × ${f(rozmiar.h)} m`;
  }

  /** Cztery narożniki prostokąta podglądu jako obrys — żeby powierzchnia liczyła się
   *  tą samą drogą co dla wieloboku i dla gotowego pomieszczenia. */
  function rogiProstokata(r: MarqueeRect): Point[] {
    return [
      { x: r.x, y: r.y },
      { x: r.x + r.w, y: r.y },
      { x: r.x + r.w, y: r.y + r.h },
      { x: r.x, y: r.y + r.h },
    ];
  }

  /** Czy punkt trafia w pierwszy wierzchołek wieloboku na tyle blisko, by go zamknąć.
   *  Wymaga co najmniej 3 punktów — z dwóch nie powstanie pomieszczenie. */
  function closesPolygon(p: Point): boolean {
    if (drawingRoomPoints.length < 3) return false;
    const first = drawingRoomPoints[0];
    return Math.hypot(p.x - first.x, p.y - first.y) <= POLYGON_CLOSE_RADIUS;
  }

  /** To samo co `closesPolygon`, tylko dla wieloboku RYSOWANEJ ŚCIANY — ściana nie ma
   *  osobnego „zamkniętego" stanu jak pomieszczenie (`Wall` to zwykła lista punktów),
   *  więc zamknięcie w pętlę polega na tym, że OSTATNI postawiony punkt pokrywa się z
   *  PIERWSZYM — to przyciąganie tylko o to dba, samo zatwierdzenie zostaje takie samo
   *  (Enter / „Zakończ” / PPM), jak przy każdej innej ścianie. */
  function closesWall(p: Point): boolean {
    if (drawingWall.length < 3) return false;
    const first = drawingWall[0];
    return Math.hypot(p.x - first.x, p.y - first.y) <= POLYGON_CLOSE_RADIUS;
  }

  function rectCorners(r: MarqueeRect): Point[] {
    return [
      { x: r.x, y: r.y },
      { x: r.x + r.w, y: r.y },
      { x: r.x + r.w, y: r.y + r.h },
      { x: r.x, y: r.y + r.h },
    ];
  }

  /** Prostokąt rozpięty między dwoma narożnikami — niezależnie od kolejności. */
  function rectBetween(a: Point, b: Point): MarqueeRect {
    return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
  }

  /**
   * Kotwica trybu DWÓCH KLIKNIĘĆ dla prostokąta: pierwszy klik zostawia punkt,
   * drugi domyka figurę. Ta sama tablica `drawingRoomPoints` co wielobok — celowo,
   * mimo że prostokąt potrzebuje tylko jednego punktu: dzięki temu Escape,
   * przycisk „Anuluj", zmiana narzędzia i zmiana kształtu (wszystkie czyszczą tę
   * tablicę w DesignTab) anulują zaczęty prostokąt BEZ dokładania czwartej ścieżki
   * anulowania, o której łatwo zapomnieć przy kolejnej zmianie.
   */
  const rectAnchor = drawingRoom && roomMode === "prostokat" && drawingRoomPoints.length > 0 ? drawingRoomPoints[0] : null;

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
      const p = stage && planPoint(stage);
      if (!p) return;
      const start = snapPunktuPokoju(p);
      roomRectStartRef.current = start;
      const rect = { x: start.x, y: start.y, w: 0, h: 0 };
      roomRectRef.current = rect;
      setRoomRect(rect);
      return;
    }

    if (e.target !== stage) return;
    onClearSelection();
    if (toolMode !== "zaznacz") return;
    const p = stage && planPoint(stage);
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
    onPointerMove?.(stage ? planPoint(stage) : null);

    // Bez warunku na `drawingWall.length`: zaczep pokazujemy JUŻ PRZED pierwszym
    // kliknięciem, bo pierwszy punkt ściany też się przyciąga (patrz `punktSciany`).
    // Wcześniej ta gałąź wymagała postawionego punktu, więc najczęstszy start —
    // „zacznij ściankę działową od narożnika tamtej ściany" — przyciągał się
    // niewidzialnie, czyli dokładnie w stanie, który znacznik miał zlikwidować.
    if (toolMode === "sciany") {
      const raw = stage && planPoint(stage);
      if (!raw) {
        setWallCursor(null);
        setZaczep(null);
        return;
      }
      const { punkt, zaczep: nowyZaczep } = punktScianyZZaczepem(raw);
      // Gumowy odcinek dopiero od drugiego punktu — przed pierwszym kliknięciem nie ma
      // od czego go ciągnąć.
      setWallCursor(drawingWall.length > 0 ? punkt : null);
      setZaczep(nowyZaczep);
      return;
    }

    if (drawingRoom) {
      const raw = stage && planPoint(stage);
      if (!raw) return;
      if (roomMode === "wielobok") {
        // przy kursorze w pobliżu startu pokazujemy punkt startowy, nie pozycję myszy —
        // dzięki temu widać dokładnie, gdzie figura się domknie
        if (closesPolygon(raw)) {
          setRoomCursor(drawingRoomPoints[0]);
          setZaczep(null);
          return;
        }
        const { punkt, zaczep: nowyZaczep } = punktPokojuZZaczepem(raw);
        setRoomCursor(punkt);
        setZaczep(nowyZaczep);
        return;
      }
      // Kotwica z pierwszego kliknięcia działa tak samo jak wciśnięty przycisk —
      // podgląd prostokąta ma iść za kursorem w OBU trybach, inaczej po pierwszym
      // kliknięciu ekran wyglądałby, jakby nic się nie stało.
      // Zaczep liczony PRZED sprawdzeniem kotwicy: pierwszy narożnik prostokąta
      // przyciąga się tak samo jak każdy następny, a przed pierwszym kliknięciem
      // kotwicy jeszcze nie ma. Bez tego najczęstszy start — „obrysuj pokój od rogu
      // muru" — przyciągał się niewidzialnie.
      const { punkt: rog, zaczep: nowyZaczep } = punktPokojuZZaczepem(raw);
      setZaczep(nowyZaczep);
      const start = roomRectStartRef.current ?? rectAnchor;
      if (!start) return;
      const rect = rectBetween(start, rog);
      roomRectRef.current = rect;
      setRoomRect(rect);
      return;
    }

    if (!marqueeStartRef.current) return;
    const p = stage && planPoint(stage);
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
      // Prostokąt zbyt mały to NIE jest nieudane przeciągnięcie do wyrzucenia —
      // to zwykłe kliknięcie, czyli pierwszy krok trybu dwóch kliknięć. Kotwicę
      // stawia dopiero `handleStageClick` (tam trafia też klik bez żadnego ruchu
      // myszy), więc tutaj tylko sprzątamy podgląd i nie gasimy tamtej ścieżki.
      const domkniety = !!rect && rect.w >= MIN_ROOM_SIZE && rect.h >= MIN_ROOM_SIZE;
      roomRectRef.current = null;
      if (domkniety) {
        setRoomRect(null);
        // Konva wyśle po tym `click` (mousedown i mouseup na tym samym celu) —
        // bez tej flagi domykałby od razu KOLEJNY prostokąt w miejscu, w którym
        // skończyło się przeciągnięcie.
        roomRectJustDrawnRef.current = true;
        onRoomRectDrawn(rectCorners(rect!));
      }
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
    const p = planPoint(stage);
    if (!p) return;

    if (toolMode === "sciany") {
      // Ta sama droga co podgląd — patrz `punktSciany`.
      const punkt = punktSciany(p);
      // Klik, który zamyka wielobok (przyciągnięty do pierwszego punktu — patrz
      // `closesWall`), od razu ZATWIERDZA ścianę, tak jak zamknięcie wieloboku
      // pomieszczenia (`onCloseRoomPolygon`) — bez osobnego klikania „Zakończ" na
      // figurze, która i tak jest już kompletna.
      if (closesWall(punkt)) {
        onCloseWall(drawingWall[0]);
      } else {
        onAddWallPoint(punkt);
      }
      return;
    }
    if (toolMode === "pomieszczenie") {
      if (roomMode === "prostokat") {
        // Echo przeciągnięcia, które właśnie domknęło prostokąt — patrz
        // `roomRectJustDrawnRef` w `handleStageMouseUp`.
        if (roomRectJustDrawnRef.current) {
          roomRectJustDrawnRef.current = false;
          return;
        }
        const rogSnapowany = snapPunktuPokoju(p);
        // Druga (obok przytrzymania) droga do tego samego prostokąta: klik stawia
        // narożnik, ruch myszy rozciąga podgląd, kolejny klik domyka figurę.
        if (rectAnchor) {
          const rect = rectBetween(rectAnchor, rogSnapowany);
          if (rect.w < MIN_ROOM_SIZE || rect.h < MIN_ROOM_SIZE) return; // za mały — czekamy dalej
          setRoomRect(null);
          onRoomRectDrawn(rectCorners(rect));
          return;
        }
        onAddRoomPoint(rogSnapowany);
        return;
      }
      if (closesPolygon(p)) {
        onCloseRoomPolygon();
        setRoomCursor(null);
        setZaczep(null);
        return;
      }
      onAddRoomPoint(snapPunktuPokoju(p));
      return;
    }
    if (toolMode === "skala") {
      onAddCalibPoint(p);
      return;
    }
    if (toolMode === "elementy") {
      // Bez przyciągania do siatki — patrz `withSnap`. Gniazdko ma stanąć dokładnie
      // tam, gdzie się w nie celowało: przy futrynie, nad blatem, obok umywalki.
      onPlaceElement(p);
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
    const planX = widok.x + kursorX / zoom;
    const planY = widok.y + kursorY / zoom;
    const factor = e.evt.deltaY < 0 ? 1.1 : 0.9;
    const nowaSkala = clampNum(zoom * factor, minZoom(), MAX_ZOOM);
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
    if (!k) return;
    kotwicaZoomRef.current = null;
    // Punkt spod kursora ma zostać pod kursorem: przesuwamy okno tak, żeby po nowym
    // powiększeniu wypadł w tym samym miejscu ekranu.
    setWidok({ x: k.planX - k.kursorX / zoom, y: k.planY - k.kursorY / zoom });
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
    przesuwanieRef.current = { x: e.clientX, y: e.clientY, widokX: widok.x, widokY: widok.y };
    el.setPointerCapture(e.pointerId);
    setPrzesuwa(true);
  }

  function przesuwajSrodkowym(e: ReactPointerEvent<HTMLDivElement>) {
    const start = przesuwanieRef.current;
    if (!start) return;
    // Minus: chwytamy rysunek i ciągniemy go za kursorem, więc widok jedzie
    // w przeciwną stronę niż mysz. Dzielenie przez powiększenie, bo widok żyje
    // w jednostkach planu, a ruch myszy przychodzi w pikselach.
    setWidok({
      x: start.widokX - (e.clientX - start.x) / zoom,
      y: start.widokY - (e.clientY - start.y) / zoom,
    });
  }

  function zakonczPrzesuwanieSrodkowym(e: ReactPointerEvent<HTMLDivElement>) {
    if (!przesuwanieRef.current) return;
    przesuwanieRef.current = null;
    kontenerRef.current?.releasePointerCapture(e.pointerId);
    setPrzesuwa(false);
  }

  return (
    // Karta ma rozmiar OKNA widoku i sama się centruje (`mx-auto`), więc obramowanie
    // pokrywa się z płótnem i współrzędne kliknięcia liczone względem karty trafiają
    // tam, gdzie użytkownik widzi rysunek.
    //
    // `overflow-hidden` zamiast dawnego `overflow-auto`: okno nie przewija się już wcale.
    // Rysunek wychodzący poza nie nie jest „za paskiem przewijania", tylko po prostu
    // poza kadrem — a kadr przesuwa się stanem `widok`.
    <div
      ref={kontenerRef}
      /* Uchwyt dla testów. Wcześniej celowały w klasę `overflow-auto` — czyli
         w sposób, w jaki płótno akurat było ostylowane. Gdy przestało się przewijać,
         68 miejsc w zestawie przestało cokolwiek znajdować. */
      data-testid="plan-okno"
      /* Uchwyt dla KODU aplikacji: DesignTab kompensuje nim skok rysunku przy zmianie
         szerokości panelu. Osobny od testowego, żeby kompensacja nie zależała od
         czegoś, co wolno usunąć razem z testem. */
      data-plan-okno=""
      className="mx-auto overflow-hidden rounded-card border border-border"
      style={{
        width: rozmiarOkna.w,
        height: rozmiarOkna.h,
        cursor: przesuwa ? "grabbing" : toolMode === "pan" ? "grab" : undefined,
      }}
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
        width={rozmiarOkna.w}
        height={rozmiarOkna.h}
        x={-widok.x * zoom}
        y={-widok.y * zoom}
        scaleX={zoom}
        scaleY={zoom}
        // BEZ `draggable`: kadrem rządzi wyłącznie stan `widok` (patrz
        // `zacznijPrzesuwanie`). Przeciąganie sceny przez Konvę byłoby drugim,
        // równoległym układem współrzędnych — a od rozjazdu między dwoma układami
        // zaczęły się kłopoty, które ta przebudowa usuwa.
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
          {/* `name="tylko-ekran"` na rzeczach, które są pomocą PRZY RYSOWANIU, a nie
              treścią rysunku: tło obszaru podkładu, siatka i jego obwódka. Eksport do
              PDF chowa je po nazwie (patrz `zbudujPdfRzutu`) — na rysunku budowlanym nie
              ma ani kratki, ani ramki obszaru roboczego. Sam podkład ZOSTAJE: to wgrany
              rzut mieszkania, czyli treść. */}
          {/* Tło i obwódka obszaru TYLKO pod wgranym rzutem. Dopóki z arkusza nie dało
              się wyjść, ramka mówiła prawdę: „dotąd wolno stawiać elementy". Odkąd
              rysować można wszędzie, ta sama ramka mówi nieprawdę — sugeruje granicę,
              której nie ma. Pod wgranym rzutem nadal coś znaczy: pokazuje, dokąd sięga
              podkład i gdzie kończy się to, co zmierzono kalibracją. */}
          {bgImage && (
            <>
              <Rect name="tylko-ekran" x={0} y={0} width={planSize.w} height={planSize.h} fill="#F7F9FB" />
              <KonvaImage image={bgImage} x={0} y={0} width={planSize.w} height={planSize.h} opacity={0.85} />
            </>
          )}
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
            siatka.pionowe.map((x) => (
              <Line
                name="tylko-ekran"
                key={`gx${x}`}
                points={[x, siatka.gora, x, siatka.dol]}
                stroke="#E1E7EC"
                strokeWidth={1}
              />
            ))}
          {gridOn &&
            siatka.poziome.map((y) => (
              <Line
                name="tylko-ekran"
                key={`gy${y}`}
                points={[siatka.lewo, y, siatka.prawo, y]}
                stroke="#E1E7EC"
                strokeWidth={1}
              />
            ))}
          {/* Obwódka obszaru podkładu — patrz komentarz przy tle wyżej. `arkusz`
              w nazwie: to jedyny węzeł, po którym da się odczytać ten obszar ze sceny,
              bo scena ma rozmiar OKNA i o obszarze podkładu nic nie mówi. */}
          {bgImage && (
            <Rect
              name="tylko-ekran arkusz"
              x={0}
              y={0}
              width={planSize.w}
              height={planSize.h}
              stroke="#C3CDD7"
              strokeWidth={1.5}
            />
          )}
        </Layer>

        {/* PODGLĄD KONDYGNACJI PONIŻEJ — osobna warstwa POD wszystkim, bez nasłuchu.
            Bez niego piętro rysuje się w ciemno: nie da się trafić pionem rozdzielnicy
            ani wypustu nad tym z parteru, a sprawdzanie polega na przełączaniu
            kondygnacji tam i z powrotem i zapamiętywaniu, gdzie coś było.
            Jednolita szarość i niska nieprzezroczystość, a nie oryginalne kolory:
            podkład ma być rozpoznawalny jako „nie ta kondygnacja" bez patrzenia na
            pasek — inaczej myli się z rysowanym właśnie piętrem. */}
        {podklad && (
          <Layer listening={false} opacity={0.3}>
            {podklad.roomShapes.map((r) => (
              <Line key={r.id} points={r.points.flatMap((p) => [p.x, p.y])} closed stroke="#94A3B8" strokeWidth={1} dash={[4, 4]} />
            ))}
            {podklad.walls.map((w) => (
              <Line
                key={w.id}
                points={w.points.flatMap((p) => [p.x, p.y])}
                stroke="#64748B"
                strokeWidth={w.thickness ?? DEFAULT_WALL_THICKNESS}
                lineCap="round"
                lineJoin="round"
              />
            ))}
            {podklad.elements.map((el) => (
              <Group key={el.id} x={el.x} y={el.y} rotation={el.rotation ?? 0} scaleX={skalaSymbolu(el.type)} scaleY={skalaSymbolu(el.type)}>
                <ElementGlyphKonva type={el.type} color="#64748B" gangs={el.gangs} agdLetter={el.agdLetter} wymiaryM={fixtureSizeM(el) ?? undefined} />
              </Group>
            ))}
          </Layer>
        )}

        <Layer ref={layerRef}>
          {roomShapes.map((r) => {
            const pts = r.points.flatMap((p) => [p.x, p.y]);
            const c = centroid(r.points);
            // Szerokość obrysu — do niej docinany jest rozmiar opisów, żeby nazwa
            // nie wychodziła poza ściany małego pokoju (patrz `fontOpisuPokoju`).
            const xsPokoju = r.points.map((p) => p.x);
            const szerokoscPokoju = Math.max(...xsPokoju) - Math.min(...xsPokoju);
            const fontNazwy = fontOpisuPokoju(metersPerUnit, r.name, szerokoscPokoju);
            // Odstępy podążają za rozmiarem pisma, a nie za dawnymi stałymi — inaczej
            // przy mniejszym foncie opisy rozjeżdżałyby się od swojego pomieszczenia.
            // Proporcje wzięte z poprzednich wartości (6/11 i 13/11), więc bez znanej
            // skali rysunek wychodzi piksel w piksel taki jak przedtem.
            const odsadzenieNazwy = (6 / FALLBACK_FONT_NAZWY) * fontNazwy;
            const odsadzenieAdnotacji = (13 / FALLBACK_FONT_NAZWY) * fontNazwy;
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
                  // Obrys pomieszczenia JEST ścianą, więc ma grubość ścianki działowej
                  // przeliczonej ze skali rzutu (patrz `gruboscObrysuPokoju`), a nie
                  // stałą w jednostkach planu. Przy stałej wychodził na skalibrowanym
                  // podkładzie raz grubszy, raz cieńszy niż jakakolwiek prawdziwa ściana.
                  // Zaznaczone pomieszczenie dostaje narzut, nie inną grubość — grubość
                  // niesie informację o murze i nie może zmieniać się od kliknięcia.
                  strokeWidth={grubosciObrysu + (isSelRoom ? 1 : 0)}
                  lineJoin="miter"
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
                    /**
                     * W trybie „pomieszczenie" LEWY klik należy do rysunku, nie do
                     * sąsiada. `hitStrokeWidth` (14 jedn.) ciągnie się wzdłuż całego
                     * obrysu, więc rysując pokój PRZY istniejącym każdy punkt stawiany
                     * na wspólnej ścianie lądował tutaj i znikał — zmierzone: z pięciu
                     * kliknięć wzdłuż wspólnej krawędzi rejestrowały się dwa, a figury
                     * nie dawało się domknąć.
                     *
                     * Wychodzimy BEZ `cancelBubble`, więc zdarzenie idzie dalej do
                     * sceny i staje się punktem wieloboku. Samo `listening={false}`
                     * w tym trybie byłoby prostsze, ale zabrałoby też PPM „Usuń
                     * pomieszczenie" na krawędzi — a prawy przycisk niczego tu nie
                     * rysuje, więc nie ma powodu, żeby go tracić.
                     */
                    if (toolMode === "pomieszczenie") return;
                    e.cancelBubble = true;
                    // W trybie „otwory" klik w krawędź pomieszczenia dokłada na niej
                    // drzwi zamiast zaznaczać pomieszczenie — ten sam wzorzec co przy
                    // ścianach (`onWallClickForOpening`), tylko na ZAMKNIĘTYM obrysie
                    // (domykamy pierwszym punktem na końcu, bo `nearestPointOnPolyline`
                    // sam nie zna ostatniego, zamykającego segmentu).
                    if (toolMode === "otwory") {
                      const stage = e.target.getStage();
                      const p = stage && planPoint(stage);
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

                {/* Podpisy pomieszczenia pod jego nazwą, jeden pod drugim — wymiary
                    i/albo powierzchnia, zależnie od tego, co włączone.

                    Wymiary jako JEDEN podpis „3,45 × 4,20 m", a nie etykieta przy każdej
                    krawędzi — tak robią to rysunki budowlane i tylko tak da się to
                    utrzymać czytelnym: przy pięciu pokojach etykiety krawędziowe
                    dołożyłyby dwadzieścia napisów do i tak już wymiarowanych ścian.
                    Wyłącznie dla obrysów PROSTOKĄTNYCH: dla litery L czy wykusza „a × b"
                    opisywałoby prostokąt, którego na rysunku nie ma.

                    I właśnie dlatego powierzchnia jest OSOBNYM przełącznikiem, a nie
                    dodatkiem do wymiarów: liczy się z obrysu (`polygonArea`, wzór
                    geodety), więc jest prawdziwa dla trójkąta, trapezu i wykuszu tak
                    samo jak dla prostokąta. Tam, gdzie wymiary milczą, ona nadal mówi. */}
                {(() => {
                  const podpisy = [
                    pokazWymiary ? formatWymiaryProstokata(r.points) : null,
                    pokazPowierzchnie ? formatPowierzchnia(r.points) : null,
                  ].filter((t): t is string => t !== null);
                  return podpisy.map((tekst, i) => {
                    const font = fontOpisuPokoju(metersPerUnit, tekst, szerokoscPokoju, {
                      fallback: FALLBACK_FONT_ADNOTACJI,
                    });
                    // Ramka dokładnie na miarę napisu: stałe 100 jedn. (= 5 m!) łamały
                    // dłuższe podpisy dopiero daleko poza małym pokojem.
                    const szer = szerokoscRamki(tekst, font);
                    return (
                    <Text
                      key={i}
                      x={c.x - szer / 2}
                      // Blok rośnie W GÓRĘ, nie w dół: OSTATNI wiersz siada zawsze tam,
                      // gdzie siedziałby jedyny, a kolejne dokładają się nad nim.
                      //
                      // Rozpychanie w dół nie miało jak zadziałać w niskim pokoju: przy
                      // 3 m (60 jedn.) od środka do ściany jest 30 jedn., a dwa wiersze
                      // zaczynające się 15 jedn. pod środkiem kończyły się na murze —
                      // dokładnie na etykiecie wymiaru ściany, przecinając oba napisy.
                      y={c.y + odsadzenieAdnotacji - (podpisy.length - 1 - i) * (10 / FALLBACK_FONT_ADNOTACJI) * font}
                      width={szer}
                      align="center"
                      text={tekst}
                      // Mniejsza i LŻEJSZA niż NAZWA pomieszczenia (11, bez pogrubienia),
                      // czyli drugiemu opisowi na tym rzucie — to są adnotacje do pokoju,
                      // a nie jego tytuł, i mają się czytać jako drugi plan. Przy dziesiątce
                      // i pogrubieniu wymiar ważył na rysunku więcej niż nazwa, czyli
                      // odwrotnie do tego, co znaczy — a samo zmniejszenie tego nie cofało,
                      // bo pogrubiona ósemka waży na rysunku tyle samo co zwykła jedenastka.
                      fontSize={font}
                      fill="#8A5526"
                      listening={false}
                    />
                    );
                  });
                })()}

                <Text
                  x={c.x - szerokoscRamki(r.name, fontNazwy) / 2}
                  y={c.y - odsadzenieNazwy}
                  width={szerokoscRamki(r.name, fontNazwy)}
                  align="center"
                  text={r.name}
                  fontSize={fontNazwy}
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
                        const x = snapOn ? snap(e.target.x(), krok) : e.target.x();
                        const y = snapOn ? snap(e.target.y(), krok) : e.target.y();
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
                  // Hit-test SZERSZY niż to, co widać — cienka ściana (typowo kilka-kilkanaście
                  // jednostek) jest przy zwykłym powiększeniu grubości pojedynczych pikseli,
                  // a właśnie w nią trzeba trafić, żeby zaznaczyć ścianę albo dostawić drzwi
                  // (tryb „otwory"). Bezpieczne odkąd klik w innych trybach i tak przechodzi
                  // na wylot do sceny (patrz `onClick` niżej) — szerszy hit nie kradnie już
                  // kliknięć narzędziu „Wstaw Element". Ten sam wzorzec co `hitStrokeWidth`
                  // przy krawędzi pomieszczenia, niżej w tym pliku.
                  hitStrokeWidth={20}
                  lineCap="round"
                  lineJoin="round"
                  onClick={(e) => {
                    // W trybie „otwory" klik w ścianę dokłada na niej drzwi
                    // zamiast ją zaznaczać — patrz `onWallClickForOpening`.
                    if (toolMode === "otwory") {
                      e.cancelBubble = true;
                      const stage = e.target.getStage();
                      const p = stage && planPoint(stage);
                      const nearest = p && nearestPointOnPolyline(p, w.points);
                      if (nearest) onWallClickForOpening(w.id, nearest.point, nearest.angle);
                      return;
                    }
                    // Poza trybem „Zaznacz" (i „otwory" wyżej) klik NIE jest przechwytywany —
                    // inaczej stawianie gniazdek/łączników byłoby ślepe akurat tam, gdzie
                    // realnie się je stawia: na ścianie. Bez tego wyjątku trafienie idealnie
                    // w linię ściany w trybie „Wstaw Element" po cichu ZAZNACZAŁO ścianę
                    // zamiast postawić element — ten sam wzorzec wykluczenia co przy
                    // pomieszczeniach (patrz `roomInteractive` niżej).
                    if (toolMode !== "zaznacz") return;
                    e.cancelBubble = true;
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
                        const x = snapOn ? snap(e.target.x(), krok) : e.target.x();
                        const y = snapOn ? snap(e.target.y(), krok) : e.target.y();
                        onMoveWallPoint(w.id, i, { x, y });
                      }}
                      onContextMenu={(e) => {
                        e.evt.preventDefault();
                        e.cancelBubble = true;
                        onWallContextMenu(w.id, e.evt.clientX, e.evt.clientY);
                      }}
                    />
                  ))}
                {/* Długości odcinków ściany. Podczas rysowania wymiar było widać (patrz
                    „gumowy" odcinek niżej), ale po zatwierdzeniu znikał bezpowrotnie —
                    nie dało się sprawdzić, czy ściana wyszła na 4,20 m, ani zweryfikować
                    cudzego rzutu.
                    Domyślnie tylko dla ZAZNACZONEJ, bo wymiary przy wszystkich naraz
                    zamieniają rzut w ścianę tekstu. Tryb wymiarowania (`pokazWymiary`)
                    włącza je wszystkie świadomie — na wydruku rzut bez ani jednego
                    wymiaru nie jest dokumentem, tylko obrazkiem.
                    Etykiety przy WSZYSTKICH odcinkach łamanej, nie tylko przy pierwszym:
                    jedna ściana bywa całym obrysem domu. */}
                {(isSel || pokazWymiary) &&
                  w.points.slice(0, -1).map((p, i) => {
                    const q = w.points[i + 1];
                    const dlugosc = Math.hypot(q.x - p.x, q.y - p.y);
                    if (!(dlugosc > 0)) return null;
                    // Napis układa się WZDŁUŻ odcinka i zawsze „czyta się" od lewej:
                    // bez obrócenia o 180° dla kątów rozwartych połowa wymiarów na
                    // obrysie domu stałaby do góry nogami.
                    let kat = (Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI;
                    if (kat > 90 || kat < -90) kat += 180;
                    return (
                      <Text
                        key={`wym-${i}`}
                        x={(p.x + q.x) / 2}
                        y={(p.y + q.y) / 2}
                        offsetX={dlugosc / 2}
                        // Odsunięcie od osi ściany, żeby napis nie leżał na jej
                        // pociągnięciu (ściana bywa gruba — domyślnie 25 cm).
                        offsetY={10 * so}
                        width={dlugosc}
                        rotation={kat}
                        align="center"
                        text={formatDlugosc(dlugosc)}
                        // Ta sama wielkość co podpisy pomieszczeń i wysokości montażu —
                        // wszystkie trzy to ADNOTACJE do rysunku, a nie jego treść.
                        // Przy jedenastce wymiar ściany ważył tyle samo co nazwa pokoju
                        // i rzut czytał się jako gąszcz liczb zamiast jako plan.
                        fontSize={8.5 * so}
                        fill="#8A5526"
                        listening={false}
                      />
                    );
                  })}
              </Group>
            );
          })}

          {/* Otwory: „wycięcie" w kolorze tła planu nad ścianą plus glif — łuk skrzydła
              dla drzwi, podwójna linia szyby dla okna (gałąź `o.kind !== "drzwi"`).
              Narzędzie stawia oba rodzaje, wybierane w pigułce kontrolek — patrz
              `OPENING_KINDS` w DesignTab.tsx i `OpeningKind` w types/index.ts.
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

          {/* Strefy ochronne rysowane jako PROSTOKĄTY obrysu przyboru, nie okręgi wokół
              jego środka — norma mierzy je od krawędzi wanny/brodzika (patrz
              `SANITARY_FIXTURES`). Strefa 2 to zbiór punktów w odległości ≤ 0,6 m od tego
              obrysu, czyli prostokąt o narożnikach zaokrąglonych właśnie tym promieniem;
              `cornerRadius={z.zone2}` odwzorowuje dokładnie to, co liczy `distanceToRect`,
              więc rysunek i sprawdzenie rzutu nie mogą się rozjechać.
              `offset` przesuwa początek układu na środek kształtu, żeby `rotation` obracał
              strefę wokół przyboru, a nie wokół jego lewego górnego rogu. */}
          {zones.map((z) => {
            // Zapas na etykietę liczony z WIĘKSZEGO boku: przy obrocie o 90° to szerokość
            // wchodzi w pion, więc stała oparta na wysokości kładłaby napis na strefie.
            const zasieg = Math.max(z.w, z.h) / 2 + z.zone2;
            return (
              <Group key={z.id} listening={false}>
                <Rect
                  x={z.x}
                  y={z.y}
                  offsetX={z.w / 2 + z.zone2}
                  offsetY={z.h / 2 + z.zone2}
                  width={z.w + 2 * z.zone2}
                  height={z.h + 2 * z.zone2}
                  cornerRadius={z.zone2}
                  rotation={z.rotation}
                  fill="#C1793F14"
                  stroke="#C1793F"
                  strokeWidth={1}
                  dash={[5, 4]}
                />
                {z.hasZone1 && (
                  <Rect
                    x={z.x}
                    y={z.y}
                    offsetX={z.w / 2}
                    offsetY={z.h / 2}
                    width={z.w}
                    height={z.h}
                    rotation={z.rotation}
                    fill="#C6433A1A"
                    stroke="#C6433A"
                    strokeWidth={1.2}
                    dash={[3, 3]}
                  />
                )}
                <Text
                  x={z.x - 60 * so}
                  y={z.y - zasieg - 14 * so}
                  width={120 * so}
                  align="center"
                  text={`strefy: ${z.label}${!z.calibrated ? " (bez skali)" : ""}`}
                  fontSize={8 * so}
                  fill="#8A5526"
                />
              </Group>
            );
          })}

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
              od STEROWANIA (łącznik → oprawa, cieńsza kropkowana) — to fizycznie inna
              para żył w tym samym kablu, więc nie powinny wyglądać identycznie.
              Punkty do rysowania idą z `spreadRoutePoints`, nie z `r.points` wprost —
              trasy dzielące ten sam odcinek ściany dostają tam boczny offset, żeby się
              nie zlewały w jedną linię (patrz `spreadOverlappingRoutes`).

              Klikalne WYŁĄCZNIE w trybie „zaznacz" (jak krawędzie ścian/pomieszczeń) —
              wybiera trasę do RĘCZNEJ edycji: dwuklik na zaznaczonej trasie dokłada
              nowe załamanie w miejscu kliknięcia, przeciągnięcie uchwytu przesuwa
              istniejące, dwuklik na uchwycie go kasuje. Ręcznie zmienione trasy
              (`routeOverrides`) dostają ciągłą linię niezależnie od `viaWalls`/`kind` —
              to już nie szacunek, tylko świadoma decyzja użytkownika, i są wyłączone z
              automatycznego rozsuwania (patrz `spreadRoutePoints` wyżej). */}
          {cableRoutes.map((r) => {
            const isControl = r.kind === "sterowanie";
            const isEdited = r.id in routeOverrides;
            const isSelRoute = selected?.kind === "route" && selected.id === r.id;
            const pts = isEdited ? r.points : spreadRoutePoints.get(r.id) ?? r.points;
            const routeInteractive = toolMode === "zaznacz";
            const color = r.color;
            return (
              <Group key={r.id}>
                <Line
                  ref={(node) => {
                    if (node) routeLineNodesRef.current.set(r.id, node);
                    else routeLineNodesRef.current.delete(r.id);
                  }}
                  points={pts.flatMap((p) => [p.x, p.y])}
                  stroke={isSelRoute ? "#C1793F" : color}
                  // CIEŃSZA, odkąd trasa biegnie OBOK ściany, a nie po jej osi (patrz
                  // `ODSUNIECIE_TRASY` w panel/routing.ts). Wcześniej musiała być gruba
                  // z konieczności: dzieliła oś ze ścianą i cienka kreska ginęła pod jej
                  // ciemnym pociągnięciem. Teraz gruba linia tylko zaciemniałaby rysunek —
                  // przewód ma być widoczny jako osobna, lekka linia, a nie druga ściana.
                  // Trasy sterowania zostają cieńsze i kropkowane — inny rodzaj przewodu.
                  strokeWidth={(isControl ? 1 : 1.5) + (isSelRoute ? 1 : 0)}
                  dash={isEdited ? undefined : isControl ? [1, 3] : r.viaWalls ? undefined : [6, 4]}
                  opacity={0.9}
                  lineJoin="round"
                  listening={routeInteractive}
                  hitStrokeWidth={10}
                  onClick={(e) => {
                    e.cancelBubble = true;
                    onSelectRoute(r.id);
                  }}
                  onDblClick={(e) => {
                    e.cancelBubble = true;
                    if (!isSelRoute) {
                      // pierwszy dwuklik na jeszcze niezaznaczonej trasie tylko ją
                      // zaznacza — dokładanie punktu wymaga świadomego DRUGIEGO dwukliku,
                      // żeby przypadkowe trafienie od razu nie zniekształcało trasy
                      onSelectRoute(r.id);
                      return;
                    }
                    const stage = e.target.getStage();
                    const p = stage && planPoint(stage);
                    if (!p) return;
                    const segIdx = nearestRouteSegmentIndex(p, r.points);
                    const withInserted = [...r.points.slice(0, segIdx + 1), p, ...r.points.slice(segIdx + 1)];
                    onSetRoutePoints(r.id, withInserted.slice(1, -1));
                  }}
                />
                {/* Uchwyty ZAŁAMAŃ trasy — bez pierwszego/ostatniego punktu, bo te są
                    zawsze przypięte do rzeczywistej pozycji rozdzielnicy/łącznika i
                    punktu/oprawy (przeciąga się SAM element, nie koniec trasy). Ten sam
                    wzorzec co uchwyty ścian/pomieszczeń: podgląd przeciągania
                    imperatywny (onDragMove), zapis do store'a dopiero na onDragEnd. */}
                {isSelRoute &&
                  routeInteractive &&
                  r.points.slice(1, -1).map((p, i) => (
                    <Circle
                      key={i}
                      x={p.x}
                      y={p.y}
                      radius={5}
                      fill="#fff"
                      stroke="#C1793F"
                      strokeWidth={2}
                      draggable
                      onDragMove={(e) => {
                        const mid = r.points.slice(1, -1).map((mp, mi) => (mi === i ? { x: e.target.x(), y: e.target.y() } : mp));
                        const newPts = [r.points[0], ...mid, r.points[r.points.length - 1]].flatMap((pp) => [pp.x, pp.y]);
                        routeLineNodesRef.current.get(r.id)?.points(newPts);
                      }}
                      onDragEnd={(e) => {
                        const x = snapOn ? snap(e.target.x(), krok) : e.target.x();
                        const y = snapOn ? snap(e.target.y(), krok) : e.target.y();
                        const mid = r.points.slice(1, -1).map((mp, mi) => (mi === i ? { x, y } : mp));
                        onSetRoutePoints(r.id, mid);
                      }}
                      onDblClick={(e) => {
                        e.cancelBubble = true;
                        const mid = r.points.slice(1, -1).filter((_, mi) => mi !== i);
                        if (mid.length === 0) onResetRoute(r.id);
                        else onSetRoutePoints(r.id, mid);
                      }}
                    />
                  ))}
              </Group>
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
              {drawingWall.map((p, i) => {
                // Pierwszy punkt rośnie i zmienia się w pierścień, gdy kolejny klik
                // zamknie figurę — ten sam sygnał co przy zamykaniu wieloboku
                // pomieszczenia niżej, żeby oba „zamknięcia" czytały się tak samo.
                const isFirst = i === 0;
                const zamknie = isFirst && !!wallCursor && closesWall(wallCursor);
                return (
                  <Circle
                    key={i}
                    x={p.x}
                    y={p.y}
                    radius={zamknie ? 8 : 4}
                    fill={zamknie ? "#fff" : "#2D5A8C"}
                    stroke="#2D5A8C"
                    strokeWidth={zamknie ? 3 : 1.5}
                    listening={false}
                  />
                );
              })}
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
                          x={midX - 40 * so}
                          y={midY - 18 * so}
                          width={80 * so}
                          align="center"
                          text={formatDlugosc(dlugosc)}
                          fontSize={11 * so}
                          fontStyle="bold"
                          fill="#2D5A8C"
                          listening={false}
                        />
                      )}
                    </>
                  );
                })()}
              {/* Propozycja narożnika: przy 3. punkcie (drugi odcinek jeszcze w ruchu)
                  i przy 4. (już postawiony, tylko czeka na przyciągnięty klik) pokazuje
                  cieniutką, bledszą przerywaną linią, gdzie musiałby stanąć czwarty
                  narożnik, żeby cztery ściany złożyły się w prostokąt — patrz
                  `sugerowanyNaroznik`/`zPrzyciaganiem` wyżej. Przy 4. punkcie
                  kółko narożnika wypełnia się, gdy kursor jest już w nim przyciągnięty. */}
              {orthoWalls && wallCursor && (drawingWall.length === 2 || drawingWall.length === 3) && (
                <>
                  {(() => {
                    const [p0, p1, p2fixed] = drawingWall;
                    const p2 = drawingWall.length === 3 ? p2fixed : wallCursor;
                    const naroznik = sugerowanyNaroznik(p0, p1, p2);
                    const przyciagniety = drawingWall.length === 3 && wallCursor.x === naroznik.x && wallCursor.y === naroznik.y;
                    return (
                      <>
                        <Line
                          points={[p2.x, p2.y, naroznik.x, naroznik.y, p0.x, p0.y]}
                          stroke="#2D5A8C"
                          strokeWidth={1}
                          dash={[2, 4]}
                          opacity={0.4}
                          listening={false}
                        />
                        {drawingWall.length === 3 && (
                          <Circle
                            x={naroznik.x}
                            y={naroznik.y}
                            radius={przyciagniety ? 5 : 3.5}
                            fill={przyciagniety ? "#2D5A8C" : "#fff"}
                            stroke="#2D5A8C"
                            strokeWidth={1.2}
                            opacity={0.8}
                            listening={false}
                          />
                        )}
                      </>
                    );
                  })()}
                </>
              )}
            </>
          )}
          {/* Wielobok w trakcie rysowania: odcinki już postawione, „gumowa" linia do
              kursora, oraz WIDOCZNE punkty po każdym kliknięciu (wcześniej była sama
              linia, więc nie było wiadomo, gdzie dokładnie wylądował wierzchołek).
              Pierwszy punkt rośnie i zmienia się w pierścień, gdy kolejny klik zamknie
              figurę — to jedyny sygnał, że przyciąganie do zamknięcia właśnie działa. */}
          {/* Tylko wielobok: w trybie prostokąta ta sama tablica trzyma pojedynczą
              kotwicę pierwszego kliknięcia (patrz `rectAnchor`), a tę pokazuje już
              podgląd prostokąta niżej — bez tego warunku nad rysunkiem wisiałaby
              dodatkowo samotna kropka. */}
          {roomMode === "wielobok" && drawingRoomPoints.length > 0 && (
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
              {/* Długość ciągnionego boku — dokładnie ten sam sygnał, co przy rysowaniu
                  ściany. Wielobok obrysowuje pomieszczenia o nieregularnym kształcie,
                  gdzie „na oko" myli jeszcze bardziej niż przy prostokącie. */}
              {roomCursor &&
                (() => {
                  const ostatni = drawingRoomPoints[drawingRoomPoints.length - 1];
                  const dlugosc = Math.hypot(roomCursor.x - ostatni.x, roomCursor.y - ostatni.y);
                  if (!(dlugosc > 0)) return null;
                  return (
                    <Text
                      x={(ostatni.x + roomCursor.x) / 2 - 40 * so}
                      y={(ostatni.y + roomCursor.y) / 2 - 18 * so}
                      width={80 * so}
                      align="center"
                      text={formatDlugosc(dlugosc)}
                      fontSize={11 * so}
                      fontStyle="bold"
                      fill="#8A5526"
                      listening={false}
                    />
                  );
                })()}
              {/* Powierzchnia figury, którą dałoby domknięcie w tym miejscu — od
                  trzeciego punktu, bo wcześniej nie ma jeszcze żadnego pola.
                  `polygonArea` liczy po wzorze na wielokąt, więc działa i dla
                  kształtów wklęsłych (L-ki, wnęki). */}
              {roomCursor &&
                drawingRoomPoints.length >= 2 &&
                (() => {
                  const figura = [...drawingRoomPoints, roomCursor];
                  const opis = formatPowierzchnia(figura);
                  if (!opis) return null;
                  const cx = figura.reduce((a, p) => a + p.x, 0) / figura.length;
                  const cy = figura.reduce((a, p) => a + p.y, 0) / figura.length;
                  return (
                    <Text
                      x={cx - 40 * so}
                      y={cy - 6 * so}
                      width={80 * so}
                      align="center"
                      text={opis}
                      fontSize={12 * so}
                      fontStyle="bold"
                      fill="#8A5526"
                      opacity={0.85}
                      listening={false}
                    />
                  );
                })()}
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

          {/* Podgląd prostokąta w trakcie przeciągania — z WYMIARAMI, tak samo jak
              rysowana ściana (patrz `formatDlugosc` wyżej). Bez nich pomieszczenie
              obrysowywało się wyłącznie „na oko": przy domyślnym obszarze planu
              (50 m szerokości) prostokąt wyglądający jak pokój wychodził łazienką
              o powierzchni 117 m², a dowiadywało się o tym dopiero po zatwierdzeniu,
              z listy pomieszczeń. To właśnie ta figura decyduje o metrażu i o
              przypisaniu elementów do pokoi, więc milczała najważniejsza z trzech. */}
          {roomRect && (roomRect.w > 0 || roomRect.h > 0) && (
            <>
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
              {/* Szerokość NAD górną krawędzią, wysokość obok LEWEJ — czyli tam, gdzie
                  stoją wymiary na rysunku budowlanym, i poza wnętrzem figury, żeby nie
                  zderzały się z etykietą powierzchni w środku. */}
              <Text
                x={roomRect.x}
                y={roomRect.y - 15 * so}
                width={roomRect.w}
                align="center"
                text={formatDlugosc(roomRect.w)}
                fontSize={11 * so}
                fontStyle="bold"
                fill="#8A5526"
                listening={false}
              />
              {/* Obrócona o 90°, żeby czytała się wzdłuż mierzonej krawędzi — w tę samą
                  stronę co wymiary ścian (patrz etykiety zaznaczonej ściany wyżej), czyli
                  „od prawej" jak na rysunku budowlanym. Dwa kierunki czytania wymiarów na
                  jednym rzucie to sygnał, że rysunek składano z przypadkowych kawałków.
                  Konva obraca wokół (x, y), więc kotwica idzie na GÓRĘ krawędzi, a `width`
                  równe wysokości prostokąta wyśrodkowuje napis na jej długości. */}
              <Text
                x={roomRect.x - 15 * so}
                y={roomRect.y}
                width={roomRect.h}
                rotation={90}
                align="center"
                text={formatDlugosc(roomRect.h)}
                fontSize={11 * so}
                fontStyle="bold"
                fill="#8A5526"
                listening={false}
              />
              {/* Powierzchnia tylko wtedy, gdy prostokąt ma już sensowne pole — przy
                  pierwszych pikselach przeciągania „0,0 m²" tylko miga. */}
              {roomRect.w > 0 && roomRect.h > 0 && formatPowierzchnia(rogiProstokata(roomRect)) && (
                <Text
                  x={roomRect.x}
                  y={roomRect.y + roomRect.h / 2 - 6 * so}
                  width={roomRect.w}
                  align="center"
                  text={formatPowierzchnia(rogiProstokata(roomRect))!}
                  fontSize={12 * so}
                  fontStyle="bold"
                  fill="#8A5526"
                  listening={false}
                />
              )}
            </>
          )}

          {/* Znacznik ZACZEPU: punkt właśnie stoi na narożniku albo krawędzi figury,
              która już jest na rzucie (patrz `zaczep` wyżej). Bez tego przyciąganie
              jest niewidzialne i nie do odróżnienia od celnego kliknięcia — a różnica
              jest zasadnicza: przyciągnięty punkt to ta SAMA współrzędna co u sąsiada,
              celne kliknięcie to współrzędna o kilka jednostek obok, czyli szczelina
              albo zachodzenie, które wyjdzie dopiero w metrażu.

              Zielony, a nie niebieski/miedziany: oba kolory rysowania są już zajęte
              (ściana, pomieszczenie), a zaczep ma się czytać jako osobny sygnał
              „złapało", niezależny od tego, co się właśnie rysuje.

              Kwadrat na narożniku, kółko na krawędzi — to samo rozróżnienie, które
              robią programy CAD, i wystarczy spojrzeć, żeby wiedzieć, czy punkt
              wylądował w rogu sąsiada, czy gdzieś wzdłuż jego ściany.

              Tylko przy AKTYWNYM narzędziu rysującym: w „zaznacz" czy „pan" nikt nie
              stawia punktu, więc kropka nad rzutem nic by nie znaczyła. Warunek celowo
              NIE pyta o postawione już punkty — pierwszy punkt figury przyciąga się tak
              samo jak każdy następny, a to jego właśnie stawia się najczęściej „od rogu
              tamtej ściany". Świeżość zaczepu trzyma sama obsługa ruchu myszy: każdy
              ruch go przelicza, a wyjście poza plan i porzucenie figury zerują. */}
          {zaczep && (toolMode === "sciany" || drawingRoom) && (
            <>
              {/* Dzielenie przez powiększenie: scena skaluje wszystko, co na niej stoi,
                  więc żeby wyszło stałe `ZACZEP_PX` na ekranie, trzeba podać tyle
                  jednostek planu, ile się na te piksele przelicza. */}
              {zaczep.rodzaj === "naroznik" ? (
                <Rect
                  x={zaczep.point.x - ZACZEP_PX / zoom / 2}
                  y={zaczep.point.y - ZACZEP_PX / zoom / 2}
                  width={ZACZEP_PX / zoom}
                  height={ZACZEP_PX / zoom}
                  stroke="#2C6B4A"
                  strokeWidth={ZACZEP_KRESKA_PX / zoom}
                  listening={false}
                />
              ) : (
                <Circle
                  x={zaczep.point.x}
                  y={zaczep.point.y}
                  radius={ZACZEP_PX / zoom / 2}
                  stroke="#2C6B4A"
                  strokeWidth={ZACZEP_KRESKA_PX / zoom}
                  listening={false}
                />
              )}
            </>
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
                scaleX={skalaSymbolu(el.type)}
                scaleY={skalaSymbolu(el.type)}
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
                      // Bez przyciągania do siatki (patrz `withSnap`): przesuwanie
                      // zaznaczenia ma zachować WZAJEMNE odstępy elementów, a snap
                      // każdego z osobna zlepiłby sąsiadujące gniazdka w jedno oczko.
                      const x = start.x + dx;
                      const y = start.y + dy;
                      const node = elementNodesRef.current.get(id);
                      if (node) node.position({ x, y });
                      return { id, x, y };
                    });
                    onMoveElements(moves);
                    return;
                  }
                  // Bez przyciągania do siatki — patrz `withSnap`.
                  const x = e.target.x();
                  const y = e.target.y();
                  e.target.position({ x, y });
                  onMoveElement(el.id, x, y);
                }}
              >
                {isSel && <SelectionOutlineKonva type={el.type} wymiaryM={fixtureSizeM(el) ?? undefined} />}
                <ElementGlyphKonva
                  type={el.type}
                  color={def.color}
                  gangs={el.gangs}
                  agdLetter={el.agdLetter}
                  wymiaryM={fixtureSizeM(el) ?? undefined}
                />
                {/* Obszar trafienia — patrz komentarz przy `skalaSymbolu`. Rysowany po
                    glifie, więc leży NA nim w kolejności rysowania, ale będąc
                    przezroczystym nie zasłania niczego; przechwytuje za to kliknięcia
                    także tam, gdzie symbol jest samą cienką kreską. */}
                {(() => {
                  const t = glyphBoxSize(el.type, fixtureSizeM(el) ?? undefined);
                  return <Rect x={-t.w / 2} y={-t.h / 2} width={t.w} height={t.h} fill="transparent" />;
                })()}
                {/* Wysokość montażu POD symbolem — numery grup sterowania stoją z prawej
                    (`groupLabelAnchors`), więc te dwie adnotacje się nie zderzają.
                    Bez obwódki i w szarości, żeby czytać rysunek, a nie opisy. Obrócona
                    przeciwnie do elementu, tak jak numery grup: po obróceniu symbolu
                    klawiszem „R" liczba ma dalej stać prosto. */}
                {pokazWysokosci &&
                  (() => {
                    const opis = mountingLabel(el);
                    if (!opis) return null;
                    const { h } = glyphBoxSize(el.type);
                    return (
                      <Text
                        x={0}
                        y={h / 2 + 9}
                        rotation={-(el.rotation ?? 0)}
                        text={opis}
                        fontSize={8.5}
                        fontStyle="700"
                        fill="#64748B"
                        width={40}
                        height={12}
                        offsetX={20}
                        offsetY={6}
                        align="center"
                        verticalAlign="middle"
                        listening={false}
                      />
                    );
                  })()}
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
                  const rozm = kotwiceEtykiet.get(`${el.id}:${i}`);
                  const at = rozm?.kotwica ?? groupLabelAnchors(el.type)[i] ?? groupLabelAnchors(el.type)[0];

                  /* Kreska odniesienia — tylko dla etykiety, która USTĄPIŁA z domyślnej
                     strony. Problemem nie jest sama odległość cyfr, tylko to, że przy
                     ciasnym rzucie nie wiadomo, do którego symbolu numer należy: dwa
                     łączniki po dwóch stronach ściany dzieli 67 cm, a etykieta stoi 45 cm
                     od swojego symbolu, więc ŻADNE rozmieszczenie ich nie rozdziela
                     (sprawdzone: maksimum to 13 jedn.). Kreska usuwa dwuznaczność
                     zamiast z nią walczyć — tak robią to rysunki budowlane.

                     Przy luźnym rzucie nie pojawia się w ogóle, bo tam nic nie ustępuje. */
                  const dlugosc = Math.hypot(at.x, at.y);
                  const glif = Math.max(glyphBoxSize(el.type).w, glyphBoxSize(el.type).h) / 2;
                  const odGlifu = glif + 1;
                  const doCyfry = dlugosc - 7;
                  const kreska =
                    rozm?.przesunieta && doCyfry > odGlifu + 1
                      ? [
                          (at.x / dlugosc) * odGlifu,
                          (at.y / dlugosc) * odGlifu,
                          (at.x / dlugosc) * doCyfry,
                          (at.y / dlugosc) * doCyfry,
                        ]
                      : null;
                  return (
                    <Fragment key={i}>
                      {kreska && (
                        <Line
                          points={kreska}
                          stroke={def.color}
                          strokeWidth={0.8}
                          opacity={0.55}
                          listening={false}
                        />
                      )}
                    <Text
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
                    </Fragment>
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
