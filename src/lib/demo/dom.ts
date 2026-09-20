import type { InstallationElement, Opening, RoomShape, Wall } from "@/types";
import { MANUAL_DRAW_SCALE_MPU, ROOM_COLORS } from "@/lib/design";
import { DEFAULT_PRICES } from "@/lib/costs";
import { INITIAL_ONBOARDING } from "@/lib/onboarding";
import { WARUNKI_DOBORU_DOMYSLNE } from "@/lib/panel/norms";
import type { ProjectPayload } from "@/store/useProjectStore";
import { p, przyklejDoScian, tworzE } from "./wspolne";

/**
 * Gotowy projekt przykładowy — dom jednorodzinny 136 m² na dwóch kondygnacjach.
 *
 * PO CO OBOK MIESZKANIA: mieszkanie stoi na jednej kondygnacji i jednej rozdzielnicy,
 * więc nie pokazuje ani przełączania pięter, ani pionów między nimi, ani podrozdzielnicy,
 * ani pomieszczeń gospodarczych z osobnymi obwodami, ani ładowarki samochodowej.
 *
 * CZEGO TEN PRZYKŁAD NIE OBIECUJE: zakładka Rozdzielnica nie zna pojęcia podrozdzielnicy
 * — `PanelTab` buduje JEDNĄ tablicę z obwodów całego budynku. Podrozdzielnica działa
 * w dwóch miejscach i tylko o nich mówi karta w oknie wyboru:
 *   — na RYSUNKU, bo `buildCableRoutes` dostaje elementy przefiltrowane po kondygnacji,
 *     więc piętro bez własnej rozdzielnicy nie ma ŻADNEJ trasy zasilania;
 *   — w KOSZTORYSIE, bo `estimateRoutes` nie dolicza wtedy pionu przez strop.
 *
 * KONDYGNACJE MAJĄ RÓŻNY OBRYS — piętra nie ma nad garażem. Tak buduje się domy
 * z garażem w bryle i przy okazji widać, że obrysy pięter nie muszą się pokrywać.
 *
 * SZEROKOŚĆ KORYTARZY to 1,5 m i nie jest to estetyka: obrys wchodzi do grafu tras
 * wsunięty o `ODSUNIECIE_TRASY` z każdej strony, więc z korytarza 1,0 m zostaje pasek
 * równy `MERGE_TOLERANCE` i obie jego krawędzie scalają się w jeden węzeł grafu.
 * Powód opisany szerzej w nagłówku `mieszkanie.ts`.
 *
 * Parter 10 × 8 m = 80 m²:
 *   Garaż 24 · Hol 16,5 · Salon 15,75 · Kuchnia 8,75 · Łazienka 6 · Pralnia 4,5 · Kotłownia 4,5
 * Piętro 7 × 8 m = 56 m² (nad x 3–10):
 *   Sypialnia 1 12,25 · Sypialnia 2 12,25 · Korytarz 10,5 · Sypialnia główna 10,5 · Łazienka 10,5
 */

export const PARTER = "f1";
export const PIETRO = "f2";

const eP = tworzE(PARTER);
const eG = tworzE(PIETRO);

const GARAZ = "Garaż";
const HOL = "Hol";
const SALON = "Salon";
const KUCHNIA = "Kuchnia";
const LAZIENKA_D = "Łazienka";
const PRALNIA = "Pralnia";
const KOTLOWNIA = "Kotłownia";

const SYP1 = "Sypialnia 1";
const SYP2 = "Sypialnia 2";
const SYP_GL = "Sypialnia główna";
const KORYTARZ = "Korytarz";
const LAZIENKA_G = "Łazienka na piętrze";

function sciany(): Wall[] {
  return [
    // --- Parter ---
    { id: "dom-w-obrys-p", floor: PARTER, points: [p(0, 0), p(10, 0), p(10, 8), p(0, 8), p(0, 0)] },
    { id: "dom-w-garaz", floor: PARTER, points: [p(3, 0), p(3, 8)] },
    { id: "dom-w-kuchnia-salon", floor: PARTER, points: [p(5.5, 0), p(5.5, 3.5)] },
    { id: "dom-w-dzienna-hol", floor: PARTER, points: [p(3, 3.5), p(10, 3.5)] },
    // Łamana zamykająca przedsionek i strefę techniczną: pion x=5 od ściany
    // zewnętrznej do korytarza, dalej poziom y=5 aż do ściany wschodniej.
    { id: "dom-w-hol-dol", floor: PARTER, points: [p(5, 8), p(5, 5), p(10, 5)] },
    { id: "dom-w-lazienka-pralnia", floor: PARTER, points: [p(7, 5), p(7, 8)] },
    { id: "dom-w-pralnia-kotlownia", floor: PARTER, points: [p(8.5, 5), p(8.5, 8)] },

    // --- Piętro (obrys węższy — nie ma go nad garażem) ---
    { id: "dom-w-obrys-g", floor: PIETRO, points: [p(3, 0), p(10, 0), p(10, 8), p(3, 8), p(3, 0)] },
    { id: "dom-w-syp1-syp2", floor: PIETRO, points: [p(6.5, 0), p(6.5, 3.5)] },
    { id: "dom-w-gora-korytarz", floor: PIETRO, points: [p(3, 3.5), p(10, 3.5)] },
    { id: "dom-w-korytarz-dol", floor: PIETRO, points: [p(3, 5), p(10, 5)] },
    { id: "dom-w-sypgl-lazienka", floor: PIETRO, points: [p(6.5, 5), p(6.5, 8)] },
  ];
}

function pomieszczenia(): RoomShape[] {
  return [
    // --- Parter ---
    { id: "dom-r-garaz", floor: PARTER, name: GARAZ, type: "garaz", color: ROOM_COLORS[7],
      points: [p(0, 0), p(3, 0), p(3, 8), p(0, 8)] },
    { id: "dom-r-kuchnia", floor: PARTER, name: KUCHNIA, type: "kuchnia", color: ROOM_COLORS[1],
      points: [p(3, 0), p(5.5, 0), p(5.5, 3.5), p(3, 3.5)] },
    { id: "dom-r-salon", floor: PARTER, name: SALON, type: "salon", color: ROOM_COLORS[0],
      points: [p(5.5, 0), p(10, 0), p(10, 3.5), p(5.5, 3.5)] },
    // Hol jest literą L: pas 1,5 m przez całą szerokość plus przedsionek 2 × 3 m
    // przy drzwiach wejściowych. Typ „inne" jest ŚWIADOMY — komunikacja nie jest ani
    // pokojem, ani pomieszczeniem mokrym, a `ZASTOSOWANIE` daje jej kubełek „nieznane",
    // więc jej gniazda nie wpadają na obwód z pokojami.
    { id: "dom-r-hol", floor: PARTER, name: HOL, type: "inne", color: ROOM_COLORS[2],
      points: [p(3, 3.5), p(10, 3.5), p(10, 5), p(5, 5), p(5, 8), p(3, 8)] },
    { id: "dom-r-lazienka", floor: PARTER, name: LAZIENKA_D, type: "lazienka", color: ROOM_COLORS[3],
      points: [p(5, 5), p(7, 5), p(7, 8), p(5, 8)] },
    { id: "dom-r-pralnia", floor: PARTER, name: PRALNIA, type: "pralnia", color: ROOM_COLORS[4],
      points: [p(7, 5), p(8.5, 5), p(8.5, 8), p(7, 8)] },
    { id: "dom-r-kotlownia", floor: PARTER, name: KOTLOWNIA, type: "kotlownia", color: ROOM_COLORS[5],
      points: [p(8.5, 5), p(10, 5), p(10, 8), p(8.5, 8)] },

    // --- Piętro ---
    { id: "dom-r-syp1", floor: PIETRO, name: SYP1, type: "sypialnia", color: ROOM_COLORS[4],
      points: [p(3, 0), p(6.5, 0), p(6.5, 3.5), p(3, 3.5)] },
    { id: "dom-r-syp2", floor: PIETRO, name: SYP2, type: "sypialnia", color: ROOM_COLORS[6],
      points: [p(6.5, 0), p(10, 0), p(10, 3.5), p(6.5, 3.5)] },
    { id: "dom-r-korytarz", floor: PIETRO, name: KORYTARZ, type: "inne", color: ROOM_COLORS[2],
      points: [p(3, 3.5), p(10, 3.5), p(10, 5), p(3, 5)] },
    { id: "dom-r-sypgl", floor: PIETRO, name: SYP_GL, type: "sypialnia", color: ROOM_COLORS[0],
      points: [p(3, 5), p(6.5, 5), p(6.5, 8), p(3, 8)] },
    { id: "dom-r-lazienka-g", floor: PIETRO, name: LAZIENKA_G, type: "lazienka", color: ROOM_COLORS[3],
      points: [p(6.5, 5), p(10, 5), p(10, 8), p(6.5, 8)] },
  ];
}

/** Drzwi. `angle` to kierunek ściany w tym miejscu: 0 — pozioma, π/2 — pionowa.
 *  `width` w jednostkach planu, czyli 18 jedn. = 90 cm.
 *
 *  Każde pomieszczenie ma drzwi do komunikacji — na parterze do Holu, na piętrze do
 *  Korytarza. Klatka schodowa nie potrzebuje otworu: kondygnacje łączy w modelu
 *  `pionMiedzyKondygnacjami`, a nie drzwi. */
function otwory(): Opening[] {
  const SZER = 18;
  const BRAMA = 48; // 2,4 m — brama garażowa
  const POZIOMA = 0;
  const PIONOWA = Math.PI / 2;
  return [
    // --- Parter ---
    { id: "dom-o-wejscie", floor: PARTER, wallId: "dom-w-obrys-p", ...p(4, 8), angle: POZIOMA, width: SZER, kind: "drzwi" },
    { id: "dom-o-brama", floor: PARTER, wallId: "dom-w-obrys-p", ...p(0, 4), angle: PIONOWA, width: BRAMA, kind: "drzwi" },
    { id: "dom-o-garaz", floor: PARTER, wallId: "dom-w-garaz", ...p(3, 4.25), angle: PIONOWA, width: SZER, kind: "drzwi" },
    { id: "dom-o-kuchnia", floor: PARTER, wallId: "dom-w-dzienna-hol", ...p(4.25, 3.5), angle: POZIOMA, width: SZER, kind: "drzwi" },
    { id: "dom-o-salon", floor: PARTER, wallId: "dom-w-dzienna-hol", ...p(7, 3.5), angle: POZIOMA, width: SZER, kind: "drzwi" },
    { id: "dom-o-lazienka", floor: PARTER, wallId: "dom-w-hol-dol", ...p(6, 5), angle: POZIOMA, width: SZER, kind: "drzwi" },
    { id: "dom-o-pralnia", floor: PARTER, wallId: "dom-w-hol-dol", ...p(7.75, 5), angle: POZIOMA, width: SZER, kind: "drzwi" },
    { id: "dom-o-kotlownia", floor: PARTER, wallId: "dom-w-hol-dol", ...p(9.25, 5), angle: POZIOMA, width: SZER, kind: "drzwi" },

    // --- Piętro ---
    { id: "dom-o-syp1", floor: PIETRO, wallId: "dom-w-gora-korytarz", ...p(4.75, 3.5), angle: POZIOMA, width: SZER, kind: "drzwi" },
    { id: "dom-o-syp2", floor: PIETRO, wallId: "dom-w-gora-korytarz", ...p(8.25, 3.5), angle: POZIOMA, width: SZER, kind: "drzwi" },
    { id: "dom-o-sypgl", floor: PIETRO, wallId: "dom-w-korytarz-dol", ...p(4.75, 5), angle: POZIOMA, width: SZER, kind: "drzwi" },
    { id: "dom-o-lazienka-g", floor: PIETRO, wallId: "dom-w-korytarz-dol", ...p(8.25, 5), angle: POZIOMA, width: SZER, kind: "drzwi" },
  ];
}

function elementy(): InstallationElement[] {
  return [
    // ===================== PARTER =====================

    // --- Hol (L: pas 1,5 m + przedsionek 2 × 3 m) ---
    // Rozdzielnica i szafka zaraz za drzwiami, na ścianie przedsionka. Para łączników
    // SCHODOWYCH: jeden przy wejściu, drugi na końcu korytarza — w domu to najbardziej
    // typowe miejsce na taki układ.
    eP("dom-rozdzielnica", "rozdzielnica", HOL, 3.2, 6.6),
    eP("dom-szafka", "szafkaTeletech", HOL, 3.2, 5.4),
    eP("dom-hol-gn", "gniazdko", HOL, 3.2, 7.6),
    eP("dom-hol-sw", "wlacznikSchodowy", HOL, 4.8, 6.6),
    eP("dom-hol-dzwonek", "dzwonek", HOL, 4.8, 5.4),
    eP("dom-hol-lampa", "oswietlenie", HOL, 4, 6.2),
    eP("dom-hol-zewn", "oswietlenieZewn", HOL, 4.7, 7.8, { note: "Nad wejściem" }),
    eP("dom-kor-lampa", "oswietlenie", HOL, 7, 4.25),
    eP("dom-kor-sw", "wlacznikSchodowy", HOL, 9.8, 4.25),
    eP("dom-kor-gn", "gniazdko", HOL, 5.5, 3.7),
    eP("dom-hol-dym", "czujnikDymu", HOL, 5.5, 4.6),

    // --- Garaż ---
    eP("dom-ev", "ladowarkaEV", GARAZ, 0.25, 1.5, { dedicated: true, note: "Ładowarka EV" }),
    eP("dom-garaz-zewn", "oswietlenieZewn", GARAZ, 0.25, 0.6, { note: "Nad bramą" }),
    // Zwykłe (niehermetyczne, niededykowane) gniazdo warsztatowe — jedyny punkt w domu,
    // który realnie pokazuje regułę ZASTOSOWANIE: garaż jest suchy, więc jego zwykłe
    // gniazda idą osobnym obwodem od zwykłych gniazd mieszkalnych, mimo że oba
    // pomieszczenia są suche. Kotłownia i pralnia tego NIE pokazują — są mokre
    // (patrz `WET_ROOM_TYPES`), więc ich gniazda separuje wcześniejsza reguła `byRoom`.
    eP("dom-garaz-gn3", "gniazdko", GARAZ, 2.75, 1.5, { note: "Warsztatowe" }),
    eP("dom-garaz-gn1", "gniazdkoHerm", GARAZ, 0.25, 6.5),
    eP("dom-garaz-gn2", "gniazdkoHerm", GARAZ, 2.75, 6.5),
    eP("dom-garaz-sw", "wlacznik", GARAZ, 2.75, 3.3),
    eP("dom-garaz-lampa1", "oswietlenie", GARAZ, 1.5, 2),
    eP("dom-garaz-lampa2", "oswietlenie", GARAZ, 1.5, 6),

    // --- Kuchnia (mokra) ---
    eP("dom-kuch-gn1", "gniazdko", KUCHNIA, 3.5, 0.25, { gangs: 2 }),
    eP("dom-kuch-gn2", "gniazdko", KUCHNIA, 4.5, 0.25, { gangs: 2 }),
    eP("dom-kuch-led", "tasmaLed", KUCHNIA, 5.25, 0.8, { note: "Podszafkowa" }),
    eP("dom-kuch-agd1", "wypustAGD", KUCHNIA, 5.25, 1.8, { dedicated: true, note: "Zmywarka" }),
    eP("dom-kuch-agd2", "wypustAGD", KUCHNIA, 5.25, 2.8, { dedicated: true, note: "Piekarnik" }),
    eP("dom-kuch-plyta", "gniazdko400", KUCHNIA, 3.25, 1.5, { dedicated: true, note: "Płyta indukcyjna" }),
    eP("dom-kuch-sw", "wlacznik", KUCHNIA, 3.25, 3.2),
    eP("dom-kuch-lampa", "oswietlenie", KUCHNIA, 4.3, 1.8),

    // --- Salon ---
    eP("dom-salon-gn1", "gniazdko", SALON, 6.2, 0.25, { gangs: 2 }),
    eP("dom-salon-roleta", "roleta", SALON, 7.2, 0.25),
    eP("dom-salon-gn2", "gniazdko", SALON, 8.2, 0.25),
    eP("dom-salon-tv", "rtvsat", SALON, 9.2, 0.25),
    eP("dom-salon-gn3", "gniazdko", SALON, 9.75, 1.5, { gangs: 2 }),
    eP("dom-salon-lan", "rj45", SALON, 9.75, 2.4),
    eP("dom-salon-gn4", "gniazdko", SALON, 5.75, 2.4),
    eP("dom-salon-sw", "sciemniacz", SALON, 7.9, 3.25),
    eP("dom-salon-lampa1", "oswietlenie", SALON, 7, 1.4),
    eP("dom-salon-lampa2", "oswietlenie", SALON, 8.6, 2.2),

    // --- Łazienka na parterze (mokra: hermetyczne, łącznik dwubiegunowy, strefy) ---
    eP("dom-laz-went", "wentylator", LAZIENKA_D, 6.7, 5.25),
    eP("dom-laz-gn", "gniazdkoHerm", LAZIENKA_D, 6.75, 6.2),
    eP("dom-laz-sw", "wlacznikDwubiegunowy", LAZIENKA_D, 6.75, 7.1),
    eP("dom-laz-lampa", "oswietlenie", LAZIENKA_D, 5.9, 6.6),
    eP("dom-laz-umywalka", "umywalka", LAZIENKA_D, 5.4, 5.6),
    eP("dom-laz-prysznic", "prysznic", LAZIENKA_D, 5.5, 7.5),

    // --- Pralnia (gospodarcza) ---
    eP("dom-pralka", "wypustAGD", PRALNIA, 8.25, 6, { dedicated: true, note: "Pralka" }),
    eP("dom-pralnia-gn", "gniazdkoHerm", PRALNIA, 8.25, 7),
    eP("dom-pralnia-sw", "wlacznik", PRALNIA, 7.25, 5.6),
    eP("dom-pralnia-lampa", "oswietlenie", PRALNIA, 7.6, 6.5),

    // --- Kotłownia (gospodarcza) ---
    eP("dom-kociol", "wypustAGD", KOTLOWNIA, 9.75, 6, { dedicated: true, note: "Kocioł gazowy" }),
    eP("dom-kotlownia-gn", "gniazdkoHerm", KOTLOWNIA, 9.75, 7),
    eP("dom-kotlownia-sw", "wlacznik", KOTLOWNIA, 8.75, 5.6),
    eP("dom-kotlownia-lampa", "oswietlenie", KOTLOWNIA, 9.1, 6.5),

    // ===================== PIĘTRO =====================

    // --- Korytarz: PODROZDZIELNICA ---
    // Bez niej piętro nie dostałoby ani jednej trasy zasilania na rzucie
    // (`buildCableRoutes` szuka rozdzielnicy TEJ kondygnacji), a kosztorys doliczałby
    // pion przez strop do każdego obwodu.
    eG("dom-podrozdzielnica", "rozdzielnica", KORYTARZ, 3.25, 4.25),
    eG("dom-g-kor-lampa1", "oswietlenie", KORYTARZ, 5.5, 4.25),
    eG("dom-g-kor-lampa2", "oswietlenie", KORYTARZ, 8.5, 4.25),
    eG("dom-g-kor-sw1", "wlacznikSchodowy", KORYTARZ, 6.2, 3.7),
    eG("dom-g-kor-sw2", "wlacznikSchodowy", KORYTARZ, 9.75, 4.25),
    eG("dom-g-kor-gn", "gniazdko", KORYTARZ, 7, 3.7),
    eG("dom-g-kor-dym", "czujnikDymu", KORYTARZ, 6.6, 4.6),

    // --- Sypialnia 1 ---
    eG("dom-syp1-gn1", "gniazdko", SYP1, 3.7, 0.25, { gangs: 2 }),
    eG("dom-syp1-roleta", "roleta", SYP1, 4.7, 0.25),
    eG("dom-syp1-gn2", "gniazdko", SYP1, 5.7, 0.25, { gangs: 2 }),
    eG("dom-syp1-lan", "rj45", SYP1, 6.25, 1.5),
    eG("dom-syp1-sw", "sciemniacz", SYP1, 5.6, 3.25),
    eG("dom-syp1-lampa", "oswietlenie", SYP1, 4.7, 1.7),

    // --- Sypialnia 2 ---
    eG("dom-syp2-gn1", "gniazdko", SYP2, 7.2, 0.25, { gangs: 2 }),
    eG("dom-syp2-roleta", "roleta", SYP2, 8.2, 0.25),
    eG("dom-syp2-gn2", "gniazdko", SYP2, 9.2, 0.25, { gangs: 2 }),
    eG("dom-syp2-sw", "wlacznik", SYP2, 9.3, 3.25),
    eG("dom-syp2-lampa", "oswietlenie", SYP2, 8.2, 1.7),

    // --- Sypialnia główna ---
    eG("dom-sypgl-gn1", "gniazdko", SYP_GL, 3.7, 7.75, { gangs: 2 }),
    eG("dom-sypgl-roleta", "roleta", SYP_GL, 4.7, 7.75),
    eG("dom-sypgl-gn2", "gniazdko", SYP_GL, 5.7, 7.75, { gangs: 2 }),
    eG("dom-sypgl-lan", "rj45", SYP_GL, 6.25, 6.5),
    eG("dom-sypgl-sw", "sciemniacz", SYP_GL, 5.6, 5.25),
    eG("dom-sypgl-lampa", "oswietlenie", SYP_GL, 4.8, 6.4),

    // --- Łazienka na piętrze (mokra, z wanną) ---
    eG("dom-lazg-went", "wentylator", LAZIENKA_G, 7.1, 5.25),
    eG("dom-lazg-gn", "gniazdkoHerm", LAZIENKA_G, 9.75, 6.2),
    eG("dom-lazg-sw", "wlacznikDwubiegunowy", LAZIENKA_G, 9.75, 7.2),
    eG("dom-lazg-lampa", "oswietlenie", LAZIENKA_G, 8.5, 6.6),
    eG("dom-lazg-umywalka", "umywalka", LAZIENKA_G, 6.9, 6.3),
    eG("dom-lazg-wanna", "wanna", LAZIENKA_G, 7.2, 7.4),
  ];
}

export function zbudujProjektDom(): ProjectPayload {
  const walls = sciany();
  const roomShapes = pomieszczenia();
  // PRZYKLEJANIE OSOBNO DLA KAŻDEJ KONDYGNACJI — `snapElementToWall` nie wie nic
  // o piętrach i dostając ściany całego budynku przykleiłaby gniazdo z piętra do
  // ściany parteru, która akurat leży bliżej.
  const elements = [PARTER, PIETRO].flatMap((f) =>
    przyklejDoScian(
      elementy().filter((e) => e.floor === f),
      walls.filter((w) => w.floor === f),
      roomShapes.filter((r) => r.floor === f)
    )
  );
  return {
    draft: { elements, walls, roomShapes, openings: otwory(), routeOverrides: {} },
    floors: [
      { id: PARTER, name: "Parter", heightM: 2.8 },
      { id: PIETRO, name: "Piętro", heightM: 2.6 },
    ],
    activeFloorId: PARTER,
    bgImages: {},
    scales: { [PARTER]: MANUAL_DRAW_SCALE_MPU, [PIETRO]: MANUAL_DRAW_SCALE_MPU },
    prices: { ...DEFAULT_PRICES },
    costOverrides: {},
    qtyOverrides: {},
    warunkiDoboru: WARUNKI_DOBORU_DOMYSLNE,
    docHeader: {
      obiekt: "Dom jednorodzinny przykładowy, 136 m²",
      adres: "", zleceniodawca: "", wykonawca: "", uprawnienia: "", przyrzad: "",
      nrFabryczny: "", swiadectwo: "",
      data: new Date().toISOString().slice(0, 10),
      temperatura: "20", wilgotnosc: "55", uklad: "TN-S",
      drawingNo: "E-01", revision: "A",
    },
    protocols: {},
    projectName: "Przykład: dom 136 m²",
    panelConfig: { supply3f: true, mainRating: 40, perRow: 12 },
    panelDevices: [],
    panelHidden: [],
    panelTryb: "zRzutu",
    panelOverrides: {},
    planSize: { w: 240, h: 200 },
    onboarding: { ...INITIAL_ONBOARDING, krok1Done: true, krok2Done: true, krok3Done: true, pominiety: true, ostatnioOtwarty: false },
    projektPrzykladowy: true,
  };
}
