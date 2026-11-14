import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { rozmiescEtykietyGrup, type EtykietaDoRozmieszczenia } from "@/lib/lightGroups";

import { Stage, Layer, Rect, Line, Circle, Arc, Arrow, Text, Group, Image as KonvaImage } from "react-konva";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { MAX_ZOOM, minZoom } from "./zoomPlanu";
import { DD } from "konva/lib/DragAndDrop";
import type { CableRoute, ElementType, InstallationElement, NotatkaPlanu, Opening, Point, PrzewodReczny, RoomShape, Wall } from "@/types";
import { RODZAJE_PRZEWODU } from "@/lib/przewodyReczne";
import { ELEMENT_TYPES, fixtureSizeM, mountingLabel, SANITARY_FIXTURES, type SanitaryZone } from "@/lib/elements";
import {
  DEFAULT_WALL_THICKNESS,
  gruboscObrysuPokoju,
  krokSiatki,
  MANUAL_DRAW_SCALE_MPU,
  type PlanSize,
  schodySchemat,
  pomieszczeniePodPunktem,
} from "@/lib/design";
import {
  FALLBACK_FONT_ADNOTACJI,
  FALLBACK_FONT_NAZWY,
  fontOpisuPokoju,
  wymiaryNotatki,
  miejsceNaOpis,
  przesunieciaWokol,
  type ZajeteMiejsce,
  skalaOpisowRzutu,
  szerokoscRamki,
  szerokoscTekstu,
  zasiegNapisu,
} from "@/lib/opisPomieszczenia";
import {
  promieniePrzyciagania,
  promienOsi,
  snapDoGeometrii,
  wyrownajDoOsi,
  type Przyciagniecie,
} from "@/lib/drawSnap";
import { spreadOverlappingRoutes } from "@/lib/panel/loads";
import { dystansPalcow, kadrPodPalcem, kierunekPalca, srodekPalcow, zoomZeSzczypania, type PunktEkranu } from "@/lib/gestDotyku";
import { useDlugiePrzytrzymanie } from "@/hooks/useDlugiePrzytrzymanie";
import { useProstokatPrzeciagany } from "@/hooks/useProstokatPrzeciagany";
import { useKursoryRysowania, type WynikPunktu } from "@/hooks/useKursoryRysowania";
import { prostokatOtworu, prostokatSymbolu } from "@/lib/rozstawElementow";
import { nearestRouteSegmentIndex } from "@/lib/punktTrasy";
import {
  clampNum,
  nearestPointOnPolyline,
  pointInPolygon,
  polygonAreaM2,
  prostokatMiedzy,
  rectangleSizeM,
  rogiProstokata,
  snap,
} from "@/lib/geometry";
import { ElementGlyphKonva, SelectionOutlineKonva } from "@/components/design/ElementGlyphKonva";
import { glyphBoxSize, groupLabelAnchors, groupLabelCandidates } from "@/lib/glyphs";

export type ToolMode = "zaznacz" | "elementy" | "sciany" | "pomieszczenie" | "otwory" | "notatka" | "przewod" | "pan" | "skala";
export type Selection = { kind: "el" | "wall" | "room" | "opening" | "route" | "note" | "wire"; id: string } | null;

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

/** Długość kreski sygnalizującej wyrównanie do osi [px ekranu] — patrz `osieKursora`. */
const OS_ZNACZNIK_PX = 16;
const ZACZEP_KRESKA_PX = 1.5;

const MIN_ROOM_SIZE = 8;

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

const BEZ_OSI = { x: false, y: false } as const;

/** Jak długo po dotknięciu ignorujemy KAŻDY klik [ms] — zapas na wypadek, gdyby gest nie
 *  zaczął się od `pointerdown`. Patrz `klikAlboDotyk` i `echoTapu`. */
const ECHO_TAPU_MS = 400;

/**
 * Punkt EKRANU zdarzenia — działa i dla myszy, i dla dotyku.
 *
 * Menu kontekstowe i okienka pozycjonują się współrzędnymi okna, a `TouchEvent` nie
 * ma `clientX`: niesie je dopiero pojedynczy palec w `changedTouches`.
 */
function pozycjaEkranu(e: KonvaEventObject<MouseEvent | TouchEvent>): { x: number; y: number } {
  const evt = e.evt as MouseEvent & { changedTouches?: TouchList };
  const palec = evt.changedTouches?.[0];
  return palec ? { x: palec.clientX, y: palec.clientY } : { x: evt.clientX, y: evt.clientY };
}

/** Numer przycisku myszy albo `0` dla dotyku, który żadnego nie ma. */
function przyciskMyszy(e: KonvaEventObject<MouseEvent | TouchEvent>): number {
  return "button" in e.evt ? e.evt.button : 0;
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
  /** Notatki tekstowe tej kondygnacji (F6) — patrz `NotatkaPlanu`. */
  notatki?: NotatkaPlanu[];
  /** Klik w narzędziu „Notatka" — rodzic pyta o treść i stawia notatkę w tym punkcie. */
  onPlaceNote?: (p: Point) => void;
  onSelectNote?: (id: string) => void;
  onMoveNote?: (id: string, p: Point) => void;
  /** Dwuklik w notatkę — edycja treści. */
  onEditNote?: (id: string) => void;
  /** Ręczne przewody tej kondygnacji (F11) — patrz `PrzewodReczny`. */
  przewody?: PrzewodReczny[];
  /** Element klikniety jako pierwszy koniec przewodu, czekający na drugi. */
  przewodStart?: string | null;
  /** Klik w element w narzędziu „Przewód" — `null`: klik w puste miejsce (anuluje). */
  onWireElement?: (id: string | null) => void;
  onSelectWire?: (id: string) => void;
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
  /** Wymuszanie kątów prostych — dla ŚCIAN i POMIESZCZEŃ. Nazwa bez „walls", bo
   *  przełącznik rządzi oboma narzędziami: rysując pokój człowiek chce prostych kątów
   *  dokładnie tak samo jak rysując mur. */
  ortho: boolean;
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
  /**
   * Ktoś kręcił kółkiem nad rzutem BEZ `Ctrl`, czyli przewinął stronę zamiast
   * przybliżyć plan. Płótno samo nie wie, czy to pomyłka, czy świadome przewijanie —
   * zgłasza więc tylko fakt, a `DesignTab` decyduje, czy warto coś podpowiedzieć
   * (patrz `podpowiedziNawigacji.ts`).
   */
  onKolkoBezCtrl?: () => void;
  onSelectElement: (id: string, shiftKey: boolean) => void;
  onSelectWall: (id: string) => void;
  onEditElement: (id: string) => void;
  onElementContextMenu: (id: string, clientX: number, clientY: number) => void;
  onWallContextMenu: (id: string, clientX: number, clientY: number) => void;
  /** PPM na płótnie W TRAKCIE rysowania ściany (co najmniej 2 postawione punkty) —
   *  alternatywa dla przycisku „Zakończ" i klawisza Enter, ten sam wzorzec menu
   *  kontekstowego co przy elementach/ścianach/pomieszczeniach. */
  onWallDrawContextMenu: (clientX: number, clientY: number) => void;
  /**
   * „Dopasuj widok" wywołane z PŁÓTNA — patrz `handleStageDblClick`.
   *
   * Ta sama czynność, co ikona w pasku: kadr wraca na rysunek. Na dotyku ikona bywa
   * daleko od kciuka, a po kilku szczypnięciach droga powrotna jest tym, czego szuka
   * się najpierw.
   */
  onDopasujWidok?: () => void;
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
  /** Przeciąganie CAŁEGO zaznaczonego pomieszczenia za jego wnętrze (F5): początek ruchu,
   *  kolejne przyrosty (już przyciągnięte do siatki) i koniec — rodzic robi z tego jeden
   *  wpis do historii, ten sam wzorzec co przy narożniku. */
  onRoomMoveStart?: () => void;
  onMoveRoom?: (id: string, dx: number, dy: number) => void;
  onRoomMoveEnd?: (przesunieto: boolean) => void;
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
  /** PPM / przytrzymanie palcem na trasie. `punkt` to miejsce na PLANIE — tam „Dodaj
   *  punkt" wstawi nowe załamanie. */
  onRouteContextMenu: (routeId: string, clientX: number, clientY: number, punkt: Point) => void;
  /** Dwuklik / podwójne dotknięcie trasy — okno z informacjami o przewodzie.
   *  `odcinek` to indeks wskazanego odcinka w `CableRoute.points`. */
  onRouteInfo: (routeId: string, odcinek: number) => void;
  onClearSelection: () => void;
  onMarqueeSelect: (ids: string[]) => void;
  onPlaceElement: (p: Point) => void;
  /**
   * Duch elementu pod kursorem w narzędziu „Wstaw element” — pokazuje, gdzie i w jakim
   * obrocie stanie element po kliknięciu. `podglad` zwraca pozycję PO przyciągnięciu do
   * ściany i odsunięciu od sąsiadów, czyli tę samą, którą wstawi `onPlaceElement`.
   * Brak propa = bez ducha.
   */
  duchElementu?: {
    type: ElementType;
    gangs: number;
    agdLetter?: string;
    podglad: (p: Point) => { x: number; y: number; rotation: number };
  };
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

/**
 * Punkt planu pod wskazanym miejscem EKRANU. Do przytrzymania palcem, które podaje
 * współrzędne ekranu, a nie ma skąd wziąć „wskaźnika" sceny — ten sam przelicznik,
 * którego Konva używa w `getRelativePointerPosition`.
 */
function planZEkranu(stage: Konva.Stage, clientX: number, clientY: number): Point {
  const r = stage.container().getBoundingClientRect();
  return stage.getAbsoluteTransform().copy().invert().point({ x: clientX - r.left, y: clientY - r.top });
}
function centroid(points: Point[]): Point {
  const n = points.length || 1;
  return {
    x: points.reduce((a, p) => a + p.x, 0) / n,
    y: points.reduce((a, p) => a + p.y, 0) / n,
  };
}

/**
 * Powierzchnia obrysu do etykiety: m², gdy skala jest znana, inaczej `null`.
 * Poza komponentem, bo korzysta z niej też układ opisów (`opisyPomieszczen`),
 * liczony w `useMemo` — tam zależnością ma być sama skala, a nie funkcja.
 */
function formatPowierzchniaObrysu(points: Point[], mpu: number | null): string | null {
  const m2 = polygonAreaM2(points, mpu);
  if (m2 === null) return null;
  return `${m2.toFixed(1).replace(".", ",")} m²`;
}

/** Podpis „3,45 × 4,20 m" dla prostokątnego obrysu — sama detekcja i przeliczenie
 *  siedzą w `rectangleSizeM` (geometry.ts), tutaj zostaje wyłącznie formatowanie. */
function formatWymiaryObrysu(points: Point[], mpu: number | null): string | null {
  const rozmiar = rectangleSizeM(points, mpu);
  if (!rozmiar) return null;
  const f = (v: number) => v.toFixed(2).replace(".", ",");
  return `${f(rozmiar.w)} × ${f(rozmiar.h)} m`;
}

export function DesignCanvas({
  stageRef,
  anulujPodgladRef,
  elements,
  walls,
  roomShapes,
  notatki = [],
  onPlaceNote,
  onSelectNote,
  onMoveNote,
  onEditNote,
  przewody = [],
  przewodStart = null,
  onWireElement,
  onSelectWire,
  openings,
  toolMode,
  roomMode,
  snapOn,
  gridOn,
  selected,
  multiSelected,
  drawingWall,
  newWallThickness,
  ortho,
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
  onKolkoBezCtrl,
  onSelectElement,
  onSelectWall,
  onEditElement,
  onElementContextMenu,
  onWallContextMenu,
  onWallDrawContextMenu,
  onDopasujWidok,
  onWallClickForOpening,
  onSelectOpening,
  onOpeningContextMenu,
  onSelectRoom,
  onRoomEdgeClickForOpening,
  onRoomContextMenu,
  onRoomNameDblClick,
  onMoveRoomPoint,
  onRoomMoveStart,
  onMoveRoom,
  onRoomMoveEnd,
  onMoveWallPoint,
  onSelectRoute,
  onSetRoutePoints,
  onResetRoute,
  onRouteContextMenu,
  onRouteInfo,
  onClearSelection,
  onMarqueeSelect,
  onPlaceElement,
  duchElementu,
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
   * Miejsce zajęte przez symbole, ich numery grup i otwory — omijają je opisy (patrz
   * `miejsceNaOpis`). Sam symbol nie wystarczał: numer lampy stoi obok niej, więc nazwa
   * zepchnięta spod krzyżyka lądowała na jego cyfrze.
   */
  const zajetePrzezRysunek = useMemo(() => {
    const wynik: ZajeteMiejsce[] = [];
    for (const e of elements) {
      const skala = SANITARY_FIXTURES[e.type] ? sanitaryScale : elementScale;
      wynik.push(prostokatSymbolu(e, skala));
      (lightGroups.get(e.id) ?? []).forEach((n, i) => {
        if (n === undefined) return;
        const at = kotwiceEtykiet.get(`${e.id}:${i}`)?.kotwica ?? groupLabelAnchors(e.type)[i] ?? groupLabelAnchors(e.type)[0];
        if (!at) return;
        // Ta sama droga co przy rysowaniu cyfry: punkt w układzie grupy symbolu, czyli
        // przeskalowany i obrócony razem z nim. Pudełko cyfry to 14 × 14 jedn.
        const kat = ((e.rotation ?? 0) * Math.PI) / 180;
        const x = e.x + (at.x * Math.cos(kat) - at.y * Math.sin(kat)) * skala;
        const y = e.y + (at.x * Math.sin(kat) + at.y * Math.cos(kat)) * skala;
        const pol = 7 * skala;
        wynik.push({ x1: x - pol, y1: y - pol, x2: x + pol, y2: y + pol });
      });
    }
    // Otwory razem z łukiem skrzydła — bez tego „Hol" w przykładowym domu uciekał spod
    // lampy prosto na łuk drzwi (patrz `prostokatOtworu`).
    for (const o of openings) {
      const sciana = walls.find((w) => w.id === o.wallId);
      wynik.push(prostokatOtworu(o, sciana?.thickness ?? DEFAULT_WALL_THICKNESS));
    }
    return wynik;
  }, [elements, sanitaryScale, elementScale, lightGroups, kotwiceEtykiet, openings, walls]);

  /**
   * Układ opisu każdego pomieszczenia: nazwa, podpisy pod nią i miejsce całego bloku.
   *
   * Liczony tu, a nie przy rysowaniu pokoju, bo potrzebują go też podpisy stref
   * łazienkowych — mają omijać nazwy pomieszczeń tak samo jak symbole.
   */
  const opisyPomieszczen = useMemo(() => {
    const wynik = new Map<
      string,
      {
        fontNazwy: number;
        odsadzenieNazwy: number;
        podpisy: { tekst: string; font: number; szer: number; zasieg: number }[];
        goraPodpisu: (i: number) => number;
        kotwica: Point;
        zajete: ZajeteMiejsce;
      }
    >();
    for (const r of roomShapes) {
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
      const podpisy = [
        pokazWymiary ? formatWymiaryObrysu(r.points, metersPerUnit) : null,
        pokazPowierzchnie ? formatPowierzchniaObrysu(r.points, metersPerUnit) : null,
      ]
        .filter((t): t is string => t !== null)
        .map((tekst) => {
          const font = fontOpisuPokoju(metersPerUnit, tekst, szerokoscPokoju, {
            fallback: FALLBACK_FONT_ADNOTACJI,
          });
          // Ramka dokładnie na miarę napisu: stałe 100 jedn. (= 5 m!) łamały
          // dłuższe podpisy dopiero daleko poza małym pokojem.
          return { tekst, font, szer: szerokoscRamki(tekst, font), zasieg: zasiegNapisu(tekst, font) };
        });
      /** Górna krawędź i-tego podpisu względem kotwicy — patrz komentarz przy `y` podpisu. */
      const goraPodpisu = (i: number) =>
        odsadzenieAdnotacji - (podpisy.length - 1 - i) * (10 / FALLBACK_FONT_ADNOTACJI) * podpisy[i].font;
      // Zasięg napisów, a nie ich ramek — patrz `zasiegNapisu`.
      const polSzer = Math.max(zasiegNapisu(r.name, fontNazwy), ...podpisy.map((p) => p.zasieg)) / 2;
      const blok = {
        lewo: polSzer,
        prawo: polSzer,
        gora: Math.max(odsadzenieNazwy, ...podpisy.map((_, i) => -goraPodpisu(i))),
        dol: podpisy.length ? odsadzenieAdnotacji + podpisy[podpisy.length - 1].font : fontNazwy - odsadzenieNazwy,
      };
      // Nazwa i podpisy stoją tam, gdzie nie zasłania ich symbol — patrz `miejsceNaOpis`.
      // Cały blok jedzie razem, żeby wymiary zostały pod swoją nazwą.
      const kotwica = miejsceNaOpis({
        kotwica: centroid(r.points),
        blok,
        przeszkody: zajetePrzezRysunek,
        obrys: r.points,
        // Pół wysokości litery, a zasięg osiem pełnych: w pokoju w kształcie L środek
        // obrysu wypada na styku ramion, a wolne miejsce bywa dopiero w końcu ramienia
        // (przedpokój w przykładzie — ok. 40 jedn. od środka).
        krok: fontNazwy / 2,
        krokow: 16,
        odstep: fontNazwy * 0.15,
      });
      wynik.set(r.id, {
        fontNazwy,
        odsadzenieNazwy,
        podpisy,
        goraPodpisu,
        kotwica,
        zajete: {
          x1: kotwica.x - blok.lewo,
          y1: kotwica.y - blok.gora,
          x2: kotwica.x + blok.prawo,
          y2: kotwica.y + blok.dol,
        },
      });
    }
    return wynik;
  }, [roomShapes, metersPerUnit, pokazWymiary, pokazPowierzchnie, zajetePrzezRysunek]);

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
   * Długie przytrzymanie palcem = to samo menu, co prawy przycisk myszy.
   *
   * JEDNA instancja na całe płótno, a nie po jednej na węzeł: naraz trzyma się
   * palcem jedno miejsce, a wspólny licznik sam gasi gest zaczęty gdzie indziej.
   */
  const przytrzymanie = useDlugiePrzytrzymanie();

  /** Ostatnie dotknięcie obsłużone przez `onTap`/`onDblTap` — patrz `klikAlboDotyk`. */
  const echoTapuRef = useRef(0);

  /** Czy `onTap`/`onDblTap` obsłużył już BIEŻĄCY gest — kasowane przy każdym
   *  `pointerdown` na kontenerze płótna, czyli na początku następnego gestu. */
  const tapWGescieRef = useRef(false);

  /**
   * Czy klik to ECHO dotknięcia, które `onTap` już obsłużył.
   *
   * Samo okno czasu (`ECHO_TAPU_MS`) nie wystarczało: postawienie elementu przerysowuje
   * cały edytor, a dorobione `mousedown`/`mouseup` czekają w kolejce, aż ten render się
   * skończy. Na wolnym telefonie — i w CI pod obciążeniem — Konva składała z nich `click`
   * po więcej niż 400 ms i stawiała DRUGI element w tym samym miejscu (e2e
   * `przytrzymanie-dotykiem`: „Received: 2"; przy 6× zwolnionym procesorze klik
   * przychodził 2,1 s po `tap`).
   *
   * Dlatego rozstrzyga GEST, nie zegar. Każdy gest zaczyna się od `pointerdown`, który
   * zapisuje rodzaj wskaźnika (`typWskaznikaRef`) i kasuje `tapWGescieRef`. Klik, gdy
   * ostatni wskaźnik był palcem, a ten gest ma już obsłużony `tap`, jest jego echem —
   * bez względu na to, jak długo czekał. Sam klik tego nie powie: Konva składa go
   * z dorobionego `mouseup`, który `pointerType` nie ma. Prawdziwa mysz zaczyna własny
   * gest od `pointerdown` typu „mouse", więc jej klik przechodzi zawsze.
   */
  function echoTapu(): boolean {
    if (Date.now() - echoTapuRef.current < ECHO_TAPU_MS) return true;
    return typWskaznikaRef.current === "touch" && tapWGescieRef.current;
  }

  /**
   * TA SAMA czynność pod kliknięciem myszy i pod dotknięciem palca.
   *
   * Konva gasi domyślne zachowanie dotknięcia, gdy palec trafi w KSZTAŁT — dosłownie
   * `if (shape.preventDefault() && evt.cancelable && isTouch) evt.preventDefault()`
   * w jej `Stage`. Przeglądarka nie dorabia wtedy ani `mousedown`, ani `click`, a na
   * nich stoi cała obsługa myszy w tym pliku.
   *
   * Stąd dziura, która przez długi czas wyglądała na działającą aplikację: dotknięcie
   * PUSTEGO płótna dorabia klik i idzie zwykłą drogą (dlatego rysowanie dotykiem
   * działa), ale dotknięcie czegokolwiek NARYSOWANEGO było ślepe. Zmierzone: dotknięcie
   * ściany dawało wyłącznie `touchstart`/`touchend`, a mysz w tym samym punkcie —
   * `mousedown`/`mouseup`/`click` z trafieniem w `Line`.
   *
   * `echoTapuRef` to zabezpieczenie na przeglądarki, które oddają `touchstart` jako
   * nieodwoływalny: wtedy dorobiony klik JEDNAK przyjdzie, a bez straży wstawiłby
   * drugie drzwi w to samo miejsce albo skasował drugi punkt trasy. Dotknięcie PUSTEGO
   * płótna dorabia go zawsze — patrz `echoTapu`.
   */
  function klikAlboDotyk(akcja: (e: KonvaEventObject<MouseEvent | TouchEvent>) => void) {
    return {
      onClick: (e: KonvaEventObject<MouseEvent>) => {
        if (echoTapu()) return;
        if (poGescieKadru()) return;
        akcja(e);
      },
      onTap: (e: KonvaEventObject<TouchEvent>) => {
        echoTapuRef.current = Date.now();
        tapWGescieRef.current = true;
        if (poGescieKadru()) return;
        akcja(e);
      },
    };
  }

  /**
   * To samo co `klikAlboDotyk`, dla dwukliku i podwójnego dotknięcia.
   *
   * Tylko LEWYM przyciskiem. Konva liczy dwuklik z dwóch dowolnych kliknięć w krótkim
   * odstępie, więc zaznaczenie trasy lewym i zaraz potem PPM dawało „dwuklik" — zamiast
   * menu z „Dodaj punkt" otwierało się okno informacji.
   */
  function dwuklikAlboDotyk(akcja: (e: KonvaEventObject<MouseEvent | TouchEvent>) => void) {
    return {
      onDblClick: (e: KonvaEventObject<MouseEvent>) => {
        if (e.evt.button !== 0) return;
        if (echoTapu()) return;
        if (poGescieKadru()) return;
        akcja(e);
      },
      onDblTap: (e: KonvaEventObject<TouchEvent>) => {
        echoTapuRef.current = Date.now();
        tapWGescieRef.current = true;
        if (poGescieKadru()) return;
        akcja(e);
      },
    };
  }

  /**
   * Gest palcami, który ruszał KADREM (przesuwanie jednym palcem, szczypanie) —
   * trwający albo zakończony przed chwilą.
   *
   * Konva odpala `tap` przy puszczeniu palca bez względu na to, ile palec po drodze
   * przejechał: jej jedyny warunek to ten sam kształt na starcie i na końcu. Bez tej
   * straży każde przesunięcie rzutu kończyłoby się tak jak dotknięcie w miejscu,
   * w którym palec zszedł z ekranu — postawionym gniazdkiem albo punktem ściany.
   */
  const gestKadruRef = useRef({ trwa: false, koniec: 0 });
  function poGescieKadru() {
    const g = gestKadruRef.current;
    return g.trwa || Date.now() - g.koniec < ECHO_TAPU_MS;
  }
  /**
   * Jeden palec na płótnie: gdzie wylądował i co z niego wyszło. `kotwica` to punkt
   * planu, który palec chwycił — ustawiana dopiero, gdy ruch okazał się przesuwaniem
   * rzutu (patrz `kierunekPalca`); `oddany` — gest należy do kogoś innego (przewijanie
   * strony, przeciąganie elementu).
   */
  const palecRef = useRef<{
    x: number;
    y: number;
    naKsztalcie: boolean;
    kotwica: PunktEkranu | null;
    oddany: boolean;
  } | null>(null);

  /** Rozstaw palców, powiększenie i punkt planu spod środka palców z chwili
   *  ROZPOCZĘCIA szczypania — patrz `zoomZeSzczypania` i `kadrPodPalcem`. */
  const szczypanieRef = useRef<{ dystans: number; zoom: number; kotwica: PunktEkranu } | null>(null);
  /**
   * Trwa szczypanie — na ten czas NIC na płótnie nie jest przeciągalne.
   *
   * Konva prowadzi własne przeciąganie na PIERWSZYM wskaźniku i nie obchodzi jej, ilu
   * palców dotyczy gest. Szczypanie zaczyna się tak samo jak przeciągnięcie — jednym
   * palcem postawionym na czymś narysowanym — więc gdy palce się rozjeżdżają, Konva
   * czyta ruch tego pierwszego jako przeciągnięcie i przesuwa element pod nim.
   * Zmierzone: gniazdko w (100, 99) jedn. po jednym szczypnięciu lądowało w (90, 100),
   * z wpisem do projektu i do historii cofania.
   *
   * `preventDefault` w `prowadz` tego NIE zatrzymuje — gasi domyślne zachowanie
   * przeglądarki (przewijanie strony), a przeciąganie Konvy to zwykły JavaScript.
   *
   * Dlatego zdejmujemy `draggable`, i to działa z powodu, który warto znać: Konva
   * zakłada „zalążek" przeciągnięcia już przy `touchstart`, ale w stanie `ready` —
   * właściwy `dragstart` odpala dopiero pierwszy ruch. Zdjęte `draggable` kasuje taki
   * zalążek po cichu, BEZ `dragstart` i `dragend`, więc do store'a nie idzie nic
   * (gdyby przeciąganie zdążyło się zacząć, Konva wywołałaby `dragend` i zapisała
   * przesunięcie — stąd przełącznik przy DRUGIM palcu, a nie przy pierwszym ruchu).
   *
   * Stan, nie ref, bo `draggable` jest propsem węzłów i musi przejść przez render.
   * Jedno dodatkowe przerysowanie na gest — koszt bez znaczenia wobec cichej zmiany
   * w projekcie.
   */
  const [szczypie, setSzczypie] = useState(false);
  /**
   * Bieżący kadr i sposób zmiany powiększenia — dla nasłuchu dotyku.
   *
   * Nasłuch montuje się RAZ (patrz efekt niżej: musi być nie-pasywny, żeby wolno mu
   * było zatrzymać przewijanie strony), a kadr zmienia się co klatkę gestu. Bez refa
   * trzeba by go przepinać po każdym przesunięciu — w środku szczypania.
   */
  const kadrRef = useRef({ zoom, widok, onZoomChange, toolMode });
  kadrRef.current = { zoom, widok, onZoomChange, toolMode };
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
  /**
   * Rozmiar EKRANOWY przeliczony na jednostki planu.
   *
   * Do uchwytów, kropek i znaczników — wszystkiego, co jest przyborem do rysowania,
   * a nie rysunkiem. Scena skaluje wszystko, co na niej stoi, więc liczba podana
   * wprost rośnie razem z powiększeniem: przy skali rysowania (40 px/m) kropki
   * wielokąta miały 16 px średnicy, a uchwyty zaznaczonego pomieszczenia 24 px.
   *
   * Podział jest ten sam, co w programach CAD: rysunek mierzy się w metrach, przybory
   * w pikselach ekranu. Wartości niżej są dobrane tak, żeby wyglądały jak przy
   * powiększeniu 1 — czyli tak, jak wyglądały, zanim skala rysowania się zmieniła.
   */
  const px = useCallback((wPikselach: number) => wPikselach / zoom, [zoom]);

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

  /**
   * Gdzie jest kursor, gdy duch elementu ma się pokazywać — surowy punkt planu; pozycję
   * ducha liczy się z niego w renderze, żeby po postawieniu elementu (zmiana listy
   * sąsiadów) duch sam odsunął się od nowego symbolu, bez czekania na ruch myszy.
   */
  const [kursorElementu, setKursorElementu] = useState<Point | null>(null);
  /** Rodzaj ostatniego wskaźnika (mysz, rysik, palec). Przeglądarka po dotknięciu dorabia
   *  zdarzenia myszy, więc sam `mousemove` nie odróżnia myszy od palca — a duch ma sens
   *  tylko tam, gdzie kursor porusza się bez dotykania. */
  const typWskaznikaRef = useRef<string>("mouse");
  useEffect(() => {
    if (toolMode !== "elementy") setKursorElementu(null);
  }, [toolMode]);

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
  /** Trwające przeciąganie całego pomieszczenia — patrz `handleStageMouseDown`. */
  const przesuwaniePokojuRef = useRef<{ id: string; start: Point; przesuniete: Point } | null>(null);
  /** Ramka zaznaczania obszarem (narzędzie „Zaznacz", przeciągnięcie po pustym płótnie). */
  const ramka = useProstokatPrzeciagany();
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

  /** Prostokąt pomieszczenia rysowany przeciągnięciem albo dwoma kliknięciami. */
  const prostokatPokoju = useProstokatPrzeciagany();
  const roomRect = prostokatPokoju.prostokat;
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
    const przeciaganieProstokata = prostokatPokoju.trwa();
    const bylo = przeciaganieProstokata || roomRect !== null || ramka.trwa() || ramka.prostokat !== null;

    // Po `mouseup` Konva wyśle jeszcze `click`. Tylko przy PRZERWANYM PRZECIĄGANIU
    // trzeba go zjeść — inaczej puszczenie przycisku od razu stawiałoby kotwicę
    // nowego prostokąta w tym samym miejscu. Przy anulowaniu bez wciśniętej myszy
    // (tryb dwóch kliknięć) tej flagi NIE wolno ustawiać, bo zjadłaby następne,
    // całkiem już zamierzone kliknięcie użytkownika.
    if (przeciaganieProstokata) roomRectJustDrawnRef.current = true;

    prostokatPokoju.porzuc();
    ramka.porzuc();
    kursory.bezPomocy();
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
  /** Gumowe linie, zaczep i znacznik osi przy rysowaniu — patrz `useKursoryRysowania`. */
  const kursory = useKursoryRysowania();
  const { kursorPokoju: roomCursor, kursorSciany: wallCursor, zaczep, osie: osieKursora } = kursory;

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

  /**
   * Gdzie stoi podpis „strefy: …" każdego przyboru — lewy górny róg środka tekstu.
   *
   * Domyślnie NAD strefą, czyli tam, gdzie stał zawsze. Przybór stoi jednak przy ścianie
   * łazienki, więc „nad strefą" to najczęściej ZA ścianą: w przykładach napis przecinał
   * mur i wchodził na nazwę sąsiedniego pokoju („Hol"), albo stawał na nazwie łazienki.
   * Szukamy więc miejsca wewnątrz pomieszczenia przyboru, wolnego od symboli, nazw
   * pomieszczeń i podpisów stref postawionych wcześniej.
   */
  const podpisyStref = useMemo(() => {
    const zajete: ZajeteMiejsce[] = [
      ...zajetePrzezRysunek,
      ...Array.from(opisyPomieszczen.values(), (o) => o.zajete),
    ];
    /** Ściany i obrysy pomieszczeń (też rysowane jak mur) — podpis nie ma leżeć na
     *  murze. W przykładzie „strefy: umywalka" stała dokładnie na linii ściany łazienki. */
    const mury = [
      ...walls.flatMap((w) =>
        w.points.slice(1).map((b, i) => ({ a: w.points[i], b, grubosc: w.thickness ?? DEFAULT_WALL_THICKNESS }))
      ),
      ...roomShapes.flatMap((r) =>
        r.points.map((a, i) => ({ a, b: r.points[(i + 1) % r.points.length], grubosc: grubosciObrysu }))
      ),
    ];
    const wynik = new Map<string, { x: number; y: number; tekst: string }>();
    for (const z of zones) {
      const tekst = `strefy: ${z.label}${!z.calibrated ? " (bez skali)" : ""}`;
      const font = 8 * so;
      // Sam tekst, bez zapasu ramki: łazienka ma zwykle 2 m szerokości, a podpis
      // z zapasem nie zmieściłby się w niej nigdzie.
      const polSzer = szerokoscTekstu(tekst, font) / 2;
      // Zapas liczony z WIĘKSZEGO boku: przy obrocie o 90° to szerokość wchodzi w pion,
      // więc stała oparta na wysokości kładłaby napis na strefie.
      const zasieg = Math.max(z.w, z.h) / 2 + z.zone2;
      const pokoj = roomShapes.find((r) => pointInPolygon({ x: z.x, y: z.y }, r.points));
      // Przybór stoi przy ścianie, więc podpis wyśrodkowany nad nim wystaje za mur.
      // Dosuwamy go w poziomie do wnętrza pokoju (w granicach jego obrysu).
      const xs = pokoj?.points.map((p) => p.x) ?? [];
      const wPoziomie = (x: number) =>
        xs.length && Math.max(...xs) - Math.min(...xs) > 2 * polSzer
          ? clampNum(x, Math.min(...xs) + polSzer, Math.max(...xs) - polSzer)
          : x;
      const miejsce = miejsceNaOpis({
        kotwica: { x: z.x, y: z.y - zasieg - 14 * so },
        blok: { lewo: polSzer, prawo: polSzer, gora: 0, dol: font },
        przeszkody: zajete,
        obrys: pokoj?.points,
        wolnoZaObrys: true,
        odcinki: mury,
        kandydaci: [
          // Nad strefą i pod nią, potem przy jej krawędziach od środka — i na końcu po bokach.
          { x: wPoziomie(z.x), y: z.y - zasieg - 14 * so },
          { x: wPoziomie(z.x), y: z.y + zasieg + 4 * so },
          { x: wPoziomie(z.x), y: z.y - zasieg + 2 * so },
          { x: wPoziomie(z.x), y: z.y + zasieg - 2 * so - font },
          { x: z.x + zasieg + polSzer + 4 * so, y: z.y - font / 2 },
          { x: z.x - zasieg - polSzer - 4 * so, y: z.y - font / 2 },
          // Ciasna łazienka: żadne z miejsc przy strefie nie jest wolne — szukamy dalej
          // po całym pokoju, od przyboru na zewnątrz.
          ...przesunieciaWokol({ x: wPoziomie(z.x), y: z.y }, font, 12),
        ],
      });
      zajete.push({ x1: miejsce.x - polSzer, y1: miejsce.y, x2: miejsce.x + polSzer, y2: miejsce.y + font });
      wynik.set(z.id, { ...miejsce, tekst });
    }
    return wynik;
  }, [zones, so, roomShapes, zajetePrzezRysunek, opisyPomieszczen, walls, grubosciObrysu]);

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
  function kandydaciOsi(p: Point, punktyFigury: Point[]): Point[] {
    const mpu = metersPerUnit !== null && metersPerUnit > 0 ? metersPerUnit : MANUAL_DRAW_SCALE_MPU;
    const zasieg = ZASIEG_OSI_M / mpu;
    const wPoblizu = (q: Point) => Math.hypot(q.x - p.x, q.y - p.y) <= zasieg;
    return [
      ...punktyFigury,
      ...roomShapes.flatMap((r) => r.points).filter(wPoblizu),
      ...walls.flatMap((w) => w.points).filter(wPoblizu),
    ];
  }

  /**
   * Punkt po WYRÓWNANIU DO OSI, z siatką jako uzupełnieniem osi, która nie złapała.
   *
   * Wspólne dla ścian i pomieszczeń — bo to ta sama potrzeba: wierzchołek ma stanąć
   * w linii z tym, co już narysowano. Wcześniej wyrównanie miały tylko pomieszczenia,
   * a ściany wyłącznie tryb ortogonalny, więc ta sama czynność zachowywała się inaczej
   * zależnie od tego, którym narzędziem się ją robiło.
   *
   * Oś liczona z punktu SUROWEGO, nie z przyciągniętego do siatki: siatka zaokrągla do
   * oczka, więc najpierw zniosłaby punkt z osi, a potem oś ściągałaby go z powrotem.
   */
  function naOsiachLubSiatce(
    raw: Point,
    punktyFigury: Point[]
  ): { punkt: Point; wyrownanie: { x: boolean; y: boolean } } {
    const naSiatce = withSnap(raw);
    const w = wyrownajDoOsi(raw, kandydaciOsi(raw, punktyFigury), promienOsi(metersPerUnit));
    return {
      punkt: { x: w.osX ? w.punkt.x : naSiatce.x, y: w.osY ? w.punkt.y : naSiatce.y },
      wyrownanie: { x: !!w.osX, y: !!w.osY },
    };
  }

  /** To samo, ale razem z zaczepem, który o położeniu punktu zadecydował — patrz
   *  `punktScianyZZaczepem` niżej, gdzie stoi powód takiej pary. */
  function punktPokojuZZaczepem(p: Point): WynikPunktu {
    const z = przyciagnijDoGeometrii(p);
    // Trafienie w samą geometrię wygrywa: skoro punkt siada na narożniku sąsiada, to
    // jest już wyrównany do wszystkiego, do czego trzeba — i ma własny znacznik.
    if (z) return { punkt: z.point, zaczep: z, wyrownanie: BEZ_OSI };

    const { punkt, wyrownanie } = naOsiachLubSiatce(p, drawingRoomPoints);
    // Tryb kątów prostych działa TAK SAMO jak przy ścianach: zamraża oś bliższą
    // poprzedniemu wierzchołkowi. Bez tego rysowanie pokoju wieloboku miało pomoc
    // słabszą niż rysowanie muru, choć chodzi o dokładnie to samo.
    const ostatni = drawingRoomPoints[drawingRoomPoints.length - 1];
    if (ortho && ostatni) return { punkt: orthoSnap(ostatni, punkt), zaczep: null, wyrownanie: BEZ_OSI };
    return { punkt, zaczep: null, wyrownanie };
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
    if (ortho && drawingWall.length === 3) {
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
  function punktScianyZZaczepem(raw: Point): WynikPunktu {
    const { punkt: naOsiach, wyrownanie } = naOsiachLubSiatce(raw, drawingWall);
    const ostatni = drawingWall[drawingWall.length - 1];
    // Tryb ortogonalny NAD wyrównaniem: jest wyborem użytkownika, a wyrównanie tylko
    // podpowiedzią. Gdy zamraża oś, znacznik osi już nic nie wnosi — cały odcinek jest
    // wtedy z definicji poziomy albo pionowy.
    const poOrtho = ortho && ostatni ? orthoSnap(ostatni, naOsiach) : naOsiach;
    const osie = ortho && ostatni ? BEZ_OSI : wyrownanie;
    const wlasne = zPrzyciaganiem(poOrtho);
    if (wlasne) return { punkt: wlasne, zaczep: null, wyrownanie: BEZ_OSI };
    const z = przyciagnijDoGeometrii(raw);
    if (z) return { punkt: z.point, zaczep: z, wyrownanie: BEZ_OSI };
    return { punkt: poOrtho, zaczep: null, wyrownanie: osie };
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
    return formatPowierzchniaObrysu(points, metersPerUnit);
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
      prostokatPokoju.zacznij(snapPunktuPokoju(p));
      return;
    }

    if (e.target !== stage) return;
    // Wnętrze ZAZNACZONEGO pomieszczenia chwyta cały pokój (F5 z audytu 5.11.2026) —
    // zamiast czyścić zaznaczenie i zaczynać ramkę. Niezaznaczony pokój działa po
    // staremu: klik go zaznacza (B9), przeciągnięcie rysuje ramkę.
    if (toolMode === "zaznacz" && selected?.kind === "room" && onMoveRoom && stage) {
      const p0 = planPoint(stage);
      const pokoj = roomShapes.find((r) => r.id === selected.id);
      if (p0 && pokoj && pointInPolygon(p0, pokoj.points)) {
        przesuwaniePokojuRef.current = { id: pokoj.id, start: p0, przesuniete: { x: 0, y: 0 } };
        onRoomMoveStart?.();
        return;
      }
    }
    onClearSelection();
    if (toolMode !== "zaznacz") return;
    const p = stage && planPoint(stage);
    if (!p) return;
    ramka.zacznij(p);
  }

  function handleStageMouseMove(e: KonvaEventObject<MouseEvent>) {
    const stage = e.target.getStage();

    const ruchPokoju = przesuwaniePokojuRef.current;
    if (ruchPokoju && stage) {
      const p = planPoint(stage);
      if (p) {
        // Całkowite przesunięcie od chwycenia, przyciągnięte do kroku siatki — pokój
        // skacze o oczko, jak narożnik; do rodzica idzie tylko PRZYROST.
        const dx = snapOn ? snap(p.x - ruchPokoju.start.x, krok) : p.x - ruchPokoju.start.x;
        const dy = snapOn ? snap(p.y - ruchPokoju.start.y, krok) : p.y - ruchPokoju.start.y;
        const ix = dx - ruchPokoju.przesuniete.x;
        const iy = dy - ruchPokoju.przesuniete.y;
        if (ix !== 0 || iy !== 0) {
          ruchPokoju.przesuniete = { x: dx, y: dy };
          onMoveRoom?.(ruchPokoju.id, ix, iy);
        }
      }
      return;
    }

    // Pozycja kursora w jednostkach planu — pasek stanu przelicza ją na metry.
    // `null` poza obszarem planu, żeby nie pokazywać współrzędnych spoza rysunku.
    onPointerMove?.(stage ? planPoint(stage) : null);

    // Duch elementu: tylko mysz i rysik, tylko w narzędziu wstawiania, nigdy w trakcie
    // przesuwania widoku. Poza obszarem planu `planPoint` daje `null` i duch znika.
    if (toolMode === "elementy" && duchElementu) {
      // Palec = bez ducha, i to także wtedy, gdy ten sam ekran dopiero co obsługiwał
      // mysz: stary duch zostałby wiszeć w ostatnim miejscu, w które mysz dotarła.
      const bezDucha = typWskaznikaRef.current === "touch" || !!przesuwanieRef.current;
      setKursorElementu(bezDucha || !stage ? null : planPoint(stage));
    }

    // Bez warunku na `drawingWall.length`: zaczep pokazujemy JUŻ PRZED pierwszym
    // kliknięciem, bo pierwszy punkt ściany też się przyciąga (patrz `punktSciany`).
    // Wcześniej ta gałąź wymagała postawionego punktu, więc najczęstszy start —
    // „zacznij ściankę działową od narożnika tamtej ściany" — przyciągał się
    // niewidzialnie, czyli dokładnie w stanie, który znacznik miał zlikwidować.
    if (toolMode === "sciany") {
      const raw = stage && planPoint(stage);
      if (!raw) {
        kursory.setKursorSciany(null);
        kursory.bezPomocy();
        return;
      }
      const wynik = punktScianyZZaczepem(raw);
      // Gumowy odcinek dopiero od drugiego punktu — przed pierwszym kliknięciem nie ma
      // od czego go ciągnąć.
      kursory.setKursorSciany(drawingWall.length > 0 ? wynik.punkt : null);
      kursory.pokazPomoc(wynik);
      return;
    }

    if (drawingRoom) {
      const raw = stage && planPoint(stage);
      if (!raw) return;
      if (roomMode === "wielobok") {
        // przy kursorze w pobliżu startu pokazujemy punkt startowy, nie pozycję myszy —
        // dzięki temu widać dokładnie, gdzie figura się domknie
        if (closesPolygon(raw)) {
          kursory.setKursorPokoju(drawingRoomPoints[0]);
          kursory.bezPomocy();
          return;
        }
        const wynik = punktPokojuZZaczepem(raw);
        kursory.setKursorPokoju(wynik.punkt);
        kursory.pokazPomoc(wynik);
        return;
      }
      // Kotwica z pierwszego kliknięcia działa tak samo jak wciśnięty przycisk —
      // podgląd prostokąta ma iść za kursorem w OBU trybach, inaczej po pierwszym
      // kliknięciu ekran wyglądałby, jakby nic się nie stało.
      // Zaczep liczony PRZED sprawdzeniem kotwicy: pierwszy narożnik prostokąta
      // przyciąga się tak samo jak każdy następny, a przed pierwszym kliknięciem
      // kotwicy jeszcze nie ma. Bez tego najczęstszy start — „obrysuj pokój od rogu
      // muru" — przyciągał się niewidzialnie.
      const wynik = punktPokojuZZaczepem(raw);
      const rog = wynik.punkt;
      kursory.pokazPomoc(wynik);
      prostokatPokoju.rozciagnij(rog, rectAnchor);
      return;
    }

    if (!ramka.trwa()) return;
    const p = stage && planPoint(stage);
    if (!p) return;
    ramka.rozciagnij(p);
  }

  function handleStageMouseUp() {
    const ruchPokoju = przesuwaniePokojuRef.current;
    if (ruchPokoju) {
      przesuwaniePokojuRef.current = null;
      onRoomMoveEnd?.(ruchPokoju.przesuniete.x !== 0 || ruchPokoju.przesuniete.y !== 0);
      return;
    }
    if (prostokatPokoju.trwa()) {
      const rect = prostokatPokoju.zakoncz();
      // Prostokąt zbyt mały to NIE jest nieudane przeciągnięcie do wyrzucenia —
      // to zwykłe kliknięcie, czyli pierwszy krok trybu dwóch kliknięć. Kotwicę
      // stawia dopiero `handleStageClick` (tam trafia też klik bez żadnego ruchu
      // myszy), więc tutaj tylko sprzątamy podgląd i nie gasimy tamtej ścieżki.
      const domkniety = !!rect && rect.w >= MIN_ROOM_SIZE && rect.h >= MIN_ROOM_SIZE;
      if (domkniety) {
        prostokatPokoju.schowaj();
        // Konva wyśle po tym `click` (mousedown i mouseup na tym samym celu) —
        // bez tej flagi domykałby od razu KOLEJNY prostokąt w miejscu, w którym
        // skończyło się przeciągnięcie.
        roomRectJustDrawnRef.current = true;
        onRoomRectDrawn(rogiProstokata(rect!));
      }
      return;
    }

    if (!ramka.trwa()) return;
    const rect = ramka.zakoncz();
    ramka.schowaj();
    if (!rect || (rect.w < 4 && rect.h < 4)) {
      // Zbyt mały ruch = zwykły klik, nie zaznaczanie obszarem. Klik w puste miejsce
      // WEWNĄTRZ obrysu zaznacza to pomieszczenie (audyt 5.11.2026, B9): podpowiedź
      // narzędzia mówi „kliknij pomieszczenie", a zaznaczał dopiero trafiony obrys albo
      // nazwa. Samo wnętrze na płótnie celowo nie łapie zdarzeń (patrz wypełnienie
      // niżej), więc trafienie liczymy z geometrii. Poza pokojami — zaznaczenie zostaje
      // wyczyszczone, jak było (`onClearSelection` w `handleStageMouseDown`).
      const pokoj = rect && pomieszczeniePodPunktem({ x: rect.x, y: rect.y }, roomShapes);
      if (pokoj) onSelectRoom(pokoj.id);
      return;
    }
    const ids = elements
      .filter((el) => el.x >= rect.x && el.x <= rect.x + rect.w && el.y >= rect.y && el.y <= rect.y + rect.h)
      .map((el) => el.id);
    onMarqueeSelect(ids);
  }

  function handleStageClick(e: KonvaEventObject<MouseEvent | TouchEvent>) {
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
    if (przyciskMyszy(e) === 2 || przyciskMyszy(e) === 1) return;
    // Klik DOROBIONY przez przeglądarkę po przytrzymaniu palca, w miejscu, w którym
    // właśnie otworzyło się menu kontekstowe. Bez tego menu wstawałoby i natychmiast
    // stawiało pod sobą element albo dokładało punkt ściany (patrz `pochlonEchoKliku`).
    if (przytrzymanie.pochlonEchoKliku()) return;
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
          const rect = prostokatMiedzy(rectAnchor, rogSnapowany);
          if (rect.w < MIN_ROOM_SIZE || rect.h < MIN_ROOM_SIZE) return; // za mały — czekamy dalej
          prostokatPokoju.porzuc();
          onRoomRectDrawn(rogiProstokata(rect));
          return;
        }
        onAddRoomPoint(rogSnapowany);
        return;
      }
      if (closesPolygon(p)) {
        onCloseRoomPolygon();
        kursory.setKursorPokoju(null);
        // Także znacznik osi — wcześniej gaszony był tylko zaczep i znacznik stał
        // przy domkniętej figurze aż do następnego ruchu myszy.
        kursory.bezPomocy();
        return;
      }
      onAddRoomPoint(snapPunktuPokoju(p));
      return;
    }
    if (toolMode === "skala") {
      onAddCalibPoint(p);
      return;
    }
    if (toolMode === "notatka") {
      onPlaceNote?.(p);
      return;
    }
    if (toolMode === "przewod") {
      // Klik obok elementów porzuca zaczęty przewód — tak jak Esc.
      onWireElement?.(null);
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
  /**
   * Dwuklik (albo podwójne dotknięcie) w PUSTE miejsce planu dopasowuje widok.
   *
   * Tylko w „Zaznacz" i „Przesuń widok" — czyli tam, gdzie dwuklik i tak nic nie robił.
   * W narzędziach rysujących każde kliknięcie coś stawia, więc dwa pod rząd to dwa
   * punkty ściany albo dwa gniazdka, a nie prośba o przeramowanie.
   *
   * `e.target === stage` znaczy „poza wszystkim, co narysowane": podkład i siatka leżą
   * na warstwie z `listening={false}`, więc wgrany rzut nie zasłania tego gestu.
   */
  function handleStageDblClick(e: KonvaEventObject<MouseEvent | TouchEvent>) {
    if (toolMode !== "zaznacz" && toolMode !== "pan") return;
    if (e.target !== e.target.getStage()) return;
    onDopasujWidok?.();
  }

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
    if (!e.evt.ctrlKey && !e.evt.metaKey) {
      // Strona przewija się dalej — o to chodzi, bo płótno zajmuje pół ekranu i bez
      // tego nie dałoby się jej przewinąć znad rzutu. Meldujemy tylko, że ktoś
      // właśnie mógł chcieć czegoś innego.
      onKolkoBezCtrl?.();
      return;
    }
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

  /**
   * Przybliżenie z rozstawu palców — kotwiczone w punkcie MIĘDZY nimi.
   *
   * Ta sama droga, co przy `Ctrl` + kółku: nowe powiększenie idzie do rodzica, a
   * `kotwicaZoomRef` pilnuje, żeby punkt planu chwycony na początku gestu leżał pod
   * bieżącym środkiem palców (patrz `useLayoutEffect` wyżej). Dzięki temu szczypanie
   * i przesuwanie dwoma palcami dzieją się naraz.
   */

  /**
   * Szczypanie dwoma palcami — jedyne przybliżanie rzutu, jakie ma sens na dotyku.
   *
   * `Ctrl` + kółko, czyli sposób na myszy, na telefonie nie istnieje; zostawały
   * przyciski `−` i `+` w pasku, a szczypanie — po które sięga tam odruchowo każdy —
   * powiększało CAŁĄ STRONĘ razem z paskami.
   *
   * NATYWNY nasłuch, a nie `onTouchMove` Reacta, i to jest tu sedno: React podpina
   * `touchmove` jako PASYWNY, czyli taki, któremu nie wolno zatrzymać przewijania.
   * Bez `preventDefault` przeglądarka przewijałaby stronę w trakcie gestu (płótno ma
   * `touch-action: pan-y`, żeby JEDEN palec nadal przewijał w pionie), a my zmienialibyśmy
   * przy tym powiększenie — dwie rzeczy naraz i żadna do końca.
   *
   * Montowany RAZ. Wszystko, co zmienne, idzie przez `kadrRef`: przepinanie nasłuchu
   * po każdej klatce gestu gubiłoby zdarzenia w jego trakcie.
   */
  useEffect(() => {
    const el = kontenerRef.current;
    if (!el) return;

    /** Dwa pierwsze palce jako punkty ekranu. Trzeci i dalsze gest ignoruje. */
    function palce(e: TouchEvent): [PunktEkranu, PunktEkranu] | null {
      if (e.touches.length < 2) return null;
      const a = e.touches[0];
      const b = e.touches[1];
      return [
        { x: a.clientX, y: a.clientY },
        { x: b.clientX, y: b.clientY },
      ];
    }

    /** Punkt ekranu względem lewego górnego rogu płótna. */
    function naPlotnie(p: PunktEkranu): PunktEkranu {
      const ramka = el!.getBoundingClientRect();
      return { x: p.x - ramka.left, y: p.y - ramka.top };
    }

    /** Punkt planu leżący pod punktem ekranu — w BIEŻĄCYM kadrze. */
    function punktPlanu(p: PunktEkranu): PunktEkranu {
      const { zoom: z, widok: w } = kadrRef.current;
      const n = naPlotnie(p);
      return { x: w.x + n.x / z, y: w.y + n.y / z };
    }

    function zacznij(e: TouchEvent) {
      if (e.touches.length === 1) {
        const t = e.touches[0];
        palecRef.current = {
          x: t.clientX,
          y: t.clientY,
          // Nasz nasłuch siedzi na kontenerze, więc Konva obsłużyła już to dotknięcie
          // — i jeśli trafiło w kształt, zgasiła je (patrz `klikAlboDotyk`). Przeglądarka
          // nie przewinie wtedy strony w żadną stronę, więc rzut może jechać także w pionie.
          naKsztalcie: e.defaultPrevented,
          kotwica: null,
          oddany: false,
        };
        return;
      }
      const para = palce(e);
      if (!para) return;
      // Drugi palec przejmuje gest od pierwszego: od teraz to szczypanie.
      palecRef.current = null;
      gestKadruRef.current.trwa = true;
      szczypanieRef.current = {
        dystans: dystansPalcow(para[0], para[1]),
        zoom: kadrRef.current.zoom,
        kotwica: punktPlanu(srodekPalcow(para[0], para[1])),
      };
      // Drugi palec wylądował — zdejmujemy przeciąganie, ZANIM przyjdzie pierwszy ruch
      // (patrz `szczypie`). React zbiera tę zmianę w mikrozadaniu, czyli przed kolejnym
      // zdarzeniem dotyku, więc węzły są już nieprzeciągalne, gdy Konva zaczyna czytać
      // ruch palców.
      setSzczypie(true);
    }

    function prowadz(e: TouchEvent) {
      if (e.touches.length === 1) {
        prowadzJednym(e, e.touches[0]);
        return;
      }
      const start = szczypanieRef.current;
      const para = palce(e);
      if (!start || !para) return;
      // Gest należy do nas — strona nie ma się przy okazji przewijać.
      e.preventDefault();
      const { zoom: zoomTeraz, onZoomChange: zmienZoom } = kadrRef.current;
      const nowaSkala = zoomZeSzczypania(start.zoom, start.dystans, dystansPalcow(para[0], para[1]), {
        min: minZoom(),
        max: MAX_ZOOM,
      });
      /**
       * Punkt planu chwycony NA POCZĄTKU gestu ma leżeć pod BIEŻĄCYM środkiem palców.
       * Jedna zasada na oba ruchy naraz: palce rozsunięte przybliżają, palce przesunięte
       * ciągną za sobą rzut.
       *
       * Wcześniej kotwica była liczona co klatkę z bieżącego położenia palców — czyli
       * trzymała pod palcami to, co akurat pod nimi było, i przesuwanie dwoma palcami
       * nie ruszało rzutu wcale. Do tego klatka bez zmiany powiększenia (palce w stałym
       * rozstawie, albo powiększenie oparte o granicę) kończyła się, zanim cokolwiek
       * przesunęła.
       */
      const kursor = naPlotnie(srodekPalcow(para[0], para[1]));
      if (nowaSkala === zoomTeraz) {
        setWidok(kadrPodPalcem(start.kotwica, kursor, zoomTeraz));
        return;
      }
      // Nowe powiększenie wchodzi przez rodzica, a kadr dopiero po przerysowaniu —
      // ta sama droga co `Ctrl` + kółko (patrz `handleWheel` i `useLayoutEffect` wyżej).
      kotwicaZoomRef.current = { planX: start.kotwica.x, planY: start.kotwica.y, kursorX: kursor.x, kursorY: kursor.y };
      zmienZoom(nowaSkala);
    }

    /**
     * Przesuwanie rzutu JEDNYM palcem.
     *
     * W bok — zawsze: strona w poziomie się nie przewija, więc ten ruch nikomu innemu
     * nie jest potrzebny. W pionie — tylko gdy przeglądarka i tak by go nie wzięła
     * (palec postawiony na narysowanym kształcie) albo gdy wybrane jest „Przesuń widok";
     * poza tym pion zostaje przewijaniu strony (patrz `touchAction` na kontenerze).
     *
     * Przeciąganie elementu albo uchwytu ma pierwszeństwo: Konva zakłada jego zalążek
     * już przy dotknięciu (`DD._dragElements`), a nasz nasłuch na kontenerze dostaje
     * pierwszy ruch, ZANIM Konva zdąży zacząć właściwe przeciąganie.
     */
    function prowadzJednym(e: TouchEvent, t: Touch) {
      const p = palecRef.current;
      if (!p || p.oddany) return;
      if (!p.kotwica) {
        if (DD._dragElements.size > 0) {
          p.oddany = true;
          return;
        }
        const kierunek = kierunekPalca(t.clientX - p.x, t.clientY - p.y);
        if (kierunek === "za-wcześnie") return;
        if (kierunek === "pionowo" && !p.naKsztalcie && kadrRef.current.toolMode !== "pan") {
          p.oddany = true;
          return;
        }
        // Chwytamy punkt spod MIEJSCA DOTKNIĘCIA, nie spod palca po przekroczeniu progu —
        // rzut dociąga wtedy te kilka pikseli i dalej jedzie dokładnie pod palcem.
        p.kotwica = punktPlanu({ x: p.x, y: p.y });
        gestKadruRef.current.trwa = true;
      }
      if (e.cancelable) e.preventDefault();
      setWidok(kadrPodPalcem(p.kotwica, naPlotnie({ x: t.clientX, y: t.clientY }), kadrRef.current.zoom));
    }

    /** Jeden palec to już nie szczypanie. Kolejne rozsunięcie zaczyna gest OD NOWA,
     *  od bieżącego powiększenia — inaczej po puszczeniu i ponownym złapaniu rzut
     *  skakałby do rozstawu sprzed przerwy. */
    function zakoncz(e: TouchEvent) {
      if (e.touches.length === 0) {
        palecRef.current = null;
        // Straż `poGescieKadru` trzyma jeszcze chwilę po zejściu palców: zdarzenie
        // dorobione przez przeglądarkę przychodzi PO `touchend`.
        const g = gestKadruRef.current;
        if (g.trwa) {
          g.trwa = false;
          g.koniec = Date.now();
        }
      }
      if (e.touches.length >= 2) return;
      szczypanieRef.current = null;
      // Przeciąganie wraca dopiero, gdy z ekranu zejdzie DRUGI palec. Palec, który
      // został, ma już swój zalążek przeciągnięcia skasowany, więc nie zacznie
      // przesuwać elementu w środku gestu — ruszy dopiero następne dotknięcie.
      setSzczypie(false);
    }

    el.addEventListener("touchstart", zacznij, { passive: false });
    el.addEventListener("touchmove", prowadz, { passive: false });
    el.addEventListener("touchend", zakoncz);
    el.addEventListener("touchcancel", zakoncz);
    return () => {
      el.removeEventListener("touchstart", zacznij);
      el.removeEventListener("touchmove", prowadz);
      el.removeEventListener("touchend", zakoncz);
      el.removeEventListener("touchcancel", zakoncz);
    };
  }, []);

  function zacznijPrzesuwanie(e: ReactPointerEvent<HTMLDivElement>) {
    // Środkowy przycisk działa ZAWSZE, lewy tylko w trybie „Przesuń widok" —
    // inaczej odebrałby rysowanie wszystkim pozostałym narzędziom.
    const rolka = e.button === 1;
    const lewyWTrybiePan = e.button === 0 && toolMode === "pan";
    if (!rolka && !lewyWTrybiePan) return;
    // Palec przesuwa rzut własną drogą (`prowadzJednym`), która zna też szczypanie —
    // tutaj każdy palec zaczynałby osobne przesuwanie i dwa gesty biłyby się o kadr.
    if (e.pointerType === "touch") return;
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
        /**
         * Pion jednego palca zostaje PRZEGLĄDARCE (przewijanie strony nad płótnem),
         * resztę — ruch w bok i dwa palce — bierzemy my (patrz `prowadzJednym`).
         *
         * `pan-y` znaczy dokładnie tyle: przewijaj w pionie, ale nie w bok i nie
         * powiększaj. Bez zakazu powiększania szczypanie powiększało CAŁĄ STRONĘ razem
         * z paskami, zamiast rzutu. `none` dałoby nam wszystko, ale odebrałoby telefonowi
         * przewijanie akurat nad tym, co zajmuje pół ekranu — dlatego tylko w „Przesuń
         * widok", gdzie palec na płótnie ma przesuwać rzut w każdą stronę.
         */
        touchAction: toolMode === "pan" ? "none" : "pan-y",
      }}
      onPointerDown={(e) => {
        typWskaznikaRef.current = e.pointerType;
        // Nowy gest — `tap` poprzedniego nie może już połknąć jego kliknięcia (`echoTapu`).
        tapWGescieRef.current = false;
        zacznijPrzesuwanie(e);
      }}
      onPointerMove={(e) => {
        typWskaznikaRef.current = e.pointerType;
        przesuwajSrodkowym(e);
      }}
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
        onMouseLeave={() => setKursorElementu(null)}
        onMouseUp={handleStageMouseUp}
        // Scena też musi słuchać dotknięcia: kształt, który wypuszcza zdarzenie dalej
        // (np. krawędź pomieszczenia w trybie rysowania), dobąbelkuje tu jako `tap`,
        // a nie jako klik — patrz `klikAlboDotyk`.
        {...klikAlboDotyk(handleStageClick)}
        {...dwuklikAlboDotyk(handleStageDblClick)}
        onContextMenu={handleStageContextMenu}
        // Przytrzymanie na SAMEJ scenie zatwierdza rysowaną ścianę — jedyna droga do
        // tego menu poza prawym przyciskiem i Enterem, czyli dwiema rzeczami, których
        // telefon nie ma. Węzły pod spodem gaszą bąbelkowanie same (patrz `cancelBubble`
        // w `useDlugiePrzytrzymanie`), więc menu elementu nie zamienia się w menu ściany.
        {...przytrzymanie.propsy((x, y) => {
          if (toolMode !== "sciany" || drawingWall.length < 2) return;
          onWallDrawContextMenu(x, y);
        })}
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
                <ElementGlyphKonva type={el.type} color="#64748B" gangs={el.gangs} agdLetter={el.agdLetter} wymiaryM={fixtureSizeM(el) ?? undefined} obrot={el.rotation ?? 0} />
              </Group>
            ))}
          </Layer>
        )}

        <Layer ref={layerRef}>
          {roomShapes.map((r) => {
            const pts = r.points.flatMap((p) => [p.x, p.y]);
            const { fontNazwy, odsadzenieNazwy, podpisy, goraPodpisu, kotwica: kotwicaOpisu } =
              opisyPomieszczen.get(r.id)!;
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
                {/* SCHEMAT SCHODÓW — tylko w pomieszczeniu typu „klatka schodowa".
                    `listening={false}`, bo to rysunek, a nie cel kliknięcia: zaznaczanie
                    i edycja kształtu siedzą na krawędzi poniżej, tak samo jak przy
                    wypełnieniu. Kilka kresek i strzałka kierunku wejścia — celowo NIE
                    odwzorowanie stopni, patrz `schodySchemat` w lib/design.ts. */}
                {r.type === "klatka" &&
                  (() => {
                    const s = schodySchemat(r.points);
                    if (!s) return null;
                    return (
                      <>
                        {s.stopnie.map(([a, b], i) => (
                          <Line
                            key={`${r.id}-stopien-${i}`}
                            listening={false}
                            points={[a.x, a.y, b.x, b.y]}
                            stroke={r.color}
                            strokeWidth={1}
                            opacity={0.75}
                          />
                        ))}
                        <Arrow
                          listening={false}
                          points={[s.strzalka.od.x, s.strzalka.od.y, s.strzalka.do.x, s.strzalka.do.y]}
                          stroke={r.color}
                          fill={r.color}
                          strokeWidth={1}
                          pointerLength={5}
                          pointerWidth={4}
                          opacity={0.75}
                        />
                      </>
                    );
                  })()}
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
                  {...klikAlboDotyk((e) => {
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
                  })}
                  onContextMenu={(e) => {
                    e.evt.preventDefault();
                    e.cancelBubble = true;
                    onRoomContextMenu(r.id, e.evt.clientX, e.evt.clientY);
                  }}
                  {...przytrzymanie.propsy((x, y) => onRoomContextMenu(r.id, x, y))}
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
                {podpisy.map(({ tekst, font, szer }, i) => (
                    <Text
                      key={i}
                      x={kotwicaOpisu.x - szer / 2}
                      // Blok rośnie W GÓRĘ, nie w dół: OSTATNI wiersz siada zawsze tam,
                      // gdzie siedziałby jedyny, a kolejne dokładają się nad nim.
                      //
                      // Rozpychanie w dół nie miało jak zadziałać w niskim pokoju: przy
                      // 3 m (60 jedn.) od środka do ściany jest 30 jedn., a dwa wiersze
                      // zaczynające się 15 jedn. pod środkiem kończyły się na murze —
                      // dokładnie na etykiecie wymiaru ściany, przecinając oba napisy.
                      y={kotwicaOpisu.y + goraPodpisu(i)}
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
                ))}

                <Text
                  x={kotwicaOpisu.x - szerokoscRamki(r.name, fontNazwy) / 2}
                  y={kotwicaOpisu.y - odsadzenieNazwy}
                  width={szerokoscRamki(r.name, fontNazwy)}
                  align="center"
                  text={r.name}
                  fontSize={fontNazwy}
                  fill={r.color}
                  listening={roomInteractive}
                  {...klikAlboDotyk((e) => {
                    e.cancelBubble = true;
                    onSelectRoom(r.id);
                  })}
                  {...dwuklikAlboDotyk((e) => {
                    e.cancelBubble = true;
                    const poz = pozycjaEkranu(e);
                    onRoomNameDblClick(r.id, poz.x, poz.y);
                  })}
                  onContextMenu={(e) => {
                    e.evt.preventDefault();
                    e.cancelBubble = true;
                    onRoomContextMenu(r.id, e.evt.clientX, e.evt.clientY);
                  }}
                  {...przytrzymanie.propsy((x, y) => onRoomContextMenu(r.id, x, y))}
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
                      radius={px(6)}
                      fill="#fff"
                      stroke={r.color}
                      strokeWidth={px(2)}
                      // Nieprzeciągalny na czas szczypania — patrz `szczypie`.
                      draggable={!szczypie}
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
                      {...przytrzymanie.propsy((x, y) => onRoomContextMenu(r.id, x, y))}
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
                  {...klikAlboDotyk((e) => {
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
                  })}
                  onContextMenu={(e) => {
                    e.evt.preventDefault();
                    e.cancelBubble = true;
                    onWallContextMenu(w.id, e.evt.clientX, e.evt.clientY);
                  }}
                  {...przytrzymanie.propsy((x, y) => onWallContextMenu(w.id, x, y))}
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
                      radius={px(6)}
                      fill="#fff"
                      stroke="#C1793F"
                      strokeWidth={px(2)}
                      // Nieprzeciągalny na czas szczypania — patrz `szczypie`.
                      draggable={!szczypie}
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
                      {...przytrzymanie.propsy((x, y) => onWallContextMenu(w.id, x, y))}
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
            const zawias = o.lustro ? edge2 : edge1;
            const glyphColor = isSel ? "#C1793F" : o.kind === "drzwi" ? "#16202B" : "#2D5A8C";
            return (
              <Group
                key={o.id}
                {...klikAlboDotyk((e) => {
                  e.cancelBubble = true;
                  onSelectOpening(o.id);
                })}
                onContextMenu={(e) => {
                  e.evt.preventDefault();
                  e.cancelBubble = true;
                  onOpeningContextMenu(o.id, e.evt.clientX, e.evt.clientY);
                }}
                {...przytrzymanie.propsy((x, y) => onOpeningContextMenu(o.id, x, y))}
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
                    {/* ZAWIAS na jednym z końców otworu, skrzydło otwiera się w stronę
                        `perp`. Lustro przenosi zawias na drugi koniec, NIE ruszając strony
                        otwierania — to jest różnica między drzwiami prawymi a lewymi.
                        Obrót (`flip`) zamienia obie rzeczy naraz, więc samym obrotem da się
                        ustawić tylko dwa z czterech wariantów.

                        Łuk zaczyna się w położeniu ZAMKNIĘTYM (wzdłuż ściany, od zawiasu
                        w stronę drugiego końca) i idzie 90° do położenia otwartego. Przy
                        lustrze zamknięte skrzydło leży po przeciwnej stronie zawiasu, więc
                        łuk trzeba zacząć o 90° dalej — inaczej rysowałby się na zewnątrz
                        otworu, po stronie, w którą drzwi nigdy nie sięgają. */}
                    <Line
                      points={[zawias.x, zawias.y, zawias.x + perp.x * o.width, zawias.y + perp.y * o.width]}
                      stroke={glyphColor}
                      strokeWidth={1.5}
                      listening={false}
                    />
                    <Arc
                      x={zawias.x}
                      y={zawias.y}
                      innerRadius={o.width}
                      outerRadius={o.width}
                      angle={90}
                      rotation={o.lustro ? angleDeg + 90 : angleDeg}
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
            // Miejsce podpisu liczy `podpisyStref`.
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
                  x={podpisyStref.get(z.id)!.x - 60 * so}
                  y={podpisyStref.get(z.id)!.y}
                  width={120 * so}
                  align="center"
                  text={podpisyStref.get(z.id)!.tekst}
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
                  {...klikAlboDotyk((e) => {
                    e.cancelBubble = true;
                    onSelectRoute(r.id);
                  })}
                  /**
                   * Dwuklik (albo podwójne dotknięcie) pokazuje INFORMACJE o przewodzie:
                   * długość wskazanego odcinka i całej trasy, obwód, zabezpieczenie, przewód.
                   *
                   * Wcześniej dwuklik dokładał trasie załamanie. Był to jednak gest, który
                   * zmieniał rysunek „przy okazji" — dwuklik niesie w sobie pojedyncze
                   * kliknięcie, więc pierwszy odruch „co to za kabel?" kończył się
                   * zniekształconą trasą. Dokładanie punktu przeszło do menu pod PPM
                   * (na dotyku — przytrzymanie palcem), gdzie jest nazwane wprost.
                   * Dwuklik na UCHWYCIE dalej kasuje punkt — tam wiadomo, w co się celuje.
                   */
                  {...dwuklikAlboDotyk((e) => {
                    e.cancelBubble = true;
                    const stage = e.target.getStage();
                    const p = stage && planPoint(stage);
                    if (!p) return;
                    onRouteInfo(r.id, nearestRouteSegmentIndex(p, r.points));
                  })}
                  onContextMenu={(e) => {
                    e.evt.preventDefault();
                    e.cancelBubble = true;
                    const stage = e.target.getStage();
                    if (!stage) return;
                    onRouteContextMenu(r.id, e.evt.clientX, e.evt.clientY, planZEkranu(stage, e.evt.clientX, e.evt.clientY));
                  }}
                  {...przytrzymanie.propsy((x, y) => {
                    const stage = routeLineNodesRef.current.get(r.id)?.getStage();
                    if (stage) onRouteContextMenu(r.id, x, y, planZEkranu(stage, x, y));
                  })}
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
                      radius={px(5)}
                      fill="#fff"
                      stroke="#C1793F"
                      strokeWidth={px(2)}
                      // Nieprzeciągalny na czas szczypania — patrz `szczypie`.
                      draggable={!szczypie}
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
                      {...dwuklikAlboDotyk((e) => {
                        e.cancelBubble = true;
                        const mid = r.points.slice(1, -1).filter((_, mi) => mi !== i);
                        if (mid.length === 0) onResetRoute(r.id);
                        else onSetRoutePoints(r.id, mid);
                      })}
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
                    radius={px(zamknie ? 8 : 4)}
                    fill={zamknie ? "#fff" : "#2D5A8C"}
                    stroke="#2D5A8C"
                    strokeWidth={px(zamknie ? 3 : 1.5)}
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
                      <Circle
                        x={wallCursor.x}
                        y={wallCursor.y}
                        radius={px(4)}
                        fill="#fff"
                        stroke="#2D5A8C"
                        strokeWidth={px(1.5)}
                        listening={false}
                      />
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
              {ortho && wallCursor && (drawingWall.length === 2 || drawingWall.length === 3) && (
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
                            radius={px(przyciagniety ? 5 : 3.5)}
                            fill={przyciagniety ? "#2D5A8C" : "#fff"}
                            stroke="#2D5A8C"
                            strokeWidth={px(1.2)}
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
                    radius={px(willClose ? 8 : 4)}
                    fill={willClose ? "#fff" : "#C1793F"}
                    stroke="#C1793F"
                    strokeWidth={px(willClose ? 3 : 1.5)}
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
          {/* ZNACZNIK WYRÓWNANIA: krótka kreska przy samym punkcie, pokazująca oś,
              która go ustawiła — pionowa, gdy punkt stanął w pionie z czymś, pozioma
              przy wyrównaniu w poziomie. Obie naraz, gdy trafiło w jedno i drugie.

              Krótka i przy punkcie, a nie przez cały rysunek: linie przez całe okno
              były pierwszą wersją tej pomocy i okazały się mylące — pokazywały poziom
              narożnika pod kursorem, zamiast mówić cokolwiek o stawianym punkcie.

              Bledsza od znacznika zaczepu, bo niesie słabszą wiadomość: zaczep mówi
              „punkt siada DOKŁADNIE tu", wyrównanie tylko „stoi w jednej linii". */}
          {osieKursora && (osieKursora.x || osieKursora.y) && (toolMode === "sciany" || drawingRoom) && (
            <>
              {osieKursora.x && (
                <Line
                  name="tylko-ekran znacznik-osi"
                  points={[
                    osieKursora.punkt.x,
                    osieKursora.punkt.y - px(OS_ZNACZNIK_PX) / 2,
                    osieKursora.punkt.x,
                    osieKursora.punkt.y + px(OS_ZNACZNIK_PX) / 2,
                  ]}
                  stroke="#2C6B4A"
                  strokeWidth={px(1)}
                  opacity={0.6}
                  listening={false}
                />
              )}
              {osieKursora.y && (
                <Line
                  name="tylko-ekran znacznik-osi"
                  points={[
                    osieKursora.punkt.x - px(OS_ZNACZNIK_PX) / 2,
                    osieKursora.punkt.y,
                    osieKursora.punkt.x + px(OS_ZNACZNIK_PX) / 2,
                    osieKursora.punkt.y,
                  ]}
                  stroke="#2C6B4A"
                  strokeWidth={px(1)}
                  opacity={0.6}
                  listening={false}
                />
              )}
            </>
          )}

          {zaczep && (toolMode === "sciany" || drawingRoom) && (
            <>
              {/* Dzielenie przez powiększenie: scena skaluje wszystko, co na niej stoi,
                  więc żeby wyszło stałe `ZACZEP_PX` na ekranie, trzeba podać tyle
                  jednostek planu, ile się na te piksele przelicza. */}
              {zaczep.rodzaj === "naroznik" ? (
                <Rect
                  x={zaczep.point.x - px(ZACZEP_PX) / 2}
                  y={zaczep.point.y - px(ZACZEP_PX) / 2}
                  width={px(ZACZEP_PX)}
                  height={px(ZACZEP_PX)}
                  stroke="#2C6B4A"
                  strokeWidth={px(ZACZEP_KRESKA_PX)}
                  listening={false}
                />
              ) : (
                <Circle
                  x={zaczep.point.x}
                  y={zaczep.point.y}
                  radius={px(ZACZEP_PX) / 2}
                  stroke="#2C6B4A"
                  strokeWidth={px(ZACZEP_KRESKA_PX)}
                  listening={false}
                />
              )}
            </>
          )}

          {calibPoints.length === 2 && (
            <Line points={calibPoints.flatMap((p) => [p.x, p.y])} stroke="#3B8C63" strokeWidth={2} />
          )}
          {calibPoints.map((p, i) => (
            <Circle key={i} x={p.x} y={p.y} radius={px(5)} fill="#3B8C63" listening={false} />
          ))}

          {/* Ręczne przewody (F11) — POD osprzętem, od środka do środka symbolu: koniec
              chowa się pod symbolem, więc nie trzeba liczyć, gdzie kończy się jego obrys.
              Opis kabla w połowie, w skali rysunku jak notatki, żeby był czytelny na PDF. */}
          {przewody.map((w) => {
            const a = elements.find((e) => e.id === w.od);
            const b = elements.find((e) => e.id === w.do);
            if (!a || !b) return null;
            const styl = RODZAJE_PRZEWODU[w.rodzaj];
            const zazn = selected?.kind === "wire" && selected.id === w.id;
            const { font } = wymiaryNotatki("x", metersPerUnit);
            const f = font * 0.8;
            const kat = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
            // Napis zawsze czytany od lewej — przy przewodzie „wstecz" obrót o 180°.
            const katNapisu = kat > 90 || kat < -90 ? kat + 180 : kat;
            const sx = (a.x + b.x) / 2;
            const sy = (a.y + b.y) / 2;
            const dl = Math.hypot(b.x - a.x, b.y - a.y);
            return (
              <Group
                key={w.id}
                data-testid="przewod-reczny"
                listening={toolMode === "zaznacz"}
                {...klikAlboDotyk((e) => {
                  e.cancelBubble = true;
                  onSelectWire?.(w.id);
                })}
              >
                <Line
                  points={[a.x, a.y, b.x, b.y]}
                  stroke={zazn ? "#C1793F" : styl.kolor}
                  strokeWidth={px(zazn ? 3 : 2)}
                  dash={styl.kreska.map((d) => px(d))}
                  hitStrokeWidth={px(12)}
                  lineCap="round"
                />
                {w.kabel && dl > f * 4 && (
                  <Text
                    x={sx}
                    y={sy}
                    rotation={katNapisu}
                    text={w.kabel}
                    fontSize={f}
                    fill={styl.kolor}
                    width={dl * 0.8}
                    offsetX={dl * 0.4}
                    offsetY={f * 1.3}
                    align="center"
                    listening={false}
                  />
                )}
              </Group>
            );
          })}

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
                // `!szczypie`: na czas gestu dwoma palcami element przestaje być
                // przeciągalny, inaczej Konva przesuwałaby go tym samym palcem, którym
                // się przybliża rzut — patrz `szczypie`.
                draggable={(toolMode === "zaznacz" || toolMode === "elementy") && !szczypie}
                onMouseDown={(e) => {
                  e.cancelBubble = true;
                }}
                {...klikAlboDotyk((e) => {
                  /**
                   * Klik w JUŻ STOJĄCY element zaznacza go — także w trybie wstawiania.
                   *
                   * Przez chwilę (6f650fd) klik w symbol w tym trybie stawiał kolejny
                   * element, a rozsuwanie odsuwało go obok. Na telefonie wychodziło to
                   * źle: palec, którym chciało się wskazać gniazdko, dokładał drugie,
                   * a do zaznaczenia trzeba było przełączać narzędzie. Gniazdo obok
                   * stojącego stawia się dotknięciem tuż za jego symbolem — rozsuwanie
                   * dalej układa je w rząd.
                   *
                   * `cancelBubble` gasi drogę do sceny, czyli do `handleStageClick`,
                   * który postawiłby nowy element pod zaznaczonym.
                   */
                  e.cancelBubble = true;
                  // W narzędziu „Przewód" klik w element to koniec przewodu, nie zaznaczenie.
                  if (toolMode === "przewod") {
                    onWireElement?.(el.id);
                    return;
                  }
                  // Shift istnieje tylko przy myszy; na dotyku dokładanie do zaznaczenia
                  // idzie przełącznikiem „Zaznacz kilka" (patrz DesignTab.tsx).
                  onSelectElement(el.id, "shiftKey" in e.evt ? e.evt.shiftKey : false);
                })}
                {...dwuklikAlboDotyk((e) => {
                  e.cancelBubble = true;
                  onEditElement(el.id);
                })}
                onContextMenu={(e) => {
                  e.evt.preventDefault();
                  e.cancelBubble = true;
                  onElementContextMenu(el.id, e.evt.clientX, e.evt.clientY);
                }}
                {...przytrzymanie.propsy((x, y) => onElementContextMenu(el.id, x, y))}
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
                  obrot={el.rotation ?? 0}
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

          {/* Notatki dla montera (F6) — NAD osprzętem, żeby symbol nie przykrył tekstu; w białej ramce, rozmiar w jednostkach PLANU,
              jak opisy pomieszczeń: na wydruku (rasteryzowanym z tej sceny) mają być
              czytelne w skali rysunku, a nie w pikselach ekranu. Przeciągalne tylko
              w „Zaznacz", żeby w narzędziach rysujących klik w notatkę nie ruszał jej
              zamiast stawiać punkt. */}
          {/* Pierwszy koniec zaczętego przewodu (F11) — pierścień, żeby było widać, od czego
              przewód pójdzie, zanim kliknie się drugi element. */}
          {toolMode === "przewod" &&
            przewodStart &&
            (() => {
              const s = elements.find((e) => e.id === przewodStart);
              if (!s) return null;
              const { w, h } = glyphBoxSize(s.type);
              const r = (Math.max(w, h) / 2) * skalaSymbolu(s.type) + px(6);
              return <Circle x={s.x} y={s.y} radius={r} stroke="#C1793F" strokeWidth={px(2)} dash={[px(4), px(3)]} listening={false} data-testid="przewod-start" />;
            })()}

          {notatki.map((n) => {
            const { font, szer, wys } = wymiaryNotatki(n.tekst, metersPerUnit);
            const zazn = selected?.kind === "note" && selected.id === n.id;
            return (
              <Group
                key={n.id}
                x={n.x}
                y={n.y}
                data-testid="notatka"
                draggable={toolMode === "zaznacz" && !szczypie}
                listening={toolMode === "zaznacz" || toolMode === "notatka"}
                onDragEnd={(e) => onMoveNote?.(n.id, { x: e.target.x(), y: e.target.y() })}
                {...klikAlboDotyk((e) => {
                  e.cancelBubble = true;
                  onSelectNote?.(n.id);
                })}
                {...dwuklikAlboDotyk((e) => {
                  e.cancelBubble = true;
                  onEditNote?.(n.id);
                })}
              >
                <Rect
                  width={szer}
                  height={wys}
                  fill="#FFFDF5"
                  stroke={zazn ? "#C1793F" : "#8A5526"}
                  strokeWidth={zazn ? px(2) : px(1)}
                  dash={zazn ? undefined : [px(4), px(3)]}
                  cornerRadius={font * 0.25}
                  opacity={0.95}
                />
                <Text
                  x={font * 0.6}
                  y={font * 0.3}
                  text={n.tekst}
                  fontSize={font}
                  lineHeight={1.25}
                  fill="#5B3A1A"
                  listening={false}
                />
              </Group>
            );
          })}

          {ramka.prostokat && (
            <Rect
              x={ramka.prostokat.x}
              y={ramka.prostokat.y}
              width={ramka.prostokat.w}
              height={ramka.prostokat.h}
              fill="#2D5A8C14"
              stroke="#2D5A8C"
              strokeWidth={1}
              dash={[4, 3]}
              listening={false}
            />
          )}
        </Layer>
        {/* Duch elementu — OSOBNA warstwa, nie główna: ta idzie do eksportu PDF i na
            pewno nie ma w nim być półprzezroczystego symbolu, który akurat wisiał pod
            kursorem. `listening={false}`, więc nie przechwytuje żadnego kliknięcia. */}
        {toolMode === "elementy" && duchElementu && kursorElementu && !przesuwa && (() => {
          const poz = duchElementu.podglad(kursorElementu);
          const def = ELEMENT_TYPES[duchElementu.type];
          return (
            <Layer listening={false}>
              <Group
                id="duch-elementu"
                x={poz.x}
                y={poz.y}
                rotation={poz.rotation}
                scaleX={skalaSymbolu(duchElementu.type)}
                scaleY={skalaSymbolu(duchElementu.type)}
                opacity={0.55}
              >
                <ElementGlyphKonva type={duchElementu.type} color={def.color} gangs={duchElementu.gangs} agdLetter={duchElementu.agdLetter} obrot={poz.rotation} />
              </Group>
            </Layer>
          );
        })()}
      </Stage>
    </div>
  );
}
