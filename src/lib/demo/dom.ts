import type { InstallationElement, Opening, RoomShape, Wall } from "@/types";
import { MANUAL_DRAW_SCALE_MPU, ROOM_COLORS } from "@/lib/design";
import { DEFAULT_PRICES } from "@/lib/costs";
import { INITIAL_ONBOARDING } from "@/lib/onboarding";
import { WARUNKI_DOBORU_DOMYSLNE } from "@/lib/panel/norms";
import type { ProjectPayload } from "@/store/useProjectStore";
import { p, przyklejDoScian } from "./wspolne";

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

// eP/eG (z `tworzE`) nie są tu jeszcze potrzebne — ten przykład dostaje osprzęt
// dopiero w kolejnych zadaniach, a `noUnusedLocals` nie wybacza deklaracji na zapas.

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
  return [];
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
