import { useEffect, useRef, useState } from "react";
import { Info } from "lucide-react";

interface FieldOption {
  value: string;
  label: string;
}

interface FieldProps {
  label: string;
  value: string | number;
  onChange: (value: string | number) => void;
  unit?: string;
  type?: "number" | "text";
  step?: string;
  options?: FieldOption[];
  /** Podpowiedź pod przyciskiem „i" obok etykiety — co wpisać i skąd to wziąć
   *  (tabliczka znamionowa, pomiar, karta katalogowa…). Zarezerwowane dla pól, których
   *  sama etykieta i jednostka nie tłumaczą (skróty typu „uk", „Zs", „β") — nie dla
   *  rzeczy oczywistych, żeby nie zamienić formularza w ścianę dymków. */
  hint?: string;
}

/** Ikona „i" pokazująca podpowiedź PO KLIKNIĘCIU, nie po najechaniu — na dotyku (tablet,
 *  telefon) hover w ogóle nie istnieje, więc dymek na `title` byłby tam niedostępny.
 *  Zamyka się kolejnym kliknięciem ikony, kliknięciem gdziekolwiek indziej, albo Escape. */
export function HintButton({ hint }: { hint: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={(e) => {
          // Wewnątrz `<label>` klik normalnie przekazywałby fokus na powiązane pole —
          // tu chodzi wyłącznie o dymek, więc nie pozwalamy zdarzeniu polecieć dalej.
          e.preventDefault();
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        aria-expanded={open}
        aria-label={open ? "Ukryj podpowiedź" : "Pokaż podpowiedź"}
        className="cursor-pointer text-slate-400 hover:text-blueprint"
      >
        <Info size={12} />
      </button>
      {open && (
        <div
          role="tooltip"
          className="pe-card absolute left-1/2 top-full z-20 mt-1.5 w-64 -translate-x-1/2 p-2.5 text-[11.5px] font-normal leading-relaxed text-ink shadow-lg"
        >
          {hint}
        </div>
      )}
    </span>
  );
}

export function Field({ label, value, onChange, unit, type = "number", step, options, hint }: FieldProps) {
  return (
    <label className="mb-3 block">
      <div className="mb-1 flex items-center gap-1 text-xs text-slate-500">
        {label}
        {hint && <HintButton hint={hint} />}
      </div>
      <div className="flex items-center gap-2">
        {options ? (
          <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="pe-input w-full text-sm"
          >
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ) : (
          <input
            type={type}
            step={step || "any"}
            value={value}
            onChange={(e) => onChange(type === "number" ? Number(e.target.value) : e.target.value)}
            className="pe-input pe-mono w-full text-sm"
          />
        )}
        {unit && <span className="w-14 text-xs text-slate-500">{unit}</span>}
      </div>
    </label>
  );
}
