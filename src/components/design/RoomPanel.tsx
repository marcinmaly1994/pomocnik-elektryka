import { Palette, PenLine, Trash2 } from "lucide-react";
import { formatLiczba } from "@/lib/liczby";
import type { RoomShape, RoomType } from "@/types";
import { ROOM_TYPE_LABELS } from "@/lib/design";
import { polygonAreaM2 } from "@/lib/geometry";
import { useProjectStore } from "@/store/useProjectStore";
import { Button } from "@/components/ui/button";

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
  if (roomShapes.length === 0) {
    // To pierwsze zdanie, jakie widzi ktoś, kto sięgnął po „Narysuj pomieszczenie" na
    // pustej kondygnacji. Samo „Brak pomieszczeń na tej kondygnacji." stwierdzało
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
      {roomShapes.map((r) => (
        <WierszPomieszczenia key={r.id} room={r} metersPerUnit={metersPerUnit} onCreateWall={onCreateWall} />
      ))}
    </div>
  );
}

/**
 * Jedno pomieszczenie do edycji: nazwa, powierzchnia, typ i akcje.
 *
 * Wspólne dla listy pomieszczeń i dla karty ZAZNACZONEGO pomieszczenia w „Zaznacz"
 * (patrz `KartaPomieszczenia`) — żeby oba miejsca zmieniały nazwę i typ tak samo.
 * W karcie akcje mają podpisy (`podpisy`), bo stoją tam same, a nie w gęstej liście.
 */
export function WierszPomieszczenia({
  room: r,
  metersPerUnit,
  onCreateWall,
  podpisy = false,
  onUsuniete,
}: {
  room: RoomShape;
  metersPerUnit: number | null;
  onCreateWall: (roomId: string) => void;
  podpisy?: boolean;
  /** Po usunięciu — karta zaznaczenia zdejmuje wtedy zaznaczenie nieistniejącego pokoju. */
  onUsuniete?: () => void;
}) {
  const renameRoomShape = useProjectStore((s) => s.renameRoomShape);
  const setRoomShapeType = useProjectStore((s) => s.setRoomShapeType);
  const recolorRoomShape = useProjectStore((s) => s.recolorRoomShape);
  const deleteRoomShape = useProjectStore((s) => s.deleteRoomShape);
  const areaM2 = polygonAreaM2(r.points, metersPerUnit);
  const ikona = "text-slate-400 hover:text-blueprint [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-9 flex items-center justify-center";
  const przycisk = "[@media(pointer:coarse)]:min-h-11";
  const tytulSciany =
    "Utwórz ścianę z obrysu — przyda się, jeśli to pomieszczenie nie ma jeszcze osobno narysowanej ściany. Jeśli już ma, doda drugą, nachodzącą.";

  return (
    <div className="space-y-1.5 rounded-md border border-border bg-white p-2">
      <div className="flex items-center gap-2">
        <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: r.color }} />
        <input
          className="pe-input min-w-0 flex-1 text-xs"
          defaultValue={r.name}
          aria-label="Nazwa pomieszczenia"
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v && v !== r.name) renameRoomShape(r.id, v);
            else e.target.value = r.name;
          }}
        />
        {areaM2 !== null && (
          <span className="pe-mono shrink-0 text-xs text-slate-500" title="Powierzchnia pomieszczenia">
            {formatLiczba(areaM2, 1)} m²
          </span>
        )}
        {!podpisy && (
          <>
            <button onClick={() => onCreateWall(r.id)} className={ikona} title={tytulSciany} aria-label={`Utwórz ścianę z obrysu: ${r.name}`}>
              <PenLine size={14} />
            </button>
            <button onClick={() => recolorRoomShape(r.id)} className={ikona} title="Zmień kolor" aria-label={`Zmień kolor: ${r.name}`}>
              <Palette size={14} />
            </button>
            <button
              onClick={() => deleteRoomShape(r.id)}
              className={`${ikona} hover:text-red-500`}
              title="Usuń pomieszczenie"
              aria-label={`Usuń pomieszczenie: ${r.name}`}
            >
              <Trash2 size={14} />
            </button>
          </>
        )}
      </div>
      <select
        className="pe-input w-full text-xs"
        value={r.type ?? "inne"}
        onChange={(e) => setRoomShapeType(r.id, e.target.value as RoomType)}
        title="Typ pomieszczenia"
        aria-label="Typ pomieszczenia"
      >
        {(Object.entries(ROOM_TYPE_LABELS) as [RoomType, string][]).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      {podpisy && (
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          <Button variant="secondary" size="sm" onClick={() => onCreateWall(r.id)} className={przycisk} title={tytulSciany}>
            <PenLine size={13} /> Utwórz ścianę z obrysu
          </Button>
          <Button variant="secondary" size="sm" onClick={() => recolorRoomShape(r.id)} className={przycisk}>
            <Palette size={13} /> Zmień kolor
          </Button>
          <Button variant="secondary" size="sm"
            onClick={() => {
              deleteRoomShape(r.id);
              onUsuniete?.();
            }}
            className={`${przycisk} text-red-600`}
          >
            <Trash2 size={13} /> Usuń pomieszczenie
          </Button>
          {/* Przesuwanie całego pokoju (F5) nie ma przycisku — chwyta się wnętrze — więc
              bez tej linijki nikt by o nim nie wiedział. Na dotyku przeciąganie wnętrza
              należy do przesuwania widoku, stąd ukryte. */}
          <p className="w-full text-xs leading-snug text-slate-500 [@media(pointer:coarse)]:hidden">
            Przeciągnij wnętrze pokoju albo użyj strzałek, żeby przesunąć go razem z osprzętem.
          </p>
        </div>
      )}
    </div>
  );
}
