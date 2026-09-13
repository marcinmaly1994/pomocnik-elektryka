import { Palette, PenLine, Trash2 } from "lucide-react";
import type { RoomShape, RoomType } from "@/types";
import { ROOM_TYPE_LABELS } from "@/lib/design";
import { polygonAreaM2 } from "@/lib/geometry";
import { useProjectStore } from "@/store/useProjectStore";

interface RoomPanelProps {
  roomShapes: RoomShape[];
  /** Metrów na jednostkę planu, z kalibracji skali — `null` bez kalibracji, wtedy
   *  powierzchni się nie pokazuje zamiast liczyć ją z przypadkowego przelicznika. */
  metersPerUnit: number | null;
  /** Tworzy ścianę o kształcie identycznym z obrysem tego pomieszczenia — dla planów,
   *  które zaczęły się od samego obrysu pomieszczenia, bez osobno narysowanych ścian
   *  (patrz komentarz przy `createWallFromRoom` w DesignTab.tsx). */
  onCreateWall: (roomId: string) => void;
}

/** Lista pomieszczeń narysowanych na bieżącej kondygnacji — zmiana nazwy, typu, koloru,
 *  usuwanie. Korzysta z akcji store'a (renameRoomShape/setRoomShapeType/recolorRoomShape/
 *  deleteRoomShape). Typ pomieszczenia (kuchnia/łazienka/pralnia/kotłownia) decyduje o
 *  grupowaniu obwodów gniazd i strefie mokrej w doborze przewodu — patrz `isWetRoomName`
 *  w lib/design.ts — więc daje się poprawić także PO nazwaniu, nie tylko w oknie
 *  „Nazwij pomieszczenie" przy rysowaniu. */
export function RoomPanel({ roomShapes, metersPerUnit, onCreateWall }: RoomPanelProps) {
  const renameRoomShape = useProjectStore((s) => s.renameRoomShape);
  const setRoomShapeType = useProjectStore((s) => s.setRoomShapeType);
  const recolorRoomShape = useProjectStore((s) => s.recolorRoomShape);
  const deleteRoomShape = useProjectStore((s) => s.deleteRoomShape);

  if (roomShapes.length === 0) {
    // Na pustej kondygnacji panel otwiera się WŁAŚNIE TUTAJ (patrz `zakladkaPanelu`
    // w lib/panelBoczny.ts), więc to jest pierwsze zdanie, jakie czyta nowy użytkownik
    // w kolumnie narzędzi. Samo „Brak pomieszczeń na tej kondygnacji." stwierdzało
    // fakt i nie mówiło ani po co je rysować, ani co się stanie, jeśli się tego nie
    // zrobi — a od pomieszczenia zależą rzeczy, których po nim nie widać.
    return (
      <p className="text-xs leading-snug text-slate-400">
        Brak pomieszczeń na tej kondygnacji. Obrysuj je i nazwij, żeby osprzęt trafiał do właściwego pokoju —
        od tego zależy podział na obwody, a w kuchni i łazience także strefy ochronne.
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      {roomShapes.map((r) => {
        const areaM2 = polygonAreaM2(r.points, metersPerUnit);
        return (
        <div key={r.id} className="space-y-1.5 rounded-md border border-border bg-white p-2">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: r.color }} />
            <input
              className="pe-input min-w-0 flex-1 text-xs"
              defaultValue={r.name}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== r.name) renameRoomShape(r.id, v);
                else e.target.value = r.name;
              }}
            />
            {areaM2 !== null && (
              <span className="pe-mono shrink-0 text-[11px] text-slate-500" title="Powierzchnia pomieszczenia">
                {areaM2.toFixed(1)} m²
              </span>
            )}
            <button
              onClick={() => onCreateWall(r.id)}
              className="text-slate-400 hover:text-blueprint"
              title="Utwórz ścianę z obrysu — przyda się, jeśli to pomieszczenie nie ma jeszcze osobno narysowanej ściany. Jeśli już ma, doda drugą, nachodzącą."
            >
              <PenLine size={14} />
            </button>
            <button onClick={() => recolorRoomShape(r.id)} className="text-slate-400 hover:text-blueprint" title="Zmień kolor">
              <Palette size={14} />
            </button>
            <button onClick={() => deleteRoomShape(r.id)} className="text-slate-400 hover:text-red-500" title="Usuń pomieszczenie">
              <Trash2 size={14} />
            </button>
          </div>
          <select
            className="pe-input w-full text-xs"
            value={r.type ?? "inne"}
            onChange={(e) => setRoomShapeType(r.id, e.target.value as RoomType)}
            title="Typ pomieszczenia"
          >
            {(Object.entries(ROOM_TYPE_LABELS) as [RoomType, string][]).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        );
      })}
    </div>
  );
}
