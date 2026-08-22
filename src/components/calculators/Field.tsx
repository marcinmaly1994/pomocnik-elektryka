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
}

export function Field({ label, value, onChange, unit, type = "number", step, options }: FieldProps) {
  return (
    <label className="mb-3 block">
      <div className="mb-1 text-xs text-slate-500">{label}</div>
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
