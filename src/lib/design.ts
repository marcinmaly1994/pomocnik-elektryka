/**
 * Czyste funkcje pomocnicze dla edytora planu (DesignTab w wersji JS).
 * Wydzielone spod store'a, żeby dobór koloru/nazwy nowego pomieszczenia
 * dało się przetestować bez montowania canvasu.
 */

/** Domyślny logiczny rozmiar planu i skok siatki — jak VB_DEFAULT/GRID w wersji JS.
 *  Domyślny, bo obszar planu jest teraz zapisywany w projekcie (`planSize` w store)
 *  i dopasowuje się do proporcji wgranego rzutu. */
export const DEFAULT_PLAN_WIDTH = 1000;
export const DEFAULT_PLAN_HEIGHT = 700;
export const GRID = 20;

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
/** Fallback w jednostkach planu, gdy nie ma ŻADNEJ skali (ani wgranego rzutu, ani
 *  `MANUAL_DRAW_SCALE_MPU`) — rzadki przypadek, bo tryb „Otwory" wymaga najpierw
 *  narysowanej ściany, a ściana zwykle idzie w parze z jakąś skalą. */
export const DEFAULT_OPENING_WIDTH_UNITS = 18;

/** Szerokość NOWYCH drzwi (jedn. planu), z uwzględnieniem bieżącej skali —
 *  centymetry, gdy skala jest znana, inaczej stały fallback. */
export function defaultOpeningWidth(metersPerUnit: number | null): number {
  if (metersPerUnit === null || !(metersPerUnit > 0)) return DEFAULT_OPENING_WIDTH_UNITS;
  return DEFAULT_DOOR_WIDTH_CM / 100 / metersPerUnit;
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

/** Skala kondygnacji (metrów na jednostkę planu) albo `null`, jeśli nie skalibrowana. */
export function scaleOf(scales: Record<string, number>, floorId: string): number | null {
  const v = scales[floorId];
  return typeof v === "number" && v > 0 ? v : null;
}
