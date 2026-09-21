/**
 * Czyste funkcje pomocnicze dla edytora planu (DesignTab w wersji JS).
 * Wydzielone spod store'a, żeby dobór koloru/nazwy nowego pomieszczenia
 * dało się przetestować bez montowania canvasu.
 */

import type { InstallationElement, OpeningKind, Point, RoomShape, RoomType } from "@/types";
import { NO_ROOM } from "@/lib/elements";
import { nearestPointOnPolyline, pointInPolygon, polygonArea } from "@/lib/geometry";

/** Domyślny logiczny rozmiar planu i skok siatki — jak VB_DEFAULT/GRID w wersji JS.
 *  Domyślny, bo obszar planu jest teraz zapisywany w projekcie (`planSize` w store)
 *  i dopasowuje się do proporcji wgranego rzutu. */
export const DEFAULT_PLAN_WIDTH = 1000;
export const DEFAULT_PLAN_HEIGHT = 700;
export const GRID = 20;

/**
 * Odstęp pływających pigułek nawigacji („Cofnij"/„Dalej" w App.tsx) od dolnej
 * krawędzi okna.
 *
 * Na zakładce Instalacja pigułki „Dalej" NIE MA: tam przycisk kolejnego kroku siedzi
 * w pasku stanu pod rysunkiem (patrz `EditorStatusBar`). Powód: pływająca pigułka
 * leżała NA płótnie — przy oknie 1440×900 zajmowała prostokąt 109×36 px w prawym
 * dolnym rogu obszaru rysowania i zjadała tam kliknięcia. Rezerwowanie jej pasma
 * pod płótnem nie było odpowiedzią: wysokość rysunku liczy się z chrome'u STAŁEGO,
 * z pominięciem banerów, a baner „ten projekt istnieje tylko w tej przeglądarce"
 * (stały u każdego niezalogowanego, kto ma cokolwiek do stracenia) spychał rysunek
 * o swoją wysokość w dół i pigułka wracała na płótno. Płótno jest powierzchnią
 * roboczą — nawigacja nie ma prawa na niej stać w ŻADNYM stanie, więc zeszła z niej
 * zupełnie, zamiast negocjować o piksele.
 */
export const NAWIGACJA_ODSTEP_PX = 20;

/** Oddech między dolną krawędzią płótna a tym, co pod nim, żeby rysunek nie kończył
 *  się dokładnie na krawędzi. */
const ODDECH_POD_PLOTNEM = 12;

/** Domyślny zapas pod płótnem, gdy nie znamy wysokości paska stanu (pierwszy render,
 *  zanim cokolwiek zmierzymy). Faktyczny zapas podaje `DesignTab` z pomiaru — patrz
 *  trzeci argument `wysokoscPlotna`. */
export const ZAPAS_POD_PLOTNEM = ODDECH_POD_PLOTNEM;

/** Najmniejsze sensowne okno rysunku. Wchodzi w grę tam, gdzie nad płótnem stoi tyle
 *  (telefon: nagłówek zawinięty na cztery wiersze, banery, biblioteka elementów), że
 *  z okna nie zostaje już nic — wtedy przewijanie do rysunku jest nieuniknione i lepiej
 *  dać mu uczciwe 360 px niż wysokość ujemną. */
export const MIN_WYS_PLOTNA = 360;

/** Górna granica: powyżej tego rysunek przestaje być czytelny jako całość, a i tak
 *  ogranicza go szerokość kolumny. */
export const MAX_WYS_PLOTNA = 1100;

/**
 * Wysokość okna płótna: tyle, żeby DOLNA krawędź rysunku wypadła przy dolnej krawędzi
 * okna, gdy strona jest przewinięta na sam początek.
 *
 * `goraPlotna` to odległość od góry DOKUMENTU do góry kolumny płótna — czyli zmierzona
 * wysokość wszystkiego, co nad nią stoi: nagłówka strony, paska etapów, banerów
 * (pojawiają się i znikają w trakcie pracy!), paska kondygnacji i paska narzędzi.
 *
 * HISTORIA: stał tu szacunek `okno - 260` i był ZŁY — tego, co nad płótnem, jest realnie
 * około 480 px. Przy oknie 1440×900 strona wychodziła na 1291 px, przy 1600×1200 na
 * 1480 px, czyli edytor nie mieścił się w oknie NIGDY, na żadnym monitorze: dolną
 * krawędź rysunku dało się zobaczyć wyłącznie przewijając całą stronę — razem z paskiem
 * narzędzi, którym się w tej chwili rysuje. Tryb pełnoekranowy liczył to poprawnie od
 * początku (mierzy `rozmiaryChrome` w DesignTab.tsx), więc tutaj też MIERZYMY, zamiast
 * zgadywać.
 *
 * `null` (kolumna płótna jeszcze niezamontowana — ekran wejściowy, przycinanie podkładu)
 * wraca do dawnego szacunku: to wyłącznie wartość startowa, którą pierwszy pomiar po
 * zamontowaniu zaraz zastąpi.
 *
 * `zapasPod` to miejsce zostawione POD płótnem: pasek stanu plus oddech. Podawany
 * z POMIARU, nie zgadywany — pasek zawija się na węższym oknie, więc jego wysokość nie
 * jest stała. Rezerwujemy go, bo to on niesie powierzchnię, skalę, stan zapisu
 * i przycisk kolejnego kroku: gdyby wypadł pod zgięcie, użytkownik rysowałby bez ani
 * jednej z tych informacji przed oczami. Wiersz „rzut ≈ … m szer." spod paska jest
 * świadomie POZA rezerwacją — to informacja pomocnicza, którą można doczytać po
 * przewinięciu, a każdy zarezerwowany piksel odbiera się rysunkowi.
 *
 * `okno` wstrzykiwalne, żeby dało się to sprawdzić bez przeglądarki.
 */
export function wysokoscPlotna(
  goraPlotna: number | null = null,
  okno: number = typeof window === "undefined" ? 900 : window.innerHeight,
  zapasPod: number = ZAPAS_POD_PLOTNEM
): number {
  if (goraPlotna === null) return Math.max(640, Math.min(MAX_WYS_PLOTNA, okno - 260));
  return Math.max(MIN_WYS_PLOTNA, Math.min(MAX_WYS_PLOTNA, okno - goraPlotna - zapasPod));
}

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
 * Zasięg przyciągania osprzętu do ŚCIANY [m] — trochę ciaśniej niż tolerancja
 * przypisania do pomieszczenia wyżej, bo tamta tylko OPISUJE element, a ta go
 * PRZESUWA. Za szeroka ściągałaby na ścianę gniazdo postawione świadomie w podłodze
 * albo w wyspie kuchennej.
 *
 * Mieszkał dotąd jako stała lokalna w `DesignTab` — przeniesiony tutaj, obok
 * bliźniaczej tolerancji pomieszczenia, gdy drugim wołającym stał się generator
 * projektu przykładowego (`przyklejDoScian` w lib/demo/wspolne.ts). Przykład MUSI
 * doklejać osprzęt tą samą miarą co kliknięcie na planie, inaczej wygląda inaczej
 * niż wszystko, co narysuje użytkownik.
 */
export const WALL_SNAP_TOLERANCE_M = 0.35;

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
  klatka: "Klatka schodowa",
  inne: "Inne",
};

const WET_ROOM_TYPES: readonly RoomType[] = ["kuchnia", "lazienka", "pralnia", "kotlownia"];

/** Podpowiedź typu pomieszczenia na podstawie nazwy — startowa wartość w oknie
 *  „Nazwij pomieszczenie", żeby nie zaczynać zawsze od „Inne". Użytkownik może ją
 *  swobodnie nadpisać wyborem z listy; to tylko domysł, nie źródło prawdy. */
export function guessRoomType(name: string): RoomType {
  // „WC" i „Toaleta" to też pomieszczenia sanitarne. Bez nich pokój nazwany „WC"
  // wypadał z reguł strefy mokrej i lądował we wspólnym obwodzie z sypialniami.
  // „wc" tylko jako OSOBNY wyraz — inaczej wpadałyby w to zwykłe słowa („mówca").
  if (/łazienk|toalet|(^|[^a-ząćęłńóśźż])wc([^a-ząćęłńóśźż]|$)/i.test(name)) return "lazienka";
  if (/kuchni/i.test(name)) return "kuchnia";
  if (/pralni/i.test(name)) return "pralnia";
  if (/kotłowni/i.test(name)) return "kotlownia";
  if (/salon/i.test(name)) return "salon";
  if (/sypialni/i.test(name)) return "sypialnia";
  if (/klatk|schod/i.test(name)) return "klatka";
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
  return WET_ROOM_TYPES.includes(typPomieszczenia(roomName, roomShapes));
}

/** Typ pomieszczenia o danej nazwie: jawny z obrysu, a w jego braku zgadnięty z nazwy. */
export function typPomieszczenia(roomName: string, roomShapes: RoomShape[]): RoomType {
  return roomShapes.find((r) => r.name === roomName)?.type ?? guessRoomType(roomName);
}

/**
 * ZASTOSOWANIE pomieszczenia — kryterium, po którym wolno wpuścić dwa pokoje na jeden
 * obwód gniazd (patrz `computeCircuits`).
 *
 * Wspólny obwód znaczy wspólne zabezpieczenie: zwarcie w jednym pokoju gasi wszystkie
 * pozostałe na tym obwodzie. Między pomieszczeniami o tym samym zastosowaniu to koszt
 * do przyjęcia — dwie sypialnie gasną razem i nic się przez to nie zmienia. Między
 * różnymi już nie: łazienka i sypialnia mają inne obciążenie, inne wymagania (strefy,
 * hermetyczność) i inny skutek zaniku napięcia, więc wspólny obwód znaczyłby tyle, że
 * przy pierwszej lepszej usterce ciemno robi się w obu.
 *
 * `nieznane` to osobny kubełek, a nie „wszystko pozostałe": o punkcie bez pomieszczenia
 * albo w pomieszczeniu typu „Inne" nie wiadomo, do czego służy, więc nie ma jak
 * stwierdzić, z czym wolno mu dzielić obwód. Dołożenie go do pokoi byłoby zgadywaniem.
 */
export type ZastosowaniePokoju = "mieszkalne" | "kuchnia" | "sanitarne" | "gospodarcze" | "nieznane";

const ZASTOSOWANIE: Record<RoomType, ZastosowaniePokoju> = {
  salon: "mieszkalne",
  sypialnia: "mieszkalne",
  pokoj: "mieszkalne",
  kuchnia: "kuchnia",
  lazienka: "sanitarne",
  pralnia: "gospodarcze",
  kotlownia: "gospodarcze",
  garaz: "gospodarcze",
  // Komunikacja, tak samo jak `inne` — jej gniazda nie wpadaja na wspolny obwod z pokojami.
  klatka: "nieznane",
  inne: "nieznane",
};

/** Opis zastosowania w NAZWIE obwodu — stąd liczba mnoga i małe litery. */
export const ZASTOSOWANIE_OPIS: Record<ZastosowaniePokoju, string> = {
  mieszkalne: "pokoje",
  kuchnia: "kuchnia",
  sanitarne: "łazienki",
  gospodarcze: "pomieszczenia gospodarcze",
  nieznane: "ogólne",
};

export function zastosowaniePokoju(roomName: string, roomShapes: RoomShape[]): ZastosowaniePokoju {
  return ZASTOSOWANIE[typPomieszczenia(roomName, roomShapes)];
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
 * Rozpiętość narysowanego rzutu: dłuższy bok obrysu ścian i pomieszczeń, w jednostkach
 * planu. `null`, gdy nie ma jeszcze ani jednej ściany i ani jednego pomieszczenia.
 *
 * Liczona WYŁĄCZNIE z geometrii rysowanej ręcznie — bez elementów. Rozmiar symbolu
 * elementu zależy od tej liczby (patrz `skalaZRysunku`), więc wliczenie elementów
 * zamknęłoby pętlę: większy symbol rozdymałby obrys, a większy obrys symbol.
 */
export function rozpietoscRysunku(
  walls: { points: Point[] }[],
  roomShapes: { points: Point[] }[]
): number | null {
  const punkty = [...walls.flatMap((w) => w.points), ...roomShapes.flatMap((r) => r.points)];
  if (punkty.length === 0) return null;
  const xs = punkty.map((p) => p.x);
  const ys = punkty.map((p) => p.y);
  return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
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

  /**
   * Bez przycinania do arkusza. Wcześniej wynik był zaciskany do 0…planSize, co przy
   * płótnie z granicami tylko zbierało margines przy krawędzi — a odkąd rysować można
   * wszędzie, obcinałoby rysunek na wydruku bez śladu, że czegoś brakuje. Kadr to
   * treść plus margines, i tyle; „gdzie kończy się arkusz" nie jest już pytaniem.
   */
  const minX = Math.min(...punkty.map((p) => p.x)) - margines;
  const minY = Math.min(...punkty.map((p) => p.y)) - margines;
  const maxX = Math.max(...punkty.map((p) => p.x)) + margines;
  const maxY = Math.max(...punkty.map((p) => p.y)) + margines;
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

/**
 * Tolerancja domknięcia obrysu ściany [jedn. planu].
 *
 * Ściana zamykana kliknięciem dostaje DOKŁADNIE swój pierwszy punkt (patrz
 * `zPrzyciaganiem` w DesignCanvas.tsx), więc teoretycznie wystarczyłaby równość.
 * Zapisy potrafią jednak przejść przez JSON, przeliczenie skali albo przeciągnięcie
 * narożnika o włos — a pół jednostki planu to przy rysunku odręcznym 2,5 cm, czyli
 * mniej niż grubość najcieńszej ścianki. Nic, co byłoby świadomą szczeliną.
 */
const TOLERANCJA_DOMKNIECIA = 0.5;

/**
 * Wierzchołki ściany narysowanej jako ZAMKNIĘTA PĘTLA — albo `null`, gdy ściana
 * pętli nie tworzy.
 *
 * Po co: ściana zamknięta w pętlę to obrys pomieszczenia narysowany murem. Droga
 * w drugą stronę istniała od dawna (`createWallFromRoom` — „Utwórz ścianę z obrysu"),
 * ta nie istniała wcale. A to właśnie ta strona jest naturalna po „Narysuj dom
 * samodzielnie": użytkownik dostaje narzędzie ściany, obrysowuje nim dom, po czym
 * przewodnik każe mu „obrysować pomieszczenia" — czyli przejechać po raz drugi
 * dokładnie tę samą figurę, którą przed chwilą narysował.
 *
 * Zwracane są SAME wierzchołki, bez powtórzonego punktu domykającego: pomieszczenie
 * trzyma obrys jako listę rogów, a domknięcie jest w nim dorozumiane (odwrotnie niż
 * ściana, która domknięcie ma zapisane jawnie).
 *
 * Figura o zerowym polu (wszystkie punkty na jednej linii — np. ściana narysowana
 * tam i z powrotem) jest odrzucana: to nie jest pomieszczenie, choć formalnie
 * „wraca do początku".
 */
export function wierzcholkiZamknietejSciany(points: Point[]): Point[] | null {
  if (points.length < 4) return null;
  const pierwszy = points[0];
  const ostatni = points[points.length - 1];
  if (Math.hypot(ostatni.x - pierwszy.x, ostatni.y - pierwszy.y) > TOLERANCJA_DOMKNIECIA) return null;
  const wierzcholki = points.slice(0, -1);
  if (wierzcholki.length < 3) return null;
  if (polygonArea(wierzcholki) <= 0) return null;
  return wierzcholki;
}

/**
 * Ile pikselów ma mieć metr na czystej kartce [px/m].
 *
 * Dobrane tak, żeby w oknie mieścił się z zapasem cały dom (około 24 × 15 m), a nie
 * połowa osiedla: wcześniej kadr brał się z dopasowania ARKUSZA (50 × 35 m), więc
 * metr miał 17 px i pokój 7 m² otwierał się jako prostokąt 45 × 46 px.
 */
export const PIKSELI_NA_METR_RYSOWANIA = 40;

/**
 * Powiększenie odpowiadające STANDARDOWEJ SKALI RYSOWANIA, czyli 1 m = 40 px.
 *
 * Punkt odniesienia dla odczytu w pasku: „100%" ma znaczyć tę skalę, a nie wewnętrzne
 * „1 jednostka planu = 1 piksel". Jednostka planu jest pojęciem z kodu — przy
 * rysowaniu od zera wychodziło z niej 20 px na metr, czyli DWA RAZY mniej niż widok,
 * w którym rysunek się otwiera. Przycisk „przywróć 100%" oddalałby wtedy rysunek.
 */
export function zoomSkaliRysowania(metersPerUnit: number | null): number {
  const mpu = metersPerUnit !== null && metersPerUnit > 0 ? metersPerUnit : MANUAL_DRAW_SCALE_MPU;
  return PIKSELI_NA_METR_RYSOWANIA * mpu;
}

/** Kadr płótna: powiększenie plus lewy górny róg okna w jednostkach planu. */
export interface KadrPlotna {
  zoom: number;
  widok: { x: number; y: number };
}

/**
 * Powiększenie, przy którym `obszar` mieści się w oknie — w granicach suwaka.
 *
 * Osobna funkcja, a nie dwie linijki w `kadrOtwarcia`, bo to jedyne miejsce,
 * w którym wolno zdecydować, w którą stronę zaokrąglić — a od tego zależy, czy
 * dopasowany rzut mieści się w oknie w całości.
 *
 * Zaokrąglenie do dwóch miejsc W DÓŁ, bo ta sama wartość ląduje w pasku jako „85%”.
 * W dół, a nie do najbliższego: zaokrąglenie w górę potrafi dołożyć pół procentu,
 * przy którym dopasowany rysunek wystaje poza okno o kilka pikseli — niewidocznie,
 * dopóki kadr siedział w rogu, ale po wyśrodkowaniu ucina go z obu stron naraz.
 */
function zoomDopasowania(
  obszar: { w: number; h: number },
  okno: { w: number; h: number },
  granice: { min: number; max: number }
): number {
  const dopasowanie = Math.min(okno.w / obszar.w, okno.h / obszar.h);
  if (!Number.isFinite(dopasowanie)) return granice.min;
  return Math.min(granice.max, Math.max(granice.min, Math.floor(dopasowanie * 100) / 100));
}

/**
 * Kadr, w którym otwiera się rysunek — dopasowany do TREŚCI, nie do arkusza.
 *
 * Arkusz to 1000 × 700 jedn., czyli 50 × 35 m przy rysowaniu od zera. Dom o 140 m²
 * zajmuje z tego jedną ósmą, więc dopasowanie do arkusza pokazywało głównie pustkę,
 * a sam rysunek wychodził wielkości znaczka pocztowego — od tego zaczęła się cała
 * przebudowa płótna.
 *
 * Pusta kondygnacja zostaje przy STARYM zachowaniu: arkusz dopasowany do okna, kadr
 * w zerze. To nie wyjątek dla wygody, tylko brak pytania — nie ma czego kadrować,
 * a arkusz w rogu daje przewidywalny punkt odniesienia, od którego zaczyna się
 * rysowanie. Gdy treść jest, kadr siada na niej i środkuje ją w oknie.
 *
 * Granice powiększenia obowiązują: pojedyncze gniazdko nie rozdmucha się na cały
 * ekran, a rysunek wielkości osiedla nie zejdzie poniżej czytelności — w obu
 * przypadkach zostaje przynajmniej wyśrodkowany na tym, co jest.
 */
export function kadrOtwarcia(
  tresc: Obszar | null,
  podklad: PlanSize | null,
  okno: { w: number; h: number },
  granice: { min: number; max: number },
  metersPerUnit: number | null
): KadrPlotna {
  /**
   * Oddech wokół rysunku, liczony UŁAMKIEM jego rozmiaru, nie stałą liczbą jednostek.
   *
   * Stały margines (jak `MARGINES_KADROWANIA` przy eksporcie) jest tu zły z zasady:
   * przy pokoju 6 × 4 m zabiera połowę kadru, a przy całym domu jest niewidoczny.
   * Ułamek daje ten sam efekt wizualny niezależnie od tego, czy otwieramy garaż,
   * czy osiedle. Arkusz zapasu nie dostaje — on sam JEST kadrem.
   */
  const ZAPAS = 0.05;
  const rysunek = tresc
    ? {
        x: tresc.x - tresc.w * ZAPAS,
        y: tresc.y - tresc.h * ZAPAS,
        w: tresc.w * (1 + 2 * ZAPAS),
        h: tresc.h * (1 + 2 * ZAPAS),
      }
    : null;
  /**
   * Czysta kartka: nie ma ani rysunku, ani podkładu, więc nie ma czego dopasowywać —
   * i właśnie dlatego trzeba WYBRAĆ skalę, zamiast dziedziczyć ją po arkuszu.
   *
   * Dopasowanie do arkusza (50 × 35 m) dawało metr wielkości 17 px, więc pokój 7 m²
   * otwierał się jako prostokąt 45 × 46 px — nie mieściła się w nim nawet własna
   * nazwa. To było pierwotne zgłoszenie i dopiero teraz da się je naprawić: dopóki
   * arkusz był granicą rysunku, jego rozmiar MUSIAŁ się mieścić w oknie.
   *
   * Zamiast tego stała liczba pikseli na metr (patrz `PIKSELI_NA_METR_RYSOWANIA`):
   * okno pokazuje wtedy około 24 × 15 m, czyli z zapasem cały dom, a pokój 7 m²
   * ma bok ponad 100 px.
   */
  if (!rysunek && !podklad) {
    const zoomRysowania = Math.min(granice.max, Math.max(granice.min, zoomSkaliRysowania(metersPerUnit)));
    return { zoom: Math.round(zoomRysowania * 100) / 100, widok: { x: 0, y: 0 } };
  }

  const obszar = rysunek ?? { x: 0, y: 0, w: podklad!.w, h: podklad!.h };
  const zoom = zoomDopasowania(obszar, okno, granice);

  // Środek treści na środek okna — a gdy rysunku jeszcze nie ma, środek PODKŁADU.
  // Wgrany rzut bez ani jednej narysowanej ściany siadał dotąd w lewym górnym rogu
  // (kadr w zerze) i przy oknie szerszym niż on sam wyglądał na zepchnięty w bok,
  // z pustą siatką po prawej. Wyśrodkowanie dotyczy więc OBU przypadków: tego, co
  // narysowane, a zanim cokolwiek powstanie — tego, co wgrane.
  //
  // Przy powiększeniu uciętym do granicy okno bywa węższe od rysunku — wtedy
  // wyśrodkowanie i tak pokazuje jego środek, zamiast zaczynać od rogu i uciąć
  // resztę niewidocznie.
  return {
    zoom,
    widok: {
      x: obszar.x + obszar.w / 2 - okno.w / zoom / 2,
      y: obszar.y + obszar.h / 2 - okno.h / zoom / 2,
    },
  };
}

/**
 * Najmniejsze oczko siatki, które na ekranie jeszcze do czegoś służy [px].
 *
 * Próg, nie ideał: dobór bierze pierwszy szczebel drabinki POWYŻEJ tej wartości, więc
 * oczko wypada zwykle między 14 a 35 px. Dobrany tak, żeby domyślny widok został przy
 * metrze — przy wyższym progu pierwsze, co widać po otwarciu rysunku, byłaby kratka
 * co 2 m, czyli rzadsza niż dotąd.
 */
export const MIN_OCZKO_PX = 14;

/** Szczeble drabinki w obrębie dekady. Patrz `krokSiatki`. */
const SZCZEBLE = [1, 2, 5];

/**
 * Skok siatki [jedn. planu] dobrany do powiększenia — konwencja z programów CAD.
 *
 * Stałe oczko ma dwie wady naraz: po przybliżeniu jest za rzadkie, żeby cokolwiek nim
 * wymierzyć (kratka co metr przy rysowaniu gniazdka jest bezużyteczna), a po oddaleniu
 * zlewa się w jednolitą szarość. Bierzemy więc najmniejszy „okrągły" krok, którego
 * oczko ma na ekranie co najmniej `MIN_OCZKO_PX`.
 *
 * Drabinka 1-2-5 w METRACH (… 0,1 / 0,2 / 0,5 / 1 / 2 / 5 …), bo to jedyne podziały,
 * które człowiek czyta bez liczenia: „dwie kratki to pół metra". Krok dobrany wprost
 * w pikselach trafiałby na 0,37 m i nie dałby się użyć do niczego poza patrzeniem.
 *
 * Liczymy w metrach, nie w jednostkach planu, właśnie dlatego, że okrągły ma być
 * WYMIAR RZECZYWISTY. Przy rzucie skalibrowanym gęściej ten sam krok to inna liczba
 * jednostek — i dobrze, bo użytkownik mierzy metrami, nie jednostkami.
 */
export function krokSiatki(metersPerUnit: number | null, zoom: number): number {
  const mpu = metersPerUnit !== null && metersPerUnit > 0 ? metersPerUnit : MANUAL_DRAW_SCALE_MPU;
  const pikseliNaMetr = zoom / mpu;
  if (!Number.isFinite(pikseliNaMetr) || pikseliNaMetr <= 0) return GRID;

  const minMetry = MIN_OCZKO_PX / pikseliNaMetr;
  const dekada = Math.pow(10, Math.floor(Math.log10(minMetry)));
  // Pierwszy szczebel nie mniejszy od wymaganego. Kolejna dekada domyka przypadek,
  // w którym wymagane jest większe niż 5 × dekada (np. 7 m przy mocno oddalonym rzucie).
  const krokM = SZCZEBLE.map((s) => s * dekada).find((k) => k >= minMetry) ?? 10 * dekada;
  return krokM / mpu;
}

/**
 * Ile metrów ma oczko siatki WIDOCZNE przy danym powiększeniu [m]. `null`, gdy skala
 * nie jest ustawiona — wtedy nie ma czego podać, choć siatkę i tak rysujemy.
 *
 * Pasek stanu podawał dotąd skalę jako „1 jedn. = 5,00 cm". „Jednostka planu" to
 * pojęcie z kodu — elektryk nie ma jak go użyć ani z czym zestawić. Oczko siatki widać
 * natomiast na ekranie, więc ten odczyt da się sprawdzić wzrokiem i od razu zmierzyć
 * nim rysunek: „ten pokój to cztery kratki, czyli cztery metry".
 *
 * Odkąd skok idzie za powiększeniem, odczyt MUSI brać powiększenie pod uwagę. Stała
 * wartość byłaby tu zwyczajnie nieprawdą: pasek mówiłby „oczko 1 m", a na ekranie
 * stałaby półmetrowa kratka i policzenie nią pokoju dałoby wynik dwa razy za duży.
 */
export function oczkoSiatkiM(metersPerUnit: number | null, zoom: number): number | null {
  if (metersPerUnit === null || !(metersPerUnit > 0)) return null;
  return krokSiatki(metersPerUnit, zoom) * metersPerUnit;
}

/** Ile kresek rysuje schemat schodów. Stała, NIE liczba stopni — patrz `schodySchemat`. */
const LICZBA_KRESEK_SCHODOW = 5;

/**
 * Schemat schodów wpisany w obrys pomieszczenia: kilka kresek w poprzek biegu plus
 * strzałka kierunku wejścia.
 *
 * SCHEMAT, A NIE ODWZOROWANIE — i to jest tu decyzja, nie uproszczenie z lenistwa.
 * Aplikacja nie wie, czy bieg jest prosty, czy dwubiegowy z podestem; sam obrys tego nie
 * rozstrzyga, bo 2 × 3 m mieści oba układy. Narysowanie stopni w realnym rozstawie na
 * całej długości stwierdzałoby bieg PROSTY także tam, gdzie go nie ma — ten sam błąd,
 * dla którego z rzutu domu wypadła brama garażowa rysowana łukiem skrzydła. Stała,
 * mała liczba kresek mówi „tu są schody" i nic ponadto.
 *
 * Bieg idzie wzdłuż DŁUŻSZEJ osi obrysu, więc schemat obraca się razem z pomieszczeniem
 * bez żadnego pola do ustawienia przez użytkownika.
 *
 * `null`, gdy obrys nie ma pola (mniej niż trzy punkty albo zerowa szerokość) — nie ma
 * wtedy czego wypełnić.
 */
export function schodySchemat(
  points: Point[]
): { stopnie: [Point, Point][]; strzalka: { od: Point; do: Point } } | null {
  if (points.length < 3) return null;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  const szer = x1 - x0;
  const wys = y1 - y0;
  if (szer <= 0 || wys <= 0) return null;

  const wzdluzX = szer >= wys;
  const dlugoscBiegu = wzdluzX ? szer : wys;
  const polowaKreski = (wzdluzX ? wys : szer) * 0.35;
  const wOsi = wzdluzX ? (y0 + y1) / 2 : (x0 + x1) / 2;
  const start = (wzdluzX ? x0 : y0) + dlugoscBiegu * 0.2;
  const krok = (dlugoscBiegu * 0.6) / (LICZBA_KRESEK_SCHODOW - 1);

  const stopnie: [Point, Point][] = [];
  for (let i = 0; i < LICZBA_KRESEK_SCHODOW; i++) {
    const t = start + i * krok;
    stopnie.push(
      wzdluzX
        ? [{ x: t, y: wOsi - polowaKreski }, { x: t, y: wOsi + polowaKreski }]
        : [{ x: wOsi - polowaKreski, y: t }, { x: wOsi + polowaKreski, y: t }]
    );
  }

  const od = (wzdluzX ? x0 : y0) + dlugoscBiegu * 0.15;
  const doK = (wzdluzX ? x0 : y0) + dlugoscBiegu * 0.85;
  return {
    stopnie,
    strzalka: wzdluzX
      ? { od: { x: od, y: wOsi }, do: { x: doK, y: wOsi } }
      : { od: { x: wOsi, y: od }, do: { x: wOsi, y: doK } },
  };
}
