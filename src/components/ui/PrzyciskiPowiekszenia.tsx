import { Minus, Plus, Scan } from "lucide-react";
import type { usePowiekszanieRysunku } from "@/hooks/usePowiekszanieRysunku";

/**
 * Przyciski powiększenia rysunku: −, procent (klik = 100%), +, „Dopasuj".
 *
 * Wspólne dla schematu jednokreskowego i frontu rozdzielnicy — ten sam wygląd co grupa
 * powiększenia w pasku edytora rzutu, żeby na każdym rysunku powiększało się tak samo.
 *
 * `nazwa` wchodzi do etykiet dostępnościowych w dwóch przypadkach, bo polski ich
 * wymaga: „Powiększenie schematu", ale „Powiększ schemat".
 */
export function PrzyciskiPowiekszenia({
  p,
  nazwa,
}: {
  p: ReturnType<typeof usePowiekszanieRysunku>;
  nazwa: { dopelniacz: string; biernik: string };
}) {
  const przycisk = "rounded px-1.5 py-1 text-slate-500 hover:text-ink disabled:opacity-30";
  const procent = Math.round(p.zoom * 100);
  return (
    <div className="flex justify-end">
      <div className="flex items-center gap-0.5 rounded-lg border border-border bg-white p-0.5">
        <button
          onClick={p.pomniejsz}
          disabled={p.zoom <= p.min + 1e-6}
          aria-label={`Pomniejsz ${nazwa.biernik}`}
          title={`Pomniejsz ${nazwa.biernik}`}
          className={przycisk}
        >
          <Minus size={14} />
        </button>
        <button
          onClick={p.naturalny}
          title="Przywróć naturalny rozmiar"
          aria-label={`Powiększenie ${nazwa.dopelniacz} ${procent} procent — kliknij, aby przywrócić 100%`}
          className="pe-mono w-11 text-center text-[11px] tabular-nums text-slate-600"
        >
          {procent}%
        </button>
        <button
          onClick={p.powieksz}
          disabled={p.zoom >= p.max - 1e-6}
          aria-label={`Powiększ ${nazwa.biernik}`}
          title={`Powiększ ${nazwa.biernik}`}
          className={przycisk}
        >
          <Plus size={14} />
        </button>
        <span className="mx-0.5 h-4 w-px bg-border" aria-hidden="true" />
        <button
          onClick={p.dopasuj}
          aria-label={`Dopasuj ${nazwa.biernik} do szerokości`}
          title={`Dopasuj ${nazwa.biernik} do szerokości`}
          className={przycisk}
        >
          <Scan size={13} />
        </button>
      </div>
    </div>
  );
}
