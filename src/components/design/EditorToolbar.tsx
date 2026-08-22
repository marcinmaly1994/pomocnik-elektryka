import { Eye, EyeOff, Image as ImageIcon, Maximize2, Minus, Plus, Redo2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MAX_ZOOM, MIN_ZOOM } from "./DesignCanvas";

/**
 * Górny pasek edytora: podkład, przyciąganie do siatki, rozmiar symboli, strefy,
 * cofnij/ponów i powiększenie — wszystko, co dotyczy WIDOKU, w jednym rzędzie.
 *
 * Narzędzia rysowania mieszkają osobno, w pionowym `ToolRail`: to dwie różne rzeczy
 * (czym rysuję vs. jak patrzę), a wcześniej stały w jednym pasku i mieszały się
 * ze sobą.
 */

export interface EditorToolbarProps {
  bgImageUrl: string | null;
  bgName: string | null;
  onPickBg: () => void;
  onClearBg: () => void;
  snapOn: boolean;
  onSnapChange: (v: boolean) => void;
  elementScale: number;
  onElementScaleChange: (v: number) => void;
  defaultElementScale: number;
  showZones: boolean;
  onToggleZones: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  zoom: number;
  onZoomChange: (z: number) => void;
  /** Dopasowanie rzutu do dostępnego miejsca — wraca też do trybu automatycznego. */
  onDopasuj: () => void;
}

const ZOOM_STEP = 0.1;

export function EditorToolbar({
  bgImageUrl,
  bgName,
  onPickBg,
  onClearBg,
  snapOn,
  onSnapChange,
  elementScale,
  onElementScaleChange,
  defaultElementScale,
  showZones,
  onToggleZones,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  zoom,
  onZoomChange,
  onDopasuj,
}: EditorToolbarProps) {
  const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(z * 100) / 100));

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-card border border-border bg-white px-3 py-2">
      {/* Podkład: nazwa pliku zamiast samego „wgrany" — przy kilku kondygnacjach
          to jedyny sposób, żeby sprawdzić, czy pod spodem leży właściwy rzut. */}
      <span className="flex items-center gap-2 text-xs">
        <ImageIcon size={14} className="text-blueprint" />
        {bgImageUrl ? (
          <>
            <span className="max-w-[180px] truncate text-slate-600" title={bgName ?? undefined}>
              Podkład: {bgName ?? "wgrany"}
            </span>
            <button onClick={onPickBg} className="text-blueprint hover:underline">
              Zmień
            </button>
            <button onClick={onClearBg} className="text-red-500 hover:underline">
              Usuń
            </button>
          </>
        ) : (
          <button onClick={onPickBg} className="text-blueprint hover:underline">
            Wgraj podkład
          </button>
        )}
      </span>

      <span className="hidden h-5 w-px bg-border sm:block" aria-hidden="true" />

      <label className="flex items-center gap-1.5 text-xs text-slate-500">
        <input type="checkbox" checked={snapOn} onChange={(e) => onSnapChange(e.target.checked)} className="accent-copper" />
        Przyciągaj do siatki
      </label>

      {/* Rozmiar SYMBOLI, nie powiększenie planu — to dwie różne rzeczy i dlatego
          stoją obok siebie z osobnymi etykietami (patrz komentarz przy zoomie). */}
      <label className="flex items-center gap-2 text-xs text-slate-500" title="Rozmiar symboli na planie">
        <span className="whitespace-nowrap">Rozmiar elementów</span>
        <input
          type="range"
          min={0.6}
          max={2}
          step={0.1}
          value={elementScale}
          onChange={(e) => onElementScaleChange(Number(e.target.value))}
          aria-label="Rozmiar elementów"
          className="w-20 accent-copper"
        />
        <span className="pe-mono w-9 text-right text-[11px] tabular-nums">{elementScale.toFixed(1)}×</span>
        {elementScale !== defaultElementScale && (
          <button onClick={() => onElementScaleChange(defaultElementScale)} className="text-[11px] text-blueprint hover:underline">
            reset
          </button>
        )}
      </label>

      <Button variant="ghost" size="icon" onClick={onToggleZones} title="Pokaż strefy ochronne w łazience">
        {showZones ? <Eye size={15} /> : <EyeOff size={15} />}
      </Button>

      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" onClick={onUndo} disabled={!canUndo} title="Cofnij">
          <Undo2 size={15} />
        </Button>
        <Button variant="ghost" size="icon" onClick={onRedo} disabled={!canRedo} title="Ponów">
          <Redo2 size={15} />
        </Button>
      </div>

      {/* Powiększenie WIDOKU. Wcześniej dostępne tylko przez Ctrl+scroll, czyli
          praktycznie niewykrywalne — teraz ma jawną kontrolkę z wartością. */}
      <div className="ml-auto flex items-center gap-0.5 rounded-lg border border-border p-0.5">
        <button
          onClick={() => onZoomChange(clampZoom(zoom - ZOOM_STEP))}
          disabled={zoom <= MIN_ZOOM}
          aria-label="Oddal widok"
          title="Oddal widok"
          className="rounded px-1.5 py-1 text-slate-500 hover:text-ink disabled:opacity-30"
        >
          <Minus size={14} />
        </button>
        <button
          onClick={() => onZoomChange(1)}
          title="Przywróć powiększenie 100%"
          aria-label={`Powiększenie ${Math.round(zoom * 100)} procent — kliknij, aby przywrócić 100%`}
          className="pe-mono w-12 text-center text-[11px] tabular-nums text-slate-600"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          onClick={() => onZoomChange(clampZoom(zoom + ZOOM_STEP))}
          disabled={zoom >= MAX_ZOOM}
          aria-label="Przybliż widok"
          title="Przybliż widok"
          className="rounded px-1.5 py-1 text-slate-500 hover:text-ink disabled:opacity-30"
        >
          <Plus size={14} />
        </button>
        <span className="mx-0.5 h-4 w-px bg-border" aria-hidden="true" />
        <button
          onClick={onDopasuj}
          aria-label="Dopasuj widok do planu"
          title="Dopasuj widok do planu"
          className="rounded px-1.5 py-1 text-slate-500 hover:text-ink"
        >
          <Maximize2 size={13} />
        </button>
      </div>
    </div>
  );
}
