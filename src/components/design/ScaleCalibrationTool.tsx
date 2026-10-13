import { useState } from "react";
import { formatLiczba } from "@/lib/liczby";
import { Ruler } from "lucide-react";
import type { Point } from "@/types";
import {
  PAPER_WIDTHS_MM,
  SCALE_DENOMINATORS,
  mpuFromPaperScale,
  planWidthMeters,
  validateCalibrationLength,
} from "@/lib/onboarding";

/**
 * Ustawianie skali planu — dwie drogi do tej samej liczby.
 *
 * 1. Pomiar: użytkownik wskazuje na rzucie dwa punkty o znanej odległości i podaje
 *    ją w metrach. Działa zawsze, także na odręcznym szkicu.
 * 2. Rzut w znanej skali: format arkusza + skala (1:50 / 1:100 / 1:200). Sama skala
 *    NIE wystarcza — mówi, ile razy rysunek jest mniejszy od rzeczywistości, ale nie
 *    mówi, jak duży jest rysunek. Dopiero format arkusza daje wymiar fizyczny.
 *    Zakładamy przy tym, że rzut wypełnia szerokość arkusza, więc wynik pokazujemy
 *    do potwierdzenia („rzut ma wtedy ok. X m szerokości") zamiast przyjmować po cichu.
 *
 * Walidacja mieszka w `lib/onboarding.ts`, żeby dała się przetestować bez renderowania.
 */

export interface ScaleCalibrationToolProps {
  calibPoints: Point[];
  metersPerUnit: number | null;
  planWidthUnits: number;
  onApply: (metersPerUnit: number) => void;
  onCancel: () => void;
  onClear: () => void;
}

export function ScaleCalibrationTool({
  calibPoints,
  metersPerUnit,
  planWidthUnits,
  onApply,
  onCancel,
  onClear,
}: ScaleCalibrationToolProps) {
  const [length, setLength] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"pomiar" | "skala">("pomiar");
  const [paper, setPaper] = useState<keyof typeof PAPER_WIDTHS_MM>("A4");
  const [denominator, setDenominator] = useState<number>(SCALE_DENOMINATORS[0]);

  function applyMeasured() {
    const check = validateCalibrationLength(length);
    if (!check.ok) {
      setError(check.error);
      return;
    }
    const units = Math.hypot(calibPoints[1].x - calibPoints[0].x, calibPoints[1].y - calibPoints[0].y);
    if (!(units > 0)) {
      setError("Oba punkty wypadły w tym samym miejscu — zaznacz je dalej od siebie.");
      return;
    }
    setError(null);
    setLength("");
    onApply(check.meters / units);
  }

  const presetMpu = mpuFromPaperScale(PAPER_WIDTHS_MM[paper], denominator, planWidthUnits);
  const presetWidth = planWidthMeters(presetMpu, planWidthUnits);

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <div className="flex items-center gap-1 rounded-lg border border-border bg-white p-0.5">
        {(["pomiar", "skala"] as const).map((m) => (
          <button
            key={m}
            onClick={() => {
              setMode(m);
              setError(null);
            }}
            className="rounded-md px-2 py-1 text-[11px]"
            style={mode === m ? { background: "#C1793F14", color: "#8A5526", fontWeight: 600 } : { color: "#4F5D73" }}
          >
            {m === "pomiar" ? "Zmierzę na rzucie" : "Rzut jest w skali"}
          </button>
        ))}
      </div>

      {mode === "pomiar" ? (
        calibPoints.length < 2 ? (
          <span className="flex items-center gap-1.5 text-slate-500">
            <Ruler size={13} className="text-copper" />
            Kliknij dwa punkty o znanej odległości — zaznacz punkt {calibPoints.length + 1} z 2.
          </span>
        ) : (
          <>
            <label className="flex items-center gap-1.5 text-slate-500">
              Podaj długość (m):
              <input
                type="text"
                inputMode="decimal"
                autoFocus
                value={length}
                placeholder="np. 4"
                aria-label="Długość odcinka w metrach"
                aria-invalid={!!error}
                onChange={(e) => {
                  setLength(e.target.value);
                  if (error) setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") applyMeasured();
                }}
                className="pe-input w-20 py-1 text-xs"
              />
            </label>
            <button onClick={applyMeasured} className="pe-btn-copper px-2 py-1 text-xs">
              Zatwierdź skalę
            </button>
          </>
        )
      ) : (
        <>
          <label className="flex items-center gap-1.5 text-slate-500">
            Arkusz:
            <select
              value={paper}
              onChange={(e) => setPaper(e.target.value as keyof typeof PAPER_WIDTHS_MM)}
              aria-label="Format arkusza"
              className="pe-input py-1 text-xs"
            >
              {Object.keys(PAPER_WIDTHS_MM).map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-slate-500">
            Skala:
            <select
              value={denominator}
              onChange={(e) => setDenominator(Number(e.target.value))}
              aria-label="Skala rzutu"
              className="pe-input py-1 text-xs"
            >
              {SCALE_DENOMINATORS.map((d) => (
                <option key={d} value={d}>
                  1:{d}
                </option>
              ))}
            </select>
          </label>
          {presetWidth !== null && (
            <span className="text-slate-400">rzut ma wtedy ok. {formatLiczba(presetWidth, 1)} m szerokości</span>
          )}
          <button
            onClick={() => presetMpu && onApply(presetMpu)}
            disabled={!presetMpu}
            className="pe-btn-copper px-2 py-1 text-xs"
          >
            Zatwierdź skalę
          </button>
        </>
      )}

      <button onClick={onCancel} disabled={mode === "pomiar" && !calibPoints.length} className="pe-btn-ghost px-2 py-1">
        Anuluj
      </button>
      {metersPerUnit && (
        <button onClick={onClear} className="pe-btn-ghost px-2 py-1 text-red-600">
          Usuń kalibrację
        </button>
      )}

      {error && (
        <span role="alert" className="w-full font-medium" style={{ color: "#A2352C" }}>
          {error}
        </span>
      )}
    </div>
  );
}
