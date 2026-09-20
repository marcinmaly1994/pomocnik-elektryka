import type { InstallationElement, Opening, RoomShape, Wall } from "@/types";
import { MANUAL_DRAW_SCALE_MPU, ROOM_COLORS } from "@/lib/design";
import { DEFAULT_PRICES } from "@/lib/costs";
import { INITIAL_ONBOARDING } from "@/lib/onboarding";
import { WARUNKI_DOBORU_DOMYSLNE } from "@/lib/panel/norms";
import type { ProjectPayload } from "@/store/useProjectStore";
import { p, przyklejDoScian, tworzE } from "./wspolne";

/**
 * Gotowy projekt przykładowy — mieszkanie 70 m², sześć pomieszczeń, komplet osprzętu.
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
 * czyli 10×7 m, zaczepiony w (20, 20). Wszystkie narożniki leżą na pełnym albo połówkowym
 * metrze, więc rysunek wygląda jak zrobiony z przyciąganiem włączonym, a nie „na oko".
 *
 * OBSZAR PLANU jest przycięty do mieszkania (240×180 jedn. = 12×9 m, metr zapasu
 * dookoła) zamiast stać na domyślnych 1000×700. Dawniej decydowało to o kadrze:
 * dopasowanie mieściło w oknie CAŁY obszar planu, więc na arkuszu 50×35 m przykład
 * otwierał się jako znaczek pocztowy w rogu szarego tła.
 *
 * Dziś kadr siada na TREŚCI (patrz `kadrOtwarcia` w lib/design.ts), a obszar planu bez
 * wgranego rzutu nie jest nawet rysowany — więc ta wartość niczego już nie zmienia
 * w wyglądzie przykładu. Zostaje jako opis arkusza, na którym rysunek powstał.
 *
 * ROZKŁAD jest taki, jaki bywa naprawdę, a nie „prostokąt pocięty na prostokąty".
 * Poprzedni rzut miał przedpokój w formie kwadratu 3×3 m — czyli szósty pokój, a nie
 * komunikację — i drzwi z kuchni do sypialni, więc spać szło się przez kuchnię.
 * Kuchnia była przy tym wielkości salonu, a łazienka wielkości pokoju. Pierwszy
 * rysunek, jaki widzi elektryk, nie może wyglądać jak coś, czego nikt by nie zbudował.
 *
 * Dziś przedpokój jest literą L — przedsionek 2×2 m przy drzwiach wejściowych plus
 * korytarz 1×5 m — i KAŻDE pomieszczenie ma drzwi właśnie do niego; z żadnego do
 * żadnego się nie przechodzi (pilnuje tego test „każde pomieszczenie ma drzwi do
 * KOMUNIKACJI, a nie do sąsiada" w `przyklady.test.ts` — reguła wisi na typie `inne`,
 * nie na nazwie „Przedpokój", więc obowiązuje też w domu obok). Łazienka jest
 * wewnętrzna, bez okna, jak w bloku. Obrys w kształcie L pokazuje przy okazji, że
 * pomieszczenie nie musi być prostokątem.
 *
 * SZEROKOŚĆ KORYTARZA to 1,5 m i nie jest to wartość dobrana pod estetykę. Przy 1,0 m
 * rzut się rysował, ale przewody biegły przez niego ukosem: obrys pomieszczenia wchodzi
 * do grafu tras WSUNIĘTY o `ODSUNIECIE_TRASY` z każdej strony (patrz panel/routing.ts),
 * więc z metrowego korytarza zostaje pasek 0,5 m — dokładnie tyle, ile wynosi
 * `MERGE_TOLERANCE`. Obie jego krawędzie scalały się wtedy w jeden węzeł grafu, węzeł
 * brał pozycję tej, która trafiła do grafu pierwsza, i trasa wchodząca przez drzwi
 * odjeżdżała skosem do przeciwległej krawędzi. 1,5 m zostawia pasek 1,0 m, czyli dwa
 * razy tolerancję — i jest przy okazji szerokością, jaką korytarze naprawdę mają.
 *
 * Wymiary pokoi (metry, od lewego górnego rogu mieszkania):
 *   Salon 5×3,5 (17,5 m²) · Kuchnia 2×3,5 (7 m²) · Sypialnia 3×5 (15 m²)
 *   Pokój 6,5×2 (13 m²) · Łazienka 2×3,5 (7 m²) · Przedpokój L (10,5 m²) — razem 70 m².
 */

const FLOOR = "f1";
const e = tworzE(FLOOR);

const SALON = "Salon";
const KUCHNIA = "Kuchnia";
const PRZEDPOKOJ = "Przedpokój";
const LAZIENKA = "Łazienka";
const SYPIALNIA = "Sypialnia";
const POKOJ = "Pokój";

/**
 * Ściany działowe. Wszystkie leżą na pełnych metrach, więc rysunek wygląda jak zrobiony
 * z włączonym przyciąganiem.
 *
 * Trzy z nich są łamanymi albo dochodzą do innych na styk „T" — to nie niedopatrzenie,
 * tylko tak wychodzi rzut z korytarzem: korytarz jest wnęką, a nie pasem przez całe
 * mieszkanie, więc mur musi gdzieś skręcić.
 */
function sciany(): Wall[] {
  return [
    // Obrys zewnętrzny, domknięty — jedna łamana, tak jak rysuje narzędzie „Ściana".
    { id: "demo-w-obrys", floor: FLOOR, points: [p(0, 0), p(10, 0), p(10, 7), p(0, 7), p(0, 0)] },
    // Ściana między Salonem a Kuchnią.
    { id: "demo-w-salon-kuchnia", floor: FLOOR, points: [p(5, 0), p(5, 3.5)] },
    // Ściana Kuchnia/Sypialnia, przedłużona w dół — ten kawałek zamyka korytarz od
    // wschodu i jest jednocześnie ścianą, w której siedzą drzwi do sypialni.
    { id: "demo-w-kuchnia-sypialnia", floor: FLOOR, points: [p(7, 0), p(7, 5)] },
    // Ściana oddzielająca część dzienną (Salon, Kuchnia) od Łazienki i korytarza.
    { id: "demo-w-dzienna-komunikacja", floor: FLOOR, points: [p(0, 3.5), p(7, 3.5)] },
    // Ściana Łazienki od strony przedpokoju — od korytarza po ścianę zewnętrzną.
    { id: "demo-w-lazienka", floor: FLOOR, points: [p(2, 3.5), p(2, 7)] },
    // Łamana zamykająca przedsionek i Pokój: pion x=3,5 (przedsionek/Pokój) przechodzący
    // w poziom y=5 (korytarz/Pokój, dalej Sypialnia/Pokój).
    { id: "demo-w-pokoj", floor: FLOOR, points: [p(3.5, 7), p(3.5, 5), p(10, 5)] },
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
      points: [p(0, 0), p(5, 0), p(5, 3.5), p(0, 3.5)],
    },
    {
      // Kuchnia jest pomieszczeniem MOKRYM — stąd bierze się osobny obwód i wymagania,
      // które aplikacja nakłada sama z typu (patrz `WET_ROOM_TYPES` w lib/design.ts).
      // Przykład ma je pokazywać, a nie omijać.
      //
      // 2×3,5 m, czyli kuchnia w układzie jednorzędowym z blatem wzdłuż jednej ściany —
      // tyle, ile kuchnie naprawdę mają. Wcześniej było tu 20 m², dokładnie tyle co salon.
      id: "demo-r-kuchnia",
      floor: FLOOR,
      name: KUCHNIA,
      type: "kuchnia",
      color: ROOM_COLORS[1],
      points: [p(5, 0), p(7, 0), p(7, 3.5), p(5, 3.5)],
    },
    {
      // Przedpokój w kształcie LITERY L: przedsionek 1,5×2 m za drzwiami wejściowymi
      // i korytarz 1,5×5 m odchodzący od niego w prawo. To jedna przestrzeń, więc jedno
      // pomieszczenie — a nie dwa prostokąty udające komunikację.
      //
      // Typ „inne" jest tu ŚWIADOMY, nie z lenistwa: komunikacja nie jest ani pokojem,
      // ani pomieszczeniem mokrym, a `ZASTOSOWANIE` przypisuje jej kubełek „nieznane",
      // więc jej gniazda nie wpadają na obwód z sypialniami (patrz `computeCircuits`).
      id: "demo-r-przedpokoj",
      floor: FLOOR,
      name: PRZEDPOKOJ,
      type: "inne",
      color: ROOM_COLORS[2],
      points: [p(2, 3.5), p(7, 3.5), p(7, 5), p(3.5, 5), p(3.5, 7), p(2, 7)],
    },
    {
      // Wewnętrzna, bez okna, 2×3,5 m — tak wyglądają łazienki w budownictwie
      // wielorodzinnym. Poprzednie 9 m² to była powierzchnia pokoju.
      id: "demo-r-lazienka",
      floor: FLOOR,
      name: LAZIENKA,
      type: "lazienka",
      color: ROOM_COLORS[3],
      points: [p(0, 3.5), p(2, 3.5), p(2, 7), p(0, 7)],
    },
    {
      id: "demo-r-sypialnia",
      floor: FLOOR,
      name: SYPIALNIA,
      type: "sypialnia",
      color: ROOM_COLORS[4],
      points: [p(7, 0), p(10, 0), p(10, 5), p(7, 5)],
    },
    {
      // Drugi pokój — 70 m² to w praktyce M4, a nie mieszkanie z jedną sypialnią.
      // Typ `pokoj` ma to samo ZASTOSOWANIE co sypialnia („mieszkalne"), więc oba
      // mogą dzielić obwód gniazd i przykład pokazuje również TĘ regułę.
      id: "demo-r-pokoj",
      floor: FLOOR,
      name: POKOJ,
      type: "pokoj",
      color: ROOM_COLORS[5],
      points: [p(3.5, 5), p(10, 5), p(10, 7), p(3.5, 7)],
    },
  ];
}

/** Drzwi. `angle` to kierunek ściany w tym miejscu (radiany): 0 — ściana pozioma,
 *  π/2 — pionowa. `width` w jednostkach planu, czyli 18 jedn. = 90 cm.
 *
 *  KAŻDE pomieszczenie ma dokładnie jedne drzwi i wszystkie prowadzą do przedpokoju.
 *  Wcześniej do sypialni wchodziło się przez kuchnię — rozkład, którego nikt by nie
 *  zbudował, a który trafiał na pierwszy ekran aplikacji. */
function otwory(): Opening[] {
  const SZER = 18;
  const POZIOMA = 0;
  const PIONOWA = Math.PI / 2;
  return [
    // Drzwi wejściowe do mieszkania — w ścianie zewnętrznej, na wprost przedsionka.
    { id: "demo-o-wejscie", floor: FLOOR, wallId: "demo-w-obrys", ...p(2.75, 7), angle: POZIOMA, width: SZER, kind: "drzwi" },
    // Z korytarza w górę: Salon i Kuchnia.
    { id: "demo-o-salon", floor: FLOOR, wallId: "demo-w-dzienna-komunikacja", ...p(3.5, 3.5), angle: POZIOMA, width: SZER, kind: "drzwi" },
    { id: "demo-o-kuchnia", floor: FLOOR, wallId: "demo-w-dzienna-komunikacja", ...p(6, 3.5), angle: POZIOMA, width: SZER, kind: "drzwi" },
    // Z przedsionka w lewo: Łazienka.
    { id: "demo-o-lazienka", floor: FLOOR, wallId: "demo-w-lazienka", ...p(2, 4.25), angle: PIONOWA, width: SZER, kind: "drzwi" },
    // Na końcu korytarza, na wprost: Sypialnia.
    { id: "demo-o-sypialnia", floor: FLOOR, wallId: "demo-w-kuchnia-sypialnia", ...p(7, 4.25), angle: PIONOWA, width: SZER, kind: "drzwi" },
    // Z korytarza w dół: Pokój.
    { id: "demo-o-pokoj", floor: FLOOR, wallId: "demo-w-pokoj", ...p(5.5, 5), angle: POZIOMA, width: SZER, kind: "drzwi" },
  ];
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
    // --- Przedpokój (przedsionek 1,5×2 m + korytarz 1,5×5 m) ---
    // Rozdzielnica i szafka teletechniczna stoją tam, gdzie stoją naprawdę: zaraz za
    // drzwiami wejściowymi, na ścianie przedsionka. Dwie oprawy w korytarzu, bo L-ka nie
    // oświetli się jednym punktem — zza rogu nie widać lampy w przedsionku.
    e("rozdzielnica", "rozdzielnica", PRZEDPOKOJ, 2.2, 6.6),
    e("szafka", "szafkaTeletech", PRZEDPOKOJ, 2.2, 5.3),
    e("przed-dzwonek", "dzwonek", PRZEDPOKOJ, 3.3, 5.3),
    // Para łączników SCHODOWYCH: jeden przy drzwiach wejściowych, drugi na końcu
    // korytarza. Po to w ogóle istnieje układ schodowy — wchodzi się i gasi z drugiej
    // strony. W mieszkaniu to najbardziej typowe miejsce na taki układ; w salonie
    // (gdzie stał wcześniej) prawie nikt go nie robi.
    e("przed-sw", "wlacznikSchodowy", PRZEDPOKOJ, 3.3, 6.6),
    e("kor-sw", "wlacznikSchodowy", PRZEDPOKOJ, 6.8, 4.8),
    e("przed-lampa", "oswietlenie", PRZEDPOKOJ, 2.75, 5.95),
    e("kor-lampa1", "oswietlenie", PRZEDPOKOJ, 3.75, 4.25),
    e("kor-lampa2", "oswietlenie", PRZEDPOKOJ, 5.75, 4.25),
    e("kor-gn", "gniazdko", PRZEDPOKOJ, 4.8, 3.7),
    // x przesunięte z 4 na 4,75: przy oprawie w (3,75; 4,25) środki dzieliło 0,43 m,
    // a oba symbole mają po 0,55 m — czyli nachodziły na siebie na rysunku. Oprawy
    // ruszyć nie można, bo stoi dokładnie pod 45° od wsuniętego wklęsłego narożnika
    // (patrz `kor-lampa1`); czujnik nie przykleja się do ściany, więc to jego pozycja
    // jest tu swobodna. Pilnuje tego test „żadne dwa symbole nie NACHODZĄ na siebie".
    e("przed-dym", "czujnikDymu", PRZEDPOKOJ, 4.75, 4.6),

    // ODLEGŁOŚCI: symbole są UMOWNE i każdy typ ma swój rozmiar — przy skali „1 kratka
    // = 1 m" łącznik zajmuje na rysunku 0,76 m, oprawa i czujnik po 0,55 m, gniazdko
    // 0,38 × 0,46 m (liczone z `glyphBoxSize` razy `elementRenderScale`). Jedna liczba
    // dla wszystkich nie istnieje, więc rozstaw „co najmniej 0,8 m", którym kierował się
    // ten plik, był regułą kciuka dobraną pod największy z symboli.
    //
    // Od teraz pilnuje tego TEST, a nie reguła kciuka: „żadne dwa symbole w jednym
    // pomieszczeniu nie NACHODZĄ na siebie" w `przyklady.test.ts` liczy próg osobno dla
    // każdej pary, wprost z rozmiaru glifów. Dzięki temu gęstsze rozmieszczenie drobnych
    // symboli (blat kuchenny, listwa nad biurkiem) jest dozwolone, a nachodzenie dwóch
    // dużych — nie, choćby dzieliło je „prawie 0,8 m".

    // --- Salon (5×3,5 m) ---
    e("salon-gn1", "gniazdko", SALON, 1, 0.2, { gangs: 2 }),
    e("salon-roleta", "roleta", SALON, 2.2, 0.2),
    e("salon-gn2", "gniazdko", SALON, 3.2, 0.2),
    e("salon-tv", "rtvsat", SALON, 4.3, 0.2),
    e("salon-gn3", "gniazdko", SALON, 4.8, 1.3, { gangs: 2 }),
    e("salon-lan", "rj45", SALON, 4.8, 2.2),
    e("salon-gn4", "gniazdko", SALON, 0.2, 2.6),
    e("salon-sw", "wlacznik", SALON, 2.7, 3.3),
    e("salon-lampa1", "oswietlenie", SALON, 1.7, 1.3),
    e("salon-lampa2", "oswietlenie", SALON, 3.2, 2.3),

    // --- Kuchnia (2×3,5 m, mokra: wypusty AGD i płyta na osobnych zabezpieczeniach) ---
    // Blat idzie wzdłuż ściany zachodniej, stąd wszystkie wypusty AGD na x≈5,2.
    // Podwójne, nie potrójne: `gangs` to WARIANT gniazda (pojedyncze / podwójne),
    // a ramek wielokrotnych aplikacja nie modeluje — patrz `gniazdoPodwojne`.
    e("kuch-gn1", "gniazdko", KUCHNIA, 5.5, 0.2, { gangs: 2 }),
    e("kuch-gn2", "gniazdko", KUCHNIA, 6.5, 0.2, { gangs: 2 }),
    e("kuch-agd1", "wypustAGD", KUCHNIA, 5.2, 1.1, { dedicated: true, note: "Zmywarka" }),
    e("kuch-agd2", "wypustAGD", KUCHNIA, 5.2, 2, { dedicated: true, note: "Piekarnik" }),
    e("kuch-plyta", "gniazdko400", KUCHNIA, 5.2, 2.9, { dedicated: true, note: "Płyta indukcyjna" }),
    e("kuch-led", "tasmaLed", KUCHNIA, 6.8, 1.1, { note: "Podszafkowa" }),
    e("kuch-sw", "wlacznik", KUCHNIA, 6.8, 2.6),
    e("kuch-lampa", "oswietlenie", KUCHNIA, 6, 1.5),

    // --- Sypialnia (3×5 m) ---
    e("syp-gn1", "gniazdko", SYPIALNIA, 7.6, 0.2, { gangs: 2 }),
    e("syp-roleta", "roleta", SYPIALNIA, 8.6, 0.2),
    e("syp-gn2", "gniazdko", SYPIALNIA, 9.6, 0.2, { gangs: 2 }),
    e("syp-lan", "rj45", SYPIALNIA, 9.8, 1.6),
    e("syp-gn3", "gniazdko", SYPIALNIA, 9.8, 3.4),
    e("syp-sw", "sciemniacz", SYPIALNIA, 7.2, 3.3),
    e("syp-lampa", "oswietlenie", SYPIALNIA, 8.5, 2.3),

    // --- Pokój (6,5×2 m) ---
    e("pok-sw", "wlacznik", POKOJ, 4.6, 5.2),
    e("pok-gn1", "gniazdko", POKOJ, 3.7, 6.2),
    e("pok-gn2", "gniazdko", POKOJ, 6.5, 6.8, { gangs: 2 }),
    e("pok-lan", "rj45", POKOJ, 7.5, 6.8),
    e("pok-gn3", "gniazdko", POKOJ, 8.5, 6.8),
    e("pok-roleta", "roleta", POKOJ, 9.8, 6),
    e("pok-lampa", "oswietlenie", POKOJ, 7, 6),

    // --- Łazienka (2×3,5 m, mokra: osprzęt hermetyczny, łącznik dwubiegunowy, strefy) ---
    e("laz-umywalka", "umywalka", LAZIENKA, 0.4, 3.9),
    e("laz-went", "wentylator", LAZIENKA, 1.5, 3.7),
    e("laz-gn", "gniazdkoHerm", LAZIENKA, 1.8, 5.2),
    e("laz-sw", "wlacznikDwubiegunowy", LAZIENKA, 1.8, 6.1),
    e("laz-prysznic", "prysznic", LAZIENKA, 0.5, 6.4),
    e("laz-lampa", "oswietlenie", LAZIENKA, 1, 5),
  ];
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
