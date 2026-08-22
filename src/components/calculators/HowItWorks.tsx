import { useState } from "react";
import { ChevronDown, ChevronRight, Info } from "lucide-react";

interface Formula {
  label: string;
  eq: string;
  where?: string;
}

interface HowItWorksProps {
  formulas: Formula[];
  notes?: string[];
}

/** Rozwijana sekcja z wyjaśnieniem działania kalkulatora — wzory, założenia, ograniczenia. */
export function HowItWorks({ formulas, notes }: HowItWorksProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-4 border-t pt-4" style={{ borderColor: "#EEF1F4" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between text-left text-xs font-semibold text-blueprint"
      >
        <span className="flex items-center gap-1.5">
          <Info size={14} /> Jak działa kalkulator
        </span>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {formulas.map((f, i) => (
            <div key={i}>
              <div className="mb-1 text-[11px] text-slate-500">{f.label}</div>
              <div className="pe-mono rounded-md px-3 py-2 text-sm" style={{ background: "#EEF1F4", color: "#16202B" }}>
                {f.eq}
              </div>
              {f.where && <div className="mt-1 text-[11px] leading-relaxed text-slate-500">{f.where}</div>}
            </div>
          ))}
          {notes && notes.length > 0 && (
            <ul className="space-y-1.5 pt-1 text-[11px] text-slate-600">
              {notes.map((n, i) => (
                <li key={i} className="flex gap-1.5">
                  <span className="text-copper">•</span>
                  <span className="leading-relaxed">{n}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
