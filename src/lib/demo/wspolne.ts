import type { InstallationElement, ElementType, RoomShape, Wall } from "@/types";
import { MANUAL_DRAW_SCALE_MPU, WALL_SNAP_TOLERANCE_M } from "@/lib/design";
import { przyscienny, snapElementToWall } from "@/lib/wallSnap";
import { DEFAULT_ELEMENT_SCALE, elementRenderScale } from "@/lib/symbolScale";

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
