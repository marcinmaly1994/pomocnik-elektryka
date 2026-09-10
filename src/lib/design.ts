/**
 * Czyste funkcje pomocnicze dla edytora planu (DesignTab w wersji JS).
 * Wydzielone spod store'a, żeby dobór koloru/nazwy nowego pomieszczenia
 * dało się przetestować bez montowania canvasu.
 */

import type { InstallationElement, OpeningKind, Point, RoomShape, RoomType } from "@/types";
import { NO_ROOM } from "@/lib/elements";
import { nearestPointOnPolyline, pointInPolygon } from "@/lib/geometry";

/** Domyślny logiczny rozmiar planu i skok siatki — jak VB_DEFAULT/GRID w wersji JS.
 *  Domyślny, bo obszar planu jest teraz zapisywany w projekcie (`planSize` w store)
 *  i dopasowuje się do proporcji wgranego rzutu. */
export const DEFAULT_PLAN_WIDTH = 1000;
export const DEFAULT_PLAN_HEIGHT = 700;
export const GRID = 20;

/**
 * Poniżej tej szerokości okna edytor układa się „telefonicznie": panel boczny
 * startuje zwinięty, a ustawienia planu chowają się pod jeden przycisk.
 *
 * 768 px to próg `md` z Tailwinda i tak MUSI zostać — klasy `md:` w
 * `EditorToolbar` decydują o tej samej rzeczy co ta stała, tylko po stronie CSS.
 * Rozjazd tych dwóch liczb dałby stan, w którym ustawienia są schowane, a
 * przycisk do ich pokazania — nie.
 *
 * Powód progu: przy 375 px sama chrome nad płótnem zajmowała 822 px, czyli więcej
 * niż cały ekran telefonu. Rzut — jedyna rzecz, po którą się tu przychodzi —
 * zaczynał się dopiero po przewinięciu.
 */
export const PROG_WASKIEGO_EKRANU = 768;

/** Domyślna grubość ściany w jednostkach planu — dawna sztywna wartość `strokeWidth`
 *  sprzed dodania regulowanej grubości. Zapisy bez pola `thickness` (patrz `Wall`
 *  w types/index.ts) muszą wyglądać identycznie jak przed tą zmianą. */
export const DEFAULT_WALL_THICKNESS = 5;

/**
 * Standardowa skala do samodzielnego rysowania domu BEZ podkładu (metrów na
 * jednostkę planu). 1 jednostka = 5 cm, więc jedno oczko siatki (`GRID` = 20
 * jedn.) wychodzi równo na 1 metr — łatwo mierzyć wzrokiem bez kalkulatora.
 *
 * Przy `DEFAULT_PLAN_SIZE` (1000×700 jedn.) daje to obszar roboczy 50×35 m —
 * dom 20×20 m mieści się w nim z dużym zapasem w obu wymiarach, nawet w
 * gorszej orientacji (20 m wzdłuż krótszego boku).
 */
export const MANUAL_DRAW_SCALE_MPU = 0.05;

/** Domyślna szerokość drzwi w REALNYCH centymetrach (typowy wymiar stolarki) —
 *  przeliczana na jednostki planu przy stawianiu, patrz `defaultOpeningWidth`. */
export const DEFAULT_DOOR_WIDTH_CM = 90;
/** Domyślna szerokość okna [cm] — typowe okno jednoskrzydłowe. Osobno od drzwi, bo
 *  okna są zwykle szersze, a szerokość i tak da się poprawić po postawieniu. */
export const DEFAULT_WINDOW_WIDTH_CM = 120;
/** Fallback w jednostkach planu, gdy nie ma ŻADNEJ skali (ani wgranego rzutu, ani
 *  `MANUAL_DRAW_SCALE_MPU`) — rzadki przypadek, bo tryb „Otwory" wymaga najpierw
 *  narysowanej ściany, a ściana zwykle idzie w parze z jakąś skalą. */
export const DEFAULT_OPENING_WIDTH_UNITS = 18;

/** Szerokość NOWEGO otworu (jedn. planu), z uwzględnieniem bieżącej skali —
 *  centymetry, gdy skala jest znana, inaczej stały fallback. */
export function defaultOpeningWidth(metersPerUnit: number | null, kind: OpeningKind = "drzwi"): number {
  if (metersPerUnit === null || !(metersPerUnit > 0)) return DEFAULT_OPENING_WIDTH_UNITS;
  const cm = kind === "okno" ? DEFAULT_WINDOW_WIDTH_CM : DEFAULT_DOOR_WIDTH_CM;
  return cm / 100 / metersPerUnit;
}

export interface PlanSize {
  w: number;
  h: number;
}

export const DEFAULT_PLAN_SIZE: PlanSize = { w: DEFAULT_PLAN_WIDTH, h: DEFAULT_PLAN_HEIGHT };

/**
 * Obszar planu dopasowany do proporcji wgranego rzutu, przy zachowaniu zbliżonego pola
 * powierzchni.
 *
 * Dotąd podkład był rozciągany do sztywnych 1000×700 niezależnie od swoich proporcji, co
 * przy zdjęciu 4:3 czy 16:9 ściskało go w jednej osi. To nie jest sama brzydota: kalibracja
 * skali mierzy odcinek na obrazie, więc przy zniekształceniu przelicznik metrów wychodzi
 * inny w poziomie niż w pionie, a od niego zależą strefy ochronne i długości tras.
 *
 * Pole powierzchni trzymamy blisko domyślnego, żeby zmiana proporcji nie zmieniała
 * drastycznie gęstości siatki ani rozmiaru symboli względem planu. Wynik zaokrąglamy do
 * wielokrotności `GRID`, żeby siatka kończyła się równo na krawędzi.
 */
export function planSizeForImage(imgW: number, imgH: number): PlanSize {
  if (!(imgW > 0) || !(imgH > 0)) return DEFAULT_PLAN_SIZE;
  const area = DEFAULT_PLAN_WIDTH * DEFAULT_PLAN_HEIGHT;
  const ratio = imgW / imgH;
  const roundToGrid = (v: number) => Math.max(GRID * 5, Math.round(v / GRID) * GRID);
  return {
    w: roundToGrid(Math.sqrt(area * ratio)),
    h: roundToGrid(Math.sqrt(area / ratio)),
  };
}

export const ROOM_COLORS = [
  "#2D5A8C",
  "#C1793F",
  "#3B8C63",
  "#7C5CBF",
  "#0F8A9E",
  "#C6433A",
  "#B98C2F",
  "#5B6B7E",
] as const;

/** Kolejny kolor cyklicznie z palety, wg liczby pomieszczeń już postawionych na kondygnacji. */
export function roomColorForIndex(index: number): string {
  return ROOM_COLORS[index % ROOM_COLORS.length];
}

/** Domyślna nazwa nowego pomieszczenia, np. "Pomieszczenie 3". */
export function nextRoomName(countOnFloor: number): string {
  return `Pomieszczenie ${countOnFloor + 1}`;
}

/** Następny kolor w cyklu — używane przy "przełącz kolor pomieszczenia" (recolorRoomShape). */
export function nextRoomColor(currentColor: string): string {
  const idx = ROOM_COLORS.indexOf(currentColor as (typeof ROOM_COLORS)[number]);
  return ROOM_COLORS[(idx + 1) % ROOM_COLORS.length];
}

/** Kolor dla elementu/rzeczy BEZ rozpoznanego pomieszczenia (patrz `NO_ROOM` w
 *  lib/elements.ts) albo z nazwą, dla której nie ma już narysowanego obrysu —
 *  szary, celowo POZA `ROOM_COLORS`, żeby nie dało się go pomylić z żadnym
 *  realnym kolorem pomieszczenia. */
export const NO_ROOM_COLOR = "#94A3B8";

/**
 * Kolor pomieszczenia o danej NAZWIE — tak elementy trzymają przypisanie do
 * pokoju (`InstallationElement.room` to nazwa, nie id), więc żeby pokolorować
 * coś „po pomieszczeniu" (np. trasę przewodu), trzeba dopasować po nazwie do
 * narysowanego obrysu. `NO_ROOM_COLOR`, gdy nazwa nie pasuje do żadnego —
 * „Bez pomieszczenia" albo pokój wpisany ręcznie, zanim ktoś go obrysował.
 */
export function colorForRoomName(roomName: string, roomShapes: RoomShape[]): string {
  return roomShapes.find((r) => r.name === roomName)?.color ?? NO_ROOM_COLOR;
}

/** Elementy montowane W ścianie (gniazdka, łączniki — czyli większość instalacji)
 *  klika się na linii ściany, a obrys pomieszczenia to OSOBNY kształt, rysowany
 *  ręcznie — rzadko pokrywa się z nią co do piksela. Bez tolerancji taki element
 *  ląduje tuż OBOK wielokąta pomieszczenia i dostaje „Bez pomieszczenia" mimo że
 *  wizualnie stoi dokładnie na jego ścianie — a to po cichu psuje grupowanie
 *  łącznik→lampa (działa tylko w obrębie tego samego pomieszczenia, patrz
 *  lib/lightGroups.ts) i grupowanie obwodów w rozdzielnicy. Promień w metrach,
 *  nie w jednostkach planu — inaczej ten sam próg wypadałby raz za ciasno, raz
 *  za luźno w zależności od skali (zdjęcie rzutu vs rysowanie ręczne). */
export const ROOM_SNAP_TOLERANCE_M = 0.4;

/**
 * W którym narysowanym pomieszczeniu leży punkt planu — wnętrze obrysu, a gdy
 * poza nim, to najbliższa krawędź w promieniu `ROOM_SNAP_TOLERANCE_M`.
 * `NO_ROOM`, gdy nic nie pasuje.
 *
 * `roomShapes` MUSZĄ być już przefiltrowane do jednej kondygnacji — nazwy
 * pomieszczeń powtarzają się między piętrami („Łazienka" na parterze i na
 * piętrze to dwa różne pokoje), więc szukanie po całym projekcie przypisywałoby
 * elementy do obrysów z innego poziomu.
 */
export function detectRoomName(p: Point, roomShapes: RoomShape[], metersPerUnit: number | null): string {
  for (const r of roomShapes) {
    if (pointInPolygon(p, r.points)) return r.name;
  }
  const toleranceUnits = metersPerUnit ? ROOM_SNAP_TOLERANCE_M / metersPerUnit : GRID;
  let bestName: string | null = null;
  let bestDist = toleranceUnits;
  for (const r of roomShapes) {
    const nearest = nearestPointOnPolyline(p, [...r.points, r.points[0]]);
    if (!nearest) continue;
    const dist = Math.hypot(p.x - nearest.point.x, p.y - nearest.point.y);
    if (dist < bestDist) {
      bestDist = dist;
      bestName = r.name;
    }
  }
  return bestName ?? NO_ROOM;
}

/**
 * Nazwa pomieszczenia dla elementu, który WŁAŚNIE zmienił położenie na planie.
 *
 * Przypisanie musi iść za elementem, bo `room` to nie etykieta opisowa, tylko
 * dana wejściowa: decyduje o grupowaniu obwodów (`computeCircuits`), o strefie
 * mokrej w doborze przekroju (`isWetRoomName`) i o grupach oświetlenia. Gniazdko
 * przeciągnięte z salonu do łazienki, które nadal twierdzi, że jest w salonie,
 * po cichu psuje wszystkie trzy.
 *
 * Jedyny wyjątek to nazwa WPISANA RĘCZNIE (patrz pole „Pomieszczenie" w
 * `EditElementModal`), której nie odpowiada żaden obrys na planie: skoro nic na
 * rysunku jej nie zaprzecza, przesunięcie elementu o kilka pikseli nie ma prawa
 * jej skasować. Przypisanie zdejmujemy dopiero wtedy, gdy element faktycznie
 * wyszedł z narysowanego obrysu.
 */
export function roomNameAfterMove(
  p: Point,
  currentRoom: string,
  roomShapes: RoomShape[],
  metersPerUnit: number | null
): string {
  const detected = detectRoomName(p, roomShapes, metersPerUnit);
  if (detected !== NO_ROOM) return detected;
  return roomShapes.some((r) => r.name === currentRoom) ? NO_ROOM : currentRoom;
}

/**
 * Przelicza przypisanie elementów po zmianie GEOMETRII pomieszczeń (dorysowanie,
 * przesunięcie narożnika, usunięcie obrysu) — odwrotna strona `roomNameAfterMove`,
 * gdzie ruszył się nie element, tylko pomieszczenie pod nim.
 *
 * Zasięg zawężony do `touchedRoomNames` + „Bez pomieszczenia" i to on chroni
 * ręcznie wpisane nazwy: przeliczamy wyłącznie elementy, które należały do
 * ruszonego obrysu (mogły z niego wypaść) albo do niczego (mogły zostać przez
 * niego objęte). Element opisany ręcznie jako „Garderoba" nie jest niczyj i nie
 * ma go po co ruszać przy edycji sąsiedniego pokoju.
 *
 * `roomShapes` i `elements` to pełne, wielopiętrowe listy z draftu — filtrowanie
 * po `floorId` siedzi tutaj, żeby wołający (store) nie musiał tego powtarzać.
 * Zwraca tę samą tablicę, gdy nic się nie zmieniło.
 */
export function reassignRoomsOnFloor(
  elements: InstallationElement[],
  roomShapes: RoomShape[],
  floorId: string,
  metersPerUnit: number | null,
  touchedRoomNames: string[]
): InstallationElement[] {
  const scope = new Set([NO_ROOM, ...touchedRoomNames]);
  const shapesHere = roomShapes.filter((r) => r.floor === floorId);
  let changed = false;
  const next = elements.map((e) => {
    if (e.floor !== floorId || !scope.has(e.room)) return e;
    const room = detectRoomName(e, shapesHere, metersPerUnit);
    if (room === e.room) return e;
    changed = true;
    return { ...e, room };
  });
  return changed ? next : elements;
}

export interface RoomReconciliation {
  elements: InstallationElement[];
  /** Ile elementów miało w zapisie inne pomieszczenie, niż wynika z ich położenia. */
  poprawione: number;
}

/**
 * Jednorazowy remont przypisań przy wczytaniu projektu — dla zapisów zrobionych,
 * zanim `room` zaczęło jechać za elementem (`roomNameAfterMove`).
 *
 * Przez długi czas przypisanie liczyło się WYŁĄCZNIE w chwili postawienia elementu,
 * więc każde późniejsze przeciągnięcie zostawiało w projekcie gniazdko twierdzące, że
 * jest w pokoju, z którego dawno wyszło. Sama poprawka na przyszłość tego nie leczy:
 * błędne dane siedzą w zapisanych projektach i dalej psują obwody w rozdzielnicy,
 * strefę mokrą w doborze przekroju i kosztorys. Stąd przeliczenie na wejściu.
 *
 * Reguła jest ta sama co przy przeciąganiu, razem z ochroną nazw wpisanych ręcznie:
 * pokój bez obrysu na planie („Garderoba") zostaje nietknięty, bo nic na rysunku mu
 * nie przeczy. Przepisujemy tylko tam, gdzie geometria mówi coś innego niż zapis.
 *
 * Zwraca liczbę poprawek, żeby dało się o nich POWIEDZIEĆ — cicha zmiana cudzych
 * danych przy otwarciu pliku jest gorsza niż sam błąd, który naprawia.
 */
export function reconcileRoomsOnLoad(
  elements: InstallationElement[],
  roomShapes: RoomShape[],
  scales: Record<string, number>
): RoomReconciliation {
  const shapesByFloor = new Map<string, RoomShape[]>();
  for (const r of roomShapes) {
    const list = shapesByFloor.get(r.floor);
    if (list) list.push(r);
    else shapesByFloor.set(r.floor, [r]);
  }
  let poprawione = 0;
  const next = elements.map((e) => {
    const room = roomNameAfterMove(e, e.room, shapesByFloor.get(e.floor) ?? [], scaleOf(scales, e.floor));
    if (room === e.room) return e;
    poprawione++;
    return { ...e, room };
  });
  return { elements: poprawione > 0 ? next : elements, poprawione };
}

export const ROOM_TYPE_LABELS: Record<RoomType, string> = {
  salon: "Salon",
  sypialnia: "Sypialnia",
  pokoj: "Pokój",
  kuchnia: "Kuchnia",
  lazienka: "Łazienka / WC",
  pralnia: "Pralnia",
  kotlownia: "Kotłownia",
  garaz: "Garaż",
  inne: "Inne",
};

const WET_ROOM_TYPES: readonly RoomType[] = ["kuchnia", "lazienka", "pralnia", "kotlownia"];

/** Podpowiedź typu pomieszczenia na podstawie nazwy — startowa wartość w oknie
 *  „Nazwij pomieszczenie", żeby nie zaczynać zawsze od „Inne". Użytkownik może ją
 *  swobodnie nadpisać wyborem z listy; to tylko domysł, nie źródło prawdy. */
export function guessRoomType(name: string): RoomType {
  if (/łazienk/i.test(name)) return "lazienka";
  if (/kuchni/i.test(name)) return "kuchnia";
  if (/pralni/i.test(name)) return "pralnia";
  if (/kotłowni/i.test(name)) return "kotlownia";
  if (/salon/i.test(name)) return "salon";
  if (/sypialni/i.test(name)) return "sypialnia";
  if (/gara/i.test(name)) return "garaz";
  if (/pok(ó|o)j/i.test(name)) return "pokoj";
  return "inne";
}

/**
 * Czy pomieszczenie o danej nazwie jest „mokre" (kuchnia/łazienka/pralnia/kotłownia) —
 * od tego zależy grupowanie obwodów gniazd (`computeCircuits`) i flaga strefy mokrej
 * w doborze przekroju (`sizeProjectCircuits`).
 *
 * Najpierw sprawdza jawny `RoomShape.type` narysowanego pomieszczenia o tej nazwie —
 * ustawiony w oknie „Nazwij pomieszczenie" albo w panelu pomieszczeń, niezależny od
 * tego, jak dokładnie ktoś je nazwał (poprzednio ta funkcja i tak polegała tylko na
 * dopasowaniu tekstu, więc „łazienka" pisana małą literą albo „Łazienka rodziców"
 * czasem wypadała z grupowania). Gdy nazwa elementu nie pasuje do ŻADNEGO narysowanego
 * obrysu — pole „Pomieszczenie" na elemencie to wolny tekst, patrz `EditElementModal`
 * — albo obrys pochodzi ze starego zapisu bez pola `type`, wraca do zgadywania po
 * samej nazwie (`guessRoomType`), czyli do zachowania sprzed dodania tego pola.
 */
export function isWetRoomName(roomName: string, roomShapes: RoomShape[]): boolean {
  const shape = roomShapes.find((r) => r.name === roomName);
  if (shape?.type) return WET_ROOM_TYPES.includes(shape.type);
  return WET_ROOM_TYPES.includes(guessRoomType(roomName));
}

/** Skala kondygnacji (metrów na jednostkę planu) albo `null`, jeśli nie skalibrowana. */
export function scaleOf(scales: Record<string, number>, floorId: string): number | null {
  const v = scales[floorId];
  return typeof v === "number" && v > 0 ? v : null;
}

/**
 * Margines wokół narysowanej treści przy kadrowaniu rzutu do druku [jedn. planu].
 *
 * Musi zmieścić to, co wystaje POZA punkty geometrii: symbol elementu (największy,
 * wanna, ma ~36 jedn. szerokości, czyli 18 od środka), strefę ochronną wokół niej,
 * etykiety wymiarów i numery grup sterowania. Stąd wartość z zapasem — obcięty
 * o pół symbolu rysunek wygląda na zepsuty, a kilka pustych jednostek nie kosztuje nic.
 */
export const MARGINES_KADROWANIA = 60;

/**
 * Zapas kadrowania, gdy obrys treści liczy się z ROGÓW symboli, a nie z ich środków
 * (patrz `rogiSymbolu` w glyphs.ts) [jedn. planu].
 *
 * Same symbole mieszczą się wtedy w kadrze z definicji, więc zostaje tylko to, co
 * rysuje się OBOK nich: etykiety wymiarów i numery grup sterowania. Stąd wartość
 * kilkakrotnie mniejsza od `MARGINES_KADROWANIA`, który musiał pokryć najgorszy
 * przypadek — wannę ze strefą — niezależnie od tego, co naprawdę stoi na planie.
 */
export const ZAPAS_ETYKIET = 14;

export interface Obszar {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Prostokąt obejmujący całą narysowaną treść kondygnacji [jedn. planu], z marginesem.
 * `null`, gdy nie ma czego kadrować.
 *
 * Po co: eksport do PDF brał dotąd CAŁY obszar planu (1000 × 700 jedn. = 50 × 35 m przy
 * rysowaniu od zera), więc mieszkanie 10 × 8 m zajmowało jedną piątą kartki, a resztę
 * wypełniała pusta siatka. Wydruk wychodził nieczytelny nie dlatego, że rysunek jest
 * zły, tylko dlatego, że pokazywaliśmy głównie tło.
 *
 * Wynik jest PRZYCINANY do obszaru planu: margines dodany przy krawędzi wyszedłby poza
 * scenę, a `toCanvas` zwróciłby wtedy pas przezroczystych pikseli.
 */
export function contentBounds(
  planSize: PlanSize,
  walls: { points: Point[] }[],
  roomShapes: { points: Point[] }[],
  elements: Point[],
  openings: Point[],
  /**
   * Margines w jednostkach planu. Podawany z zewnątrz, bo od czasu skalowania symboli
   * ze skalą rzutu (`autoSymbolScale`) sam symbol zajmuje różną liczbę jednostek:
   * przy rzucie skalibrowanym gęściej wanna wystaje poza swój punkt o kilkaset
   * jednostek, a stała wartość obcięłaby ją w połowie. Domyślnie wartość bazowa,
   * żeby wywołania bez skali zachowywały się jak dotąd.
   */
  margines: number = MARGINES_KADROWANIA
): Obszar | null {
  const punkty: Point[] = [
    ...walls.flatMap((w) => w.points),
    ...roomShapes.flatMap((r) => r.points),
    ...elements,
    ...openings,
  ];
  if (punkty.length === 0) return null;

  const minX = Math.max(0, Math.min(...punkty.map((p) => p.x)) - margines);
  const minY = Math.max(0, Math.min(...punkty.map((p) => p.y)) - margines);
  const maxX = Math.min(planSize.w, Math.max(...punkty.map((p) => p.x)) + margines);
  const maxY = Math.min(planSize.h, Math.max(...punkty.map((p) => p.y)) + margines);
  return { x: minX, y: minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) };
}

/**
 * Grubość ścianki, którą rysujemy obrys pomieszczenia [m].
 *
 * Obrys pomieszczenia JEST ścianą — nie linią pomocniczą — więc ma wyglądać jak ściana,
 * a nie jak włos. Wcześniej szedł stałym `strokeWidth` w jednostkach planu, przez co na
 * rzucie skalibrowanym inaczej niż rysunek odręczny (np. wgranym PDF-em) wychodził raz
 * grubszy, raz cieńszy niż jakakolwiek prawdziwa ściana.
 *
 * 8 cm to ścianka działowa — najcieńsza ściana, jaka w domu występuje. Świadomie
 * najcieńsza z możliwych: obrys ma pokazywać, ŻE tam jest ściana, a nie zajmować
 * miejsca za konkretną, jeszcze nieznaną konstrukcję.
 */
export const GRUBOSC_OBRYSU_POKOJU_M = 0.08;

/**
 * Ta sama grubość przeliczona na jednostki planu. Bez kalibracji bierzemy skalę
 * rysunku odręcznego — to ona obowiązuje, dopóki użytkownik nie zmierzy nic własnego.
 */
export function gruboscObrysuPokoju(metersPerUnit: number | null): number {
  const mpu = metersPerUnit !== null && metersPerUnit > 0 ? metersPerUnit : MANUAL_DRAW_SCALE_MPU;
  return GRUBOSC_OBRYSU_POKOJU_M / mpu;
}
