import type { InstallationElement, Opening, RoomShape, Wall } from "@/types";
import { MANUAL_DRAW_SCALE_MPU, ROOM_COLORS, WALL_SNAP_TOLERANCE_M } from "@/lib/design";
import { przyscienny, snapElementToWall } from "@/lib/wallSnap";
import { DEFAULT_ELEMENT_SCALE, elementRenderScale } from "@/lib/symbolScale";
import { DEFAULT_PRICES } from "@/lib/costs";
import { INITIAL_ONBOARDING } from "@/lib/onboarding";
import { WARUNKI_DOBORU_DOMYSLNE } from "@/lib/panel/norms";
import type { ProjectPayload } from "@/store/useProjectStore";

/**
 * Gotowy projekt przykładowy — mieszkanie 70 m², pięć pomieszczeń, komplet osprzętu.
 *
 * PO CO: dotąd żeby zobaczyć, co ta aplikacja właściwie robi, trzeba było najpierw
 * znaleźć skan rzutu, wgrać go, skalibrować skalę, obrysować pokoje, ponazywać je
 * i porozstawiać elementy. Dopiero po tych kilkunastu minutach rozdzielnica, schemat
 * i kosztorys przestawały być puste. Kto wszedł „zobaczyć, co to jest", odbijał się
 * od pierwszego kroku i nie dowiadywał się nigdy, że te trzy zakładki wypełniają się
 * same. Ten projekt pokazuje to w jednym kliknięciu.
 *
 * DLACZEGO BEZ PODKŁADU: podkład to obraz w `bgImages`, trzymany jako data URL —
 * dorzucenie go tutaj wpakowałoby setki kilobajtów base64 do paczki i do każdego
 * autozapisu. Rysunek stoi więc na czystej siatce w skali `MANUAL_DRAW_SCALE_MPU`,
 * dokładnie tak, jak wygląda dom narysowany od zera przez „Narysuj dom samodzielnie".
 *
 * WSPÓŁRZĘDNE: jednostki planu, gdzie 20 jedn. = 1 m (przy `MANUAL_DRAW_SCALE_MPU`
 * jedno oczko siatki to równo metr). Mieszkanie zajmuje prostokąt 200×140 jedn.,
 * czyli 10×7 m, zaczepiony w (20, 20). Wszystkie narożniki leżą na siatce, więc
 * rysunek wygląda jak zrobiony z przyciąganiem włączonym, a nie „na oko".
 *
 * OBSZAR PLANU jest przycięty do mieszkania (240×180 jedn. = 12×9 m, metr zapasu
 * dookoła) zamiast stać na domyślnych 1000×700. Dopasowanie powiększenia mieści
 * w oknie CAŁY obszar planu, a nie to, co na nim narysowano (patrz `dopasujZoom`
 * w DesignTab.tsx) — na domyślnym arkuszu 50×35 m mieszkanie zajmowałoby piątą część
 * szerokości i przykład otwierałby się jako znaczek pocztowy w rogu szarego tła.
 * `planSize` jest właśnie od tego: to arkusz, na którym leży rysunek.
 *
 * Wymiary pokoi (metry, od lewego górnego rogu mieszkania):
 *   Salon 5×4 · Kuchnia 5×4 · Przedpokój 3×3 · Łazienka 3×3 · Sypialnia 4×3
 */

/** Lewy górny róg mieszkania w jednostkach planu. */
const X0 = 20;
const Y0 = 20;
/** Jednostki planu na metr — patrz `MANUAL_DRAW_SCALE_MPU` (0,05 m na jednostkę). */
const M = 20;

/** Punkt z METRÓW liczonych od narożnika mieszkania — cały rysunek niżej jest w nich,
 *  bo „ściana na 5 m" czyta się, a „ściana na 200" trzeba przeliczać w głowie. */
const p = (mx: number, my: number) => ({ x: X0 + mx * M, y: Y0 + my * M });

const FLOOR = "f1";

const SALON = "Salon";
const KUCHNIA = "Kuchnia";
const PRZEDPOKOJ = "Przedpokój";
const LAZIENKA = "Łazienka";
const SYPIALNIA = "Sypialnia";

function sciany(): Wall[] {
  return [
    // Obrys zewnętrzny, domknięty — jedna łamana, tak jak rysuje narzędzie „Ściana".
    { id: "demo-w-obrys", floor: FLOOR, points: [p(0, 0), p(10, 0), p(10, 7), p(0, 7), p(0, 0)] },
    // Ściana między Salonem a Kuchnią.
    { id: "demo-w-salon-kuchnia", floor: FLOOR, points: [p(5, 0), p(5, 4)] },
    // Ściana dzieląca mieszkanie na część dzienną (góra) i nocną (dół).
    { id: "demo-w-poprzeczna", floor: FLOOR, points: [p(0, 4), p(10, 4)] },
    // Ściany wydzielające łazienkę z korytarza i z sypialni.
    { id: "demo-w-przedpokoj-lazienka", floor: FLOOR, points: [p(3, 4), p(3, 7)] },
    { id: "demo-w-lazienka-sypialnia", floor: FLOOR, points: [p(6, 4), p(6, 7)] },
  ];
}

function pomieszczenia(): RoomShape[] {
  return [
    {
      id: "demo-r-salon",
      floor: FLOOR,
      name: SALON,
      type: "salon",
      color: ROOM_COLORS[0],
      points: [p(0, 0), p(5, 0), p(5, 4), p(0, 4)],
    },
    {
      // Kuchnia jest pomieszczeniem MOKRYM — stąd bierze się osobny obwód i wymagania,
      // które aplikacja nakłada sama z typu (patrz `WET_ROOM_TYPES` w lib/design.ts).
      // Przykład ma je pokazywać, a nie omijać.
      id: "demo-r-kuchnia",
      floor: FLOOR,
      name: KUCHNIA,
      type: "kuchnia",
      color: ROOM_COLORS[1],
      points: [p(5, 0), p(10, 0), p(10, 4), p(5, 4)],
    },
    {
      id: "demo-r-przedpokoj",
      floor: FLOOR,
      name: PRZEDPOKOJ,
      type: "inne",
      color: ROOM_COLORS[2],
      points: [p(0, 4), p(3, 4), p(3, 7), p(0, 7)],
    },
    {
      id: "demo-r-lazienka",
      floor: FLOOR,
      name: LAZIENKA,
      type: "lazienka",
      color: ROOM_COLORS[3],
      points: [p(3, 4), p(6, 4), p(6, 7), p(3, 7)],
    },
    {
      id: "demo-r-sypialnia",
      floor: FLOOR,
      name: SYPIALNIA,
      type: "sypialnia",
      color: ROOM_COLORS[4],
      points: [p(6, 4), p(10, 4), p(10, 7), p(6, 7)],
    },
  ];
}

/** Drzwi wewnętrzne. `angle` to kierunek ściany w tym miejscu (radiany): 0 — ściana
 *  pozioma, π/2 — pionowa. `width` w jednostkach planu, czyli 18 jedn. = 90 cm. */
function otwory(): Opening[] {
  const SZER = 18;
  const POZIOMA = 0;
  const PIONOWA = Math.PI / 2;
  return [
    // Wejście z przedpokoju do salonu i do łazienki, oraz z kuchni do sypialni.
    { id: "demo-o-salon", floor: FLOOR, wallId: "demo-w-poprzeczna", ...p(1.5, 4), angle: POZIOMA, width: SZER, kind: "drzwi" },
    { id: "demo-o-lazienka", floor: FLOOR, wallId: "demo-w-przedpokoj-lazienka", ...p(3, 5.5), angle: PIONOWA, width: SZER, kind: "drzwi" },
    { id: "demo-o-sypialnia", floor: FLOOR, wallId: "demo-w-poprzeczna", ...p(8, 4), angle: POZIOMA, width: SZER, kind: "drzwi" },
    // Przejście salon → kuchnia.
    { id: "demo-o-kuchnia", floor: FLOOR, wallId: "demo-w-salon-kuchnia", ...p(5, 2.5), angle: PIONOWA, width: SZER, kind: "drzwi" },
    // Drzwi wejściowe do mieszkania, w ścianie zewnętrznej przy przedpokoju.
    { id: "demo-o-wejscie", floor: FLOOR, wallId: "demo-w-obrys", ...p(0, 5.5), angle: PIONOWA, width: SZER, kind: "drzwi" },
  ];
}

/** Skrót na element — reszta pól to wartości domyślne, identyczne z tymi, które
 *  nadaje `addElement` w store'rze przy stawianiu klikiem. */
function e(
  id: string,
  type: InstallationElement["type"],
  room: string,
  mx: number,
  my: number,
  extra: Partial<InstallationElement> = {}
): InstallationElement {
  return {
    id: `demo-e-${id}`,
    type,
    ...p(mx, my),
    room,
    floor: FLOOR,
    dedicated: false,
    note: "",
    gangs: 1,
    ...extra,
  };
}

/**
 * Osprzęt — tyle, żeby rozdzielnica wyszła realistyczna (kilka obwodów gniazd,
 * oświetlenie, kuchnia i łazienka osobno, jeden obwód dedykowany), ale nie tyle,
 * żeby rzut stał się nieczytelny.
 *
 * Rozdzielnica MUSI tu być: bez niej kosztorys nie ma od czego mierzyć tras i spada
 * na ryczałt „5 mb na punkt" (patrz `cableLengthSource` w lib/costs.ts), czyli
 * przykład pokazywałby gorszy wynik, niż aplikacja naprawdę potrafi.
 */
function elementy(): InstallationElement[] {
  return [
    e("rozdzielnica", "rozdzielnica", PRZEDPOKOJ, 0.5, 4.4),
    e("szafka", "szafkaTeletech", PRZEDPOKOJ, 2.5, 4.4),

    // ODLEGŁOŚCI: symbole są UMOWNE i przy skali „1 kratka = 1 m" jeden zajmuje na
    // rysunku kilkadziesiąt centymetrów ściany (patrz `BASE_ELEMENT_SCALE` w
    // symbolScale.ts). Punkty stoją więc nie bliżej niż ~0,8 m od siebie — nie dlatego,
    // że tak się montuje, tylko żeby przykład nie otwierał się jako kupka nachodzących
    // na siebie kółek. To jest rysunek poglądowy i ma być czytelny.

    // --- Salon ---
    e("salon-gn1", "gniazdko", SALON, 1, 0.2, { gangs: 2 }),
    e("salon-gn2", "gniazdko", SALON, 3.2, 0.2),
    e("salon-gn3", "gniazdko", SALON, 4.8, 2, { gangs: 2 }),
    e("salon-gn4", "gniazdko", SALON, 2, 3.8),
    e("salon-tv", "rtvsat", SALON, 4.3, 0.2),
    e("salon-lan", "rj45", SALON, 4.8, 1),
    e("salon-sw", "wlacznikSchodowy", SALON, 1.2, 3.8),
    e("salon-sw2", "wlacznikSchodowy", SALON, 4.8, 2.8),
    e("salon-lampa1", "oswietlenie", SALON, 1.7, 1.5),
    e("salon-lampa2", "oswietlenie", SALON, 3.4, 2.7),
    e("salon-roleta", "roleta", SALON, 2.2, 0.2),

    // --- Kuchnia (mokra: wypusty AGD i obwód zmywarki na osobnym zabezpieczeniu) ---
    // Podwójne, nie potrójne: `gangs` to WARIANT gniazda (pojedyncze / podwójne),
    // a ramek wielokrotnych aplikacja nie modeluje — patrz `gniazdoPodwojne`.
    e("kuch-gn1", "gniazdko", KUCHNIA, 6, 0.2, { gangs: 2 }),
    e("kuch-gn2", "gniazdko", KUCHNIA, 8, 0.2, { gangs: 2 }),
    e("kuch-agd1", "wypustAGD", KUCHNIA, 6.5, 3.8, { dedicated: true, note: "Zmywarka" }),
    e("kuch-agd2", "wypustAGD", KUCHNIA, 7.5, 3.8, { dedicated: true, note: "Piekarnik" }),
    e("kuch-plyta", "gniazdko400", KUCHNIA, 8.5, 3.8, { dedicated: true, note: "Płyta indukcyjna" }),
    e("kuch-sw", "wlacznik", KUCHNIA, 5.2, 2.2),
    e("kuch-lampa", "oswietlenie", KUCHNIA, 6.5, 1.6),
    e("kuch-led", "tasmaLed", KUCHNIA, 9.2, 2, { note: "Podszafkowa" }),

    // --- Przedpokój ---
    e("przed-gn", "gniazdko", PRZEDPOKOJ, 1.5, 6.8),
    e("przed-sw", "wlacznik", PRZEDPOKOJ, 0.4, 5.8),
    e("przed-lampa", "oswietlenie", PRZEDPOKOJ, 0.9, 5.1),
    e("przed-dzwonek", "dzwonek", PRZEDPOKOJ, 2.7, 6.8),
    e("przed-dym", "czujnikDymu", PRZEDPOKOJ, 2.2, 6),

    // --- Łazienka (mokra: osprzęt hermetyczny, łącznik dwubiegunowy, strefy) ---
    e("laz-gn", "gniazdkoHerm", LAZIENKA, 5.6, 4.4),
    e("laz-sw", "wlacznikDwubiegunowy", LAZIENKA, 3.2, 4.4),
    e("laz-lampa", "oswietlenie", LAZIENKA, 3.9, 5.2),
    e("laz-went", "wentylator", LAZIENKA, 4.5, 6.8),
    e("laz-prysznic", "prysznic", LAZIENKA, 3.6, 6.4),
    e("laz-umywalka", "umywalka", LAZIENKA, 5.5, 5.4),

    // --- Sypialnia ---
    e("syp-gn1", "gniazdko", SYPIALNIA, 6.6, 6.8, { gangs: 2 }),
    e("syp-gn2", "gniazdko", SYPIALNIA, 9.5, 6.8, { gangs: 2 }),
    e("syp-lan", "rj45", SYPIALNIA, 9.5, 4.4),
    e("syp-sw", "sciemniacz", SYPIALNIA, 6.4, 4.4),
    e("syp-lampa", "oswietlenie", SYPIALNIA, 7.1, 5.2),
    e("syp-roleta", "roleta", SYPIALNIA, 8, 6.8),
  ];
}

/**
 * Dokleja osprzęt przyścienny do ścian DOKŁADNIE tak, jak robi to kliknięcie na
 * planie (patrz `zPrzyciaganiemDoSciany` w DesignTab.tsx — te same argumenty,
 * ta sama funkcja).
 *
 * Bez tego kroku dane wyżej są tylko „mniej więcej przy ścianie": gniazdko wpisane
 * 20 cm od jej osi renderuje się okrakiem na murze i połową wychodzi na zewnątrz
 * budynku, bo symbol jest wyższy niż ten odstęp. Ręczne wpisywanie poprawnych
 * odsunięć i obrotów dla czterdziestu punktów byłoby przepisywaniem tej funkcji
 * w stałych — i rozjechałoby się przy pierwszej zmianie geometrii glifów.
 *
 * `skala` to `elementRenderScale(MANUAL_DRAW_SCALE_MPU, DEFAULT_ELEMENT_SCALE, …)`,
 * czyli dokładnie ta, w której przykład się rysuje: przy skali odniesienia
 * `autoSymbolScale` wynosi 1, więc zostaje sam `BASE_ELEMENT_SCALE`.
 */
function przyklejDoScian(elements: InstallationElement[], walls: Wall[], rooms: RoomShape[]): InstallationElement[] {
  const skala = elementRenderScale(MANUAL_DRAW_SCALE_MPU, DEFAULT_ELEMENT_SCALE, DEFAULT_ELEMENT_SCALE);
  const tolerancja = WALL_SNAP_TOLERANCE_M / MANUAL_DRAW_SCALE_MPU;
  return elements.map((el) => {
    if (!przyscienny(el.type)) return el;
    const m = snapElementToWall({ x: el.x, y: el.y }, walls, rooms, tolerancja, el.type, skala);
    return m ? { ...el, x: m.x, y: m.y, rotation: m.rotation } : el;
  });
}

/**
 * Kompletny `ProjectPayload` przykładu — wchodzi do store'a tą samą drogą co projekt
 * z chmury i z autozapisu (`loadProjectPayload`), więc nie ma tu ŻADNEJ osobnej
 * ścieżki wczytywania, którą trzeba by utrzymywać obok tamtej.
 *
 * Budowany funkcją, a nie stałą, bo `loadProjectPayload` bierze obiekty wprost do
 * store'a — wspólna stała dałaby się zmodyfikować pierwszym przeciągnięciem elementu
 * i „przykład" po drugim wczytaniu nie byłby już tym samym przykładem.
 */
export function zbudujProjektPrzykladowy(): ProjectPayload {
  const walls = sciany();
  const roomShapes = pomieszczenia();
  return {
    draft: {
      elements: przyklejDoScian(elementy(), walls, roomShapes),
      walls,
      roomShapes,
      openings: otwory(),
      routeOverrides: {},
    },
    floors: [{ id: FLOOR, name: "Parter" }],
    activeFloorId: FLOOR,
    // Bez podkładu — patrz komentarz na górze pliku.
    bgImages: {},
    scales: { [FLOOR]: MANUAL_DRAW_SCALE_MPU },
    prices: { ...DEFAULT_PRICES },
    costOverrides: {},
    qtyOverrides: {},
    warunkiDoboru: WARUNKI_DOBORU_DOMYSLNE,
    docHeader: {
      obiekt: "Mieszkanie przykładowe, 70 m²",
      adres: "",
      zleceniodawca: "",
      wykonawca: "",
      uprawnienia: "",
      przyrzad: "",
      nrFabryczny: "",
      swiadectwo: "",
      data: new Date().toISOString().slice(0, 10),
      temperatura: "20",
      wilgotnosc: "55",
      uklad: "TN-S",
      drawingNo: "E-01",
      revision: "A",
    },
    protocols: {},
    projectName: "Przykład: mieszkanie 70 m²",
    panelConfig: { supply3f: true, mainRating: 40, perRow: 12 },
    // Rozdzielnica ma się ODBUDOWAĆ z obwodów policzonych z tego rzutu — o to w tym
    // przykładzie chodzi. Stąd tryb „z rzutu" i pusta lista aparatów: gotowa lista
    // zamrażałaby wynik doboru z dnia, w którym powstał ten plik.
    panelDevices: [],
    panelHidden: [],
    panelTryb: "zRzutu",
    panelOverrides: {},
    planSize: { w: 240, h: 180 },
    // Przewodnik „Zacznij w 3 krokach" jest na gotowym projekcie bezprzedmiotowy —
    // wszystkie trzy kroki są w nim z definicji wykonane (jest skala, są nazwane
    // pomieszczenia, stoją elementy), a `reconcile` i tak by je odhaczyło z faktów.
    onboarding: { ...INITIAL_ONBOARDING, krok1Done: true, krok2Done: true, krok3Done: true, pominiety: true, ostatnioOtwarty: false },
    projektPrzykladowy: true,
  };
}
