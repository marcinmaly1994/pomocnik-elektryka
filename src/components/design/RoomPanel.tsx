import { Palette, Trash2 } from "lucide-react";
import type { RoomShape } from "@/types";
import { useProjectStore } from "@/store/useProjectStore";

interface RoomPanelProps {
  roomShapes: RoomShape[];
}

/** Lista pomieszczeń narysowanych na bieżącej kondygnacji — zmiana nazwy, koloru, usuwanie.
 *  Korzysta z akcji store'a (renameRoomShape/recolorRoomShape/deleteRoomShape). */
export function RoomPanel({ roomShapes }: RoomPanelProps) {
  const renameRoomShape = useProjectStore((s) => s.renameRoomShape);
  const recolorRoomShape = useProjectStore((s) => s.recolorRoomShape);
  const deleteRoomShape = useProjectStore((s) => s.deleteRoomShape);

  if (roomShapes.length === 0) {
    return <div className="text-xs text-slate-400">Brak pomieszczeń na tej kondygnacji — narysuj je narzędziem „Pomieszczenie”.</div>;
  }

  return (
    <div className="space-y-1.5">
      {roomShapes.map((r) => (
        <div key={r.id} className="flex items-center gap-2 rounded-md border border-border bg-white p-2">
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
          <button onClick={() => recolorRoomShape(r.id)} className="text-slate-400 hover:text-blueprint" title="Zmień kolor">
            <Palette size={14} />
          </button>
          <button onClick={() => deleteRoomShape(r.id)} className="text-slate-400 hover:text-red-500" title="Usuń pomieszczenie">
            <Trash2 size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
