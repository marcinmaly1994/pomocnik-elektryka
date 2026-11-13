import type { InstallationElement, ElementType, PanelDevice, RoomShape, Wall } from "@/types";
import { MANUAL_DRAW_SCALE_MPU, WALL_SNAP_TOLERANCE_M } from "@/lib/design";
import { przyscienny, snapElementToWall } from "@/lib/wallSnap";
import { DEFAULT_ELEMENT_SCALE, elementRenderScale } from "@/lib/symbolScale";
import { DEFAULT_PRICES } from "@/lib/costs";
import { INITIAL_ONBOARDING } from "@/lib/onboarding";
import { WARUNKI_DOBORU_DOMYSLNE } from "@/lib/panel/norms";
import type { ProjectPayload } from "@/store/useProjectStore";

/** Lewy górny róg budynku w jednostkach planu. */
const X0 = 20;
const Y0 = 20;
/** Jednostki planu na metr — patrz `MANUAL_DRAW_SCALE_MPU` (0,05 m na jednostkę). */
const M = 20;

/** Punkt z METRÓW liczonych od narożnika budynku — cały rysunek przykładów jest w nich,
 *  bo „ściana na 5 m" czyta się, a „ściana na 200" trzeba przeliczać w głowie. */
export const p = (mx: number, my: number) => ({ x: X0 + mx * M, y: Y0 + my * M });

/**
 * Skrót na element, ZWIĄZANY Z KONDYGNACJĄ.
 *
 * Fabryka, a nie funkcja z dodatkowym argumentem: przykład na dwóch kondygnacjach ma
 * dwie długie listy elementów i wpisywanie `"f1"` przy każdej z pięćdziesięciu pozycji
 * byłoby pięćdziesięcioma okazjami do literówki, której nic by nie wyłapało poza testem
 * „wszystko na zadeklarowanej kondygnacji".
 *
 * Reszta pól to wartości domyślne, identyczne z tymi, które nadaje `addElement`
 * w store'rze przy stawianiu klikiem.
 */
export function tworzE(floor: string) {
  return function e(
    id: string,
    type: ElementType,
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
      floor,
      dedicated: false,
      note: "",
      gangs: 1,
      ...extra,
    };
  };
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
 *
 * WYWOŁUJ OSOBNO DLA KAŻDEJ KONDYGNACJI, na jej własnych ścianach i obrysach.
 * `snapElementToWall` nie wie nic o piętrach — dostając ściany całego budynku,
 * przykleiłaby gniazdo z piętra do ściany parteru, która akurat leży bliżej.
 */
export function przyklejDoScian(
  elements: InstallationElement[],
  walls: Wall[],
  rooms: RoomShape[]
): InstallationElement[] {
  const skala = elementRenderScale(MANUAL_DRAW_SCALE_MPU, DEFAULT_ELEMENT_SCALE, DEFAULT_ELEMENT_SCALE);
  const tolerancja = WALL_SNAP_TOLERANCE_M / MANUAL_DRAW_SCALE_MPU;
  return elements.map((el) => {
    if (!przyscienny(el.type)) return el;
    const m = snapElementToWall({ x: el.x, y: el.y }, walls, rooms, tolerancja, el.type, skala);
    return m ? { ...el, x: m.x, y: m.y, rotation: m.rotation } : el;
  });
}

/**
 * Wszystko, co w KAŻDYM przykładzie jest takie samo — od cennika po znacznik
 * `projektPrzykladowy`. Plik przykładu podaje tylko to, czym się od innych różni:
 * rysunek, listę kondygnacji i trzy napisy.
 *
 * PO CO: ten ogon payloadu miał dwie kopie, jedna w `mieszkanie.ts`, druga
 * w `dom.ts`. Obie były już wtedy identyczne co do wartości i różniły się wyłącznie
 * łamaniem wierszy, a każde nowe pole `ProjectPayload` trzeba było dopisywać w obu —
 * z tym, że pominięcie jednej kopii NIE jest błędem typu, jeśli pole ma wartość
 * domyślną albo jest opcjonalne. Przykład po prostu otwierałby się inaczej niż drugi.
 *
 * `activeFloorId` bierze się z PIERWSZEJ kondygnacji z listy, bo przykład ma się
 * otwierać na tej, od której się go czyta — parterze. Skalę dostaje KAŻDA kondygnacja
 * z listy: bez wpisu w `scales` piętro renderowałoby się w skali domyślnej, czyli
 * w innym rozmiarze niż parter, a widać to dopiero po przełączeniu zakładki.
 */
export function bazaPayloadu(opis: {
  draft: ProjectPayload["draft"];
  floors: ProjectPayload["floors"];
  /** Nazwa projektu — ta z paska u góry i z listy projektów. */
  projectName: string;
  /** Pole „obiekt" w nagłówku dokumentów (protokoły, PDF). */
  obiekt: string;
  /** Arkusz, na którym rysunek powstał — patrz `planSize` w nagłówkach przykładów. */
  planSize: ProjectPayload["planSize"];
  /**
   * Ogranicznik przepięć przykładu — jako aparat RĘCZNY, tak jak doda go użytkownik
   * („Dodaj aparat ręcznie"). Automat celowo SPD nie dokłada (patrz `buildPanelDevices`),
   * ale przykład pokazowy nie może witać ostrzeżeniem „Brak ogranicznika przepięć"
   * (przegląd 12.11.2026, pkt 4).
   */
  spd: { klasa: "T1+T2" | "T2" };
}): ProjectPayload {
  return {
    draft: opis.draft,
    floors: opis.floors,
    activeFloorId: opis.floors[0].id,
    // Bez podkładu: to data URL, czyli setki kilobajtów base64 w paczce i w każdym
    // autozapisie. Przykłady stoją na czystej siatce w skali `MANUAL_DRAW_SCALE_MPU`.
    bgImages: {},
    scales: Object.fromEntries(opis.floors.map((f) => [f.id, MANUAL_DRAW_SCALE_MPU])),
    prices: { ...DEFAULT_PRICES },
    costOverrides: {},
    qtyOverrides: {},
    warunkiDoboru: WARUNKI_DOBORU_DOMYSLNE,
    docHeader: {
      obiekt: opis.obiekt,
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
    projectName: opis.projectName,
    panelConfig: { supply3f: true, mainRating: 40, perRow: 12 },
    // Rozdzielnica ma się ODBUDOWAĆ z obwodów policzonych z rzutu — o to w przykładzie
    // chodzi. Stąd tryb „z rzutu" i pusta lista aparatów: gotowa lista zamrażałaby
    // wynik doboru z dnia, w którym powstał plik z danymi.
    // Aparaty z obwodów odbudują się same w trybie „z rzutu"; zostaje tylko ręczny SPD,
    // który odbudowa zachowuje (patrz efekt w PanelTab.tsx).
    panelDevices: [ogranicznikPrzepiec(opis.spd.klasa)],
    panelHidden: [],
    panelTryb: "zRzutu",
    panelOverrides: {},
    planSize: opis.planSize,
    // Przewodnik „Zacznij w 3 krokach" jest na gotowym projekcie bezprzedmiotowy —
    // wszystkie trzy kroki są w nim z definicji wykonane (jest skala, są nazwane
    // pomieszczenia, stoją elementy), a `reconcile` i tak by je odhaczyło z faktów.
    onboarding: { ...INITIAL_ONBOARDING, krok1Done: true, krok2Done: true, krok3Done: true, pominiety: true, ostatnioOtwarty: false },
    projektPrzykladowy: true,
  };
}

/** Ogranicznik przepięć 3-fazowy (4 moduły), w tej samej postaci co aparat dodany ręcznie w Rozdzielnicy. */
function ogranicznikPrzepiec(klasa: "T1+T2" | "T2"): PanelDevice {
  return {
    uid: "manual-1",
    kind: "spd",
    manual: true,
    // „F0": przed wyłącznikami obwodów F1…Fn, bo SPD stoi zaraz za rozłącznikiem
    // głównym — i nie koliduje z numeracją, którą automat nadaje obwodom.
    tag: "F0",
    modules: 4,
    label: klasa,
    caption: "Ogranicznik przepięć (SPD)",
    poles: "4P",
    phase: "3F",
  };
}
