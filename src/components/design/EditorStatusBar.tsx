import { Layers } from "lucide-react";
import type { Point, RoomShape } from "@/types";
import { polygonAreaM2 } from "@/lib/geometry";
import { SaveIndicator } from "@/components/ui/SaveIndicator";

/**
 * Pasek stanu pod płótnem: powierzchnia, liczba elementów, skala, pozycja kursora
 * i stan zapisu.
 *
 * Wszystkie te liczby dało się wcześniej wyczytać najwyżej pośrednio (albo wcale),
 * a to one mówią użytkownikowi, czy projekt idzie w dobrą stronę — stąd stałe
 * miejsce na dole, a nie rozsypane po zakładkach.
 */

export interface EditorStatusBarProps {
  floorName: string;
  roomShapes: RoomShape[];
  elementCount: number;
  metersPerUnit: number | null;
  /** Pozycja kursora w jednostkach planu; `null`, gdy poza planem. */
  cursor: Point | null;
  /** Czy nad prawym końcem paska wisi pływająca pigułka „Dalej" z App.tsx — wtedy
   *  pasek zostawia jej zapas, żeby nie chowała pod sobą wskaźnika zapisu. W pełnym
   *  ekranie pigułki nie ma (leży pod nakładką edytora), więc zapas byłby wtedy tylko
   *  pustą dziurą po prawej. */
  zapasNaNawigacje?: boolean;
}

/** Suma powierzchni obrysowanych pomieszczeń [m²]. `null` bez kalibracji skali. */
export function totalRoomAreaM2(roomShapes: RoomShape[], metersPerUnit: number | null): number | null {
  if (metersPerUnit === null || !(metersPerUnit > 0)) return null;
  let sum = 0;
  for (const r of roomShapes) {
    const a = polygonAreaM2(r.points, metersPerUnit);
    if (a !== null) sum += a;
  }
  return sum;
}

function fmt(v: number, digits = 2): string {
  return v.toFixed(digits).replace(".", ",");
}

export function EditorStatusBar({
  floorName,
  roomShapes,
  elementCount,
  metersPerUnit,
  cursor,
  zapasNaNawigacje = false,
}: EditorStatusBarProps) {
  const area = totalRoomAreaM2(roomShapes, metersPerUnit);

  return (
    <div
      role="status"
      aria-label="Stan projektu"
      // `md:pr-48`: pasek stoi tuż pod płótnem, a płótno kończy się dokładnie nad pasmem
      // pływającej pigułki „Dalej" (patrz `PASMO_NAWIGACJI_PX`) — czyli pigułka ląduje
      // nad PRAWYM KOŃCEM tego paska. Bez zapasu chowałaby pod sobą wskaźnik zapisu,
      // który `ml-auto` wypycha dokładnie tam. Tylko od `md` w górę: poniżej tego progu
      // pigułki w ogóle nie ma (patrz jej klasa `md:flex` w App.tsx).
      className={`mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-card border border-border bg-white px-3.5 py-2 text-[11.5px] text-slate-500${
        zapasNaNawigacje ? " md:pr-48" : ""
      }`}
    >
      <span className="flex items-center gap-1.5 font-medium text-slate-600">
        <Layers size={13} className="text-slate-400" /> {floorName}
      </span>

      <span>
        Powierzchnia:{" "}
        <span className="pe-mono text-slate-700">
          {area === null ? "— (brak skali)" : `${fmt(area)} m²`}
        </span>
      </span>

      <span>
        Elementy: <span className="pe-mono text-slate-700">{elementCount}</span>
      </span>

      <span>
        Skala:{" "}
        <span className="pe-mono text-slate-700">
          {metersPerUnit === null ? "nieustawiona" : `1 jedn. = ${fmt(metersPerUnit * 100)} cm`}
        </span>
      </span>

      {/* Współrzędne kursora liczone od lewego górnego rogu planu. Pokazywane tylko
          nad planem — poza nim nie ma czego mierzyć, a zamrożona ostatnia wartość
          wyglądałaby jak zawieszony odczyt. */}
      <span className="pe-mono tabular-nums">
        {cursor && metersPerUnit !== null
          ? `X: ${fmt(cursor.x * metersPerUnit)} m   Y: ${fmt(cursor.y * metersPerUnit)} m`
          : cursor
            ? `X: ${Math.round(cursor.x)}   Y: ${Math.round(cursor.y)} jedn.`
            : "X: —   Y: —"}
      </span>

      <span className="ml-auto">
        <SaveIndicator compact />
      </span>
    </div>
  );
}
